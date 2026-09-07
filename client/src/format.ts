/** 칩을 금액 그대로 볼지, 빅블라인드 배수로 볼지 */
export type ChipUnit = "amount" | "bb";

const KEY = "holdem:chipUnit";

export function loadChipUnit(): ChipUnit {
  return localStorage.getItem(KEY) === "bb" ? "bb" : "amount";
}

export function saveChipUnit(unit: ChipUnit): void {
  localStorage.setItem(KEY, unit);
}

/**
 * 칩 표기. BB 모드에서는 빅블라인드로 나눈 값을 보여준다.
 * 블라인드가 오르면 같은 칩도 BB 수치는 줄어든다 — 그게 토너먼트에서 보고 싶은 값이다.
 */
export function formatChips(
  amount: number,
  unit: ChipUnit,
  bigBlind: number
): string {
  if (unit === "bb" && bigBlind > 0) {
    const bb = amount / bigBlind;
    // 10BB 미만은 소수 한 자리까지 (숏스택일수록 정확도가 중요하다)
    const text = bb >= 10 ? Math.round(bb).toLocaleString() : bb.toFixed(1);
    return `${text}BB`;
  }
  return amount.toLocaleString();
}

/** ms를 m:ss로 */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  return `${m}:${String(total % 60).padStart(2, "0")}`;
}

/** 경과 시간을 h:mm:ss 또는 m:ss로 */
export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
