/**
 * 테이블 좌표는 픽셀로 고정한다 — 딜링/칩 이동 애니메이션의 시작·끝점을
 * 정확히 잡으려면 좌표가 확정되어 있어야 한다.
 *
 * 다만 크기는 화면에 맞춰 계산한다. 고정 크기를 통째로 축소하면 글자까지
 * 같이 줄어서 휴대폰에서 읽기 어려워진다. 화면에 맞는 크기로 그리면
 * 축소 배율이 1이 되어 글자가 제 크기로 나온다.
 */

export interface TableLayout {
  width: number;
  height: number;
  /** 펠트(초록 테이블) 테두리 여백 */
  feltInsetX: number;
  feltInsetY: number;
  /** 덱(카드가 날아오는 출발점) */
  deck: { x: number; y: number };
  /** 팟(칩이 모이는 지점) */
  pot: { x: number; y: number };
  communityY: number;
  /** 커뮤니티 카드 한 장의 폭. 5장이 펠트 안에 들어가도록 계산된다 */
  communityCardW: number;
  communityStep: number;
  portrait: boolean;
  /** 좌석 하나의 기본 크기 (겹침 방지 배율 계산의 기준) */
  seatW: number;
  seatH: number;
  /** i번째 좌석의 중심. index 0이 화면 아래(=나), 커질수록 시계 방향 */
  seatPos(i: number, total: number): { x: number; y: number };
}

interface Dims {
  width: number;
  height: number;
  insetX: number;
  insetY: number;
  feltInsetX: number;
  feltInsetY: number;
  seatW: number;
  seatH: number;
  portrait: boolean;
}

function makeLayout(d: Dims): TableLayout {
  const { width, height, insetX, insetY, feltInsetX, feltInsetY, portrait } = d;
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.max(60, width / 2 - insetX);
  const ry = Math.max(60, height / 2 - insetY);

  // 커뮤니티 카드 5장 + 간격이 펠트 안에 들어가야 한다
  const feltW = width - 2 * feltInsetX;
  const gap = portrait ? 6 : 10;
  const communityCardW = Math.max(
    34,
    Math.min(76, Math.floor((feltW - 24 - gap * 4) / 5))
  );

  return {
    width,
    height,
    feltInsetX,
    feltInsetY,
    deck: { x: cx, y: cy - height * 0.17 },
    pot: { x: cx, y: cy + height * 0.13 },
    // 세로형에서는 좌석이 위아래로만 늘어서서 세로 한가운데가 가장 넓다
    communityY: portrait ? cy : cy - height * 0.04,
    communityCardW,
    communityStep: communityCardW + gap,
    portrait,
    seatW: d.seatW,
    seatH: d.seatH,
    /**
     * i가 커질수록 화면상 시계 방향으로 돈다.
     * 서버는 딜러 다음 자리부터 순서를 매기므로, 이 방향이어야
     * 스몰/빅블라인드가 버튼의 왼쪽에 앉는다(표준 포커).
     */
    seatPos(i, total) {
      const angle = Math.PI / 2 + (2 * Math.PI * i) / total;
      return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
    },
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 상단바·하단바가 쓰는 세로 공간 */
const CHROME_H = { portrait: 190, desktop: 218 };

/**
 * 좌석·보드·팟이 서로 겹치지 않는 값을 화면 크기별·인원수별로 훑어서 고른 계수다.
 * (320x568부터 2560x1440까지, 2~10명, 채팅 열림/닫힘 전 조합에서 검증)
 *
 * @param reservedRight 오른쪽에 비워둘 폭(열린 채팅 패널 등).
 *   비워두지 않으면 넓은 화면에서 테이블 오른쪽 좌석이 패널에 가린다.
 * @param reservedBottom 아래에 비워둘 높이(분석 줄 등).
 */
export function computeLayout(
  vw: number,
  vh: number,
  reservedRight = 0,
  reservedBottom = 0
): TableLayout {
  const portrait = vw < 760;

  if (portrait) {
    const width = clamp(vw - 10, 300, 470);
    // 너무 길쭉하면 보기 힘들다 — 세로를 가로의 1.4배로 묶는다
    const height = clamp(vh - CHROME_H.portrait - reservedBottom, 340, width * 1.4);
    // 좁은 화면일수록 좌석도 같이 줄여야 가운데에 보드가 들어갈 자리가 남는다
    const seatW = clamp(width * 0.22, 70, 100);
    // 높이는 내용(카드+명패+베팅)이 들어가는 고정값. CSS와 짝을 이룬다.
    const seatH = 124;
    return makeLayout({
      width,
      height,
      seatW,
      seatH,
      insetX: seatW * 0.58,
      insetY: seatH / 2 + 8,
      feltInsetX: 28,
      feltInsetY: 28,
      portrait: true,
    });
  }

  const width = clamp(vw - 40 - reservedRight, 640, 1120);
  const height = clamp(vh - CHROME_H.desktop - reservedBottom, 440, width * 0.62);
  return makeLayout({
    width,
    height,
    seatW: 136,
    seatH: 142,
    insetX: 96,
    insetY: 76,
    feltInsetX: 74,
    feltInsetY: 44,
    portrait: false,
  });
}
