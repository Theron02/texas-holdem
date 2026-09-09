/**
 * 각 행동의 기대값.
 *
 * 전제 두 가지를 분명히 해둔다. 이걸 빼먹으면 숫자를 잘못 믿게 된다.
 *  1) 승률은 "상대가 아무 카드나 들고 있다고 볼 때"의 값이다.
 *  2) 지금 콜하면 더 베팅 없이 쇼다운까지 간다고 본다.
 * 그래서 폴드·콜은 이 전제 위에서 정확하고, 레이즈는 상대가 얼마나 접는지에
 * 달려 있어 단정할 수 없다. 레이즈는 "몇 %를 접게 만들면 본전인지"로 답한다.
 */

export type EvAction = "fold" | "check" | "call" | "raise";

export interface ActionEv {
  action: EvAction;
  /** 기대값(칩). 확정할 수 없으면 null */
  ev: number | null;
  /** 레이즈일 때: 상대가 이 비율 이상 접으면 이득 (0~1) */
  breakevenFold?: number;
  /** 확정 가능한 행동 중 기대값이 가장 높은 것 */
  best: boolean;
}

export interface EvInput {
  /** 이길 확률 0~1 */
  win: number;
  /** 비길 확률 0~1 */
  tie: number;
  /** 지금 가운데 쌓인 칩 (내 이번 라운드 베팅 포함) */
  pot: number;
  /** 콜에 더 넣어야 하는 칩 */
  toCall: number;
  canCheck: boolean;
  canRaise: boolean;
  /** 레이즈할 총액 (raise-to) */
  raiseTo: number;
  /** 내가 이번 라운드에 이미 낸 칩 */
  myBet: number;
}

export function actionEvs(input: EvInput): ActionEv[] {
  const { win, tie, pot, toCall, canCheck, canRaise, raiseTo, myBet } = input;
  const lose = Math.max(0, 1 - win - tie);
  const out: ActionEv[] = [];

  // 폴드는 언제나 0이다. 이미 낸 칩은 어차피 돌아오지 않는다.
  if (!canCheck) out.push({ action: "fold", ev: 0, best: false });

  // 체크는 공짜다. 낼 게 없을 때만 가능하므로 폴드보다 항상 낫다.
  if (canCheck) out.push({ action: "check", ev: 0, best: false });

  if (toCall > 0) {
    // 이기면 팟을 가져가고(순이익 = pot), 비기면 반, 지면 콜한 만큼 잃는다
    const ev = win * pot + tie * ((pot - toCall) / 2) - lose * toCall;
    out.push({ action: "call", ev, best: false });
  }

  if (canRaise && raiseTo > myBet) {
    // 더 넣는 칩. 다 접으면 pot을 먹고, 콜당하면 그만큼 위험을 진다.
    const risk = raiseTo - myBet;
    out.push({
      action: "raise",
      ev: null,
      breakevenFold: risk / (pot + risk),
      best: false,
    });
  }

  // 확정 가능한 것들 중 최선을 고른다 (레이즈는 단정할 수 없어 제외)
  const decidable = out.filter((a) => a.ev !== null);
  if (decidable.length > 0) {
    const top = Math.max(...decidable.map((a) => a.ev!));
    for (const a of decidable) if (a.ev === top) a.best = true;
  }
  return out;
}
