from sqlalchemy import Column, Integer, String, JSON, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class DBGameSession(Base):
    __tablename__ = "game_sessions"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, default="Nexus Corp")
    turn = Column(Integer, default=1)
    
    # Storing attributes as separate columns for easier querying/updating
    cash = Column(Integer, default=1000)
    morale = Column(Integer, default=50)
    reputation = Column(Integer, default=50)
    innovation = Column(Integer, default=10)
    
    # Store current options as JSON to persist state between turns
    current_options = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    history = relationship("DBGameHistory", back_populates="session", cascade="all, delete-orphan")

class DBGameHistory(Base):
    __tablename__ = "game_history"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("game_sessions.id"))
    type = Column(String)  # 'system' or 'player'
    text = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)

    session = relationship("DBGameSession", back_populates="history")
