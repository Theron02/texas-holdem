import { actionEvs } from "../../../shared/ev.ts";
import type { EquityView, RoomState } from "../../../shared/types.ts";
import { formatChips, type ChipUnit } from "../format.ts";

const ACTION_LABEL: Record<string, string> = {
  fold: "폴드",
  check: "체크",
  call: "콜",
  raise: "레이즈",
};

interface Props {
  state: RoomState;
  equity: EquityView | null;
  loading: boolean;
  unit: ChipUnit;
  /** 지금 슬라이더에 잡힌 레이즈 금액 */
  raiseAmount: number;
}

/**
 * 팟 오즈·스택 지표·승률.
 *
 * 승률은 "상대가 아무 카드나 들고 있다고 볼 때"의 값이다. 상대의 실제 카드는
 * 서버도 계산에 넣지 않는다 — 그건 승률이 아니라 치팅이다.
 */
export default function Analysis({
  state, equity, loading, unit, raiseAmount,
}: Props) {
  const me = state.players.find((p) => p.id === state.youId);
  if (!me || !me.hasCards) return null;

  const bb = state.clock.bigBlind || state.bigBlind;
  const fmt = (n: number) => formatChips(n, unit, bb);
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const legal = state.legalActions;
  const me2 = me;

  // 나와 붙어 있는 상대 중 가장 큰 스택까지만 걸 수 있다
  const rivals = state.players.filter(
    (p) => p.id !== me2.id && p.hasCards && !p.folded
  );
  const effective = rivals.length
    ? Math.min(me2.chips + me2.bet, Math.max(...rivals.map((p) => p.chips + p.bet)))
    : me2.chips;
  const spr = state.totalPot > 0 ? effective / state.totalPot : null;
  // M = 한 바퀴 도는 데 드는 비용 대비 내 스택 (토너먼트에서 압박 정도)
  const orbitCost = state.clock.smallBlind + state.clock.bigBlind + state.clock.ante;
  const m = orbitCost > 0 ? me2.chips / orbitCost : null;

  const win = equity ? equity.win + equity.tie / 2 : null;

  // 내 차례이고 승률이 나왔을 때만 행동별 기대값을 낼 수 있다
  const evs =
    legal && equity
      ? actionEvs({
          win: equity.win,
          tie: equity.tie,
          pot: state.totalPot,
          toCall: legal.callAmount,
          canCheck: legal.canCheck,
          canRaise: legal.canRaise,
          raiseTo: raiseAmount,
          myBet: me2.bet,
        })
      : [];

  return (
    <div className="analysis">
      <span className="analysis-stat analysis-equity">
        <em>승률</em>
        {loading && equity === null ? (
          <b className="dim">계산 중…</b>
        ) : win === null ? (
          <b className="dim">—</b>
        ) : (
          <b>{pct(win)}</b>
        )}
        {equity && <i>상대 {equity.opponents}명 · 무작위 가정</i>}
      </span>

      {evs.map((a) => (
        <span
          key={a.action}
          className={`analysis-stat analysis-ev${a.best ? " ok" : ""}`}
        >
          <em>{ACTION_LABEL[a.action]}</em>
          {a.ev !== null ? (
            <b>
              {a.ev > 0 ? "+" : ""}
              {fmt(Math.round(a.ev))}
            </b>
          ) : (
            <b className="dim">
              {Math.round((a.breakevenFold ?? 0) * 100)}%↑ 접으면
            </b>
          )}
          {a.best && <i>최선</i>}
        </span>
      ))}

      {spr !== null && (
        <span className="analysis-stat">
          <em>SPR</em>
          <b>{spr >= 10 ? Math.round(spr) : Math.round(spr * 10) / 10}</b>
          <i>유효 {formatChips(effective, "bb", bb)}</i>
        </span>
      )}

      {m !== null && (
        <span className="analysis-stat">
          <em>M</em>
          <b>{Math.round(m)}</b>
          <i>{m < 5 ? "푸시 구간" : m < 10 ? "압박" : "여유"}</i>
        </span>
      )}
    </div>
  );
}
