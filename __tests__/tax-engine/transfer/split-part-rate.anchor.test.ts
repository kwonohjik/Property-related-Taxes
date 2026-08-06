/**
 * anchor: 토지·건물 파트별 세율 + §104⑤ 미니 비교과세 (G-1)
 *
 * 계획서 `docs/02-design/features/transfer-split-part-rate-shortterm.plan.md` §7.
 * 대상은 **비주택**(propertyType "building") split 자산이다 — 토지·건물 취득일이 달라
 * 파트별 확정세율이 갈리는데도 현행은 자산 단위 단일 세율(건물 취득일 기준)을 전체에 적용한다.
 *
 * [법령 근거]
 *  · 「소득세법」 제104조 제5항 — 과세기간에 §94①1호 자산을 둘 이상 양도하면
 *    ⓐ 합산 과세표준 누진세액(1호)과 ⓑ 자산별 산출세액 합계(2호) 중 **큰 것**.
 *  · 「소득세법」 제104조 제2항 — 보유기간은 해당 자산의 취득일부터 양도일까지.
 *  · 「소득세법」 제103조 제2항 — 기본공제는 세액이 가장 크게 줄어드는 자산에 배분.
 *
 * ⚠️ **주택은 대상이 아니다**(A-4 회귀 가드). 주택과 그 부수토지는 §104①2호 괄호
 *    ("주택… 이에 딸린 토지… 포함… 이하 이 항에서 같다")로 일체과세이며,
 *    조심 2024인3140(2024.9.3. 기각)이 "토지·건물 별개 자산" 주장을 배척했다.
 *
 * 금액 전제(전 케이스 공통): 토지 양도 7억(취득 2억) + 건물 양도 3억(취득 2.5억),
 * 양도 2026-07-01, 지분 100%, 감면 없음, mock 세율.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, parseRatesFromMap } from "@/lib/tax-engine/transfer-tax";
import { computeSplitPartTax } from "@/lib/tax-engine/transfer-tax-split-rate";
import { calcTax } from "@/lib/tax-engine/transfer-tax-rate-calc";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const D = (s: string) => new Date(s);

/** 비주택(일반건물) 토지·건물 별개취득 split 자산 */
function splitAsset(overrides: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "building",
    transferPrice: 1_000_000_000,
    transferDate: D("2026-07-01"),
    acquisitionPrice: 450_000_000,
    isOneHousehold: false,
    householdHousingCount: 1,
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landTransferPrice: 700_000_000,
    buildingTransferPrice: 300_000_000,
    // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
    //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
    landStandardPriceAtTransfer: 700_000_000,
    buildingStandardPriceAtTransfer: 300_000_000,
    landAcquisitionPrice: 200_000_000,
    buildingAcquisitionPrice: 250_000_000,
    ...overrides,
  });
}

const run = (o: Partial<TransferTaxInput>) => calculateTransferTax(splitAsset(o), makeMockRates());

describe("G-1 파트별 세율 — 회귀 가드 (먼저 GREEN이어야 한다)", () => {
  it("A-3: M-1 비주택·토지 2010 + 건물 2010 — 파트 세율 동일 → 진입하지 않는다", () => {
    const r = run({ acquisitionDate: D("2010-06-01"), landAcquisitionDate: D("2010-06-01") });
    // 양도소득금액 385,000,000(토지 350,000,000 + 건물 35,000,000) − 기본공제 2,500,000
    expect(r.taxBase).toBe(382_500_000);
    expect(r.calculatedTax).toBe(127_060_000);
    expect(r.appliedRate).toBe(0.4);
  });

  it("A-4: M-6 주택·토지 2010 + 건물 2025-06 신축 — 주택은 일체과세(조심 2024인3140) → 불변 60%", () => {
    const r = run({
      propertyType: "housing",
      householdHousingCount: 2, // 1세대1주택 비과세 조기반환 회피(비조정지역 → 중과 아님)
      acquisitionDate: D("2025-06-01"),
      landAcquisitionDate: D("2010-06-01"),
    });
    expect(r.taxBase).toBe(397_500_000);
    expect(r.calculatedTax).toBe(238_500_000);
    expect(r.appliedRate).toBe(0.6);
  });

  // (A-3b「비사업용 토지 자산은 대상 밖」은 **P4에서 폐기** — 아래 P4 describe가 대체한다.)

  it("A-3c: 부담부증여는 §159 안분이 총액을 override — 대상 밖, 현행 불변", () => {
    const r = run({
      transferType: "burdened_gift",
      acquisitionDate: D("2025-06-01"),
      landAcquisitionDate: D("2010-06-01"),
    });
    expect(r.calculatedTax).toBe(159_000_000);
  });

  it("A-3d: selfOwns=land_only(본인 토지분만 신고)는 기존 단독 파트 경로 유지", () => {
    const r = run({
      selfOwns: "land_only",
      acquisitionDate: D("2025-06-01"),
      landAcquisitionDate: D("2010-06-01"),
    });
    expect(r.taxBase).toBe(347_500_000);
    expect(r.calculatedTax).toBe(113_060_000);
  });
});

describe("G-1 파트별 세율 — 본 기능 (§104⑤)", () => {
  it("A-1: M-2 토지 2010(누진) + 건물 2025-06(1~2년 40%) → 133,060,000", () => {
    const r = run({ acquisitionDate: D("2025-06-01"), landAcquisitionDate: D("2010-06-01") });
    expect(r.taxBase).toBe(397_500_000);
    // 2호 = 토지 350,000,000 누진 114,060,000 + 건물 47,500,000 × 40% 19,000,000
    //      (기본공제 2,500,000은 최고세율 파트인 건물에 배분 — §103②)
    // 1호 = 397,500,000 누진 133,060,000 → MAX
    expect(r.calculatedTax).toBe(133_060_000);
  });

  it("A-2: M-3 토지 2025-06(1~2년 40%) + 건물 2010(누진) → 202,990,000 (현행은 과소)", () => {
    const r = run({ acquisitionDate: D("2010-06-01"), landAcquisitionDate: D("2025-06-01") });
    expect(r.taxBase).toBe(532_500_000);
    // 2호 = 토지 497,500,000 × 40% 199,000,000 + 건물 35,000,000 누진 3,990,000
    // 1호 = 532,500,000 누진 187,710,000 → MAX = 2호
    expect(r.calculatedTax).toBe(202_990_000);
  });

  it("A-2b: §104⑤1호(합산 누진)가 이기는 경우 — 기존 자산 단위 단기세율이 과소였다", () => {
    // 토지 양도차익 20억(2010 취득·장특 30%) + 건물 양도차익 5천만(2025-06 신축)
    const r = run({
      transferPrice: 2_600_000_000,
      acquisitionPrice: 550_000_000,
      landTransferPrice: 2_300_000_000,
      buildingTransferPrice: 300_000_000,
      // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
      //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
      landStandardPriceAtTransfer: 2_300_000_000,
      buildingStandardPriceAtTransfer: 300_000_000,
      landAcquisitionPrice: 300_000_000,
      buildingAcquisitionPrice: 250_000_000,
      acquisitionDate: D("2025-06-01"),
      landAcquisitionDate: D("2010-06-01"),
    });
    expect(r.taxBase).toBe(1_447_500_000);
    // 2호 = 토지 1,397,500,000 누진 562,935,000 + 건물 50,000,000 × 40% 20,000,000 = 582,935,000
    // 1호 = 1,447,500,000 × 45% − 65,940,000 = 585,435,000 → MAX = 1호
    // (기존 경로는 건물 기준 40%를 전체에 물려 579,000,000 — 6,435,000 과소)
    expect(r.calculatedTax).toBe(585_435_000);
    expect(r.appliedRate).toBe(0.45);
  });

  it("A-5: M-5 토지 1~2년 40% + 건물 1년 미만 50% — 세율군이 같아도 세율이 다르면 진입", () => {
    const r = run({ acquisitionDate: D("2026-01-01"), landAcquisitionDate: D("2025-06-01") });
    expect(r.taxBase).toBe(547_500_000);
    // 2호 = 토지 500,000,000 × 40% 200,000,000 + 건물 47,500,000 × 50% 23,750,000
    // 1호 = 547,500,000 누진 194,010,000 → MAX = 2호
    expect(r.calculatedTax).toBe(223_750_000);
    // 표시용 적용세율은 파트 최고세율
    expect(r.appliedRate).toBe(0.5);
  });

  it("A-11: 불변식 — 파트별 과세표준의 합이 자산 과세표준과 일치한다", () => {
    // result 타입은 바꾸지 않는다(계획서 §5.3 P1 「신규 필드 없음」) — 순수 함수를 직접 검증한다.
    const parsedRates = parseRatesFromMap(makeMockRates());
    for (const [acq, land] of [
      ["2025-06-01", "2010-06-01"],
      ["2010-06-01", "2025-06-01"],
      ["2026-01-01", "2025-06-01"],
    ] as const) {
      const input = splitAsset({ acquisitionDate: D(acq), landAcquisitionDate: D(land) });
      const r = calculateTransferTax(input, makeMockRates());
      const parts = computeSplitPartTax({
        taxBase: r.taxBase,
        transferIncome: r.taxBase + r.basicDeduction,
        basicDeduction: r.basicDeduction,
        splitDetail: r.splitDetail!,
        parsedRates,
        taxRateInput: input,
      });
      expect(parts).not.toBeNull();
      const sum = (f: (p: NonNullable<typeof parts>["parts"][number]) => number) =>
        parts!.parts.reduce((s, p) => s + f(p), 0);
      expect(sum((p) => p.taxBase)).toBe(r.taxBase);
      expect(sum((p) => p.calculatedTax)).toBe(parts!.perAssetTotal);
      expect(r.calculatedTax).toBe(Math.max(parts!.perAssetTotal, parts!.aggregateProgressive));
    }
  });
});

/**
 * G-3 (계획서 §5.4) — 주택 부수토지를 **나중에** 취득한 경우.
 *
 * 세율 축: 토지 파트 기산일 = `max(토지 취득일, 주택 취득일)`.
 *   · 토지 먼저 → 주택 취득일 (= 현행, 회귀 0 — 조심 2024인3140 정합)
 *   · 토지 나중 → 토지 취득일 (신규) → 주택부수토지로서 보유 1~2년이면 §104①2호 60%
 * 비과세 축: 나중 취득 토지가 보유 2년 미만이면 「소득세법」 시행령 제154조 제1항 보유요건
 *   미충족 → 그 토지분은 1세대1주택 비과세 대상이 아니다. 겸용주택 정본 패턴대로
 *   12억 안분 대상에서 빼고 전액 과세한다.
 *
 * ⚠️ 근거 수준은 **간접**이다(계획서 §1.5·§10-1) — 국세청 상속증여세과-466·부동산거래관리과-435가
 *    부수토지 취득시기를 개별 판정하도록 한 데서 이어진 것이고 명시 판단은 없다. 사용자(세무
 *    전문가) 방침으로 확정했다.
 */
describe("G-3 주택 부수토지 max 기산일 + 비과세 제외", () => {
  /** 건물 2010-06-01 + 토지 2025-06-01 (토지를 나중에 취득 — 보유 1년 1개월) */
  const LATER_LAND = { acquisitionDate: D("2010-06-01"), landAcquisitionDate: D("2025-06-01") };

  it("A-12: 비과세 비대상(2주택) — 토지분 60% + 건물분 누진 (현행 누진 단일 187,710,000)", () => {
    const r = run({ propertyType: "housing", householdHousingCount: 2, isOneHousehold: false, ...LATER_LAND });
    expect(r.taxBase).toBe(532_500_000);
    // 2호 = 토지 497,500,000 × 60% 298,500,000 + 건물 35,000,000 누진 3,990,000
    // 1호 = 532,500,000 누진 187,710,000 → MAX = 2호
    expect(r.calculatedTax).toBe(302_490_000);
    expect(r.appliedRate).toBe(0.6);
  });

  it("A-12b: 1세대1주택 12억 이하 — 건물분만 비과세, 토지분(보유 1년)은 과세", () => {
    const r = run({ propertyType: "housing", householdHousingCount: 1, isOneHousehold: true, ...LATER_LAND });
    // 현행은 전액 비과세 조기 반환(산출세액 0)이었다.
    expect(r.isExempt).toBe(false);
    expect(r.transferGain).toBe(550_000_000);
    expect(r.taxableGain).toBe(500_000_000); // 토지분 전액 + 건물분 0
    expect(r.taxBase).toBe(497_500_000);
    expect(r.calculatedTax).toBe(298_500_000);
    expect(r.appliedRate).toBe(0.6);
  });

  it("A-12c: 1세대1주택 고가주택(20억) — 토지분 전액 과세 + 건물분만 12억 안분", () => {
    const r = run({
      propertyType: "housing",
      householdHousingCount: 1,
      isOneHousehold: true,
      transferPrice: 2_000_000_000,
      landTransferPrice: 1_400_000_000,
      buildingTransferPrice: 600_000_000,
      // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
      //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
      landStandardPriceAtTransfer: 1_400_000_000,
      buildingStandardPriceAtTransfer: 600_000_000,
      ...LATER_LAND,
    });
    // 토지 양도차익 1,200,000,000 전액 + 건물 350,000,000 × (20억−12억)/20억 = 140,000,000
    expect(r.taxableGain).toBe(1_340_000_000);
    // 장특: 토지 0(보유 1년) + 건물 140,000,000 × 60%(표2) = 84,000,000
    expect(r.longTermHoldingDeduction).toBe(84_000_000);
    expect(r.taxBase).toBe(1_253_500_000);
    // 2호 = 토지 1,197,500,000 × 60% 718,500,000 + 건물 56,000,000 누진 7,680,000
    // 1호 = 1,253,500,000 누진 498,135,000 → MAX = 2호
    expect(r.calculatedTax).toBe(726_180_000);
  });

  it("A-13: 회귀 가드 — 토지를 **먼저** 취득하면 `max`가 주택 취득일을 돌려준다(불변)", () => {
    const first = { acquisitionDate: D("2022-09-01"), landAcquisitionDate: D("2010-06-01") };
    const taxed = run({ propertyType: "housing", householdHousingCount: 2, isOneHousehold: false, ...first });
    expect(taxed.calculatedTax).toBe(131_860_000);
    expect(taxed.appliedRate).toBe(0.4);
    const exempt = run({ propertyType: "housing", householdHousingCount: 1, isOneHousehold: true, ...first });
    expect(exempt.isExempt).toBe(true); // 전액 비과세 조기 반환 유지
    expect(exempt.calculatedTax).toBe(0);
  });

  it("A-13b: 회귀 가드 — 토지를 나중에 취득했어도 **보유 2년 이상**이면 비과세 유지", () => {
    const r = run({
      propertyType: "housing",
      householdHousingCount: 1,
      isOneHousehold: true,
      acquisitionDate: D("2010-06-01"),
      landAcquisitionDate: D("2023-01-01"), // 보유 3년 6개월
    });
    expect(r.isExempt).toBe(true);
    expect(r.calculatedTax).toBe(0);
  });
});

/**
 * G-2 (계획서 §5.2) — 주택 부수토지 **배율 초과분**을 비사업용 토지로 분리.
 *
 * 「소득세법」 제104조의3 제1항 제5호가 "주택부속토지 중 주택 정착면적에 지역별 배율을 곱하여
 * 산정한 면적을 초과하는 토지"를 명문으로 비사업용 토지로 규정한다(배율 위임 = 같은 법
 * 시행령 제168조의12). ⇒ ⓐ1세대1주택 비과세 제외 ⓑ토지 본래 보유기간 기준 누진 + 10%p
 * (§104①8호) ⓒ장기보유특별공제 표1.
 *
 * ⚠️ **기간요건(시행령 제168조의6)은 판정하지 않는다** — 사용자 방침(2026-07-31).
 *    겸용주택 정본(`buildNonBusinessPart`)과 동일하게 배율 초과 = 비사업용 토지로 일률 처리한다.
 *
 * 픽스처는 **조심 2024인3140** 구조: 정착 60㎡ × 10배(도시지역 외) = 600㎡ / 토지 660㎡ → 초과 60㎡.
 * 토지 2008-07-01 · 주택 2022-09-01 신축 · 2023-02-01 양도 · 토지 8억(취득 2억) + 건물 2억(취득 1억).
 */
describe("G-2 주택 부수토지 배율 초과분 → 비사업용 토지 분리", () => {
  const case3140 = {
    propertyType: "housing" as const,
    transferPrice: 1_000_000_000,
    acquisitionPrice: 300_000_000,
    landTransferPrice: 800_000_000,
    buildingTransferPrice: 200_000_000,
    // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
    //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
    landStandardPriceAtTransfer: 800_000_000,
    buildingStandardPriceAtTransfer: 200_000_000,
    landAcquisitionPrice: 200_000_000,
    buildingAcquisitionPrice: 100_000_000,
    acquisitionDate: D("2022-09-01"),
    landAcquisitionDate: D("2008-07-01"),
    transferDate: D("2023-02-01"),
    buildingFootprintArea: 60,
    acquisitionArea: 660,
    appurtenantLandZone: "non_urban" as const,
  };

  it("A-6: 비과세 비대상(2주택) — 초과 60㎡를 비사업용 토지로 분리", () => {
    const r = run({ ...case3140, isOneHousehold: false, householdHousingCount: 2 });
    const nb = r.splitDetail!.nonBusinessLandPart!;
    expect(nb.appliedMultiplier).toBe(10);
    expect(nb.limitArea).toBe(600); // 정착 60㎡ × 10배
    expect(nb.excessArea).toBe(60); // 660 − 600
    // 토지 양도차익 600,000,000 × 60/660 = 54,545,454 (원 미만 절사)
    expect(nb.gain).toBe(54_545_454);
    expect(r.splitDetail!.land.taxableGainAfterProration).toBe(545_454_546);
    // 장특: 배율 초과분은 표1(토지 보유 14년 × 2% = 28%)
    expect(nb.longTermRate).toBe(0.28);
    expect(nb.longTermDeduction).toBe(15_272_727);
    expect(r.longTermHoldingDeduction).toBe(167_999_999);
    expect(r.taxBase).toBe(529_500_001);
    // 2호 = 토지 390,227,274 × 70% 273,159,091 (배율 내 부수토지는 주택 단기세율 —
    //        조심 2024인3140이 "600㎡까지 70%"라 한 것과 일치)
    //      + 건물 100,000,000 × 70% 70,000,000
    //      + 비사업용 36,772,727... 39,272,727 누진 4,630,909 + 10%p 3,927,272 = 8,558,181
    // 1호 = 529,500,001 누진 186,450,000 → MAX = 2호
    expect(r.calculatedTax).toBe(351_717_272);
  });

  it("A-7: 1세대1주택 비과세 요건 충족(주택 5년 보유·10억) — 초과분만 과세", () => {
    const r = run({
      ...case3140,
      acquisitionDate: D("2018-01-01"),
      isOneHousehold: true,
      householdHousingCount: 1,
    });
    expect(r.isExempt).toBe(false); // 전액 비과세 조기 반환이 억제된다
    expect(r.transferGain).toBe(700_000_000);
    // 배율 내 토지·건물은 비과세, 초과분 54,545,454만 과세
    expect(r.taxableGain).toBe(54_545_454);
    expect(r.splitDetail!.land.taxableGainAfterProration).toBe(0);
    expect(r.splitDetail!.building.taxableGainAfterProration).toBe(0);
    expect(r.taxBase).toBe(36_772_727);
    // 비사업용 36,772,727 누진 4,255,909 + 10%p 3,677,272
    expect(r.calculatedTax).toBe(7_933_181);
  });

  it("A-8: 조심 2024서2826 면적 구조 — 정착 141.39㎡ × 3배 = 424.17㎡ / 토지 647㎡ → 초과 222.83㎡", () => {
    const r = run({
      propertyType: "housing",
      transferPrice: 2_000_000_000,
      acquisitionPrice: 600_000_000,
      landTransferPrice: 1_600_000_000,
      buildingTransferPrice: 400_000_000,
      // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
      //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
      landStandardPriceAtTransfer: 1_600_000_000,
      buildingStandardPriceAtTransfer: 400_000_000,
      landAcquisitionPrice: 400_000_000,
      buildingAcquisitionPrice: 200_000_000,
      acquisitionDate: D("2015-05-01"),
      landAcquisitionDate: D("2015-05-01"),
      transferDate: D("2023-07-26"),
      buildingFootprintArea: 141.39,
      acquisitionArea: 647,
      appurtenantLandZone: "metropolitan_residential",
      isOneHousehold: false,
      householdHousingCount: 2,
    });
    const nb = r.splitDetail!.nonBusinessLandPart!;
    expect(nb.appliedMultiplier).toBe(3); // 수도권 주거지역 (2022.1.1. 이후 양도)
    expect(nb.limitArea).toBe(424.17);
    expect(nb.excessArea).toBe(222.83); // 재결례 실제 수치
    // ⚠️ 세액은 §104⑤**1호**(합산 누진)가 이겨 분리 전과 같다 — 파트를 쪼개면 각 파트가 낮은
    //    누진구간에 들어가 2호 합계가 1호보다 작아지기 때문이다(§104⑤ = MAX).
    expect(r.calculatedTax).toBe(462_135_000);
  });

  it("A-6b(회귀): 토지가 한도 이내(500㎡ ≤ 600㎡)면 분리하지 않는다", () => {
    const r = run({ ...case3140, acquisitionArea: 500, isOneHousehold: false, householdHousingCount: 2 });
    expect(r.splitDetail!.nonBusinessLandPart).toBeUndefined();
    expect(r.calculatedTax).toBe(370_650_000); // 주택 일체 70% 단일
  });

  it("A-6c(회귀·R-7): 용도지역 미입력이면 진입하지 않는다 — 3배 fallback은 납세자 불리", () => {
    const r = run({
      ...case3140,
      appurtenantLandZone: undefined,
      isOneHousehold: false,
      householdHousingCount: 2,
    });
    expect(r.splitDetail!.nonBusinessLandPart).toBeUndefined();
    expect(r.calculatedTax).toBe(370_650_000); // 미입력은 ⑧validate가 차단한다
  });
});

/**
 * G-4 (계획서 §5.3 P3) — §104②1·2호 통산을 **토지 파트**에 적용.
 *
 * 「소득세법」 제104조 제2항 단서는 보유기간 기산을 **해당 자산별로** 정한다:
 *   1호 상속받은 자산 → 피상속인이 그 자산을 취득한 날
 *   2호 제97조의2 제1항(배우자등 이월과세) 자산 → 증여자가 그 자산을 취득한 날
 * 토지·건물의 취득원인이 다르면(건물 신축 + 토지 상속 등) 토지 파트는 **토지의 원인**으로 따진다.
 *
 * ⚠️ 장기보유특별공제 기산(§95④)은 상속개시일이 원칙이라 **여기서 바뀌지 않는다** — 세율 축 전용.
 */
describe("G-4 토지 파트 §104② 상속·증여 보유기간 통산", () => {
  it("A-14: M-10 토지 상속(피상속인 2005 · 개시 2025-06) + 건물 2020 — 토지분이 누진으로", () => {
    const r = run({
      acquisitionDate: D("2020-01-01"),
      acquisitionCause: "purchase",
      landAcquisitionDate: D("2025-06-01"),
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: D("2005-01-01"),
    });
    // 장특은 상속개시일 기준(§95④) 그대로 — 토지 보유 1년 → 0
    expect(r.splitDetail!.land.longTermDeduction).toBe(0);
    expect(r.taxBase).toBe(541_500_000);
    // 통산 미적용 시 토지분이 1~2년 40% → 204,340,000 (과대).
    // 통산 시 토지 21년 누진 → 2호 178,350,000 < 1호 191,490,000 → MAX = 1호
    expect(r.calculatedTax).toBe(191_490_000);
  });

  it("A-14a: 피상속인 취득일 미입력이면 상속개시일 기준 — 토지분 1~2년 40%(통산 전 값)", () => {
    const r = run({
      acquisitionDate: D("2020-01-01"),
      acquisitionCause: "purchase",
      landAcquisitionDate: D("2025-06-01"),
      landAcquisitionCause: "inheritance",
    });
    // 2호 = 토지 497,500,000 × 40% 199,000,000 + 건물 44,000,000 누진 5,340,000
    expect(r.calculatedTax).toBe(204_340_000);
  });

  it("A-14b(회귀): 토지 취득원인 미제공이면 자산 단위 원인을 그대로 쓴다", () => {
    const r = run({
      acquisitionDate: D("2020-01-01"),
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: D("2005-01-01"),
      landAcquisitionDate: D("2025-06-01"),
    });
    // 자산 단위 상속 통산이 토지 파트에도 그대로 적용된다(종전 `calcTax` 동작과 동일)
    expect(r.calculatedTax).toBe(191_490_000);
  });
});

/**
 * P4 (계획서 §6 M-12) — **비사업용 토지 split 자산**의 파트별 세율.
 *
 * 「소득세법」 제104조의3 제1항은 **토지**만 비사업용으로 규정한다 — 건물은 비사업용 「토지」가
 * 될 수 없다. 그런데 자산 단위 `isNonBusinessLand` 하나로 판정하던 종전 경로는 **건물분
 * 과세표준까지 +10%p**를 물렸다. 제104조 제5항 후단("한 필지의 토지가 비사업용 토지와 그 외의
 * 토지로 구분되는 경우에는 각각을 별개의 자산으로 보아 산출세액을 계산한다")에 따라 분리한다.
 */
describe("P4 비사업용 토지 split 자산 — 토지 파트만 +10%p", () => {
  // 토지 2005-06-01 취득(2008 위기 취득 중과배제 구간 밖) + 건물 2025-06-01
  const nbl = {
    isNonBusinessLand: true,
    acquisitionDate: D("2025-06-01"),
    landAcquisitionDate: D("2005-06-01"),
  };

  it("A-15: 토지 21년(비사토) + 건물 1~2년 — 건물분 +10%p 제거", () => {
    const r = run(nbl);
    expect(r.taxBase).toBe(397_500_000);
    // 종전: 397,500,000 누진 133,060,000 + 10%p 39,750,000 = 172,810,000 (건물분에도 중과)
    // 2호 = 토지 347,500,000 누진 113,060,000 + 10%p 34,750,000 = 147,810,000
    //      + 건물 50,000,000 × 40% 20,000,000
    // 1호 = 133,060,000 → MAX = 2호
    expect(r.calculatedTax).toBe(167_810_000);
    // 차액 5,000,000 = 건물 양도소득금액 50,000,000 × 10%p
    expect(172_810_000 - r.calculatedTax).toBe(5_000_000);
    // 중과 표시는 유지되어야 한다 (결과 카드 법령근거·배지)
    expect(r.surchargeType).toBe("non_business_land");
    expect(r.surchargeRate).toBe(0.1);
  });

  it("A-15b: 토지·건물 취득일이 같아도 세율군이 갈리면 파트별로 계산한다", () => {
    const r = run({
      isNonBusinessLand: true,
      acquisitionDate: D("2005-06-01"),
      landAcquisitionDate: D("2005-06-01"),
    });
    expect(r.taxBase).toBe(382_500_000);
    // 종전: 382,500,000 누진 127,060,000 + 10%p 38,250,000 = 165,310,000
    // 2호 = 토지 347,500,000(누진+10%p) 147,810,000 + 건물 35,000,000 누진 3,990,000
    expect(r.calculatedTax).toBe(151_800_000);
    expect(r.surchargeType).toBe("non_business_land");
  });

  it("A-15c(회귀): 2008 위기 취득(2010-06) 중과배제는 그대로 — 부칙 제9270호 §14①", () => {
    const r = run({
      isNonBusinessLand: true,
      acquisitionDate: D("2025-06-01"),
      landAcquisitionDate: D("2010-06-01"),
    });
    // +10%p 배제 → 토지분도 기본 누진.
    // 종전 159,000,000은 **건물 취득일 기준 단기 40%를 자산 전체에 물린 값**(G-1 과대과세)이다.
    // 2호 = 토지 347,500,000 누진 113,060,000 + 건물 50,000,000 × 40% 20,000,000 = 133,060,000
    // 1호 = 397,500,000 누진 133,060,000 → MAX = 133,060,000
    expect(r.calculatedTax).toBe(133_060_000);
    expect(r.surchargeType).toBeUndefined();
  });
});

describe("G-1 파트별 세율 — 단건 ↔ 다건 일치 (이중 진실 방지)", () => {
  it("A-1-agg: 다건 엔진도 같은 자산에 대해 단건과 같은 산출세액을 낸다", () => {
    const item = {
      ...splitAsset({ acquisitionDate: D("2025-06-01"), landAcquisitionDate: D("2010-06-01") }),
      propertyId: "P1",
      propertyLabel: "토지 2010 + 건물 2025-06",
    };
    const agg = calculateTransferTaxAggregate(
      { taxYear: 2026, annualBasicDeductionUsed: 0, properties: [item] },
      makeMockRates(),
    );
    // 단건 A-1과 동일 — `aggregateByGroup`이 그룹 합산 1회 계산으로 되돌리면 159,000,000이 된다.
    expect(agg.calculatedTax).toBe(133_060_000);
    expect(agg.taxBase).toBe(397_500_000);
  });
});

/**
 * P1 (D-1) — §104⑤2호 **단서**: 동일 호 자산은 과세표준을 **합산**한다.
 *
 * 계획서 `docs/02-design/features/transfer-104-5-proviso-mixed-use-rate-gaps.plan.md` §4.1.
 *
 * [법령 근거] 「소득세법」 제104조 제5항 제2호 단서 —
 *   "다만, 둘 이상의 자산에 대하여 제1항 각 호 … 중 **동일한 호의 세율이 적용**되고,
 *    그 적용세율이 둘 이상인 경우 해당 자산에 대해서는 각 자산의 양도소득과세표준을
 *    **합산한 것**에 대하여 … 호별 세율을 적용하여 산출한 세액 중에서 큰 산출세액의 합계액"
 *
 * G-2 3파트(배율내 토지 · 건물 · 배율 초과 비사업용 토지)에서 **배율내 토지와 건물이 둘 다
 * §104①1호 누진**이면 종전 구현은 파트별로 `calcTax`를 따로 불러 **누진공제를 2회** 받았다.
 * 정본(`transfer-tax-aggregate-helpers.ts:415-419`)은 이미 같은 단서를 구현하고 있었다 —
 * split 경로에만 빠진 내부 불일치였다.
 *
 * 픽스처 공통: 1세대1주택 · 정착 60㎡ · 수도권 주거(배율 3배) · 토지·건물 모두 2013-01-01 취득
 * (2009.3.16~2012.12.31 위기취득 중과배제 구간을 **벗어나야** 비사토 +10%p가 살아난다) ·
 * 2026-07-01 양도 · 취득가 5억(토지 3억 + 건물 2억).
 */
describe("P1 (D-1) §104⑤2호 단서 — 동일 호 파트 과세표준 합산", () => {
  const provisoCase = (o: {
    transferPrice: number;
    landTransferPrice: number;
    buildingTransferPrice: number;
    acquisitionArea: number;
  }) =>
    run({
      propertyType: "housing",
      isOneHousehold: true,
      householdHousingCount: 1,
      acquisitionPrice: 500_000_000,
      landAcquisitionPrice: 300_000_000,
      buildingAcquisitionPrice: 200_000_000,
      acquisitionDate: D("2013-01-01"),
      landAcquisitionDate: D("2013-01-01"),
      buildingFootprintArea: 60,
      appurtenantLandZone: "metropolitan_residential",
      ...o,
      // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
      // Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
      // `...o` **뒤에** 둔다 — 각 케이스가 파트 양도가액을 덮어쓰므로 그 값에서 파생해야 한다.
      landStandardPriceAtTransfer: o.landTransferPrice,
      buildingStandardPriceAtTransfer: o.buildingTransferPrice,
    });

  it("B-1: 30억(토지 24억/건물 6억)·토지 2,000㎡ — 누진공제 1회로 정정", () => {
    const r = provisoCase({
      transferPrice: 3_000_000_000,
      landTransferPrice: 2_400_000_000,
      buildingTransferPrice: 600_000_000,
      acquisitionArea: 2000,
    });
    // 파트 과세표준: 배율내토지 45,360,000 · 건물 96,000,000 · 비사토 1,411,640,000
    // 종전 2호 = P(45,360,000) + P(96,000,000) + 비사토      = 734,166,000  ← 누진공제 2회
    // 단서 2호 = P(45,360,000 + 96,000,000) + 비사토          = 744,498,000  ← 1회
    // 1호(합산 누진) = 632,910,000 → MAX = 2호
    expect(r.calculatedTax).toBe(744_498_000);
  });

  it("B-2: 50억(토지 45억/건물 5억)·토지 3,000㎡", () => {
    const r = provisoCase({
      transferPrice: 5_000_000_000,
      landTransferPrice: 4_500_000_000,
      buildingTransferPrice: 500_000_000,
      acquisitionArea: 3000,
    });
    // 종전 1,568,626,919 → 단서 1,583,348,040 (1호 1,323,132,600)
    expect(r.calculatedTax).toBe(1_583_348_040);
  });

  it("B-3: 20억(토지 17억/건물 3억)·토지 1,500㎡ — 차액이 15% 구간 누진공제 1회분과 같다", () => {
    const r = provisoCase({
      transferPrice: 2_000_000_000,
      landTransferPrice: 1_700_000_000,
      buildingTransferPrice: 300_000_000,
      acquisitionArea: 1500,
    });
    // 파트 과세표준: 배율내토지 26,880,000 · 건물 16,000,000 (둘 다 15% 구간)
    //   P(26,880,000) + P(16,000,000) = 3,912,000   /   P(42,880,000) = 5,172,000
    //   차 1,260,000 = 15% 구간 누진공제(1,260,000) 정확히 1회분
    expect(r.calculatedTax).toBe(442_005_600);
    expect(r.calculatedTax - 440_745_600).toBe(1_260_000);
  });
});

/**
 * B-8 — `calcTax`가 **적용 호를 직접 싣는지** 분기별로 고정한다.
 *
 * `rateClause`가 빠진 분기는 §104⑤2호 단서 판정에서 `undefined`로 떨어져 **조용히**
 * 개별 계산된다(계획서 R-1). 세액이 아니라 **분류**가 틀리는 것이라 세액 anchor로는
 * 잡히지 않으므로 분기 전수를 직접 고정한다.
 */
describe("P1 (D-1) rateClause — calcTax 분기 전수", () => {
  const rates = parseRatesFromMap(makeMockRates());
  const clauseOf = (o: Partial<TransferTaxInput>, taxBase = 300_000_000) =>
    calcTax(taxBase, rates, baseTransferInput({ transferDate: D("2026-07-01"), ...o })).rateClause;

  it("T-4 일반 누진 → 104-1-1", () => {
    expect(clauseOf({ acquisitionDate: D("2015-01-01") })).toBe("104-1-1");
  });

  it("T-1 미등기 → 104-1-10", () => {
    expect(clauseOf({ acquisitionDate: D("2015-01-01"), isUnregistered: true })).toBe("104-1-10");
  });

  it("T-2.5 단기 — 주택 1년 미만 → 104-1-3 / 1~2년 → 104-1-2", () => {
    expect(clauseOf({ propertyType: "housing", acquisitionDate: D("2026-01-01") })).toBe("104-1-3");
    expect(clauseOf({ propertyType: "housing", acquisitionDate: D("2025-01-01") })).toBe("104-1-2");
  });

  it("T-2 비사업용 토지 2년 이상 → 104-1-8", () => {
    expect(
      clauseOf({ propertyType: "land", acquisitionDate: D("2015-01-01"), isNonBusinessLand: true }),
    ).toBe("104-1-8");
  });

  it("T-2 비사업용 토지 단기 — §104①후단으로 단기세율이 이기면 그 호(2·3호)를 싣는다", () => {
    // 1년 미만 50% vs 누진+10%p — 과세표준이 낮으면 50%가 이긴다.
    expect(
      clauseOf(
        { propertyType: "land", acquisitionDate: D("2026-01-01"), isNonBusinessLand: true },
        50_000_000,
      ),
    ).toBe("104-1-3");
  });

  it("T-3 다주택 중과 → 2주택 104-7-1 / 3주택 이상 104-7-3", () => {
    const surcharged = (count: number) =>
      clauseOf({
        propertyType: "housing",
        acquisitionDate: D("2015-01-01"),
        isRegulatedArea: true,
        householdHousingCount: count,
        isOneHousehold: false,
      });
    expect(surcharged(2)).toBe("104-7-1");
    expect(surcharged(3)).toBe("104-7-3");
  });

  it("T-1.5 부수토지 일체과세 — 누진 강제는 104-1-1, 수동 세율 지정은 undefined", () => {
    const companion = (override: "progressive" | "shortTermHousing70") =>
      clauseOf({
        propertyType: "land",
        acquisitionDate: D("2015-01-01"),
        manualHoldingPeriodOverride: override,
      });
    expect(companion("progressive")).toBe("104-1-1");
    // 수동 지정 단일세율은 사용자가 세율을 강제한 것이라 적용 호를 단정할 수 없다 → 묶지 않는다.
    expect(companion("shortTermHousing70")).toBeUndefined();
  });

  it("조특법 §98①1호 20% 단일세율은 §104 밖 → undefined (묶지 않는다)", () => {
    expect(clauseOf({ acquisitionDate: D("2015-01-01"), forceFlatRate20: true })).toBeUndefined();
  });
});
