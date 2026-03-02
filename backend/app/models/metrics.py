from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class RouterMetrics(Base):
    __tablename__ = "router_metrics"

    id = Column(Integer, primary_key=True, index=True)
    router_id = Column(Integer, ForeignKey("routers.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # System health
    cpu_usage = Column(Float)  # Percentage (e.g. from 1m load or direct CPU)
    memory_usage = Column(Float) # Percentage
    disk_usage = Column(Float) # Percentage
    uptime = Column(Integer) # Seconds
    load_average = Column(JSON) # {"1m": 0.1, "5m": 0.2, "15m": 0.3}
    active_sessions = Column(Integer, default=0) # SSH/Console sessions
    
    # Interfaces data stored as JSON
    # Structure: { "ethernet": { "eth0": { "rx-bytes": N, "tx-bytes": N, "rx-packets": N, "tx-packets": N, "status": "up", "hw-id": "...", "mtu": "..." } } }
    interfaces = Column(JSON)
    
    # BGP status as JSON
    # Structure: { "neighbor": { "1.1.1.1": { "state": "Established", ... } } }
    bgp_neighbors = Column(JSON)

    router = relationship("Router", backref="metrics_list")
