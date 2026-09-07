import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { RoomState } from "../../../shared/types.ts";
import type { ChipUnit } from "../format.ts";
import type { TableLayout } from "../layout.ts";
import Card from "./Card.tsx";
import PlayerSeat from "./PlayerSeat.tsx";
import Pot from "./Pot.tsx";
import ShuffleAnimation from "./ShuffleAnimation.tsx";

interface FlyingChip {
  key: number;
  from: { x: number; y: number };
}

interface Props {
  state: RoomState;
  shuffling: boolean;
  layout: TableLayout;
  unit: ChipUnit;
}

export default function Table({ state, shuffling, layout, unit }: Props) {
  const bb = state.clock.bigBlind || state.bigBlind;

  // 관전자는 테이블에 앉히지 않는다 — 자리를 차지하면 좌석 배치가 헐거워진다
  const seated = state.players.filter((p) => !p.spectating);
  // 나를 항상 화면 아래(좌석 0번)에 두고 나머지를 시계 방향으로 돌린다
  const meIndex = Math.max(0, seated.findIndex((p) => p.id === state.youId));
  const ordered = [...seated.slice(meIndex), ...seated.slice(0, meIndex)];
  const seatCount = Math.max(ordered.length, 2);

  const chips = useBetCollectionChips(state, ordered, layout, seatCount);
  const turnRatio = useTurnRatio(state);

  return (
    <div className="table-wrap">
      <div className="table" style={{ width: layout.width, height: layout.height }}>
        <div className="table-felt" />

        {/* 커뮤니티 카드가 깔리기 시작하면 덱은 치운다 — 같은 자리를 두고 겹친다. */}
        {state.communityCards.length === 0 && (
          <motion.div
            className="deck"
            style={{ left: layout.deck.x, top: layout.deck.y }}
            exit={{ opacity: 0 }}
          >
            <span className="deck-card" />
            <span className="deck-card" />
            <span className="deck-card" />
          </motion.div>
        )}

        <div className="community" style={{ top: layout.communityY }}>
          <AnimatePresence>
            {state.communityCards.map((card, i) => (
              <Card
                key={`${card.rank}${card.suit}`}
                card={card}
                size="lg"
                dealFrom={{
                  x: layout.deck.x - (layout.width / 2 + (i - 2) * layout.communityStep),
                  y: layout.deck.y - layout.communityY,
                }}
                delay={(i % 3) * 0.14}
              />
            ))}
          </AnimatePresence>
        </div>

        <Pot total={state.totalPot} pots={state.pots} layout={layout} unit={unit} bigBlind={bb} />

        {ordered.map((player, i) => (
          <PlayerSeat
            key={player.id}
            player={player}
            pos={layout.seatPos(i, seatCount)}
            isSelf={player.id === state.youId}
            isTurn={state.currentTurn === player.id}
            dealIndex={i}
            phase={state.phase}
            turnRatio={state.currentTurn === player.id ? turnRatio : null}
            layout={layout}
            unit={unit}
            bigBlind={bb}
          />
        ))}

        {/* 베팅이 팟으로 모이는 순간에만 잠깐 나타나는 칩 */}
        <AnimatePresence>
          {chips.map((c) => (
            <motion.div
              key={c.key}
              className="flying-chip"
              initial={{ left: c.from.x, top: c.from.y, opacity: 1, scale: 1 }}
              animate={{ left: layout.pot.x, top: layout.pot.y, opacity: 0, scale: 0.7 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: "easeInOut" }}
            >
              <span className="chip chip-bet" />
            </motion.div>
          ))}
        </AnimatePresence>

        {shuffling && <ShuffleAnimation x={layout.deck.x} y={layout.deck.y} />}
      </div>
    </div>
  );
}

/** 라운드가 끝나 베팅이 0으로 리셋되는 순간을 잡아 좌석→팟 칩 이동을 만든다. */
function useBetCollectionChips(
  state: RoomState,
  ordered: RoomState["players"],
  layout: TableLayout,
  seatCount: number
): FlyingChip[] {
  const [chips, setChips] = useState<FlyingChip[]>([]);
  const prevBets = useRef(new Map<string, number>());
  const nextKey = useRef(0);

  useEffect(() => {
    const collected: FlyingChip[] = [];
    ordered.forEach((p, i) => {
      const before = prevBets.current.get(p.id) ?? 0;
      if (before > 0 && p.bet === 0) {
        collected.push({ key: nextKey.current++, from: layout.seatPos(i, seatCount) });
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
  }, [state, ordered, layout, seatCount]);

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
