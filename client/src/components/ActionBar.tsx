import { useEffect, useState } from "react";
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
  const [raiseTo, setRaiseTo] = useState(legal.minRaiseTo);
  // 직접 입력은 만 단위로 받는다 — 블라인드부터 스택까지 전부 만 단위다
  const [manText, setManText] = useState(() =>
    String(Math.round(legal.minRaiseTo / MAN))
  );

  // 차례가 새로 오면 슬라이더를 최소 레이즈로 되돌린다
  useEffect(() => {
    setRaiseTo(legal.minRaiseTo);
    setManText(String(Math.round(legal.minRaiseTo / MAN)));
  }, [legal.minRaiseTo, legal.maxRaiseTo]);

  const clamp = (v: number) =>
    Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(v)));

  /** 슬라이더·프리셋에서 값이 바뀌면 입력칸도 따라간다 */
  const setAmount = (v: number) => {
    const next = clamp(v);
    setRaiseTo(next);
    setManText(String(Math.round(next / MAN)));
  };

  /** 입력칸: 숫자만 받고, 만을 곱해 실제 금액으로 바꾼다 */
  const onManInput = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "").slice(0, 6);
    setManText(digits);
    if (digits === "") return;
    const wanted = Number(digits) * MAN;
    // 스택을 넘겨 적으면 올인으로 본다
    setRaiseTo(wanted >= legal.maxRaiseTo ? legal.maxRaiseTo : clamp(wanted));
  };

  /** 포커스가 빠지면 실제로 적용된 값으로 되돌려 보여준다 */
  const onManBlur = () => setManText(String(Math.round(raiseTo / MAN)));
  const isAllInRaise = raiseTo >= legal.maxRaiseTo;
  const canSlide = legal.canRaise && legal.maxRaiseTo > legal.minRaiseTo;

  const presets: { label: string; to: number }[] = [
    { label: "1/2 팟", to: clamp(pot / 2) },
    { label: "팟", to: clamp(pot) },
    { label: "3BB", to: clamp(bigBlind * 3) },
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
              min={legal.minRaiseTo}
              max={legal.maxRaiseTo}
              step={1}
              value={raiseTo}
              disabled={disabled || !canSlide}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <label className="raise-input" title="만 단위로 직접 입력">
              <input
                type="text"
                inputMode="numeric"
                value={manText}
                disabled={disabled}
                onChange={(e) => onManInput(e.target.value)}
                onBlur={onManBlur}
                onKeyDown={(e) => e.stopPropagation()}
                aria-label="레이즈 금액 (만 단위)"
              />
              <span>만</span>
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
