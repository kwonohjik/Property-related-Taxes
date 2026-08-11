/**
 * anchor: 부담부증여 K-4 필요경비 — **성질별 안분 시점** (W-5, 2026-08-07)
 *
 * ── 법령 근거 ────────────────────────────────────────────────────────────
 * 「소득세법」 제100조 제2항 **후문**: 「이 경우 **공통되는 취득가액과 양도비용**은 **해당 자산의
 * 가액에 비례하여** 안분계산한다」. 같은 항 **본문**이 그 가액의 기준시점을 「**취득 또는 양도
 * 당시의** 기준시가」로 나란히 들므로, **어디에 부수하는 지출인지**가 시점을 정한다.
 *
 *   · 자본적지출(§97①2호) → **취득시** 기준시가 비율
 *   · 양도비(§97①3호)     → **양도시** 기준시가 비율
 *
 * 실가 비-부담부 경로는 2026-08-07(P-2)에 이미 이렇게 갈라 놓았다
 * (`general-building-route-actual.ts` `apportionExpenses`). **부담부증여 K-4만 미반영**이었다
 * — 둘을 합쳐 취득시 비율 **하나로** 나눴다(`burdened-gift-apportionment.ts` STEP 5).
 *
 * ⚠️ **총액은 안 움직인다.** 채무비율 안분은 합계에 한 번 걸고 잔액을 흡수시키므로
 *    `land + building`은 불변이고, 바뀌는 것은 **토지↔건물 배분**뿐이다.
 *    ⇒ 토지·건물 **세율이 같으면 세액도 불변**이다. 세율이 갈릴 때만 세액이 움직인다
 *      (아래 「미등기」 케이스 — 실측 **82,239원**).
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

/** 두 시점 비율이 **실제로 다르다** — 같으면 이 계약 전체가 무의미해진다. */
const LAND_RATIO_AT_ACQ = (LAND_AREA * A_LAND) / (LAND_AREA * A_LAND + A_BLDG);      // ≈ 0.8652
const LAND_RATIO_AT_TRANSFER = (LAND_AREA * T_LAND) / (LAND_AREA * T_LAND + T_BLDG); // ≈ 0.9264

const EXPENSE = 40_000_000;

const infoK4: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_market",
  acquisitionMethod: "actual",
  marketValueAtTransfer: LAND_AREA * T_LAND + T_BLDG,
  actualLandAcquisitionPrice: 2_000_000_000,
  actualBuildingAcquisitionPrice: 500_000_000,
  lendingDepositTotal: 1_000_000_000,
  mortgageDebtAmount: 3_120_000_000,
  annualRentTotal: 130_000_000,
  landStdPriceAtTransfer: LAND_AREA * T_LAND,
  buildingStdPriceAtTransfer: T_BLDG,
  landStdPriceAtAcquisition: LAND_AREA * A_LAND,
  buildingStdPriceAtAcquisition: A_BLDG,
  donorRelation: "lineal_descendant",
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
    unapprovedBuilding: false,
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
  const exps = r.apportionment.apportioned.map((a) => ({
    kind: a.assetKind,
    label: a.assetLabel,
    exp: a.allocatedExpenses,
  }));
  const landTotal = exps.filter((e) => e.kind === "land").reduce((s, e) => s + e.exp, 0);
  const buildingTotal = exps.filter((e) => e.kind === "building").reduce((s, e) => s + e.exp, 0);
  return { landTotal, buildingTotal, tax: r.aggregated.determinedTax };
}

describe("전제 — 두 시점 비율이 다르다", () => {
  it("취득시 ≠ 양도시 (이게 같으면 아래 계약이 전부 공허해진다)", () => {
    expect(LAND_RATIO_AT_ACQ).not.toBeCloseTo(LAND_RATIO_AT_TRANSFER, 3);
    expect(LAND_RATIO_AT_ACQ).toBeLessThan(LAND_RATIO_AT_TRANSFER);
  });
});

describe("W-5 — 자본적지출은 취득시 · 양도비는 양도시 비율", () => {
  it("🔴 자본적지출 전액 → **취득시** 비율로 토지에 배분된다", () => {
    const r = run({ capitalExpenditure: EXPENSE });
    const total = r.landTotal + r.buildingTotal;
    expect(r.landTotal / total).toBeCloseTo(LAND_RATIO_AT_ACQ, 5);
  });

  it("🔴 양도비 전액 → **양도시** 비율로 토지에 배분된다", () => {
    const r = run({ transferExpense: EXPENSE });
    const total = r.landTotal + r.buildingTotal;
    expect(r.landTotal / total).toBeCloseTo(LAND_RATIO_AT_TRANSFER, 5);
  });

  it("🔴 같은 총액이라도 성질이 다르면 배분이 다르다 — 합치면 이 계약이 죽는다", () => {
    const capexOnly = run({ capitalExpenditure: EXPENSE });
    const transferOnly = run({ transferExpense: EXPENSE });
    expect(capexOnly.landTotal).not.toBe(transferOnly.landTotal);
    // 양도시 비율이 더 크므로 양도비 쪽이 토지에 더 간다.
    expect(transferOnly.landTotal).toBeGreaterThan(capexOnly.landTotal);
  });

  it("총액 보존 — 성질을 어떻게 나눠도 land + building 합계는 같다", () => {
    const capexOnly = run({ capitalExpenditure: EXPENSE });
    const transferOnly = run({ transferExpense: EXPENSE });
    const mixed = run({ capitalExpenditure: 30_000_000, transferExpense: 10_000_000 });
    const sum = (r: { landTotal: number; buildingTotal: number }) => r.landTotal + r.buildingTotal;
    expect(sum(capexOnly)).toBe(sum(transferOnly));
    expect(sum(mixed)).toBe(sum(capexOnly));
  });
});

/**
 * 🔑 **세액으로도 잰다.** 배분만 바뀌면 「표시만 달라진 것 아니냐」는 반문이 가능하다.
 * 토지·건물 **세율이 갈리는** 구성에서는 세액이 실제로 움직인다.
 *
 * 허가·사용승인 미이행(「지방세법 시행령」 §101① 단서) — 토지가 전부 비사업용초과분 카드로
 * 떨어져 토지·건물 세율이 갈린다.
 *
 * ⚠️ **§104③ 미등기양도자산이 아니다.** 종전 주석이 「미등기(§104③)」라고 적고 플래그 이름도
 *    `isUnregistered`였으나 실제로 타는 것은 NBL 배율 판정(`judgeAppurtenantLandExcess`)이다.
 *    2026-08-11 개명으로 드러났다 — payload가 `as` 캐스팅이라 타입이 잡아주지 않았다.
 * 실측: 종전(둘 다 취득시) **1,031,095,740** → 현행 **1,031,013,501** = **82,239원** 차이.
 */
describe("W-5 — 세율이 갈리면 세액이 움직인다", () => {
  const ANS_UNAPPROVED_TAX = 1_031_013_501;

  it("🔴 허가·사용승인 미이행 케이스 — 결정세액이 성질별 안분에 반응한다", () => {
    const r = run({ unapprovedBuilding: true, capitalExpenditure: 30_000_000, transferExpense: 10_000_000 });
    expect(r.tax).toBe(ANS_UNAPPROVED_TAX);
  });

  it("세율이 같은 기본 케이스에서는 세액이 불변 — 총액 보존의 귀결", () => {
    const capexOnly = run({ capitalExpenditure: EXPENSE });
    const transferOnly = run({ transferExpense: EXPENSE });
    expect(capexOnly.tax).toBe(transferOnly.tax);
  });
});
