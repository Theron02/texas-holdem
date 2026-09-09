import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Card, Rank, Suit } from "../../../shared/types.ts";
import { estimateEquity } from "./equity.ts";

function cards(s: string): Card[] {
  return s.split(" ").map((t) => ({
    rank: t.slice(0, -1) as Rank,
    suit: t.slice(-1) as Suit,
  }));
}

/** 몬테카를로라 오차가 있다. 5000판이면 표준오차가 0.7% 수준이라 ±4%면 넉넉하다. */
const N = 5000;
const near = (actual: number, expected: number, label: string, tol = 0.04) =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: ${(actual * 100).toFixed(1)}% (기대 ${(expected * 100).toFixed(0)}% ±${tol * 100}%)`
  );

describe("승률 계산", () => {
  it("AA는 한 명 상대로 약 85%", () => {
    const r = estimateEquity(cards("A♠ A♥"), [], 1, N);
    near(r.win + r.tie, 0.85, "AA vs 1명");
  });

  it("상대가 늘수록 승률이 떨어진다", () => {
    const one = estimateEquity(cards("A♠ A♥"), [], 1, N);
    const five = estimateEquity(cards("A♠ A♥"), [], 5, N);
    near(five.win + five.tie, 0.49, "AA vs 5명");
    assert.ok(five.win < one.win, "다섯 명 상대가 더 어렵다");
  });

  it("최악의 핸드는 한 명 상대로도 절반이 안 된다", () => {
    const r = estimateEquity(cards("7♠ 2♥"), [], 1, N);
    assert.ok(r.win + r.tie < 0.45, `72o가 너무 높다: ${r.win + r.tie}`);
  });

  it("리버에 넛츠면 100%", () => {
    const r = estimateEquity(cards("A♠ K♠"), cards("Q♠ J♠ 10♠ 3♦ 4♥"), 3, 500);
    assert.equal(r.win, 1, "로열 플러시는 질 수 없다");
    assert.equal(r.tie, 0);
  });

  it("보드가 최고 핸드면 전부 비긴다", () => {
    // 보드에 로열 플러시 — 내 카드는 의미 없다
    const r = estimateEquity(cards("2♣ 3♦"), cards("A♠ K♠ Q♠ J♠ 10♠"), 2, 500);
    assert.equal(r.win, 0, "이길 수는 없다");
    assert.equal(r.tie, 1, "항상 비긴다");
  });

  it("플러시 드로가 원페어보다 높게 나온다", () => {
    const draw = estimateEquity(cards("A♥ K♥"), cards("Q♥ 7♥ 2♠"), 1, N);
    const pair = estimateEquity(cards("8♣ 8♦"), cards("Q♥ 7♥ 2♠"), 1, N);
    assert.ok(
      draw.win > 0.5,
      `넛 플러시 드로 + 오버카드가 낮다: ${draw.win}`
    );
    assert.ok(pair.win > 0.3, `언더페어가 너무 낮다: ${pair.win}`);
  });

  it("상대가 없으면 계산하지 않고 승리로 본다", () => {
    const r = estimateEquity(cards("2♣ 3♦"), [], 0, N);
    assert.equal(r.win, 1);
    assert.equal(r.iterations, 0, "돌릴 필요가 없다");
  });

  it("내 카드와 보드는 상대 핸드로 다시 뽑히지 않는다", () => {
    // 같은 카드가 두 번 나오면 pokersolver가 엉뚱한 핸드를 만든다.
    // 보드에 A가 3장 깔린 상태에서 내가 나머지 A를 들고 있으면
    // 상대는 절대 A를 가질 수 없어 쿼드가 항상 이긴다.
    const r = estimateEquity(cards("A♠ K♦"), cards("A♥ A♦ A♣ 5♠ 2♥"), 3, 800);
    assert.equal(r.win, 1, "포카드 A + K 키커는 질 수 없다");
  });

  it("판수가 적어도 결과 형식은 유지된다", () => {
    const r = estimateEquity(cards("A♠ A♥"), [], 2, 50);
    assert.equal(r.iterations, 50);
    assert.equal(r.opponents, 2);
    assert.ok(r.win >= 0 && r.win <= 1);
    assert.ok(r.win + r.tie <= 1);
  });
});
