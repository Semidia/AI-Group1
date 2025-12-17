from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Annotated
import uvicorn
import time
import os
import sys

# Custom Modules
from cloud_connector import CloudBridge
from local_connector import LocalBridge
from llm_engine import LLMEngine

# --- STORAGE SELECTION LOGIC ---
STORAGE_MODE = os.getenv("STORAGE_MODE", "LOCAL") 
if len(sys.argv) > 1 and sys.argv[1] == "--cloud":
    STORAGE_MODE = "CLOUD"

print(f"🚀 [Backend] Launching in {STORAGE_MODE} mode...")

if STORAGE_MODE == "CLOUD":
    db = CloudBridge()
    if not db.client:
        # User requested to be able to test connection without crashing
        print("⚠️ [Cloud] Connection failed. Please check SSH tunnel.")
else:
    db = LocalBridge()

app = FastAPI(
    title=f"Every Wall Is A Door - {STORAGE_MODE} Mode",
    description="Backend connected to Storage and OpenAI",
    version="3.2.0"
)

app.add_middleware(
    CORSMiddleware,
    # Explicitly list ports to allow credentials to work properly
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174", 
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class InitSettings(BaseModel):
    settings: str

class PlayerAction(BaseModel):
    label: str
    customText: Optional[str] = None
    gameId: str = "default_room" 

def get_api_key(authorization: str | None = Header(None)) -> str:
    """Extract API Key from Bearer token"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing API Key in Authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header format. Expected 'Bearer <key>'")
    return authorization.replace("Bearer ", "")

@app.get("/")
def read_root():
    status = "connected"
    if STORAGE_MODE == "CLOUD":
        status = "connected" if db.client else "disconnected"
    
    return {
        "status": "online", 
        "storage_mode": STORAGE_MODE,
        "db_connection": status, 
        "version": "3.2.0"
    }

@app.post("/api/toggle_mode")
def toggle_mode(mode: str):
    global db, STORAGE_MODE
    mode = mode.upper()
    if mode == "CLOUD":
        STORAGE_MODE = "CLOUD"
        db = CloudBridge()
        return {"message": "Switched to CLOUD mode. Check console for connection status."}
    else:
        STORAGE_MODE = "LOCAL"
        db = LocalBridge()
        return {"message": "Switched to LOCAL mode."}

@app.post("/api/init")
def init_game(payload: InitSettings, authorization: Annotated[str | None, Header()] = None):
    # Get Key from Header
    api_key = get_api_key(authorization)
    
    print(f"[{STORAGE_MODE}] Initializing game...")
    initial_data = LLMEngine.init_game(payload.settings, api_key)
    
    new_state = {
        "game_id": "default_room",
        "round_id": 1,
        "company_name": "Nexus Corp",
        "turn": 1,
        "attributes": initial_data.get("initial_attributes", {}),
        "history": [
            {
                "id": int(time.time()), 
                "type": "system", 
                "text": initial_data.get("narrative", "Welcome.")
            }
        ],
        "current_options": initial_data.get("first_options", []),
        "passive_rules": initial_data.get("passive_rules", {}),
        "formulas": initial_data.get("formulas", "")
    }
    
    db.push_new_state(new_state)

    return {
        "state": {
            "companyName": new_state["company_name"],
            "turn": new_state["turn"],
            "attributes": new_state["attributes"],
            "history": new_state["history"]
        },
        "options": new_state["current_options"]
    }

@app.post("/api/action")
def process_action(action: PlayerAction, authorization: Annotated[str | None, Header()] = None):
    # Get Key from Header
    api_key = get_api_key(authorization)
    game_id = action.gameId
    
    # 1. Fetch State
    last_state_doc = db.pull_latest_state(game_id)
    
    if not last_state_doc:
        raise HTTPException(status_code=404, detail="Game session not found.")
    
    current_state = {
        "attributes": last_state_doc.get("attributes"),
        "history": last_state_doc.get("history", []),
        "turn": last_state_doc.get("turn", 1),
        "formulas": last_state_doc.get("formulas", "")
    }
    
    # 2. Call LLM
    user_input = action.customText if action.customText else action.label
    print(f"[{STORAGE_MODE}] Action: {user_input}")
    
    llm_result = LLMEngine.process_turn(current_state, user_input, api_key)
    
    # 3. Update Logic
    new_attributes = current_state["attributes"].copy()
    changes = llm_result.get("attribute_changes", {})
    
    for key, val in changes.items():
        if key in new_attributes:
            new_attributes[key] += val
            new_attributes[key] = max(0, new_attributes[key])
    
    new_history = current_state["history"].copy()
    new_history.append({
        "id": int(time.time()),
        "type": "player",
        "text": f"决策: {user_input}"
    })
    
    sys_text = llm_result.get("narrative", "")
    if "logic_chain" in llm_result:
         sys_text += f"\n\n[逻辑链] {llm_result['logic_chain']}"
         
    new_history.append({
        "id": int(time.time()) + 1,
        "type": "system",
        "text": sys_text
    })
    
    new_doc = {
        "game_id": game_id,
        "round_id": last_state_doc.get("round_id", 0) + 1,
        "company_name": last_state_doc.get("company_name"),
        "turn": current_state["turn"] + 1,
        "attributes": new_attributes,
        "history": new_history,
        "current_options": llm_result.get("next_options", []),
        "passive_rules": last_state_doc.get("passive_rules", {}),
        "formulas": last_state_doc.get("formulas", "")
    }
    
    db.push_new_state(new_doc)
    
    return {
        "state": {
            "companyName": new_doc["company_name"],
            "turn": new_doc["turn"],
            "attributes": new_doc["attributes"],
            "history": new_doc["history"]
        },
        "options": new_doc["current_options"]
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
