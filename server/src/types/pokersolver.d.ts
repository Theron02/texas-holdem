declare module "pokersolver" {
  /** 5~7장 중 최고 5장 조합. 비교는 Hand.winners()로만 한다. */
  export class Hand {
    /** 예: Hand.solve(["As","Kd","Qh","Jc","Ts","3d","7h"]) */
    static solve(cards: string[]): Hand;
    /** 동점자를 모두 담아서 돌려준다. */
    static winners(hands: Hand[]): Hand[];
    /** 예: "Straight" */
    name: string;
    /** 예: "Straight, A High" */
    descr: string;
    rank: number;
  }
  const pokersolver: { Hand: typeof Hand };
  export default pokersolver;
}
