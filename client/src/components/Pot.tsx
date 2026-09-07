import { motion } from "framer-motion";
import type { PotView } from "../../../shared/types.ts";
import { formatChips, type ChipUnit } from "../format.ts";
import type { TableLayout } from "../layout.ts";

interface Props {
  total: number;
  pots: PotView[];
  layout: TableLayout;
  unit: ChipUnit;
  bigBlind: number;
}

export default function Pot({ total, pots, layout, unit, bigBlind }: Props) {
  if (total <= 0) return null;
  return (
    <motion.div
      className="pot"
      style={{ left: layout.pot.x, top: layout.pot.y }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="pot-chips">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`chip chip-stack-${i}`} />
        ))}
      </div>
      <motion.div className="pot-amount" key={total} initial={{ scale: 1.25 }} animate={{ scale: 1 }}>
        팟 {formatChips(total, unit, bigBlind)}
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
    </motion.div>
  );
}
