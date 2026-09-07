export interface Contributor {
  id: string;
  /** 이번 핸드에 낸 칩 총합 */
  totalBet: number;
  folded: boolean;
}

export interface Pot {
  amount: number;
  /** 이 팟을 두고 겨룰 수 있는 플레이어 (폴드한 사람은 제외) */
  eligible: string[];
}

/**
 * 각자 낸 칩(totalBet)만으로 메인팟/사이드팟을 만든다.
 *
 * 규칙: 서로 다른 베팅액을 낮은 순으로 층(layer)으로 쪼갠다. 각 층에서
 * 모든 플레이어가 min(자기 베팅, 층 높이)만큼 기여하고, 그 층까지 칩을 낸
 * "폴드하지 않은" 사람만 그 팟의 자격자가 된다.
 * 폴드한 사람의 칩도 팟에는 들어가지만 자격자에서는 빠진다.
 */
export function buildPots(contributors: Contributor[]): Pot[] {
  const levels = [
    ...new Set(contributors.filter((c) => c.totalBet > 0).map((c) => c.totalBet)),
  ].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let prev = 0;

  for (const level of levels) {
    let amount = 0;
    for (const c of contributors) {
      amount += Math.max(0, Math.min(c.totalBet, level) - prev);
    }
    const eligible = contributors
      .filter((c) => !c.folded && c.totalBet >= level)
      .map((c) => c.id);

    if (amount > 0) {
      const last = pots[pots.length - 1];
      // 자격자 구성이 같은 층은 하나로 합친다. 자격자가 아예 없는 층(전원 폴드분)도
      // 앞 팟에 얹어서 칩이 증발하지 않게 한다.
      if (last && (eligible.length === 0 || sameSet(last.eligible, eligible))) {
        last.amount += amount;
      } else {
        pots.push({ amount, eligible });
      }
    }
    prev = level;
  }

  return pots;
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/**
 * 팟을 승자들에게 나눈다. 나누어떨어지지 않는 칩(odd chip)은
 * `oddChipOrder`(딜러 왼쪽부터의 순서)가 빠른 사람에게 한 칩씩 준다.
 */
export function splitPot(
  amount: number,
  winners: string[],
  oddChipOrder: string[]
): Map<string, number> {
  const payouts = new Map<string, number>();
  if (winners.length === 0) return payouts;

  const base = Math.floor(amount / winners.length);
  let remainder = amount - base * winners.length;

  for (const w of winners) payouts.set(w, base);

  const ordered = [...winners].sort(
    (a, b) => oddChipOrder.indexOf(a) - oddChipOrder.indexOf(b)
  );
  let i = 0;
  while (remainder > 0) {
    const p = ordered[i % ordered.length]!;
    payouts.set(p, (payouts.get(p) ?? 0) + 1);
    remainder--;
    i++;
  }
  return payouts;
}
