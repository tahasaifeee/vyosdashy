from pydantic import BaseModel, field_validator
from typing import Any

class InfoQueryParams(BaseModel):
    version: str = "true"
    hostname: str = "true"

    class Config:
        extra = "forbid"

    @field_validator("version", "hostname", mode="before")
    @classmethod
    def validate_vyos_bool(cls, v: Any) -> str:
        s = str(v).lower()
        if s in ("1", "true", "yes", "on"):
            return "true"
        if s in ("0", "false", "no", "off"):
            return "false"
        # Exact error message pattern from VyOS docs
        raise ValueError(f"Input should be a valid boolean, unable to interpret input")
