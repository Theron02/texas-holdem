import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import type {
  Ack, Card, ChatMessage, RoomState, ShowdownResult, ShowdownReveal,
} from "../../../shared/types.ts";
import { createGameServer, type GameServer } from "../server.ts";

let server: GameServer;
let port: number;

before(async () => {
  server = createGameServer({
    roomDefaults: {
      turnTimeoutMs: 0,
      nextHandDelayMs: 60_000,
      startingChips: 500,
      // 소켓 계층을 보는 테스트라 블라인드는 고정해 둔다
      fixedBlinds: { smallBlind: 10, bigBlind: 20 },
    },
  });
  port = await server.listen(0);
});

after(async () => {
  await server.close();
});

/** 한 명의 클라이언트. 받은 상태와 홀카드를 기록해 둔다. */
class TestClient {
  socket: Socket;
  state: RoomState | null = null;
  hole: Card[] | null = null;
  /** 이 소켓이 받은 모든 room:state의 원본 JSON — 카드 유출 검사용 */
  rawStates: string[] = [];
  chat: ChatMessage[] = [];
  showdown: ShowdownResult | null = null;
  lateReveals: ShowdownReveal[] = [];

  constructor(readonly playerId: string, readonly name: string, port: number) {
    this.socket = connect(`http://localhost:${port}`, { transports: ["websocket"] });
    this.socket.on("room:state", (s: RoomState) => {
      this.state = s;
      this.rawStates.push(JSON.stringify(s));
    });
    this.socket.on("deal:hole", (p: { cards: Card[] }) => {
      this.hole = p.cards;
    });
    this.socket.on("chat:message", (m: unknown) => {
      this.chat.push(m as ChatMessage);
    });
    this.socket.on("showdown:result", (r: unknown) => {
      this.showdown = r as ShowdownResult;
    });
    this.socket.on("showdown:reveal", (r: unknown) => {
      this.lateReveals.push(r as ShowdownReveal);
    });
  }

  emit<T>(event: string, ...args: unknown[]): Promise<Ack<T>> {
    return new Promise((resolve) => {
      this.socket.emit(event, ...args, resolve);
    });
  }

  waitFor(pred: () => boolean, label: string, timeoutMs = 2000): Promise<void> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (pred()) return resolve();
        if (Date.now() - started > timeoutMs) return reject(new Error(`타임아웃: ${label}`));
        setTimeout(tick, 10);
      };
      tick();
    });
  }

  close() {
    this.socket.close();
  }
}

const key = (c: Card) => `${c.rank}${c.suit}`;

describe("소켓 통합", () => {
  it("방을 만들고 코드로 입장한다", async () => {
    const host = new TestClient("u1", "호스트", port);
    const res = await host.emit<{ roomId: string }>("room:create", {
      name: "호스트", playerId: "u1", mode: "tournament",
    });
    assert.equal(res.ok, true);
    const roomId = (res as { ok: true; data: { roomId: string } }).data.roomId;
    assert.match(roomId, /^[A-Z2-9]{6}$/);

    const guest = new TestClient("u2", "손님", port);
    const joined = await guest.emit("room:join", {
      roomId, name: "손님", playerId: "u2",
    });
    assert.equal(joined.ok, true);

    await host.waitFor(() => (host.state?.players.length ?? 0) === 2, "두 명 입장");
    assert.equal(host.state!.hostId, "u1");
    host.close();
    guest.close();
  });

  it("없는 방 코드는 거부한다", async () => {
    const c = new TestClient("u9", "x", port);
    const res = await c.emit("room:join", { roomId: "ZZZZZZ", name: "x", playerId: "u9" });
    assert.deepEqual(res, { ok: false, error: "그런 방이 없습니다" });
    c.close();
  });

  it("방장이 아니면 게임을 시작할 수 없다", async () => {
    const host = new TestClient("h1", "호스트", port);
    const r = await host.emit<{ roomId: string }>("room:create", { name: "호스트", playerId: "h1", mode: "tournament" });
    const roomId = (r as { ok: true; data: { roomId: string } }).data.roomId;
    const guest = new TestClient("g1", "손님", port);
    await guest.emit("room:join", { roomId, name: "손님", playerId: "g1" });
    await guest.waitFor(() => guest.state !== null, "상태 수신");

    const res = await guest.emit("room:start");
    assert.deepEqual(res, { ok: false, error: "방장만 게임을 시작할 수 있습니다" });
    host.close();
    guest.close();
  });

  it("혼자서는 시작할 수 없다", async () => {
    const host = new TestClient("s1", "혼자", port);
    await host.emit("room:create", { name: "혼자", playerId: "s1", mode: "tournament" });
    const res = await host.emit("room:start");
    assert.deepEqual(res, { ok: false, error: "2명 이상이어야 시작할 수 있습니다" });
    host.close();
  });

  it("3명이 한 핸드를 끝까지 완주한다 + 남의 카드는 네트워크로 나가지 않는다", async (t) => {
    const clients: TestClient[] = [];
    t.after(() => clients.forEach((c) => c.close()));
    const host = new TestClient("a1", "A", port);
    clients.push(host);
    const r = await host.emit<{ roomId: string }>("room:create", { name: "A", playerId: "a1", mode: "tournament" });
    const roomId = (r as { ok: true; data: { roomId: string } }).data.roomId;

    for (const [id, name] of [["b1", "B"], ["c1", "C"]] as const) {
      const c = new TestClient(id, name, port);
      clients.push(c);
      await c.emit("room:join", { roomId, name, playerId: id });
    }
    await host.waitFor(() => (host.state?.players.length ?? 0) === 3, "세 명 입장");

    let showdown: unknown = null;
    host.socket.on("showdown:result", (res: unknown) => { showdown = res; });

    const start = await host.emit("room:start");
    assert.equal(start.ok, true);
    await host.waitFor(() => host.hole !== null, "홀카드 수신");

    // 전원이 자기 홀카드 2장을 받았고, 서로 겹치지 않는다
    for (const c of clients) {
      await c.waitFor(() => c.hole !== null, `${c.name} 홀카드`);
      assert.equal(c.hole!.length, 2);
    }
    const allHole = clients.flatMap((c) => c.hole!.map(key));
    assert.equal(new Set(allHole).size, 6, "6장이 모두 달라야 한다");

    // 쇼다운까지 패시브하게 플레이.
    // 호스트가 본 currentTurn을 고정해두고 그 사람을 기다리면, 그 사이 턴이 옮겨갔을 때
    // 영원히 기다리게 된다. 매번 "지금 행동할 수 있는 사람"을 다시 찾는다.
    const readyActor = () =>
      clients.find(
        (c) => c.state?.currentTurn === c.playerId && c.state?.legalActions != null
      );

    let guard = 0;
    while (showdown === null && guard++ < 60) {
      const actor = readyActor();
      if (!actor) { await new Promise((r) => setTimeout(r, 20)); continue; }
      const legal = actor.state!.legalActions!;
      const res = await actor.emit("player:action", {
        type: legal.canCheck ? "check" : "call",
      });
      assert.equal(res.ok, true, `액션 거부됨: ${JSON.stringify(res)}`);
    }

    assert.notEqual(showdown, null, "쇼다운 결과를 받아야 한다");
    await host.waitFor(() => host.state?.phase === "showdown", "쇼다운 상태");
    assert.equal(host.state!.communityCards.length, 5);
    assert.equal(
      host.state!.players.reduce((s, p) => s + p.chips, 0),
      1500,
      "칩 총합 보존"
    );

    // 핵심: 쇼다운 이전에 받은 상태 어디에도 남의 홀카드가 없어야 한다
    for (const c of clients) {
      const others = clients.filter((o) => o !== c);
      // 마지막 상태(쇼다운 후)는 공개가 정상이므로 제외한다
      for (const raw of c.rawStates) {
        const parsed = JSON.parse(raw) as RoomState;
          // 쇼다운 후 공개는 정상. 딜링 전(waiting)이나 전원 입장 전 상태는 검사 대상이 아니다.
        if (parsed.phase === "showdown" || parsed.phase === "waiting") continue;
        if (parsed.players.length < 3) continue;
        for (const o of others) {
          const seen = parsed.players.find((p) => p.id === o.playerId)!;
          assert.equal(seen.cards, null, `${c.name}가 ${o.name}의 카드를 봤다`);
        }
        assert.equal(
          parsed.players.find((p) => p.id === c.playerId)!.cards?.length,
          2,
          "자기 카드는 보여야 한다"
        );
      }
    }

  });

  it("게임 방식을 고르지 않으면 방을 만들 수 없다", async (t) => {
    const c = new TestClient("m0", "x", port);
    t.after(() => c.close());
    const res = await c.emit("room:create", {
      name: "x", playerId: "m0", mode: "cash" as never,
    });
    assert.deepEqual(res, { ok: false, error: "게임 방식을 골라주세요" });
  });

  it("모드에 따라 스타팅칩과 블라인드가 달라진다", async (t) => {
    const open: TestClient[] = [];
    t.after(() => open.forEach((c) => c.close()));

    // 이 테스트만 프리셋 그대로 보려고 별도 서버를 띄운다
    const solo = createGameServer({ roomDefaults: { turnTimeoutMs: 0 } });
    const soloPort = await solo.listen(0);
    t.after(() => solo.close());

    for (const [mode, chips, sb, bb] of [
      ["tournament", 3_000_000, 10_000, 20_000],
      ["timeattack", 5_000_000, 100_000, 100_000],
    ] as const) {
      const c = new TestClient(`u-${mode}`, "A", soloPort);
      open.push(c);
      await c.emit("room:create", { name: "A", playerId: `u-${mode}`, mode });
      await c.waitFor(() => c.state !== null, `${mode} 상태`);
      assert.equal(c.state!.players[0]!.chips, chips, `${mode} 스타팅칩`);
      assert.equal(c.state!.clock.mode, mode);
      assert.equal(c.state!.clock.smallBlind, sb);
      assert.equal(c.state!.clock.bigBlind, bb);
      assert.equal(c.state!.clock.level, 1);
    }
  });

  it("칩이 떨어지면 리바인해서 다시 들어온다", async (t) => {
    const open: TestClient[] = [];
    t.after(() => open.forEach((c) => c.close()));

    // 블라인드만으로 한 명이 털리도록 아주 작은 스택으로 시작
    const tiny = createGameServer({
      roomDefaults: {
        turnTimeoutMs: 0,
        // 무승부가 나오면 아무도 털리지 않으므로 다음 핸드가 바로 이어져야 한다
        nextHandDelayMs: 30,
        startingChips: 20,
        fixedBlinds: { smallBlind: 10, bigBlind: 20 },
      },
    });
    const tinyPort = await tiny.listen(0);
    t.after(() => tiny.close());

    const host = new TestClient("rb1", "A", tinyPort);
    open.push(host);
    const r = await host.emit<{ roomId: string }>("room:create", {
      name: "A", playerId: "rb1", mode: "tournament",
    });
    const roomId = (r as { ok: true; data: { roomId: string } }).data.roomId;
    const guest = new TestClient("rb2", "B", tinyPort);
    open.push(guest);
    await guest.emit("room:join", { roomId, name: "B", playerId: "rb2" });
    await host.waitFor(() => (host.state?.players.length ?? 0) === 2, "입장");

    await host.emit("room:start");

    // 한쪽이 털릴 때까지 올인 핸드를 반복한다.
    // 무승부면 팟이 갈려 둘 다 살아남으므로 한 판으로는 보장되지 않는다.
    //
    // 판정 신호로 chips === 0을 쓰면 안 된다 — 올인한 순간 칩이 0이 되므로
    // 핸드가 끝나기도 전에 참이 된다. canRebuy는 서버가 핸드를 정산한 뒤에만 켠다.
    const settled = () => [host, guest].some((c) => c.state?.canRebuy === true);

    let guard = 0;
    while (!settled() && guard++ < 300) {
      const turnId = host.state?.currentTurn ?? null;
      if (!turnId) {
        await new Promise((res) => setTimeout(res, 15));
        continue;
      }
      const actor = [host, guest].find((c) => c.playerId === turnId)!;
      await actor.waitFor(() => actor.state?.legalActions != null, "차례");
      await actor.emit("player:action", { type: "allin" });
    }
    assert.ok(settled(), "한 명은 칩이 0이 된 채로 핸드가 끝나야 한다");

    // 양쪽 모두 쇼다운 상태를 받은 뒤에 판단해야 한다 (한쪽만 기다리면 경쟁 조건)
    await Promise.all(
      [host, guest].map((c) =>
        c.waitFor(() => c.state?.phase === "showdown", `${c.name} 쇼다운`)
      )
    );

    const loser = [host, guest].find(
      (c) => c.state!.players.find((p) => p.id === c.playerId)!.chips === 0
    );
    assert.ok(loser, "털린 쪽의 상태를 찾아야 한다");
    assert.equal(loser.state!.canRebuy, true, "리바인할 수 있어야 한다");

    const res = await loser.emit("player:rebuy");
    assert.equal(res.ok, true, JSON.stringify(res));
    await loser.waitFor(
      () => loser.state!.players.find((p) => p.id === loser.playerId)!.chips > 0,
      "리바인 반영"
    );
    const me = loser.state!.players.find((p) => p.id === loser.playerId)!;
    assert.equal(me.chips, 4_000_000, "토너먼트 리바인은 400만");
    assert.equal(me.rebuysLeft, 1, "2회 중 1회 사용");
  });

  it("칩이 남아 있으면 리바인이 거부된다", async (t) => {
    const c = new TestClient("nb1", "A", port);
    t.after(() => c.close());
    await c.emit("room:create", { name: "A", playerId: "nb1", mode: "tournament" });
    await c.waitFor(() => c.state !== null, "상태");
    const res = await c.emit("player:rebuy");
    assert.equal(res.ok, false);
  });

  it("채팅이 같은 방 전원에게 전달된다", async (t) => {
    const open: TestClient[] = [];
    t.after(() => open.forEach((c) => c.close()));

    const host = new TestClient("ch1", "지수", port);
    open.push(host);
    const r = await host.emit<{ roomId: string }>("room:create", {
      name: "지수", playerId: "ch1", mode: "tournament",
    });
    const roomId = (r as { ok: true; data: { roomId: string } }).data.roomId;
    const guest = new TestClient("ch2", "민준", port);
    open.push(guest);
    await guest.emit("room:join", { roomId, name: "민준", playerId: "ch2" });
    await host.waitFor(() => (host.state?.players.length ?? 0) === 2, "입장");

    const res = await host.emit("chat:send", { text: "  안녕하세요  " });
    assert.equal(res.ok, true);

    await guest.waitFor(() => guest.chat.length > 0, "상대가 채팅 수신");
    const msg = guest.chat[0]!;
    assert.equal(msg.text, "안녕하세요", "앞뒤 공백은 다듬는다");
    assert.equal(msg.name, "지수");
    assert.equal(msg.playerId, "ch1");
    assert.equal(msg.spectator, false);
    await host.waitFor(() => host.chat.length > 0, "보낸 사람도 받는다");
  });

  it("빈 메시지와 너무 긴 메시지는 거부된다", async (t) => {
    const c = new TestClient("ch9", "지수", port);
    t.after(() => c.close());
    await c.emit("room:create", { name: "지수", playerId: "ch9", mode: "tournament" });
    await c.waitFor(() => c.state !== null, "상태");

    assert.equal((await c.emit("chat:send", { text: "   " })).ok, false);
    const long = await c.emit("chat:send", { text: "가".repeat(201) });
    assert.equal(long.ok, false);
    assert.equal((await c.emit("chat:send", { text: "가".repeat(200) })).ok, true);
  });

  it("테이블에서 내려가면 관전자가 되고 채팅에 표시된다", async (t) => {
    const open: TestClient[] = [];
    t.after(() => open.forEach((c) => c.close()));

    const host = new TestClient("sp1", "지수", port);
    open.push(host);
    const r = await host.emit<{ roomId: string }>("room:create", {
      name: "지수", playerId: "sp1", mode: "tournament",
    });
    const roomId = (r as { ok: true; data: { roomId: string } }).data.roomId;
    const guest = new TestClient("sp2", "민준", port);
    open.push(guest);
    await guest.emit("room:join", { roomId, name: "민준", playerId: "sp2" });
    await host.waitFor(() => (host.state?.players.length ?? 0) === 2, "입장");

    assert.equal((await guest.emit("table:leave")).ok, true);
    await host.waitFor(
      () => host.state!.players.find((p) => p.id === "sp2")?.spectating === true,
      "관전 상태 반영"
    );
    const seen = host.state!.players.find((p) => p.id === "sp2")!;
    assert.equal(seen.chips, 0, "남은 칩은 사라진다");

    await guest.emit("chat:send", { text: "잘 치세요" });
    await host.waitFor(() => host.chat.length > 0, "관전자 채팅 수신");
    assert.equal(host.chat[0]!.spectator, true, "관전자 표시가 붙는다");
  });

  it("관전자는 리바인해서 테이블로 돌아온다", async (t) => {
    const open: TestClient[] = [];
    t.after(() => open.forEach((c) => c.close()));

    const host = new TestClient("rb9", "지수", port);
    open.push(host);
    await host.emit("room:create", { name: "지수", playerId: "rb9", mode: "tournament" });
    await host.waitFor(() => host.state !== null, "상태");

    assert.equal((await host.emit("table:leave")).ok, true);
    await host.waitFor(() => host.state?.canRebuy === true, "리바인 가능");

    assert.equal((await host.emit("player:rebuy")).ok, true);
    await host.waitFor(
      () => host.state!.players.find((p) => p.id === "rb9")?.spectating === false,
      "테이블 복귀"
    );
  });

  it("이긴 핸드만 공개되고, 진 사람은 스스로 공개할 수 있다", async (t) => {
    const open: TestClient[] = [];
    t.after(() => open.forEach((c) => c.close()));

    // 올인 없이 끝까지 가도록 스택을 넉넉히 두고 다음 핸드는 늦춘다
    const srv = createGameServer({
      roomDefaults: {
        turnTimeoutMs: 0,
        nextHandDelayMs: 60_000,
        startingChips: 100_000,
        fixedBlinds: { smallBlind: 10, bigBlind: 20 },
      },
    });
    const p = await srv.listen(0);
    t.after(() => srv.close());

    const host = new TestClient("sh1", "A", p);
    open.push(host);
    const r = await host.emit<{ roomId: string }>("room:create", {
      name: "A", playerId: "sh1", mode: "tournament",
    });
    const roomId = (r as { ok: true; data: { roomId: string } }).data.roomId;
    for (const [id, name] of [["sh2", "B"], ["sh3", "C"]] as const) {
      const c = new TestClient(id, name, p);
      open.push(c);
      await c.emit("room:join", { roomId, name, playerId: id });
    }
    await host.waitFor(() => (host.state?.players.length ?? 0) === 3, "세 명 입장");
    await host.emit("room:start");

    // 체크/콜만으로 리버까지
    const ready = () =>
      open.find((c) => c.state?.currentTurn === c.playerId && c.state?.legalActions);
    let guard = 0;
    while (host.showdown === null && guard++ < 80) {
      const actor = ready();
      if (!actor) { await new Promise((res) => setTimeout(res, 20)); continue; }
      await actor.emit("player:action", {
        type: actor.state!.legalActions!.canCheck ? "check" : "call",
      });
    }
    assert.notEqual(host.showdown, null, "쇼다운에 도달해야 한다");

    const winners = host.showdown!.winners;
    assert.deepEqual(
      host.showdown!.reveals.map((x) => x.playerId).sort(),
      [...winners].sort(),
      "이긴 핸드만 자동 공개된다"
    );

    const loser = open.find((c) => !winners.includes(c.playerId))!;
    assert.ok(loser, "진 사람이 있어야 한다");
    await loser.waitFor(() => loser.state?.canShowCards === true, "공개 선택 가능");

    // 공개 전에는 남에게 안 보인다
    const other = open.find((c) => c !== loser)!;
    assert.equal(
      other.state!.players.find((x) => x.id === loser.playerId)!.cards,
      null,
      "공개 전 카드가 새면 안 된다"
    );

    assert.equal((await loser.emit("hand:show")).ok, true);
    await other.waitFor(() => other.lateReveals.length > 0, "공개 이벤트 수신");
    assert.equal(other.lateReveals[0]!.playerId, loser.playerId);
    await other.waitFor(
      () => other.state!.players.find((x) => x.id === loser.playerId)?.cards != null,
      "카드가 상태에 반영"
    );

    // 두 번은 안 된다
    assert.equal((await loser.emit("hand:show")).ok, false);
  });

  it("승률은 요청한 본인 것만, 본인에게만 온다", async (t) => {
    const open: TestClient[] = [];
    t.after(() => open.forEach((c) => c.close()));

    const srv = createGameServer({
      roomDefaults: {
        turnTimeoutMs: 0,
        nextHandDelayMs: 60_000,
        startingChips: 100_000,
        fixedBlinds: { smallBlind: 10, bigBlind: 20 },
      },
    });
    const p = await srv.listen(0);
    t.after(() => srv.close());

    const host = new TestClient("eq1", "A", p);
    open.push(host);
    const r = await host.emit<{ roomId: string }>("room:create", {
      name: "A", playerId: "eq1", mode: "tournament",
    });
    const roomId = (r as { ok: true; data: { roomId: string } }).data.roomId;
    const guest = new TestClient("eq2", "B", p);
    open.push(guest);
    await guest.emit("room:join", { roomId, name: "B", playerId: "eq2" });
    await host.waitFor(() => (host.state?.players.length ?? 0) === 2, "입장");

    // 핸드 전에는 계산할 게 없다
    const before = await host.emit<null>("analysis:equity");
    assert.deepEqual(before, { ok: true, data: null });

    await host.emit("room:start");
    await host.waitFor(() => host.hole !== null, "홀카드");

    const res = await host.emit<{ win: number; tie: number; opponents: number }>(
      "analysis:equity"
    );
    assert.equal(res.ok, true);
    const eq = (res as { ok: true; data: { win: number; tie: number; opponents: number } }).data;
    assert.equal(eq.opponents, 1);
    assert.ok(eq.win >= 0 && eq.win <= 1, `승률 범위: ${eq.win}`);
    assert.ok(eq.win + eq.tie <= 1);

    // 승률은 "무작위 상대 가정"이라 두 사람 값의 합이 1이 되지는 않는다
    // (AA vs KK면 둘 다 높게 나온다). 대신 헤즈업에서 가능한 범위 안이어야 한다:
    // 최악의 핸드 72o가 약 34%, 최고인 AA가 약 85%다.
    const other = await guest.emit<{ win: number; tie: number }>("analysis:equity");
    const eq2 = (other as { ok: true; data: { win: number; tie: number } }).data;
    for (const [who, v] of [["A", eq], ["B", eq2]] as const) {
      const total = v.win + v.tie;
      assert.ok(
        total > 0.25 && total < 0.92,
        `${who} 승률이 헤즈업 범위를 벗어남: ${(total * 100).toFixed(1)}%`
      );
    }

    // 승률 응답에 카드가 실려 나가면 안 된다
    assert.deepEqual(
      Object.keys(eq).sort(),
      ["opponents", "tie", "win"],
      "승률 외에 다른 정보가 붙으면 안 된다"
    );
  });

  it("폴드한 사람은 승률을 받지 못한다", async (t) => {
    const open: TestClient[] = [];
    t.after(() => open.forEach((c) => c.close()));

    const host = new TestClient("fq1", "A", port);
    open.push(host);
    const r = await host.emit<{ roomId: string }>("room:create", {
      name: "A", playerId: "fq1", mode: "tournament",
    });
    const roomId = (r as { ok: true; data: { roomId: string } }).data.roomId;
    const guest = new TestClient("fq2", "B", port);
    open.push(guest);
    await guest.emit("room:join", { roomId, name: "B", playerId: "fq2" });
    await host.waitFor(() => (host.state?.players.length ?? 0) === 2, "입장");
    await host.emit("room:start");

    // 호스트 상태만 보고 고르면, 차례인 쪽의 상태가 아직 안 왔을 때 못 찾는다
    const ready = () =>
      [host, guest].find(
        (c) => c.state?.currentTurn === c.playerId && c.state?.legalActions
      );
    await host.waitFor(() => ready() !== undefined, "차례 도착");
    const actor = ready()!;
    await actor.emit("player:action", { type: "fold" });
    await actor.waitFor(
      () => actor.state!.players.find((x) => x.id === actor.playerId)!.folded,
      "폴드 반영"
    );

    const res = await actor.emit("analysis:equity");
    assert.deepEqual(res, { ok: true, data: null }, "폴드했으면 계산하지 않는다");
  });

  it("차례가 아닌 사람의 액션은 거부된다", async () => {
    const host = new TestClient("t1", "A", port);
    const r = await host.emit<{ roomId: string }>("room:create", { name: "A", playerId: "t1", mode: "tournament" });
    const roomId = (r as { ok: true; data: { roomId: string } }).data.roomId;
    const guest = new TestClient("t2", "B", port);
    await guest.emit("room:join", { roomId, name: "B", playerId: "t2" });
    await host.waitFor(() => (host.state?.players.length ?? 0) === 2, "입장");
    await host.emit("room:start");
    await host.waitFor(() => host.state?.currentTurn != null, "핸드 시작");

    const idle = [host, guest].find((c) => c.state!.currentTurn !== c.playerId)!;
    const res = await idle.emit("player:action", { type: "fold" });
    assert.equal(res.ok, false);
    host.close();
    guest.close();
  });

  it("방장이 새로고침해도 방 코드는 살아 있다", async (t) => {
    const open: TestClient[] = [];
    t.after(() => open.forEach((c) => c.close()));

    const host = new TestClient("f1", "혼자", port);
    const r = await host.emit<{ roomId: string }>("room:create", {
      name: "혼자", playerId: "f1", mode: "tournament",
    });
    const roomId = (r as { ok: true; data: { roomId: string } }).data.roomId;
    await host.waitFor(() => host.state !== null, "방 생성");

    // 새로고침 = 소켓이 끊겼다 다시 붙는 것
    host.close();
    await new Promise((res) => setTimeout(res, 120));

    const back = new TestClient("f1", "혼자", port);
    open.push(back);
    const res = await back.emit("room:join", { roomId, name: "혼자", playerId: "f1" });
    assert.equal(res.ok, true, "빈 방이 즉시 삭제되면 안 된다");
  });

  it("같은 playerId로 다시 붙으면 좌석과 칩을 되찾는다", async (t) => {
    const open: TestClient[] = [];
    t.after(() => open.forEach((c) => c.close()));
    const host = new TestClient("r1", "A", port);
    open.push(host);
    const r = await host.emit<{ roomId: string }>("room:create", { name: "A", playerId: "r1", mode: "tournament" });
    const roomId = (r as { ok: true; data: { roomId: string } }).data.roomId;
    const guest = new TestClient("r2", "B", port);
    await guest.emit("room:join", { roomId, name: "B", playerId: "r2" });
    await host.waitFor(() => (host.state?.players.length ?? 0) === 2, "입장");
    await host.emit("room:start");
    await host.waitFor(() => host.state?.currentTurn != null, "핸드 시작");

    // 블라인드가 빠진 뒤의 값이어야 하므로 호스트가 본 최신 상태를 기준으로 삼는다
    const chipsBefore = host.state!.players.find((p) => p.id === "r2")!.chips;
    guest.close();
    await host.waitFor(
      () => host.state!.players.find((p) => p.id === "r2")?.connected === false,
      "연결 끊김 반영"
    );

    const back = new TestClient("r2", "B", port);
    const res = await back.emit("room:join", { roomId, name: "B", playerId: "r2" });
    assert.equal(res.ok, true);
    await back.waitFor(() => back.state !== null, "재입장 상태");
    const me = back.state!.players.find((p) => p.id === "r2")!;
    assert.equal(me.connected, true);
    assert.equal(me.chips, chipsBefore, "칩이 유지되어야 한다");
    open.push(back);
  });
});
