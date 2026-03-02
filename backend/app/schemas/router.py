from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from app.models.router import RouterStatus

class RouterBase(BaseModel):
    name: str
    hostname: str
    site: Optional[str] = None
    api_key: str
    is_enabled: Optional[bool] = True

class RouterCreate(RouterBase):
    pass

class RouterUpdate(RouterBase):
    name: Optional[str] = None
    hostname: Optional[str] = None
    site: Optional[str] = None
    api_key: Optional[str] = None
    is_enabled: Optional[bool] = None

class RouterInDBBase(RouterBase):
    id: int
    status: RouterStatus
    version: Optional[str] = None
    last_seen: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {
        "from_attributes": True
    }

class Router(BaseModel):
    id: int
    name: str
    hostname: str
    site: Optional[str] = None
    status: RouterStatus
    is_enabled: bool
    version: Optional[str] = None
    last_seen: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {
        "from_attributes": True
    }
