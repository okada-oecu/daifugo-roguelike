import { io, Socket } from 'socket.io-client';
import { ChatMessage, RoomInfo } from '../types/multiplayer';

class SocketService {
  private socket: Socket | null = null;

  public connect(): Socket {
    if (!this.socket) {
      this.socket = io({
        autoConnect: true,
        reconnection: true,
      });
    }
    return this.socket;
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public createRoom(playerName: string): Promise<{ success: boolean; roomCode?: string; playerActor?: string; room?: RoomInfo; error?: string }> {
    return new Promise((resolve) => {
      const s = this.connect();
      s.emit('create-room', { playerName }, (res: any) => {
        resolve(res);
      });
    });
  }

  public joinRoom(roomCode: string, playerName: string): Promise<{ success: boolean; roomCode?: string; playerActor?: string; room?: RoomInfo; error?: string }> {
    return new Promise((resolve) => {
      const s = this.connect();
      s.emit('join-room', { roomCode, playerName }, (res: any) => {
        resolve(res);
      });
    });
  }

  public toggleReady() {
    this.socket?.emit('toggle-ready');
  }

  public startGame(initialGameState: any) {
    this.socket?.emit('start-game', { initialGameState });
  }

  public syncGameState(gameState: any) {
    this.socket?.emit('sync-game-state', { gameState });
  }

  public sendPhaseReady(phase: string, data?: any) {
    this.socket?.emit('player-phase-ready', { phase, data });
  }

  public onPhaseReadyUpdated(callback: (data: { phase: string; readyCount: number; totalCount: number }) => void) {
    this.socket?.on('phase-ready-updated', callback);
    return () => {
      this.socket?.off('phase-ready-updated', callback);
    };
  }

  public onAllPlayersPhaseReady(callback: (data: { phase: string; data?: any }) => void) {
    this.socket?.on('all-players-phase-ready', callback);
    return () => {
      this.socket?.off('all-players-phase-ready', callback);
    };
  }

  public sendChat(text: string) {
    this.socket?.emit('send-chat', { text });
  }

  public leaveRoom() {
    this.socket?.emit('leave-room');
  }

  public disbandRoom(reason?: string) {
    this.socket?.emit('disband-room', { reason });
  }

  public onRoomUpdated(callback: (room: RoomInfo) => void) {
    this.socket?.on('room-updated', callback);
    return () => {
      this.socket?.off('room-updated', callback);
    };
  }

  public onPlayerLeftGame(callback: (data: { leavingPlayer: any; room: RoomInfo; message: string }) => void) {
    this.socket?.on('player-left-game', callback);
    return () => {
      this.socket?.off('player-left-game', callback);
    };
  }

  public onRoomDisbanded(callback: (data: { reason: string }) => void) {
    this.socket?.on('room-disbanded', callback);
    return () => {
      this.socket?.off('room-disbanded', callback);
    };
  }

  public onGameStarted(callback: (data: { gameState: any; room: RoomInfo }) => void) {
    this.socket?.on('game-started', callback);
    return () => {
      this.socket?.off('game-started', callback);
    };
  }

  public onGameStateSynced(callback: (gameState: any) => void) {
    this.socket?.on('game-state-synced', callback);
    return () => {
      this.socket?.off('game-state-synced', callback);
    };
  }

  public onChatReceived(callback: (msg: ChatMessage) => void) {
    this.socket?.on('chat-received', callback);
    return () => {
      this.socket?.off('chat-received', callback);
    };
  }

  public onDisconnect(callback: (reason: string) => void) {
    this.socket?.on('disconnect', callback);
    return () => {
      this.socket?.off('disconnect', callback);
    };
  }
}

export const socketService = new SocketService();
