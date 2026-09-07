import { existsSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";
import { RoomManager, type ManagerOptions } from "./game/roomManager.ts";
import { registerHandlers } from "./socket/handlers.ts";

/** 빌드된 클라이언트가 놓이는 자리. 있으면 서버가 같이 서빙한다. */
const DEFAULT_CLIENT_DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/dist"
);

export interface GameServer {
  httpServer: HttpServer;
  io: Server;
  manager: RoomManager;
  listen(port: number): Promise<number>;
  close(): Promise<void>;
}

export interface GameServerOptions {
  /** CORS 허용 출처. 클라이언트를 같이 서빙하면(같은 출처) 쓰이지 않는다. */
  clientOrigin?: string;
  roomDefaults?: ManagerOptions;
  /**
   * 서빙할 클라이언트 빌드 디렉터리.
   * 생략하면 `client/dist`를 쓰고, 없으면 서빙하지 않는다(개발 모드).
   * `null`을 주면 있어도 서빙하지 않는다.
   */
  clientDist?: string | null;
}

export function createGameServer(opts: GameServerOptions = {}): GameServer {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: opts.clientOrigin ?? "*", methods: ["GET", "POST"] },
  });

  const manager = new RoomManager(opts.roomDefaults);
  registerHandlers(io as never, manager);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: manager.count });
  });

  // 빌드된 클라이언트를 같은 서버에서 서빙한다 — 주소가 하나라 CORS가 필요 없다.
  // 개발 중에는 client/dist가 없으므로 아무 일도 하지 않고, 클라이언트는 Vite가 띄운다.
  const clientDist =
    opts.clientDist === null ? null : opts.clientDist ?? DEFAULT_CLIENT_DIST;

  if (clientDist && existsSync(path.join(clientDist, "index.html"))) {
    app.use(express.static(clientDist));
    // SPA 폴백. API 라우트를 모두 등록한 뒤에 와야 한다.
    // /socket.io/* 는 engine.io가 express보다 먼저 가로채므로 여기 걸리지 않는다.
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  return {
    httpServer,
    io,
    manager,
    listen: (port) =>
      new Promise((resolve) => {
        httpServer.listen(port, () => {
          const addr = httpServer.address();
          resolve(typeof addr === "object" && addr ? addr.port : port);
        });
      }),
    close: () =>
      new Promise((resolve) => {
        // 남아 있는 연결을 먼저 끊지 않으면 close()가 영원히 기다린다
        io.disconnectSockets(true);
        httpServer.closeAllConnections();
        manager.dispose();
        io.close(() => httpServer.close(() => resolve()));
      }),
  };
}
