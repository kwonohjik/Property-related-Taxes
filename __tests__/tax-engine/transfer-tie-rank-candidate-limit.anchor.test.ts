/**
 * `pickFavorableTieRank` 동순위 후보 — 상한 안팎의 후보 집합과, 큰 묶음에서 순열을 만들지 않는지.
 *
 * 묶음 크기의 계승만큼 순열을 먼저 만들면 11건부터 프로세스가 heap 고갈로 죽는다(계획서 axis-b-sidebar-nonland V-4).
 * 상한을 넘으면 어차피 「첫째만 바꾸는」 후보를 쓰므로 후보 집합은 수정 전과 같아야 한다.
 */
import { describe, expect, it } from "vitest";
import { pickFavorableTieRank } from "@/lib/tax-engine/transfer-tax-aggregate-helpers";
import type { TieCandidate } from "@/lib/tax-engine/transfer-tax-aggregate-helpers";

const asc = (a: number, b: number) => a - b;
const range = (n: number, from = 0) => Array.from({ length: n }, (_, i) => i + from);

/** 평가된 후보를 순위 순 자산 번호로 기록한다(세액 동일 → 첫 후보 유지). */
function run(groups: number[][], reducible: number[][] = []) {
  const seen: string[] = [];
  const key = (m?: ReadonlyMap<number, number>) => (m ? [...m.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k).join(",") : "-");
  const best = pickFavorableTieRank(
    groups,
    asc,
    (c: TieCandidate) => {
      seen.push(`${key(c.tieRank)}|${key(c.reducibleRank)}`);
      return { totalTax: 100, determinedTax: 100 };
    },
    reducible,
  );
  return { seen, best: `${key(best.tieRank)}|${key(best.reducibleRank)}` };
}

describe("후보 수가 상한 24 이하 — 전체 순열", () => {
  it("묶음 크기 4(24개) — 사전식 순열, 동액이면 order 순", () => {
    const { seen, best } = run([[3, 1, 0, 2]]);
    expect(seen).toHaveLength(24);
    expect(new Set(seen).size).toBe(24);
    expect(seen.slice(0, 3)).toEqual(["0,1,2,3|-", "0,1,3,2|-", "0,2,1,3|-"]);
    expect(seen[23]).toBe("3,2,1,0|-");
    expect(best).toBe("0,1,2,3|-");
  });

  it("묶음 2·2·2(8개)와 4·1(24개) — 곱이 상한 안이면 전체 순열", () => {
    expect(run([[0, 1], [2, 3], [4, 5]]).seen).toHaveLength(8);
    expect(run([[0, 1, 2, 3], [4]]).seen).toHaveLength(24);
  });
});

describe("후보 수가 상한 초과 — 묶음마다 첫째만 바꾼다", () => {
  it("묶음 크기 5(120개) → 5개, 나머지는 order 순", () => {
    expect(run([[4, 2, 0, 1, 3]]).seen).toEqual(["0,1,2,3,4|-", "1,0,2,3,4|-", "2,0,1,3,4|-", "3,0,1,2,4|-", "4,0,1,2,3|-"]);
  });

  it("묶음 3·3(36개) → 3×3, 4·2(48개) → 4×2", () => {
    expect(run([[0, 1, 2], [3, 4, 5]]).seen).toHaveLength(9);
    expect(run([[0, 1, 2, 3], [4, 5]]).seen).toHaveLength(8);
  });

  it.each([11, 12, 200])("묶음 크기 %i — 순열 없이 끝나고 후보 수는 상한 안", (n) => {
    const { seen, best } = run([range(n)]);
    expect(seen).toHaveLength(Math.min(n, 24));
    expect(seen[1].startsWith("1,0,2,")).toBe(true);
    expect(best.startsWith("0,1,2,")).toBe(true);
  });

  it("묶음 12개 × 2 — 곱해진 후보도 상한 24에서 자른다", () => {
    expect(run([range(12), range(12, 12)]).seen).toHaveLength(24);
  });

  it("reducibleGroups도 같은 상한 — 묶음 크기 12", () => {
    const { seen } = run([[0, 1]], [range(12, 2)]);
    expect(seen).toHaveLength(2 + 12);
    expect(seen[2]).toBe("0,1|2,3,4,5,6,7,8,9,10,11,12,13");
  });
});
