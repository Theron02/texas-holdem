import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { io as connect } from "socket.io-client";
import { createGameServer, type GameServer } from "./server.ts";

/** 빌드된 클라이언트 흉내 */
function fakeClientDist(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "holdem-dist-"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>홀덤</title>");
  writeFileSync(path.join(dir, "app.js"), "console.log('client');");
  return dir;
}

describe("클라이언트 정적 서빙", () => {
  let server: GameServer;
  let base: string;

  before(async () => {
    server = createGameServer({ clientDist: fakeClientDist() });
    const port = await server.listen(0);
    base = `http://localhost:${port}`;
  });

  after(async () => {
    await server.close();
  });

  it("루트로 들어오면 index.html을 준다", async () => {
    const res = await fetch(base);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /홀덤/);
  });

  it("정적 자산을 그대로 준다", async () => {
    const res = await fetch(`${base}/app.js`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /console\.log/);
  });

  it("SPA 폴백이 걸려도 /health는 여전히 JSON이다", async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.headers.get("content-type")?.includes("json"), true);
    assert.deepEqual(await res.json(), { ok: true, rooms: 0 });
  });

  it("없는 경로는 index.html로 폴백한다", async () => {
    const res = await fetch(`${base}/아무거나/없는/경로`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /홀덤/);
  });

  it("SPA 폴백이 소켓 연결을 가로채지 않는다", async () => {
    const socket = connect(base, { transports: ["websocket"] });
    try {
      const connected = await new Promise<boolean>((resolve) => {
        socket.on("connect", () => resolve(true));
        socket.on("connect_error", () => resolve(false));
        setTimeout(() => resolve(false), 3000);
      });
      assert.equal(connected, true, "같은 출처에서 소켓이 붙어야 한다");

      // 실제로 방까지 만들어져야 진짜로 살아 있는 것
      const ack = await new Promise<{ ok: boolean }>((resolve) => {
        socket.emit(
          "room:create",
          { name: "지수", playerId: "same-origin-1", mode: "tournament" },
          resolve
        );
      });
      assert.equal(ack.ok, true);
    } finally {
      socket.close();
    }
  });
});

describe("클라이언트 빌드가 없을 때", () => {
  let server: GameServer;
  let base: string;

  before(async () => {
    // 개발 모드: 클라이언트는 Vite가 따로 띄운다
    server = createGameServer({ clientDist: null });
    const port = await server.listen(0);
    base = `http://localhost:${port}`;
  });

  after(async () => {
    await server.close();
  });

  it("정적 서빙을 하지 않고 API만 살아 있다", async () => {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(base)).status, 404, "서빙할 클라이언트가 없다");
  });
});
