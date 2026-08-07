/**
 * anchor: 겸용주택 **§97②2호 단서** — 가목·나목 택일 (W-8, 2026-08-07)
 *
 * ── 조문 ────────────────────────────────────────────────────────────────
 * 「소득세법」 제97조 제2항 제2호 **단서**: 「다만, … 취득가액을 **환산취득가액**으로 하는
 * 경우로서 **가목의 금액이 나목의 금액보다 적은 경우**에는 나목의 금액을 필요경비로 할 수 있다.」
 *
 *   · **가목** = (주택분 + 상가분) 환산취득가액 + 개산공제 = 필요경비 **전체**
 *   · **나목** = 자산 단위 자본적지출 + 양도비
 *
 * ── 비교 단위 = **자산 단위** ────────────────────────────────────────────
 * `general-building-swap.ts:144-148`의 확립된 규칙 — 「**파트별로 취득모드가 갈리면** 파트 단위,
 * 아니면 자산 단위」. 겸용의 취득모드 플래그(`useActualAcquisition`·`acquisitionByInheritance` 등)는
 * 전부 **자산 단위**라 갈리지 않는다 ⇒ 자산 단위.
 *
 * ── 고정 계약 ────────────────────────────────────────────────────────────
 *   P1. 가목 검산 · 발동 시 **취득가액 슬롯 0** · 필요경비 = 나목
 *   P2. **동률은 본문**(단서 「적은 경우」)
 *   P3. 실비 미입력이면 비교 자체를 하지 않는다
 *   P4. **실가·상속·증여는 단서 대상 아님** — §97②1호 가산 또는 §163⑨ 의제
 *   P5. **NBL(배율초과)** 파트가 있어도 판정·배분이 성립한다
 *   P6. 12억 초과 비과세(1세대1주택)에서도 성립한다
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const rates = makeMockRates();
const TRANSFER_DATE = new Date("2024-03-01");
const TRANSFER_PRICE = 1_500_000_000;

/** 실측 가목 — 환산취득가 687,500,000 + 개산공제 6,600,000. */
const ANS_GAMOK = 694_100_000;
/** 발동시키는 나목. */
const NAMOK_FIRES = 800_000_000;
/** 미발동 나목. */
const NAMOK_NO_FIRE = 500_000_000;

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
    ...over,
  } as MixedUseAssetInput;
}

function run(over: Partial<MixedUseAssetInput> = {}) {
  const r = calcMixedUseTransferTax(TRANSFER_PRICE, TRANSFER_DATE, makeAsset(over), rates);
  const h = r.housingPart;
  const c = r.commercialPart;
  return {
    proviso: r.necessaryExpenseProviso,
    acqTotal: h.landAcqPrice + h.buildingAcqPrice + c.landAcqPrice + c.buildingAcqPrice,
    dedTotal:
      h.landAppraisalDed + h.buildingAppraisalDed + c.landAppraisalDed + c.buildingAppraisalDed,
    aggregateIncome: r.total.aggregateIncome,
    nblIncome: r.nonBusinessLandPart?.incomeAmount ?? null,
  };
}

describe("P1 — 가목 검산 · 발동", () => {
  it("가목 = 환산취득가 687,500,000 + 개산공제 6,600,000", () => {
    const r = run({ capitalExpenditure: NAMOK_NO_FIRE });
    expect(r.proviso?.estimatedSide).toBe(ANS_GAMOK);
    expect(r.acqTotal).toBe(687_500_000);
    expect(r.dedTotal).toBe(6_600_000);
  });

  it("🔴 나목 > 가목이면 취득가액 슬롯이 **0**이 되고 필요경비 = 나목", () => {
    const r = run({ capitalExpenditure: NAMOK_FIRES });
    expect(r.proviso).toEqual({
      estimatedSide: ANS_GAMOK,
      directSide: NAMOK_FIRES,
      chosen: "direct",
    });
    expect(r.acqTotal).toBe(0);
    expect(r.dedTotal).toBe(NAMOK_FIRES);
  });

  it("🔴 세액이 실제로 달라진다", () => {
    const noFire = run({ capitalExpenditure: NAMOK_NO_FIRE });
    const fired = run({ capitalExpenditure: NAMOK_FIRES });
    expect(fired.aggregateIncome).not.toBe(noFire.aggregateIncome);
  });

  it("자본적지출 + 양도비 **합계**로 겨룬다", () => {
    const r = run({ capitalExpenditure: 400_000_000, transferExpense: 400_000_000 });
    expect(r.proviso?.directSide).toBe(800_000_000);
    expect(r.proviso?.chosen).toBe("direct");
  });
});

describe("P2·P3 — 경계와 진입", () => {
  it("🔴 **동률은 본문**이다 — 단서는 「적은 경우」로 명시한다", () => {
    const r = run({ capitalExpenditure: ANS_GAMOK });
    expect(r.proviso?.directSide).toBe(ANS_GAMOK);
    expect(r.proviso?.chosen).toBe("estimated");
    expect(r.acqTotal).toBe(687_500_000); // 취득가액 그대로
  });

  it("실비 미입력이면 비교 자체를 하지 않는다", () => {
    const r = run();
    expect(r.proviso).toBeUndefined();
    expect(r.dedTotal).toBe(6_600_000); // 개산공제 유지
  });
});

/**
 * P4 — 단서는 「**환산취득가액**으로 하는 경우」 한정이다.
 * 실가는 §97②**1호**(가산), 상속·증여는 §163⑨ 의제라 대상이 아니다.
 */
describe("P4 — 환산 경로 전용", () => {
  it("🔴 실가(useActualAcquisition) — 아무리 큰 나목도 단서를 깨우지 않는다", () => {
    const r = run({
      useActualAcquisition: true,
      acquisitionActualTotalPrice: 500_000_000,
      capitalExpenditure: 10_000_000_000,
    });
    expect(r.proviso).toBeUndefined();
    expect(r.acqTotal).toBeGreaterThan(0);
  });

  it("🔴 상속(acquisitionByInheritance) — 단서 대상 아님", () => {
    const r = run({
      acquisitionByInheritance: true,
      housingInheritedValue: 200_000_000,
      commercialInheritedValue: 100_000_000,
      capitalExpenditure: 10_000_000_000,
    });
    expect(r.proviso).toBeUndefined();
  });
});

describe("P5·P6 — NBL·12억과 공존한다", () => {
  it("🔴 배율초과(NBL) 파트가 있어도 판정·배분이 성립한다", () => {
    const fired = run({ totalLandArea: 1000, capitalExpenditure: 2_000_000_000 });
    expect(fired.proviso?.chosen).toBe("direct");
    expect(fired.acqTotal).toBe(0);
    expect(fired.dedTotal).toBe(2_000_000_000);
    // NBL 파트가 살아 있어야 한다 — 0이 되면 파생이 끊긴 것이다.
    expect(fired.nblIncome).not.toBeNull();
  });

  it("1세대1주택(12억 초과 비과세)에서도 성립한다", () => {
    const fired = run({ isOneHouseExempt: true, capitalExpenditure: NAMOK_FIRES });
    expect(fired.proviso?.chosen).toBe("direct");
    expect(fired.acqTotal).toBe(0);
  });

  it("다주택(비과세 미적용)에서도 성립한다 — 12억 안분 유무와 무관", () => {
    const fired = run({ isOneHouseExempt: false, capitalExpenditure: NAMOK_FIRES });
    expect(fired.proviso?.chosen).toBe("direct");
    expect(fired.acqTotal).toBe(0);
  });
});
