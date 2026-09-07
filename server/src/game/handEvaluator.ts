// pokersolver는 CommonJS라서 named import가 ESM에서 풀리지 않는다.
import pokersolver from "pokersolver";
import type { Card } from "../../../shared/types.ts";

const { Hand } = pokersolver;
type Hand = InstanceType<typeof Hand>;

const SUIT_CODE: Record<string, string> = {
  "♠": "s", "♥": "h", "♦": "d", "♣": "c",
};

/** { rank: "10", suit: "♥" } → "Th" (pokersolver 표기) */
function toCode(card: Card): string {
  const rank = card.rank === "10" ? "T" : card.rank;
  return `${rank}${SUIT_CODE[card.suit]}`;
}

export interface EvaluatedHand {
  name: string;
  descr: string;
  /** pokersolver 내부 핸들. 비교는 compare()로만 한다. */
  solved: Hand;
}

/** 홀카드 2장 + 커뮤니티 5장 중 최고 5장 조합을 판정한다. */
export function evaluate(hole: Card[], community: Card[]): EvaluatedHand {
  const solved = Hand.solve([...hole, ...community].map(toCode));
  return { name: solved.name, descr: solved.descr, solved };
}

/**
 * 주어진 후보들 중 최고 핸드를 가진 playerId를 모두 돌려준다(동점이면 여럿).
 * 사이드팟마다 자격자만 넣어서 호출한다.
 */
export function pickWinners(
  entries: { playerId: string; hand: EvaluatedHand }[]
): string[] {
  if (entries.length === 0) return [];
  if (entries.length === 1) return [entries[0]!.playerId];
  const best = Hand.winners(entries.map((e) => e.hand.solved));
  return entries
    .filter((e) => best.includes(e.hand.solved))
    .map((e) => e.playerId);
}
