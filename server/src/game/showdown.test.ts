import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ShowdownReveal, ShowdownResult } from "../../../shared/types.ts";
import { Room, type RoomEmitter } from "./room.ts";

function makeRoom(names: string[], chips = 100_000) {
  const room = new Room("T", "p0", {
    startingChips: chips,
    fixedBlinds: { smallBlind: 10, bigBlind: 20 },
    turnTimeoutMs: 0,
    nextHandDelayMs: 0,
  });
  const logs: string[] = [];
  const results: ShowdownResult[] = [];
  const reveals: ShowdownReveal[] = [];
  room.emitter = {
    state: () => {}, hole: () => {}, community: () => {},
    showdown: (r) => results.push(r),
    reveal: (r) => reveals.push(r),
    log: (t) => logs.push(t),
    clock: () => {}, finished: () => {},
  } satisfies RoomEmitter;
  names.forEach((n, i) => room.addPlayer(`p${i}`, n, `s${i}`));
  return { room, logs, results, reveals };
}

const turn = (r: Room) => r.currentTurn;

/** 올인 없이 체크/콜만으로 리버까지 간다 */
function playPassive(room: Room) {
  room.startHand();
  let guard = 0;
  while (room.phase !== "showdown" && turn(room) && guard++ < 60) {
    const p = room.players.find((x) => x.id === turn(room))!;
    room.act(p.id, { type: room.legalActionsFor(p).canCheck ? "check" : "call" });
  }
}

describe("쇼다운 공개 범위", () => {
  it("올인이 없으면 이긴 핸드만 자동 공개된다", () => {
    const { room, results } = makeRoom(["A", "B", "C"]);
    playPassive(room);
    assert.equal(room.phase, "showdown");

    const result = results.at(-1)!;
    const winners = new Set(result.winners);
    assert.ok(winners.size >= 1);
    assert.deepEqual(
      result.reveals.map((r) => r.playerId).sort(),
      [...winners].sort(),
      "공개된 핸드는 이긴 핸드뿐이어야 한다"
    );

    // 진 사람의 카드는 남에게 보이지 않는다
    const state = room.toPublicState("p0");
    for (const p of state.players) {
      const isWinner = winners.has(p.id);
      const isMe = p.id === "p0";
      if (!isWinner && !isMe) {
        assert.equal(p.cards, null, `${p.name}의 카드가 새면 안 된다`);
      }
    }
  });

  it("올인이 걸린 핸드는 전원 공개된다", () => {
    const { room, results } = makeRoom(["A", "B"]);
    room.startHand();
    while (room.phase !== "showdown" && turn(room)) {
      room.act(turn(room)!, { type: "allin" });
    }
    const result = results.at(-1)!;
    assert.equal(result.reveals.length, 2, "올인 쇼다운은 둘 다 공개");

    const state = room.toPublicState("p0");
    assert.ok(state.players.every((p) => p.cards?.length === 2));
  });

  it("전원 폴드로 끝나면 아무도 공개되지 않는다", () => {
    const { room, results } = makeRoom(["A", "B", "C"]);
    room.startHand();
    room.act(turn(room)!, { type: "fold" });
    room.act(turn(room)!, { type: "fold" });
    assert.equal(results.at(-1)!.reveals.length, 0);
  });

  it("진 사람은 스스로 카드를 공개할 수 있다", () => {
    const { room, results, reveals, logs } = makeRoom(["A", "B", "C"]);
    playPassive(room);

    const winners = new Set(results.at(-1)!.winners);
    const loser = room.players.find((p) => !winners.has(p.id) && !p.folded)!;
    assert.ok(loser, "진 사람이 있어야 한다");

    assert.equal(room.canShowCards(loser), true);
    assert.equal(room.toPublicState(loser.id).canShowCards, true);

    room.showCards(loser.id);
    assert.equal(reveals.length, 1);
    assert.equal(reveals[0]!.playerId, loser.id);
    assert.equal(reveals[0]!.cards.length, 2);
    assert.ok(logs.some((l) => l.includes("카드를 공개했습니다")));

    // 이제 다른 사람에게도 보인다
    const other = room.players.find((p) => p.id !== loser.id)!;
    const seen = room.toPublicState(other.id).players.find((p) => p.id === loser.id)!;
    assert.equal(seen.cards?.length, 2);
  });

  it("두 번 공개할 수는 없다", () => {
    const { room, results } = makeRoom(["A", "B", "C"]);
    playPassive(room);
    const winners = new Set(results.at(-1)!.winners);
    const loser = room.players.find((p) => !winners.has(p.id) && !p.folded)!;
    room.showCards(loser.id);
    assert.throws(() => room.showCards(loser.id), /이미 공개했습니다/);
  });

  it("이긴 사람은 공개 선택 대상이 아니다", () => {
    const { room, results } = makeRoom(["A", "B", "C"]);
    playPassive(room);
    const winner = room.players.find((p) => results.at(-1)!.winners.includes(p.id))!;
    assert.equal(room.canShowCards(winner), false);
    assert.throws(() => room.showCards(winner.id), /이미 공개했습니다/);
  });

  it("다음 핸드가 시작되면 공개 선택이 닫힌다", () => {
    const { room, results } = makeRoom(["A", "B", "C"]);
    playPassive(room);
    const winners = new Set(results.at(-1)!.winners);
    const loser = room.players.find((p) => !winners.has(p.id) && !p.folded)!;
    assert.equal(room.canShowCards(loser), true);

    room.startHand();
    assert.equal(room.canShowCards(loser), false, "새 핸드에서는 고를 수 없다");
  });
});

describe("접속 끊김 시 자동 액션", () => {
  it("낼 것이 있으면 자동 폴드한다", () => {
    const { room, logs } = makeRoom(["A", "B", "C"]);
    room.startHand();
    // 스몰블라인드는 빅블라인드를 콜해야 한다 → 끊겨 있으면 폴드
    const sb = room.players.find((p) => p.totalBet === 10)!;
    room.markDisconnected(sb.socketId!);

    // 연결된 UTG가 콜하면 차례가 끊긴 SB에게 넘어가고 즉시 처리된다
    const utg = room.players.find((p) => p.id === turn(room))!;
    assert.equal(utg.connected, true, "차례는 연결된 사람이어야 한다");
    room.act(utg.id, { type: "call" });

    assert.ok(
      logs.some((l) => l.includes(`${sb.name}: 접속 끊김 — 자동 폴드`)),
      `자동 폴드 로그가 없다: ${logs.join(" / ")}`
    );
    assert.equal(sb.folded, true);
  });

  it("낼 것이 없으면 자동 체크한다", () => {
    const { room, logs } = makeRoom(["A", "B", "C"]);
    room.startHand();
    // 빅블라인드는 콜이 들어오면 체크할 수 있다 → 끊겨 있으면 폴드가 아니라 체크
    const bb = room.players.find((p) => p.totalBet === 20)!;
    room.markDisconnected(bb.socketId!);

    room.act(turn(room)!, { type: "call" }); // UTG
    room.act(turn(room)!, { type: "call" }); // SB

    assert.ok(
      logs.some((l) => l.includes(`${bb.name}: 접속 끊김 — 자동 체크`)),
      `자동 체크 로그가 없다: ${logs.join(" / ")}`
    );
    assert.equal(bb.folded, false, "체크할 수 있으면 폴드하지 않는다");
    assert.equal(room.phase, "flop", "라운드가 정상적으로 넘어간다");
  });

  it("타임아웃을 기다리지 않고 즉시 처리한다", () => {
    // 45초 타임아웃이 걸려 있어도 끊긴 사람 때문에 핸드가 멈추면 안 된다
    const room = new Room("T", "p0", {
      startingChips: 100_000,
      fixedBlinds: { smallBlind: 10, bigBlind: 20 },
      turnTimeoutMs: 45_000,
      nextHandDelayMs: 0,
    });
    room.emitter = {
      state: () => {}, hole: () => {}, community: () => {}, showdown: () => {},
      reveal: () => {}, log: () => {}, clock: () => {}, finished: () => {},
    } satisfies RoomEmitter;
    ["A", "B", "C"].forEach((n, i) => room.addPlayer(`p${i}`, n, `s${i}`));

    room.startHand();
    room.markDisconnected("s1");
    room.markDisconnected("s2");

    // 남은 한 명만 액션하면 핸드가 끝까지 굴러가야 한다
    let guard = 0;
    while (room.phase !== "showdown" && turn(room) && guard++ < 30) {
      const p = room.players.find((x) => x.id === turn(room))!;
      assert.equal(p.connected, true, "끊긴 사람의 차례에서 멈추면 안 된다");
      room.act(p.id, { type: room.legalActionsFor(p).canCheck ? "check" : "call" });
    }
    assert.equal(room.phase, "showdown");
    room.dispose();
  });

  it("돌아온 사람은 자동 처리되지 않는다", () => {
    const { room, logs } = makeRoom(["A", "B", "C"]);
    room.startHand();
    const sb = room.players.find((p) => p.totalBet === 10)!;
    room.markDisconnected(sb.socketId!);
    room.addPlayer(sb.id, sb.name, "새소켓"); // 재접속

    room.act(turn(room)!, { type: "call" });
    assert.equal(turn(room), sb.id, "돌아왔으니 차례가 그대로 온다");
    assert.ok(
      !logs.some((l) => l.includes("접속 끊김")),
      "자동 처리되면 안 된다"
    );
  });
});
