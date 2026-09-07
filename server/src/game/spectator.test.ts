import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Room, type RoomEmitter } from "./room.ts";
import { RoomManager } from "./roomManager.ts";

function makeRoom(names: string[], chips = 100_000) {
  const room = new Room("T", "p0", {
    startingChips: chips,
    fixedBlinds: { smallBlind: 10, bigBlind: 20 },
    turnTimeoutMs: 0,
    nextHandDelayMs: 0,
  });
  const logs: string[] = [];
  room.emitter = {
    state: () => {}, hole: () => {}, community: () => {}, showdown: () => {},
    log: (t) => logs.push(t), clock: () => {}, finished: () => {},
  } satisfies RoomEmitter;
  names.forEach((n, i) => room.addPlayer(`p${i}`, n, `s${i}`));
  return { room, logs };
}

const turn = (r: Room) => r.currentTurn;

describe("중도 퇴장과 관전", () => {
  it("테이블에서 내려가면 남은 칩이 사라지고 관전자가 된다", () => {
    const { room, logs } = makeRoom(["A", "B", "C"]);
    room.leaveTable("p2");

    const p2 = room.players.find((p) => p.id === "p2")!;
    assert.equal(p2.chips, 0, "남은 칩은 번칩으로 사라진다");
    assert.equal(p2.spectating, true);
    assert.equal(p2.sittingOut, true);
    assert.ok(logs.some((l) => l.includes("테이블에서 내려갔습니다")));
  });

  it("관전자는 다음 핸드에 카드를 받지 않는다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.leaveTable("p2");
    room.startHand();

    const p2 = room.players.find((p) => p.id === "p2")!;
    assert.equal(p2.inHand, false);
    assert.equal(p2.cards.length, 0);
    assert.equal(
      room.players.filter((p) => p.inHand).length,
      2,
      "남은 두 명만 플레이한다"
    );
  });

  it("핸드 도중 내려가면 폴드 처리되고 차례가 넘어간다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    const actor = turn(room)!;
    room.leaveTable(actor);

    const p = room.players.find((x) => x.id === actor)!;
    assert.equal(p.folded, true);
    assert.equal(p.spectating, true);
    assert.notEqual(turn(room), actor, "차례가 넘어가야 한다");
  });

  it("관전자도 상태에서 보이고 관전 표시가 붙는다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.leaveTable("p2");
    const state = room.toPublicState("p0");
    const seen = state.players.find((p) => p.id === "p2")!;
    assert.equal(seen.spectating, true);
    assert.equal(seen.chips, 0);
  });

  it("관전자는 리바인해서 테이블로 돌아올 수 있다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.leaveTable("p2");
    const p2 = room.players.find((p) => p.id === "p2")!;

    assert.equal(room.canRebuy(p2), true, "리바인이 남아 있으면 돌아올 수 있다");
    room.rebuy("p2");
    assert.equal(p2.spectating, false);
    assert.equal(p2.chips, room.preset.rebuyChips);

    room.startHand();
    assert.equal(p2.inHand, true, "다음 핸드부터 다시 참여");
  });

  it("리바인을 다 쓴 관전자는 돌아올 수 없다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    const p2 = room.players.find((p) => p.id === "p2")!;
    p2.buyinsUsed = 3;
    room.leaveTable("p2");
    assert.equal(room.canRebuy(p2), false);
    assert.throws(() => room.rebuy("p2"), /리바인 횟수를 모두 썼습니다/);
  });

  it("두 번 내려갈 수는 없다", () => {
    const { room } = makeRoom(["A", "B"]);
    room.leaveTable("p1");
    assert.throws(() => room.leaveTable("p1"), /이미 관전 중입니다/);
  });

  it("관전자만 남으면 게임이 시작되지 않는다", () => {
    const { room } = makeRoom(["A", "B"]);
    room.leaveTable("p1");
    room.startHand();
    assert.equal(room.handNumber, 0, "플레이할 사람이 2명 미만");
  });
});

describe("돌아오지 않는 좌석 정리 (방 자동 삭제)", () => {
  it("유예 시간이 지나면 좌석이 정리된다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.markDisconnected("s2");

    assert.equal(room.sweepDisconnected(60_000), false, "아직 유예 시간 안");
    assert.equal(room.players.length, 3);

    // 유예 시간을 0으로 두면 즉시 정리 대상
    const empty = room.sweepDisconnected(0);
    assert.equal(empty, false, "아직 두 명 남았다");
    assert.equal(room.players.length, 2);
    assert.ok(!room.players.some((p) => p.id === "p2"));
  });

  it("전원이 돌아오지 않으면 방이 비었다고 알린다", () => {
    const { room } = makeRoom(["A", "B"]);
    room.markDisconnected("s0");
    room.markDisconnected("s1");
    assert.equal(room.sweepDisconnected(0), true, "빈 방이 되었다");
    assert.equal(room.players.length, 0);
  });

  it("핸드 진행 중이면 폴드시키고 좌석은 핸드가 끝날 때 정리한다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    room.markDisconnected("s2");
    room.sweepDisconnected(0);

    const p2 = room.players.find((p) => p.id === "p2")!;
    assert.equal(p2.folded, true);
    assert.equal(room.players.length, 3, "핸드 중에는 좌석 유지");

    while (room.phase !== "showdown" && turn(room)) {
      const p = room.players.find((x) => x.id === turn(room))!;
      room.act(p.id, { type: room.legalActionsFor(p).canCheck ? "check" : "call" });
    }
    assert.equal(room.players.length, 2, "핸드가 끝나면 정리된다");
  });

  it("돌아온 사람은 정리 대상에서 빠진다", () => {
    const { room } = makeRoom(["A", "B"]);
    room.markDisconnected("s1");
    room.addPlayer("p1", "B", "s1-new"); // 재접속
    assert.equal(room.sweepDisconnected(0), false);
    assert.equal(room.players.length, 2, "돌아왔으므로 자리를 지킨다");
  });

  it("방장이 정리되면 다음 사람이 방장이 된다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    assert.equal(room.hostId, "p0");
    room.markDisconnected("s0");
    room.sweepDisconnected(0);
    assert.notEqual(room.hostId, "p0");
    assert.ok(room.players.some((p) => p.id === room.hostId));
  });
});

describe("RoomManager 자동 정리", () => {
  it("전원이 끊긴 방은 sweep에서 사라진다", () => {
    const manager = new RoomManager({
      startingChips: 1000,
      fixedBlinds: { smallBlind: 10, bigBlind: 20 },
      disconnectGraceMs: 0,
      sweepIntervalMs: 0, // 수동으로 돌린다
    });
    const room = manager.create("h1");
    room.addPlayer("h1", "A", "sa");
    room.addPlayer("h2", "B", "sb");
    assert.equal(manager.count, 1);

    room.markDisconnected("sa");
    manager.sweep();
    assert.equal(manager.count, 1, "한 명은 아직 붙어 있다");

    room.markDisconnected("sb");
    manager.sweep();
    assert.equal(manager.count, 0, "전원이 나간 방은 사라진다");
    manager.dispose();
  });

  it("아직 붙어 있는 사람이 있으면 방을 지우지 않는다", () => {
    const manager = new RoomManager({ disconnectGraceMs: 0, sweepIntervalMs: 0 });
    const room = manager.create("h1");
    room.addPlayer("h1", "A", "sa");
    manager.sweep();
    assert.equal(manager.count, 1);
    manager.dispose();
  });
});

describe("플레이 시간", () => {
  it("첫 핸드가 시작되면 시작 시각이 기록된다", () => {
    const { room } = makeRoom(["A", "B"]);
    assert.equal(room.clockState().startedAt, null, "시작 전에는 없다");
    const before = Date.now();
    room.startHand();
    const startedAt = room.clockState().startedAt!;
    assert.ok(startedAt >= before, "시작 시각이 기록된다");
  });

  it("두 번째 핸드가 시작 시각을 덮어쓰지 않는다", () => {
    const { room } = makeRoom(["A", "B"]);
    room.startHand();
    const first = room.clockState().startedAt;
    room.startHand();
    assert.equal(room.clockState().startedAt, first, "총 플레이 시간이 유지되어야 한다");
  });
});
