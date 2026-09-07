import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Room, type RoomEmitter } from "./room.ts";
import type { GameMode } from "../../../shared/types.ts";

function makeRoom(names: string[], mode: GameMode = "tournament", chips?: number) {
  const room = new Room("T", "p0", {
    mode,
    startingChips: chips,
    turnTimeoutMs: 0,
    nextHandDelayMs: 0,
  });
  const logs: string[] = [];
  const finished: unknown[] = [];
  const emitter: RoomEmitter = {
    state: () => {}, hole: () => {}, community: () => {}, showdown: () => {},
    log: (t) => logs.push(t),
    reveal: () => {},
    clock: () => {},
    finished: (s) => finished.push(s),
  };
  room.emitter = emitter;
  names.forEach((n, i) => room.addPlayer(`p${i}`, n, `s${i}`));
  return { room, logs, finished };
}

const turn = (r: Room) => r.currentTurn;

/** 전원 올인으로 한 핸드를 끝낸다. */
function playAllInHand(room: Room): void {
  room.startHand();
  let guard = 0;
  while (room.phase !== "showdown" && turn(room) && guard++ < 50) {
    room.act(turn(room)!, { type: "allin" });
  }
}

/**
 * 누군가 칩이 0이 될 때까지 올인 핸드를 반복한다.
 * 무승부면 팟이 갈려 아무도 털리지 않으므로 한 판으로는 보장되지 않는다.
 */
function playUntilBust(room: Room, maxHands = 60): void {
  for (let i = 0; i < maxHands; i++) {
    if (room.finished || room.players.some((p) => p.chips === 0)) return;
    playAllInHand(room);
  }
  throw new Error("아무도 털리지 않았습니다");
}
const bank = (r: Room) => r.players.reduce((s, p) => s + p.chips, 0);

/** 팟에 들어가 아직 나눠지지 않은 칩까지 포함한 총액 */
const inPlay = (r: Room) =>
  r.players.reduce((s, p) => s + p.chips + p.totalBet, 0) +
  (r.toPublicState("p0").totalPot -
    r.players.reduce((s, p) => s + p.totalBet, 0));

describe("토너먼트 — 기본값", () => {
  it("스타팅칩과 첫 블라인드가 프리셋을 따른다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    assert.equal(room.startingChips, 3_000_000);
    assert.equal(room.smallBlind, 10_000);
    assert.equal(room.bigBlind, 20_000);
    assert.equal(room.ante, 0, "레벨 1에는 앤티가 없다");
    assert.equal(room.players[0]!.chips, 3_000_000);
  });

  it("타임어택은 500만에 10만/10만으로 시작한다", () => {
    const { room } = makeRoom(["A", "B"], "timeattack");
    assert.equal(room.startingChips, 5_000_000);
    assert.equal(room.smallBlind, 100_000);
    assert.equal(room.bigBlind, 100_000);
  });

  it("각 플레이어는 리바인 2회가 남은 채로 시작한다", () => {
    const { room } = makeRoom(["A", "B"]);
    const me = room.toPublicState("p0").players.find((p) => p.id === "p0")!;
    assert.equal(me.rebuysLeft, 2, "총 3회 참가 - 최초 1회");
  });
});

describe("토너먼트 — 앤티", () => {
  /** 레벨 3(3만/6만, 앤티 6만)로 강제 이동 */
  function atLevel3(names: string[]) {
    const { room, logs } = makeRoom(names);
    room.levelIndex = 2;
    return { room, logs };
  }

  it("빅블라인드만 앤티를 내고 팟에 들어간다", () => {
    const { room } = atLevel3(["A", "B", "C"]);
    const before = bank(room);
    room.startHand();

    assert.equal(room.ante, 60_000);
    // 앤티를 낸 사람은 정확히 한 명(BB)이고, 그만큼 스택이 더 줄어 있다
    const spent = room.players.map((p) => before / 3 - p.chips);
    const total = spent.reduce((s, v) => s + v, 0);
    assert.equal(total, 30_000 + 60_000 + 60_000, "SB + BB + 앤티");
    assert.equal(room.toPublicState("p0").totalPot, 150_000);
  });

  it("앤티는 사이드팟을 만들지 않는다", () => {
    const { room } = atLevel3(["A", "B", "C"]);
    room.startHand();
    // 프리플랍 전원 콜 후 라운드 종료
    room.act(turn(room)!, { type: "call" });
    room.act(turn(room)!, { type: "call" });
    room.act(turn(room)!, { type: "check" });

    const state = room.toPublicState("p0");
    assert.equal(state.phase, "flop");
    assert.equal(state.pots.length, 1, "앤티 때문에 팟이 갈리면 안 된다");
    assert.equal(state.pots[0]!.amount, 60_000 * 3 + 60_000, "베팅 18만 + 앤티 6만");
    assert.deepEqual(state.pots[0]!.eligible.sort(), ["p0", "p1", "p2"]);
  });

  it("앤티가 포함되어도 칩 총합은 보존된다", () => {
    const { room } = atLevel3(["A", "B", "C", "D"]);
    const before = bank(room);
    room.startHand();
    let guard = 0;
    while (room.phase !== "showdown" && turn(room) && guard++ < 100) {
      const p = room.players.find((x) => x.id === turn(room))!;
      room.act(p.id, { type: room.legalActionsFor(p).canCheck ? "check" : "call" });
    }
    assert.equal(room.phase, "showdown");
    assert.equal(bank(room), before, "앤티까지 포함해 한 칩도 사라지면 안 된다");
  });
});

describe("토너먼트 — 리바인과 탈락", () => {
  it("칩이 0이 되면 리바인할 수 있고 400만을 받는다", () => {
    const { room } = makeRoom(["A", "B"], "tournament", 100_000);
    playUntilBust(room);
    const busted = room.players.find((p) => p.chips === 0)!;
    assert.ok(busted, "한 명은 털려 있어야 한다");
    assert.equal(busted.eliminated, false, "리바인이 남았으면 탈락이 아니다");
    assert.equal(room.canRebuy(busted), true);

    room.rebuy(busted.id);
    assert.equal(busted.chips, 4_000_000);
    assert.equal(room.rebuysLeftFor(busted), 1);
  });

  it("칩이 남아 있으면 리바인할 수 없다", () => {
    const { room } = makeRoom(["A", "B"]);
    assert.throws(() => room.rebuy("p0"), /칩이 다 떨어졌을 때만/);
  });

  it("리바인을 다 쓰고 칩이 0이면 탈락 처리된다", () => {
    const { room } = makeRoom(["A", "B", "C"], "tournament", 100_000);
    const victim = room.players.find((p) => p.id === "p2")!;
    // 리바인을 다 쓰고 칩이 떨어진 상태를 만든다
    victim.buyinsUsed = 3;
    victim.chips = 0;
    assert.equal(room.rebuysLeftFor(victim), 0);
    assert.equal(victim.eliminated, false, "아직 핸드가 끝나기 전");

    // 나머지 둘이 한 핸드를 끝내면 정산 시점에 탈락이 확정된다
    playAllInHand(room);

    assert.equal(victim.eliminated, true);
    assert.equal(victim.eliminatedAt, 1, "첫 번째 탈락자");
    assert.equal(room.canRebuy(victim), false);
    assert.throws(() => room.rebuy(victim.id), /이미 탈락했습니다|이미 끝났습니다/);
  });

  it("한 명만 남으면 게임이 끝나고 순위가 나온다", () => {
    const { room, finished } = makeRoom(["A", "B"], "tournament", 100_000);
    // 둘 다 리바인 없이 시작
    for (const p of room.players) p.buyinsUsed = 3;

    playUntilBust(room);

    assert.equal(room.finished, true, "우승자가 나오면 게임이 끝나야 한다");
    assert.equal(finished.length, 1, "game:finished가 한 번 나가야 한다");
    const standings = room.standings!;
    assert.equal(standings.length, 2);
    assert.equal(standings[0]!.rank, 1);
    assert.ok(standings[0]!.chips > standings[1]!.chips, "칩이 많은 쪽이 1위");
    assert.equal(standings[0]!.chips, 200_000, "우승자가 전부 가져간다");
  });

  it("게임이 끝나면 더 이상 핸드가 시작되지 않는다", () => {
    const { room } = makeRoom(["A", "B"], "tournament", 100_000);
    for (const p of room.players) p.buyinsUsed = 3;
    playUntilBust(room);
    const handNumber = room.handNumber;
    room.startHand();
    assert.equal(room.handNumber, handNumber, "종료 후에는 새 핸드가 없다");
    assert.throws(() => room.rebuy("p0"), /이미 끝났습니다/);
  });
});

describe("토너먼트 — 시계", () => {
  it("clockState가 현재 레벨을 그대로 보여준다", () => {
    const { room } = makeRoom(["A", "B"]);
    room.levelIndex = 2;
    const c = room.clockState();
    assert.equal(c.mode, "tournament");
    assert.equal(c.level, 3, "1부터 세는 레벨 번호");
    assert.equal(c.smallBlind, 30_000);
    assert.equal(c.bigBlind, 60_000);
    assert.equal(c.ante, 60_000);
    assert.equal(c.onBreak, false);
    assert.equal(c.finished, false);
  });

  it("브레이크 중에는 핸드가 시작되지 않는다", () => {
    const { room } = makeRoom(["A", "B"]);
    room.onBreak = true;
    room.startHand();
    assert.equal(room.handNumber, 0);
    assert.equal(room.phase, "waiting");
  });

  it("고정 블라인드 방은 시계를 쓰지 않는다", () => {
    const room = new Room("F", "p0", {
      fixedBlinds: { smallBlind: 10, bigBlind: 20 },
      startingChips: 1000,
      turnTimeoutMs: 0,
      nextHandDelayMs: 0,
    });
    room.addPlayer("p0", "A", "s0");
    room.addPlayer("p1", "B", "s1");
    room.startHand();
    assert.equal(room.smallBlind, 10);
    assert.equal(room.levelEndsAt, null, "레벨 타이머가 돌지 않아야 한다");
  });
});
