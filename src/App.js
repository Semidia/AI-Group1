import React, { useState, useEffect, useRef } from 'react';

import { db } from './firebase';

import { ref, set, onValue, update } from "firebase/database";

import { Users, Play, CheckCircle, Loader, Trash2, Scroll, Globe, Settings, Clock } from 'lucide-react';



// ==========================================

// 🔧 DeepSeek 配置

// ==========================================

const DEEPSEEK_KEY = 'sk-Sf9hFPb1Kka1Ztys2bGgde36aFmeBdQdNYUUhnHP0VKudVJL'; // ✅ 你的 Key

// ==========================================



const HybridGameApp = () => {

  // 1. 身份与状态

  const [myRole, setMyRole] = useState(() => localStorage.getItem('myRole') || null);

  const [gameStatus, setGameStatus] = useState('LOBBY'); 

  

  // 2. 游戏核心数据

  const defaultPlayers = {

    A: { status: 'EMPTY', type: 'HUMAN' },

    B: { status: 'EMPTY', type: 'HUMAN' },

    C: { status: 'EMPTY', type: 'HUMAN' }

  };

  const [players, setPlayers] = useState(defaultPlayers);

  const [companies, setCompanies] = useState({});

  const [logs, setLogs] = useState([]);

  const [story, setStory] = useState('');

  

  // 3. 游戏配置 (新功能：回合数)

  const [maxTurns, setMaxTurns] = useState(6); // 默认 6 回合

  const [currentTurn, setCurrentTurn] = useState(0);



  // 4. 本地交互

  const [input, setInput] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);

  const chatEndRef = useRef(null);



  // ==========================================

  // 🔥 1. 监听 Firebase

  // ==========================================

  useEffect(() => {

    onValue(ref(db, 'room1/players'), (snap) => {

        const val = snap.val();

        if (val) setPlayers(prev => ({ ...defaultPlayers, ...val }));

        else setPlayers(defaultPlayers);

    });

    

    onValue(ref(db, 'room1/status'), (snap) => setGameStatus(snap.val() || 'LOBBY'));

    onValue(ref(db, 'room1/companies'), (snap) => setCompanies(snap.val() || {}));

    onValue(ref(db, 'room1/story'), (snap) => setStory(snap.val() || ''));

    onValue(ref(db, 'room1/config/maxTurns'), (snap) => { if(snap.val()) setMaxTurns(snap.val()) }); // 同步回合设置

    onValue(ref(db, 'room1/config/currentTurn'), (snap) => { if(snap.val()) setCurrentTurn(snap.val()) });

    

    onValue(ref(db, 'room1/logs'), (snap) => {

        const val = snap.val();

        setLogs(val ? Object.values(val) : []);

    });

  }, []);



  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);



  // ==========================================

  // 🎮 2. 大厅逻辑

  // ==========================================

  const joinGame = (role) => {

    const currentP = players[role] || { status: 'EMPTY' };

    if (currentP.status !== 'EMPTY' && myRole !== role) {

        if(!window.confirm(`角色 ${role} 已经被占用了，要强制抢座吗？`)) return;

    }

    localStorage.setItem('myRole', role);

    setMyRole(role);

    update(ref(db, `room1/players/${role}`), { status: 'READY', type: 'HUMAN' });

  };



  const forceResetRoom = async () => {

    if(!window.confirm('⚠️ 确定要踢出所有人并重置游戏吗？')) return;

    localStorage.removeItem('myRole'); 

    setMyRole(null);

    await set(ref(db, 'room1'), {

      status: 'LOBBY',

      players: defaultPlayers,

      companies: {},

      logs: [],

      story: '',

      config: { maxTurns: 6, currentTurn: 0 } // 重置配置

    });

    window.location.reload();

  };



  // 🚀 核心逻辑：开始游戏 (带回合设置)

  const hostStartGame = async () => {

    setIsProcessing(true);

    try {

      const prompt = `

        你是一个商业沙盘游戏《凡墙皆是门》的主持人。

        请执行【游戏初始化】任务。

        任务：生成300字商业背景故事，并为A/B/C起中文名。

        JSON格式: { "background_story": "...", "company_names": { "A": "...", "B": "...", "C": "..." } }

      `;



      const res = await fetch('https://api.deepseek.com/chat/completions', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },

        body: JSON.stringify({

          model: "deepseek-chat",

          messages: [{ role: "system", content: "JSON Only" }, { role: "user", content: prompt }]

        })

      });

      

      const raw = await res.json();

      const jsonStr = raw.choices[0].message.content.replace(/```json/g,'').replace(/```/g,'');

      const aiData = JSON.parse(jsonStr);



      // 准备初始数据

      const finalPlayers = { ...players };

      const initCompanies = {};

      

      ['A', 'B', 'C'].forEach(key => {

        if (finalPlayers[key].status === 'EMPTY') {

          finalPlayers[key] = { status: 'AI', type: 'AI' };

        }

        initCompanies[key] = {

          name: aiData.company_names?.[key] || `${key}集团`,

          type: finalPlayers[key].type, 

          cash: 10000000,

          marketShare: 33,

          decision: '',

          status: 'WAITING' 

        };

      });



      // 写入 Firebase (保存 maxTurns)

      await set(ref(db, 'room1/players'), finalPlayers);

      await set(ref(db, 'room1/companies'), initCompanies);

      await set(ref(db, 'room1/story'), aiData.background_story || "新时代开启...");

      await set(ref(db, 'room1/config'), { maxTurns: maxTurns, currentTurn: 1 }); // 保存回合设置

      

      const initialLogs = [

        { type: 'system', content: '【系统提示】正在根据周易卦象推演本年度商业运势...' },

        { type: 'narrative', content: `📜 **背景故事**\n\n${aiData.background_story}` },

        { type: 'system', content: '——— 第1回合：游戏开始 ———' }

      ];



      await set(ref(db, 'room1/logs'), initialLogs);

      await set(ref(db, 'room1/status'), 'PLAYING');



    } catch (e) {

      console.error(e);

      alert("启动失败：" + e.message);

    } finally {

      setIsProcessing(false);

    }

  };



  // ==========================================

  // 🕹️ 3. 游戏逻辑

  // ==========================================

  const submitDecision = async () => {

    if (!input.trim()) return;

    await update(ref(db, `room1/companies/${myRole}`), {

      decision: input,

      status: 'SUBMITTED'

    });

    setInput('');

  };



  useEffect(() => {

    if (myRole !== 'A' || gameStatus !== 'PLAYING') return;



    const checkAndRun = async () => {

      const currentCompanies = Object.values(companies || {});

      if (currentCompanies.length === 0) return;

      const humans = currentCompanies.filter(c => c.type === 'HUMAN');

      const allReady = humans.length > 0 && humans.every(c => c.decision && c.decision !== '');



      if (allReady && !isProcessing) {

        await runHybridTurn();

      }

    };



    const timer = setTimeout(checkAndRun, 1000);

    return () => clearTimeout(timer);

  }, [companies, isProcessing, myRole, gameStatus]);



  const runHybridTurn = async () => {

    setIsProcessing(true);

    try {

      const humanDecisions = Object.entries(companies)

        .filter(([_, c]) => c.type === 'HUMAN')

        .map(([k, c]) => `${k}(${c.name})决策:${c.decision}`).join('\n');

      

      const aiList = Object.keys(companies).filter(k => companies[k].type === 'AI');



      const prompt = `

        你是一个商业裁判。

        【背景】${story}

        【回合】第 ${currentTurn} / ${maxTurns} 轮

        【人类决策】\n${humanDecisions}

        【AI列表】${aiList.join(',')}

        【状态】${JSON.stringify(companies)}

        任务：推演结果。

        JSON: {"narrative":"...","ai_actions":{"B":"..."},"updates":{"A":{"cash":-10,"share":1}}}

      `;



      const res = await fetch('https://api.deepseek.com/chat/completions', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },

        body: JSON.stringify({

          model: "deepseek-chat",

          messages: [{ role: "system", content: "JSON Only" }, { role: "user", content: prompt }]

        })

      });

      

      const raw = await res.json();

      const jsonStr = raw.choices[0].message.content.replace(/```json/g,'').replace(/```/g,'');

      const result = JSON.parse(jsonStr);



      const updates = { ...companies };

      const newLogs = [];

      newLogs.push({ type: 'narrative', content: result.narrative });

      if (result.ai_actions) {

        Object.entries(result.ai_actions).forEach(([k,v]) => newLogs.push({ type: 'rival', content: `🤖 ${companies[k]?.name || k} (AI): ${v}` }));

      }



      Object.keys(updates).forEach(k => {

        const chg = result.updates?.[k] || { cash: 0, share: 0 };

        if(updates[k]) {

            updates[k].cash = (updates[k].cash || 0) + (chg.cash || 0);

            updates[k].marketShare = (updates[k].marketShare || 0) + (chg.share || 0);

            updates[k].decision = '';

            updates[k].status = 'WAITING';

        }

      });



      // 更新 Firebase

      await update(ref(db, 'room1/companies'), updates);

      await set(ref(db, 'room1/logs'), [...(logs || []), ...newLogs]);

      

      // 更新回合数 (如果需要)

      // await update(ref(db, 'room1/config'), { currentTurn: currentTurn + 1 });



    } catch (e) {

      console.error(e);

    } finally {

      setIsProcessing(false);

    }

  };



  // ==========================================

  // 🎨 视图渲染

  // ==========================================

  

  const EmergencyBtn = () => (

    <button onClick={forceResetRoom} className="fixed bottom-2 left-2 z-50 text-[10px] text-red-500 opacity-50 hover:opacity-100 bg-black px-2 py-1 border border-red-900">

      🆘 重置房间

    </button>

  );



  const safeMyData = companies[myRole] || {};



  // 大厅视图

  if (!myRole || gameStatus === 'LOBBY') {

    return (

      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200 p-4 font-sans">

        <EmergencyBtn />

        <div className="w-full max-w-4xl bg-slate-900 p-8 rounded-xl border border-slate-800 shadow-2xl">

          <h1 className="text-3xl font-bold mb-2 text-center text-white flex items-center justify-center gap-3">

            <Globe className="text-cyan-400" /> 凡墙皆是门 | 大厅

          </h1>

          

          <div className="grid grid-cols-3 gap-6 mb-10 mt-8">

            {['A', 'B', 'C'].map(role => {

              const p = players[role] || { status: 'EMPTY' };

              const isTaken = p.status === 'READY';

              const isMySeat = myRole === role;

              return (

                <button key={role} onClick={() => joinGame(role)} className={`h-40 rounded-2xl border-2 flex flex-col items-center justify-center transition-all relative group ${isTaken && !isMySeat ? 'border-slate-700 bg-slate-800 opacity-60' : 'border-slate-600 hover:border-cyan-400 hover:bg-slate-800'} ${myRole === role ? 'ring-4 ring-cyan-500 border-cyan-400 bg-cyan-900/20 opacity-100' : ''}`}>

                  <div className="text-4xl font-bold mb-2 text-white">{role}</div>

                  <div className={`text-xs px-3 py-1 rounded-full font-mono ${isTaken ? 'bg-slate-700' : 'bg-emerald-900 text-emerald-400'}`}>{isTaken ? '已入座' : '点击加入'}</div>

                  {myRole === role && <div className="absolute top-2 right-2 text-cyan-400"><CheckCircle size={20}/></div>}

                </button>

              )

            })}

          </div>



          <div className="max-w-md mx-auto">

            {myRole === 'A' ? (

               gameStatus === 'PLAYING' ? (

                 <div className="text-emerald-400 font-bold animate-pulse text-center">游戏进行中...</div>

               ) : (

                 <div className="space-y-6">

                    {/* 🛠️ 新增：回合数拉杆 */}

                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">

                        <div className="flex justify-between items-center mb-3">

                            <span className="text-sm font-bold text-slate-400 flex items-center gap-2"><Settings size={14}/> 设定游戏时长</span>

                            <span className="text-cyan-400 font-mono text-xl font-bold">{maxTurns} <span className="text-xs text-slate-500">回合</span></span>

                        </div>

                        <input 

                            type="range" min="1" max="10" step="1"

                            value={maxTurns}

                            onChange={(e) => setMaxTurns(Number(e.target.value))}

                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400 transition-all"

                        />

                        <div className="flex justify-between text-[10px] text-slate-600 mt-2 font-mono uppercase">

                            <span>Short Game</span>

                            <span>Long Campaign</span>

                        </div>

                    </div>



                    <button onClick={hostStartGame} disabled={isProcessing} className="w-full px-12 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 text-white font-bold rounded-xl shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-all transform hover:scale-[1.02]">

                        {isProcessing ? <Loader className="animate-spin"/> : <Play size={24} />} 

                        {isProcessing ? "AI 生成世界中..." : "启动模拟 (INITIALIZE)"}

                    </button>

                 </div>

               )

            ) : (

              <div className="text-slate-400 text-center">{myRole ? "等待房主 A 设定并开始..." : "请点击上方卡片选择一个角色"}</div>

            )}

          </div>

        </div>

      </div>

    )

  }



  // 游戏界面

  return (

    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">

      <EmergencyBtn />

      

      {/* 左侧 */}

      <div className="w-1/4 bg-slate-900 border-r border-slate-800 flex flex-col">

         <div className="p-4 border-b border-slate-800 bg-slate-900/50">

            <div className="flex items-center justify-between gap-2 text-cyan-400 font-bold mb-2">

                <span className="flex items-center gap-2"><Scroll size={16}/> 背景设定</span>

                <span className="text-xs bg-slate-800 text-slate-500 px-2 py-1 rounded border border-slate-700 font-mono">Turn {currentTurn || 1}/{maxTurns}</span>

            </div>

            <div className="text-xs text-slate-400 h-32 overflow-y-auto leading-relaxed italic pr-2">{story || "加载中..."}</div>

         </div>

         <div className="p-4 flex-1 overflow-y-auto space-y-3">

           {Object.entries(companies || {}).map(([key, data]) => (

             <div key={key} className={`p-4 rounded-lg border ${key === myRole ? 'border-cyan-500 bg-slate-800' : 'border-slate-700 bg-slate-900/50'}`}>

               <div className="flex justify-between items-center mb-2">

                 <span className="font-bold text-white truncate max-w-[120px]">{data?.name || key}</span>

                 <span className="text-[10px] bg-slate-700 px-1 rounded">{data?.type || '?'}</span>

               </div>

               <div className="font-mono text-emerald-400 text-lg">¥{((data?.cash || 0)/10000).toFixed(0)}w</div>

               <div className="text-xs text-slate-500">份额 {data?.marketShare || 0}%</div>

               {data?.decision && <div className="text-xs text-emerald-500 mt-1">✔ 已提交</div>}

             </div>

           ))}

         </div>

      </div>



      {/* 右侧 */}

      <div className="w-3/4 flex flex-col bg-slate-950 relative">

        <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-thin">

           {(logs || []).map((l, i) => (

             <div key={i} className={`flex flex-col ${l.type==='player'?'items-end':'items-start'}`}>

                <div className={`p-4 rounded-xl max-w-3xl border text-sm leading-relaxed shadow-md whitespace-pre-wrap

                  ${l.type==='narrative'

                    ? 'bg-slate-900 border-l-4 border-emerald-500 text-slate-300 pl-6 py-6 font-sans text-base' 

                    : l.type==='player'

                      ? 'bg-cyan-900/20 border-cyan-800 text-cyan-100'

                      : l.type==='system'

                        ? 'bg-transparent border-none text-center text-slate-500 text-xs w-full'

                        : 'bg-slate-800 border-slate-700 text-purple-200 font-mono text-xs'

                  }`}>

                    {l.content || '...'}

                </div>

             </div>

           ))}

           {isProcessing && <div className="flex justify-center"><div className="bg-slate-800 px-4 py-2 rounded-full text-cyan-500 flex items-center gap-2"><Loader className="animate-spin" size={16}/> AI 推演中...</div></div>}

           <div ref={chatEndRef} />

        </div>

        

        {safeMyData.type === 'HUMAN' && (

          <div className="p-6 bg-slate-900 border-t border-slate-800">

            <div className="relative">

                <input className="w-full bg-slate-950 border border-slate-700 rounded-xl py-4 px-6 text-white focus:border-cyan-500 outline-none disabled:opacity-50" 

                       placeholder={`作为 ${safeMyData.name || myRole} 的决策者...`} 

                       value={input} onChange={e => setInput(e.target.value)} 

                       disabled={safeMyData.decision !== '' || isProcessing} 

                       onKeyDown={e => e.key === 'Enter' && submitDecision()} />

                <button onClick={submitDecision} disabled={safeMyData.decision !== '' || isProcessing} className="absolute right-2 top-2 bottom-2 px-6 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white rounded-lg font-bold">

                    {safeMyData.decision ? '等待中' : '提交'}

                </button>

            </div>

          </div>

        )}

      </div>

    </div>

  );

};



export default HybridGameApp;