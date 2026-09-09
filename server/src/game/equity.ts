import type { Card } from "../../../shared/types.ts";
import { createDeck } from "./deck.ts";
import { evaluate, pickWinners } from "./handEvaluator.ts";

export interface EquityResult {
  /** 이길 확률 0~1 */
  win: number;
  /** 비길 확률 0~1 */
  tie: number;
  opponents: number;
  iterations: number;
}

const key = (c: Card) => `${c.rank}${c.suit}`;
const ME = "me";

/**
 * 몬테카를로 승률.
 *
 * 인자가 내 카드·보드·상대 "수"뿐이라는 게 중요하다. 상대의 실제 카드는
 * 아예 받지 않으므로 구조적으로 새어나갈 수 없다. 상대 핸드는 남은 덱에서
 * 무작위로 뽑는다 — 즉 "상대가 아무 카드나 들고 있다고 볼 때"의 승률이다.
 *
 * 셔플과 달리 여기서는 Math.random을 쓴다. 공정성이 걸린 곳이 아니고
 * crypto를 반복 호출하면 느리다.
 */
export function estimateEquity(
  hole: Card[],
  board: Card[],
  opponents: number,
  iterations = 2000
): EquityResult {
  if (hole.length !== 2 || opponents < 1) {
    return { win: opponents < 1 ? 1 : 0, tie: 0, opponents, iterations: 0 };
  }

  const known = new Set([...hole, ...board].map(key));
  const deck = createDeck().filter((c) => !known.has(key(c)));
  const boardNeeded = 5 - board.length;
  const draws = boardNeeded + opponents * 2;
  if (draws > deck.length) {
    return { win: 0, tie: 0, opponents, iterations: 0 };
  }

  let wins = 0;
  let ties = 0;

  for (let i = 0; i < iterations; i++) {
    // 필요한 장수만 앞으로 섞어 뽑는다 (전체를 섞을 필요가 없다)
    for (let j = 0; j < draws; j++) {
      const k = j + Math.floor(Math.random() * (deck.length - j));
      const tmp = deck[j]!;
      deck[j] = deck[k]!;
      deck[k] = tmp;
    }

    const fullBoard = board.concat(deck.slice(0, boardNeeded));

    const entries = [{ playerId: ME, hand: evaluate(hole, fullBoard) }];
    for (let o = 0; o < opponents; o++) {
      const at = boardNeeded + o * 2;
      entries.push({
        playerId: `o${o}`,
        hand: evaluate([deck[at]!, deck[at + 1]!], fullBoard),
      });
    }

    const best = pickWinners(entries);
    if (best.includes(ME)) {
      if (best.length === 1) wins++;
      else ties++;
    }
  }

  return { win: wins / iterations, tie: ties / iterations, opponents, iterations };
}
