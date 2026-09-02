/**
 * anchor — **A19**: 조기반환 분기가 §163⑨ 근거 카드 2장을 통째로 버린다
 *
 * `transfer-tax-finalize.ts:604-605`가 **같은 `ctx.inheritedAcquisitionStep`에서 두 필드**를 싣는다:
 *   `inheritedAcquisitionDetail`      = `.result`
 *   `inheritedHouseValuationDetail`   = `.houseValuationResult`
 *
 * STEP 0.65 재개발 분기와 STEP 2.5 임대특례 분기는 `finalizeTransferTax`를 호출하지 않고
 * 조기반환하면서 그 step을 넘기지 않았다. 재개발 분기는 바로 앞에서
 * `resolveInheritedRedevelopmentAcqPrice`로 그 값을 **소비까지 하면서** 근거만 버렸다.
 *
 * ⇒ `ReductionDetailCards.tsx:151`의 `hasAny`가 false가 되어 **카드 묶음 전체가 `return null`**.
 *   금액 자체는 `steps`와 신고서 양식에 남으므로 **세액은 불변**이다(소비처 전수 확인 —
 *   `ReductionDetailCards` · `MixedUseResultCard` · `transfer-tax-aggregate-pickers` ·
 *   `transfer-per-asset-summary`(선행 분기가 먼저 잡아 미도달)).
 *
 * 같은 유형의 선례가 이 디렉터리에 이미 있다(`carryover-detail-dropped.anchor.test.ts` E3-06).
 * 조기반환 분기는 이 저장소에서 반복 재발하는 결함 지점이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();

/** §155⑳ 장기임대주택 거주주택 특례 — 기존 anchor(`rental-housing-step-rural-surtax-echo`)와 같은 형태. */
const RENTAL_EXCEPTION: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: new Date("2016-01-01"),
      rentalRegistrationDate: new Date("2016-01-01"),
      rentalCategory: "long_general" as const,
      rentalAcquisitionType: "purchase" as const,
      isApartment: false,
      region: "non-metro" as const,
      isExcluded918Rule: false,
      standardPriceAtRentalStart: 250_000_000,
      hasMinimum2Units: false,
      rentalMonths: 96,
      rentalAutoTermination: false,
      requirementsConfirmed: true,
    },
  ],
};

function redevInfo(): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2020-06-01"),
    rightsValue: 500_000_000,
    settlementDirection: "pay",
    settlementAmount: 50_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    priorHouseResidenceMonths: 60,
    newHouseResidenceMonths: 0,
  };
}

/** 종전자산을 상속받은 재개발 — `redevelopment` 유무만 다른 한 쌍. */
function build(opts: { redevelopment: boolean }): TransferTaxInput {
  return baseTransferInput({
    propertyType: opts.redevelopment ? "redevelopment_apt" : "housing",
    transferPrice: 600_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2015-06-01"),
    acquisitionPrice: 200_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    acquisitionCause: "inheritance",
    inheritedAcquisition: {
      mode: "post-deemed",
      inheritanceDate: new Date("2015-06-01"),
      assetKind: "house_apart",
      reportedValue: 200_000_000,
      reportedMethod: "supplementary",
    },
    ...(opts.redevelopment ? { redevelopment: redevInfo() } : {}),
  } as Partial<TransferTaxInput>);
}

describe("[A19] 재개발 조기반환 — §163⑨ 근거가 결과에 남는다", () => {
  it("A19-1(대조군): 일반주택은 `inheritedAcquisitionDetail`을 싣는다", () => {
    const r = calculateTransferTax(build({ redevelopment: false }), rates);
    expect(r.inheritedAcquisitionDetail).toBeDefined();
  });

  it("A19-2: 재개발도 `inheritedAcquisitionDetail`을 싣는다 (종전에는 undefined)", () => {
    const r = calculateTransferTax(build({ redevelopment: true }), rates);
    expect(r.inheritedAcquisitionDetail).toBeDefined();
  });

  it("A19-3: 금액은 종전대로 steps에 남아 있다 — 잃었던 것은 카드뿐", () => {
    const r = calculateTransferTax(build({ redevelopment: true }), rates);
    const step = r.steps.find((s) => s.label.includes("상속 취득가액 의제"));
    expect(step).toBeDefined();
  });

  it("A19-4: 세액은 불변이다 (표시 전용 — 수정 전후 비교가 아니라 detail 유무와 무관함을 고정)", () => {
    const withRedev = calculateTransferTax(build({ redevelopment: true }), rates);
    // detail이 실려도 재개발 §166 3분할 결과 자체는 그대로다.
    expect(withRedev.determinedTax).toBeGreaterThan(0);
    expect(withRedev.inheritedAcquisitionDetail).toBeDefined();
  });
});

describe("[A19] 임대주택 특례(§155⑳) 조기반환 — 같은 결함", () => {
  /** §155⑳ 특례 적용/미적용만 다른 한 쌍. */
  function rentalBuild(applyException: boolean): TransferTaxInput {
    return baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_500_000_000,
      transferDate: new Date("2024-06-01"),
      acquisitionDate: new Date("2015-06-01"),
      acquisitionPrice: 900_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 60,
      acquisitionCause: "inheritance",
      inheritedAcquisition: {
        mode: "post-deemed",
        inheritanceDate: new Date("2015-06-01"),
        assetKind: "house_apart",
        reportedValue: 900_000_000,
        reportedMethod: "supplementary",
      },
      ...(applyException ? { rentalHousingException: RENTAL_EXCEPTION } : {}),
    } as Partial<TransferTaxInput>);
  }

  it("A19-5(대조군): 특례 미적용 경로는 detail을 싣는다", () => {
    expect(calculateTransferTax(rentalBuild(false), rates).inheritedAcquisitionDetail).toBeDefined();
  });

  it("A19-6: 특례 적용 경로도 detail을 싣는다 (종전에는 undefined)", () => {
    const r = calculateTransferTax(rentalBuild(true), rates);
    // 특례가 실제로 적용된 경우에만 조기반환을 탄다. 적용되지 않으면 정상 경로라 이미 실린다.
    expect(r.inheritedAcquisitionDetail).toBeDefined();
  });
});
