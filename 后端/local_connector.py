import json
import os
import time
from datetime import datetime

LOCAL_FILE = "local_game_data.json"

class LocalBridge:
    def __init__(self):
        """
        初始化本地文件存储
        """
        self.file_path = LOCAL_FILE
        # Ensure file exists
        if not os.path.exists(self.file_path):
            self._save_data({})
        print(f"✅ [本地接口] 使用本地文件存储: {os.path.abspath(self.file_path)}")

    def _load_data(self):
        try:
            with open(self.file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}

    def _save_data(self, data):
        with open(self.file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def pull_latest_state(self, game_id):
        """
        获取指定房间的最新存档
        """
        data_store = self._load_data()
        
        # In local JSON, we store a list of states per game_id or just the latest?
        # To match Mongo behavior (collection of history), we might simulate it.
        # But for simplicity, let's store keys as "game_id" -> list of states.
        
        game_history = data_store.get(game_id, [])
        if not game_history:
            print(f"⚠️ [本地下载] 房间 {game_id} 无存档")
            return None
            
        # Return the last one (latest)
        latest = game_history[-1]
        print(f"⬇️  [本地下载] 获取到 {game_id} Round {latest.get('round_id')}")
        return latest

    def push_new_state(self, game_data):
        """
        上传推演完的新数据
        """
        try:
            data_store = self._load_data()
            game_id = game_data.get("game_id", "default")
            
            if game_id not in data_store:
                data_store[game_id] = []
            
            data_store[game_id].append(game_data)
            
            self._save_data(data_store)
            print(f"⬆️  [本地上传] 数据保存成功！Round: {game_data.get('round_id')}")
            return True
        except Exception as e:
            print(f"❌ [本地上传] 写入出错: {e}")
            return False
