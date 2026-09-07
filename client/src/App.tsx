import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { PublicPlayer, Standing } from "../../shared/types.ts";
import ActionBar from "./components/ActionBar.tsx";
import ChatPanel from "./components/ChatPanel.tsx";
import Clock from "./components/Clock.tsx";
import Lobby from "./components/Lobby.tsx";
import Spectators from "./components/Spectators.tsx";
import Table from "./components/Table.tsx";
import {
  formatChips,
  loadChipUnit,
  saveChipUnit,
  type ChipUnit,
} from "./format.ts";
import { useHoldem } from "./hooks/useSocket.ts";
import { layoutFor } from "./layout.ts";

export default function App() {
  const game = useHoldem();
  const portrait = usePortrait();
  const layout = layoutFor(portrait);
  const scale = useFitScale(layout.width, layout.height, portrait);
  const [unit, setUnit] = useState<ChipUnit>(loadChipUnit);
  const [chatOpen, setChatOpen] = useState(!portrait);
  const [seenChat, setSeenChat] = useState(0);

  // 좁은 화면에서는 채팅이 테이블을 덮으므로 접어 둔다
  useEffect(() => {
    if (portrait) setChatOpen(false);
  }, [portrait]);

  const chatCount = game.chat.length;
  useEffect(() => {
    if (chatOpen) setSeenChat(chatCount);
  }, [chatOpen, chatCount]);

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
  const bb = state.clock.bigBlind || state.bigBlind;
  const canStart =
    isHost &&
    (waiting || state.phase === "showdown") &&
    !state.clock.finished &&
    !state.clock.onBreak &&
    state.players.filter((p) => p.chips > 0 && !p.spectating).length >= 2;

  const toggleUnit = () => {
    const next: ChipUnit = unit === "amount" ? "bb" : "amount";
    setUnit(next);
    saveChipUnit(next);
  };

  return (
    <div className={`app${portrait ? " app-portrait" : ""}`}>
      <header className="topbar">
        <RoomCode code={state.roomId} />
        <div className="topbar-info">
          <Clock clock={state.clock} />
          <button
            type="button"
            className="unit-toggle"
            onClick={toggleUnit}
            title="칩 표시 단위 바꾸기"
          >
            {unit === "bb" ? "BB" : "금액"}
          </button>
          {!game.connected && <span className="warn">재연결 중…</span>}
        </div>
        <MenuButton
          me={me}
          onLeaveTable={game.leaveTable}
          onLeaveRoom={game.leave}
        />
      </header>

      <main className="stage">
        {/*
          바깥 상자는 "축소된 뒤의 크기"를 갖는다. 안쪽만 좌상단 기준으로 축소한다.
          바깥이 원래 크기(예: 560px)를 유지하면 화면보다 커져서 그리드가 가운데
          정렬을 포기하고 한쪽으로 밀어버린다.
        */}
        <div
          className="stage-inner"
          style={{ width: layout.width * scale, height: layout.height * scale }}
        >
          <div
            className="stage-scale"
            style={{
              transform: `scale(${scale})`,
              width: layout.width,
              height: layout.height,
            }}
          >
            <Table state={state} shuffling={game.shuffling} layout={layout} unit={unit} />
          </div>
        </div>
      </main>

      <Spectators players={state.players} />

      <AnimatePresence>
        {game.standings && <StandingsPanel standings={game.standings} unit={unit} bigBlind={bb} />}
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
              {me?.spectating ? "관전 중입니다." : "칩이 떨어졌습니다."} 리바인하면 다시 참가할 수 있습니다.
              <b> 남은 리바인 {me?.rebuysLeft ?? 0}회</b>
            </p>
            <button type="button" className="btn btn-primary" onClick={game.rebuy}>
              리바인 ({formatChips(state.clock.mode === "tournament" ? 4_000_000 : 5_000_000, unit, bb)})
            </button>
          </div>
        ) : state.legalActions ? (
          <ActionBar
            legal={state.legalActions}
            bigBlind={bb}
            pot={state.totalPot}
            unit={unit}
            onAction={game.act}
            disabled={!game.connected}
          />
        ) : (
          <div className="waiting-bar">
            {canStart ? (
              <button type="button" className="btn btn-primary btn-wide" onClick={game.startHand}>
                {state.handNumber === 0 ? "게임 시작" : "다음 핸드 시작"}
              </button>
            ) : me?.eliminated ? (
              <span>탈락했습니다. 관전 중입니다</span>
            ) : me?.spectating ? (
              <span>관전 중입니다</span>
            ) : state.clock.onBreak ? (
              <span>브레이크타임 — 곧 다시 시작합니다</span>
            ) : waiting ? (
              <span>
                {state.players.length < 2
                  ? "친구를 초대하세요 — 방 코드를 알려주면 됩니다"
                  : isHost
                    ? "시작할 수 있습니다"
                    : "방장이 시작하기를 기다리는 중…"}
              </span>
            ) : me?.sittingOut ? (
              <span>이번 핸드는 쉽니다</span>
            ) : (
              <span>상대 차례를 기다리는 중…</span>
            )}
          </div>
        )}
      </footer>

      <ChatPanel
        logs={game.logs}
        chat={game.chat}
        youId={state.youId}
        onSend={game.sendChat}
        open={chatOpen}
        onToggle={() => setChatOpen((v) => !v)}
        unread={Math.max(0, chatCount - seenChat)}
      />

      {game.error && <div className="toast">{game.error}</div>}
    </div>
  );
}

/** 나가기 메뉴 — 테이블에서만 내려올지, 방을 아예 뜰지 고른다. */
function MenuButton({
  me,
  onLeaveTable,
  onLeaveRoom,
}: {
  me: PublicPlayer | undefined;
  onLeaveTable: () => void;
  onLeaveRoom: () => void;
}) {
  const [open, setOpen] = useState(false);
  const canLeaveTable = me && !me.spectating && !me.eliminated;

  return (
    <div className="menu">
      <button type="button" className="btn btn-ghost" onClick={() => setOpen((v) => !v)}>
        나가기
      </button>
      {open && (
        <div className="menu-pop">
          {canLeaveTable && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                if (
                  window.confirm(
                    "테이블에서 내려갑니다. 남은 칩은 사라지고 관전자가 됩니다. 계속할까요?"
                  )
                ) {
                  onLeaveTable();
                }
              }}
            >
              테이블에서 내려가기
              <em>남은 칩 소멸 · 관전 계속</em>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLeaveRoom();
            }}
          >
            방 나가기
            <em>로비로 돌아갑니다</em>
          </button>
        </div>
      )}
    </div>
  );
}

function StandingsPanel({
  standings,
  unit,
  bigBlind,
}: {
  standings: Standing[];
  unit: ChipUnit;
  bigBlind: number;
}) {
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
            <span>{formatChips(s.chips, unit, bigBlind)}</span>
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

/** 좁은 화면이면 세로형 테이블을 쓴다. */
function usePortrait(): boolean {
  const [portrait, setPortrait] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 760
  );
  useEffect(() => {
    const check = () => setPortrait(window.innerWidth < 760);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return portrait;
}

/** 고정 크기 테이블을 화면에 맞게 통째로 축소한다. */
function useFitScale(width: number, height: number, portrait: boolean): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const chrome = portrait ? 190 : 210;
      const w = window.innerWidth - (portrait ? 12 : 32);
      const h = window.innerHeight - chrome;
      setScale(Math.max(0.3, Math.min(1, w / width, h / height)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [width, height, portrait]);
  return scale;
}
