/**
 * anchor — 함께 양도(컴패니언) 자산의 이월과세 PHD/APD 환산 **명시 차단** (PR-0c · 계획서 §16, Q-17 B)
 *
 * ## 결함 (운영 파이프라인 실측 2026-10-23)
 * 컴패니언 주택 + 이월과세 + 환산 방식 phd/apd: ⑧은 통과(최초고시 칸을 요구하고 채우면 issues=[]), ④ 컴패니언 payload는
 * `preHousingDisclosure`도 플래그도 싣지 않고(⑫ 컴패니언 스키마에는 PHD 필드가 없다), 엔진은 증여자 취득가액을 0으로 계산해
 * 200 OK 로 돌려줬다(양도차익 514,285,714 — 양도가 전액). 입력은 받고 반영하지 않는 침묵 오답이다.
 * 일반(general) 환산 컴패니언은 `...cp.topLevelOverrides`(`transfer-tax-api-companion-payload.ts:623-631`)가 플래그·기준시가를 실어 정상이다(회귀 0 대조군).
 *
 * ## 정책
 * 컴패니언은 일반 기준시가 환산만 지원한다. 주 자산(첫 자산)의 PHD/APD는 현행 그대로(④가 `preHousingDisclosure`를 싣는다).
 * 일반건물이 `carryoverEstimationModeSupported`로 같은 패턴을 쓰는 선례.
 */
import { describe, it, expect } from "vitest";
import { carryoverEstimationModeSupported } from "@/lib/calc/phd-toggle-scope";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const CO = (over: Record<string, unknown> = {}) => ({
  giftRegistryDate: "2021-06-01", donorAcquisitionDate: "2000-01-01", donorAcquisitionCause: "purchase" as const,
  useEstimatedAcquisition: true, estimationMode: "general" as const,
  donorStandardPriceAtAcquisition: "111,111,111", donorStandardPriceAtTransfer: "222,222,222", donorAcquisitionPrice: "", partEstimated: false,
  giftTaxAmount: "0", giftTaxCalculated: "", giftTaxBase: "", donorCapitalExpenditure: "", giftDateValuation: "300,000,000",
  donorRelation: "spouse" as const, donorDeceased: false, spouseGiftOneHouseAtGiftDate: false, donorSameHousehold: "no" as const,
  donorHouseholdHoldingStartDate: "", donorPriorHouseholdResidenceMonths: "",
  donorBuilt: false, donorBuiltType: "", donorBuiltDate: "", donorBuiltExtensionArea: "", donorBuiltExtensionStdPrice: "",
  donorBuiltLandPricePerSqm: "", donorBuiltLandArea: "", donorBuiltBuildingStdAtAcq: "",
  exclusionDeclared: { expropriationWithin2Years: false, legacyOneHouseExemptionDeclared: false, isFamilyBusinessInheritedAsset: false },
  ...over,
});
const PHD_FIELDS = { phdFirstDisclosureDate: "2005-04-30", phdFirstDisclosureHousingPrice: "100,000,000", phdTransferHousingPrice: "400,000,000" };

const land = (f: TransferFormData) => ({
  ...f.assets[0], assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2010-01-01",
  fixedAcquisitionPrice: "500,000,000", standardPriceAtTransfer: "1,000,000,000",
});
const house = (n: number, carryover: object, extra: object = {}) => ({
  ...makeDefaultAsset(n), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "carryover_gift",
  acquisitionDate: "2021-06-01", standardPriceAtTransfer: "400,000,000", carryover, ...PHD_FIELDS, ...extra,
});

/** host=companion: [토지 주 자산, 주택 컴패니언] · host=primary: [주택 주 자산, 토지 컴패니언] */
function form(carryover: object, host: "companion" | "primary"): TransferFormData {
  const f = withTestAddress(createDefaultTransferFormData()) as unknown as Record<string, unknown> & { assets: unknown[] };
  f.transferDate = "2024-03-01"; f.contractTotalPrice = "1,800,000,000"; f.bundledSaleMode = "apportioned"; f.householdHousingCount = "2";
  const l = land(f as unknown as TransferFormData);
  const h = house(host === "companion" ? 2 : 1, carryover);
  f.assets = host === "companion" ? [l, h] : [h, { ...l, assetId: "land-companion-1" }];
  return f as unknown as TransferFormData;
}
const step0 = (f: TransferFormData) => collectStepIssues(0, f);

describe("PR-0c 술어 — carryoverEstimationModeSupported(kind, mode, { isNonPrimary })", () => {
  it("컴패니언은 general 만 · 주 자산은 종전대로 셋 다 · 미선택은 따지지 않는다", () => {
    for (const kind of ["housing", "building", "land"] as const) {
      expect(carryoverEstimationModeSupported(kind, "general", { isNonPrimary: true })).toBe(true);
      expect(carryoverEstimationModeSupported(kind, "phd", { isNonPrimary: true })).toBe(false);
      expect(carryoverEstimationModeSupported(kind, "apd", { isNonPrimary: true })).toBe(false);
      expect(carryoverEstimationModeSupported(kind, null, { isNonPrimary: true })).toBe(true);
      for (const m of ["general", "phd", "apd"] as const) {
        expect(carryoverEstimationModeSupported(kind, m)).toBe(true);
        expect(carryoverEstimationModeSupported(kind, m, { isNonPrimary: false })).toBe(true);
      }
    }
  });
});

describe("PR-0c ⑧ — 컴패니언 이월과세 PHD/APD 차단", () => {
  for (const mode of ["phd", "apd"] as const) {
    it(`컴패니언 ${mode}: ⑧이 막고 화면에 있는 칸(환산 방식 라디오)으로 보낸다`, () => {
      const issues = step0(form(CO({ estimationMode: mode, donorStandardPriceAtAcquisition: "", donorStandardPriceAtTransfer: "" }), "companion"));
      expect(issues.length).toBe(1);
      expect(issues[0].field).toBe("carryover.estimationMode");
      expect(issues[0].message).toContain("함께 양도");
      expect(issues[0].message).toContain("일반 기준시가 환산");
    });

    it(`[회귀 0] 주 자산 ${mode}: 현행 그대로 통과 (최초고시 칸이 채워져 있으면)`, () => {
      expect(step0(form(CO({ estimationMode: mode, donorStandardPriceAtAcquisition: "", donorStandardPriceAtTransfer: "" }), "primary"))).toEqual([]);
    });
  }

  it("[회귀 0] 컴패니언 general: 통과", () => {
    expect(step0(form(CO(), "companion"))).toEqual([]);
  });

  it("옛 입력 복원 — 컴패니언 phd 를 general 로 고르고 기준시가를 채우면 통과한다 (막다른 길 없음)", () => {
    const stale = step0(form(CO({ estimationMode: "phd", donorStandardPriceAtAcquisition: "", donorStandardPriceAtTransfer: "" }), "companion"));
    expect(stale.length).toBe(1);
    expect(step0(form(CO({ estimationMode: "general" }), "companion"))).toEqual([]);
  });
});
