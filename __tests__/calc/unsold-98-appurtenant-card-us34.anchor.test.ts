/**
 * US-34 anchor — 조특법 §98 시리즈 감면주택 + 그 부수토지 별도 카드 조합을 ⑧이 막는다 (사용자 결정 2026-11-06 「조합 차단」)
 *
 * 부수토지를 별도 토지 카드로 나누면 토지 카드에는 감면을 걸 수 없어(조문 게이트) 토지분이 특례에서 빠진다
 * (리뷰 실측: §98의7 18,239,998 · §98의3 20,038,332 과대 과세). 해석례는 실제 부수토지로 쓰는 부분도 특례 대상으로 본다
 * (재산세과-861 · 재산세과-1685 · 부동산거래관리과-1097). 한 장의 주택 카드로 입력하게 안내한다.
 * 근거: docs/reviews/unsold-98-series-review-2026-11.md US-34.
 */
import { describe, it, expect } from "vitest";
import { allIssues } from "./_helpers/redev-one-house-route";
import { HOUSE, LAND, form } from "./_helpers/g1-reverse-appurtenant-fixtures";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

const withRed = (type: string) => ({ ...HOUSE(0), reductions: [getReductionDefault(type as never)] });
const appurtenantIssues = (f: never) =>
  allIssues(f).filter((i: { field?: string; message: string }) => i.field === "landNature" && i.message.includes("한 장의 주택 카드"));

describe("US-34 ⑧ — §98 시리즈 감면주택 + 부수토지 별도 카드", () => {
  it("A-1: 🔴 주택(§98의7) 먼저 + 부수토지 카드 → 토지 카드의 토지 성격 칸에서 막는다", () => {
    const iss = appurtenantIssues(form(withRed("unsold_98_7"), LAND("l1", 300)));
    expect(iss).toHaveLength(1);
    expect(iss[0].message).toContain("§98의7");
  });

  it("A-2: 6조문 모두 같다", () => {
    for (const id of ["unsold_98", "unsold_98_2", "unsold_98_3", "unsold_98_5", "unsold_98_6", "unsold_98_7"]) {
      expect(appurtenantIssues(form(withRed(id), LAND("l1", 300))), id).toHaveLength(1);
    }
  });

  it("A-3: 대조군 — 감면 없음 · 범위 밖 조문(§98의8·§99) · 독립 나대지 · 같은 물건 지분 분할은 막지 않는다", () => {
    expect(appurtenantIssues(form(HOUSE(0), LAND("l1", 300)))).toEqual([]);
    expect(appurtenantIssues(form(withRed("unsold_98_8"), LAND("l1", 300)))).toEqual([]);
    expect(appurtenantIssues(form(withRed("new_99"), LAND("l1", 300)))).toEqual([]);
    expect(appurtenantIssues(form(withRed("unsold_98_7"), { ...LAND("l1", 300), landNature: "standalone" }))).toEqual([]);
    const frac = { ...(form(withRed("unsold_98_7"), LAND("l1", 300)) as object), assetSplitMode: "fractional" } as never;
    expect(appurtenantIssues(frac)).toEqual([]);
  });

});
