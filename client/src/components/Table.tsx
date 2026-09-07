import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { RoomState } from "../../../shared/types.ts";
import { DECK_POS, POT_POS, seatPos, TABLE_H, TABLE_W } from "../layout.ts";
import Card from "./Card.tsx";
import PlayerSeat from "./PlayerSeat.tsx";
import Pot from "./Pot.tsx";
import ShuffleAnimation from "./ShuffleAnimation.tsx";

interface FlyingChip {
  key: number;
  from: { x: number; y: number };
  amount: number;
}

const COMMUNITY_Y = TABLE_H / 2 - 30;
const COMMUNITY_STEP = 86;

interface Props {
  state: RoomState;
  shuffling: boolean;
}

export default function Table({ state, shuffling }: Props) {
  // 나를 항상 화면 아래(좌석 0번)에 두고 나머지를 시계 방향으로 돌린다
  const meIndex = Math.max(0, state.players.findIndex((p) => p.id === state.youId));
  const ordered = [
    ...state.players.slice(meIndex),
    ...state.players.slice(0, meIndex),
  ];

  const chips = useBetCollectionChips(state, ordered);
  const turnRatio = useTurnRatio(state);

  return (
    <div className="table-wrap">
      <div className="table" style={{ width: TABLE_W, height: TABLE_H }}>
        <div className="table-felt" />

        {/* 커뮤니티 카드가 깔리기 시작하면 덱은 치운다 — 같은 자리를 두고 겹친다. */}
        {state.communityCards.length === 0 && (
          <motion.div
            className="deck"
            style={{ left: DECK_POS.x, top: DECK_POS.y }}
            exit={{ opacity: 0 }}
          >
            <span className="deck-card" />
            <span className="deck-card" />
            <span className="deck-card" />
          </motion.div>
        )}

        <div className="community" style={{ top: COMMUNITY_Y }}>
          <AnimatePresence>
            {state.communityCards.map((card, i) => (
              <Card
                key={`${card.rank}${card.suit}`}
                card={card}
                size="lg"
                dealFrom={{
                  x: DECK_POS.x - (TABLE_W / 2 + (i - 2) * COMMUNITY_STEP),
                  y: DECK_POS.y - COMMUNITY_Y,
                }}
                delay={(i % 3) * 0.14}
              />
            ))}
          </AnimatePresence>
        </div>

        <Pot total={state.totalPot} pots={state.pots} />

        {ordered.map((player, i) => {
          const pos = seatPos(i, Math.max(ordered.length, 2));
          return (
            <PlayerSeat
              key={player.id}
              player={player}
              pos={pos}
              isSelf={player.id === state.youId}
              isTurn={state.currentTurn === player.id}
              dealIndex={i}
              phase={state.phase}
              turnRatio={state.currentTurn === player.id ? turnRatio : null}
            />
          );
        })}

        {/* 베팅이 팟으로 모이는 순간에만 잠깐 나타나는 칩 */}
        <AnimatePresence>
          {chips.map((c) => (
            <motion.div
              key={c.key}
              className="flying-chip"
              initial={{ left: c.from.x, top: c.from.y, opacity: 1, scale: 1 }}
              animate={{ left: POT_POS.x, top: POT_POS.y, opacity: 0, scale: 0.7 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: "easeInOut" }}
            >
              <span className="chip chip-bet" />
            </motion.div>
          ))}
        </AnimatePresence>

        {shuffling && <ShuffleAnimation x={DECK_POS.x} y={DECK_POS.y} />}
      </div>
    </div>
  );
}

/** 라운드가 끝나 베팅이 0으로 리셋되는 순간을 잡아 좌석→팟 칩 이동을 만든다. */
function useBetCollectionChips(
  state: RoomState,
  ordered: RoomState["players"]
): FlyingChip[] {
  const [chips, setChips] = useState<FlyingChip[]>([]);
  const prevBets = useRef(new Map<string, number>());
  const nextKey = useRef(0);

  useEffect(() => {
    const collected: FlyingChip[] = [];
    ordered.forEach((p, i) => {
      const before = prevBets.current.get(p.id) ?? 0;
      if (before > 0 && p.bet === 0) {
        collected.push({
          key: nextKey.current++,
          from: seatPos(i, Math.max(ordered.length, 2)),
          amount: before,
        });
      }
      prevBets.current.set(p.id, p.bet);
    });
    if (collected.length === 0) return;
    setChips((cur) => [...cur, ...collected]);
    const t = setTimeout(
      () => setChips((cur) => cur.filter((c) => !collected.includes(c))),
      600
    );
    return () => clearTimeout(t);
  }, [state, ordered]);

  return chips;
}

/** 남은 턴 시간을 0~1로. 서버가 준 turnEndsAt만 신뢰한다. */
function useTurnRatio(state: RoomState): number | null {
  const [ratio, setRatio] = useState<number | null>(null);
  const endsAt = state.turnEndsAt;

  useEffect(() => {
    if (!endsAt) {
      setRatio(null);
      return;
    }
    const total = endsAt - Date.now();
    if (total <= 0) {
      setRatio(0);
      return;
    }
    const id = setInterval(() => {
      setRatio(Math.max(0, Math.min(1, (endsAt - Date.now()) / total)));
    }, 100);
    setRatio(1);
    return () => clearInterval(id);
  }, [endsAt]);

  return ratio;
}
