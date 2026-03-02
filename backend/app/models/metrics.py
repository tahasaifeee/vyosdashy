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
    cpu_usage = Column(Float)  # Percentage
    memory_usage = Column(Float) # Percentage
    uptime = Column(Integer) # Seconds
    
    # Interfaces data stored as JSON for flexibility
    # Structure: [{"name": "eth0", "rx_bytes": 123, "tx_bytes": 456, "status": "up"}, ...]
    interfaces = Column(JSON)
    
    # BGP status as JSON
    # Structure: [{"peer": "1.1.1.1", "state": "Established", "uptime": 3600}, ...]
    bgp_neighbors = Column(JSON)

    router = relationship("Router", backref="metrics")
