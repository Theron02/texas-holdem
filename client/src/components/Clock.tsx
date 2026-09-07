import { useEffect, useState } from "react";
import type { ClockState } from "../../../shared/types.ts";

function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 레벨/블라인드/남은 시간. 남은 시간은 서버가 준 endsAt으로만 계산한다. */
export default function Clock({ clock }: { clock: ClockState }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!clock.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [clock.endsAt]);

  if (clock.finished) {
    return <div className="clock clock-done">게임 종료</div>;
  }

  return (
    <div className={`clock${clock.onBreak ? " clock-break" : ""}`}>
      <span className="clock-level">
        {clock.onBreak ? "브레이크" : `LV ${clock.level}`}
      </span>
      <span className="clock-blinds">
        {clock.smallBlind.toLocaleString()}/{clock.bigBlind.toLocaleString()}
        {clock.ante > 0 && (
          <em className="clock-ante">앤티 {clock.ante.toLocaleString()}</em>
        )}
      </span>
      {clock.endsAt && (
        <span className="clock-time">{mmss(clock.endsAt - now)}</span>
      )}
    </div>
  );
}
