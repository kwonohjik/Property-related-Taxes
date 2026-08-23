/**
 * anchor F18 — 겸용주택 §97②2호 **단서**가 PHD(§164⑦ 미공시 환산) 경로에도 미친다.
 *
 * ── 결함 ─────────────────────────────────────────────────────────────────
 * 오케스트레이터(`transfer-tax-mixed-use.ts` STEP 7.5)는 단서 발동 시
 * `calcHousingGainSplit`·`calcCommercialGainSplit`을 `swapToDirect=true`로 재호출하는데,
 * ① `calcHousingGainSplit`의 **PHD 분기는 `swapToDirect`를 한 번도 읽지 않고 조기 return** 했고,
 * ② 공통 실비 안분기(`apportionAcquisitionPrice`)가 `acquisitionStandardPrice.housingPrice`를
 *    분자로 쓰는데 PHD 모드에서는 그 필드가 **구조적으로 부재**(UI가 칸을 숨긴다)라
 *    `housingRatio`가 0이 되어 **나목 전액이 상가분에 배분**됐다.
 * ③ Case A **4부분 어댑터** 2개도 `swapToDirect`를 읽지 않아 단서가 통째로 무효였다.
 *
 * 결과적으로 필요경비 총합이 가목도 나목도 아닌 **하이브리드**가 됐다.
 *
 * ── 고정 계약 ────────────────────────────────────────────────────────────
 *   P7-1. PHD + 나목 채택 → 주택분·상가분 **양쪽** 취득가액 슬롯 0
 *   P7-2. 필요경비 합계 == 나목 **정확히**(주택분 + 상가분 = 자본적지출 + 양도비)
 *   P7-3. 자본적지출(취득시 축)·양도비(양도시 축) 어느 쪽이든 성립
 *   P7-4. Case A 4부분에서도 성립 — 실비 미입력 기준선은 불변
 *   P7-5. PHD + 상속·증여는 §163⑨ 의제라 여전히 단서 대상이 아니다
 *
 * ── 실측(엔진 직접 호출) ──────────────────────────────────────────────────
 * 겸용 15억 · 양도 2024-03-01 · 취득 1998-03-01 · 주거 60/비주거 40㎡ · 다주택 · PHD
 *   자본적지출 9억: 수정 전 주택분이 본문 그대로(취득가 413,135,590 + 개산공제 3,966,100)
 *                  남고 상가분만 9억 → totalPayable **130,648,678**
 *                  수정 후 주택분 588,432,521 · 상가분 311,567,479(합 9억) → **155,166,000**
 *   양도비 9억:    수정 전 상가분 337,500,000만 반영(주택분 562,500,000 **증발**) → 200,372,813
 *                  수정 후 562,500,000 + 337,500,000 = 9억 → **162,866,000**
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const rates = makeMockRates();
const TRANSFER_DATE = new Date("2024-03-01");
const TRANSFER_PRICE = 1_500_000_000;
const NAMOK = 900_000_000;

function makePhdAsset(over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 60,
    nonResidentialFloorArea: 40,
    buildingFootprintArea: 50,
    totalLandArea: 100,
    landAcquisitionDate: new Date("1998-03-01"),
    buildingAcquisitionDate: new Date("1998-03-01"),
    transferStandardPrice: {
      housingPrice: 300_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 2_000_000,
    },
    // 🔑 취득시 개별주택가격이 **없다**(미공시) — 이것이 PHD의 존재 이유이자 F18의 원인이다.
    acquisitionStandardPrice: {
      commercialBuildingPrice: 30_000_000,
      landPricePerSqm: 1_000_000,
    },
    residencePeriodYears: 10,
    zoneType: "general_residential",
    isOneHouseExempt: false,
    usePreHousingDisclosure: true,
    preHousingDisclosure: {
      firstDisclosureDate: new Date("2005-04-30"),
      firstDisclosureHousingPrice: 200_000_000,
      landPricePerSqmAtAcquisition: 800_000,
      buildingStdPriceAtAcquisition: 30_000_000,
      landPricePerSqmAtFirstDisclosure: 1_300_000,
      buildingStdPriceAtFirstDisclosure: 40_000_000,
      transferHousingPrice: 300_000_000,
      landPricePerSqmAtTransfer: 2_000_000,
      buildingStdPriceAtTransfer: 60_000_000,
    },
    ...over,
  } as MixedUseAssetInput;
}

function snap(r: ReturnType<typeof calcMixedUseTransferTax>) {
  const h = r.housingPart;
  const c = r.commercialPart;
  return {
    proviso: r.necessaryExpenseProviso,
    hAcq: h.landAcqPrice + h.buildingAcqPrice,
    hDed: h.landAppraisalDed + h.buildingAppraisalDed,
    cAcq: c.landAcqPrice + c.buildingAcqPrice,
    cDed: c.landAppraisalDed + c.buildingAppraisalDed,
    totalPayable: r.total.totalPayable,
  };
}

const runPhd = (over: Partial<MixedUseAssetInput> = {}) =>
  snap(calcMixedUseTransferTax(TRANSFER_PRICE, TRANSFER_DATE, makePhdAsset(over), rates));

describe("F18 — PHD(§164⑦ 미공시) × §97②2호 단서", () => {
  it("실비 미입력 기준선 — 본문(환산취득가 + 개산공제) 그대로", () => {
    const r = runPhd();
    expect(r.proviso).toBeUndefined();
    expect(r.hAcq).toBe(413_135_590);
    expect(r.hDed).toBe(3_966_100);
    expect(r.cAcq).toBe(218_750_000);
    expect(r.cDed).toBe(2_100_000);
    expect(r.totalPayable).toBe(238_097_423);
  });

  it("🔴 P7-1·P7-2 자본적지출 9억 — 주택분도 취득가액 슬롯 0 · 필요경비 합 = 나목", () => {
    const r = runPhd({ capitalExpenditure: NAMOK });
    expect(r.proviso).toEqual({
      estimatedSide: 637_951_690,
      directSide: NAMOK,
      chosen: "direct",
    });
    expect(r.hAcq).toBe(0); // 수정 전 413,135,590 (본문 잔존)
    expect(r.cAcq).toBe(0);
    expect(r.hDed).toBe(588_432_521); // 수정 전 3,966,100 (개산공제 잔존)
    expect(r.cDed).toBe(311_567_479); // 수정 전 900,000,000 (전액 흡수)
    expect(r.hDed + r.cDed).toBe(NAMOK); // 불변식
    expect(r.totalPayable).toBe(155_166_000); // 수정 전 130,648,678
  });

  it("🔴 P7-3 양도비 9억(양도시 축) — 주택분 몫이 증발하지 않는다", () => {
    const r = runPhd({ transferExpense: NAMOK });
    expect(r.proviso?.chosen).toBe("direct");
    expect(r.hAcq).toBe(0);
    expect(r.cAcq).toBe(0);
    expect(r.hDed).toBe(562_500_000); // 수정 전 0
    expect(r.cDed).toBe(337_500_000);
    expect(r.hDed + r.cDed).toBe(NAMOK); // 수정 전 337,500,000 뿐(562,500,000 소실)
    expect(r.totalPayable).toBe(162_866_000); // 수정 전 200,372,813 (과다과세)
  });

  it("P7-5 PHD + 상속은 §163⑨ 의제라 단서 대상이 아니다(회귀 가드)", () => {
    const r = runPhd({
      acquisitionByInheritance: true,
      housingInheritedValue: 200_000_000,
      commercialInheritedValue: 100_000_000,
      capitalExpenditure: NAMOK,
    });
    expect(r.proviso).toBeUndefined();
    expect(r.hAcq).toBeGreaterThan(0);
  });
});

/**
 * P7-4 — Case A 4부분 안분(엑셀 사례 `주택일부 용도변경.xlsx`).
 * 어댑터 2개가 `swapToDirect`를 읽지 않아 단서가 **완전 무효**였다(과다과세).
 */
describe("F18 — PHD Case A 4부분 × §97②2호 단서", () => {
  const fourPartAsset = (over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput =>
    ({
      isMixedUseHouse: true,
      residentialFloorArea: 37.79,
      nonResidentialFloorArea: 80.23,
      buildingFootprintArea: 118.02,
      totalLandArea: 198.3,
      landAcquisitionDate: new Date("1985-01-01"),
      buildingAcquisitionDate: new Date("1985-01-01"),
      transferStandardPrice: {
        housingPrice: 380_000_000,
        commercialBuildingPrice: 7_461_390,
        landPricePerSqm: 3_300_000,
      },
      acquisitionStandardPrice: {
        housingPrice: undefined,
        commercialBuildingPrice: 6_890_152,
        landPricePerSqm: 570_058,
      },
      isOneHouseExempt: false,
      isMetropolitanArea: true,
      zoneType: "residential",
      residencePeriodYears: 0,
      usePreHousingDisclosure: true,
      preHousingDisclosure: {
        firstDisclosureDate: new Date("2005-01-01"),
        firstDisclosureHousingPrice: 150_000_000,
        landPricePerSqmAtAcquisition: 570_058,
        buildingStdPriceAtAcquisition: 3_587_026,
        landPricePerSqmAtFirstDisclosure: 1_700_000,
        buildingStdPriceAtFirstDisclosure: 3_249_940,
        transferHousingPrice: 380_000_000,
        landPricePerSqmAtTransfer: 3_300_000,
        buildingStdPriceAtTransfer: 3_514_470,
        commercialBuildingStdPriceAtAcq: 6_890_152,
        commercialBuildingStdPriceAtFirstDisclosure: 6_257_940,
        commercialBuildingStdPriceAtTransfer: 7_461_390,
        totalTransferPriceForFourPart: 1_300_000_000,
      },
      partialUsageChange: {
        direction: "house_to_commercial",
        usageChangeDate: new Date("2011-08-05"),
      },
      ...over,
    }) as unknown as MixedUseAssetInput;

  const runFp = (over: Partial<MixedUseAssetInput> = {}) =>
    snap(
      calcMixedUseTransferTax(
        1_300_000_000,
        new Date("2023-02-16"),
        fourPartAsset(over),
        rates,
      ),
    );

  it("실비 미입력 기준선 — 엑셀 사례 그대로(불변)", () => {
    const r = runFp();
    expect(r.proviso).toBeUndefined();
    expect(r.totalPayable).toBe(352_211_435);
  }, 20000);

  it("🔴 P7-4 자본적지출 9억 — 단서가 실제로 반영된다", () => {
    const r = runFp({ capitalExpenditure: NAMOK });
    expect(r.proviso).toEqual({
      estimatedSide: 85_094_509,
      directSide: NAMOK,
      chosen: "direct",
    });
    expect(r.hAcq).toBe(0); // 수정 전 26,892,433
    expect(r.cAcq).toBe(0); // 수정 전 56,598,472
    expect(r.hDed).toBe(289_890_147); // 수정 전 516,520 (개산공제)
    expect(r.cDed).toBe(610_109_853); // 수정 전 1,087,084
    expect(r.hDed + r.cDed).toBe(NAMOK);
    // 수정 전 352,211,435 — 실비를 넣으나 마나 세액이 같았다(단서 완전 무효).
    expect(r.totalPayable).toBe(94_009_689);
  }, 20000);
});
