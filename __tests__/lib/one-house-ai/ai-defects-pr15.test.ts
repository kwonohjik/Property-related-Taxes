/**
 * PR-15 anchor (2026-11 리뷰 D-18 · D-35 · D-36) — AI 추출·바로 답하기 경로의 결함. D-17은 `one-house-ai-verify-route.test.ts`, D-34는
 * `access-guard.test.ts`, D-71은 `__tests__/lib/korean-law/cache-path-guard-d71.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { applyExtraction, coerceValue } from "@/lib/one-house-ai/apply-extraction";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";
import { mergeExtractedForm } from "@/lib/one-house-ai/merge-form";
import { answerTargetOf, writeAnswer } from "@/lib/one-house-ai/question-answer";
import { collectValidationQuestions } from "@/lib/one-house-ai/validation-questions";
import { completeCountExclusion } from "@/lib/calc/house-count-exclusion-complete";
import { getStepErrorCount, validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { normalizeOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import type { OneHouseExtraction } from "@/lib/one-house-ai/extraction-schema";

const spec = (path: string) => ONE_HOUSE_FIELD_CATALOG.find((s) => s.path === path)!;
const ex = (facts: [string, string][], rows: [string, string][] = []): OneHouseExtraction => ({
  rows: rows.map(([collection, rowId]) => ({ collection, rowId, description: "-" })),
  facts: facts.map(([path, value]) => ({ path, value, evidence: "-" })),
  missingFacts: [],
  notes: [],
});
const BASE: [string, string][] = [
  ["transferDate", "2025-06-01"],
  ["asset.assetKind", "housing"],
  ["asset.acquisitionDate", "2015-01-01"],
];

describe("D-18 countExclusion 판별 유니온 — payload 없는 kind가 화면·route를 죽이지 않는다", () => {
  it("정규화 leaf: special은 기본값으로 채우고 · 감면 종류 없는 reduction은 뺀다 · 종류가 있으면 기본값과 합친다", () => {
    expect(completeCountExclusion({ kind: "special" })).toMatchObject({ kind: "special", special: { article: "", requirementsConfirmed: false } });
    expect(completeCountExclusion({ kind: "reduction" })).toBeUndefined();
    expect(completeCountExclusion({ kind: "reduction", reduction: { type: "unsold_98_9" } })).toMatchObject({ kind: "reduction", reduction: { type: "unsold_98_9" } });
    expect(completeCountExclusion({ kind: "bogus" })).toBeUndefined();
    // kind 없이 감면 종류만 있으면(추출) 감면으로 본다 — 화면은 그 상태를 선택된 것으로 보였다
    expect(completeCountExclusion({ reduction: { type: "new_99_4_hometown" } })).toMatchObject({ kind: "reduction", reduction: { type: "new_99_4_hometown" } });
  });
  it("추출: kind=reduction만 → 넣지 않고 안내 · 합친 폼의 ⑧이 던지지 않는다", () => {
    const { form, issues, applied } = applyExtraction(
      ex([...BASE, ["houses[B].acquisitionDate", "2016-01-01"], ["houses[B].countExclusion.kind", "reduction"]], [["houses", "B"]]),
      ONE_HOUSE_FIELD_CATALOG,
    );
    expect((form.houses as Array<Record<string, unknown>>)[0].countExclusion).toBeUndefined();
    expect(issues.some((i) => i.path === "houses[B].countExclusion.reduction.type")).toBe(true);
    expect(applied.at(-1)).toBe(false);
    const merged = mergeExtractedForm(form);
    expect(() => validateAllSteps(merged)).not.toThrow();
    expect(() => collectValidationQuestions(merged, ONE_HOUSE_FIELD_CATALOG)).not.toThrow();
  });
  it("바로 답하기: kind에 「reduction」을 답해도 사이드바 ⑧(getStepErrorCount)이 던지지 않는다 · 「special」은 payload가 생긴다", () => {
    const merged = mergeExtractedForm(applyExtraction(ex([...BASE, ["houses[B].acquisitionDate", "2016-01-01"]], [["houses", "B"]]), ONE_HOUSE_FIELD_CATALOG).form);
    const path = "houses[B].countExclusion.kind";
    const target = answerTargetOf(path, spec("houses[].countExclusion.kind"), merged);
    expect(target).not.toBeNull();
    if (!target) return;
    const r = writeAnswer(merged, target, "reduction");
    expect(() => getStepErrorCount(r, 2)).not.toThrow();
    expect(r.houses[0].countExclusion).toBeUndefined();
    const sp = writeAnswer(merged, target, "special");
    expect(sp.houses[0].countExclusion).toMatchObject({ kind: "special", special: { article: "" } });
  });
  it("저장 상태 정규화: special payload 없는 행을 고친다(새로고침 뒤 반복 크래시)", () => {
    const n = normalizeOneHouseJudgmentForm({ houses: [{ id: "h1", acquisitionDate: "2016-01-01", countExclusion: { kind: "special" } }] });
    expect(n.houses[0].countExclusion).toMatchObject({ kind: "special", special: { article: "" } });
  });
});

describe("D-35 거주 개월 — 음수 거절 · 질문은 자산 칸으로", () => {
  it("음수 거주 개월은 넣지 않는다 · 0·양수는 넣는다 · 상생임대 증가율(음수 가능)은 그대로", () => {
    expect(coerceValue(spec("asset.residencePeriodMonthsAsset"), "-24")).toHaveProperty("error");
    expect(coerceValue(spec("asset.residencePeriodMonthsAsset"), "24")).toEqual({ value: "24" });
    expect(coerceValue(spec("winWinRentalIncreaseRatePct"), "-3")).toEqual({ value: "-3" });
  });
  it("자산 칸이 음수로 남은 저장 폼 — 질문은 옛 폼-전역 칸이 아니라 자산 칸을 가리킨다", () => {
    const merged = mergeExtractedForm(applyExtraction(ex(BASE), ONE_HOUSE_FIELD_CATALOG).form);
    const bad = { ...merged, assets: [{ ...merged.assets[0], residenceInputMode: "direct" as const, residencePeriods: [], residencePeriodMonthsAsset: "-24" }] };
    const paths = collectValidationQuestions(bad, ONE_HOUSE_FIELD_CATALOG).map((q) => q.path);
    expect(paths).not.toContain("residencePeriodMonths");
    expect(paths).toContain("asset.residencePeriodMonthsAsset");
  });
});

describe("D-36 「사실 N칸 채웠습니다」 — 넣은 칸만", () => {
  it("형식 오류·중복은 applied=false", () => {
    const { applied } = applyExtraction(
      ex([...BASE, ["asset.acquisitionDate", "2016-01-01"], ["contractTotalPrice", "일억"]]),
      ONE_HOUSE_FIELD_CATALOG,
    );
    expect(applied).toEqual([true, true, true, false, false]);
  });
});
