/**
 * 의제취득일(1985.1.1.) 전 증여 — ③ 입력 칸 (PR-5 · 계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §16).
 *
 * - 노출·전송 술어 `isGiftPreDeemedConversionAsset` — 칸이 없으면 값도 싣지 않는다(종전: 매매에서 남은 값이 보이지 않는 채 ③을 바꿨다).
 * - 자동값 단일 소스 `preDeemedSentStdPrices` — 칸이 자동값을 보여 주는 동안 store 값을 싣지 않는다(엔진은 보낸 분자를 자동값보다 우선한다).
 * - ⑧ — 증여는 ①(증여 신고가액)이 필수다(사용자 결정 Q-14). ①·② 없으면 ③ 칸이 아니라 ①을 요구한다.
 * - 엔진 — 직접 보낸 양도시 기준시가가 3시점의 양도 당시 개별주택가격보다 우선한다(직접 입력 토글).
 */
import { describe, it, expect } from "vitest";
import { isGiftPreDeemedConversionAsset } from "@/lib/calc/gift-pre-deemed";
import { preDeemedAutoStdPrices, preDeemedSentStdPrices } from "@/lib/calc/pre-deemed-auto-std-price";
import { needsClauseADeclaration } from "@/lib/calc/transfer-tax-validate-clause-a";
import { buildInheritedAcquisitionPayload } from "@/lib/calc/transfer-tax-api-inheritance";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const gift = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "gift",
    acquisitionDate: "1980-03-01",
    donorAcquisitionDate: "1975-01-01",
    fixedAcquisitionPrice: "100000000",
    acquisitionArea: "184.2",
    standardPriceAtAcq: "202620000",
    standardPriceAtTransfer: "1243350000",
    ...over,
  }) as AssetForm;

/** §164④ 등급 5칸(1985 전 토지) — 자동값의 원천 */
const LAND_GRADES = {
  pre1990Enabled: true,
  pre1990GradeMode: "number" as const,
  pre1990Grade_atAcq: "200",
  pre1990Grade_current: "218",
  pre1990Grade_prev: "218",
  pre1990PricePerSqm_1990: "1100000",
};

/** §164⑦ 3시점(1985 전 단독주택) — 분자 자동값 floor(300,000,000 × 60,000,000 ÷ 120,000,000) = 150,000,000 · 분모 자동값 400,000,000 */
const HOUSE_3PT = {
  assetKind: "housing" as const,
  inheritanceAssetKind: "house_individual" as const,
  inhHouseValEnabled: true,
  inhHouseValLandArea: "100",
  inhHouseValLandPricePerSqmAtInheritance: "500000",
  inhHouseValBuildingStdPriceAtInheritance: "10000000",
  inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValBuildingStdPriceAtFirst: "20000000",
  inhHouseValHousePriceAtFirst: "300000000",
  inhHouseValHousePriceAtTransfer: "400000000",
  inhHouseValLandPricePerSqmAtTransfer: "2000000",
};

describe("G-1 노출·전송 술어", () => {
  it("1985 전 증여 토지·주택·상가·건물 → 참", () => {
    for (const assetKind of ["land", "housing", "commercial_building", "building"] as const)
      expect(isGiftPreDeemedConversionAsset(gift({ assetKind })), assetKind).toBe(true);
  });
  it("1984-12-31 참 · 1985-01-01 거짓 · 상속·매매 거짓", () => {
    expect(isGiftPreDeemedConversionAsset(gift({ acquisitionDate: "1984-12-31" }))).toBe(true);
    expect(isGiftPreDeemedConversionAsset(gift({ acquisitionDate: "1985-01-01" }))).toBe(false);
    expect(isGiftPreDeemedConversionAsset(gift({ acquisitionCause: "inheritance" }))).toBe(false);
    expect(isGiftPreDeemedConversionAsset(gift({ acquisitionCause: "purchase" }))).toBe(false);
  });
  it("부담부증여(PR-7) · 일반건물·재개발·입주권·겸용·분양권 → 거짓", () => {
    expect(isGiftPreDeemedConversionAsset(gift({ transferType: "burdened_gift" }))).toBe(false);
    for (const assetKind of ["general_building", "redevelopment_apt", "right_to_move_in", "presale_right"] as const)
      expect(isGiftPreDeemedConversionAsset(gift({ assetKind })), assetKind).toBe(false);
    expect(isGiftPreDeemedConversionAsset(gift({ assetKind: "housing", isMixedUseHouse: true }))).toBe(false);
  });
});

describe("G-2 ④ — 칸이 있을 때만 · 자동값이 보이는 동안은 store 값을 싣지 않는다", () => {
  const ia = (a: AssetForm) =>
    buildInheritedAcquisitionPayload(a, 1, false).inheritedAcquisition as Record<string, unknown>;

  it("증여 토지(자동값 없음) — ③ 칸 값을 싣는다", () => {
    expect(ia(gift())).toMatchObject({ mode: "pre-deemed", reportedValue: 100_000_000, standardPriceAtDeemedDate: 202_620_000, standardPriceAtTransfer: 1_243_350_000 });
  });

  it("🔴 칸이 없는 증여(부담부증여 제외 범위 밖 · 분양권)에는 남은 값을 싣지 않는다", () => {
    const p = ia(gift({ assetKind: "presale_right" }));
    expect(p.standardPriceAtDeemedDate).toBeUndefined();
    expect(p.standardPriceAtTransfer).toBeUndefined();
  });

  it("🔴 토지 등급 자동값이 보이면 남은 분자를 싣지 않는다 — 엔진이 같은 자동값(②)을 주입한다", () => {
    expect(preDeemedSentStdPrices(gift(LAND_GRADES), "1980-03-01").atDeemed).toBe(0);
    expect(ia(gift(LAND_GRADES)).standardPriceAtDeemedDate).toBeUndefined();
  });

  it("직접 입력 토글이 켜지면 store 분자를 싣는다", () => {
    expect(ia(gift({ ...LAND_GRADES, useStandardPriceAtAcqOverride: true })).standardPriceAtDeemedDate).toBe(202_620_000);
  });

  it("🔴 주택 3시점 — 분자·분모 모두 자동값이 보이면 싣지 않고, 분모 직접 입력이면 분모만 싣는다", () => {
    const h = gift({ ...HOUSE_3PT, standardPriceAtAcq: "999", standardPriceAtTransfer: "300000000" });
    expect(preDeemedSentStdPrices(h, "1980-03-01")).toEqual({ atDeemed: 0, atTransfer: 0 });
    expect(preDeemedSentStdPrices({ ...h, useStandardPriceAtTransferOverride: true }, "1980-03-01")).toEqual({ atDeemed: 0, atTransfer: 300_000_000 });
  });

  it("상속도 같은 규칙이다 — 남은 분자가 자동값을 이기지 않는다", () => {
    const inh = { ...gift({ ...HOUSE_3PT, standardPriceAtAcq: "999" }), acquisitionCause: "inheritance" as const, inheritanceStartDate: "1980-03-01" };
    expect(ia(inh).standardPriceAtDeemedDate).toBeUndefined();
  });
});

describe("G-3 ⑧ — 증여는 ①이 필수(Q-14)", () => {
  const V = (a: AssetForm) => validateAssetAcquisition(a, "자산 1");

  it("①·② 비움 → ③ 칸이 아니라 증여 신고가액을 요구한다", () => {
    const err = V(gift({ fixedAcquisitionPrice: "", standardPriceAtAcq: "", standardPriceAtTransfer: "" }));
    expect(err).toMatch(/증여 신고가액을 입력하세요/);
    expect(err).not.toMatch(/의제취득일 현재 기준시가/);
  });

  it("① + ③ 칸 → 통과", () => {
    expect(V(gift())).toBeNull();
  });

  it("「확인 불가」 선언으로 ①을 건너뛸 수 없다", () => {
    expect(V(gift({ fixedAcquisitionPrice: "", preDeemedClauseAUnconfirmed: true }))).toMatch(/증여 신고가액을 입력하세요/);
  });

  it("🔴 범위 밖 증여(재개발)는 종전 E-1 그대로 — 환산 모드 + ①② 없음이면 선언을 요구한다(PR-5 리뷰 F2)", () => {
    const empty = { fixedAcquisitionPrice: "", standardPriceAtAcq: "", standardPriceAtTransfer: "" };
    expect(needsClauseADeclaration(gift({ ...empty, assetKind: "redevelopment_apt", useEstimatedAcquisition: true }))).toBe(true);
    expect(needsClauseADeclaration(gift({ ...empty, assetKind: "redevelopment_apt" }))).toBe(false);
    // 범위 안 증여는 추계 플래그가 남아도 선언 대신 ①을 요구한다
    expect(needsClauseADeclaration(gift({ ...empty, useEstimatedAcquisition: true }))).toBe(false);
  });
});

describe("G-5 일부양도 — 화면 자동 분자는 ④와 같은 양도분 면적이다(PR-5 리뷰 F1)", () => {
  it("취득 368.4㎡ · 양도 184.2㎡ partial → 184.2㎡ 단독 취득과 같은 자동값(취득면적이면 2배)", () => {
    const at = (over: Partial<AssetForm>) => preDeemedAutoStdPrices(gift({ ...LAND_GRADES, ...over }), "1980-03-01", false, "2023-02-16").atDeemed;
    const partial = at({ areaScenario: "partial", acquisitionArea: "368.4", transferArea: "184.2" });
    expect(partial).toBe(at({ acquisitionArea: "184.2", transferArea: "184.2" }));
    expect(partial).not.toBe(at({ acquisitionArea: "368.4", transferArea: "368.4" }));
  });
});

describe("G-4 엔진 — 직접 보낸 양도시 기준시가가 3시점 분모보다 우선", () => {
  const houseVal = {
    inheritanceDate: new Date("1980-07-01"),
    transferDate: new Date("2024-01-01"),
    landArea: 100,
    landPricePerSqmAtTransfer: 2_000_000,
    landPricePerSqmAtFirstDisclosure: 1_000_000,
    landPricePerSqmAtInheritance: 500_000,
    housePriceAtTransfer: 400_000_000,
    housePriceAtFirstDisclosure: 300_000_000,
    buildingStdPriceAtFirstDisclosure: 20_000_000,
    buildingStdPriceAtInheritance: 10_000_000,
  };
  const run = (standardPriceAtTransfer?: number) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 500_000_000,
        transferDate: new Date("2024-01-01"),
        acquisitionDate: new Date("1980-07-01"),
        acquisitionPrice: 0,
        useEstimatedAcquisition: false,
        isOneHousehold: false,
        householdHousingCount: 1,
        inheritedHouseValuation: houseVal,
        inheritedAcquisition: {
          inheritanceDate: new Date("1980-07-01"),
          assetKind: "house_individual",
          reportedValue: 100_000_000,
          transferDate: new Date("2024-01-01"),
          transferPrice: 500_000_000,
          ...(standardPriceAtTransfer ? { standardPriceAtTransfer } : {}),
        },
      }),
      makeMockRates(),
    );

  it("분모 미전송 → 양도 당시 개별주택가격: ③ = 5억 × 150,000,000 ÷ 400,000,000 = 187,500,000", () => {
    expect(run().inheritedAcquisitionDetail!.preDeemedBreakdown).toMatchObject({ convertedAmount: 187_500_000, selectedMethod: "converted" });
  });

  it("🔴 분모 3억 직접 전송 → ③ = 5억 × 150,000,000 ÷ 300,000,000 = 250,000,000 (종전: 직접 입력을 덮어 187,500,000)", () => {
    expect(run(300_000_000).inheritedAcquisitionDetail!.preDeemedBreakdown).toMatchObject({ convertedAmount: 250_000_000, selectedMethod: "converted" });
  });
});
