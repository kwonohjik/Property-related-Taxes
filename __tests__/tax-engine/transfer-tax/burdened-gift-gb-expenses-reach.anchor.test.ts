/**
 * anchor: 부담부증여 + 일반건물 — **필요경비 도달**과 **평가모드별 소비 여부** (W-4, 2026-08-07)
 *
 * ── 법령 근거 (「소득세법」 제97조 제2항 원문 — 법제처 DRF 조회) ───────────────────
 *   **1호** 「취득가액을 **실지거래가액**에 의하는 경우의 필요경비는 다음 각 목의 금액에
 *          **제1항제2호 및 제3호의 금액을 더한 금액**으로 한다.」
 *          ⇒ K-4(실지취득가)에서는 자본적지출·양도비가 **반드시 도달해야 한다**.
 *   **2호** 「**그 밖의 경우**의 필요경비는 … **자산별로 대통령령으로 정하는 금액**을 더한 금액.」
 *          (= 개산공제 「소득세법 시행령」 제163조 제6항)
 *          ⇒ K-1~K-3(기준시가)·K-5(환산)에서 두 비용이 **안 쓰이는 것이 정본**이다.
 *
 * 🔴 **고쳐진 결함**: K-4에서 `actualExpenses`(legacy `directExpenses` 유래)만 읽어
 *    신규 두 칸을 무시했다. `route.ts`가 두 값을 합쳐 주는 데 의존했던 것인데,
 *    그 `route.ts`는 반대로 **legacy를 보지 않았다** ⇒ legacy 칸만 채운 입력에서
 *    필요경비가 **0으로 소실**됐다(실측 결정세액 **6,049,763원 과대**).
 *
 * ⚠️ **세액으로 잰다.** 「payload에 값이 있는가」로 재면 소비하지 않는 결함을 놓친다(P-1 교훈).
 *
 * 배관(route.ts) 쪽 계약은 `__tests__/api/transfer.route.burdened-gift-gb-expenses.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const rates = makeMockRates();

const LAND_AREA = 1279;
const T_LAND = 6_215_000;
const A_LAND = 2_130_000;
const T_BLDG = 631_846_500;
const A_BLDG = 424_472_064;

/** 비용 4,000만원을 자본적지출 3,000만 + 양도비 1,000만으로 나눠 넣는다. */
const CAPEX = 30_000_000;
const TRANSFER_EXP = 10_000_000;
const LEGACY_TOTAL = 40_000_000;

/** 정답값 — 채무비율 안분 후 취득시 기준시가 비율로 자산 분배(§159①1호 본문 + §166⑥). */
const ANS_LAND_EXP = 16_616_550;
const ANS_BUILDING_EXP = 2_589_047;
const ANS_TAX_WITH_EXPENSE = 846_575_027;
const ANS_TAX_NO_EXPENSE = 852_624_790;
/** 비용 4,000만이 결정세액에 주는 영향 — 이 값이 0이 되면 계약이 죽은 것이다. */
const ANS_TAX_DELTA = 6_049_763;

const infoBase = {
  lendingDepositTotal: 1_000_000_000,
  mortgageDebtAmount: 3_120_000_000,
  annualRentTotal: 130_000_000,
  landStdPriceAtTransfer: LAND_AREA * T_LAND,
  buildingStdPriceAtTransfer: T_BLDG,
  landStdPriceAtAcquisition: LAND_AREA * A_LAND,
  buildingStdPriceAtAcquisition: A_BLDG,
  donorRelation: "lineal_descendant" as const,
};

/** K-4 = 시가 평가 + 실지취득가액 (§159①1호 본문). 개산공제 미적용. */
const infoK4: BurdenedGiftInfo = {
  ...infoBase,
  valuationMode: "sangjeungbeop_market",
  acquisitionMethod: "actual",
  marketValueAtTransfer: 8_580_831_500,
  actualLandAcquisitionPrice: 2_000_000_000,
  actualBuildingAcquisitionPrice: 500_000_000,
};

/** K-1~K-3 = 기준시가 평가 (§159①1호 A괄호). 개산공제 적용. */
const infoStandard: BurdenedGiftInfo = { ...infoBase, valuationMode: "sangjeungbeop_standard" };

/** K-5 = 시가 평가 + 환산취득가액 (§176의2②2호). 개산공제 적용. */
const infoK5: BurdenedGiftInfo = {
  ...infoBase,
  valuationMode: "sangjeungbeop_market",
  acquisitionMethod: "converted",
  marketValueAtTransfer: 8_580_831_500,
};

function run(over: Record<string, unknown> = {}) {
  const payload = {
    totalTransferPrice: 0,
    transferDate: new Date("2023-02-19"),
    acquisitionDate: new Date("1998-09-07"),
    landArea: LAND_AREA,
    buildingFootprintArea: 388.27,
    transferLandPricePerSqm: T_LAND,
    transferBuildingStdPrice: T_BLDG,
    zoneType: "general_residential",
    isMetropolitan: false,
    isUnregistered: false,
    actualAcquisitionPrice: 2_500_000_000,
    actualExpenses: 0,
    acquisitionLandPricePerSqm: A_LAND,
    acquisitionBuildingStdPrice: A_BLDG,
    burdenedGiftInfo: infoK4,
    ...over,
  };
  const r = calculateGeneralBuildingActualTransfer(
    payload as Parameters<typeof calculateGeneralBuildingActualTransfer>[0],
    2023, undefined, [], rates,
  );
  return {
    landExp: r.apportionment.apportioned.find((a) => a.assetKind === "land")?.allocatedExpenses,
    buildingExp: r.apportionment.apportioned.find((a) => a.assetKind === "building")?.allocatedExpenses,
    tax: r.aggregated.determinedTax,
  };
}

describe("W-1 — K-4(실지취득가): 자본적지출·양도비가 도달한다 (§97②1호)", () => {
  it("🔴 신규 두 칸이 세액을 움직인다 — payload 존재가 아니라 세액으로 잰다", () => {
    const none = run();
    const declared = run({ capitalExpenditure: CAPEX, transferExpense: TRANSFER_EXP });

    expect(none.tax).toBe(ANS_TAX_NO_EXPENSE);
    expect(declared.tax).toBe(ANS_TAX_WITH_EXPENSE);
    expect((none.tax ?? 0) - (declared.tax ?? 0)).toBe(ANS_TAX_DELTA);
  });

  it("자산별 안분액 — 채무비율 안분 후 취득시 기준시가 비율", () => {
    const r = run({ capitalExpenditure: CAPEX, transferExpense: TRANSFER_EXP });
    expect(r.landExp).toBe(ANS_LAND_EXP);
    expect(r.buildingExp).toBe(ANS_BUILDING_EXP);
  });

  it("🔴 legacy `directExpenses`(=actualExpenses)만 있어도 도달한다 — 후퇴 경로", () => {
    const r = run({ actualExpenses: LEGACY_TOTAL });
    expect(r.landExp).toBe(ANS_LAND_EXP);
    expect(r.tax).toBe(ANS_TAX_WITH_EXPENSE);
  });

  it("🔴 legacy + 신규가 같이 와도 **택일** — 이중계상 금지", () => {
    const both = run({
      actualExpenses: LEGACY_TOTAL,
      capitalExpenditure: CAPEX,
      transferExpense: TRANSFER_EXP,
    });
    // 합산(8,000만)이면 필요경비가 두 배가 되어 세액이 더 내려간다.
    expect(both.tax).toBe(ANS_TAX_WITH_EXPENSE);
    expect(both.landExp).toBe(ANS_LAND_EXP);
  });

  it("자본적지출만 / 양도비만 — 어느 한쪽만 와도 그 금액이 반영된다", () => {
    const capexOnly = run({ capitalExpenditure: LEGACY_TOTAL });
    const transferOnly = run({ transferExpense: LEGACY_TOTAL });
    // STEP 5는 두 성질을 합산해 한 슬롯에 담으므로 총액이 같으면 결과가 같다.
    expect(capexOnly.tax).toBe(ANS_TAX_WITH_EXPENSE);
    expect(transferOnly.tax).toBe(ANS_TAX_WITH_EXPENSE);
  });
});

/**
 * W-2 — **비-K-4는 개산공제가 정본**이다(§97②2호 「그 밖의 경우」).
 *
 * ⚠️ 이 계약은 「비용이 도달하지 않는다」를 **의도적으로** 고정한다. 계획서가 한때
 *    W-4를 「다른 평가모드에서도 비용이 미도달 = P-3과 같은 결함」으로 적었으나,
 *    §97②2호 원문 확인 결과 **절반이 틀린 서술**이었다. 여기를 「고치면」 법령 위반이다.
 */
describe("W-2 — 비-K-4(기준시가·환산): 개산공제만 적용 (§97②2호)", () => {
  it("K-1~K-3(기준시가) — 비용을 어떻게 넣어도 세액이 움직이지 않는다", () => {
    const none = run({ burdenedGiftInfo: infoStandard });
    const withExp = run({
      burdenedGiftInfo: infoStandard,
      actualExpenses: LEGACY_TOTAL,
      capitalExpenditure: CAPEX,
      transferExpense: TRANSFER_EXP,
    });
    expect(withExp.tax).toBe(none.tax);
    // 개산공제(취득시 기준시가 × 채무비율 × 3%)가 그대로 남아 있어야 한다 — 0이면 다른 결함이다.
    expect(none.landExp).toBeGreaterThan(0);
    expect(withExp.landExp).toBe(none.landExp);
  });

  it("K-5(환산취득가) — 비용을 어떻게 넣어도 세액이 움직이지 않는다", () => {
    const none = run({ burdenedGiftInfo: infoK5 });
    const withExp = run({
      burdenedGiftInfo: infoK5,
      actualExpenses: LEGACY_TOTAL,
      capitalExpenditure: CAPEX,
      transferExpense: TRANSFER_EXP,
    });
    expect(withExp.tax).toBe(none.tax);
    expect(none.landExp).toBeGreaterThan(0);
    expect(withExp.landExp).toBe(none.landExp);
  });
});
