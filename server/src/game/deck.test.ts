import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDeck, draw, shuffle } from "./deck.ts";

describe("deck", () => {
  it("52장 중복 없는 덱을 만든다", () => {
    const deck = createDeck();
    assert.equal(deck.length, 52);
    const keys = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    assert.equal(keys.size, 52);
  });

  it("셔플은 원본을 건드리지 않고 같은 52장을 돌려준다", () => {
    const deck = createDeck();
    const snapshot = deck.map((c) => `${c.rank}${c.suit}`).join(",");
    const shuffled = shuffle(deck);
    assert.equal(deck.map((c) => `${c.rank}${c.suit}`).join(","), snapshot);
    assert.equal(shuffled.length, 52);
    assert.equal(new Set(shuffled.map((c) => `${c.rank}${c.suit}`)).size, 52);
  });

  it("셔플이 실제로 순서를 바꾼다", () => {
    const original = createDeck().map((c) => `${c.rank}${c.suit}`).join(",");
    // 확률적으로 20번 모두 원본과 같을 수는 없다
    const anyDifferent = Array.from({ length: 20 }, () =>
      shuffle(createDeck()).map((c) => `${c.rank}${c.suit}`).join(",")
    ).some((s) => s !== original);
    assert.ok(anyDifferent);
  });

  it("draw는 덱에서 카드를 덜어낸다", () => {
    const deck = shuffle(createDeck());
    const hand = draw(deck, 2);
    assert.equal(hand.length, 2);
    assert.equal(deck.length, 50);
  });
});
