/**
 * pokersolver가 돌려주는 영어 족보 이름을 한국어로 옮긴다.
 *
 * 로열 플러시는 name이 "Straight Flush"로 오고 descr로만 구분되므로
 * descr을 먼저 본다.
 */
const NAMES: Record<string, string> = {
  "High Card": "하이 카드",
  Pair: "원 페어",
  "Two Pair": "투 페어",
  "Three of a Kind": "트리플",
  Straight: "스트레이트",
  Flush: "플러시",
  "Full House": "풀 하우스",
  "Four of a Kind": "포카드",
  "Straight Flush": "스트레이트 플러시",
  "Royal Flush": "로열 플러시",
};

/** "A's & Q's" 같은 표기에서 끗수만 뽑아 "A, Q"로 */
function ranks(descr: string): string {
  const after = descr.includes(",") ? descr.slice(descr.indexOf(",") + 1) : descr;
  const found = after.match(/\b(10|[2-9]|[TJQKA])(?=s|\b)/g) ?? [];
  const seen: string[] = [];
  for (const r of found) {
    const rank = r === "T" ? "10" : r;
    if (!seen.includes(rank)) seen.push(rank);
  }
  return seen.slice(0, 2).join(", ");
}

/** 좁은 명패에 들어가도록 줄인 이름. 실제로 쓰는 말로 골랐다. */
const SHORT: Record<string, string> = {
  "하이 카드": "하이",
  "원 페어": "원페어",
  "투 페어": "투페어",
  트리플: "트리플",
  스트레이트: "스트레이트",
  플러시: "플러시",
  "풀 하우스": "풀하우스",
  포카드: "포카드",
  "스트레이트 플러시": "스티플",
  "로열 플러시": "로티플",
};

export function koreanHand(hand: { name: string; descr: string }): {
  /** 명패에 넣을 짧은 이름 */
  label: string;
  /** 툴팁·넓은 화면용 전체 이름 */
  full: string;
  detail: string;
} {
  const royal = hand.descr.startsWith("Royal");
  const full = royal ? "로열 플러시" : NAMES[hand.name] ?? hand.name;
  const label = SHORT[full] ?? full;

  // 하이 카드와 스트레이트/플러시는 "무엇이 높은지"가 핵심이다
  if (royal) return { label, full, detail: "" };
  const highOnly =
    hand.name === "High Card" ||
    hand.name === "Straight" ||
    hand.name === "Flush" ||
    hand.name === "Straight Flush";
  const r = ranks(hand.descr);
  return { label, full, detail: highOnly ? `${r} 하이` : r };
}
