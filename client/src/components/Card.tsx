import { motion } from "framer-motion";
import type { Card as CardType } from "../../../shared/types.ts";

export type CardSize = "sm" | "md" | "lg";

interface Props {
  card?: CardType | null;
  /** 뒷면으로 둘지. 앞면 데이터가 없으면 자동으로 뒷면. */
  faceDown?: boolean;
  size?: CardSize;
  /** 딜링 애니메이션 출발점(카드 중심 기준 상대 좌표). 없으면 등장 애니메이션 없음. */
  dealFrom?: { x: number; y: number };
  /** 딜링 순서에 따른 지연(초) */
  delay?: number;
  dimmed?: boolean;
}

const RED = new Set(["♥", "♦"]);

export default function Card({
  card,
  faceDown,
  size = "md",
  dealFrom,
  delay = 0,
  dimmed,
}: Props) {
  const showBack = faceDown || !card;
  const red = card ? RED.has(card.suit) : false;

  return (
    <motion.div
      className={`card card-${size}${dimmed ? " card-dimmed" : ""}`}
      initial={
        dealFrom
          ? { x: dealFrom.x, y: dealFrom.y, opacity: 0, rotate: -18, scale: 0.7 }
          : { opacity: 0, scale: 0.8 }
      }
      animate={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 260, damping: 26 }}
    >
      {/* rotateY로 앞뒤를 뒤집는다. 양면에 backface-visibility:hidden이 걸려 있다. */}
      <motion.div
        className="card-inner"
        initial={false}
        animate={{ rotateY: showBack ? 180 : 0 }}
        transition={{ duration: 0.45, ease: "easeInOut", delay: delay + 0.1 }}
      >
        <div className={`card-face card-front${red ? " red" : ""}`}>
          {card && (
            <>
              <span className="card-corner">
                {card.rank}
                <em>{card.suit}</em>
              </span>
              <span className="card-pip">{card.suit}</span>
              <span className="card-corner card-corner-br">
                {card.rank}
                <em>{card.suit}</em>
              </span>
            </>
          )}
        </div>
        <div className="card-face card-back" />
      </motion.div>
    </motion.div>
  );
}
