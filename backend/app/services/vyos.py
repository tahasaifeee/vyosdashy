import httpx
import json
from typing import Any, Dict, List, Optional


class VyOSClient:
    def __init__(self, hostname: str, api_key: str, port: int = 443, protocol: str = "https"):
        # Sanitize hostname (remove http/https and trailing paths)
        clean_hostname = hostname.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
        self.base_url = f"{protocol}://{clean_hostname}:{port}"
        self.api_key = api_key
        self.verify = False  # VyOS typically uses self-signed certs

    # ── Low-level request helpers ──────────────────────────────────────────────

    async def _post_form(self, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """POST to a REST endpoint using form-data (key + JSON data field).
        This is the standard VyOS HTTP API transport for all REST endpoints."""
        url = f"{self.base_url}/{endpoint}"
        payload = {
            "key": self.api_key,
            "data": json.dumps(data),
        }
        try:
            async with httpx.AsyncClient(verify=self.verify, timeout=10.0) as client:
                response = await client.post(url, data=payload)
                response.raise_for_status()
                return response.json()
        except httpx.ConnectError:
            return {"success": False, "error": f"Connection refused to {self.base_url}"}
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 403:
                return {"success": False, "error": "Invalid API Key (403 Forbidden)"}
            return {"success": False, "error": f"HTTP Error {e.response.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _graphql(self, query: str) -> Dict[str, Any]:
        """POST a GraphQL query to /graphql (VyOS 1.4+).
        Key is sent in the JSON body alongside the query."""
        try:
            async with httpx.AsyncClient(verify=self.verify, timeout=10.0) as client:
                response = await client.post(
                    f"{self.base_url}/graphql",
                    json={"query": query, "key": self.api_key},
                )
                if response.status_code == 404:
                    return {"errors": [{"message": "GraphQL endpoint not available on this router"}]}
                response.raise_for_status()
                return response.json()
        except httpx.ConnectError:
            return {"errors": [{"message": "Connection refused"}]}
        except Exception as e:
            return {"errors": [{"message": str(e)}]}

    # ── Config retrieval (/retrieve endpoint) ─────────────────────────────────
    # These always return structured JSON. The only way to get JSON data from VyOS.

    async def get_config(self, path: List[str] = []) -> Dict[str, Any]:
        """Fetch running configuration at the given path (showConfig).
        Returns structured JSON — the primary way to read VyOS data via REST."""
        return await self._post_form("retrieve", {"op": "showConfig", "path": path})

    async def get_info(self) -> Dict[str, Any]:
        """GET /info — public endpoint (no auth). Returns version, hostname, banner."""
        try:
            async with httpx.AsyncClient(verify=self.verify, timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/info")
                response.raise_for_status()
                result = response.json()
                # /info wraps payload under "data" key
                return {"success": True, "data": result.get("data", result)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def test_connection(self) -> Dict[str, Any]:
        """Test API connectivity and key validity."""
        res = await self.get_config(["system", "host-name"])
        if res.get("success") is True:
            return {"success": True}
        error_msg = res.get("error") or res.get("data") or "Unknown API error"
        return {"success": False, "error": str(error_msg)}

    # ── Operational show commands (/show endpoint) ─────────────────────────────
    # NOTE: /show returns plain text (human-readable CLI output), NOT JSON.
    # It is only useful for display purposes, not for parsing structured data.

    async def show_text(self, path: List[str]) -> str:
        """Run a show command and return its plain-text output.
        Use for display only — the output is not machine-parseable JSON."""
        result = await self._post_form("show", {"op": "show", "path": path})
        if result.get("success"):
            return result.get("data", "")
        return f"Error: {result.get('error', 'unknown')}"

    # ── Interface data ─────────────────────────────────────────────────────────

    async def get_interface_config(self) -> Dict[str, Any]:
        """Fetch interface configuration (names, IP addresses, hw-id, etc.).
        This is the only structured interface data available via REST."""
        return await self.get_config(["interfaces"])

    async def get_interface_counters(self) -> Optional[Dict[str, Any]]:
        """Fetch interface counters (rx/tx bytes) via GraphQL (VyOS 1.4+).
        Returns None if GraphQL is unavailable or query fails."""
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
        if "errors" in result:
            return None
        return result.get("data", {}).get("ShowInterfaceCounters", {}).get("result")

    # ── BGP data ───────────────────────────────────────────────────────────────

    async def get_bgp_config(self) -> Dict[str, Any]:
        """Fetch BGP configuration (configured neighbors, ASN).
        Returns config state only — no operational state (Established/Down) via REST."""
        return await self.get_config(["protocols", "bgp"])

    # ── System resources ───────────────────────────────────────────────────────

    async def get_system_info(self) -> Optional[Dict[str, Any]]:
        """Fetch system info (CPU, memory, uptime) via GraphQL (VyOS 1.4+).
        Returns None if GraphQL is unavailable."""
        result = await self._graphql("""
        {
          ShowSystemInformation {
            result {
              host_name
              uptime
              cpu_load_average {
                one_minute
                five_minute
                fifteen_minute
              }
              memory {
                total
                used
                free
                buffers
                cached
              }
            }
          }
        }
        """)
        if "errors" in result:
            return None
        return result.get("data", {}).get("ShowSystemInformation", {}).get("result")

    # ── Config modification (/configure endpoint) ──────────────────────────────

    async def set_config(self, path: List[str]) -> Dict[str, Any]:
        return await self._post_form("configure", {"op": "set", "path": path})

    async def delete_config(self, path: List[str]) -> Dict[str, Any]:
        return await self._post_form("configure", {"op": "delete", "path": path})

    async def save(self) -> Dict[str, Any]:
        return await self._post_form("config-file", {"op": "save"})
