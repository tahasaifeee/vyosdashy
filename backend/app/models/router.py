from sqlalchemy import Boolean, Column, Integer, String, Enum, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base

class RouterStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    UNKNOWN = "unknown"

class Router(Base):
    __tablename__ = "routers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    hostname = Column(String, nullable=False)  # IP or FQDN
    api_key = Column(String, nullable=False)  # Encrypted ideally, but plain for now
    site = Column(String, index=True) # e.g., UAE-DC1
    version = Column(String) # Detected version
    is_enabled = Column(Boolean, default=True)
    status = Column(Enum(RouterStatus), default=RouterStatus.UNKNOWN)
    last_seen = Column(DateTime(timezone=True), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # We can add relationships like 'metrics' later
