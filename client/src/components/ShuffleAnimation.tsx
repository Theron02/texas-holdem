import { motion } from "framer-motion";

/** 실제 셔플 결과와는 무관한 순수 연출. 새 핸드가 시작될 때 잠깐 보여준다. */
export default function ShuffleAnimation({ x, y }: { x: number; y: number }) {
  return (
    <div className="shuffle-stage" style={{ left: x, top: y }}>
      {Array.from({ length: 9 }, (_, i) => (
        <motion.div
          key={i}
          className="shuffle-card"
          initial={{ x: 0, y: 0, rotate: 0 }}
          animate={{
            x: [0, i % 2 ? 44 : -44, 0, i % 2 ? -26 : 26, 0],
            y: [0, -i * 2, i * 1.5, -i, 0],
            rotate: [0, i % 2 ? 12 : -12, 0, i % 2 ? -7 : 7, 0],
          }}
          transition={{
            duration: 0.9,
            times: [0, 0.25, 0.5, 0.75, 1],
            delay: i * 0.025,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
