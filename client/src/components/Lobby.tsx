import { useState } from "react";
import type { GameMode } from "../../../shared/types.ts";

interface Props {
  connected: boolean;
  error: string | null;
  onCreate: (name: string, mode: GameMode) => void;
  onJoin: (name: string, roomId: string) => void;
}

const MODES: {
  mode: GameMode;
  label: string;
  chips: string;
  detail: string;
}[] = [
  {
    mode: "tournament",
    label: "토너먼트",
    chips: "스타팅 300만 · 리바인 400만",
    detail: "블라인드 1만/2만부터 10분마다 상승, 50분 뒤 10분 브레이크. 한 명 남을 때까지.",
  },
  {
    mode: "timeattack",
    label: "타임어택",
    chips: "스타팅 500만 · 리바인 500만",
    detail: "10만/10만으로 40분, 마지막 10분은 50만/50만. 50분 뒤 칩 순위로 결정.",
  },
];

export default function Lobby({ connected, error, onCreate, onJoin }: Props) {
  const [name, setName] = useState(() => localStorage.getItem("holdem:name") ?? "");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<GameMode>("tournament");

  const remember = () => localStorage.setItem("holdem:name", name.trim());
  const ready = connected && name.trim().length > 0;

  return (
    <div className="lobby">
      <h1 className="lobby-title">
        <span className="lobby-suit red">♥</span> 홀덤
        <span className="lobby-suit">♠</span>
      </h1>
      <p className="lobby-sub">친구들끼리 방 코드로 모여서 한 판.</p>

      <div className="lobby-card">
        <label className="field">
          <span>닉네임</span>
          <input
            value={name}
            maxLength={12}
            placeholder="테이블에 표시될 이름"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="field">
          <span>게임 방식</span>
          <div className="mode-picker">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                className={`mode-option${mode === m.mode ? " selected" : ""}`}
                onClick={() => setMode(m.mode)}
                aria-pressed={mode === m.mode}
              >
                <strong>{m.label}</strong>
                <span className="mode-chips">{m.chips}</span>
                <span className="mode-detail">{m.detail}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-wide"
          disabled={!ready}
          onClick={() => {
            remember();
            onCreate(name.trim(), mode);
          }}
        >
          새 방 만들기
        </button>

        <div className="lobby-divider"><span>또는</span></div>

        <label className="field">
          <span>초대 코드</span>
          <input
            value={code}
            maxLength={6}
            placeholder="ABC123"
            className="code-input"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>

        <button
          type="button"
          className="btn btn-wide"
          disabled={!ready || code.length < 4}
          onClick={() => {
            remember();
            onJoin(name.trim(), code);
          }}
        >
          입장하기
        </button>

        {!connected && <p className="lobby-status">서버에 연결하는 중…</p>}
        {error && <p className="lobby-error">{error}</p>}
      </div>
    </div>
  );
}
