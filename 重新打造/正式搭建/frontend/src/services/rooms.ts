import apiClient from './api';

export interface RoomSummary {
  id: string;
  name: string;
  status: string;
  maxPlayers: number;
  currentPlayers: number;
  hostId: string;
  hostName?: string;
  createdAt: string;
}

export interface RoomListResult {
  rooms: RoomSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateRoomPayload {
  name: string;
  maxPlayers?: number;
  gameMode?: string;
  password?: string;
}

export const roomAPI = {
  list: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<RoomListResult> => {
    const response = await apiClient.get('/rooms/list', { params });
    return response.data;
  },

  create: async (payload: CreateRoomPayload): Promise<{ room_id: string }> => {
    const response = await apiClient.post('/rooms/create', payload);
    return response.data;
  },

  join: async (roomId: string, password?: string): Promise<void> => {
    await apiClient.post(`/rooms/${roomId}/join`, { password });
  },

  leave: async (roomId: string): Promise<void> => {
    await apiClient.post(`/rooms/${roomId}/leave`);
  },
};
