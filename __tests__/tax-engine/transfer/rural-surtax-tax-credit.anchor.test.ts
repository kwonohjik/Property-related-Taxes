/**
 * anchor: 세액감면형 조특법 감면의 **농어촌특별세** (감면세액 × 20%)
 *
 * ## 무엇이 없었나
 *
 * 「농어촌특별세법」 §5①1호는 **조특법 감면세액 × 20%**를 농특세로 정하는데, 이 저장소는
 * **차감형(§99의3)과 하이브리드(§98의7·§99의2 등)에만** 계산하고 세액감면형에는 계산하지 않았다.
 *
 * 실측(2026-08-23 · mock 세율 · 토지 20억 양도 · 아래 픽스처):
 *
 * | 감면 | 감면세액 | 종전 농특세 |
 * |---|---|---|
 * | §77 공익수용(현금) | 67,700,250 | **0** |
 * | §77의2 대토보상 | 90,463,317 | **0** |
 * | §69 자경농지 | 100,000,000 | 0 ✅ (조문상 비과세라 우연히 맞았다) |
 *
 * ## 비과세는 **열거주의**다
 *
 * 「농어촌특별세법」 §4 2호 + **시행령 §4①1호**:
 * 「「조세특례제한법」 **제66조부터 제70조까지**, 제72조제1항, **제77조**[「조세특례제한법」
 * 제69조제1항 본문에 따른 거주자가 **직접 경작한 토지**(8년 이상 경작할 것의 요건은 적용하지
 * 아니한다)로 **한정**한다] 및 제102조, 제104조의2 … 에 따른 감면」
 *
 * ⇒ **§69는 무조건 비과세** · **§77은 직접 경작 토지만** 비과세 · **열거되지 않은 조문
 *   (§77의2·§77의3·§97 시리즈)은 과세**.
 *
 * ## 세 경로가 같은 판정표를 쓴다
 *
 * 단건(finalize STEP 8.8) · §155⑳ 특례 경로 · 다건(aggregate) — `transfer-tax-rural-surtax.ts`
 * 단일 소스. 한 곳만 고치면 **같은 감면이 경로에 따라 달라진다**.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { resolveTaxCreditRuralSurtax } from "@/lib/tax-engine/transfer-tax-rural-surtax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const EXPROPRIATION = [
  {
    type: "public_expropriation" as const,
    cashCompensation: 2_000_000_000,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: D("2024-01-01"),
  },
];
const REPLACEMENT = [
  {
    type: "replacement_land_comp" as const,
    cashCompensation: 1_000_000_000,
    replacementLandComp: 1_000_000_000,
    businessApprovalDate: D("2023-06-01"),
  },
];
const SELF_FARMING = [{ type: "self_farming" as const, farmingYears: 10, isResidenceRequirementMet: true }];

function land(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    acquisitionDate: D("2012-01-01"),
    transferDate: D("2026-03-01"),
    transferPrice: 2_000_000_000,
    acquisitionPrice: 400_000_000,
    expenses: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    annualBasicDeductionUsed: 0,
    isNonBusinessLand: false,
    ...o,
  } as Partial<TransferTaxInput>);
}

/** 농특세 = 총부담세액 − (결정세액 + 지방소득세) */
const surtaxOf = (r: { totalTax: number; determinedTax: number; localIncomeTax: number }) =>
  r.totalTax - (r.determinedTax + r.localIncomeTax);

describe("농특세 · 판정표 (leaf)", () => {
  it("RS-01: §69 자경농지는 비과세 — 농특세령 §4①1호 「§66부터 §70까지」", () => {
    const v = resolveTaxCreditRuralSurtax({
      reductionTypeApplied: "self_farming",
      reductionAmount: 100_000_000,
    });
    expect(v.verdict).toBe("exempt");
    expect(v.surtax).toBe(0);
  });

  it("RS-02: §77은 **직접 경작한 토지만** 비과세 (8년 요건 불요)", () => {
    const taxed = resolveTaxCreditRuralSurtax({
      reductionTypeApplied: "public_expropriation",
      reductionAmount: 100_000_000,
    });
    expect(taxed.verdict).toBe("taxable");
    expect(taxed.surtax).toBe(20_000_000);

    const exempt = resolveTaxCreditRuralSurtax({
      reductionTypeApplied: "public_expropriation",
      reductionAmount: 100_000_000,
      isSelfCultivatedExpropriatedLand: true,
    });
    expect(exempt.verdict).toBe("exempt");
    expect(exempt.surtax).toBe(0);
  });

  it("RS-03: 열거되지 않은 조문은 과세 (§77의2·§77의3·§97 시리즈)", () => {
    for (const type of ["replacement_land_comp", "gb_designated_land", "rental_97_3"]) {
      const v = resolveTaxCreditRuralSurtax({ reductionTypeApplied: type, reductionAmount: 50_000_000 });
      expect(v.verdict).toBe("taxable");
      expect(v.surtax).toBe(10_000_000);
    }
  });

  it("RS-04: 🔴 모르는 유형은 **부과하지 않고** 사유를 남긴다", () => {
    const v = resolveTaxCreditRuralSurtax({
      reductionTypeApplied: "some_future_reduction",
      reductionAmount: 50_000_000,
    });
    expect(v.verdict).toBe("unknown");
    expect(v.surtax).toBe(0); // 근거 없는 부과 금지
    expect(v.reason).toMatch(/판정표에 없습니다/);
  });
});

describe("농특세 · 단건 경로", () => {
  it("RS-10: §77 공익수용 — 감면세액 67,700,250 × 20% = 13,540,050", () => {
    const r = calculateTransferTax(land({ reductions: EXPROPRIATION }), rates);
    expect(r.reductionAmount).toBe(67_700_250);
    expect(surtaxOf(r)).toBe(13_540_050);
    expect(r.steps.some((s) => s.label === "농어촌특별세 (감면세액 × 20%)")).toBe(true);
  });

  it("RS-11: 직접 경작한 토지면 붙지 않는다", () => {
    const r = calculateTransferTax(
      land({ reductions: EXPROPRIATION, isSelfCultivatedExpropriatedLand: true }),
      rates,
    );
    expect(r.reductionAmount).toBe(67_700_250); // 감면 자체는 그대로
    expect(surtaxOf(r)).toBe(0);
  });

  it("RS-12: §77의2 대토보상 — 90,463,317 × 20% = 18,092,663", () => {
    const r = calculateTransferTax(land({ reductions: REPLACEMENT }), rates);
    expect(r.reductionAmount).toBe(90_463_317);
    expect(surtaxOf(r)).toBe(18_092_663);
  });

  it("RS-13: §69 자경농지는 붙지 않는다 (감면은 그대로)", () => {
    const r = calculateTransferTax(land({ reductions: SELF_FARMING }), rates);
    expect(r.reductionAmount).toBe(100_000_000);
    expect(surtaxOf(r)).toBe(0);
  });
});

describe("농특세 · 다건 경로", () => {
  it("RS-20: 🔴 자산별로 판정한다 — 한 자산은 자경, 다른 자산은 아니다", () => {
    const item = (id: string, over: object = {}): TransferTaxItemInput =>
      ({
        ...(land({ reductions: EXPROPRIATION }) as unknown as TransferTaxItemInput),
        propertyId: id,
        propertyLabel: id,
        ...over,
      }) as TransferTaxItemInput;

    const input: AggregateTransferInput = {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [item("a1"), item("a2", { isSelfCultivatedExpropriatedLand: true })],
    } as AggregateTransferInput;

    const agg = calculateTransferTaxAggregate(input, rates);
    // 두 자산 모두 과세라면 나올 값보다 작고, 둘 다 비과세보다는 크다.
    expect(agg.ruralSurtax).toBeGreaterThan(0);
    expect(agg.ruralSurtax).toBeLessThan(Math.floor(agg.reductionAmount * 0.2));
  });

  it("RS-21: 자경 자산만 있으면 다건에서도 0이다", () => {
    const item = (id: string): TransferTaxItemInput =>
      ({
        ...(land({
          reductions: EXPROPRIATION,
          isSelfCultivatedExpropriatedLand: true,
        }) as unknown as TransferTaxItemInput),
        propertyId: id,
        propertyLabel: id,
      }) as TransferTaxItemInput;
    const agg = calculateTransferTaxAggregate(
      { taxYear: 2026, annualBasicDeductionUsed: 0, properties: [item("a1"), item("a2")] } as AggregateTransferInput,
      rates,
    );
    expect(agg.reductionAmount).toBeGreaterThan(0);
    expect(agg.ruralSurtax).toBe(0);
  });
});
