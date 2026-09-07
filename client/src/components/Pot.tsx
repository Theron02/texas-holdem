import { motion } from "framer-motion";
import type { PotView } from "../../../shared/types.ts";
import { formatChips, type ChipUnit } from "../format.ts";

interface Props {
  total: number;
  pots: PotView[];
  pos: { x: number; y: number };
  /** 좌석과 겹치지 않도록 계산된 자리. 실제 크기를 여기에 맞춘다 */
  size: { w: number; h: number };
  unit: ChipUnit;
  bigBlind: number;
}

/**
 * 칩과 금액을 한 줄에 둔다. 세로로 쌓으면 높이를 예측할 수 없어
 * 좌석과 겹치지 않는 자리를 계산해 둔 게 소용없어진다.
 */
export default function Pot({ total, pots, pos, size, unit, bigBlind }: Props) {
  if (total <= 0) return null;
  return (
    // 바깥은 애니메이션 없는 평범한 div다. framer-motion이 transform을 쓰면
    // 가운데 정렬용 translate(-50%,-50%)가 덮어써져 팟이 옆으로 밀린다.
    <div
      className="pot"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      <motion.div
        className="pot-amount"
        key={total}
        initial={{ scale: 1.18 }}
        animate={{ scale: 1 }}
      >
        <span className="chip chip-bet" />
        <span className="pot-value">팟 {formatChips(total, unit, bigBlind)}</span>
      </motion.div>
      {pots.length > 1 && (
        <div className="pot-side">
          {pots.map((p, i) => (
            <span key={i}>
              {i === 0 ? "메인" : `사이드${i}`} {formatChips(p.amount, unit, bigBlind)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
