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
};


