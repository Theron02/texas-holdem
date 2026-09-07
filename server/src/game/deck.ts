import { randomInt } from "node:crypto";
import type { Card, Rank, Suit } from "../../../shared/types.ts";

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank });
  }
  return deck;
}

/**
 * Fisher-Yates. Math.random 대신 crypto.randomInt를 쓴다 —
 * 모듈로 편향이 없고 예측이 어렵다.
 */
export function shuffle(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

/** 덱에서 n장을 뽑아낸다(덱을 직접 변형). */
export function draw(deck: Card[], n: number): Card[] {
  if (deck.length < n) throw new Error("덱에 남은 카드가 부족합니다");
  return deck.splice(0, n);
}
