/** 테이블은 고정 크기로 그리고 화면에 맞춰 통째로 스케일한다.
 *  좌표가 픽셀로 고정되어야 딜링/칩 이동 애니메이션의 시작·끝점을 정확히 잡을 수 있다.
 *
 *  좁은 화면에서는 가로로 긴 타원이 너무 작아지므로 세로형 배치로 바꾼다. */

export interface TableLayout {
  width: number;
  height: number;
  /** 덱(카드가 날아오는 출발점) */
  deck: { x: number; y: number };
  /** 팟(칩이 모이는 지점) */
  pot: { x: number; y: number };
  /** 커뮤니티 카드 줄의 세로 위치 */
  communityY: number;
  /** 커뮤니티 카드 사이 간격 */
  communityStep: number;
  /** i번째 좌석의 중심. index 0이 화면 아래(=나) */
  seatPos(i: number, total: number): { x: number; y: number };
}

function makeLayout(
  width: number,
  height: number,
  insetX: number,
  insetY: number,
  communityStep: number
): TableLayout {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2 - insetX;
  const ry = height / 2 - insetY;
  return {
    width,
    height,
    deck: { x: cx, y: cy - height * 0.16 },
    pot: { x: cx, y: cy + height * 0.11 },
    communityY: cy - height * 0.05,
    communityStep,
    seatPos(i, total) {
      const angle = Math.PI / 2 - (2 * Math.PI * i) / total;
      return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
    },
  };
}

/** 넓은 화면 — 가로로 긴 테이블 */
export const DESKTOP_LAYOUT = makeLayout(960, 600, 96, 74, 86);

/** 좁은 화면(휴대폰) — 세로로 긴 테이블 */
export const MOBILE_LAYOUT = makeLayout(520, 820, 62, 108, 60);

export function layoutFor(portrait: boolean): TableLayout {
  return portrait ? MOBILE_LAYOUT : DESKTOP_LAYOUT;
}
