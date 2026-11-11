/**
 * 리뷰 Q-28 (2026-11-10 결정) — 구 `unsold_housing` 재분류: 취득일이 §98의3 기간 밖이면 §98의3으로 열지 않고
 * 「조문 미정」(`unsold_housing_unresolved`)으로 두어 재선택을 요구한다. 기간은 엔진 상수 단일 소스.
 */
import { describe, it, expect } from "vitest";
import {
  reclassifiedLegacyHousingType,
  migrateReductionReclassification,
  UNSOLD_HOUSING_UNRESOLVED_TYPE,
} from "@/lib/storage/migrations/reduction-reclassification";
import { UNSOLD_98_3_PERIOD_FROM_RESIDENT, UNSOLD_98_3_PERIOD_TO } from "@/lib/tax-engine/transfer-reductions/unsold-98-3";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset";
import { migrateLegacyForm } from "@/lib/stores/calc-wizard-migration";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";

const U = "unsold_housing" as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayAfter = (d: Date) => iso(new Date(d.getTime() + 86_400_000));

describe("Q-28 경계 — 엔진 상수에서 뽑은 창", () => {
  it("취득일이 창 안(시작·끝 당일 포함) → unsold_98_3", () => {
    expect(reclassifiedLegacyHousingType(U, iso(UNSOLD_98_3_PERIOD_FROM_RESIDENT))).toBe("unsold_98_3");
    expect(reclassifiedLegacyHousingType(U, iso(UNSOLD_98_3_PERIOD_TO))).toBe("unsold_98_3");
    expect(reclassifiedLegacyHousingType(U, "2009-12-01")).toBe("unsold_98_3");
  });
  it("취득일이 창 끝 다음날 이후(§98의7·§98의8 시기 등) → 조문 미정", () => {
    expect(reclassifiedLegacyHousingType(U, dayAfter(UNSOLD_98_3_PERIOD_TO))).toBe("unresolved");
    expect(reclassifiedLegacyHousingType(U, "2012-06-01")).toBe("unresolved");
    expect(reclassifiedLegacyHousingType(U, "2015-03-01")).toBe("unresolved");
  });
  it("창 시작 전 취득은 종전대로 new_99_3, 취득일 없음은 종전대로 unsold_98_3(⑧이 일자를 묻는다)", () => {
    expect(reclassifiedLegacyHousingType(U, "2009-02-11")).toBe("new_99_3");
    expect(reclassifiedLegacyHousingType(U, undefined)).toBe("unsold_98_3");
  });
  it("계약일 축이 먼저 — 계약일이 §98의3 창이면 취득일이 창 뒤여도 unsold_98_3(완납일은 ⑧이 묻는다)", () => {
    expect(reclassifiedLegacyHousingType(U, "2012-06-01", "2010-01-20")).toBe("unsold_98_3");
    expect(reclassifiedLegacyHousingType(U, "2012-06-01", "2003-05-01")).toBe("new_99_3");
  });
  it("계약일이 창 밖(2012)이고 취득일도 창 뒤 → 미정", () => {
    expect(reclassifiedLegacyHousingType(U, "2012-06-01", "2012-05-01")).toBe("unresolved");
  });
});

describe("Q-28 세 진입점이 같은 결과", () => {
  it("migrateAsset(세션·이력 복원): 취득 2012.6.1. → 미정 항목, 창 안 → unsold_98_3", () => {
    const a = migrateAsset({ assetKind: "housing", acquisitionDate: "2012-06-01", reductions: [{ type: U }] });
    expect(a.reductions).toEqual([{ type: UNSOLD_HOUSING_UNRESOLVED_TYPE }]);
    const b = migrateAsset({ assetKind: "housing", acquisitionDate: "2009-06-01", reductions: [{ type: U }] });
    expect((b.reductions![0] as { type: string }).type).toBe("unsold_98_3");
  });
  it("폼-전역 구버전 세션: 취득 2012.6.1. → 미정 항목", () => {
    const form = migrateLegacyForm(
      { transferDate: "2024-06-01", acquisitionDate: "2012-06-01", reductionType: U, reductionRegion: "non_metropolitan", propertyType: "housing" },
      createDefaultTransferFormData(),
    );
    expect(form.assets?.[0]?.reductions).toEqual([{ type: UNSOLD_HOUSING_UNRESOLVED_TYPE }]);
    // ⑧이 막는다 — 임의 §98의3 폼이 조용히 열리지 않는다
    const messages = collectStepIssues(2, form).map((i) => i.message);
    expect(messages.some((m) => m.includes("적용 조문을 정하지 못했습니다"))).toBe(true);
  });
  type Rec = { inputData: { assets: { acquisitionDate: string; assetContractDate?: string; reductions: { type: string }[] }[] } };
  const rec = (acq: string, contract?: string): Rec => ({
    inputData: { assets: [{ acquisitionDate: acq, ...(contract ? { assetContractDate: contract } : {}), reductions: [{ type: U }] }] },
  });
  it("이력(Dexie upgrade)", async () => {
    const records = [rec("2009-06-01"), rec("2012-06-01"), rec("2005-06-01"), rec("2012-06-01", "2010-01-20")];
    const tx = { table: () => ({ toCollection: () => ({ modify: async (fn: (r: Rec) => void) => records.forEach(fn) }) }) } as never;
    await migrateReductionReclassification(tx);
    expect(records.map((r) => r.inputData.assets[0].reductions[0].type)).toEqual([
      "unsold_98_3", UNSOLD_HOUSING_UNRESOLVED_TYPE, "new_99_3", "unsold_98_3",
    ]);
  });
});
