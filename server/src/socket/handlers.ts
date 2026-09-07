import type { Server, Socket } from "socket.io";
import {
  CHAT_MAX_LENGTH,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "../../../shared/types.ts";
import type { Room } from "../game/room.ts";
import type { RoomManager } from "../game/roomManager.ts";

interface SocketData {
  playerId: string;
  roomId: string;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

const fail = (error: string): Ack<never> => ({ ok: false, error });

/** Room이 상태를 알릴 때 쓰는 소켓 어댑터. 마스킹은 Room.toPublicState가 담당한다. */
function attachEmitter(io: IO, room: Room): void {
  room.emitter = {
    state: () => {
      for (const p of room.players) {
        if (p.socketId) io.to(p.socketId).emit("room:state", room.toPublicState(p.id));
      }
    },
    hole: (playerId, cards) => {
      const p = room.players.find((x) => x.id === playerId);
      if (p?.socketId) io.to(p.socketId).emit("deal:hole", { cards });
    },
    community: (phase, cards) => {
      io.to(room.id).emit("deal:community", { phase, cards });
    },
    showdown: (result) => {
      io.to(room.id).emit("showdown:result", result);
    },
    reveal: (r) => {
      io.to(room.id).emit("showdown:reveal", r);
    },
    log: (text) => {
      io.to(room.id).emit("room:log", { text, at: Date.now() });
    },
    clock: (state) => {
      io.to(room.id).emit("clock:update", state);
    },
    finished: (standings) => {
      io.to(room.id).emit("game:finished", { standings });
    },
  };
}

export function registerHandlers(io: IO, manager: RoomManager): void {
  io.on("connection", (socket: Sock) => {
    const enter = (room: Room, playerId: string, name: string) => {
      const player = room.addPlayer(playerId, name, socket.id);
      socket.data.playerId = playerId;
      socket.data.roomId = room.id;
      socket.join(room.id);
      attachEmitter(io, room);
      room.emitter.log(`${player.name} 님이 입장했습니다`);
      room.emitter.state();
    };

    socket.on("room:create", ({ name, playerId, mode }, cb) => {
      try {
        if (!name?.trim() || !playerId) return cb(fail("이름이 필요합니다"));
        if (mode !== "tournament" && mode !== "timeattack") {
          return cb(fail("게임 방식을 골라주세요"));
        }
        const room = manager.create(playerId, { mode });
        enter(room, playerId, name.trim());
        cb({ ok: true, data: { roomId: room.id } });
      } catch (e) {
        cb(fail(errText(e)));
      }
    });

    socket.on("room:join", ({ roomId, name, playerId }, cb) => {
      try {
        if (!name?.trim() || !playerId) return cb(fail("이름이 필요합니다"));
        const room = manager.get(roomId ?? "");
        if (!room) return cb(fail("그런 방이 없습니다"));
        enter(room, playerId, name.trim());
        cb({ ok: true, data: { roomId: room.id } });
      } catch (e) {
        cb(fail(errText(e)));
      }
    });

    socket.on("room:start", (cb) => {
      const room = manager.get(socket.data.roomId ?? "");
      if (!room) return cb(fail("방에 들어와 있지 않습니다"));
      if (room.hostId !== socket.data.playerId) {
        return cb(fail("방장만 게임을 시작할 수 있습니다"));
      }
      if (room.phase !== "waiting" && room.phase !== "showdown") {
        return cb(fail("이미 진행 중인 핸드가 있습니다"));
      }
      if (room.finished) return cb(fail("게임이 이미 끝났습니다"));
      if (room.onBreak) return cb(fail("브레이크가 끝나면 자동으로 시작됩니다"));
      if (room.players.filter((p) => p.chips > 0).length < 2) {
        return cb(fail("2명 이상이어야 시작할 수 있습니다"));
      }
      room.startHand();
      cb({ ok: true, data: null });
    });

    socket.on("player:action", (action, cb) => {
      const room = manager.get(socket.data.roomId ?? "");
      if (!room) return cb(fail("방에 들어와 있지 않습니다"));
      try {
        room.act(socket.data.playerId, action);
        cb({ ok: true, data: null });
      } catch (e) {
        cb(fail(errText(e)));
      }
    });

    socket.on("player:rebuy", (cb) => {
      const room = manager.get(socket.data.roomId ?? "");
      if (!room) return cb(fail("방에 들어와 있지 않습니다"));
      try {
        room.rebuy(socket.data.playerId);
        cb({ ok: true, data: null });
      } catch (e) {
        cb(fail(errText(e)));
      }
    });

    socket.on("table:leave", (cb) => {
      const room = manager.get(socket.data.roomId ?? "");
      if (!room) return cb(fail("방에 들어와 있지 않습니다"));
      try {
        room.leaveTable(socket.data.playerId);
        cb({ ok: true, data: null });
      } catch (e) {
        cb(fail(errText(e)));
      }
    });

    socket.on("hand:show", (cb) => {
      const room = manager.get(socket.data.roomId ?? "");
      if (!room) return cb(fail("방에 들어와 있지 않습니다"));
      try {
        room.showCards(socket.data.playerId);
        cb({ ok: true, data: null });
      } catch (e) {
        cb(fail(errText(e)));
      }
    });

    socket.on("seat:take", ({ seat }, cb) => {
      const room = manager.get(socket.data.roomId ?? "");
      if (!room) return cb(fail("방에 들어와 있지 않습니다"));
      try {
        room.takeSeat(socket.data.playerId, seat);
        cb({ ok: true, data: null });
      } catch (e) {
        cb(fail(errText(e)));
      }
    });

    socket.on("chat:send", ({ text }, cb) => {
      const room = manager.get(socket.data.roomId ?? "");
      if (!room) return cb(fail("방에 들어와 있지 않습니다"));
      const trimmed = (text ?? "").trim();
      if (!trimmed) return cb(fail("빈 메시지는 보낼 수 없습니다"));
      if (trimmed.length > CHAT_MAX_LENGTH) {
        return cb(fail(`메시지는 ${CHAT_MAX_LENGTH}자까지입니다`));
      }
      const p = room.players.find((x) => x.id === socket.data.playerId);
      if (!p) return cb(fail("좌석을 찾을 수 없습니다"));

      io.to(room.id).emit("chat:message", {
        playerId: p.id,
        name: p.name,
        text: trimmed,
        at: Date.now(),
        spectator: p.spectating,
      });
      cb({ ok: true, data: null });
    });

    socket.on("room:leave", () => {
      leave(socket, manager);
    });

    socket.on("disconnect", () => {
      const room = manager.get(socket.data.roomId ?? "");
      if (!room) return;
      const p = room.markDisconnected(socket.id);
      if (p) {
        io.to(room.id).emit("player:disconnected", { playerId: p.id, name: p.name });
        room.emitter.log(`${p.name} 님의 접속이 끊겼습니다`);
        room.emitter.state();
      }
      // 대기 중이라면 좌석을 바로 비운다. 핸드 중이면 재접속을 기다린다.
      if (room.phase === "waiting" && p) {
        room.removePlayer(p.id);
        room.emitter.state();
        manager.destroyIfEmpty(room.id);
      }
    });
  });
}

function leave(socket: Sock, manager: RoomManager): void {
  const room = manager.get(socket.data.roomId ?? "");
  if (!room) return;
  room.removePlayer(socket.data.playerId);
  socket.leave(room.id);
  room.emitter.state();
  socket.data.roomId = "";
  manager.destroyIfEmpty(room.id);
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : "알 수 없는 오류";
}
