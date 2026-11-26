/**
 * F-2 — 가업상속공제적용률 신·구 산식 선택 (양도일 2026.2.27.) + 이력 불러오기 대상 화면
 *
 * 「소득세법 시행령」 §163의2③
 *   - 구 ③(양도일 2026.2.26. 이전) · 신 ③1호(개인가업): 공제금액 ÷ 가업상속 재산가액
 *   - 신 ③2호(법인가업, 양도일 2026.2.27. 이후): (총자산가액 − 사업무관자산) ÷ 총자산가액 — 공제 한도와 무관
 *   부칙(대통령령 제36129호) §10 「이 영 시행 이후 자산을 양도하는 경우부터」
 * 「소득세법 시행령」 §163의2④2호 — 법인가업의 대상 자산은 주식등
 *
 * 수정 전 실측(계획서 §3.2): 상속세 엔진 적용률은 법인도 공제 ÷ 재산가액 → 1 · 0.375 (신 ③2호는 0.8).
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §6
 */
import { describe, it, expect } from "vitest";
import {
  deriveFamilyBusinessRateBasis,
  basisToFraction,
} from "@/lib/tax-engine/family-business-applied-rate";
import { calcCorporateBusinessAssets } from "@/lib/tax-engine/property-valuation-corporate";
import {
  filterFamilyBusinessInheritanceCandidates,
  candidateToPrefill,
} from "@/lib/calc/family-business-inheritance-lookup";
import type { CalculationRecord } from "@/lib/storage/types";

const OLD = new Date("2026-02-26");
const NEW = new Date("2026-02-27");

/** 주식 100억 · 총자산 50억 · 사업무관(임대부동산) 10억 → 가업상속 재산가액 80억 */
const CORP_SMALL = { totalAssets: 5_000_000_000, nonBusiness: { rentedRealEstate: 1_000_000_000 } };

function corp(transferDate: Date, deduction: number, finalValue: number) {
  return deriveFamilyBusinessRateBasis({
    transferDate,
    isCorporateStock: true,
    deduction,
    finalValue,
    usedDirectInput: false,
    corporate: calcCorporateBusinessAssets(CORP_SMALL.totalAssets, CORP_SMALL.nonBusiness, "2024-03-01"),
  });
}
const rateOf = (d: ReturnType<typeof deriveFamilyBusinessRateBasis>) => {
  if (!("basis" in d)) return d.unavailable;
  const f = basisToFraction(d.basis);
  return f.numerator / f.denominator;
};

describe("F-2 deriveFamilyBusinessRateBasis — 양도일 경계", () => {
  it("F2-1: 개인가업 — 양도일 02-26 / 02-27 둘 다 공제금액 ÷ 재산가액", () => {
    for (const d of [OLD, NEW]) {
      const r = deriveFamilyBusinessRateBasis({ transferDate: d, isCorporateStock: false, deduction: 300, finalValue: 800, usedDirectInput: false });
      expect(r).toEqual({ basis: { kind: "deduction_ratio", deductionAmount: 300, businessEstateValue: 800 } });
    }
  });

  it("F2-2·3: 법인 한도 미달(공제 80억 = 재산가액 80억) — 구 1 / 신 40억 ÷ 50억 = 0.8", () => {
    expect(rateOf(corp(OLD, 8_000_000_000, 8_000_000_000))).toBe(1);
    expect(corp(NEW, 8_000_000_000, 8_000_000_000)).toEqual({
      basis: { kind: "corporate_business_assets", totalAssets: 5_000_000_000, nonBusinessAssets: 1_000_000_000 },
    });
    expect(rateOf(corp(NEW, 8_000_000_000, 8_000_000_000))).toBe(0.8);
  });

  it("F2-4·5: 법인 한도 초과(공제 300억 · 재산가액 800억) — 구 0.375 / 신 0.8(한도와 무관)", () => {
    expect(rateOf(corp(OLD, 30_000_000_000, 80_000_000_000))).toBe(0.375);
    expect(rateOf(corp(NEW, 30_000_000_000, 80_000_000_000))).toBe(0.8);
  });

  it("F2-6: 직접입력 모드 — 구 산식은 산정 불가(재산가액 모름) · 신 ③2호는 총자산으로 산정", () => {
    const args = { isCorporateStock: true, deduction: 30_000_000_000, finalValue: 30_000_000_000, usedDirectInput: true,
      corporate: calcCorporateBusinessAssets(CORP_SMALL.totalAssets, CORP_SMALL.nonBusiness) };
    expect(deriveFamilyBusinessRateBasis({ ...args, transferDate: OLD })).toEqual({ unavailable: "direct_input" });
    expect(rateOf(deriveFamilyBusinessRateBasis({ ...args, transferDate: NEW }))).toBe(0.8);
    expect(
      deriveFamilyBusinessRateBasis({ transferDate: NEW, isCorporateStock: false, deduction: 1, finalValue: 1, usedDirectInput: true }),
    ).toEqual({ unavailable: "direct_input" });
  });

  it("F2-7: 법인 + 총자산 미입력 → 산정 불가(구 산식으로 갈음하지 않는다)", () => {
    expect(
      deriveFamilyBusinessRateBasis({ transferDate: NEW, isCorporateStock: true, deduction: 1, finalValue: 1, usedDirectInput: false }),
    ).toEqual({ unavailable: "corp_assets_missing" });
  });

  it("F2-9: 사업무관자산 ≥ 총자산 → 산정 불가", () => {
    expect(
      deriveFamilyBusinessRateBasis({
        transferDate: NEW, isCorporateStock: true, deduction: 1, finalValue: 1, usedDirectInput: false,
        corporate: calcCorporateBusinessAssets(1_000, { rentedRealEstate: 2_000 }),
      }),
    ).toEqual({ unavailable: "no_business_assets" });
  });

  it("공제액·재산가액 정수 없음(구 레코드) → deduction_missing", () => {
    expect(
      deriveFamilyBusinessRateBasis({ transferDate: OLD, isCorporateStock: false, deduction: 1, finalValue: undefined, usedDirectInput: false }),
    ).toEqual({ unavailable: "deduction_missing" });
  });
});

// ─── lookup (상속세 이력 → 양도세 prefill) ─────────────────────────────────

function record(input: Record<string, unknown>, fbDetail: Record<string, unknown>): CalculationRecord {
  return {
    id: "rec-1",
    userId: "local-user",
    taxType: "inheritance",
    title: "법인가업 상속",
    inputData: { deathDate: "2024-03-01", ...input },
    resultData: { result: { deductionDetail: { familyBusinessDetail: fbDetail } } },
    taxLawVersion: "2024-03-01",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2024-04-01T00:00:00.000Z",
    updatedAt: "2024-04-01T00:00:00.000Z",
  } as CalculationRecord;
}

/** 실제 상속세 폼 모양 — 주식 카드는 `stockItems`에 있다(InheritanceTaxForm 저장 = 폼 상태) */
const CORP_STOCK_ITEM = {
  id: "stock-1", name: "가업법인 주식", category: "unlisted_stock", marketValue: 10_000_000_000,
  familyBusinessCategory: "corporate_stock", corporateTotalAssets: 5_000_000_000,
  corporateNonBusinessAssets: { rentedRealEstate: 1_000_000_000 },
};
const FACTORY = { id: "land-1", name: "공장부지", category: "real_estate_land", familyBusinessCategory: "business_real_estate", appraisedValue: 700_000_000 };
const FB = { deduction: 8_000_000_000, finalValue: 8_000_000_000, appliedRate: 1, usedDirectInput: false, operatingYears: 30 };

describe("F-2 lookup — 대상 화면 · stockItems · 자산별 적용률", () => {
  it("F2-10: stockItems에만 있는 법인 주식 — 주식 화면 후보로 나오고 양도일 02-27이면 0.8 법정량을 싣는다", () => {
    const { candidates } = filterFamilyBusinessInheritanceCandidates([record({ stockItems: [CORP_STOCK_ITEM] }, FB)], "2026-02-27", "stock");
    const asset = candidates[0].familyBusinessAssets[0];
    expect(asset.itemId).toBe("stock-1");
    expect(asset.marketValue).toBe(10_000_000_000);
    expect(asset.rateBasis).toEqual({ kind: "corporate_business_assets", totalAssets: 5_000_000_000, nonBusinessAssets: 1_000_000_000 });
    const prefill = candidateToPrefill(candidates[0], "stock-1")!;
    expect(prefill.fbDeductionAppliedRate).toBe(0.8);
    expect(prefill.fbRateBasis).toEqual(asset.rateBasis);
  });

  it("F2-10b: 같은 이력 · 양도일 02-26 → 구 ③ 공제 ÷ 재산가액(= 1)", () => {
    const { candidates } = filterFamilyBusinessInheritanceCandidates([record({ stockItems: [CORP_STOCK_ITEM] }, FB)], "2026-02-26", "stock");
    expect(candidates[0].familyBusinessAssets[0].rateBasis).toEqual({
      kind: "deduction_ratio", deductionAmount: 8_000_000_000, businessEstateValue: 8_000_000_000,
    });
  });

  it("F2-8: 부동산 화면에서는 법인 주식이 빠지고, 그것뿐이면 wrong_target_only", () => {
    const { candidates, warnings } = filterFamilyBusinessInheritanceCandidates([record({ stockItems: [CORP_STOCK_ITEM] }, FB)], "2026-05-01");
    expect(candidates).toHaveLength(0);
    expect(warnings.map((w) => w.reason)).toEqual(["wrong_target_only"]);
    // 주식 화면에서는 사업용 자산이 빠진다
    const s = filterFamilyBusinessInheritanceCandidates([record({ estateItems: [FACTORY] }, FB)], "2026-05-01", "stock");
    expect(s.warnings.map((w) => w.reason)).toEqual(["wrong_target_only"]);
  });

  it("F2-11: 감정가로만 평가한 자산(marketValue 없음)도 후보에 남는다 — 상속세 엔진과 같은 resolveEstateItemValue", () => {
    const { candidates } = filterFamilyBusinessInheritanceCandidates([record({ estateItems: [FACTORY] }, FB)], "2026-05-01");
    expect(candidates[0].familyBusinessAssets[0].marketValue).toBe(700_000_000);
  });

  it("F2-6′: 직접입력 모드 이력 — 부동산 prefill 적용률을 1로 채우지 않는다", () => {
    const { candidates } = filterFamilyBusinessInheritanceCandidates(
      [record({ estateItems: [FACTORY] }, { ...FB, usedDirectInput: true })],
      "2026-05-01",
    );
    const prefill = candidateToPrefill(candidates[0], "land-1")!;
    expect(prefill.rateUnavailable).toBe("direct_input");
    expect(prefill.fbDeductionAppliedRate).toBe(0);
    expect(prefill.fbRateBasis).toBeUndefined();
  });
});
