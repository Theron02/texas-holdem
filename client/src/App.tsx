import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { PublicPlayer, Standing } from "../../shared/types.ts";
import ActionBar from "./components/ActionBar.tsx";
import Analysis from "./components/Analysis.tsx";
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
import { computeLayout } from "./layout.ts";

/** 열린 채팅 패널이 차지하는 폭. CSS의 .app-chat-open .stage 여백과 맞춘다 */
const CHAT_WIDTH = 300;
/** 분석 줄이 차지하는 실제 높이. 켜면 테이블이 그만큼 줄어야 잘리지 않는다 */
const ANALYSIS_HEIGHT = 32;
/**
 * 이보다 짧은 화면에서는 분석 줄을 넣을 자리가 없다.
 * 억지로 넣으면 팟이 좌석 위로 올라간다 (구형 소형 휴대폰).
 */
const ANALYSIS_MIN_HEIGHT = 620;

export default function App() {
  const game = useHoldem();
  const [chatOpen, setChatOpen] = useState(true);
  const [analysisOn, setAnalysisOn] = useState(
    () => localStorage.getItem("holdem:analysis") === "on"
  );
  const tallEnough = useTallEnough();
  // 화면이 너무 짧으면 켜져 있어도 접는다 — 넣을 자리가 없다
  const showAnalysis = analysisOn && tallEnough;
  const layout = useLayout(chatOpen, showAnalysis);
  const portrait = layout.portrait;
  const [unit, setUnit] = useState<ChipUnit>(loadChipUnit);
  const [seenChat, setSeenChat] = useState(0);

  // 좁은 화면에서는 채팅이 테이블을 덮으므로 접어 둔다
  useEffect(() => {
    if (portrait) setChatOpen(false);
  }, [portrait]);

  const chatCount = game.chat.length;
  useEffect(() => {
    if (chatOpen) setSeenChat(chatCount);
  }, [chatOpen, chatCount]);

  // 켜져 있을 때만, 그리고 상황이 바뀔 때만 계산을 요청한다.
  // 매 상태 갱신마다 부르면 서버가 몬테카를로를 계속 돌린다.
  const board = game.state?.communityCards.length ?? 0;
  const hand = game.state?.handNumber ?? 0;
  const alive = game.state?.players.filter((p) => p.hasCards && !p.folded).length ?? 0;
  const myTurn = game.state?.currentTurn === game.state?.youId;
  const { requestEquity } = game;
  useEffect(() => {
    if (!showAnalysis || hand === 0) return;
    requestEquity();
  }, [showAnalysis, hand, board, alive, myTurn, requestEquity]);

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
    <div
      className={`app${portrait ? " app-portrait" : ""}${
        chatOpen && !portrait ? " app-chat-open" : ""
      }`}
    >
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
          <button
            type="button"
            className={`unit-toggle${analysisOn ? " on" : ""}`}
            onClick={() => {
              const next = !analysisOn;
              setAnalysisOn(next);
              localStorage.setItem("holdem:analysis", next ? "on" : "off");
            }}
            title={
              tallEnough
                ? "승률·팟오즈 표시 (나에게만 보입니다)"
                : "화면이 짧아 분석 줄을 넣을 자리가 없습니다"
            }
            disabled={!tallEnough}
          >
            분석
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
        {/* 화면에 맞는 크기로 그리므로 축소가 필요 없다 — 글자가 제 크기로 나온다 */}
        <div
          className="stage-inner"
          style={{ width: layout.width, height: layout.height }}
        >
          <Table
            state={state}
            shuffling={game.shuffling}
            layout={layout}
            unit={unit}
            onTakeSeat={game.takeSeat}
          />
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
            initial={{ opacity: 0, y: 16, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, x: "-50%" }}
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
            initial={{ opacity: 0, y: 16, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -8, x: "-50%" }}
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

      {showAnalysis && !state.clock.finished && (
        <Analysis
          state={state}
          equity={game.equity}
          loading={game.equityLoading}
          unit={unit}
        />
      )}

      <footer className="bottombar">
        {state.canShowCards ? (
          <ShowCardsBar onShow={game.showCards} />
        ) : state.clock.finished ? (
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

/**
 * 쇼다운에서 진 사람의 선택. 아무것도 안 하면 그대로 접힌 채 다음 핸드로 넘어간다.
 */
function ShowCardsBar({ onShow }: { onShow: () => void }) {
  const [done, setDone] = useState(false);
  if (done) return <div className="waiting-bar">카드를 접었습니다</div>;
  return (
    <div className="show-bar">
      <p>카드를 공개할까요?</p>
      <button type="button" className="btn btn-primary" onClick={onShow}>
        공개하기
      </button>
      <button type="button" className="btn" onClick={() => setDone(true)}>
        접기
      </button>
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
      initial={{ opacity: 0, scale: 0.94, x: "-50%" }}
      animate={{ opacity: 1, scale: 1, x: "-50%" }}
      exit={{ opacity: 0, x: "-50%" }}
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

/** 분석 줄을 넣을 만큼 화면이 긴지 */
function useTallEnough(): boolean {
  const [tall, setTall] = useState(
    () => typeof window === "undefined" || window.innerHeight >= ANALYSIS_MIN_HEIGHT
  );
  useEffect(() => {
    const check = () => setTall(window.innerHeight >= ANALYSIS_MIN_HEIGHT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return tall;
}

/** 화면 크기가 바뀌면 테이블 크기를 다시 계산한다. */
function useLayout(chatOpen: boolean, analysisOn: boolean) {
  const reserved = () =>
    chatOpen && window.innerWidth >= 760 ? CHAT_WIDTH : 0;
  const bottom = analysisOn ? ANALYSIS_HEIGHT : 0;
  const [layout, setLayout] = useState(() =>
    computeLayout(
      typeof window === "undefined" ? 1280 : window.innerWidth,
      typeof window === "undefined" ? 800 : window.innerHeight,
      typeof window === "undefined" ? CHAT_WIDTH : reserved(),
      bottom
    )
  );
  useEffect(() => {
    const update = () =>
      setLayout(
        computeLayout(window.innerWidth, window.innerHeight, reserved(), bottom)
      );
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [chatOpen, analysisOn]);
  return layout;
}
