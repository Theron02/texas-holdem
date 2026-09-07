import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Card, Rank, Suit } from "../../../shared/types.ts";
import { evaluate, pickWinners } from "./handEvaluator.ts";

/** "A♠ K♥" 같은 문자열을 카드 배열로 */
function cards(s: string): Card[] {
  return s.split(" ").map((t) => ({
    rank: t.slice(0, -1) as Rank,
    suit: t.slice(-1) as Suit,
  }));
}

describe("handEvaluator", () => {
  it("7장 중 최고 5장을 고른다", () => {
    const h = evaluate(cards("A♠ K♠"), cards("Q♠ J♠ 10♠ 2♥ 3♦"));
    assert.match(h.name, /Straight Flush|Royal/i);
  });

  it("10을 T로 올바르게 변환한다", () => {
    const h = evaluate(cards("10♠ 10♥"), cards("10♦ 4♣ 7♠ 2♥ 9♦"));
    assert.equal(h.name, "Three of a Kind");
  });

  it("더 높은 핸드를 이긴다", () => {
    const flush = { playerId: "a", hand: evaluate(cards("A♥ 5♥"), cards("K♥ 9♥ 2♥ 3♦ 7♠")) };
    const pair = { playerId: "b", hand: evaluate(cards("K♠ K♦"), cards("K♥ 9♥ 2♥ 3♦ 7♠")) };
    // 보드에 K♥가 있으므로 b는 트립스, a는 플러시
    assert.deepEqual(pickWinners([flush, pair]), ["a"]);
  });

  it("보드가 최고 핸드면 동점 처리", () => {
    const board = cards("A♠ K♠ Q♠ J♠ 10♠");
    const a = { playerId: "a", hand: evaluate(cards("2♥ 3♦"), board) };
    const b = { playerId: "b", hand: evaluate(cards("4♣ 5♦"), board) };
    assert.deepEqual(pickWinners([a, b]).sort(), ["a", "b"]);
  });

  it("키커로 승부가 갈린다", () => {
    const board = cards("A♦ A♣ 7♠ 4♥ 2♦");
    const a = { playerId: "a", hand: evaluate(cards("K♠ 3♦"), board) };
    const b = { playerId: "b", hand: evaluate(cards("Q♠ 3♣"), board) };
    assert.deepEqual(pickWinners([a, b]), ["a"]);
  });
});
