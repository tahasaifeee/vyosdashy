import requests
import json
from typing import Any, Dict, List, Optional
import urllib3

# Disable insecure request warnings for self-signed certs common on routers
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class VyOSClient:
    def __init__(self, hostname: str, api_key: str, port: int = 443, protocol: str = "https"):
        self.base_url = f"{protocol}://{hostname}:{port}"
        self.api_key = api_key
        self.verify = False  # Usually VyOS has self-signed certs

    def _post(self, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint}"
        payload = {
            "key": self.api_key,
            "data": json.dumps(data)
        }
        try:
            response = requests.post(url, data=payload, verify=self.verify, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"success": False, "error": str(e)}

    def get_config(self, path: List[str] = []) -> Dict[str, Any]:
        """Retrieve running configuration"""
        data = {"op": "showConfig", "path": path}
        return self._post("retrieve", data)

    def set_config(self, path: List[str]) -> Dict[str, Any]:
        """Set configuration value"""
        data = {"op": "set", "path": path}
        return self._post("configure", data)

    def delete_config(self, path: List[str]) -> Dict[str, Any]:
        """Delete configuration value"""
        data = {"op": "delete", "path": path}
        return self._post("configure", data)

    def commit(self) -> Dict[str, Any]:
        """Commit changes"""
        return self._post("commit", {})

    def save(self) -> Dict[str, Any]:
        """Save configuration to boot config"""
        return self._post("save", {})

    def show_op(self, path: List[str]) -> Dict[str, Any]:
        """Run operational command (e.g. ['interfaces'])"""
        data = {"op": "show", "path": path}
        return self._post("retrieve", data)

    def test_connection(self) -> bool:
        """Test if API is reachable and key is valid"""
        res = self.get_config(["system", "host-name"])
        return res.get("success", False)

    def get_interface_stats(self) -> Dict[str, Any]:
        """Fetch all interface statistics"""
        return self.show_op(["interfaces"])

    def get_bgp_summary(self) -> Dict[str, Any]:
        """Fetch BGP summary (neighbors and status)"""
        # VyOS path for BGP summary in operational mode
        return self.show_op(["ip", "bgp", "summary"])

    def get_system_uptime(self) -> Dict[str, Any]:
        """Fetch system uptime"""
        return self.show_op(["system", "uptime"])

    def get_resource_usage(self) -> Dict[str, Any]:
        """Fetch CPU/Memory via system resources"""
        # This might vary based on VyOS version (1.4 vs 1.5)
        # We can also fallback to shell if needed via 'op': 'run'
        return self.show_op(["system", "image"]) # Example, replace with real metrics path
