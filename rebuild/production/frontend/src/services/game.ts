import apiClient from './api';

export interface GameSessionSummary {
  sessionId: string;
  roomId: string;
  currentRound: number;
  roundStatus: string;
  decisionDeadline?: string | null;
  status: string;
}

export interface DecisionSummary {
  id: string;
  userId: string;
  playerIndex: number;
  status: string;
  submittedAt: string;
}

export interface ReviewDecisionSummary extends DecisionSummary {
  username: string;
  nickname?: string;
  actionText?: string;
  selectedOptionIds?: unknown;
  actionType?: string;
  actionData?: unknown;
  hostModified?: boolean;
  hostModification?: unknown;
}

export interface ReviewDecisions {
  sessionId: string;
  round: number;
  decisionDeadline?: string | null;
  timedOut: boolean;
  actions: ReviewDecisionSummary[];
}

export interface TemporaryEvent {
  id: string;
  sessionId: string;
  round: number;
  eventType: string;
  eventContent: string;
  effectiveRounds: number;
  progress: Record<string, unknown>;
  createdAt: string;
}

export interface TemporaryRule {
  id: string;
  sessionId: string;
  round: number;
  ruleContent: string;
  effectiveRounds: number;
  createdAt: string;
}

export interface InferenceData {
  sessionId: string;
  round: number;
  decisions: Array<{
    playerIndex: number;
    username: string;
    nickname?: string;
    actionText?: string;
    selectedOptionIds?: unknown;
    actionType?: string;
    actionData?: unknown;
    hostModified?: boolean;
    hostModification?: unknown;
  }>;
  activeEvents: Array<{
    id: string;
    eventType: string;
    eventContent: string;
    effectiveRounds: number;
    progress: Record<string, unknown>;
    round: number;
  }>;
  gameRules: string;
  currentRound: number;
}

export interface RoundDecisions {
  sessionId: string;
  round: number;
  decisionDeadline?: string | null;
  timedOut: boolean;
  actions: DecisionSummary[];
}

export const gameAPI = {
  startGame: async (roomId: string): Promise<GameSessionSummary> => {
    const response = await apiClient.post(`/game/${roomId}/start`);
    return response.data.data;
  },

  getSession: async (sessionId: string): Promise<GameSessionSummary> => {
    const response = await apiClient.get(`/game/${sessionId}`);
    return response.data.data;
  },

  submitDecision: async (
    sessionId: string,
    payload: {
      round?: number;
      actionText?: string;
      selectedOptionIds?: unknown;
      actionType?: string;
      actionData?: unknown;
    }
  ): Promise<void> => {
    await apiClient.post(`/game/${sessionId}/decision`, payload);
  },

  getRoundDecisions: async (sessionId: string, round: number): Promise<RoundDecisions> => {
    const response = await apiClient.get(`/game/${sessionId}/round/${round}/decisions`);
    return response.data.data;
  },

  // 第七阶段：主持人审核功能
  getReviewDecisions: async (sessionId: string, round: number): Promise<ReviewDecisions> => {
    const response = await apiClient.get(`/game/${sessionId}/round/${round}/decisions/review`);
    return response.data.data;
  },

  addTemporaryEvent: async (
    sessionId: string,
    round: number,
    payload: {
      eventType: 'single_round' | 'multi_round';
      eventContent: string;
      effectiveRounds?: number;
    }
  ): Promise<TemporaryEvent> => {
    const response = await apiClient.post(`/game/${sessionId}/round/${round}/temporary-event`, payload);
    return response.data.data;
  },

  addTemporaryRule: async (
    sessionId: string,
    round: number,
    payload: {
      ruleContent: string;
      effectiveRounds?: number;
    }
  ): Promise<TemporaryRule> => {
    const response = await apiClient.post(`/game/${sessionId}/round/${round}/temporary-rule`, payload);
    return response.data.data;
  },

  submitToAI: async (sessionId: string, round: number): Promise<{ sessionId: string; round: number; status: string }> => {
    const response = await apiClient.post(`/game/${sessionId}/round/${round}/submit-to-ai`);
    return response.data.data;
  },

  getInferenceResult: async (
    sessionId: string,
    round: number
  ): Promise<{
    sessionId: string;
    round: number;
    status: 'processing' | 'completed' | 'failed';
    result?: {
      narrative?: string;
      outcomes?: Array<{
        playerIndex: number;
        outcome: string;
        resources?: Record<string, unknown>;
      }>;
      events?: Array<{
        type: string;
        description: string;
      }>;
      nextRoundHints?: string;
    };
    completedAt?: string;
    error?: string;
  }> => {
    const response = await apiClient.get(`/game/${sessionId}/round/${round}/inference-result`);
    return response.data.data;
  },

  // 第九阶段：多回合事件进度跟踪
  getActiveEvents: async (sessionId: string): Promise<{
    sessionId: string;
    currentRound: number;
    events: Array<{
      id: string;
      sessionId: string;
      round: number;
      eventType: string;
      eventContent: string;
      effectiveRounds: number;
      progress: Record<string, unknown>;
      isCompleted: boolean;
      progressPercentage: number;
      createdAt: string;
      updatedAt: string;
      creator: {
        id: string;
        username: string;
        nickname?: string;
      };
    }>;
  }> => {
    const response = await apiClient.get(`/game/${sessionId}/events/active`);
    return response.data.data;
  },

  updateEventProgress: async (
    sessionId: string,
    eventId: string,
    payload: {
      progress: Record<string, unknown>;
      currentRound?: number;
    }
  ): Promise<{
    id: string;
    sessionId: string;
    progress: Record<string, unknown>;
    completed: boolean;
    completedAt: string | null;
  }> => {
    const response = await apiClient.put(`/game/${sessionId}/events/${eventId}/progress`, payload);
    return response.data.data;
  },

  // 第十阶段：游戏状态同步和回合管理
  getGameState: async (sessionId: string): Promise<GameState> => {
    const response = await apiClient.get(`/game/${sessionId}/state`);
    return response.data.data;
  },

  nextRound: async (
    sessionId: string,
    currentRound: number
  ): Promise<{
    sessionId: string;
    previousRound: number;
    currentRound: number;
    roundStatus: string;
  }> => {
    const response = await apiClient.post(`/game/${sessionId}/round/${currentRound}/next`);
    return response.data.data;
  },

  // 第十一阶段：历史记录管理
  getGameHistory: async (
    page: number = 1,
    limit: number = 10,
    status?: string
  ): Promise<{
    history: Array<{
      id: string;
      sessionId: string;
      roomId: string;
      roomName: string;
      hostName: string;
      currentRound: number;
      totalRounds: number | null;
      status: string;
      roundStatus: string;
      createdAt: string;
      updatedAt: string;
      finishedAt: string | null;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> => {
    const params: Record<string, string> = { page: String(page), limit: String(limit) };
    if (status) params.status = status;
    const response = await apiClient.get('/game/history', { params });
    return response.data.data;
  },

  getGameHistoryDetail: async (sessionId: string): Promise<{
    id: string;
    sessionId: string;
    roomId: string;
    roomName: string;
    hostName: string;
    currentRound: number;
    totalRounds: number | null;
    status: string;
    roundStatus: string;
    gameState: Record<string, unknown> | null;
    roundResults: Array<{
      round: number;
      status: string;
      result?: any;
      completedAt?: string;
    }>;
    actions: Array<any>;
    events: Array<any>;
    gameRules: string | null;
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
  }> => {
    const response = await apiClient.get(`/game/history/${sessionId}`);
    return response.data.data;
  },

  deleteGameHistory: async (sessionId: string): Promise<void> => {
    await apiClient.delete(`/game/history/${sessionId}`);
  },

  batchDeleteGameHistory: async (sessionIds: string[]): Promise<{
    deletedCount: number;
  }> => {
    const response = await apiClient.delete('/game/history/batch', {
      data: { sessionIds },
    });
    return response.data.data;
  },

  getGameHistoryStatistics: async (): Promise<{
    totalGames: number;
    finishedGames: number;
    playingGames: number;
    totalRounds: number;
    averageRounds: number;
    byStatus: Record<string, number>;
    monthlyStats: Record<string, number>;
  }> => {
    const response = await apiClient.get('/game/history/statistics');
    return response.data.data;
  },

  // 第十三阶段：游戏存档功能
  saveGame: async (
    sessionId: string,
    payload?: {
      saveName?: string;
      description?: string;
    }
  ): Promise<{
    id: string;
    sessionId: string;
    saveName: string | null;
    description: string | null;
    isAutoSave: boolean;
    createdAt: string;
  }> => {
    const response = await apiClient.post(`/game/${sessionId}/save`, payload);
    return response.data.data;
  },

  getGameSaves: async (sessionId: string): Promise<{
    sessionId: string;
    saves: Array<{
      id: string;
      sessionId: string;
      saveName: string | null;
      description: string | null;
      isAutoSave: boolean;
      createdAt: string;
      creator: {
        id: string;
        username: string;
        nickname: string | null;
      };
    }>;
  }> => {
    const response = await apiClient.get(`/game/${sessionId}/saves`);
    return response.data.data;
  },

  restoreGame: async (
    sessionId: string,
    saveId: string
  ): Promise<{
    sessionId: string;
    saveId: string;
    saveName: string | null;
    restoredAt: string;
  }> => {
    const response = await apiClient.post(`/game/${sessionId}/restore/${saveId}`);
    return response.data.data;
  },

  deleteGameSave: async (sessionId: string, saveId: string): Promise<void> => {
    await apiClient.delete(`/game/${sessionId}/saves/${saveId}`);
  },

  // 第十四阶段：任务/挑战系统
  getTasks: async (sessionId: string, status?: string, taskType?: string): Promise<{
    sessionId: string;
    tasks: Array<{
      id: string;
      sessionId: string;
      title: string;
      description: string | null;
      taskType: string;
      difficulty: string;
      requirements: Record<string, unknown>;
      rewards: Record<string, unknown> | null;
      status: string;
      progress: Record<string, unknown>;
      userProgress: {
        status: string;
        progress: Record<string, unknown>;
        completedAt: string | null;
      } | null;
      createdBy: string | null;
      creator: {
        id: string;
        username: string;
        nickname: string | null;
      } | null;
      createdAt: string;
      updatedAt: string;
      expiresAt: string | null;
      completedAt: string | null;
    }>;
  }> => {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (taskType) params.taskType = taskType;
    const response = await apiClient.get(`/game/${sessionId}/tasks`, { params });
    return response.data.data;
  },

  getTaskDetail: async (sessionId: string, taskId: string): Promise<{
    id: string;
    sessionId: string;
    title: string;
    description: string | null;
    taskType: string;
    difficulty: string;
    requirements: Record<string, unknown>;
    rewards: Record<string, unknown> | null;
    status: string;
    progress: Record<string, unknown>;
    userProgress: {
      status: string;
      progress: Record<string, unknown>;
      completedAt: string | null;
      updatedAt: string;
    } | null;
    createdBy: string | null;
    creator: {
      id: string;
      username: string;
      nickname: string | null;
    } | null;
    createdAt: string;
    updatedAt: string;
    expiresAt: string | null;
    completedAt: string | null;
  }> => {
    const response = await apiClient.get(`/game/${sessionId}/tasks/${taskId}`);
    return response.data.data;
  },

  createTask: async (
    sessionId: string,
    payload: {
      title: string;
      description?: string;
      taskType: string;
      difficulty?: string;
      requirements?: Record<string, unknown>;
      rewards?: Record<string, unknown>;
      expiresAt?: string;
    }
  ): Promise<{
    id: string;
    sessionId: string;
    title: string;
    description: string | null;
    taskType: string;
    difficulty: string;
    requirements: Record<string, unknown>;
    rewards: Record<string, unknown> | null;
    status: string;
    createdBy: string | null;
    creator: {
      id: string;
      username: string;
      nickname: string | null;
    } | null;
    createdAt: string;
    expiresAt: string | null;
  }> => {
    const response = await apiClient.post(`/game/${sessionId}/tasks`, payload);
    return response.data.data;
  },

  updateTaskProgress: async (
    sessionId: string,
    taskId: string,
    payload: {
      progress?: Record<string, unknown>;
      status?: string;
    }
  ): Promise<{
    taskId: string;
    userId: string;
    progress: Record<string, unknown>;
    status: string;
    completedAt: string | null;
    updatedAt: string;
  }> => {
    const response = await apiClient.put(`/game/${sessionId}/tasks/${taskId}/progress`, payload);
    return response.data.data;
  },
};

interface GameState {
  sessionId: string;
  roomId: string;
  currentRound: number;
  totalRounds: number | null;
  roundStatus: 'decision' | 'review' | 'inference' | 'result' | 'finished';
  gameStatus: 'playing' | 'paused' | 'finished';
  decisionDeadline: string | null;
  gameState: Record<string, unknown> | null;
  inferenceResult: {
    status: string;
    result?: any;
    completedAt?: string;
  } | null;
  activeEvents: Array<{
    id: string;
    eventType: string;
    eventContent: string;
    effectiveRounds: number;
    progress: Record<string, unknown>;
    round: number;
  }>;
  submittedDecisions: number;
  totalPlayers: number;
  updatedAt: string;
}


