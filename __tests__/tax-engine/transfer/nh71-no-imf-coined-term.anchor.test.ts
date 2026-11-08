/**
 * anchor — 「IMF 1차·2차」는 법령에 없는 조어다 (리뷰 NH-71 · L15 잔여).
 *
 * #2959가 결과 카드·소득금액 차감 라우터의 표기를 조특법 현행 제명(「신축주택의 취득자에 대한 양도소득세의 감면」·「…과세특례」)으로 바꿨다.
 * 사용자에게 보이는 나머지 4곳 — 보유 감면주택 ⑥ 「적용 조문」 선택지(화면·AI 필드 카탈로그) · 보유 감면주택 판정 항목 라벨(결과 명세) ·
 * 신축주택 매트릭스 시드의 `article`(엔진 `newHousingReductionDetail.matchedArticle`로 결과 카드에 노출) — 도 같은 표기로 맞춘다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SPECIAL_HOUSE_EXCLUSION_WINDOWS } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { REDUCTION_METADATA } from "@/lib/tax-engine/transfer-reductions/metadata";
import { ONE_HOUSE_FIELD_CATALOG_HOUSES } from "@/lib/one-house-ai/field-catalog-houses";
import { transferTaxSeeds } from "@/lib/tax-engine/data/transfer-rate-seed";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const UI_LABEL_99 = REDUCTION_METADATA.new_99.uiLabel;
const UI_LABEL_993 = REDUCTION_METADATA.new_99_3.uiLabel;

describe("NH-71 잔여 — 사용자 노출 표기에서 「IMF」 조어 제거", () => {
  it("보유 감면주택 판정 항목 라벨(§99·§99의3) = 조특법 현행 제명 · IMF 없음", () => {
    expect(SPECIAL_HOUSE_EXCLUSION_WINDOWS.new_99.label).toBe(UI_LABEL_99);
    expect(SPECIAL_HOUSE_EXCLUSION_WINDOWS.new_99_3.label).toBe(UI_LABEL_993);
    for (const w of Object.values(SPECIAL_HOUSE_EXCLUSION_WINDOWS)) expect(w.label).not.toMatch(/IMF/);
  });
  it("AI 필드 카탈로그의 「적용 조문」 선택지 라벨", () => {
    const field = ONE_HOUSE_FIELD_CATALOG_HOUSES.find((f) => f.path === "houses[].countExclusion.special.article")!;
    const options = (field as unknown as { values: { value: string; label: string }[] }).values;
    expect(options.find((o) => o.value === "new_99")!.label).toContain(UI_LABEL_99);
    expect(options.find((o) => o.value === "new_99_3")!.label).toContain(UI_LABEL_993);
    expect(JSON.stringify(ONE_HOUSE_FIELD_CATALOG_HOUSES)).not.toMatch(/IMF/);
  });
  it("보유 감면주택 ⑥ 「적용 조문」 선택지 라벨(화면 소스)", () => {
    const src = read("components/calc/transfer/SpecialHouseExclusionSection.tsx");
    expect(src).toContain(`{ value: "new_99", label: "${UI_LABEL_99} (`);
    expect(src).toContain(`{ value: "new_99_3", label: "${UI_LABEL_993} (`);
    expect(src).not.toMatch(/IMF/);
  });
  it("신축주택 매트릭스 시드의 article 문자열 — 엔진이 결과 카드(matchedArticle)에 그대로 싣는다", () => {
    const text = JSON.stringify(transferTaxSeeds);
    expect(text).not.toMatch(/IMF 1차|IMF 2차/);
    expect(text).toContain('"article":"§99"');
  });
});
