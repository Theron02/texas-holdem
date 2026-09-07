import { AnimatePresence, motion } from "framer-motion";
import type { PublicPlayer, RoomState } from "../../../shared/types.ts";
import { formatChips, type ChipUnit } from "../format.ts";
import type { TableLayout } from "../layout.ts";
import Card from "./Card.tsx";

interface Props {
  player: PublicPlayer;
  pos: { x: number; y: number };
  isSelf: boolean;
  isTurn: boolean;
  /** 딜링 stagger 순서 */
  dealIndex: number;
  phase: RoomState["phase"];
  /** 남은 시간 비율 0~1. 내 차례 표시용 */
  turnRatio: number | null;
  layout: TableLayout;
  unit: ChipUnit;
  bigBlind: number;
  /** 이웃 좌석과 겹치지 않도록 계산된 배율 */
  seatScale: number;
}

const ACTION_LABEL: Record<string, string> = {
  fold: "폴드",
  check: "체크",
  call: "콜",
  raise: "레이즈",
  allin: "올인",
};

export default function PlayerSeat({
  player,
  pos,
  isSelf,
  isTurn,
  dealIndex,
  phase,
  turnRatio,
  layout,
  unit,
  bigBlind,
  seatScale,
}: Props) {
  const dealing = phase !== "waiting";
  const dealFrom = {
    x: layout.deck.x - pos.x,
    y: layout.deck.y - pos.y,
  };

  return (
    <div
      className={[
        "seat",
        isSelf ? "seat-self" : "",
        isTurn ? "seat-turn" : "",
        player.folded ? "seat-folded" : "",
        !player.connected ? "seat-offline" : "",
        player.sittingOut ? "seat-out" : "",
        player.eliminated ? "seat-eliminated" : "",
      ].join(" ")}
      style={{
        left: pos.x,
        top: pos.y,
        ["--seat-w" as string]: `${layout.seatW}px`,
        ["--seat-h" as string]: `${layout.seatH}px`,
        transform: `translate(-50%, -50%) scale(${seatScale})`,
      }}
    >
      <div className="seat-cards">
        <AnimatePresence>
          {player.hasCards && dealing && (
            <>
              {[0, 1].map((i) => (
                <Card
                  key={`${player.id}-${i}`}
                  card={player.cards?.[i] ?? null}
                  faceDown={!player.cards}
                  size={isSelf ? "md" : "sm"}
                  dealFrom={dealFrom}
                  delay={dealIndex * 0.12 + i * 0.35}
                  dimmed={player.folded}
                />
              ))}
            </>
          )}
        </AnimatePresence>
      </div>

      <div className="seat-plate">
        {isTurn && turnRatio !== null && (
          <div className="seat-timer">
            <div className="seat-timer-fill" style={{ width: `${turnRatio * 100}%` }} />
          </div>
        )}
        <div className="seat-name">
          <span className="seat-no" title={`${player.seat + 1}번 자리`}>
            {player.seat + 1}
          </span>
          {player.isDealer && <span className="dealer-button">D</span>}
          <span className="seat-name-text">{player.name}</span>
          {!player.connected && <span className="seat-badge">접속끊김</span>}
          {player.eliminated && <span className="seat-badge">탈락</span>}
        </div>
        <AnimatePresence>
          {player.lastAction && !player.folded && (
            <motion.span
              key={`${player.lastAction}-${player.totalBet}`}
              className="seat-action"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {ACTION_LABEL[player.lastAction]}
            </motion.span>
          )}
        </AnimatePresence>

        <div className="seat-chips">
          {player.allIn ? (
            <span className="seat-allin">ALL IN</span>
          ) : player.eliminated ? (
            <span className="seat-busted">OUT</span>
          ) : (
            formatChips(player.chips, unit, bigBlind)
          )}
          {player.chips === 0 && !player.eliminated && player.rebuysLeft > 0 && (
            <span className="seat-rebuy">리바인 {player.rebuysLeft}</span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {player.bet > 0 && (
          <motion.div
            className="seat-bet"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
          >
            <span className="chip chip-bet" />
            {formatChips(player.bet, unit, bigBlind)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
