import httpx
import json
import re
import asyncio
import urllib3
from typing import Any, Dict, List, Optional
from pyvyos.device import VyDevice

# Disable SSL warnings for self-signed VyOS certs
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class VyOSClient:
    def __init__(self, hostname: str, api_key: str, port: int = 443, protocol: str = "https"):
        # Sanitize hostname (remove http/https and trailing paths)
        self.hostname = hostname.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
        self.port = port
        self.protocol = protocol
        self.base_url = f"{protocol}://{self.hostname}:{port}"
        self.api_key = api_key
        self.verify = False  # VyOS typically uses self-signed certs
        
        # Initialize pyvyos VyDevice
        self.device = VyDevice(
            hostname=self.hostname,
            apikey=self.api_key,
            port=self.port,
            protocol=self.protocol,
            verify=self.verify
        )

    # ── Low-level request helpers ──────────────────────────────────────────────

    async def _graphql(self, query: str) -> Dict[str, Any]:
        """POST a GraphQL query to /graphql (VyOS 1.4+)."""
        try:
            async with httpx.AsyncClient(verify=self.verify, timeout=10.0) as client:
                response = await client.post(
                    f"{self.base_url}/graphql",
                    json={"query": query, "key": self.api_key},
                )
                if response.status_code == 404:
                    return {"errors": [{"message": "GraphQL 404"}]}
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return {"errors": [{"message": str(e)}]}

    # ── Config Retrieval (REST) ──────────────────────────────────────────────

    async def get_config(self, path: List[str] = []) -> Dict[str, Any]:
        """Retrieve configuration using pyvyos VyDevice."""
        try:
            # retrieve_show_config returns an ApiResponse object
            response = await asyncio.to_thread(self.device.retrieve_show_config, path)
            if response.error:
                return {"success": False, "error": response.error}
            return {"success": True, "data": response.result}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def show_text(self, path: List[str]) -> str:
        """Show operational data using pyvyos VyDevice."""
        try:
            response = await asyncio.to_thread(self.device.show, path)
            if response.error:
                return f"Error: {response.error}"
            return str(response.result)
        except Exception as e:
            return f"Error: {str(e)}"

    # ── Info & Connection ──────────────────────────────────────────────────

    async def get_info(self, version: bool = True, hostname: bool = True) -> Dict[str, Any]:
        """
        Custom endpoint /info is not in pyvyos yet. 
        Maintaining manual httpx implementation.
        """
        params = {
            "version": "1" if version else "0",
            "hostname": "1" if hostname else "0"
        }
        try:
            async with httpx.AsyncClient(verify=self.verify, timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/info", params=params)
                if response.status_code == 200:
                    return response.json()
        except:
            pass
        return {"success": False, "data": None}

    async def get_version_info(self) -> Dict[str, Any]:
        """Robustly fetch version and hostname using multiple fallback methods."""
        info = {"version": "N/A", "hostname": None}
        
        # 1. Try /info endpoint
        try:
            res = await self.get_info()
            if res.get("success") and res.get("data"):
                d = res["data"]
                if d.get("version"): info["version"] = d["version"]
                if d.get("hostname"): info["hostname"] = d["hostname"]
                if info["hostname"] and info["version"] != "N/A":
                    return info
        except: pass
        
        # 2. Try 'show version' text
        try:
            version_text = await self.show_text(["version"])
            if version_text and not version_text.startswith("Error:"):
                ver_match = re.search(r"Version:\s+(.+)", version_text)
                if ver_match:
                    info["version"] = ver_match.group(1).strip()
        except: pass

        # 3. Try 'show host name' text for hostname
        try:
            host_text = await self.show_text(["host", "name"])
            if host_text and not host_text.startswith("Error:"):
                info["hostname"] = host_text.strip()
        except: pass
        
        return info

    async def test_connection(self) -> Dict[str, Any]:
        """Test connection by retrieving hostname."""
        res = await self.get_config(["system", "host-name"])
        if res.get("success") is True:
            return {"success": True}
        return {"success": False, "error": str(res.get("error") or "Unknown API error")}

    # ── High-level Metrics (GraphQL & Fallbacks) ───────────────────────────

    async def get_interface_config(self) -> Dict[str, Any]:
        return await self.get_config(["interfaces"])

    async def get_interface_counters(self) -> Optional[Dict[str, Any]]:
        result = await self._graphql("""
        {
          ShowInterfaceCounters {
            result {
              ifname
              rx_bytes
              tx_bytes
              rx_packets
              tx_packets
            }
          }
        }
        """)
        if "errors" in result: return None
        return result.get("data", {}).get("ShowInterfaceCounters", {}).get("result")

    async def get_bgp_config(self) -> Dict[str, Any]:
        return await self.get_config(["protocols", "bgp"])

    async def get_system_info(self) -> Optional[Dict[str, Any]]:
        result = await self._graphql("""
        {
          ShowSystemInformation {
            result {
              host_name
              uptime
              cpu_load_average { one_minute five_minute fifteen_minute }
              memory { total used free buffers cached }
            }
          }
        }
        """)
        if "errors" in result: return None
        return result.get("data", {}).get("ShowSystemInformation", {}).get("result")

    # ── Legacy CLI Fallbacks (using pyvyos show) ───────────────────────────

    async def get_legacy_system_stats(self) -> str:
        return await self.show_text(["system", "uptime"])

    async def get_legacy_memory_stats(self) -> str:
        return await self.show_text(["system", "memory"])

    async def get_legacy_storage_stats(self) -> str:
        return await self.show_text(["system", "storage"])

    async def get_legacy_interface_stats(self) -> str:
        return await self.show_text(["interfaces"])

    async def get_legacy_interface_counters(self) -> str:
        return await self.show_text(["interfaces", "counters"])

    # ── Advanced Data ─────────────────────────────────────────────────────

    async def get_routing_table(self) -> Optional[List[Dict[str, Any]]]:
        result = await self._graphql("""
        {
          ShowIpRoute {
            result {
              protocol
              prefix
              next_hop { interface next_hop }
              selected
            }
          }
        }
        """)
        if "errors" in result: return None
        return result.get("data", {}).get("ShowIpRoute", {}).get("result")

    async def get_system_logs(self) -> Optional[List[str]]:
        res = await self.show_text(["log"])
        if res.startswith("Error:"): return None
        return res.splitlines()[-50:]

    async def get_active_connections(self) -> Optional[str]:
        res = await self.show_text(["conntrack", "table", "ipv4"])
        if not res or "Entries not found" in res or res.startswith("Error:"):
            res_sys = await self.show_text(["system", "connections"])
            if res_sys and not res_sys.startswith("Error:"): return res_sys
            return await self.show_text(["conntrack", "statistics"])
        return res

    async def ping(self, host: str, count: int = 4) -> str:
        return await self.show_text(["ping", host, "count", str(count)])

    # ── Configuration Management (Write) ─────────────────────────────────

    async def set_config(self, path: List[str]) -> Dict[str, Any]:
        """Write configuration using pyvyos VyDevice."""
        try:
            response = await asyncio.to_thread(self.device.configure_set, path)
            if response.error:
                return {"success": False, "error": response.error}
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def delete_config(self, path: List[str]) -> Dict[str, Any]:
        """Delete configuration using pyvyos VyDevice."""
        try:
            response = await asyncio.to_thread(self.device.configure_delete, path)
            if response.error:
                return {"success": False, "error": response.error}
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def commit(self) -> Dict[str, Any]:
        """VyDevice doesn't have a separate commit; it uses set/delete directly."""
        return {"success": True}

    async def save(self) -> Dict[str, Any]:
        """Save configuration using pyvyos VyDevice."""
        try:
            response = await asyncio.to_thread(self.device.config_file_save)
            if response.error:
                return {"success": False, "error": response.error}
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
