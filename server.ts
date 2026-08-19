import express from 'express';
import http from 'http';
import path from 'path';
import { Server, Socket } from 'socket.io';
import { createServer as createViteServer } from 'vite';

interface RoomPlayer {
  id: string;
  name: string;
  actor: 'player' | 'enemy1' | 'enemy2' | 'enemy3';
  isReady: boolean;
  isHost: boolean;
  isCpu: boolean;
}

interface ChatMessage {
  id: string;
  senderName: string;
  senderActor: 'player' | 'enemy1' | 'enemy2' | 'enemy3';
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

interface DaifugoRules {
  eightGiri: boolean;
  sevenPass: boolean;
  tenDiscard: boolean;
  elevenBack: boolean;
  revolution: boolean;
}

interface GameSettings {
  scoreLimit: number;
  turnTimeLimit: number;
  rules: DaifugoRules;
}

const DEFAULT_GAME_SETTINGS: GameSettings = {
  scoreLimit: 12,
  turnTimeLimit: 30,
  rules: {
    eightGiri: true,
    sevenPass: true,
    tenDiscard: true,
    elevenBack: true,
    revolution: true,
  },
};

const VALID_SCORE_LIMITS = new Set([6, 12, 24]);
const VALID_TIME_LIMITS = new Set([30, 60, 120]);

function isValidGameSettings(v: any): v is GameSettings {
  if (!isPlainObject(v)) return false;
  if (!VALID_SCORE_LIMITS.has(v.scoreLimit)) return false;
  if (!VALID_TIME_LIMITS.has(v.turnTimeLimit)) return false;
  if (!isPlainObject(v.rules)) return false;
  const ruleKeys = ['eightGiri', 'sevenPass', 'tenDiscard', 'elevenBack', 'revolution'];
  return ruleKeys.every(k => typeof v.rules[k] === 'boolean');
}

interface Room {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  status: 'waiting' | 'in_game';
  gameState: any | null;
  chatMessages: ChatMessage[];
  phaseReadyMap?: { [phase: string]: Set<string> };
  lastActivity: number;
  settings: GameSettings;
}

const rooms = new Map<string, Room>();

function touch(room: Room) {
  room.lastActivity = Date.now();
}

// Fields in gameState that are keyed per-actor (e.g. { player: [...], enemy1: [...] })
// and must be merged key-by-key instead of replaced wholesale, so that two clients
// syncing at nearly the same time don't stomp each other's own actor's data.
const PER_ACTOR_MERGE_FIELDS = ['abilities', 'scores'];

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Reject hand payloads that don't look like a real deal: no more cards than a
// standard 54-card deck total, and no duplicate card ids (both within a hand and
// across hands). Cheap sanity check, not a full move-legality validator.
function isValidHandsPayload(hands: any): boolean {
  if (!isPlainObject(hands)) return false;
  const seenIds = new Set<string>();
  let total = 0;
  for (const actor of ACTORS) {
    const hand = hands[actor];
    if (hand === undefined) continue;
    if (!Array.isArray(hand)) return false;
    for (const card of hand) {
      if (!card || typeof card.id !== 'string' || seenIds.has(card.id)) return false;
      seenIds.add(card.id);
      total++;
    }
  }
  return total <= 54;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

const ACTORS: ('player' | 'enemy1' | 'enemy2' | 'enemy3')[] = ['player', 'enemy1', 'enemy2', 'enemy3'];

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' }
  });

  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', activeRooms: rooms.size });
  });

  io.on('connection', (socket: Socket) => {
    let currentRoomCode: string | null = null;

    socket.on('create-room', ({ playerName }: { playerName: string }, callback: Function) => {
      const code = generateRoomCode();
      const hostPlayer: RoomPlayer = {
        id: socket.id,
        name: playerName || 'ホスト',
        actor: 'player',
        isReady: true,
        isHost: true,
        isCpu: false
      };

      const room: Room = {
        code,
        hostId: socket.id,
        players: [hostPlayer],
        status: 'waiting',
        gameState: null,
        lastActivity: Date.now(),
        settings: DEFAULT_GAME_SETTINGS,
        chatMessages: [{
          id: `sys_${Date.now()}`,
          senderName: 'システム',
          senderActor: 'player',
          text: `ルーム [${code}] が作成されました！`,
          timestamp: Date.now(),
          isSystem: true
        }]
      };

      rooms.set(code, room);
      currentRoomCode = code;
      socket.join(code);

      callback({ success: true, roomCode: code, playerActor: 'player', room });
      io.to(code).emit('room-updated', room);
    });

    socket.on('join-room', ({ roomCode, playerName }: { roomCode: string; playerName: string }, callback: Function) => {
      const formattedCode = (roomCode || '').trim().toUpperCase();
      const room = rooms.get(formattedCode);

      if (!room) {
        return callback({ success: false, error: '指定されたルームコードが見つかりません。' });
      }

      if (room.status === 'in_game') {
        return callback({ success: false, error: 'このルームはすでにゲームが開始されています。' });
      }

      const occupiedActors = new Set(room.players.map(p => p.actor));
      const availableActor = ACTORS.find(a => !occupiedActors.has(a));

      if (!availableActor) {
        return callback({ success: false, error: 'このルームは満員です (最大4人)。' });
      }

      const newPlayer: RoomPlayer = {
        id: socket.id,
        name: playerName || `プレイヤー ${room.players.length + 1}`,
        actor: availableActor,
        isReady: false,
        isHost: false,
        isCpu: false
      };

      room.players.push(newPlayer);
      currentRoomCode = formattedCode;
      socket.join(formattedCode);
      touch(room);

      room.chatMessages.push({
        id: `sys_${Date.now()}`,
        senderName: 'システム',
        senderActor: availableActor,
        text: `${newPlayer.name} が参加しました。`,
        timestamp: Date.now(),
        isSystem: true
      });

      callback({ success: true, roomCode: formattedCode, playerActor: availableActor, room });
      io.to(formattedCode).emit('room-updated', room);
    });

    socket.on('toggle-ready', () => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const player = room.players.find(p => p.id === socket.id);
      if (player && !player.isHost) {
        player.isReady = !player.isReady;
        touch(room);
        io.to(currentRoomCode).emit('room-updated', room);
      }
    });

    socket.on('update-room-settings', ({ settings }: { settings: GameSettings }) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.status !== 'waiting') return;
      if (room.hostId !== socket.id) return;
      if (!isValidGameSettings(settings)) return;

      room.settings = settings;
      touch(room);
      io.to(currentRoomCode).emit('room-updated', room);
    });

    socket.on('start-game', ({ initialGameState }: { initialGameState: any }) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== socket.id) return;

      room.status = 'in_game';
      room.gameState = initialGameState;
      touch(room);

      room.chatMessages.push({
        id: `sys_${Date.now()}`,
        senderName: 'システム',
        senderActor: 'player',
        text: '対戦が開始されました！健闘を祈ります。',
        timestamp: Date.now(),
        isSystem: true
      });

      io.to(currentRoomCode).emit('game-started', { gameState: initialGameState, room });
    });

    socket.on('sync-game-state', ({ gameState }: { gameState: any }) => {
      if (!currentRoomCode || !isPlainObject(gameState)) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      // Only a player actually seated in this room may push state into it.
      if (!room.players.some(p => p.id === socket.id)) return;

      // A hand payload that doesn't conserve cards (extra/duplicated ids) is either
      // a bug or a spoofed update — drop it rather than corrupting everyone's game.
      if (gameState.hands !== undefined && !isValidHandsPayload(gameState.hands)) {
        console.warn(`[sync-game-state] rejected invalid hands payload from ${socket.id} in room ${currentRoomCode}`);
        return;
      }

      const merged: any = { ...gameState };
      for (const field of PER_ACTOR_MERGE_FIELDS) {
        if (isPlainObject(gameState[field])) {
          merged[field] = {
            ...(isPlainObject(room.gameState?.[field]) ? room.gameState[field] : {}),
            ...gameState[field]
          };
        }
      }

      room.gameState = {
        ...room.gameState,
        ...merged
      };

      if (gameState.screenEffect === null) {
        room.gameState.screenEffect = null;
      }

      touch(room);
      io.to(currentRoomCode).emit('game-state-synced', room.gameState);
    });

    socket.on('player-phase-ready', ({ phase, data }: { phase: string; data?: any }) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      if (!room.phaseReadyMap) {
        room.phaseReadyMap = {};
      }
      if (!room.phaseReadyMap[phase]) {
        room.phaseReadyMap[phase] = new Set<string>();
      }

      room.phaseReadyMap[phase].add(socket.id);
      touch(room);

      const humanPlayers = room.players.filter(p => !p.isCpu);
      const totalHumans = humanPlayers.length;
      const readyCount = room.phaseReadyMap[phase].size;

      io.to(currentRoomCode).emit('phase-ready-updated', {
        phase,
        readyCount,
        totalCount: totalHumans
      });

      if (readyCount >= totalHumans) {
        delete room.phaseReadyMap[phase];
        io.to(currentRoomCode).emit('all-players-phase-ready', {
          phase,
          data
        });
      }
    });

    socket.on('send-chat', ({ text }: { text: string }) => {
      if (!currentRoomCode || !text.trim()) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      const msg: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random()}`,
        senderName: player.name,
        senderActor: player.actor,
        text: text.trim().slice(0, 100),
        timestamp: Date.now()
      };

      room.chatMessages.push(msg);
      if (room.chatMessages.length > 50) {
        room.chatMessages.shift();
      }
      touch(room);

      io.to(currentRoomCode).emit('chat-received', msg);
    });

    socket.on('disband-room', ({ reason }: { reason?: string } = {}) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const disbandReason = reason || 'ロビーが解散されました。';
      io.to(currentRoomCode).emit('room-disbanded', { reason: disbandReason });
      rooms.delete(currentRoomCode);
      currentRoomCode = null;
    });

    socket.on('leave-room', () => {
      handleDisconnect();
    });

    socket.on('disconnect', () => {
      handleDisconnect();
    });

    function handleDisconnect() {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const leavingPlayer = room.players.find(p => p.id === socket.id);
      if (!leavingPlayer) {
        currentRoomCode = null;
        return;
      }

      socket.leave(currentRoomCode);

      if (room.status === 'waiting') {
        if (leavingPlayer.isHost) {
          io.to(currentRoomCode).emit('room-disbanded', {
            reason: 'ホストが退室したため、ルームが解散されました。'
          });
          rooms.delete(currentRoomCode);
        } else {
          room.players = room.players.filter(p => p.id !== socket.id);
          room.chatMessages.push({
            id: `sys_${Date.now()}`,
            senderName: 'システム',
            senderActor: leavingPlayer.actor,
            text: `${leavingPlayer.name} が退室しました。`,
            timestamp: Date.now(),
            isSystem: true
          });
          touch(room);
          io.to(currentRoomCode).emit('room-updated', room);
        }
      } else {
        // A mid-game disconnect shouldn't end the match for everyone else — hand the
        // seat to CPU control (existing isCpuActor/AI logic on the host's client
        // already knows how to play a CPU-controlled seat) and keep the game going.
        const rawName = leavingPlayer.name.replace(' (CPU)', '');
        leavingPlayer.isCpu = true;
        leavingPlayer.name = `${rawName} (CPU)`;
        leavingPlayer.isReady = true;

        let newHostName: string | null = null;
        if (leavingPlayer.isHost) {
          leavingPlayer.isHost = false;
          const nextHost = room.players.find(p => p.id !== socket.id && !p.isCpu);
          if (nextHost) {
            nextHost.isHost = true;
            room.hostId = nextHost.id;
            newHostName = nextHost.name;
          }
        }

        const remainingHumans = room.players.filter(p => !p.isCpu);
        if (remainingHumans.length === 0) {
          io.to(currentRoomCode).emit('room-disbanded', {
            reason: '全プレイヤーが退出したため、対戦を終了しました。'
          });
          rooms.delete(currentRoomCode);
          currentRoomCode = null;
          return;
        }

        const message = newHostName
          ? `${rawName} が通信切断（離脱）したため、CPUが代打します。ホスト権限は ${newHostName} に移譲されました。`
          : `${rawName} が通信切断（離脱）したため、CPUが代打します。`;

        room.chatMessages.push({
          id: `sys_${Date.now()}`,
          senderName: 'システム',
          senderActor: leavingPlayer.actor,
          text: message,
          timestamp: Date.now(),
          isSystem: true
        });
        touch(room);

        io.to(currentRoomCode).emit('room-updated', room);
        io.to(currentRoomCode).emit('player-left-game', {
          leavingPlayer,
          room,
          message
        });
      }

      currentRoomCode = null;
    }
  });

  // Periodically sweep rooms nobody is actually in anymore (e.g. all sockets dropped
  // without a clean disconnect) or that have sat idle for hours, so the in-memory
  // room map doesn't grow unbounded over the server's lifetime.
  const ROOM_IDLE_LIMIT_MS = 3 * 60 * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const hasHuman = room.players.some(p => !p.isCpu);
      const isStale = now - room.lastActivity > ROOM_IDLE_LIMIT_MS;
      if (!hasHuman || isStale) {
        io.to(code).emit('room-disbanded', {
          reason: isStale ? '長時間操作がなかったため、ルームを終了しました。' : '対戦相手がいなくなったため、ルームを終了しました。'
        });
        rooms.delete(code);
      }
    }
  }, 10 * 60 * 1000);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Multiplayer Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
