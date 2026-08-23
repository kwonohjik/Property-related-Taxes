/**
 * anchor: §155⑳ 특례 경로의 조특법 감면 — **세액감면형은 계산하고, 차감형은 고지한다** (F08)
 *
 * ## 종전 상태
 *
 * 특례 경로는 `finalizeTransferTax`를 거치지 않아 `calcReductions`가 **아예 호출되지 않았고**,
 * 사용자가 고른 감면이 한 줄의 안내도 없이 0이 됐다(실측: §77 공익수용이 특례를 끄면
 * **80,660,250**이 잡히고 켜면 0). UI에도 게이트가 없어 조합은 도달 가능하다.
 *
 * ## 왜 병용이 가능한가
 *
 * 「조세특례제한법」 §127(중복지원의 배제) ⑦은 「둘 이상의 **감면규정**이 동시 적용되면 하나를
 * 선택」이라고 정할 뿐, **§155⑳ 비과세 특례와 감면의 병용을 배제하는 규정은 없다**.
 * 비과세분은 애초에 과세대상이 아니고, **과세되는 부분**(고가주택 초과분·배율 초과 부수토지분)에
 * 감면을 적용하는 구조는 일반 경로와 다르지 않다.
 *
 * ## 두 축을 가른다
 *
 * | 축 | 처리 | 이유 |
 * |---|---|---|
 * | **세액감면형** (§69·§77·§77의2·§97 시리즈…) | **계산** | 산출세액 − 감면세액 구조라 이 경로에 그대로 성립 |
 * | **차감형·하이브리드** (`ALL_INCOME_DEDUCTION_IDS` 11종) | **고지만** | **양도소득금액을 차감**하는데 「소득세법 시행령」 §161 안분의 앞/뒤 어디에 얹을지 **명문이 없다** |
 *
 * ## 실측 (mock 세율 · 아래 픽스처)
 *
 * | | 산출세액 | 감면 | 결정세액 |
 * |---|---|---|---|
 * | 감면 없음 | 116,420,000 | 0 | 116,420,000 |
 * | §77 공익수용 | 116,420,000 | **17,463,000** | **98,957,000** |
 * | §98의3(차감형) | 116,420,000 | 0 (고지 1건) | 116,420,000 |
 *
 * ⚠️ **농특세는 붙이지 않는다** — 일반 경로도 §77 감면에 농특세를 계산하지 않는다(실측:
 *    `ruralSurtax` 필드 자체가 undefined · 관련 step 0건). 「농어촌특별세법 시행령」 §4①1호가
 *    §77의 농특세 비과세를 **「직접 경작한 토지」로 한정**하므로 주택에는 붙어야 하지만,
 *    그것은 **두 경로 공통의 별건**이다. 여기서만 고치면 같은 감면이 경로에 따라 달라진다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const rentalUnit = {
  businessRegistrationDate: D("2015-06-01"),
  rentalRegistrationDate: D("2015-06-01"),
  rentalCategory: "long_general" as const,
  rentalAcquisitionType: "purchase" as const,
  isApartment: false,
  region: "non-metro" as const,
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 250_000_000,
  hasMinimum2Units: false,
  rentalMonths: 120,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
};

const rheA = { applyException: true, scenario: "A" as const, rentalUnits: [rentalUnit] };

/** 세액감면형 — 조특법 §77 공익수용(현금보상) */
const EXPROPRIATION = [
  {
    type: "public_expropriation" as const,
    cashCompensation: 2_000_000_000,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: D("2024-01-01"),
  },
];
/** 차감형·하이브리드 대표 — 조특법 §98의3 */
const DEFERRED = [{ type: "unsold_98_3" as const, region: "metropolitan" as const }];

function fixture(o: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    acquisitionDate: D("2018-01-01"),
    transferDate: D("2026-03-01"),
    residencePeriodMonths: 36,
    isOneHousehold: true,
    householdHousingCount: 1,
    expenses: 0,
    annualBasicDeductionUsed: 0,
    // 고가주택이라 과세분이 남는다 — 전액 비과세면 감면 자체를 관측할 수 없다
    transferPrice: 2_000_000_000,
    acquisitionPrice: 400_000_000,
    ...o,
  } as Partial<TransferTaxInput>);
}

const DEFERRED_NOTICE = /차감형\)은 이 계산에 반영되지 않았습니다/;

describe("F08 · §155⑳ × 조특법 감면", () => {
  it("F08-01: 🔴 세액감면형(§77)은 **실제로 계산된다**", () => {
    const r = calculateTransferTax(
      fixture({ rentalHousingException: rheA, reductions: EXPROPRIATION }),
      rates,
    );
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.reductionTypeApplied).toBe("public_expropriation");
    expect(r.reductionAmount).toBe(17_463_000);
    expect(r.determinedTax).toBe(98_957_000); // 종전 116,420,000
    // 세액감면형은 반영됐으므로 「미반영」 경고를 띄우지 않는다
    expect(r.warnings ?? []).toHaveLength(0);
    expect(r.steps.some((s) => s.label === "감면세액")).toBe(true);
  });

  it("F08-02: 차감형(§98의3)은 계산하지 않고 **고지**한다", () => {
    const r = calculateTransferTax(
      fixture({ rentalHousingException: rheA, reductions: DEFERRED }),
      rates,
    );
    expect(r.reductionAmount ?? 0).toBe(0);
    expect(r.determinedTax).toBe(116_420_000);
    expect((r.warnings ?? [])[0]).toMatch(DEFERRED_NOTICE);
    // 「왜 안 되는지」가 §161 안분 문제임을 남긴다 — 「전부 안 된다」로 읽히면 오해다
    expect((r.warnings ?? [])[0]).toMatch(/§161/);
  });

  it("F08-03: 두 축이 섞이면 세액감면형은 반영하고 차감형만 고지한다", () => {
    const r = calculateTransferTax(
      fixture({ rentalHousingException: rheA, reductions: [...EXPROPRIATION, ...DEFERRED] }),
      rates,
    );
    expect(r.reductionAmount).toBe(17_463_000);
    expect(r.warnings ?? []).toHaveLength(1);
    expect((r.warnings ?? [])[0]).toMatch(DEFERRED_NOTICE);
  });

  it("F08-04: 감면을 고르지 않았으면 아무 말도 하지 않는다 (노이즈 금지)", () => {
    const r = calculateTransferTax(fixture({ rentalHousingException: rheA }), rates);
    expect(r.warnings ?? []).toHaveLength(0);
    expect(r.determinedTax).toBe(116_420_000);
    expect(r.steps.some((s) => s.label.includes("감면"))).toBe(false);
  });

  it("F08-05: 🔴 **다건에서도 살아남는다** — 종전엔 0을 반환해 집계에서 조용히 사라졌다", () => {
    const base = fixture({
      rentalHousingException: rheA,
      reductions: EXPROPRIATION,
    }) as unknown as TransferTaxItemInput;
    const input: AggregateTransferInput = {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        { ...base, propertyId: "rhe", propertyLabel: "rhe" },
        {
          ...(baseTransferInput({
            propertyType: "land",
            acquisitionDate: D("2012-03-01"),
            transferDate: D("2026-03-01"),
            transferPrice: 600_000_000,
            acquisitionPrice: 400_000_000,
            isOneHousehold: false,
            householdHousingCount: 0,
          }) as unknown as TransferTaxItemInput),
          propertyId: "land",
          propertyLabel: "land",
        },
      ],
    } as AggregateTransferInput;

    const agg = calculateTransferTaxAggregate(input, rates);
    const rhe = agg.properties.find((p) => p.propertyId === "rhe")!;
    // 자산이 노출한 감면 유형·감면대상 소득이 집계 M-8까지 도달한다
    expect(rhe.reductionType).toBe("public_expropriation");
    expect(rhe.reducibleIncome).toBeGreaterThan(0);
    expect(agg.reductionAmount).toBeGreaterThan(0);
  });
});
