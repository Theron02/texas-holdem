import { useEffect, useState } from "react";
import type { LegalActions, PlayerAction } from "../../../shared/types.ts";

interface Props {
  legal: LegalActions;
  bigBlind: number;
  pot: number;
  onAction: (a: PlayerAction) => void;
  disabled?: boolean;
}

export default function ActionBar({ legal, bigBlind, pot, onAction, disabled }: Props) {
  const [raiseTo, setRaiseTo] = useState(legal.minRaiseTo);

  // 차례가 새로 오면 슬라이더를 최소 레이즈로 되돌린다
  useEffect(() => setRaiseTo(legal.minRaiseTo), [legal.minRaiseTo, legal.maxRaiseTo]);

  const clamp = (v: number) =>
    Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(v)));
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
                onClick={() => setRaiseTo(p.to)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className="preset"
              disabled={disabled}
              onClick={() => setRaiseTo(legal.maxRaiseTo)}
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
              onChange={(e) => setRaiseTo(clamp(Number(e.target.value)))}
            />
            <output>{raiseTo.toLocaleString()}</output>
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
            콜 {legal.callAmount.toLocaleString()}
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
            {isAllInRaise ? "올인" : `레이즈 ${raiseTo.toLocaleString()}`}
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
