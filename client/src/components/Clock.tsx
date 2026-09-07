import { useEffect, useState } from "react";
import type { ClockState } from "../../../shared/types.ts";
import { elapsed, mmss } from "../format.ts";

/**
 * 레벨/블라인드/남은 시간/총 플레이 시간.
 * 남은 시간은 서버가 준 endsAt으로만 계산해서 클라이언트 시계가 밀려도 어긋나지 않는다.
 */
export default function Clock({ clock }: { clock: ClockState }) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = clock.endsAt !== null || clock.startedAt !== null;

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [ticking]);

  if (clock.finished) {
    return (
      <div className="clock clock-done">
        게임 종료
        {clock.startedAt && (
          <span className="clock-elapsed">진행 {elapsed(now - clock.startedAt)}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`clock${clock.onBreak ? " clock-break" : ""}`}>
      <span className="clock-level">
        {clock.onBreak ? "브레이크" : `LV ${clock.level}`}
      </span>
      {!clock.onBreak && (
        <span className="clock-blinds">
          {clock.smallBlind.toLocaleString()}/{clock.bigBlind.toLocaleString()}
          {clock.ante > 0 && (
            <em className="clock-ante">앤티 {clock.ante.toLocaleString()}</em>
          )}
        </span>
      )}
      {clock.endsAt && (
        <span className="clock-time" title={clock.onBreak ? "브레이크 남은 시간" : "레벨 남은 시간"}>
          {mmss(clock.endsAt - now)}
        </span>
      )}
      {clock.startedAt && (
        <span className="clock-elapsed" title="총 플레이 시간">
          {elapsed(now - clock.startedAt)}
        </span>
      )}
    </div>
  );
}
