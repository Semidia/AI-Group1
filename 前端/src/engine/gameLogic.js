import { eventManager, generateProgressOutput } from './eventSystem.js';

// --- 工具：生成随机中文公司名 ---
const COMPANY_PREFIXES = ["星河", "量子", "蓝海", "晨曦", "未来", "鸿蒙", "极光", "深空", "云岚", "燎原"];
const COMPANY_MIDDLES = ["科", "数", "智", "新", "云", "链", "芯", "网", "创", "数智"];
const COMPANY_SUFFIXES = ["科技", "集团", "资本", "网络", "创新", "智能", "控股", "系统", "实验室", "科技有限公司"];

function randomFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function generateChineseCompanyName() {
    const prefix = randomFrom(COMPANY_PREFIXES);
    const middle = Math.random() < 0.6 ? randomFrom(COMPANY_MIDDLES) : "";
    const suffix = randomFrom(COMPANY_SUFFIXES);
    return `${prefix}${middle}${suffix}`;
}

export function generateCompanySet() {
    const nameSet = new Set();
    while (nameSet.size < 3) {
        nameSet.add(generateChineseCompanyName());
    }
    const [playerCompany, aiCompany1, aiCompany2] = Array.from(nameSet);

    return {
        companyName: playerCompany,
        players: [
            {
                id: "company_player",
                name: `${playerCompany}（你）`,
                type: "human",
                position: "company"
            },
            {
                id: "company_ai_alpha",
                name: `${aiCompany1}（AI）`,
                type: "ai",
                position: "company"
            },
            {
                id: "company_ai_beta",
                name: `${aiCompany2}（AI）`,
                type: "ai",
                position: "company"
            }
        ]
    };
}

const generated = generateCompanySet();

export const initialState = {
    companyName: generated.companyName,
    turn: 1,
    attributes: {
        cash: 1000,
        morale: 50,
        reputation: 50,
        innovation: 10
    },
    activeEvents: [], // 当前活跃事件
    systemPrompts: [], // 待注入的系统提示
    players: generated.players,
    history: [
        {
            id: 0,
            type: 'system',
            text: `欢迎来到《凡墙皆是门》。你现在是「${generated.companyName}」的最高决策者。`
        },
        {
            id: 1,
            type: 'system',
            text: "📜 公司背景："
        },
        {
            id: 2,
            type: 'system',
            text: `${generated.companyName} 成立于2035年，专注于前沿科技与智能系统开发。创始人在一次实验室事故中失踪，留下了这家处于转型期的科技公司。`
        },
        {
            id: 3,
            type: 'system',
            text: "💼 当前困境："
        },
        {
            id: 4,
            type: 'system',
            text: "- 资金链紧张：核心项目超支，现金储备仅够维持3个月\n- 团队分裂：技术团队与市场团队战略分歧严重\n- 声誉危机：媒体质疑公司的技术安全性，股价下跌20%\n- 创新停滞：核心团队流失，新想法难产"
        },
        {
            id: 5,
            type: 'system',
            text: "🌍 行业环境："
        },
        {
            id: 6,
            type: 'system',
            text: "科技巨头正准备推出颠覆性的产品，将彻底改变行业格局。赛道上多家初创公司获得大额融资，竞争异常激烈。"
        },
        {
            id: 7,
            type: 'system',
            text: "🎯 你的任务："
        },
        {
            id: 8,
            type: 'system',
            text: `带领 ${generated.companyName} 走出困境，决定公司的未来方向。你的每一个决策都会在市场和团队中产生连锁反应。`
        },
        {
            id: 9,
            type: 'system',
            text: "公司正处于十字路口，你的每一个决定都至关重要。"
        }
    ]
};

/**
 * 更新事件进度并生成输出
 * @param {Object} state - 当前游戏状态
 * @returns {Object} 包含事件相关的状态更新
 */
export function updateGameEvents(state) {
    // 更新所有事件进度
    const updateResult = eventManager.updateEvents();

    // 生成进度显示文本
    const progressOutput = generateProgressOutput(updateResult);

    // 获取待注入的系统提示
    const systemPrompts = eventManager.getSystemPrompts();

    // 清空系统提示（防止重复）
    eventManager.clearSystemPrompts();

    // 更新状态中的事件和提示信息
    const newState = {
        ...state,
        activeEvents: eventManager.getActiveEvents().map(e => ({
            id: e.id,
            description: e.description,
            currentRound: e.currentRound,
            totalRounds: e.totalRounds,
            progress: e.getProgress()
        })),
        systemPrompts: systemPrompts
    };

    return {
        state: newState,
        progressOutput,
        systemPrompts,
        updateResult
    };
}

export function processDecision(state, decision) {
    const newAttributes = { ...state.attributes };
    let resultText = "";

    // Apply effects
    if (decision.effects) {
        if (decision.effects.cash) newAttributes.cash += decision.effects.cash;
        if (decision.effects.morale) newAttributes.morale += decision.effects.morale;
        if (decision.effects.reputation) newAttributes.reputation += decision.effects.reputation;
        if (decision.effects.innovation) newAttributes.innovation += decision.effects.innovation;
    }

    // Generate result text (simple template)
    if (decision.customText) {
        resultText = `你决定：${decision.customText}。`;
    } else {
        resultText = `执行了计划：${decision.label}。`;
    }

    // Bounds checking
    newAttributes.morale = Math.min(100, Math.max(0, newAttributes.morale));
    newAttributes.reputation = Math.min(100, Math.max(0, newAttributes.reputation));

    const baseState = {
        ...state,
        turn: state.turn + 1,
        attributes: newAttributes,
        history: [
            ...state.history,
            { id: Date.now(), type: 'player', text: resultText },
            { id: Date.now() + 1, type: 'system', text: decision.resultNarrative || "由于你的决策，局势发生了变化。" }
        ]
    };

    // 更新事件进度并获取事件相关输出
    const eventUpdate = updateGameEvents(baseState);

    // 如果有事件进度更新，添加到历史记录中
    if (eventUpdate.progressOutput) {
        eventUpdate.state.history = [
            ...eventUpdate.state.history,
            { id: Date.now() + 2, type: 'system', text: eventUpdate.progressOutput }
        ];
    }

    return eventUpdate.state;
}