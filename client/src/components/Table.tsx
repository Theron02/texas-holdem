import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomState } from "../../../shared/types.ts";
import type { ChipUnit } from "../format.ts";
import { koreanHand } from "../handName.ts";
import type { TableLayout } from "../layout.ts";
import Card from "./Card.tsx";
import PlayerSeat from "./PlayerSeat.tsx";
import Pot from "./Pot.tsx";
import ShuffleAnimation from "./ShuffleAnimation.tsx";

/** 보드 카드가 이보다 작아지면 읽을 수 없다 */
const MIN_CARD_W = 31;

/** 팟 상자의 실제 크기. Pot 컴포넌트가 이 크기로 그려진다 */
const POT = { portrait: { w: 112, h: 42 }, desktop: { w: 152, h: 50 } };

interface FlyingChip {
  key: number;
  from: { x: number; y: number };
}

interface Props {
  state: RoomState;
  shuffling: boolean;
  layout: TableLayout;
  unit: ChipUnit;
  /** 게임 시작 전에 빈 자리를 눌러 옮긴다 */
  onTakeSeat: (seat: number) => void;
}

export default function Table({
  state, shuffling, layout, unit, onTakeSeat,
}: Props) {
  const bb = state.clock.bigBlind || state.bigBlind;

  // 관전자는 테이블에 앉히지 않는다 — 자리를 차지하면 좌석 배치가 헐거워진다
  const seated = state.players.filter((p) => !p.spectating);
  const me = state.players.find((p) => p.id === state.youId);

  // 게임 시작 전에는 빈 자리까지 모두 그려서 고를 수 있게 한다.
  // 시작한 뒤에는 앉은 사람만 그려야 테이블이 헐겁지 않다.
  const choosing = state.phase === "waiting" && state.handNumber === 0;
  const slots: (typeof seated[number] | null)[] = choosing
    ? Array.from(
        { length: state.maxPlayers },
        (_, seat) => seated.find((p) => p.seat === seat) ?? null
      )
    : seated;

  // 나를 항상 화면 아래(0번 위치)에 두고 나머지를 시계 방향으로 돌린다
  const meIndex = Math.max(
    0,
    choosing
      ? slots.findIndex((p) => p?.id === state.youId)
      : seated.findIndex((p) => p.id === state.youId)
  );
  const ordered = [...slots.slice(meIndex), ...slots.slice(0, meIndex)];
  const seatCount = Math.max(ordered.length, 2);

  // 좌석이 서로 겹치지 않는 최대 배율을 이웃 간격에서 직접 구한다.
  // 인원·화면 크기가 어떻게 조합돼도 겹치지 않는다.
  const seatScale = fitSeatScale(layout, seatCount);
  // 좌석이 남겨준 공간에 맞춰 보드 카드 크기와 팟 위치를 정한다
  const madeHand = state.myHand ? koreanHand(state.myHand) : null;
  const board = useMemo(
    () => fitBoard(layout, seatCount, seatScale),
    [layout, seatCount, seatScale]
  );
  const chips = useBetCollectionChips(state, ordered, layout, seatCount);
  const turnRatio = useTurnRatio(state);

  return (
    <div className="table-wrap">
      <div className="table" style={{ width: layout.width, height: layout.height }}>
        <div
          className="table-felt"
          style={{ inset: `${layout.feltInsetY}px ${layout.feltInsetX}px` }}
        />

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

        <div
          className="community"
          style={{ top: board.boardY, gap: 0 }}
        >
          <AnimatePresence>
            {state.communityCards.map((card, i) => (
              <Card
                key={`${card.rank}${card.suit}`}
                card={card}
                size="lg"
                width={board.cardW}
                offsetLeft={i === 0 ? 0 : board.step - board.cardW}
                dealFrom={{
                  x: layout.deck.x - (layout.width / 2 + (i - 2) * board.step),
                  y: layout.deck.y - board.boardY,
                }}
                delay={(i % 3) * 0.14}
              />
            ))}
          </AnimatePresence>
        </div>

        <Pot
          total={state.totalPot}
          pots={state.pots}
          pos={board.potPos}
          size={layout.portrait ? POT.portrait : POT.desktop}
          unit={unit}
          bigBlind={bb}
        />

        {ordered.map((player, i) => {
          const pos = layout.seatPos(i, seatCount);
          if (!player) {
            // 빈 자리 — 게임 시작 전에만 나온다
            const seat = (meIndex + i) % state.maxPlayers;
            return (
              <button
                key={`empty-${seat}`}
                type="button"
                className="seat-empty"
                style={{
                  left: pos.x,
                  top: pos.y,
                  ["--seat-w" as string]: `${layout.seatW}px`,
                  ["--seat-h" as string]: `${layout.seatH}px`,
                  transform: `translate(-50%, -50%) scale(${seatScale})`,
                }}
                onClick={() => onTakeSeat(seat)}
                disabled={!!me?.spectating}
              >
                <span className="seat-empty-no">{seat + 1}</span>
                <span className="seat-empty-label">빈 자리</span>
              </button>
            );
          }
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
              layout={layout}
              unit={unit}
              bigBlind={bb}
              seatScale={seatScale}
              madeHand={player.id === state.youId ? madeHand : null}
            />
          );
        })}

        {/* 베팅이 팟으로 모이는 순간에만 잠깐 나타나는 칩 */}
        <AnimatePresence>
          {chips.map((c) => (
            <motion.div
              key={c.key}
              className="flying-chip"
              // x/y로 가운데 정렬을 애니메이션 값에 넣는다. CSS transform에만
              // 두면 framer-motion이 scale을 쓰면서 덮어쓴다.
              initial={{ left: c.from.x, top: c.from.y, x: "-50%", y: "-50%", opacity: 1, scale: 1 }}
              animate={{
                left: board.potPos.x,
                top: board.potPos.y,
                x: "-50%",
                y: "-50%",
                opacity: 0,
                scale: 0.7,
              }}
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

/**
 * 이웃한 좌석이 겹치지 않는 최대 배율. 두 상자는 가로나 세로 중 한 축만
 * 떨어져 있으면 겹치지 않으므로 둘 중 큰 쪽을 본다.
 */
function fitSeatScale(layout: TableLayout, seatCount: number): number {
  if (seatCount < 2) return 1;
  let need = 1;
  for (let i = 0; i < seatCount; i++) {
    const a = layout.seatPos(i, seatCount);
    const b = layout.seatPos((i + 1) % seatCount, seatCount);
    const fit = Math.max(
      Math.abs(a.x - b.x) / layout.seatW,
      Math.abs(a.y - b.y) / layout.seatH
    );
    need = Math.min(need, fit);
  }
  // 4%는 숨 쉴 틈
  return Math.max(0.55, Math.min(1, need * 0.96));
}

/**
 * 보드(커뮤니티 카드 5장)와 팟을 좌석이 비워둔 자리에 맞춘다.
 *
 * 세로 화면은 테이블이 좁아 가운데를 좌석과 나눠 써야 한다. 인원수에 따라
 * 좌석이 가로 한가운데 줄에 오기도 하고 비어 있기도 해서, 크기만 줄여서는
 * 해결되지 않는다. 그래서 카드 크기와 세로 위치를 함께 훑는다.
 *
 * 그래도 안 들어가면 카드를 부채꼴로 겹친다. 왼쪽 위 모서리(숫자·무늬)는
 * 그대로 보이므로 읽는 데는 지장이 없다.
 */
function fitBoard(layout: TableLayout, seatCount: number, seatScale: number) {
  const gap = layout.portrait ? 6 : 10;
  const cx = layout.width / 2;
  const sw = layout.seatW * seatScale;
  const sh = layout.seatH * seatScale;
  const seats = Array.from({ length: seatCount }, (_, i) =>
    layout.seatPos(i, seatCount)
  );

  /** [top, bottom] 높이에서, 가운데 정렬된 폭 w짜리 상자가 좌석에 안 걸리나 */
  const centeredFits = (top: number, bottom: number, w: number) => {
    if (top < layout.feltInsetY + 6) return false;
    if (bottom > layout.height - layout.feltInsetY - 6) return false;
    let left = layout.feltInsetX + 8;
    let right = layout.width - layout.feltInsetX - 8;
    for (const p of seats) {
      if (p.y + sh / 2 <= top || p.y - sh / 2 >= bottom) continue;
      if (p.x < cx) left = Math.max(left, p.x + sw / 2 + 6);
      else right = Math.min(right, p.x - sw / 2 - 6);
    }
    return left <= cx - w / 2 && right >= cx + w / 2;
  };

  /** [top, bottom] 높이에서 좌석에 막히지 않는 가로 구간들 */
  const freeGaps = (top: number, bottom: number) => {
    const blocked: [number, number][] = [];
    for (const p of seats) {
      if (p.y + sh / 2 <= top || p.y - sh / 2 >= bottom) continue;
      blocked.push([p.x - sw / 2 - 6, p.x + sw / 2 + 6]);
    }
    blocked.sort((a, b) => a[0] - b[0]);

    const gaps: { center: number; width: number }[] = [];
    let cursor = layout.feltInsetX + 8;
    const end = layout.width - layout.feltInsetX - 8;
    for (const [l, r] of blocked) {
      if (l > cursor) gaps.push({ center: (cursor + l) / 2, width: l - cursor });
      cursor = Math.max(cursor, r);
    }
    if (end > cursor) gaps.push({ center: (cursor + end) / 2, width: end - cursor });
    return gaps;
  };

  /** 선호 위치에서 위아래로 번갈아 멀어지며 후보를 만든다 */
  const candidates = (prefer: number, reach: number) => {
    const out = [prefer];
    for (let d = 6; d <= reach; d += 6) out.push(prefer - d, prefer + d);
    return out;
  };

  const boardYs = candidates(layout.communityY, layout.height * 0.34);
  const potW = layout.portrait ? POT.portrait.w : POT.desktop.w;
  const potH = layout.portrait ? POT.portrait.h : POT.desktop.h;

  /** 보드가 이 자리에 놓였을 때 팟이 들어갈 자리를 찾는다 */
  const findPotY = (boardY: number, rowH: number) => {
    const below = boardY + rowH / 2 + potH / 2 + 6;
    const above = boardY - rowH / 2 - potH / 2 - 6;
    const ys = [
      ...candidates(below, layout.height * 0.3).filter((y) => y >= below - 6),
      ...candidates(above, layout.height * 0.3).filter((y) => y <= above + 6),
    ];
    for (const y of ys) {
      if (centeredFits(y - potH / 2, y + potH / 2, potW)) return y;
    }
    return null;
  };

  /**
   * 보드와 팟은 한 덩어리로 봐야 한다. 따로 맞추면 보드가 자리를 다 차지해
   * 팟이 좌석 위로 밀려난다. 보드를 조금 줄여서라도 둘 다 들어가는 조합을 고른다.
   */
  const tryFit = (fan: boolean) => {
    for (let w = layout.communityCardW; w >= MIN_CARD_W; w -= 2) {
      const step = fan ? Math.round(w * 0.58) : w + gap;
      const rowW = w + step * 4;
      const rowH = w * 1.4;
      for (const y of boardYs) {
        if (!centeredFits(y - rowH / 2, y + rowH / 2, rowW)) continue;
        const potY = findPotY(y, rowH);
        if (potY !== null) return { cardW: w, step, boardY: y, potY };
      }
    }
    return null;
  };

  const found = tryFit(false) ?? tryFit(true);
  if (found) {
    return {
      cardW: found.cardW,
      step: found.step,
      boardY: found.boardY,
      gap,
      potPos: { x: cx, y: found.potY },
    };
  }

  // 어떤 조합도 안 되는 아주 좁은 화면(작은 구형 휴대폰 + 분석 줄)에서는
  // 가장 작은 보드를 가운데 두고, 팟은 가운데를 고집하지 않고 빈 구간에 둔다.
  const cardW = MIN_CARD_W;
  const step = Math.round(MIN_CARD_W * 0.58);
  const rowH = cardW * 1.4;
  const boardY = layout.communityY;

  let potPos = { x: cx, y: boardY + rowH / 2 + potH / 2 + 6 };
  let best = -1;
  for (const y of candidates(potPos.y, layout.height * 0.3)) {
    if (y - potH / 2 < layout.feltInsetY + 4) continue;
    if (y + potH / 2 > layout.height - layout.feltInsetY - 4) continue;
    for (const g of freeGaps(y - potH / 2, y + potH / 2)) {
      if (g.width >= potW && g.width > best) {
        best = g.width;
        potPos = { x: g.center, y };
      }
    }
  }
  return { cardW, step, boardY, gap, potPos };

}

/** 라운드가 끝나 베팅이 0으로 리셋되는 순간을 잡아 좌석→팟 칩 이동을 만든다. */
function useBetCollectionChips(
  state: RoomState,
  ordered: (RoomState["players"][number] | null)[],
  layout: TableLayout,
  seatCount: number
): FlyingChip[] {
  const [chips, setChips] = useState<FlyingChip[]>([]);
  const prevBets = useRef(new Map<string, number>());
  const nextKey = useRef(0);

  useEffect(() => {
    const collected: FlyingChip[] = [];
    ordered.forEach((p, i) => {
      if (!p) return;
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
