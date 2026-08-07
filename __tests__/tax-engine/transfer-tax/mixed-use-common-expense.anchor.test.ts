/**
 * anchor: 겸용주택 **자산 단위 공통 필요경비** (W-3, 2026-08-07)
 *
 * ── 무엇이 없었나 ────────────────────────────────────────────────────────
 * 겸용주택에는 **파트별**(주택분·상가분) 자본적지출·양도비 입력이 **이미 있었다**
 * (`MixedUseAssetMajorStdPrice.tsx:195-204` · `housingInheritedExpense`).
 * 없던 것은 **주택분↔상가분으로 나눌 수 없는 「공통」 지출**을 넣을 자리다 —
 * 건물 전체 리모델링·중개수수료가 그런 것이고, 나누는 비율(취득시·양도시 기준시가)은
 * **엔진만 안다**.
 *
 * ── 법령 ────────────────────────────────────────────────────────────────
 * 「소득세법」 제100조 제2항 **후문**: 「이 경우 **공통되는 취득가액과 양도비용**은
 * **해당 자산의 가액에 비례하여** 안분계산한다」 + 같은 항 **본문**의
 * 「**취득 또는 양도 당시의** 기준시가」 ⇒ 성질이 시점을 정한다.
 *
 *   · 자본적지출(§97①2호) → **취득시** 기준시가 축(`apportionAcquisitionPrice`)
 *   · 양도비(§97①3호)     → **양도시** 기준시가 축(`apportionTransferPrice`)
 *
 * ── 고정 계약 ────────────────────────────────────────────────────────────
 *   X1. 공통 비용이 **세액을 움직인다**(payload 존재가 아니라 세액으로 잰다)
 *   X2. 자본적지출과 양도비는 **다른 축**으로 안분된다
 *   X3. **파트별 직접 입력이 우선** — 그 파트는 안분하지 않는다(§100② 후문 「공통되는」)
 *   X4. 환산 모드는 **개산공제 정본** — 공통 비용이 세액을 움직이지 않는다(§97②2호 본문)
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const rates = makeMockRates();
const TRANSFER_DATE = new Date("2024-03-01");
const TRANSFER_PRICE = 1_500_000_000;

const CAPEX = 30_000_000;
const TRANSFER_EXP = 10_000_000;

/**
 * 두 축의 비율이 **실제로 다른** 자산을 고른다 — 같으면 X2가 공허해진다.
 *   취득시 주택분 비중 = 150,000,000 / (150,000,000 + 상가분)
 *   양도시 주택분 비중 = 300,000,000 / (300,000,000 + 상가분)
 */
function makeAsset(over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 60,
    nonResidentialFloorArea: 40,
    buildingFootprintArea: 50,
    totalLandArea: 100,
    landAcquisitionDate: new Date("2009-03-01"),
    buildingAcquisitionDate: new Date("2009-03-01"),
    transferStandardPrice: {
      housingPrice: 300_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 2_000_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 150_000_000,
      commercialBuildingPrice: 30_000_000,
      landPricePerSqm: 1_000_000,
    },
    residencePeriodYears: 10,
    zoneType: "general_residential",
    isOneHouseExempt: true,
    useActualAcquisition: true,
    acquisitionActualTotalPrice: 500_000_000,
    ...over,
  } as MixedUseAssetInput;
}

function run(over: Partial<MixedUseAssetInput> = {}) {
  const r = calcMixedUseTransferTax(TRANSFER_PRICE, TRANSFER_DATE, makeAsset(over), rates);
  return {
    aggregateIncome: r.total.aggregateIncome,
    housingLandDed: r.housingPart.landAppraisalDed,
    housingBuildingDed: r.housingPart.buildingAppraisalDed,
    commercialLandDed: r.commercialPart.landAppraisalDed,
    commercialBuildingDed: r.commercialPart.buildingAppraisalDed,
  };
}

describe("전제 — 두 안분 축이 다르다", () => {
  it("취득시 주택분 비중 ≠ 양도시 주택분 비중 (같으면 X2가 공허해진다)", () => {
    const a = makeAsset();
    const acqCommercial =
      a.acquisitionStandardPrice.landPricePerSqm * 40 + a.acquisitionStandardPrice.commercialBuildingPrice;
    const transferCommercial =
      a.transferStandardPrice.landPricePerSqm * 40 + a.transferStandardPrice.commercialBuildingPrice;
    const acqRatio = (a.acquisitionStandardPrice.housingPrice ?? 0) / ((a.acquisitionStandardPrice.housingPrice ?? 0) + acqCommercial);
    const transferRatio = a.transferStandardPrice.housingPrice / (a.transferStandardPrice.housingPrice + transferCommercial);
    expect(acqRatio).not.toBeCloseTo(transferRatio, 3);
  });
});

describe("X1 — 공통 비용이 세액을 움직인다", () => {
  it("🔴 자본적지출·양도비를 넣으면 양도소득금액이 줄어든다", () => {
    const none = run();
    const withExpense = run({ capitalExpenditure: CAPEX, transferExpense: TRANSFER_EXP });
    expect(withExpense.aggregateIncome).toBeLessThan(none.aggregateIncome);
  });

  it("🔴 주택분·상가분 **양쪽에** 배분된다 — 한쪽만 가면 안분이 죽은 것이다", () => {
    const none = run();
    const withExpense = run({ capitalExpenditure: CAPEX, transferExpense: TRANSFER_EXP });
    const housingDelta =
      withExpense.housingLandDed + withExpense.housingBuildingDed
      - (none.housingLandDed + none.housingBuildingDed);
    const commercialDelta =
      withExpense.commercialLandDed + withExpense.commercialBuildingDed
      - (none.commercialLandDed + none.commercialBuildingDed);
    expect(housingDelta).toBeGreaterThan(0);
    expect(commercialDelta).toBeGreaterThan(0);
    // 총액 보존 — 두 파트 증가분의 합이 투입액과 같다.
    expect(housingDelta + commercialDelta).toBe(CAPEX + TRANSFER_EXP);
  });
});

describe("X2 — 자본적지출과 양도비는 축이 다르다", () => {
  it("🔴 같은 총액이라도 성질이 다르면 파트 배분이 다르다", () => {
    const capexOnly = run({ capitalExpenditure: CAPEX + TRANSFER_EXP });
    const transferOnly = run({ transferExpense: CAPEX + TRANSFER_EXP });
    const housingOf = (r: ReturnType<typeof run>) => r.housingLandDed + r.housingBuildingDed;
    expect(housingOf(capexOnly)).not.toBe(housingOf(transferOnly));
    /**
     * 이 fixture는 **취득시** 주택분 비중이 더 크다:
     *   취득시 150,000,000 / 220,000,000 = 0.6818
     *   양도시 300,000,000 / 480,000,000 = 0.6250
     * ⇒ 취득시 축을 쓰는 **자본적지출** 쪽이 주택분에 더 간다.
     *   실측: 자본적지출 27,272,727 · 양도비 25,000,000 (총액 4,000만 기준)
     */
    expect(housingOf(capexOnly)).toBeGreaterThan(housingOf(transferOnly));
    expect(housingOf(capexOnly)).toBe(27_272_727);
    expect(housingOf(transferOnly)).toBe(25_000_000);
  });

  it("총액 보존 — 성질을 어떻게 나눠도 4슬롯 합계는 같다", () => {
    const sumOf = (r: ReturnType<typeof run>) =>
      r.housingLandDed + r.housingBuildingDed + r.commercialLandDed + r.commercialBuildingDed;
    const mixed = run({ capitalExpenditure: CAPEX, transferExpense: TRANSFER_EXP });
    const capexOnly = run({ capitalExpenditure: CAPEX + TRANSFER_EXP });
    expect(sumOf(mixed)).toBe(sumOf(capexOnly));
  });
});

/**
 * X3 — §100② 후문이 안분하라는 것은 「**공통되는**」 것뿐이다.
 * 사용자가 주택분/상가분을 직접 나눠 넣었으면 그 파트는 **안분 대상이 아니다**.
 */
describe("X3 — 파트별 직접 입력이 우선한다", () => {
  it("🔴 주택분 직접 입력이 있으면 그 파트는 공통 비용을 받지 않는다", () => {
    const DIRECT = 20_000_000;
    const withDirect = run({
      housingInheritedExpense: DIRECT,
      capitalExpenditure: CAPEX,
      transferExpense: TRANSFER_EXP,
    });
    // 주택분은 직접 입력값 그대로(합계 = DIRECT), 공통분이 더해지지 않는다.
    expect(withDirect.housingLandDed + withDirect.housingBuildingDed).toBe(DIRECT);
    // 상가분은 여전히 공통분을 안분받는다.
    expect(withDirect.commercialLandDed + withDirect.commercialBuildingDed).toBeGreaterThan(0);
  });

  it("직접 입력이 없는 파트만 안분받는다 — 상가분 직접 입력 케이스(대칭)", () => {
    const DIRECT = 5_000_000;
    const r = run({
      commercialInheritedExpense: DIRECT,
      capitalExpenditure: CAPEX,
      transferExpense: TRANSFER_EXP,
    });
    expect(r.commercialLandDed + r.commercialBuildingDed).toBe(DIRECT);
    expect(r.housingLandDed + r.housingBuildingDed).toBeGreaterThan(0);
  });
});

/**
 * X4 — 환산(기준시가) 모드는 §97②2호 **본문**이 개산공제로 갈음한다.
 * 「안 움직인다」를 **의도적으로** 고정한다 — 고치면 법령 위반이다.
 * (같은 항 2호 **단서**의 가목·나목 택일은 겸용에 미구현 — 비교 단위 미정이라 별건.)
 */
describe("X4 — 환산 모드는 개산공제 정본", () => {
  it("🔴 공통 비용을 넣어도 세액이 움직이지 않는다", () => {
    const none = run({ useActualAcquisition: false, acquisitionActualTotalPrice: undefined });
    const withExpense = run({
      useActualAcquisition: false,
      acquisitionActualTotalPrice: undefined,
      capitalExpenditure: CAPEX,
      transferExpense: TRANSFER_EXP,
    });
    expect(withExpense.aggregateIncome).toBe(none.aggregateIncome);
    // 개산공제가 그대로 남아 있어야 한다 — 0이면 다른 결함이다.
    expect(none.housingLandDed + none.housingBuildingDed).toBeGreaterThan(0);
  });
});
