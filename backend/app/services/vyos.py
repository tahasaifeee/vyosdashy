import httpx
import json
from typing import Any, Dict, List, Optional

class VyOSClient:
    def __init__(self, hostname: str, api_key: str, port: int = 443, protocol: str = "https"):
        # Sanitize hostname (remove http/https and trailing paths)
        clean_hostname = hostname.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
        self.base_url = f"{protocol}://{clean_hostname}:{port}"
        self.api_key = api_key
        self.verify = False  # Usually VyOS has self-signed certs

    async def _post(self, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        payload = {
            "key": self.api_key,
            "data": json.dumps(data)
        }
        try:
            async with httpx.AsyncClient(verify=self.verify, timeout=10.0) as client:
                response = await client.post(url, data=payload)
                response.raise_for_status()
                return response.json()
        except httpx.ConnectError:
            return {"success": False, "error": f"Connection refused to {self.base_url}. Is the API enabled on the router?"}
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 403:
                return {"success": False, "error": "Invalid API Key (403 Forbidden)"}
            return {"success": False, "error": f"HTTP Error {e.response.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_config(self, path: List[str] = []) -> Dict[str, Any]:
        """Retrieve running configuration"""
        data = {"op": "showConfig", "path": path}
        return await self._post("retrieve", data)

    async def set_config(self, path: List[str]) -> Dict[str, Any]:
        """Set configuration value"""
        data = {"op": "set", "path": path}
        return await self._post("configure", data)

    async def delete_config(self, path: List[str]) -> Dict[str, Any]:
        """Delete configuration value"""
        data = {"op": "delete", "path": path}
        return await self._post("configure", data)

    async def commit(self) -> Dict[str, Any]:
        """Commit changes"""
        return await self._post("commit", {})

    async def save(self) -> Dict[str, Any]:
        """Save configuration to boot config"""
        return await self._post("save", {})

    async def show_op(self, path: List[str]) -> Dict[str, Any]:
        """Run operational command via /show endpoint (VyOS 1.4+).
        Falls back gracefully — caller should check result.get('success')."""
        data = {"op": "show", "path": path}
        return await self._post("show", data)

    async def test_connection(self) -> Dict[str, Any]:
        """Test if API is reachable and key is valid. Returns dict with success and optional error."""
        res = await self.get_config(["system", "host-name"])
        # VyOS API returns 'success: true' in the JSON body if it worked
        if res.get("success") is True:
            return {"success": True}
        
        # If the API returned a failure message (like invalid key)
        error_msg = res.get("error") or res.get("data") or "Unknown API error"
        return {"success": False, "error": str(error_msg)}

    async def get_interface_stats(self) -> Dict[str, Any]:
        """Fetch interface data.
        Tries operational /show endpoint first (VyOS 1.4+),
        falls back to config showConfig (works on all versions)."""
        result = await self.show_op(["interfaces"])
        if result.get("success") and isinstance(result.get("data"), dict):
            return result
        # Fallback: config data (no runtime stats, but shows addresses/names)
        return await self.get_config(["interfaces"])

    async def get_bgp_summary(self) -> Dict[str, Any]:
        """Fetch BGP summary (neighbors and status)"""
        return await self.show_op(["ip", "bgp", "summary"])

    async def get_system_uptime(self) -> Dict[str, Any]:
        """Fetch system uptime"""
        return await self.show_op(["system", "uptime"])

    async def get_resource_usage(self) -> Dict[str, Any]:
        """Fetch CPU/Memory via system resources"""
        return await self.show_op(["system", "resources"])
