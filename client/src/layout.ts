/** 테이블은 고정 크기로 그리고 화면에 맞춰 통째로 스케일한다.
 *  좌표가 픽셀로 고정되어야 딜링/칩 이동 애니메이션의 시작·끝점을 정확히 잡을 수 있다. */
export const TABLE_W = 960;
export const TABLE_H = 600;

/** 덱(카드가 날아오는 출발점) 위치 */
export const DECK_POS = { x: TABLE_W / 2, y: TABLE_H / 2 - 96 };
/** 팟(칩이 모이는 지점) 위치 */
export const POT_POS = { x: TABLE_W / 2, y: TABLE_H / 2 + 66 };

const CX = TABLE_W / 2;
const CY = TABLE_H / 2;
const RX = TABLE_W / 2 - 96;
const RY = TABLE_H / 2 - 74;

/** i번째 좌석의 중심 좌표. index 0이 화면 아래(=나)이고 시계 방향으로 돈다. */
export function seatPos(i: number, total: number): { x: number; y: number } {
  const angle = Math.PI / 2 - (2 * Math.PI * i) / total;
  return { x: CX + RX * Math.cos(angle), y: CY + RY * Math.sin(angle) };
}
