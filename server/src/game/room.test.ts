import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Room, type RoomEmitter } from "./room.ts";

/** 타이머를 끈 방 — 테스트에서는 액션을 직접 호출한다. */
function makeRoom(names: string[], chips = 1000) {
  const room = new Room("TEST01", "p0", {
    startingChips: chips,
    fixedBlinds: { smallBlind: 10, bigBlind: 20 },
    turnTimeoutMs: 0,
    nextHandDelayMs: 0,
  });
  const logs: string[] = [];
  const emitter: RoomEmitter = {
    state: () => {},
    hole: () => {},
    community: () => {},
    showdown: () => {},
    log: (t) => logs.push(t),
    clock: () => {},
    finished: () => {},
  };
  room.emitter = emitter;
  names.forEach((n, i) => room.addPlayer(`p${i}`, n, `s${i}`));
  return { room, logs };
}

const chipTotal = (room: Room) =>
  room.players.reduce((s, p) => s + p.chips + p.totalBet, 0);

const turn = (room: Room) => room.currentTurn;

/** 체크할 수 있으면 체크, 아니면 콜 — "가만히 있기" 액션 */
function passiveAct(room: Room, id: string) {
  const p = room.players.find((x) => x.id === id)!;
  room.act(id, { type: room.legalActionsFor(p).canCheck ? "check" : "call" });
}

describe("Room — 핸드 시작과 블라인드", () => {
  it("3인: SB/BB를 걷고 UTG부터 액션한다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    assert.equal(room.phase, "preflop");
    assert.equal(room.players[room.dealerIndex]!.id, "p0", "첫 핸드 딜러는 0번 좌석");
    assert.equal(room.currentBet, 20);
    // 블라인드 두 명만 칩을 냈다
    const paid = room.players.filter((p) => p.totalBet > 0);
    assert.equal(paid.length, 2);
    assert.deepEqual(paid.map((p) => p.totalBet).sort((a, b) => a - b), [10, 20]);
    // 모두 카드 2장
    assert.ok(room.players.every((p) => p.cards.length === 2));
  });

  it("전원의 홀카드는 서로 겹치지 않는다", () => {
    const { room } = makeRoom(["A", "B", "C", "D"]);
    room.startHand();
    const all = room.players.flatMap((p) => p.cards).map((c) => `${c.rank}${c.suit}`);
    assert.equal(new Set(all).size, all.length);
  });

  it("헤즈업: 딜러가 SB이고 프리플랍에 먼저 액션한다", () => {
    const { room } = makeRoom(["A", "B"]);
    room.startHand();
    const dealer = room.players[room.dealerIndex]!;
    assert.equal(dealer.totalBet, 10, "딜러가 스몰블라인드");
    assert.equal(turn(room), dealer.id, "딜러가 먼저 액션");
  });
});

describe("Room — 베팅 라운드", () => {
  it("BB에게 옵션이 돌아온다(콜만 하고 끝나지 않는다)", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    const bb = room.players.find((p) => p.totalBet === 20)!;
    room.act(turn(room)!, { type: "call" }); // UTG 콜
    room.act(turn(room)!, { type: "call" }); // SB 콜
    assert.equal(turn(room), bb.id, "BB가 마지막으로 옵션을 받는다");
    assert.equal(room.phase, "preflop");
    room.act(bb.id, { type: "check" });
    assert.equal(room.phase, "flop");
    assert.equal(room.communityCards.length, 3);
  });

  it("포스트플랍은 딜러 왼쪽부터 액션한다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    room.act(turn(room)!, { type: "call" });
    room.act(turn(room)!, { type: "call" });
    room.act(turn(room)!, { type: "check" });
    assert.equal(room.phase, "flop");
    const expected = room.players[(room.dealerIndex + 1) % 3]!;
    assert.equal(turn(room), expected.id);
  });

  it("레이즈하면 이미 콜한 사람에게 다시 차례가 온다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    const utg = turn(room)!;
    room.act(utg, { type: "call" });         // 20
    room.act(turn(room)!, { type: "raise", amount: 60 }); // SB가 60으로
    assert.equal(room.currentBet, 60);
    room.act(turn(room)!, { type: "call" }); // BB 콜
    assert.equal(turn(room), utg, "레이즈를 맞은 UTG가 다시 행동해야 한다");
  });

  it("문서 예시: 1만/2만에서 4만 레이즈 후 다음 최소 레이즈는 6만", () => {
    const room = new Room("T", "p0", {
      startingChips: 3_000_000,
      fixedBlinds: { smallBlind: 10_000, bigBlind: 20_000 },
      turnTimeoutMs: 0, nextHandDelayMs: 0,
    });
    ["A", "B", "C"].forEach((n, i) => room.addPlayer(`p${i}`, n, `s${i}`));
    room.startHand();

    const utg = room.players.find((p) => p.id === turn(room))!;
    assert.equal(room.legalActionsFor(utg).minRaiseTo, 40_000, "첫 최소 레이즈는 4만");
    room.act(utg.id, { type: "raise", amount: 40_000 });

    // 2만 → 4만이므로 증가분 2만. 다음 최소 레이즈는 4만 + 2만 = 6만
    const next = room.players.find((p) => p.id === turn(room))!;
    assert.equal(room.legalActionsFor(next).minRaiseTo, 60_000);
    assert.throws(
      () => room.act(next.id, { type: "raise", amount: 50_000 }),
      /최소 60000/
    );
    room.act(next.id, { type: "raise", amount: 60_000 });

    // 4만 → 6만도 증가분 2만이므로 그 다음은 8만
    const third = room.players.find((p) => p.id === turn(room))!;
    assert.equal(room.legalActionsFor(third).minRaiseTo, 80_000);
  });

  it("최소 레이즈보다 작은 레이즈는 거부된다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    assert.throws(
      () => room.act(turn(room)!, { type: "raise", amount: 30 }),
      /최소 40/
    );
  });

  it("차례가 아니면 액션할 수 없다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    const other = room.players.find((p) => p.id !== turn(room))!;
    assert.throws(() => room.act(other.id, { type: "fold" }), /차례가 아닙니다/);
  });

  it("콜할 게 없으면 체크만 가능하다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    room.act(turn(room)!, { type: "call" });
    room.act(turn(room)!, { type: "call" });
    const bb = turn(room)!;
    assert.throws(() => room.act(bb, { type: "call" }), /콜할 것이 없습니다/);
  });
});

describe("Room — 핸드 종료", () => {
  it("전원 폴드면 남은 한 명이 팟을 다 가져간다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    const potSize = room.players.reduce((s, p) => s + p.totalBet, 0);
    room.act(turn(room)!, { type: "fold" });
    room.act(turn(room)!, { type: "fold" });
    assert.equal(room.phase, "showdown");
    const winner = room.players.find((p) => !p.folded)!;
    assert.equal(
      winner.chips,
      1000 - winner.totalBet + potSize,
      "잃은 블라인드를 되찾고 남의 블라인드를 가져간다"
    );
    assert.equal(room.players.reduce((s, p) => s + p.chips, 0), 3000, "칩 총합 보존");
  });

  it("리버까지 가면 쇼다운에서 팟이 전부 분배된다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    const before = room.players.reduce((s, p) => s + p.chips, 0);
    room.startHand();
    // 프리플랍
    room.act(turn(room)!, { type: "call" });
    room.act(turn(room)!, { type: "call" });
    room.act(turn(room)!, { type: "check" });
    // 플랍/턴/리버 모두 체크
    for (const phase of ["flop", "turn", "river"] as const) {
      assert.equal(room.phase, phase);
      room.act(turn(room)!, { type: "check" });
      room.act(turn(room)!, { type: "check" });
      room.act(turn(room)!, { type: "check" });
    }
    assert.equal(room.phase, "showdown");
    assert.equal(room.communityCards.length, 5);
    assert.equal(
      room.players.reduce((s, p) => s + p.chips, 0),
      before,
      "칩 총합이 보존되어야 한다"
    );
  });

  it("올인 대결이면 남은 보드를 자동으로 다 깐다", () => {
    const { room } = makeRoom(["A", "B"]);
    room.startHand();
    room.act(turn(room)!, { type: "allin" });
    room.act(turn(room)!, { type: "call" });
    assert.equal(room.phase, "showdown");
    assert.equal(room.communityCards.length, 5, "리버까지 깔려야 한다");
    assert.equal(room.players.reduce((s, p) => s + p.chips, 0), 2000);
  });

  it("숏스택 올인이면 사이드팟이 정확히 분배된다", () => {
    const room = new Room("T", "p0", {
      startingChips: 1000, fixedBlinds: { smallBlind: 10, bigBlind: 20 },
      turnTimeoutMs: 0, nextHandDelayMs: 0,
    });
    room.addPlayer("p0", "A", "s0");
    room.addPlayer("p1", "B", "s1");
    room.addPlayer("p2", "C", "s2");
    room.players.find((p) => p.id === "p2")!.chips = 100; // 숏스택
    const before = room.players.reduce((s, p) => s + p.chips, 0);

    room.startHand();
    // 전원 올인 상황을 만든다
    while (room.phase !== "showdown") {
      const t = turn(room);
      if (!t) break;
      room.act(t, { type: "allin" });
    }
    assert.equal(room.phase, "showdown");
    assert.equal(
      room.players.reduce((s, p) => s + p.chips, 0),
      before,
      "사이드팟까지 포함해 칩 총합 보존"
    );
  });
});

describe("Room — 팟 표시", () => {
  it("블라인드만 놓인 프리플랍에는 사이드팟이 없다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    const state = room.toPublicState("p0");
    assert.equal(state.totalPot, 30, "블라인드 합이 팟으로 보여야 한다");
    assert.equal(state.pots.length, 0, "아직 정산된 팟은 없다");
  });

  it("라운드가 끝나면 정산된 팟이 하나로 잡힌다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    room.act(turn(room)!, { type: "call" });
    room.act(turn(room)!, { type: "call" });
    room.act(turn(room)!, { type: "check" });
    const state = room.toPublicState("p0");
    assert.equal(state.phase, "flop");
    assert.equal(state.totalPot, 60);
    assert.equal(state.pots.length, 1);
    assert.equal(state.pots[0]!.amount, 60);
  });

  it("실제 올인이 있을 때만 사이드팟이 갈린다", () => {
    const room = new Room("T", "p0", {
      startingChips: 1000, fixedBlinds: { smallBlind: 10, bigBlind: 20 },
      turnTimeoutMs: 0, nextHandDelayMs: 0,
    });
    room.addPlayer("p0", "A", "s0");
    room.addPlayer("p1", "B", "s1");
    room.addPlayer("p2", "C", "s2");
    room.players.find((p) => p.id === "p2")!.chips = 100;
    room.startHand();
    while (room.phase !== "showdown" && turn(room)) {
      room.act(turn(room)!, { type: "allin" });
    }
    const state = room.toPublicState("p0");
    assert.ok(state.pots.length >= 2, "숏스택 올인이면 사이드팟이 있어야 한다");
    assert.equal(
      state.pots.reduce((s, p) => s + p.amount, 0),
      state.totalPot,
      "팟 합계가 총액과 같아야 한다"
    );
  });
});

describe("Room — 카드 마스킹", () => {
  it("남의 홀카드는 상태에 실려 나가지 않는다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    const state = room.toPublicState("p0");
    const me = state.players.find((p) => p.id === "p0")!;
    assert.equal(me.cards?.length, 2, "내 카드는 보인다");
    for (const other of state.players.filter((p) => p.id !== "p0")) {
      assert.equal(other.cards, null, "남의 카드는 null이어야 한다");
      assert.equal(other.hasCards, true, "뒷면은 렌더링할 수 있어야 한다");
    }
    assert.ok(!JSON.stringify(state).includes(room.players[1]!.cards[0]!.rank + room.players[1]!.cards[0]!.suit));
  });

  it("쇼다운 후에는 겨룬 사람의 카드가 공개된다", () => {
    const { room } = makeRoom(["A", "B"]);
    room.startHand();
    room.act(turn(room)!, { type: "allin" });
    room.act(turn(room)!, { type: "call" });
    const state = room.toPublicState("p0");
    assert.ok(state.players.every((p) => p.cards?.length === 2));
  });

  it("내 차례가 아니면 legalActions는 null", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    const actor = turn(room)!;
    const idle = room.players.find((p) => p.id !== actor)!.id;
    assert.equal(room.toPublicState(idle).legalActions, null);
    assert.notEqual(room.toPublicState(actor).legalActions, null);
  });
});

describe("Room — 좌석/연결", () => {
  it("핸드 도중 들어온 사람은 다음 핸드부터 참여한다", () => {
    const { room } = makeRoom(["A", "B"]);
    room.startHand();
    const late = room.addPlayer("p9", "Late", "s9");
    assert.equal(late.sittingOut, true);
    assert.equal(late.inHand, false);
    assert.equal(room.toPublicState("p9").players.length, 3);
  });

  it("핸드 도중 나가면 폴드 처리되고 좌석은 핸드 끝에 정리된다", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    const victim = room.players.find((p) => p.id !== turn(room))!;
    room.removePlayer(victim.id);
    assert.equal(victim.folded, true);
    assert.equal(room.players.length, 3, "핸드 중에는 좌석 유지");
    while (room.phase !== "showdown" && turn(room)) {
      passiveAct(room, turn(room)!);
    }
    assert.equal(room.players.length, 2, "핸드가 끝나면 좌석 정리");
  });

  it("접속이 끊겨도 좌석과 칩은 유지된다(재접속 가능)", () => {
    const { room } = makeRoom(["A", "B", "C"]);
    room.startHand();
    room.markDisconnected("s2");
    const p2 = room.players.find((p) => p.id === "p2")!;
    assert.equal(p2.connected, false);
    // 핸드를 끝까지 진행
    while (room.phase !== "showdown" && turn(room)) {
      passiveAct(room, turn(room)!);
    }
    assert.ok(room.players.some((p) => p.id === "p2"), "좌석이 남아 있어야 한다");
    const back = room.addPlayer("p2", "C", "s2-new");
    assert.equal(back.connected, true);
    assert.equal(back.chips, p2.chips);
  });

  it("칩이 다 떨어진 사람은 다음 핸드에서 빠진다", () => {
    const { room } = makeRoom(["A", "B"]);
    // 무승부면 팟이 갈려 둘 다 살아남으므로 한 판으로는 보장되지 않는다
    let hands = 0;
    while (!room.players.some((p) => p.chips === 0) && hands++ < 60) {
      room.startHand();
      let guard = 0;
      while (room.phase !== "showdown" && turn(room) && guard++ < 50) {
        room.act(turn(room)!, { type: "allin" });
      }
    }
    const busted = room.players.filter((p) => p.chips === 0);
    assert.equal(busted.length, 1, "결국 한 명은 털린다");
    assert.equal(busted[0]!.sittingOut, true);
  });
});

describe("Room — 무작위 플레이 불변식", () => {
  it("200판을 무작위로 돌려도 칩 총합이 보존된다", () => {
    for (let seed = 0; seed < 200; seed++) {
      const n = 2 + (seed % 5); // 2~6명
      const { room } = makeRoom(
        Array.from({ length: n }, (_, i) => `P${i}`)
      );
      // 절반은 숏스택을 하나 끼워 사이드팟/올인콜 경로를 태운다
      if (seed % 2 === 0) room.players[seed % n]!.chips = 30 + (seed % 7) * 25;
      const before = room.players.reduce((s, p) => s + p.chips, 0);
      room.startHand();

      let guard = 0;
      while (room.phase !== "showdown" && room.currentTurn && guard++ < 500) {
        const id = room.currentTurn;
        const p = room.players.find((x) => x.id === id)!;
        const legal = room.legalActionsFor(p);
        const roll = (seed * 31 + guard * 17) % 100;
        try {
          if (roll < 12) room.act(id, { type: "fold" });
          else if (roll < 20) room.act(id, { type: "allin" });
          else if (roll < 35 && legal.canRaise) {
            const to = Math.min(
              legal.maxRaiseTo,
              legal.minRaiseTo + (roll % 3) * 20
            );
            room.act(id, { type: "raise", amount: to });
          } else if (legal.canCheck) room.act(id, { type: "check" });
          else room.act(id, { type: "call" });
        } catch (e) {
          assert.fail(`합법적인 액션이 거부됨 (seed=${seed}): ${String(e)}`);
        }
      }

      assert.ok(guard < 500, `핸드가 끝나지 않음 (seed=${seed})`);
      assert.equal(room.phase, "showdown", `쇼다운에 도달 실패 (seed=${seed})`);
      assert.equal(
        room.players.reduce((s, p) => s + p.chips, 0),
        before,
        `칩 총합 불일치 (seed=${seed})`
      );
      assert.ok(
        room.players.every((p) => p.chips >= 0),
        `음수 스택 발생 (seed=${seed})`
      );
    }
  });
});
