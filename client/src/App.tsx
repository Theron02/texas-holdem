import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import ActionBar from "./components/ActionBar.tsx";
import Clock from "./components/Clock.tsx";
import Lobby from "./components/Lobby.tsx";
import Table from "./components/Table.tsx";
import { useHoldem } from "./hooks/useSocket.ts";
import type { Standing } from "../../shared/types.ts";
import { TABLE_H, TABLE_W } from "./layout.ts";

export default function App() {
  const game = useHoldem();
  const scale = useFitScale();

  if (!game.state) {
    return (
      <Lobby
        connected={game.connected}
        error={game.error}
        onCreate={game.createRoom}
        onJoin={game.joinRoom}
      />
    );
  }

  const state = game.state;
  const me = state.players.find((p) => p.id === state.youId);
  const isHost = state.hostId === state.youId;
  const waiting = state.phase === "waiting";
  const canStart =
    isHost &&
    (waiting || state.phase === "showdown") &&
    state.players.filter((p) => p.chips > 0).length >= 2;

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="btn btn-ghost" onClick={game.leave}>
          나가기
        </button>
        <RoomCode code={state.roomId} />
        <div className="topbar-info">
          <Clock clock={state.clock} />
          {state.handNumber > 0 && <span>핸드 #{state.handNumber}</span>}
          {!game.connected && <span className="warn">재연결 중…</span>}
        </div>
      </header>

      <main className="stage">
        <div
          className="stage-inner"
          style={{ transform: `scale(${scale})`, width: TABLE_W, height: TABLE_H }}
        >
          <Table state={state} shuffling={game.shuffling} />
        </div>
      </main>

      <AnimatePresence>
        {game.standings && <StandingsPanel standings={game.standings} />}
      </AnimatePresence>

      <AnimatePresence>
        {state.clock.onBreak && !game.standings && (
          <motion.div
            className="result result-break"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <h3>브레이크타임</h3>
            <p className="result-next">쉬었다가 자동으로 다시 시작합니다.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {game.showdown && !game.standings && (
          <motion.div
            className="result"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <h3>
              {game.showdown.winners
                .map((id) => state.players.find((p) => p.id === id)?.name ?? "?")
                .join(", ")}{" "}
              승리
            </h3>
            <ul>
              {game.showdown.reveals.map((r) => (
                <li key={r.playerId} className={game.showdown!.winners.includes(r.playerId) ? "win" : ""}>
                  <b>{state.players.find((p) => p.id === r.playerId)?.name}</b>
                  <span>{r.handDescr}</span>
                </li>
              ))}
            </ul>
            {game.showdown.nextHandAt && <p className="result-next">곧 다음 핸드가 시작됩니다…</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="bottombar">
        {state.clock.finished ? (
          <div className="waiting-bar">게임이 끝났습니다. 최종 순위를 확인하세요.</div>
        ) : state.canRebuy ? (
          <div className="rebuy-bar">
            <p>
              칩이 떨어졌습니다. 리바인하면 다시 참가할 수 있습니다
              {me && ` (남은 횟수 ${me.rebuysLeft}회)`}.
            </p>
            <button type="button" className="btn btn-primary" onClick={game.rebuy}>
              리바인
            </button>
          </div>
        ) : state.legalActions ? (
          <ActionBar
            legal={state.legalActions}
            bigBlind={state.bigBlind}
            pot={state.totalPot}
            onAction={game.act}
            disabled={!game.connected}
          />
        ) : (
          <div className="waiting-bar">
            {canStart ? (
              <button type="button" className="btn btn-primary btn-wide" onClick={game.startHand}>
                {state.handNumber === 0 ? "게임 시작" : "다음 핸드 시작"}
              </button>
            ) : waiting ? (
              <span>
                {state.players.length < 2
                  ? "친구를 초대하세요 — 방 코드를 알려주면 됩니다"
                  : isHost
                    ? "시작할 수 있습니다"
                    : "방장이 시작하기를 기다리는 중…"}
              </span>
            ) : state.clock.onBreak ? (
              <span>브레이크타임 — 곧 다시 시작합니다</span>
            ) : me?.eliminated ? (
              <span>탈락했습니다. 남은 판을 지켜보세요</span>
            ) : me?.sittingOut ? (
              <span>칩이 떨어져 이번 핸드는 쉽니다</span>
            ) : (
              <span>상대 차례를 기다리는 중…</span>
            )}
          </div>
        )}
      </footer>

      <LogPanel logs={game.logs} />
      {game.error && <div className="toast">{game.error}</div>}
    </div>
  );
}

function StandingsPanel({ standings }: { standings: Standing[] }) {
  return (
    <motion.div
      className="result result-standings"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
    >
      <h3>최종 순위</h3>
      <ol className="standings">
        {standings.map((s) => (
          <li key={s.playerId} className={s.rank === 1 ? "win" : ""}>
            <span className="standing-rank">{s.rank}</span>
            <b>{s.name}</b>
            <span>{s.chips.toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </motion.div>
  );
}

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="room-code"
      title="클릭하면 복사됩니다"
      onClick={() => {
        void navigator.clipboard?.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      <span className="room-code-label">방 코드</span>
      <span className="room-code-value">{code}</span>
      <span className="room-code-copy">{copied ? "복사됨" : "복사"}</span>
    </button>
  );
}

function LogPanel({ logs }: { logs: { text: string; at: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [logs]);
  return (
    <aside className="log" ref={ref}>
      {logs.map((l, i) => (
        <div key={`${l.at}-${i}`} className="log-line">{l.text}</div>
      ))}
    </aside>
  );
}

/** 고정 크기 테이블을 화면에 맞게 통째로 축소한다. */
function useFitScale(): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const w = window.innerWidth - 32;
      const h = window.innerHeight - 220;
      setScale(Math.min(1, w / TABLE_W, h / TABLE_H));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}
