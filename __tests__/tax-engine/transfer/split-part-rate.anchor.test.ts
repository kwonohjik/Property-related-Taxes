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

  it("A-3b: 비사업용 토지 자산은 P1 대상 밖 — 현행 불변", () => {
    const r = run({
      isNonBusinessLand: true,
      acquisitionDate: D("2025-06-01"),
      landAcquisitionDate: D("2010-06-01"),
    });
    // 토지 취득 2010-06-01은 2008 위기 취득 중과배제(부칙 제9270호 §14①) 구간 →
    // +10%p 배제 후 §104①후단 비교로 단기 40%가 채택된다.
    expect(r.calculatedTax).toBe(159_000_000);
    expect(r.appliedRate).toBe(0.4);
  });

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
      expect(parts!.land.taxBase + parts!.building.taxBase).toBe(r.taxBase);
      expect(parts!.land.calculatedTax + parts!.building.calculatedTax).toBe(parts!.perAssetTotal);
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
