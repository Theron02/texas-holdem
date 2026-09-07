import type { PublicPlayer } from "../../../shared/types.ts";

/** 테이블에서 내려온 사람들. 탈락과 중도 퇴장을 구분해서 보여준다. */
export default function Spectators({ players }: { players: PublicPlayer[] }) {
  const watching = players.filter((p) => p.spectating || p.eliminated);
  if (watching.length === 0) return null;

  return (
    <div className="spectators">
      <span className="spectators-label">관전 {watching.length}</span>
      <div className="spectators-list">
        {watching.map((p) => (
          <span key={p.id} className="spectator-chip" title={p.name}>
            {p.name}
            <em>{p.eliminated ? "탈락" : p.rebuysLeft > 0 ? `리바인 ${p.rebuysLeft}` : "대기"}</em>
          </span>
        ))}
      </div>
    </div>
  );
}
