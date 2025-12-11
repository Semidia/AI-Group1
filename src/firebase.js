// src/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database"; // 引入数据库模块

// 你的 Firebase 配置 (我已经帮你填好了)
const firebaseConfig = {
  apiKey: "AIzaSyCvqCIDwpsSfCsylCqvQe9oWhE6ZUPAHv0",
  authDomain: "every-wall-is-a-door.firebaseapp.com",
  // 注意：这里必须是你刚才复制的那个 databaseURL，这非常重要
  databaseURL: "https://every-wall-is-a-door-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "every-wall-is-a-door",
  storageBucket: "every-wall-is-a-door.firebasestorage.app",
  messagingSenderId: "208267238804",
  appId: "1:208267238804:web:433fe908e089ec60a14381",
  measurementId: "G-8F6L6VG821"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 初始化并导出数据库实例，这样 App.js 才能使用它
export const db = getDatabase(app);