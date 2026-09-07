import type {
  ActionType,
  Card,
  ClockState,
  GameMode,
  Standing,
  LegalActions,
  Payout,
  Phase,
  PlayerAction,
  PublicPlayer,
  RoomState,
  ShowdownResult,
  ShowdownReveal,
} from "../../../shared/types.ts";
import { buildPots, splitPot, type Pot } from "./betting.ts";
import { createDeck, draw, shuffle } from "./deck.ts";
import { evaluate, pickWinners, type EvaluatedHand } from "./handEvaluator.ts";
import { hasLevelAfter, levelAt, presetFor, type ModePreset } from "./tournament.ts";

export interface Player {
  id: string;
  socketId: string | null;
  name: string;
  seat: number;
  chips: number;
  /** 현재 베팅 라운드에 낸 칩 */
  bet: number;
  /** 이번 핸드에 낸 칩 총합 */
  totalBet: number;
  cards: Card[];
  folded: boolean;
  allIn: boolean;
  connected: boolean;
  /** 이번 라운드에 한 번이라도 액션했는지 */
  hasActed: boolean;
  /** short all-in 뒤에는 콜만 가능하다 (레이즈 재개 금지) */
  raiseLocked: boolean;
  /** 칩이 없거나 핸드 도중 입장해서 이번 핸드는 쉬는 중 */
  sittingOut: boolean;
  /** 이번 핸드에 카드를 받았는지 */
  inHand: boolean;
  /** 방을 떠났고 핸드가 끝나면 좌석을 비운다 (접속 끊김과 구분) */
  leaving: boolean;
  /** 최초 참가를 포함해 지금까지 몇 번 칩을 받았는지 */
  buyinsUsed: number;
  /** 칩이 0이고 리바인도 남지 않음 */
  eliminated: boolean;
  /** 탈락 순서. 순위를 매길 때 나중에 탈락한 사람이 위 */
  eliminatedAt: number | null;
  /** 테이블에서 내려와 구경만 하는 중 (중도 퇴장 또는 탈락) */
  spectating: boolean;
  /** 접속이 끊긴 시각. 오래 돌아오지 않으면 좌석을 정리한다 */
  disconnectedAt: number | null;
  lastAction: ActionType | null;
}

export interface RoomEmitter {
  /** 전원에게 개인화된 room:state를 다시 보낸다 */
  state(): void;
  hole(playerId: string, cards: Card[]): void;
  community(phase: Phase, cards: Card[]): void;
  showdown(result: ShowdownResult): void;
  reveal(r: ShowdownReveal): void;
  log(text: string): void;
  clock(state: ClockState): void;
  finished(standings: Standing[]): void;
}

export interface RoomOptions {
  mode?: GameMode;
  /**
   * 고정 블라인드. 주면 토너먼트 시계(레벨 상승·브레이크)를 쓰지 않는다.
   * 테스트와 단순 플레이용 탈출구다.
   */
  fixedBlinds?: { smallBlind: number; bigBlind: number; ante?: number };
  /** 프리셋의 스타팅칩을 덮어쓴다 */
  startingChips?: number;
  turnTimeoutMs?: number;
  nextHandDelayMs?: number;
  maxPlayers?: number;
}

const noopEmitter: RoomEmitter = {
  state: () => {},
  hole: () => {},
  community: () => {},
  showdown: () => {},
  reveal: () => {},
  log: () => {},
  clock: () => {},
  finished: () => {},
};

export class Room {
  readonly id: string;
  hostId: string;
  players: Player[] = [];
  deck: Card[] = [];
  communityCards: Card[] = [];
  phase: Phase = "waiting";
  dealerIndex = -1;
  currentTurn: string | null = null;
  currentBet = 0;
  minRaise = 0;
  handNumber = 0;
  turnEndsAt: number | null = null;

  readonly preset: ModePreset;
  readonly startingChips: number;
  readonly turnTimeoutMs: number;
  readonly nextHandDelayMs: number;
  readonly maxPlayers: number;

  /** null이면 토너먼트 시계로 블라인드가 오른다 */
  private readonly fixedBlinds: { smallBlind: number; bigBlind: number; ante: number } | null;
  /** 0부터 세는 현재 레벨 */
  levelIndex = 0;
  /** 현재 레벨(또는 브레이크)이 끝나는 시각 */
  levelEndsAt: number | null = null;
  onBreak = false;
  finished = false;
  /** 첫 핸드가 시작된 시각 */
  startedAt: number | null = null;
  standings: Standing[] | null = null;
  private breakTaken = false;
  private levelElapsedMs = 0;
  private levelTimer: NodeJS.Timeout | null = null;
  private eliminationCounter = 0;
  /** autoActWhileDisconnected가 act()를 통해 자기 자신을 다시 부르는 것을 막는다 */
  private autoActing = false;
  /** 앤티처럼 특정인에게 귀속되지 않고 메인팟에 들어가는 칩 */
  private deadMoney = 0;

  emitter: RoomEmitter = noopEmitter;

  /** 쇼다운에서 공개된 카드 (핸드가 끝날 때까지 유지) */
  private revealed = new Set<string>();
  /** 이번 쇼다운의 핸드 평가 결과. 진 사람이 나중에 공개를 고를 때 쓴다 */
  private lastHands = new Map<string, EvaluatedHand>();
  private turnTimer: NodeJS.Timeout | null = null;
  private nextHandTimer: NodeJS.Timeout | null = null;

  constructor(id: string, hostId: string, opts: RoomOptions = {}) {
    this.id = id;
    this.hostId = hostId;
    this.preset = presetFor(opts.mode ?? "tournament");
    this.fixedBlinds = opts.fixedBlinds
      ? { ante: 0, ...opts.fixedBlinds }
      : null;
    this.startingChips = opts.startingChips ?? this.preset.startingChips;
    this.turnTimeoutMs = opts.turnTimeoutMs ?? 45_000;
    this.nextHandDelayMs = opts.nextHandDelayMs ?? 6_000;
    this.maxPlayers = opts.maxPlayers ?? 10;
  }

  // ------------------------------------------------------------- 블라인드/시계

  private get level() {
    return this.fixedBlinds
      ? { ...this.fixedBlinds, durationMs: 0 }
      : levelAt(this.preset, this.levelIndex);
  }

  get smallBlind(): number {
    return this.level.smallBlind;
  }
  get bigBlind(): number {
    return this.level.bigBlind;
  }
  get ante(): number {
    return this.level.ante;
  }

  clockState(): ClockState {
    return {
      mode: this.preset.mode,
      level: this.levelIndex + 1,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      ante: this.ante,
      endsAt: this.levelEndsAt,
      onBreak: this.onBreak,
      finished: this.finished,
      startedAt: this.startedAt,
    };
  }

  /** 첫 핸드가 시작될 때 시계를 켠다. 고정 블라인드 방에서는 아무것도 하지 않는다. */
  private startClockIfNeeded(): void {
    if (this.fixedBlinds || this.levelTimer || this.finished) return;
    this.beginLevel();
  }

  private beginLevel(): void {
    const level = levelAt(this.preset, this.levelIndex);
    this.levelEndsAt = Date.now() + level.durationMs;
    this.setLevelTimer(level.durationMs, () => this.advanceLevel());
    this.emitter.log(
      `블라인드 ${level.smallBlind.toLocaleString()}/${level.bigBlind.toLocaleString()}` +
        (level.ante > 0 ? ` (앤티 ${level.ante.toLocaleString()})` : "")
    );
    this.emitter.clock(this.clockState());
  }

  private advanceLevel(): void {
    this.levelElapsedMs += levelAt(this.preset, this.levelIndex).durationMs;

    const { breakAfterMs, breakDurationMs } = this.preset;
    if (breakAfterMs !== null && !this.breakTaken && this.levelElapsedMs >= breakAfterMs) {
      this.breakTaken = true;
      this.onBreak = true;
      this.levelEndsAt = Date.now() + breakDurationMs;
      this.clearNextHandTimer();
      this.setLevelTimer(breakDurationMs, () => this.endBreak());
      this.emitter.log(`--- 브레이크타임 (${Math.round(breakDurationMs / 60000)}분) ---`);
      this.emitter.clock(this.clockState());
      this.emitter.state();
      return;
    }

    if (!hasLevelAfter(this.preset, this.levelIndex)) {
      this.finishGame("시간이 종료되었습니다");
      return;
    }
    this.levelIndex++;
    this.beginLevel();
    this.emitter.state();
  }

  private endBreak(): void {
    this.onBreak = false;
    if (!hasLevelAfter(this.preset, this.levelIndex)) {
      this.finishGame("시간이 종료되었습니다");
      return;
    }
    this.levelIndex++;
    this.beginLevel();
    this.emitter.log("--- 브레이크 종료 ---");
    if (this.phase === "waiting" || this.phase === "showdown") this.startHand();
    else this.emitter.state();
  }

  private setLevelTimer(ms: number, fn: () => void): void {
    this.clearLevelTimer();
    this.levelTimer = setTimeout(fn, ms);
    this.levelTimer.unref?.();
  }

  private clearLevelTimer(): void {
    if (this.levelTimer) clearTimeout(this.levelTimer);
    this.levelTimer = null;
  }

  /** 게임 종료 — 순위를 확정하고 더 이상 핸드를 시작하지 않는다. */
  private finishGame(reason: string): void {
    if (this.finished) return;
    this.finished = true;
    this.onBreak = false;
    this.levelEndsAt = null;
    this.clearLevelTimer();
    this.clearNextHandTimer();
    this.setTurn(null);

    this.standings = [...this.players]
      .sort((a, b) => {
        if (b.chips !== a.chips) return b.chips - a.chips;
        // 칩이 같으면 나중에 탈락한 사람이 위
        return (b.eliminatedAt ?? Infinity) - (a.eliminatedAt ?? Infinity);
      })
      .map((p, i) => ({ playerId: p.id, name: p.name, chips: p.chips, rank: i + 1 }));

    this.emitter.log(reason);
    this.emitter.clock(this.clockState());
    this.emitter.finished(this.standings);
    this.emitter.state();
  }

  // ---------------------------------------------------------------- 좌석 관리

  addPlayer(id: string, name: string, socketId: string | null): Player {
    const existing = this.players.find((p) => p.id === id);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      existing.disconnectedAt = null;
      existing.name = name;
      return existing;
    }
    if (this.players.length >= this.maxPlayers) {
      throw new Error("방이 가득 찼습니다");
    }
    const player: Player = {
      id,
      socketId,
      name,
      seat: this.nextFreeSeat(),
      chips: this.startingChips,
      bet: 0,
      totalBet: 0,
      cards: [],
      folded: false,
      allIn: false,
      connected: true,
      hasActed: false,
      raiseLocked: false,
      // 핸드 진행 중에 들어왔으면 다음 핸드부터 참여한다
      sittingOut: this.phase !== "waiting",
      inHand: false,
      leaving: false,
      buyinsUsed: 1,
      eliminated: false,
      eliminatedAt: null,
      spectating: false,
      disconnectedAt: null,
      lastAction: null,
    };
    this.players.push(player);
    this.players.sort((a, b) => a.seat - b.seat);
    return player;
  }

  private nextFreeSeat(): number {
    const taken = new Set(this.players.map((p) => p.seat));
    for (let i = 0; i < this.maxPlayers; i++) if (!taken.has(i)) return i;
    return this.players.length;
  }

  /**
   * 게임 시작 전에 자리를 옮긴다.
   * 핸드가 시작되면 좌석 순서가 곧 액션 순서라 도중에 바꿀 수 없다.
   */
  takeSeat(playerId: string, seat: number): void {
    if (this.phase !== "waiting" || this.handNumber > 0) {
      throw new Error("게임 시작 전에만 자리를 옮길 수 있습니다");
    }
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.maxPlayers) {
      throw new Error("없는 자리입니다");
    }
    const p = this.players.find((x) => x.id === playerId);
    if (!p) throw new Error("좌석을 찾을 수 없습니다");
    if (p.seat === seat) return;
    if (this.players.some((x) => x.seat === seat)) {
      throw new Error("이미 앉은 자리입니다");
    }

    p.seat = seat;
    this.players.sort((a, b) => a.seat - b.seat);
    this.emitter.log(`${p.name} 님이 ${seat + 1}번 자리로 옮겼습니다`);
    this.emitter.state();
  }

  removePlayer(id: string): void {
    const p = this.players.find((x) => x.id === id);
    if (!p) return;
    if (p.inHand && !p.folded && this.phase !== "waiting") {
      // 핸드 진행 중이면 폴드 처리만 하고 좌석은 핸드가 끝날 때 정리한다
      // (인덱스가 흔들리면 턴 순서가 깨진다)
      this.applyFold(p);
      p.connected = false;
      p.socketId = null;
      p.sittingOut = true;
      p.leaving = true;
      this.emitter.log(`${p.name} 님이 나갔습니다 (폴드 처리)`);
      this.advance();
      return;
    }
    this.players = this.players.filter((x) => x.id !== id);
    if (this.hostId === id && this.players[0]) this.hostId = this.players[0].id;
    this.emitter.log(`${p.name} 님이 나갔습니다`);
  }

  markDisconnected(socketId: string): Player | null {
    const p = this.players.find((x) => x.socketId === socketId);
    if (!p) return null;
    p.connected = false;
    p.socketId = null;
    p.disconnectedAt = Date.now();
    // 자기 차례에 끊긴 경우에도 45초를 기다리지 않는다
    this.autoActWhileDisconnected();
    return p;
  }

  get seatedCount(): number {
    return this.players.length;
  }

  // ---------------------------------------------------------------- 핸드 시작

  /** 이번 핸드에 참여 가능한 사람 */
  private eligibleForHand(): Player[] {
    return this.players.filter(
      (p) => p.chips > 0 && !p.eliminated && !p.spectating
    );
  }

  startHand(): void {
    this.clearNextHandTimer();
    if (this.finished) return;
    if (this.onBreak) {
      // 브레이크가 끝나면 endBreak()가 다시 시작한다
      this.emitter.state();
      return;
    }
    const eligible = this.eligibleForHand();
    if (eligible.length < 2) {
      this.phase = "waiting";
      this.currentTurn = null;
      this.emitter.log("플레이할 칩을 가진 사람이 2명 미만입니다.");
      this.emitter.state();
      return;
    }

    this.startClockIfNeeded();
    this.startedAt ??= Date.now();

    this.handNumber++;
    this.revealed.clear();
    this.lastHands.clear();
    this.communityCards = [];
    this.deadMoney = 0;
    this.deck = shuffle(createDeck());

    for (const p of this.players) {
      p.bet = 0;
      p.totalBet = 0;
      p.cards = [];
      p.folded = false;
      p.allIn = false;
      p.hasActed = false;
      p.raiseLocked = false;
      p.lastAction = null;
      p.sittingOut = p.chips <= 0 || p.eliminated || p.spectating;
      p.inHand = !p.sittingOut;
    }

    // 첫 핸드는 가장 높은 번호 좌석(10번 자리)에 버튼을 둔다.
    // 그래야 1번 자리가 스몰블라인드부터 시작한다.
    this.dealerIndex =
      this.handNumber === 1
        ? this.lastIndexWhere((p) => p.inHand)
        : this.nextIndexWhere(this.dealerIndex, (p) => p.inHand);

    // 딜러 왼쪽부터 한 장씩 두 바퀴
    const order = this.orderFrom(this.dealerIndex + 1).filter((p) => p.inHand);
    for (let round = 0; round < 2; round++) {
      for (const p of order) p.cards.push(...draw(this.deck, 1));
    }
    for (const p of order) this.emitter.hole(p.id, p.cards);

    this.phase = "preflop";
    this.postBlinds(order);

    this.emitter.log(`--- 핸드 #${this.handNumber} 시작 ---`);

    // 블라인드만으로 전원 올인이 된 경우 더 베팅할 게 없다
    if (this.players.filter((p) => this.canAct(p)).length === 0) {
      this.setTurn(null);
      this.collectBets();
      this.nextPhase();
      return;
    }
    this.emitter.state();
    this.autoActWhileDisconnected();
  }

  private postBlinds(order: Player[]): void {
    const headsUp = order.length === 2;
    // 헤즈업에서는 딜러가 스몰블라인드이고 프리플랍에 먼저 액션한다.
    const sb = headsUp ? this.players[this.dealerIndex]! : order[0]!;
    const bb = headsUp ? order.find((p) => p !== sb)! : order[1]!;

    // 빅블라인드 앤티: BB가 대표로 먼저 내고, 남은 칩으로 블라인드를 낸다.
    // 앤티는 누구의 베팅도 아닌 데드머니라 사이드팟 층을 만들지 않는다.
    if (this.ante > 0) {
      const paid = Math.min(this.ante, bb.chips);
      bb.chips -= paid;
      this.deadMoney += paid;
      if (bb.chips === 0) bb.allIn = true;
    }

    this.payInto(sb, Math.min(this.smallBlind, sb.chips));
    this.payInto(bb, Math.min(this.bigBlind, bb.chips));

    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;

    // 블라인드는 "액션"으로 치지 않는다 — BB에게 옵션이 돌아와야 한다.
    sb.hasActed = false;
    bb.hasActed = false;

    // 헤즈업이면 딜러(=SB)부터, 아니면 BB 다음(UTG)부터. 그 자리부터 포함해서 찾는다.
    const startIdx = headsUp ? this.indexOf(sb) : this.indexOf(bb) + 1;
    const first = this.playerAt(
      this.nextIndexWhere(startIdx - 1, (p) => this.canAct(p))
    );
    this.setTurn(first ? first.id : null);
  }

  // ---------------------------------------------------------------- 액션 처리

  act(playerId: string, action: PlayerAction): void {
    if (this.currentTurn !== playerId) throw new Error("당신의 차례가 아닙니다");
    const p = this.players.find((x) => x.id === playerId);
    if (!p || !this.canAct(p)) throw new Error("행동할 수 없는 상태입니다");

    const legal = this.legalActionsFor(p);

    switch (action.type) {
      case "fold": {
        this.applyFold(p);
        break;
      }
      case "check": {
        if (!legal.canCheck) throw new Error("체크할 수 없습니다 (콜해야 합니다)");
        p.hasActed = true;
        p.lastAction = "check";
        break;
      }
      case "call": {
        if (!legal.canCall) throw new Error("콜할 것이 없습니다");
        this.payInto(p, Math.min(legal.callAmount, p.chips));
        p.hasActed = true;
        p.lastAction = p.allIn ? "allin" : "call";
        break;
      }
      case "raise":
      case "allin": {
        const raiseTo =
          action.type === "allin"
            ? p.bet + p.chips
            : Math.floor(action.amount ?? 0);
        // 스택이 콜 금액에 못 미치는 올인은 레이즈가 아니라 "올인 콜"이다.
        if (action.type === "allin" && raiseTo <= this.currentBet) {
          this.payInto(p, p.chips);
          p.hasActed = true;
          p.lastAction = "allin";
          break;
        }
        this.applyRaise(p, raiseTo, action.type, legal);
        break;
      }
      default:
        throw new Error("알 수 없는 액션입니다");
    }

    this.emitter.log(this.describeAction(p));
    this.advance();
  }

  private applyFold(p: Player): void {
    p.folded = true;
    p.hasActed = true;
    p.lastAction = "fold";
  }

  private applyRaise(
    p: Player,
    raiseTo: number,
    kind: ActionType,
    legal: LegalActions
  ): void {
    const maxTo = p.bet + p.chips;
    if (raiseTo > maxTo) throw new Error("칩이 부족합니다");
    if (raiseTo <= this.currentBet) {
      throw new Error("현재 베팅액보다 높게 올려야 합니다");
    }
    const isAllIn = raiseTo === maxTo;
    if (!isAllIn) {
      if (!legal.canRaise) throw new Error("레이즈할 수 없습니다");
      if (raiseTo < legal.minRaiseTo) {
        throw new Error(`최소 ${legal.minRaiseTo}까지 올려야 합니다`);
      }
    }

    const previousBet = this.currentBet;
    this.payInto(p, raiseTo - p.bet);
    p.hasActed = true;
    p.lastAction = p.allIn ? "allin" : kind === "allin" ? "allin" : "raise";

    const increment = raiseTo - previousBet;
    this.currentBet = raiseTo;

    if (increment >= this.minRaise) {
      // 정식 레이즈 — 베팅이 다시 열린다
      this.minRaise = increment;
      for (const q of this.players) {
        if (q !== p && this.canAct(q)) {
          q.hasActed = false;
          q.raiseLocked = false;
        }
      }
    } else {
      // 최소 레이즈에 못 미치는 올인 — 콜만 받고 레이즈는 다시 열지 않는다
      for (const q of this.players) {
        if (q !== p && this.canAct(q) && q.bet < this.currentBet) {
          if (q.hasActed) q.raiseLocked = true;
          q.hasActed = false;
        }
      }
    }
  }

  /** 칩을 스택에서 베팅으로 옮긴다. */
  private payInto(p: Player, amount: number): void {
    const paid = Math.max(0, Math.min(amount, p.chips));
    p.chips -= paid;
    p.bet += paid;
    p.totalBet += paid;
    if (p.chips === 0) p.allIn = true;
  }

  // ------------------------------------------------------------ 라운드 진행

  private advance(): void {
    this.advanceTurn();
    this.autoActWhileDisconnected();
  }

  /**
   * 접속이 끊긴 사람의 차례는 45초를 기다리지 않고 바로 처리한다.
   * 낼 것이 없으면 체크, 있으면 폴드.
   */
  private autoActWhileDisconnected(): void {
    if (this.autoActing) return;
    this.autoActing = true;
    try {
      let guard = 0;
      while (this.currentTurn && guard++ < 40) {
        const p = this.players.find((x) => x.id === this.currentTurn);
        if (!p || p.connected) break;
        const legal = this.legalActionsFor(p);
        const type = legal.canCheck ? "check" : "fold";
        this.emitter.log(`${p.name}: 접속 끊김 — 자동 ${legal.canCheck ? "체크" : "폴드"}`);
        try {
          this.act(p.id, { type });
        } catch {
          break;
        }
      }
    } finally {
      this.autoActing = false;
    }
  }

  private advanceTurn(): void {
    const contenders = this.players.filter((p) => p.inHand && !p.folded);
    if (contenders.length <= 1) {
      this.endHandUncontested(contenders[0]);
      return;
    }

    const actors = this.players.filter((p) => this.canAct(p));
    const roundDone = actors.every(
      (p) => p.hasActed && p.bet === this.currentBet
    );

    if (!roundDone) {
      const needsAction = (p: Player) =>
        this.canAct(p) && (!p.hasActed || p.bet < this.currentBet);
      const cur = this.players.find((p) => p.id === this.currentTurn);
      // 다른 사람이 나가서 advance()가 불린 경우 현재 차례를 밀면 안 된다
      if (cur && needsAction(cur)) {
        this.emitter.state();
        return;
      }
      const from = cur ? this.indexOf(cur) : this.dealerIndex;
      const next = this.playerAt(this.nextIndexWhere(from, needsAction));
      this.setTurn(next ? next.id : null);
      this.emitter.state();
      return;
    }

    this.collectBets();
    this.nextPhase();
  }

  /** 베팅 라운드 종료 — 라운드 베팅을 정리한다(팟은 totalBet에서 계산). */
  private collectBets(): void {
    for (const p of this.players) {
      p.bet = 0;
      p.hasActed = false;
      p.raiseLocked = false;
    }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
  }

  private nextPhase(): void {
    switch (this.phase) {
      case "preflop":
        this.phase = "flop";
        this.communityCards.push(...draw(this.deck, 3));
        this.emitter.community("flop", this.communityCards.slice(0, 3));
        break;
      case "flop":
        this.phase = "turn";
        this.communityCards.push(...draw(this.deck, 1));
        this.emitter.community("turn", this.communityCards.slice(3, 4));
        break;
      case "turn":
        this.phase = "river";
        this.communityCards.push(...draw(this.deck, 1));
        this.emitter.community("river", this.communityCards.slice(4, 5));
        break;
      case "river":
        this.showdown();
        return;
      default:
        return;
    }

    // 액션할 수 있는 사람이 1명 이하면 더 베팅할 게 없다 — 남은 보드를 다 깔고 쇼다운
    if (this.players.filter((p) => this.canAct(p)).length <= 1) {
      this.nextPhase();
      return;
    }

    const first = this.playerAt(
      this.nextIndexWhere(this.dealerIndex, (p) => this.canAct(p))
    );
    this.setTurn(first ? first.id : null);
    this.emitter.state();
  }

  // ---------------------------------------------------------------- 핸드 종료

  private endHandUncontested(winner: Player | undefined): void {
    this.setTurn(null);
    this.collectBets();
    this.phase = "showdown";

    const payouts: Payout[] = [];
    if (winner) {
      const pots = this.currentPots();
      const total = pots.reduce((s, p) => s + p.amount, 0);
      winner.chips += total;
      payouts.push({ playerId: winner.id, amount: total, potIndex: 0 });
      this.emitter.log(
        `${winner.name} 님이 팟 ${total}을(를) 가져갑니다 (전원 폴드)`
      );
    }
    this.finishHand({
      reveals: [],
      payouts,
      winners: winner ? [winner.id] : [],
    });
  }

  private showdown(): void {
    this.setTurn(null);
    this.phase = "showdown";

    const contenders = this.players.filter((p) => p.inHand && !p.folded);
    const hands = new Map<string, EvaluatedHand>();
    for (const p of contenders) {
      hands.set(p.id, evaluate(p.cards, this.communityCards));
    }
    this.lastHands = hands;

    const oddChipOrder = this.orderFrom(this.dealerIndex + 1).map((p) => p.id);
    const pots = this.currentPots();
    const payouts: Payout[] = [];
    const winners = new Set<string>();

    pots.forEach((pot, potIndex) => {
      const entries = pot.eligible
        .map((id) => ({ playerId: id, hand: hands.get(id)! }))
        .filter((e) => e.hand);
      const potWinners = pickWinners(entries);
      const split = splitPot(pot.amount, potWinners, oddChipOrder);
      for (const [playerId, amount] of split) {
        const p = this.players.find((x) => x.id === playerId)!;
        p.chips += amount;
        payouts.push({ playerId, amount, potIndex });
        winners.add(playerId);
      }
    });

    // 올인이 걸린 핸드는 전원 공개가 원칙이다. 그 외에는 이긴 핸드만 열고,
    // 진 사람은 공개할지 스스로 고른다.
    const allInShowdown = contenders.some((p) => p.allIn);
    for (const p of contenders) {
      if (allInShowdown || winners.has(p.id)) this.revealed.add(p.id);
    }

    const reveals: ShowdownReveal[] = contenders
      .filter((p) => this.revealed.has(p.id))
      .map((p) => ({
        playerId: p.id,
        cards: p.cards,
        handName: hands.get(p.id)!.name,
        handDescr: hands.get(p.id)!.descr,
      }));

    for (const payout of payouts) {
      const p = this.players.find((x) => x.id === payout.playerId)!;
      this.emitter.log(
        `${p.name} 님 승리 — ${hands.get(p.id)?.descr ?? ""} (+${payout.amount})`
      );
    }

    this.finishHand({ reveals, payouts, winners: [...winners] });
  }

  private finishHand(result: Omit<ShowdownResult, "nextHandAt">): void {
    // 핸드가 끝난 뒤에야 나간 사람의 좌석을 정리한다
    this.players = this.players.filter((p) => !p.leaving);
    if (this.dealerIndex >= this.players.length) this.dealerIndex = this.players.length - 1;
    for (const p of this.players) {
      if (p.chips > 0) continue;
      p.sittingOut = true;
      // 리바인이 남아 있으면 아직 탈락이 아니다 — 리바인을 기다린다
      if (!p.eliminated && !p.spectating && this.rebuysLeftFor(p) <= 0) {
        p.eliminated = true;
        p.eliminatedAt = ++this.eliminationCounter;
        this.emitter.log(`${p.name} 님 탈락`);
      }
    }

    const survivors = this.players.filter(
      (p) => !p.eliminated && !p.spectating && (p.chips > 0 || this.rebuysLeftFor(p) > 0)
    );
    if (survivors.length <= 1 && this.players.length > 1) {
      this.emitter.showdown({ ...result, nextHandAt: null });
      this.finishGame(
        survivors[0] ? `${survivors[0].name} 님 우승!` : "게임이 종료되었습니다"
      );
      return;
    }

    const canContinue = this.eligibleForHand().length >= 2 && !this.onBreak;
    const nextHandAt = canContinue ? Date.now() + this.nextHandDelayMs : null;

    this.emitter.showdown({ ...result, nextHandAt });
    this.emitter.state();

    if (canContinue) {
      this.nextHandTimer = setTimeout(() => this.startHand(), this.nextHandDelayMs);
      this.nextHandTimer.unref?.();
    } else if (this.onBreak) {
      this.emitter.log("브레이크가 끝나면 다음 핸드가 시작됩니다.");
    } else {
      this.emitter.log("리바인을 기다리는 중입니다.");
    }
  }

  // ------------------------------------------------------------ 카드 공개 선택

  /** 진 사람이 쇼다운 뒤에 자기 카드를 열 수 있는 상태인지 */
  canShowCards(p: Player): boolean {
    return (
      this.phase === "showdown" &&
      this.lastHands.has(p.id) &&
      !this.revealed.has(p.id)
    );
  }

  /** 진 사람이 스스로 카드를 공개한다. */
  showCards(playerId: string): void {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) throw new Error("좌석을 찾을 수 없습니다");
    const hand = this.lastHands.get(playerId);
    if (!hand) throw new Error("공개할 핸드가 없습니다");
    if (this.revealed.has(playerId)) throw new Error("이미 공개했습니다");

    this.revealed.add(playerId);
    this.emitter.log(`${p.name} 님이 카드를 공개했습니다 — ${hand.descr}`);
    this.emitter.reveal({
      playerId,
      cards: p.cards,
      handName: hand.name,
      handDescr: hand.descr,
    });
    this.emitter.state();
  }

  // -------------------------------------------------------- 중도 퇴장 / 관전

  /**
   * 테이블에서 내려온다. 남은 칩은 사라진다(번칩).
   * 관전자가 되어 계속 보고 채팅할 수 있고, 리바인이 남았으면 다시 들어올 수 있다.
   */
  leaveTable(playerId: string): void {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) throw new Error("좌석을 찾을 수 없습니다");
    if (p.spectating) throw new Error("이미 관전 중입니다");

    const burned = p.chips;
    p.chips = 0;
    p.spectating = true;
    p.sittingOut = true;

    // 핸드 진행 중이었다면 폴드 처리하고 차례를 넘긴다
    const wasInHand = p.inHand && !p.folded && this.handLive;
    if (wasInHand) this.applyFold(p);

    this.emitter.log(
      burned > 0
        ? `${p.name} 님이 테이블에서 내려갔습니다 (칩 ${burned.toLocaleString()} 소멸)`
        : `${p.name} 님이 테이블에서 내려갔습니다`
    );

    if (wasInHand) this.advance();
    else this.emitter.state();
  }

  /** 관전자를 포함해 방에 남아 있는 사람 수 */
  get occupantCount(): number {
    return this.players.length;
  }

  /**
   * 돌아오지 않는 좌석을 정리한다. 정리 후 방이 비었으면 true.
   * 이게 없으면 전원이 브라우저를 닫은 방이 영영 남는다.
   */
  sweepDisconnected(graceMs: number): boolean {
    const cutoff = Date.now() - graceMs;
    // <= 로 비교해야 graceMs가 0일 때 "즉시 정리"가 된다
    const gone = this.players.filter(
      (p) => !p.connected && p.disconnectedAt !== null && p.disconnectedAt <= cutoff
    );
    for (const p of gone) {
      this.emitter.log(`${p.name} 님이 오래 돌아오지 않아 자리를 정리했습니다`);
      p.leaving = true;
    }
    if (gone.length === 0) return this.players.length === 0;

    if (this.handLive) {
      // 핸드 중이면 폴드만 시키고 좌석은 finishHand가 정리한다
      for (const p of gone) if (p.inHand && !p.folded) this.applyFold(p);
      this.advance();
    } else {
      this.players = this.players.filter((p) => !p.leaving);
      if (this.dealerIndex >= this.players.length) {
        this.dealerIndex = this.players.length - 1;
      }
      if (this.hostId && !this.players.some((p) => p.id === this.hostId)) {
        if (this.players[0]) this.hostId = this.players[0].id;
      }
      this.emitter.state();
    }
    return this.players.length === 0;
  }

  // ------------------------------------------------------------------ 리바인

  rebuysLeftFor(p: Player): number {
    return Math.max(0, this.preset.totalBuyins - p.buyinsUsed);
  }

  /** 진행 중인 핸드에 참여하고 있는 동안에는 리바인할 수 없다. */
  private get handLive(): boolean {
    return this.phase !== "waiting" && this.phase !== "showdown";
  }

  canRebuy(p: Player): boolean {
    return (
      !this.finished &&
      !p.eliminated &&
      p.chips === 0 &&
      !(this.handLive && p.inHand) &&
      this.rebuysLeftFor(p) > 0
    );
  }

  /** 칩이 0이 된 사람이 다시 사서 들어온다. */
  rebuy(playerId: string): void {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) throw new Error("좌석을 찾을 수 없습니다");
    if (this.finished) throw new Error("게임이 이미 끝났습니다");
    if (p.eliminated) throw new Error("이미 탈락했습니다");
    if (p.chips > 0) throw new Error("칩이 다 떨어졌을 때만 리바인할 수 있습니다");
    if (this.handLive && p.inHand) throw new Error("핸드가 끝난 뒤에 리바인할 수 있습니다");
    if (this.rebuysLeftFor(p) <= 0) throw new Error("리바인 횟수를 모두 썼습니다");

    p.buyinsUsed++;
    p.chips = this.preset.rebuyChips;
    p.sittingOut = false;
    p.spectating = false;
    this.emitter.log(
      `${p.name} 님 리바인 (+${p.chips.toLocaleString()}, 남은 횟수 ${this.rebuysLeftFor(p)})`
    );

    // 리바인 덕분에 다시 게임이 가능해졌다면 이어서 진행한다
    const idle =
      (this.phase === "waiting" || this.phase === "showdown") &&
      !this.nextHandTimer &&
      !this.onBreak;
    if (idle && this.eligibleForHand().length >= 2) {
      this.nextHandTimer = setTimeout(() => this.startHand(), this.nextHandDelayMs);
      this.nextHandTimer.unref?.();
    }
    this.emitter.state();
  }

  // ------------------------------------------------------------------- 유틸

  private canAct(p: Player): boolean {
    return p.inHand && !p.folded && !p.allIn && p.chips > 0;
  }

  private indexOf(p: Player): number {
    return this.players.indexOf(p);
  }

  private playerAt(index: number): Player | undefined {
    return index < 0 ? undefined : this.players[index];
  }

  /** 조건에 맞는 마지막(가장 높은 좌석 번호) 플레이어의 인덱스. 없으면 -1 */
  private lastIndexWhere(pred: (p: Player) => boolean): number {
    for (let i = this.players.length - 1; i >= 0; i--) {
      if (pred(this.players[i]!)) return i;
    }
    return -1;
  }

  /** from 다음 인덱스부터 한 바퀴 돌며 조건에 맞는 첫 플레이어의 인덱스. 없으면 -1 */
  private nextIndexWhere(from: number, pred: (p: Player) => boolean): number {
    const n = this.players.length;
    if (n === 0) return -1;
    for (let i = 1; i <= n; i++) {
      const idx = (((from + i) % n) + n) % n;
      if (pred(this.players[idx]!)) return idx;
    }
    return -1;
  }

  /** start 인덱스부터 좌석 순서대로 한 바퀴 */
  private orderFrom(start: number): Player[] {
    const n = this.players.length;
    const out: Player[] = [];
    for (let i = 0; i < n; i++) out.push(this.players[(((start + i) % n) + n) % n]!);
    return out;
  }

  /** 팟 분배의 기준. 라운드가 끝나 베팅이 정산된 시점에 호출한다. */
  currentPots(): Pot[] {
    return this.withDeadMoney(
      buildPots(
        this.players
          .filter((p) => p.totalBet > 0 || p.inHand)
          .map((p) => ({ id: p.id, totalBet: p.totalBet, folded: p.folded }))
      )
    );
  }

  /** 앤티를 메인팟에 얹는다. 팟이 아직 없으면 겨루는 사람 전원이 자격자인 팟을 만든다. */
  private withDeadMoney(pots: Pot[]): Pot[] {
    if (this.deadMoney <= 0) return pots;
    if (pots.length === 0) {
      const eligible = this.players
        .filter((p) => p.inHand && !p.folded)
        .map((p) => p.id);
      return [{ amount: this.deadMoney, eligible }];
    }
    return pots.map((pot, i) =>
      i === 0 ? { ...pot, amount: pot.amount + this.deadMoney } : pot
    );
  }

  /**
   * 화면에 보여줄 팟 구성. 아직 콜되지 않은 이번 라운드 베팅(p.bet)은 빼고 계산한다.
   * 그렇게 하지 않으면 블라인드만 놓인 프리플랍에도 사이드팟이 있는 것처럼 보인다.
   */
  private settledPots(): Pot[] {
    return this.withDeadMoney(
      buildPots(
        this.players
          .filter((p) => p.totalBet - p.bet > 0)
          .map((p) => ({ id: p.id, totalBet: p.totalBet - p.bet, folded: p.folded }))
      )
    );
  }

  private describeAction(p: Player): string {
    switch (p.lastAction) {
      case "fold": return `${p.name}: 폴드`;
      case "check": return `${p.name}: 체크`;
      case "call": return `${p.name}: 콜 ${p.bet}`;
      case "raise": return `${p.name}: 레이즈 → ${p.bet}`;
      case "allin": return `${p.name}: 올인 ${p.bet}`;
      default: return `${p.name}: ?`;
    }
  }

  private setTurn(playerId: string | null): void {
    this.clearTurnTimer();
    this.currentTurn = playerId;
    this.turnEndsAt = null;
    if (!playerId || this.turnTimeoutMs <= 0) return;

    this.turnEndsAt = Date.now() + this.turnTimeoutMs;
    this.turnTimer = setTimeout(() => {
      const p = this.players.find((x) => x.id === playerId);
      if (!p || this.currentTurn !== playerId) return;
      const legal = this.legalActionsFor(p);
      this.emitter.log(`${p.name}: 시간 초과`);
      try {
        this.act(playerId, { type: legal.canCheck ? "check" : "fold" });
      } catch {
        /* 이미 상태가 바뀐 경우 무시 */
      }
    }, this.turnTimeoutMs);
    this.turnTimer.unref?.();
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
  }

  private clearNextHandTimer(): void {
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    this.nextHandTimer = null;
  }

  dispose(): void {
    this.clearTurnTimer();
    this.clearNextHandTimer();
    this.clearLevelTimer();
  }

  legalActionsFor(p: Player): LegalActions {
    const toCall = Math.max(0, this.currentBet - p.bet);
    const canCall = toCall > 0 && p.chips > 0;
    const maxRaiseTo = p.bet + p.chips;
    const minRaiseTo = this.currentBet + this.minRaise;
    return {
      canFold: true,
      canCheck: toCall === 0,
      canCall,
      callAmount: Math.min(toCall, p.chips),
      // 올인으로라도 현재 베팅을 넘길 수 있으면 레이즈 슬라이더를 연다
      canRaise: !p.raiseLocked && maxRaiseTo > this.currentBet,
      minRaiseTo: Math.min(minRaiseTo, maxRaiseTo),
      maxRaiseTo,
    };
  }

  // -------------------------------------------------------------- 상태 직렬화

  /**
   * viewerId에게 보낼 상태. 남의 홀카드는 여기서 잘라낸다 —
   * 마스킹이 이 한 곳에만 있어야 실수로 새는 경로가 안 생긴다.
   */
  toPublicState(viewerId: string): RoomState {
    const viewer = this.players.find((p) => p.id === viewerId);
    const pots = this.settledPots();
    // 좌석 앞에 놓인 이번 라운드 베팅까지 합친 값이 사람들이 기대하는 "팟"이다
    const totalPot =
      this.players.reduce((sum, p) => sum + p.totalBet, 0) + this.deadMoney;

    const players: PublicPlayer[] = this.players.map((p) => {
      const visible = p.id === viewerId || this.revealed.has(p.id);
      return {
        id: p.id,
        name: p.name,
        seat: p.seat,
        chips: p.chips,
        bet: p.bet,
        totalBet: p.totalBet,
        folded: p.folded,
        allIn: p.allIn,
        connected: p.connected,
        sittingOut: p.sittingOut,
        hasCards: p.inHand && p.cards.length > 0 && !p.folded,
        cards: visible && p.cards.length > 0 ? p.cards : null,
        isDealer: this.players[this.dealerIndex]?.id === p.id,
        lastAction: p.lastAction,
        rebuysLeft: this.rebuysLeftFor(p),
        eliminated: p.eliminated,
        spectating: p.spectating,
      };
    });

    return {
      roomId: this.id,
      hostId: this.hostId,
      phase: this.phase,
      players,
      communityCards: this.communityCards,
      pots: pots.map((p) => ({ amount: p.amount, eligible: p.eligible })),
      totalPot,
      currentTurn: this.currentTurn,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      handNumber: this.handNumber,
      maxPlayers: this.maxPlayers,
      youId: viewerId,
      legalActions:
        viewer && this.currentTurn === viewerId
          ? this.legalActionsFor(viewer)
          : null,
      turnEndsAt: this.turnEndsAt,
      clock: this.clockState(),
      canRebuy: viewer ? this.canRebuy(viewer) : false,
      canShowCards: viewer ? this.canShowCards(viewer) : false,
      standings: this.standings,
    };
  }
}
