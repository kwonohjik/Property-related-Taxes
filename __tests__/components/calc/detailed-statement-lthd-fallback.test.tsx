/**
 * 상세명세서 2단계 — 장기보유특별공제 보유/거주 기간분 fallback 산식 회귀
 *
 * 버그: 엔진 sub-step 미emit(표1·겸용 합산 등) 시 fallback 산식이
 *   (1) 실제 값 없이 변수명만("보유연수 × 4%"), (2) 표1 케이스에도 "표2 비율 안분" 문구로 표시(모순),
 *   (3) 겸용 어댑터 longTermHoldingRate=0 → 상단 "과세대상 양도차익 × 0%".
 * 수정: fallback 산식에 실제 값 인라인 + 표1/표2 분기, 겸용 어댑터 blended rate 산정.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { makeMockRates } from "../../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

function makeResult(overrides: Partial<TransferTaxResult> = {}): TransferTaxResult {
  return {
    isExempt: false,
    transferGain: 1_000_000_000,
    taxableGain: 1_000_000_000,
    usedEstimatedAcquisition: false,
    longTermHoldingDeduction: 160_000_000,
    longTermHoldingRate: 0.16,
    basicDeduction: 2_500_000,
    taxBase: 837_500_000,
    appliedRate: 0.42,
    progressiveDeduction: 35_940_000,
    calculatedTax: 315_810_000,
    isSurchargeSuspended: false,
    reductionAmount: 0,
    determinedTax: 315_810_000,
    penaltyTax: 0,
    penaltyBase: 0,
    localIncomeTax: 31_581_000,
    totalTax: 347_391_000,
    steps: [{ label: "양도차익 계산", formula: "x", amount: 1_000_000_000, legalBasis: "§95①" }],
    ...overrides,
  } as TransferTaxResult;
}

function makeAsset(o: Partial<AssetForm> = {}): AssetForm {
  return {
    assetId: "primary",
    assetKind: "general_building",
    acquisitionDate: "2010-01-01",
    residenceInputMode: "months",
    residencePeriods: [],
    residencePeriodMonthsAsset: "",
    ...o,
  } as AssetForm;
}

function makeForm(asset: AssetForm): TransferFormData {
  return { transferDate: "2026-01-01", contractTotalPrice: "1000000000", assets: [asset] } as unknown as TransferFormData;
}

const items = (r: TransferTaxResult, a: AssetForm) =>
  buildStatementItems(r, makeForm(a), a, undefined, undefined);

describe("장특공제 보유/거주 기간분 fallback 산식 (값 인라인 + 표1/표2 분기)", () => {
  it("표1(거주 미입력): 보유분 = 총액 전액·값 인라인·표1 문구, 거주분 = 0·표1 문구", () => {
    const r = makeResult(); // longTermHoldingDeduction 160,000,000
    const it0 = items(r, makeAsset({ residencePeriodMonthsAsset: "0" }));
    const hold = it0.get("ltHoldingPart")!;
    const res = it0.get("ltResidencePart")!;
    // 값 인라인 — 실제 금액 노출
    expect(hold.formula).toContain("160,000,000");
    // 표1 문구(모순 제거) — "표2 비율 안분" 아님
    expect(hold.formula).toContain("표1");
    expect(hold.formula).not.toContain("표2 비율 안분");
    // 「원」 접미사는 표기 규약 위반이라 제거됐다(결과탭 코드리뷰 Lane 0 #065).
    // `toContain("0")`은 다른 금액의 0에도 걸려 구별력이 없으므로 **선두 0**을 본다.
    expect(res.formula).toMatch(/^0\s/);
    expect(res.formula).not.toContain("원");
    expect(res.formula).toContain("표1");
  });

  it("표2(거주 ≥ 24개월): 거주분 직접 산정 산식·거주율 %·값 인라인, 보유분 = 총액 − 거주분", () => {
    const r = makeResult();
    const it0 = items(r, makeAsset({ residencePeriodMonthsAsset: "60" })); // 5년 거주 → 표2
    const hold = it0.get("ltHoldingPart")!;
    const res = it0.get("ltResidencePart")!;
    expect(res.formula).toContain("거주율");
    expect(res.formula).toContain("표2");
    expect(res.formula).not.toContain("거주연수 × 4%"); // 변수명 아님 — 실제 % 노출
    expect(hold.formula).toContain("거주 기간분"); // 보유분 = 총액 − 거주분
    // 합 불변식: 보유분 값 + 거주분 값 = 총 장특공제
    expect((hold.value as number) + (res.value as number)).toBe(160_000_000);
  });

  it("겸용 어댑터: longTermHoldingRate가 0이 아닌 실효 blended rate로 설정(상단 × 0% 버그 정정)", () => {
    const asset: MixedUseAssetInput = {
      isMixedUseHouse: true,
      residentialFloorArea: 100,
      nonResidentialFloorArea: 100,
      buildingFootprintArea: 100,
      totalLandArea: 200,
      landAcquisitionDate: new Date("2017-09-15"),
      buildingAcquisitionDate: new Date("2017-09-15"),
      transferStandardPrice: { housingPrice: 800_000_000, commercialBuildingPrice: 500_000_000, landPricePerSqm: 3_000_000 },
      acquisitionStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 300_000_000, landPricePerSqm: 2_000_000 },
      residencePeriodYears: 0,
      isMetropolitanArea: true,
      zoneType: "residential",
      isOneHouseExempt: true,
      acquisitionByInheritance: true,
    };
    const breakdown = calcMixedUseTransferTax(3_300_000_000, new Date("2026-02-16"), asset, makeMockRates());
    const filing = mixedUseToFilingResult(breakdown);
    expect(filing.longTermHoldingRate).toBeGreaterThan(0);
    // 실효율 = 장특공제 합계 ÷ 과세대상 양도차익 합계
    const expected =
      filing.longTermHoldingDeduction /
      (breakdown.housingPart.proratedTaxableGain + breakdown.commercialPart.transferGain);
    expect(filing.longTermHoldingRate).toBeCloseTo(expected, 6);
  });
});

describe("겸용 상세명세서 2단계 — 장특공제 주택분/비주택분 분리 표시", () => {
  function mixedAsset(o: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
    return {
      isMixedUseHouse: true,
      residentialFloorArea: 100,
      nonResidentialFloorArea: 100,
      buildingFootprintArea: 100,
      totalLandArea: 200,
      landAcquisitionDate: new Date("2017-09-15"),
      buildingAcquisitionDate: new Date("2017-09-15"),
      transferStandardPrice: { housingPrice: 800_000_000, commercialBuildingPrice: 500_000_000, landPricePerSqm: 3_000_000 },
      acquisitionStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 300_000_000, landPricePerSqm: 2_000_000 },
      residencePeriodYears: 0,
      isMetropolitanArea: true,
      zoneType: "residential",
      isOneHouseExempt: true,
      acquisitionByInheritance: true,
      ...o,
    };
  }
  const mixedItems = (asset: MixedUseAssetInput) => {
    const breakdown = calcMixedUseTransferTax(3_300_000_000, new Date("2026-02-16"), asset, makeMockRates());
    const result = mixedUseToFilingResult(breakdown);
    const a = makeAsset({ assetKind: "housing", acquisitionDate: "2017-09-15" });
    return { items: items(result, a), b: breakdown };
  };

  it("표1(거주 0): 주택분/상가분 분리 항목 존재·합산 항목 미노출, 값·표기 정확", () => {
    const { items: it0, b } = mixedItems(mixedAsset());
    // 합산 전용 항목(ltHoldingPart/ltResidencePart)은 겸용에서 미설정
    expect(it0.has("ltHoldingPart")).toBe(false);
    expect(it0.has("ltResidencePart")).toBe(false);
    // 주택분/상가분 분리 항목 존재
    const hp = it0.get("ltHousingPart")!;
    const cp = it0.get("ltCommercialPart")!;
    expect(hp.value).toBe(b.housingPart.longTermDeductionAmount);
    expect(cp.value).toBe(b.commercialPart.longTermDeductionAmount);
    expect(hp.formula).toContain("표1");
    expect(it0.get("ltHousingResidence")!.value).toBe(0);
    expect(it0.get("ltHousingResidence")!.formula).toContain("표1");
    // 합계 = 주택분 + 상가분
    expect(it0.get("ltDeduction")!.value).toBe(
      b.housingPart.longTermDeductionAmount + b.commercialPart.longTermDeductionAmount,
    );
  });

  it("표2(거주 5년): 주택 보유/거주 분리·합 불변식, 상가분 표1", () => {
    const { items: it0, b } = mixedItems(
      mixedAsset({ residencePeriodYears: 5, table2ResidencePeriodYears: 5 } as Partial<MixedUseAssetInput>),
    );
    const h = b.housingPart;
    expect(h.longTermDeductionTable).toBe(2);
    const hold = it0.get("ltHousingHolding")!;
    const res = it0.get("ltHousingResidence")!;
    expect(hold.value).toBe(h.holdingDeductionAmount);
    expect(res.value).toBe(h.residenceDeductionAmount);
    // 합 불변식: 보유분 + 거주분 = 주택분 총액
    expect((hold.value as number) + (res.value as number)).toBe(h.longTermDeductionAmount);
    expect(res.formula).toContain("거주");
    expect(res.formula).not.toContain("표1");
    // 상가분은 표1
    expect(it0.get("ltCommercialPart")!.formula).toContain("표1");
  });

  it("stale/이력 결과(echo 부재): 자산 기준 연수·율·보유/거주 재구성 — 0년 표시 버그 방지", () => {
    // echo 이전 엔진이 저장한 결과 시뮬레이션 — housingPart/commercialPart의 echo 필드 제거.
    const b = calcMixedUseTransferTax(
      3_300_000_000,
      new Date("2026-02-16"),
      mixedAsset({ residencePeriodYears: 5, table2ResidencePeriodYears: 5 } as Partial<MixedUseAssetInput>),
      makeMockRates(),
    );
    const stale = JSON.parse(JSON.stringify(b));
    for (const k of ["holdingYears", "residenceYears", "holdingDeductionRate", "residenceDeductionRate", "holdingDeductionAmount", "residenceDeductionAmount"]) {
      delete stale.housingPart[k];
    }
    delete stale.commercialPart.holdingYears;
    const result = mixedUseToFilingResult(stale);
    // 자산 폼에 취득일·거주개월이 있으면(이력 복원 포함) 재구성 가능
    const a = makeAsset({ assetKind: "housing", acquisitionDate: "2017-09-15", residencePeriodMonthsAsset: "60" });
    const it0 = items(result, a);
    // 0년이 아니라 실제 보유/거주 연수가 표기됨
    expect(it0.get("ltHousingPart")!.formula).toMatch(/보유 [1-9]/);
    expect(it0.get("ltHousingPart")!.formula).not.toContain("보유 0년");
    expect(it0.get("ltCommercialPart")!.formula).not.toContain("보유 0년");
    // 표2면 거주 기간분도 재구성되어 0이 아님
    if (stale.housingPart.longTermDeductionTable === 2) {
      expect((it0.get("ltHousingResidence")!.value as number)).toBeGreaterThan(0);
    }
  });
});
