/** 서버와 클라이언트가 공유하는 프로토콜 타입 정의. */

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "J" | "Q" | "K" | "A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

/** 게임 방식. 방을 만들 때 하나를 고른다. */
export type GameMode = "tournament" | "timeattack";

export interface BlindLevel {
  smallBlind: number;
  bigBlind: number;
  /** 빅블라인드가 대표로 내는 앤티. 0이면 앤티 없음 */
  ante: number;
  durationMs: number;
}

/** 토너먼트 시계. 브레이크 중이거나 게임이 끝나면 새 핸드가 시작되지 않는다. */
export interface ClockState {
  mode: GameMode;
  /** 1부터 세는 현재 레벨 번호 */
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  /** 현재 레벨(또는 브레이크)이 끝나는 시각(epoch ms) */
  endsAt: number | null;
  onBreak: boolean;
  finished: boolean;
  /** 첫 핸드가 시작된 시각(epoch ms). 아직 안 시작했으면 null */
  startedAt: number | null;
}

export interface Standing {
  playerId: string;
  name: string;
  chips: number;
  /** 1위부터 */
  rank: number;
}

export type Phase =
  | "waiting"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown";

/**
 * 설계 문서의 액션 목록에 `check`를 더했다.
 * check 없이는 포스트플랍 첫 액션과 프리플랍 빅블라인드가 표현되지 않는다.
 */
export type ActionType = "fold" | "check" | "call" | "raise" | "allin";

export interface PlayerAction {
  type: ActionType;
  /** raise일 때만 사용. "이 라운드 총 베팅액을 얼마로 올릴지"(raise-to)를 뜻한다. */
  amount?: number;
}

/** 내 차례에 서버가 계산해서 내려주는, 지금 실제로 누를 수 있는 버튼들. */
export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  /** 콜에 필요한 추가 칩. 스택보다 크면 콜=올인이 된다. */
  callAmount: number;
  canRaise: boolean;
  /** raise-to 최소값 */
  minRaiseTo: number;
  /** raise-to 최대값 (= 내 스택 전부) */
  maxRaiseTo: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  seat: number;
  chips: number;
  /** 현재 베팅 라운드에 낸 칩 */
  bet: number;
  /** 이번 핸드에 낸 칩 총합 */
  totalBet: number;
  folded: boolean;
  allIn: boolean;
  connected: boolean;
  sittingOut: boolean;
  /** 카드를 들고 있는지 (뒷면 렌더링 여부 판단용) */
  hasCards: boolean;
  /**
   * 본인 카드이거나 쇼다운에서 공개된 경우에만 값이 들어온다.
   * 그 외에는 항상 null — 남의 홀카드는 서버 밖으로 나가지 않는다.
   */
  cards: Card[] | null;
  isDealer: boolean;
  lastAction: ActionType | null;
  /** 남은 리바인 횟수 */
  rebuysLeft: number;
  /** 칩이 0이고 리바인도 남지 않아 탈락 */
  eliminated: boolean;
  /**
   * 테이블에서 내려와 구경만 하는 중.
   * 중도 퇴장했거나 탈락한 경우다. 좌석은 비어 있는 것으로 그린다.
   */
  spectating: boolean;
}

export interface PotView {
  amount: number;
  /** 이 팟을 가져갈 자격이 있는 플레이어 id 목록 */
  eligible: string[];
}

export interface RoomState {
  roomId: string;
  hostId: string;
  phase: Phase;
  players: PublicPlayer[];
  communityCards: Card[];
  pots: PotView[];
  /** 팟 총액 + 이번 라운드에 아직 팟으로 안 모인 베팅 */
  totalPot: number;
  currentTurn: string | null;
  /** 이번 라운드 최고 베팅액 */
  currentBet: number;
  minRaise: number;
  smallBlind: number;
  bigBlind: number;
  handNumber: number;
  /** 이 방의 좌석 수 (좌석 선택 화면에서 빈 자리를 그린다) */
  maxPlayers: number;
  /** 이 상태를 받는 사람의 playerId */
  youId: string;
  /** 내 차례가 아니면 null */
  legalActions: LegalActions | null;
  /** 현재 액션 플레이어의 남은 시간(ms). 차례가 없으면 null */
  turnEndsAt: number | null;
  clock: ClockState;
  /** 지금 이 사람이 리바인할 수 있는지 (칩 0 + 횟수 남음) */
  canRebuy: boolean;
  /** 게임이 끝났을 때의 최종 순위. 진행 중이면 null */
  standings: Standing[] | null;
  /** 지금 내 카드를 공개할지 고를 수 있는 상태인지 (진 쪽의 선택) */
  canShowCards: boolean;
}

export interface HoleCardsPayload {
  cards: Card[];
}

export interface ShowdownReveal {
  playerId: string;
  cards: Card[];
  /** 예: "Two Pair" */
  handName: string;
  /** 예: "Two Pair, A's & 9's" */
  handDescr: string;
}

export interface Payout {
  playerId: string;
  amount: number;
  potIndex: number;
}

export interface ShowdownResult {
  /**
   * 자동으로 공개되는 핸드만 담긴다.
   * 올인이 없었다면 이긴 핸드만, 올인이 있었다면 겨룬 사람 전원.
   * 진 사람은 스스로 공개를 선택할 수 있다(showdown:reveal).
   */
  reveals: ShowdownReveal[];
  payouts: Payout[];
  winners: string[];
  /** 다음 핸드가 시작되는 시각(epoch ms). null이면 게임 종료(참가자 부족). */
  nextHandAt: number | null;
}

export interface ChatOrLogEntry {
  text: string;
  at: number;
}

export interface ChatMessage {
  playerId: string;
  name: string;
  text: string;
  at: number;
  /** 관전자가 보낸 메시지인지 */
  spectator: boolean;
}

/** 채팅 한 줄의 최대 길이 */
export const CHAT_MAX_LENGTH = 200;

/** 클라이언트 → 서버 */
export interface ClientToServerEvents {
  "room:create": (
    p: { name: string; playerId: string; mode: GameMode },
    cb: (r: Ack<{ roomId: string }>) => void
  ) => void;
  "room:join": (
    p: { roomId: string; name: string; playerId: string },
    cb: (r: Ack<{ roomId: string }>) => void
  ) => void;
  "room:leave": () => void;
  "room:start": (cb: (r: Ack<null>) => void) => void;
  "player:action": (p: PlayerAction, cb: (r: Ack<null>) => void) => void;
  "player:rebuy": (cb: (r: Ack<null>) => void) => void;
  /** 테이블에서 내려온다. 남은 칩은 사라지고 관전자가 된다. */
  "table:leave": (cb: (r: Ack<null>) => void) => void;
  "chat:send": (p: { text: string }, cb: (r: Ack<null>) => void) => void;
  /** 쇼다운에서 진 사람이 자기 카드를 공개한다 */
  "hand:show": (cb: (r: Ack<null>) => void) => void;
  /** 게임 시작 전에 자리를 고른다 */
  "seat:take": (p: { seat: number }, cb: (r: Ack<null>) => void) => void;
}

/** 서버 → 클라이언트 */
export interface ServerToClientEvents {
  "room:state": (s: RoomState) => void;
  "deal:hole": (p: HoleCardsPayload) => void;
  "deal:community": (p: { phase: Phase; cards: Card[] }) => void;
  "showdown:result": (r: ShowdownResult) => void;
  "player:disconnected": (p: { playerId: string; name: string }) => void;
  "room:log": (e: ChatOrLogEntry) => void;
  "room:closed": (p: { reason: string }) => void;
  /** 레벨 상승, 브레이크 시작/종료, 게임 종료 */
  "clock:update": (c: ClockState) => void;
  "game:finished": (p: { standings: Standing[] }) => void;
  "chat:message": (m: ChatMessage) => void;
  /** 누군가 스스로 카드를 공개했다 */
  "showdown:reveal": (r: ShowdownReveal) => void;
}

export type Ack<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
