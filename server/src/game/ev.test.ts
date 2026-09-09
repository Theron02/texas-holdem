import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionEvs, type EvInput } from "../../../shared/ev.ts";

const base: EvInput = {
  win: 0.5, tie: 0, pot: 100_000, toCall: 20_000,
  canCheck: false, canRaise: true, raiseTo: 60_000, myBet: 0,
};
const of = (r: ReturnType<typeof actionEvs>, a: string) =>
  r.find((x) => x.action === a)!;

describe("행동별 기대값", () => {
  it("폴드는 언제나 0이다", () => {
    assert.equal(of(actionEvs(base), "fold").ev, 0);
  });

  it("콜 기대값 = 승률×팟 - 패율×콜액", () => {
    // 승률 50%, 팟 10만, 콜 2만 → 0.5*100000 - 0.5*20000 = 40000
    assert.equal(of(actionEvs(base), "call").ev, 40_000);
  });

  it("승률이 낮으면 콜이 손해가 되고 폴드가 최선이 된다", () => {
    const r = actionEvs({ ...base, win: 0.1 });
    // 0.1*100000 - 0.9*20000 = 10000 - 18000 = -8000
    assert.equal(of(r, "call").ev, -8_000);
    assert.equal(of(r, "fold").best, true);
    assert.equal(of(r, "call").best, false);
  });

  it("팟 오즈 경계에서 콜 기대값이 정확히 0이 된다", () => {
    // 필요 승률 = 콜 / (팟 + 콜) = 20000/120000 = 1/6
    const r = actionEvs({ ...base, win: 1 / 6 });
    assert.ok(Math.abs(of(r, "call").ev!) < 1, `경계에서 0이어야: ${of(r, "call").ev}`);
  });

  it("비기는 경우도 반영한다", () => {
    const r = actionEvs({ ...base, win: 0.4, tie: 0.2 });
    // 0.4*100000 + 0.2*((100000-20000)/2) - 0.4*20000 = 40000 + 8000 - 8000
    assert.equal(of(r, "call").ev, 40_000);
  });

  it("체크할 수 있으면 폴드는 아예 보여주지 않는다", () => {
    const r = actionEvs({ ...base, canCheck: true, toCall: 0 });
    assert.equal(r.find((x) => x.action === "fold"), undefined, "공짜인데 폴드를 권할 이유가 없다");
    assert.equal(of(r, "check").ev, 0);
    assert.equal(of(r, "check").best, true);
  });

  it("레이즈는 단정하지 않고 본전 폴드율로 답한다", () => {
    const r = actionEvs(base);
    const raise = of(r, "raise");
    assert.equal(raise.ev, null, "상대가 얼마나 접는지 모르면 단정할 수 없다");
    // 6만으로 올리면 6만을 걸어 10만을 노린다 → 60000/160000 = 37.5%
    assert.ok(Math.abs(raise.breakevenFold! - 0.375) < 1e-9);
    assert.equal(raise.best, false, "레이즈는 최선으로 뽑지 않는다");
  });

  it("이미 낸 칩은 레이즈 위험에서 빠진다", () => {
    // 이번 라운드에 2만을 냈고 6만으로 올리면 추가 4만만 더 건다
    const r = actionEvs({ ...base, myBet: 20_000, raiseTo: 60_000 });
    assert.ok(Math.abs(of(r, "raise").breakevenFold! - 40_000 / 140_000) < 1e-9);
  });

  it("레이즈할 수 없으면 레이즈 항목이 없다", () => {
    const r = actionEvs({ ...base, canRaise: false });
    assert.equal(r.find((x) => x.action === "raise"), undefined);
  });

  it("확률 합이 1을 넘지 않게 다뤄진다", () => {
    // win+tie가 1이면 패율 0
    const r = actionEvs({ ...base, win: 0.7, tie: 0.3 });
    assert.equal(of(r, "call").ev, 0.7 * 100_000 + 0.3 * 40_000);
  });
});
