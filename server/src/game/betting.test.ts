import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPots, splitPot } from "./betting.ts";

describe("buildPots", () => {
  it("전원이 같은 금액을 냈으면 메인팟 하나", () => {
    const pots = buildPots([
      { id: "a", totalBet: 100, folded: false },
      { id: "b", totalBet: 100, folded: false },
      { id: "c", totalBet: 100, folded: false },
    ]);
    assert.equal(pots.length, 1);
    assert.equal(pots[0]!.amount, 300);
    assert.deepEqual(pots[0]!.eligible.sort(), ["a", "b", "c"]);
  });

  it("숏스택 올인이 있으면 사이드팟이 갈린다", () => {
    // a는 50만 있어 올인, b/c는 200씩
    const pots = buildPots([
      { id: "a", totalBet: 50, folded: false },
      { id: "b", totalBet: 200, folded: false },
      { id: "c", totalBet: 200, folded: false },
    ]);
    assert.equal(pots.length, 2);
    assert.equal(pots[0]!.amount, 150); // 50 * 3
    assert.deepEqual(pots[0]!.eligible.sort(), ["a", "b", "c"]);
    assert.equal(pots[1]!.amount, 300); // 150 * 2
    assert.deepEqual(pots[1]!.eligible.sort(), ["b", "c"]);
  });

  it("올인이 여러 명이면 층마다 팟이 생긴다", () => {
    const pots = buildPots([
      { id: "a", totalBet: 50, folded: false },
      { id: "b", totalBet: 120, folded: false },
      { id: "c", totalBet: 300, folded: false },
      { id: "d", totalBet: 300, folded: false },
    ]);
    assert.deepEqual(
      pots.map((p) => p.amount),
      [200, 210, 360]
    );
    assert.deepEqual(pots[0]!.eligible.sort(), ["a", "b", "c", "d"]);
    assert.deepEqual(pots[1]!.eligible.sort(), ["b", "c", "d"]);
    assert.deepEqual(pots[2]!.eligible.sort(), ["c", "d"]);
  });

  it("폴드한 사람의 칩은 팟에 남지만 자격은 없다", () => {
    const pots = buildPots([
      { id: "a", totalBet: 100, folded: true },
      { id: "b", totalBet: 100, folded: false },
      { id: "c", totalBet: 100, folded: false },
    ]);
    assert.equal(pots.length, 1);
    assert.equal(pots[0]!.amount, 300);
    assert.deepEqual(pots[0]!.eligible.sort(), ["b", "c"]);
  });

  it("칩 총합은 언제나 보존된다", () => {
    const contributors = [
      { id: "a", totalBet: 33, folded: true },
      { id: "b", totalBet: 71, folded: false },
      { id: "c", totalBet: 200, folded: false },
      { id: "d", totalBet: 200, folded: true },
      { id: "e", totalBet: 0, folded: true },
    ];
    const total = contributors.reduce((s, c) => s + c.totalBet, 0);
    const pots = buildPots(contributors);
    assert.equal(pots.reduce((s, p) => s + p.amount, 0), total);
    assert.ok(pots.every((p) => p.eligible.length > 0));
  });
});

describe("splitPot", () => {
  it("나누어떨어지면 균등 분배", () => {
    const out = splitPot(300, ["a", "b"], ["a", "b"]);
    assert.equal(out.get("a"), 150);
    assert.equal(out.get("b"), 150);
  });

  it("남는 칩은 딜러 왼쪽부터", () => {
    const out = splitPot(301, ["b", "a"], ["a", "b"]); // a가 딜러에 더 가까움
    assert.equal(out.get("a"), 151);
    assert.equal(out.get("b"), 150);
    assert.equal([...out.values()].reduce((s, v) => s + v, 0), 301);
  });

  it("3분할에서 남는 2칩도 순서대로", () => {
    const out = splitPot(302, ["a", "b", "c"], ["a", "b", "c"]);
    assert.deepEqual([out.get("a"), out.get("b"), out.get("c")], [101, 101, 100]);
  });
});
