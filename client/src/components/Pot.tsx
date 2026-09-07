import { motion } from "framer-motion";
import type { PotView } from "../../../shared/types.ts";
import { POT_POS } from "../layout.ts";

interface Props {
  total: number;
  pots: PotView[];
}

export default function Pot({ total, pots }: Props) {
  if (total <= 0) return null;
  return (
    <motion.div
      className="pot"
      style={{ left: POT_POS.x, top: POT_POS.y }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="pot-chips">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`chip chip-stack-${i}`} />
        ))}
      </div>
      <motion.div className="pot-amount" key={total} initial={{ scale: 1.25 }} animate={{ scale: 1 }}>
        팟 {total.toLocaleString()}
      </motion.div>
      {pots.length > 1 && (
        <div className="pot-side">
          {pots.map((p, i) => (
            <span key={i}>
              {i === 0 ? "메인" : `사이드${i}`} {p.amount.toLocaleString()}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
