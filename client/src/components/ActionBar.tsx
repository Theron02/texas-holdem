import { useEffect, useRef, useState } from "react";
import type { LegalActions, PlayerAction } from "../../../shared/types.ts";
import { formatChips, type ChipUnit } from "../format.ts";

/** 이 게임의 금액은 전부 만 단위다 (블라인드 1만/2만, 스타팅 300만) */
const MAN = 10_000;

interface Props {
  legal: LegalActions;
  bigBlind: number;
  pot: number;
  unit: ChipUnit;
  onAction: (a: PlayerAction) => void;
  disabled?: boolean;
}

export default function ActionBar({
  legal, bigBlind, pot, unit, onAction, disabled,
}: Props) {
  const fmt = (n: number) => formatChips(n, unit, bigBlind);
  const [raiseTo, setRaiseTo] = useState(() =>
    Math.min(Math.ceil(legal.minRaiseTo / MAN) * MAN, legal.maxRaiseTo)
  );

  /**
   * 직접 입력의 단위는 상단 금액/BB 토글을 따라간다.
   * 화면은 BB로 보는데 입력만 만 단위면 머릿속으로 환산해야 한다.
   */
  const step = unit === "bb" ? Math.max(1, bigBlind) : MAN;
  const unitLabel = unit === "bb" ? "BB" : "만";

  /** 금액 → 입력칸에 보여줄 문자열 */
  const toText = (amount: number) => {
    const v = amount / step;
    // BB는 10 미만이면 소수 한 자리까지 (숏스택일수록 정확도가 중요하다)
    if (unit === "bb" && v < 10) return String(Math.round(v * 10) / 10);
    return String(Math.round(v));
  };

  const [amountText, setAmountText] = useState(() =>
    toText(Math.min(Math.ceil(legal.minRaiseTo / MAN) * MAN, legal.maxRaiseTo))
  );

  // 차례가 새로 오면 슬라이더를 최소 레이즈로 되돌린다
  useEffect(() => {
    const start = Math.min(
      Math.ceil(legal.minRaiseTo / MAN) * MAN,
      legal.maxRaiseTo
    );
    setRaiseTo(start);
    setAmountText(toText(start));
    // toText는 unit/bigBlind에 의존하지만, 여기서는 차례가 바뀔 때만 되돌린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legal.minRaiseTo, legal.maxRaiseTo]);

  // 단위를 바꾸면 입력칸도 그 단위로 다시 쓴다 (금액은 그대로)
  const shownUnit = useRef(unit);
  useEffect(() => {
    if (shownUnit.current === unit) return;
    shownUnit.current = unit;
    setAmountText(toText(raiseTo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);

  const clamp = (v: number) =>
    Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(v)));

  /**
   * 베팅은 만 단위로만 떨어뜨린다. 슬라이더나 팟 비율, BB 소수 입력에서
   * 3.5만 같은 어중간한 금액이 나오면 곤란하다.
   *
   * 내림이 아니라 올림이다. 최소 레이즈 자체가 만 단위가 아닐 때
   * (앞사람이 짧은 올인으로 베팅액을 어중간하게 만든 경우) 내리면
   * 최소보다 낮아져 규칙을 어긴다. 올리면 항상 합법이다.
   *
   * 올인만 예외 — 스택 그대로 나가야 한다. 스플릿 팟에서 나머지 칩이
   * 배분되면 스택이 만 단위로 안 떨어질 수 있다.
   */
  const snap = (v: number) => {
    const c = clamp(v);
    if (c >= legal.maxRaiseTo) return legal.maxRaiseTo;
    return Math.min(Math.ceil(c / MAN) * MAN, legal.maxRaiseTo);
  };

  /** 만 단위로 올린 최소 레이즈. 슬라이더와 초기값이 여기서 시작한다 */
  const minRaise = snap(legal.minRaiseTo);

  /** 슬라이더·프리셋에서 값이 바뀌면 입력칸도 따라간다 */
  const setAmount = (v: number) => {
    const next = snap(v);
    setRaiseTo(next);
    setAmountText(toText(next));
  };

  /** 입력칸: 숫자만 받아 단위를 곱해 실제 금액으로 바꾼다 */
  const onAmountInput = (raw: string) => {
    const cleaned =
      unit === "bb"
        ? // 소수점 하나까지 허용 (3.5BB 같은 값)
          raw.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1").slice(0, 8)
        : // 소수점을 지워 붙이면 3.5가 35(10배!)가 된다 — 점 뒤는 버린다
          raw.split(".")[0]!.replace(/[^0-9]/g, "").slice(0, 7);
    setAmountText(cleaned);

    const n = Number(cleaned);
    if (cleaned === "" || !Number.isFinite(n)) return;
    const wanted = n * step;
    // 스택을 넘겨 적으면 올인으로 본다
    setRaiseTo(wanted >= legal.maxRaiseTo ? legal.maxRaiseTo : snap(wanted));
  };

  /** 포커스가 빠지면 실제로 적용된 값으로 되돌려 보여준다 */
  const onAmountBlur = () => setAmountText(toText(raiseTo));
  const isAllInRaise = raiseTo >= legal.maxRaiseTo;
  const canSlide = legal.canRaise && legal.maxRaiseTo > minRaise;

  const presets: { label: string; to: number }[] = [
    { label: "1/2 팟", to: snap(pot / 2) },
    { label: "팟", to: snap(pot) },
    { label: "3BB", to: snap(bigBlind * 3) },
  ];

  return (
    <div className="actionbar">
      {legal.canRaise && (
        <div className="raise-controls">
          <div className="raise-presets">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                className="preset"
                disabled={disabled}
                onClick={() => setAmount(p.to)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className="preset"
              disabled={disabled}
              onClick={() => setAmount(legal.maxRaiseTo)}
            >
              맥스
            </button>
          </div>
          <div className="raise-slider">
            <input
              type="range"
              min={minRaise}
              max={legal.maxRaiseTo}
              step={MAN}
              value={raiseTo}
              disabled={disabled || !canSlide}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <label className="raise-input" title={`${unitLabel} 단위로 직접 입력`}>
              <input
                type="text"
                inputMode={unit === "bb" ? "decimal" : "numeric"}
                value={amountText}
                disabled={disabled}
                onChange={(e) => onAmountInput(e.target.value)}
                onBlur={onAmountBlur}
                onKeyDown={(e) => e.stopPropagation()}
                aria-label={`레이즈 금액 (${unitLabel} 단위)`}
              />
              <span>{unitLabel}</span>
            </label>
          </div>
        </div>
      )}

      <div className="action-buttons">
        <button
          type="button"
          className="btn btn-fold"
          disabled={disabled || !legal.canFold}
          onClick={() => onAction({ type: "fold" })}
        >
          폴드
        </button>

        {legal.canCheck ? (
          <button
            type="button"
            className="btn btn-check"
            disabled={disabled}
            onClick={() => onAction({ type: "check" })}
          >
            체크
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-call"
            disabled={disabled || !legal.canCall}
            onClick={() => onAction({ type: "call" })}
          >
            콜 {fmt(legal.callAmount)}
          </button>
        )}

        {legal.canRaise ? (
          <button
            type="button"
            className="btn btn-raise"
            disabled={disabled}
            onClick={() =>
              onAction(
                isAllInRaise
                  ? { type: "allin" }
                  : { type: "raise", amount: raiseTo }
              )
            }
          >
            {isAllInRaise ? "올인" : `레이즈 ${fmt(raiseTo)}`}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-raise"
            disabled={disabled}
            onClick={() => onAction({ type: "allin" })}
          >
            올인
          </button>
        )}
      </div>
    </div>
  );
}
