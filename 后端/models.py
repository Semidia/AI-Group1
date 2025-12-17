from pydantic import BaseModel
from typing import List, Optional, Dict

class GameAttributes(BaseModel):
    cash: int
    morale: int
    reputation: int
    innovation: int

class GameHistoryEntry(BaseModel):
    id: int
    type: str # 'system' or 'player'
    text: str

class GameState(BaseModel):
    companyName: str
    turn: int
    attributes: GameAttributes
    history: List[GameHistoryEntry]

class GameOption(BaseModel):
    id: str
    label: str
    description: Optional[str] = None
    effects: Optional[Dict[str, int]] = None
    resultNarrative: Optional[str] = None

class PlayerAction(BaseModel):
    # Used when receiving an action from frontend
    label: str
    customText: Optional[str] = None
    effects: Optional[Dict[str, int]] = None
    resultNarrative: Optional[str] = None

class InitSettings(BaseModel):
    settings: str

class APIResponse(BaseModel):
    state: GameState
    options: List[GameOption]
