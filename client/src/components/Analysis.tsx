import type { EquityView, RoomState } from "../../../shared/types.ts";
import { formatChips, type ChipUnit } from "../format.ts";

interface Props {
  state: RoomState;
  equity: EquityView | null;
  loading: boolean;
  unit: ChipUnit;
}

/**
 * 팟 오즈·스택 지표·승률.
 *
 * 승률은 "상대가 아무 카드나 들고 있다고 볼 때"의 값이다. 상대의 실제 카드는
 * 서버도 계산에 넣지 않는다 — 그건 승률이 아니라 치팅이다.
 */
export default function Analysis({ state, equity, loading, unit }: Props) {
  const me = state.players.find((p) => p.id === state.youId);
  if (!me || !me.hasCards) return null;

  const bb = state.clock.bigBlind || state.bigBlind;
  const fmt = (n: number) => formatChips(n, unit, bb);
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const legal = state.legalActions;
  const toCall = legal?.callAmount ?? 0;
  // 콜하려면 이만큼은 이겨야 본전이다
  const needed = toCall > 0 ? toCall / (state.totalPot + toCall) : 0;

  // 나와 붙어 있는 상대 중 가장 큰 스택까지만 걸 수 있다
  const rivals = state.players.filter(
    (p) => p.id !== me.id && p.hasCards && !p.folded
  );
  const effective = rivals.length
    ? Math.min(me.chips + me.bet, Math.max(...rivals.map((p) => p.chips + p.bet)))
    : me.chips;
  const spr = state.totalPot > 0 ? effective / state.totalPot : null;
  // M = 한 바퀴 도는 데 드는 비용 대비 내 스택 (토너먼트에서 압박 정도)
  const orbitCost = state.clock.smallBlind + state.clock.bigBlind + state.clock.ante;
  const m = orbitCost > 0 ? me.chips / orbitCost : null;

  const win = equity ? equity.win + equity.tie / 2 : null;
  const good = win !== null && toCall > 0 && win >= needed;

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

      {toCall > 0 && (
        <span className={`analysis-stat${good ? " ok" : win !== null ? " bad" : ""}`}>
          <em>필요 승률</em>
          <b>{pct(needed)}</b>
          <i>
            콜 {fmt(toCall)} · 팟 {fmt(state.totalPot)}
          </i>
        </span>
      )}

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
