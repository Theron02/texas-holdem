import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Room, type RoomEmitter } from "./room.ts";

function makeRoom(names: string[]) {
  const room = new Room("T", "p0", {
    startingChips: 100_000,
    fixedBlinds: { smallBlind: 10, bigBlind: 20 },
    turnTimeoutMs: 0,
    nextHandDelayMs: 0,
  });
  const logs: string[] = [];
  room.emitter = {
    state: () => {}, hole: () => {}, community: () => {}, showdown: () => {},
    reveal: () => {}, log: (t) => logs.push(t), clock: () => {}, finished: () => {},
  } satisfies RoomEmitter;
  names.forEach((n, i) => room.addPlayer(`p${i}`, n, `s${i}`));
  return { room, logs };
}

const seatOf = (room: Room, id: string) =>
  room.players.find((p) => p.id === id)!.seat;

describe("좌석 선택", () => {
  it("들어온 순서대로 앞자리부터 앉는다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    assert.deepEqual(room.players.map((p) => p.seat), [0, 1, 2]);
  });

  it("빈 자리로 옮길 수 있다", () => {
    const { room, logs } = makeRoom(["A", "B", "C"]);
    room.takeSeat("p2", 7);
    assert.equal(seatOf(room, "p2"), 7);
    assert.ok(logs.some((l) => l.includes("8번 자리로 옮겼습니다")));
    // 좌석 순서가 유지되어야 액션 순서가 맞는다
    assert.deepEqual(room.players.map((p) => p.seat), [0, 1, 7]);
  });

  it("이미 앉은 자리로는 못 옮긴다", () => {
    const { room } = makeRoom(["A", "B"]);
    assert.throws(() => room.takeSeat("p1", 0), /이미 앉은 자리입니다/);
    assert.equal(seatOf(room, "p1"), 1, "자리는 그대로");
  });

  it("없는 자리 번호는 거부한다", () => {
    const { room } = makeRoom(["A", "B"]);
    assert.throws(() => room.takeSeat("p0", 10), /없는 자리입니다/);
    assert.throws(() => room.takeSeat("p0", -1), /없는 자리입니다/);
    assert.throws(() => room.takeSeat("p0", 1.5), /없는 자리입니다/);
  });

  it("게임이 시작되면 자리를 옮길 수 없다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    assert.throws(() => room.takeSeat("p2", 8), /게임 시작 전에만/);
  });

  it("같은 자리를 다시 고르면 아무 일도 없다", () => {
    const { room } = makeRoom(["A", "B"]);
    room.takeSeat("p1", 1);
    assert.equal(seatOf(room, "p1"), 1);
  });

  it("좌석 번호가 상태에 그대로 나간다", () => {
    const { room } = makeRoom(["A", "B"]);
    room.takeSeat("p1", 9);
    const state = room.toPublicState("p0");
    assert.equal(state.maxPlayers, 10);
    assert.equal(state.players.find((p) => p.id === "p1")!.seat, 9);
  });
});

describe("첫 핸드 버튼 위치", () => {
  it("가장 높은 번호 좌석에 버튼이 놓인다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.takeSeat("p2", 9); // 10번 자리
    room.startHand();

    const dealer = room.players[room.dealerIndex]!;
    assert.equal(dealer.seat, 9, "10번 자리가 버튼");
  });

  it("그래서 1번 자리가 스몰블라인드가 된다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.takeSeat("p2", 9);
    room.startHand();

    const sb = room.players.find((p) => p.totalBet === 10)!;
    const bb = room.players.find((p) => p.totalBet === 20)!;
    assert.equal(sb.seat, 0, "1번 자리가 스몰블라인드");
    assert.equal(bb.seat, 1, "2번 자리가 빅블라인드");
  });

  it("10번 자리가 비어 있으면 그 앞 자리에 버튼이 간다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.takeSeat("p2", 5); // 6번 자리가 가장 뒤
    room.startHand();

    assert.equal(room.players[room.dealerIndex]!.seat, 5);
    assert.equal(room.players.find((p) => p.totalBet === 10)!.seat, 0);
  });

  it("두 번째 핸드부터는 버튼이 한 자리씩 넘어간다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    assert.equal(room.players[room.dealerIndex]!.seat, 2, "첫 핸드는 마지막 자리");

    // 핸드를 끝내고 다음 핸드
    while (room.phase !== "showdown" && room.currentTurn) {
      const p = room.players.find((x) => x.id === room.currentTurn)!;
      room.act(p.id, { type: room.legalActionsFor(p).canCheck ? "check" : "call" });
    }
    room.startHand();
    assert.equal(room.players[room.dealerIndex]!.seat, 0, "다음은 1번 자리");
  });
});
