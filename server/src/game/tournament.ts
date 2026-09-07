import type { BlindLevel, GameMode } from "../../../shared/types.ts";

const MIN = 60_000;
const 만 = 10_000;

export interface ModePreset {
  mode: GameMode;
  label: string;
  startingChips: number;
  rebuyChips: number;
  /** 최초 참가를 포함한 총 참가 횟수. 리바인 가능 횟수는 이 값 - 1 */
  totalBuyins: number;
  levels: BlindLevel[];
  /** 정의된 레벨을 모두 쓴 뒤: 계속 2배씩 올릴지, 게임을 끝낼지 */
  afterLastLevel: "double" | "finish";
  /** 게임 시작 후 이 시간이 지나면 브레이크 (한 번만). null이면 브레이크 없음 */
  breakAfterMs: number | null;
  breakDurationMs: number;
}

/**
 * 설계 문서 8장의 표를 그대로 옮긴 것.
 * 앤티는 항상 빅블라인드와 같은 금액이고, 빅블라인드가 대표로 낸다.
 */
const TOURNAMENT: ModePreset = {
  mode: "tournament",
  label: "토너먼트",
  startingChips: 300 * 만,
  rebuyChips: 400 * 만,
  totalBuyins: 3,
  levels: [
    { smallBlind: 1 * 만, bigBlind: 2 * 만, ante: 0, durationMs: 10 * MIN },
    { smallBlind: 2 * 만, bigBlind: 4 * 만, ante: 0, durationMs: 10 * MIN },
    { smallBlind: 3 * 만, bigBlind: 6 * 만, ante: 6 * 만, durationMs: 10 * MIN },
    { smallBlind: 4 * 만, bigBlind: 8 * 만, ante: 8 * 만, durationMs: 10 * MIN },
    { smallBlind: 5 * 만, bigBlind: 10 * 만, ante: 10 * 만, durationMs: 10 * MIN },
    { smallBlind: 10 * 만, bigBlind: 20 * 만, ante: 20 * 만, durationMs: 10 * MIN },
  ],
  afterLastLevel: "double",
  breakAfterMs: 50 * MIN,
  breakDurationMs: 10 * MIN,
};

const TIME_ATTACK: ModePreset = {
  mode: "timeattack",
  label: "타임어택",
  startingChips: 500 * 만,
  rebuyChips: 500 * 만,
  totalBuyins: 4,
  levels: [
    { smallBlind: 10 * 만, bigBlind: 10 * 만, ante: 0, durationMs: 40 * MIN },
    { smallBlind: 50 * 만, bigBlind: 50 * 만, ante: 0, durationMs: 10 * MIN },
  ],
  afterLastLevel: "finish",
  breakAfterMs: null,
  breakDurationMs: 0,
};

export const PRESETS: Record<GameMode, ModePreset> = {
  tournament: TOURNAMENT,
  timeattack: TIME_ATTACK,
};

export function presetFor(mode: GameMode): ModePreset {
  return PRESETS[mode] ?? TOURNAMENT;
}

/**
 * 0부터 세는 레벨 인덱스의 블라인드. 정의된 표를 넘어가면
 * 마지막 레벨을 한 단계마다 2배씩 올린다.
 */
export function levelAt(preset: ModePreset, index: number): BlindLevel {
  const last = preset.levels.length - 1;
  if (index <= last) return preset.levels[index]!;

  const base = preset.levels[last]!;
  const factor = 2 ** (index - last);
  return {
    smallBlind: base.smallBlind * factor,
    bigBlind: base.bigBlind * factor,
    ante: base.ante * factor,
    durationMs: base.durationMs,
  };
}

/** 이 인덱스 다음에도 레벨이 있는지 (없으면 게임 종료) */
export function hasLevelAfter(preset: ModePreset, index: number): boolean {
  return preset.afterLastLevel === "double" || index + 1 < preset.levels.length;
}
