import httpx
import json
from typing import Any, Dict, List, Optional

class VyOSClient:
    def __init__(self, hostname: str, api_key: str, port: int = 443, protocol: str = "https"):
        self.base_url = f"{protocol}://{hostname}:{port}"
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
        except httpx.HTTPError as e:
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
        """Run operational command (e.g. ['interfaces'])"""
        data = {"op": "show", "path": path}
        return await self._post("retrieve", data)

    async def test_connection(self) -> bool:
        """Test if API is reachable and key is valid"""
        res = await self.get_config(["system", "host-name"])
        return res.get("success", True) if "success" in res else False

    async def get_interface_stats(self) -> Dict[str, Any]:
        """Fetch all interface statistics"""
        return await self.show_op(["interfaces"])

    async def get_bgp_summary(self) -> Dict[str, Any]:
        """Fetch BGP summary (neighbors and status)"""
        return await self.show_op(["ip", "bgp", "summary"])

    async def get_system_uptime(self) -> Dict[str, Any]:
        """Fetch system uptime"""
        return await self.show_op(["system", "uptime"])

    async def get_resource_usage(self) -> Dict[str, Any]:
        """Fetch CPU/Memory via system resources"""
        return await self.show_op(["system", "image"])
