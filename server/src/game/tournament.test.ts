import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasLevelAfter, levelAt, presetFor } from "./tournament.ts";

const 만 = 10_000;

describe("토너먼트 블라인드 구조", () => {
  const t = presetFor("tournament");

  it("문서의 레벨 표를 그대로 따른다", () => {
    assert.deepEqual(
      t.levels.map((l) => [l.smallBlind, l.bigBlind, l.ante]),
      [
        [1 * 만, 2 * 만, 0],
        [2 * 만, 4 * 만, 0],
        [3 * 만, 6 * 만, 6 * 만],
        [4 * 만, 8 * 만, 8 * 만],
        [5 * 만, 10 * 만, 10 * 만],
        [10 * 만, 20 * 만, 20 * 만],
      ]
    );
  });

  it("앤티는 레벨 3부터 붙고 항상 빅블라인드와 같다", () => {
    for (const [i, level] of t.levels.entries()) {
      if (i < 2) assert.equal(level.ante, 0, `레벨 ${i + 1}에는 앤티가 없어야 한다`);
      else assert.equal(level.ante, level.bigBlind, `레벨 ${i + 1} 앤티 = 빅블라인드`);
    }
  });

  it("스타팅 300만 / 리바인 400만 / 총 3회 참가", () => {
    assert.equal(t.startingChips, 300 * 만);
    assert.equal(t.rebuyChips, 400 * 만);
    assert.equal(t.totalBuyins, 3, "최초 참가 1회 + 리바인 2회");
  });

  it("10분마다 오르고, 50분 뒤 10분 브레이크", () => {
    assert.ok(t.levels.every((l) => l.durationMs === 10 * 60_000));
    assert.equal(t.breakAfterMs, 50 * 60_000);
    assert.equal(t.breakDurationMs, 10 * 60_000);
    // 레벨 1~5가 50분 → 브레이크는 레벨 5가 끝난 뒤
    assert.equal(
      t.levels.slice(0, 5).reduce((s, l) => s + l.durationMs, 0),
      t.breakAfterMs
    );
  });

  it("표를 넘어가면 2배씩 계속 오른다", () => {
    const last = t.levels[t.levels.length - 1]!;
    const next = levelAt(t, t.levels.length);
    assert.equal(next.smallBlind, last.smallBlind * 2);
    assert.equal(next.bigBlind, last.bigBlind * 2);
    assert.equal(next.ante, last.ante * 2);
    assert.equal(levelAt(t, t.levels.length + 1).bigBlind, last.bigBlind * 4);
    assert.ok(hasLevelAfter(t, 99), "토너먼트는 시간으로 끝나지 않는다");
  });
});

describe("타임어택 구조", () => {
  const t = presetFor("timeattack");

  it("스타팅 500만 / 리바인 500만 / 총 4회 참가", () => {
    assert.equal(t.startingChips, 500 * 만);
    assert.equal(t.rebuyChips, 500 * 만);
    assert.equal(t.totalBuyins, 4, "최초 참가 1회 + 리바인 3회");
  });

  it("10만/10만으로 40분, 그 뒤 50만/50만으로 10분", () => {
    assert.deepEqual(
      t.levels.map((l) => [l.smallBlind, l.bigBlind, l.durationMs / 60_000]),
      [
        [10 * 만, 10 * 만, 40],
        [50 * 만, 50 * 만, 10],
      ]
    );
    assert.ok(t.levels.every((l) => l.ante === 0), "타임어택에는 앤티가 없다");
  });

  it("총 50분이 지나면 끝난다", () => {
    assert.equal(t.breakAfterMs, null, "브레이크 없음");
    assert.equal(t.levels.reduce((s, l) => s + l.durationMs, 0), 50 * 60_000);
    assert.ok(hasLevelAfter(t, 0));
    assert.ok(!hasLevelAfter(t, 1), "마지막 레벨 뒤에는 게임이 끝나야 한다");
  });
});
