/**
 * Pre-Do anchor — O-1 §97②2호 단서 swap의 **파트 단위화** (2026-08-05)
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md` §10
 * 이 파일은 **구현 전에** 작성돼 현행에서 실패한다(정책 `feedback_pre_anchor_verification`).
 *
 * ## 조문 근거 (KoreanLaw 원문 확인 — 2026-08-05)
 *
 * 「소득세법」 제97조 제2항 제2호 **본문**:
 *   "...의 금액에 **자산별로** 대통령령으로 정하는 금액을 더한 금액"
 * 같은 호 **가목**: "제1항제1호나목에 따른 환산취득가액과 **본문 중** 대통령령으로 정하는 금액의 합계액"
 *   ⇒ 가목은 본문의 **자산별** 개산공제를 품으므로 가목 자체가 자산별로 산출된다.
 * 「소득세법 시행령」 제163조 제6항: **1호 토지**(개별공시지가×3/100) · **2호 건물**(기준시가×3/100)
 *   ⇒ 토지와 건물이 **별개 호**로 각각 다른 기준을 쓴다 = 「자산별」의 단위가 파트다.
 * 같은 호 **단서** 요건: "제1항제1호나목에 따라 **취득가액을 환산취득가액으로 하는 경우**"
 *   ⇒ 혼합 모드(토지 실가 + 건물 환산)에서 단서 요건을 충족하는 것은 **건물 파트뿐**이다.
 *      자산총액 1회 판정은 실가 토지까지 단서에 끌어들여 요건에 반한다.
 *
 * 예규·심판례는 이 쟁점에 **0건**이다(조세심판원 8건은 모두 「환산 시 자본적지출 추가공제 불가」
 * = 택일 쟁점으로, 비교 단위를 다루지 않는다).
 *
 * ## 고정 계약
 *   A-13  파트별 자본적지출이 입력되면 **파트별로** 가목↔나목을 비교한다
 *   A-14  실가 파트의 자본적지출은 그 파트 필요경비에 **가산**된다 (§97②1호 — 택일 아님)
 *   A-15  두 파트 모두 환산 + 자산 단위 입력이면 **현행 자산총액 판정 유지** (회귀 0)
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import {
  buildGeneralBuildingAssetCards,
  type AssetCardForAggregate,
} from "@/lib/tax-engine/general-building-valuation";
import { resolveGeneralBuildingSwap } from "@/lib/tax-engine/general-building-swap";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../_helpers/mock-rates";

const RATES = makeMockRates();

const LAND_ACQ = "1999-05-24";
const TRANSFER = "2026-02-16";
const TOTAL_TRANSFER = 2_000_000_000;

/**
 * 계획서 §1.3·O-1 probe와 **같은 fixture**다. 실측 카드값(2026-08-05):
 *   토지  환산취득가 505,748,404 · 개산공제 7,140,000 → 가목 512,888,404
 *   건물  환산취득가   5,980,729 · 개산공제    84,434 → 가목   6,065,163
 */
function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    useEstimatedAcquisition: true,
    acquisitionDate: LAND_ACQ,
    landAcquisitionDate: LAND_ACQ,
    hasSeperateLandAcquisitionDate: false,
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "180.96",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "2814470",
    gbZoneType: "commercial",
    ...over,
  } as AssetForm;
}

function cardsOf(asset: AssetForm): AssetCardForAggregate[] {
  const payload = buildGeneralBuildingValuation(asset) as Record<string, unknown>;
  return buildGeneralBuildingAssetCards({
    ...payload,
    totalTransferPrice: TOTAL_TRANSFER,
    transferDate: new Date(TRANSFER),
    acquisitionDate: new Date(asset.acquisitionDate),
    landAcquisitionDate: new Date(asset.landAcquisitionDate || asset.acquisitionDate),
    ownershipRatio: 1,
  } as never).assetCards;
}

const LAND_GAMOK = 512_888_404;
const BUILDING_GAMOK = 6_065_163;

/** 폼 → API 변환 → route helper 전 경로. A-16이 쓰는 end-to-end 구동부. */
function dispatchMixed(payload: Record<string, unknown>, asset: AssetForm) {
  return dispatchGeneralBuilding(
    payload,
    TOTAL_TRANSFER,
    new Date(TRANSFER),
    new Date(asset.acquisitionDate),
    400_000_000,
    0,
    2026,
    undefined,
    [],
    RATES,
    undefined,
    undefined,
    undefined,
  );
}

describe("A-13 — 파트별 자본적지출 입력 시 파트 단위 판정", () => {
  it("토지 나목 < 토지 가목 · 건물 나목 > 건물 가목 → **건물만** swap", () => {
    const cards = cardsOf(gbAsset());
    // 토지 100,000,000 < 512,888,404(가목) → 미발동
    // 건물  20,000,000 >   6,065,163(가목) → 발동
    const swap = resolveGeneralBuildingSwap(cards, undefined, undefined, {
      land: { direct: 100_000_000, mode: "estimated" },
      building: { direct: 20_000_000, mode: "estimated" },
    });

    expect(swap.allocation.get("building")).toBe(20_000_000);
    expect(swap.allocation.has("land")).toBe(false); // 토지는 본문 유지
    expect(swap.swapApplied).toBe(true);
  });

  it("파트별 가목은 그 파트 카드만 합산한다 — 상대 파트를 섞지 않는다", () => {
    const cards = cardsOf(gbAsset());
    const swap = resolveGeneralBuildingSwap(cards, undefined, undefined, {
      land: { direct: 100_000_000, mode: "estimated" },
      building: { direct: 20_000_000, mode: "estimated" },
    });

    expect(swap.perPart?.land?.estimatedSide).toBe(LAND_GAMOK);
    expect(swap.perPart?.building?.estimatedSide).toBe(BUILDING_GAMOK);
  });

  it("🔴 자산총액 판정으로는 **미발동**이던 구간이 파트별로는 발동한다", () => {
    const cards = cardsOf(gbAsset());
    // 자산총액: 나목 300,000,000 < 가목 518,953,567 → 미발동
    const asTotal = resolveGeneralBuildingSwap(cards, 300_000_000, 0);
    expect(asTotal.swapApplied).toBe(false);

    // 파트별(같은 총액을 §100② 후문 가액 비례로 귀속): 건물 6,575,614 > 6,065,163 → 건물만 발동
    const asParts = resolveGeneralBuildingSwap(cards, undefined, undefined, {
      land: { direct: 293_424_386, mode: "estimated" },
      building: { direct: 6_575_614, mode: "estimated" },
    });
    expect(asParts.swapApplied).toBe(true);
    expect(asParts.allocation.get("building")).toBe(6_575_614);
    expect(asParts.allocation.has("land")).toBe(false);
  });

  it("동률은 본문 — 단서는 「적은 경우」다", () => {
    const cards = cardsOf(gbAsset());
    const swap = resolveGeneralBuildingSwap(cards, undefined, undefined, {
      building: { direct: BUILDING_GAMOK, mode: "estimated" },
    });
    expect(swap.allocation.has("building")).toBe(false);
    expect(swap.swapApplied).toBe(false);
  });
});

describe("A-14 — 실가 파트의 자본적지출은 가산이다 (§97②1호)", () => {
  /**
   * 혼합 모드(토지 실가 + 건물 환산). 실가 파트는 §97②**1호**라 택일 대상이 아니다 —
   * 「해당 실지거래가액 + 제1항제2호·제3호의 금액」이므로 자본적지출은 **그대로 가산**된다.
   * 현행은 실가 파트 카드의 expenses가 0이라 이 금액이 어디에도 반영되지 않는다.
   */
  const MIXED = gbAsset({
    landAcqMode: "actual",
    buildingAcqMode: "estimated",
    landAcquisitionPrice: "400000000",
  } as Partial<AssetForm>);

  it("실가 파트 카드는 개산공제가 0이다 — §163⑥은 나목 전용", () => {
    const cards = cardsOf(MIXED);
    const land = cards.find((c) => c.propertyType === "land");
    expect(land?.usedEstimatedAcquisition).toBe(false);
    expect(land?.estimatedDeduction).toBe(0);
  });

  it("🔴 실가 파트의 자본적지출은 `addition`으로 **가산**된다 (택일 아님)", () => {
    const cards = cardsOf(MIXED);
    const swap = resolveGeneralBuildingSwap(cards, undefined, undefined, {
      land: { direct: 30_000_000, mode: "actual" },
      building: { direct: 1_000_000, mode: "estimated" },
    });
    // 실가 토지는 §97②1호 — 취득가액 차감 + 자본적지출 가산.
    expect(swap.addition.get("land")).toBe(30_000_000);
    // 택일(allocation)에는 절대 들어가지 않는다.
    expect(swap.allocation.has("land")).toBe(false);
  });

  it("실가 파트는 나목이 아무리 커도 swap 발동하지 않는다 — 단서 요건 미충족", () => {
    const cards = cardsOf(MIXED);
    const swap = resolveGeneralBuildingSwap(cards, undefined, undefined, {
      land: { direct: 9_999_999_999, mode: "actual" },
      building: { direct: 1, mode: "estimated" },
    });
    expect(swap.allocation.has("land")).toBe(false);
    expect(swap.allocation.has("land_business")).toBe(false);
    expect(swap.allocation.has("land_nbl")).toBe(false);
    // 그래도 가산은 된다.
    expect(swap.addition.get("land")).toBe(9_999_999_999);
  });

  it("환산 파트는 `addition`에 들어가지 않는다 — 택일이 그 파트의 규칙이다", () => {
    const cards = cardsOf(MIXED);
    const swap = resolveGeneralBuildingSwap(cards, undefined, undefined, {
      land: { direct: 30_000_000, mode: "actual" },
      building: { direct: 1_000_000, mode: "estimated" }, // 가목보다 작아 본문 유지
    });
    expect(swap.addition.has("building")).toBe(false);
    expect(swap.allocation.has("building")).toBe(false);
  });
});

describe("A-16 — 혼합 모드 end-to-end (엔진 전 경로)", () => {
  /**
   * 이 anchor가 O-1의 실제 증명이다 — 파트별 자본적지출이 **API payload → 엔진 → 세액**까지
   * 도달하는지 본다. 종전에는 실가 파트의 자본적지출이 어디에도 반영되지 않았다
   * (환산 경로 카드 `expenses`는 개산공제뿐이고, 실가 파트는 그 값이 0이었다).
   */
  function runMixed(landCapex?: number) {
    const asset = gbAsset({
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: "400000000",
      ...(landCapex ? { landDirectExpenses: String(landCapex) } : {}),
    } as Partial<AssetForm>);
    const payload = buildGeneralBuildingValuation(asset) as Record<string, unknown>;
    return { payload, result: dispatchMixed(payload, asset) };
  }

  it("파트별 자본적지출이 payload에 실린다 (침묵 drop 없음)", () => {
    const { payload } = runMixed(30_000_000);
    expect(payload.landDirectExpenses).toBe(30_000_000);
  });

  it("🔴 실가 파트 자본적지출이 세액을 **줄인다** — 종전에는 무시됐다", () => {
    const without = runMixed().result;
    const withCapex = runMixed(30_000_000).result;
    expect(withCapex.aggregated.totalTax).toBeLessThan(without.aggregated.totalTax);
  });

  it("환산 파트 단독 자본적지출은 택일이라 가목보다 작으면 세액 불변", () => {
    const base = runMixed().result;
    const asset = gbAsset({
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: "400000000",
      buildingDirectExpenses: "1000000", // 건물 가목 6,065,163보다 작다 → 본문 유지
    } as Partial<AssetForm>);
    const payload = buildGeneralBuildingValuation(asset) as Record<string, unknown>;
    expect(dispatchMixed(payload, asset).aggregated.totalTax).toBe(base.aggregated.totalTax);
  });
});

describe("A-15 — 자산 단위 입력은 현행 유지 (회귀 0)", () => {
  it("파트별 입력이 없으면 자산총액 판정 그대로다", () => {
    const cards = cardsOf(gbAsset());
    const swap = resolveGeneralBuildingSwap(cards, 700_000_000, 0);
    expect(swap.swapApplied).toBe(true);
    expect(swap.estimatedSideTotal).toBe(518_953_567);
    expect(swap.directSide).toBe(700_000_000);
    // 두 카드에 estimatedSide 비율 배분 + 마지막 카드 잔액 흡수 → Σ = directSide
    const sum = [...swap.allocation.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(700_000_000);
    expect(swap.perPart).toBeUndefined(); // 파트별 판정이 아니다
  });

  it("파트별 입력이 없고 자산총액도 없으면 swap 없음", () => {
    const cards = cardsOf(gbAsset());
    const swap = resolveGeneralBuildingSwap(cards, undefined, undefined);
    expect(swap.swapApplied).toBe(false);
    expect(swap.allocation.size).toBe(0);
  });
});

/**
 * A-19 — 양도비(§97①3호)가 나목에 포함된다 (2026-08-06 취득가액 리뷰 FAIL 1 회귀 가드)
 *
 * §97②2호 **나목**은 「제1항제2호 **및** 제3호에 따른 금액의 **합계액**」이고, 같은 항 **1호**도
 * 「해당 실지거래가액 + 제1항제2호 및 제3호의 금액」이다 — 두 갈래 모두 자본적지출과 양도비를
 * **함께** 요구한다. 종전 구현은 파트 축으로 전환되는 순간 `transferExpense`를 인자에서 받지도
 * 않아 **양도비가 전액 소실**됐다(리뷰 실측: 1억원 입력에도 세액 delta 0).
 *
 * 양도비를 파트로 나누는 근거는 「소득세법」 제100조 제2항 **후문**이다 —
 * 「**공통되는** 취득가액과 **양도비용**은 해당 자산의 가액에 비례하여 안분계산한다」.
 * 자본적지출과 달리 양도비용은 **명문 열거**돼 있어 가액 비례 안분에 근거가 있다.
 */
describe("A-19 — 양도비가 나목에 포함된다", () => {
  it("🔴 파트 축에서도 양도비가 나목에 더해진다 — 종전엔 소실됐다", () => {
    const cards = cardsOf(gbAsset());
    const swap = resolveGeneralBuildingSwap(cards, undefined, 100_000_000, {
      land: { direct: 0, mode: "estimated" },
      building: { direct: 0, mode: "estimated" },
      transferExpense: 100_000_000,
    });
    // 가액 비례 안분 — 토지 1,956,162,578 / 건물 43,837,422 (총 20억)
    const land = swap.perPart!.land!.directSide;
    const building = swap.perPart!.building!.directSide;
    expect(land + building).toBe(100_000_000); // 잔액 흡수 불변식
    expect(land).toBeGreaterThan(building); // 토지 가액이 압도적으로 크다
  });

  it("건물 양도비 안분분이 건물 가목을 넘으면 건물만 swap 발동", () => {
    const cards = cardsOf(gbAsset());
    // 건물 안분분 ≈ 100,000,000 × 43,837,422/2,000,000,000 ≈ 2,191,871 < 6,065,163 → 미발동
    const small = resolveGeneralBuildingSwap(cards, undefined, 100_000_000, {
      building: { direct: 0, mode: "estimated" },
      transferExpense: 100_000_000,
    });
    expect(small.swapApplied).toBe(false);

    // 자본적지출 5,000,000을 더하면 나목 > 가목 → 발동
    const big = resolveGeneralBuildingSwap(cards, undefined, 100_000_000, {
      building: { direct: 5_000_000, mode: "estimated" },
      transferExpense: 100_000_000,
    });
    expect(big.swapApplied).toBe(true);
    expect(big.allocation.get("building")).toBe(big.perPart!.building!.directSide);
  });

  it("🔴 end-to-end — 양도비가 **세액에 도달**한다 (원단위 고정)", () => {
    const mixed = {
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: "400000000",
      landDirectExpenses: "30000000",
    } as Partial<AssetForm>;
    const without = gbAsset(mixed);
    const withTE = gbAsset({ ...mixed, transferExpense: "100000000" } as Partial<AssetForm>);

    const noTax = dispatchMixed(
      buildGeneralBuildingValuation(without) as Record<string, unknown>,
      without,
    ).aggregated.totalTax;
    const yesTax = dispatchMixed(
      buildGeneralBuildingValuation(withTE) as Record<string, unknown>,
      withTE,
    ).aggregated.totalTax;

    // 리뷰가 측정한 pre-fix 값은 **양도비 유무와 무관하게** 468,131,921원이었다(delta 0).
    expect(noTax).toBe(468_131_921);
    expect(yesTax).toBe(434_241_404);
    expect(noTax - yesTax).toBe(33_890_517);
  });

  it("실가 파트의 가산액에도 양도비 안분분이 포함된다 (§97②1호)", () => {
    const cards = cardsOf(
      gbAsset({
        landAcqMode: "actual",
        buildingAcqMode: "estimated",
        landAcquisitionPrice: "400000000",
      } as Partial<AssetForm>),
    );
    const swap = resolveGeneralBuildingSwap(cards, undefined, 100_000_000, {
      land: { direct: 30_000_000, mode: "actual" },
      transferExpense: 100_000_000,
    });
    // 토지 가산액 = 자본적지출 30,000,000 + 토지 양도비 안분분
    expect(swap.addition.get("land")).toBe(swap.perPart!.land!.directSide);
    expect(swap.addition.get("land")!).toBeGreaterThan(30_000_000);
  });
});

/**
 * A-20 — 감정가액·매매사례가액 파트는 §97②2호 **본문**뿐이다
 * (2026-08-06 취득가액 리뷰 FAIL 2 회귀 가드)
 *
 * 본문은 「제1항제1호나목의 금액 + 자산별 개산공제」로 **제1항제2호·제3호를 포함하지 않는다**.
 * 따라서 그 파트의 자본적지출·양도비는 택일(`allocation`)에도, 가산(`addition`)에도 들어가지
 * 않는다(개산공제는 카드에 이미 실려 있다 — `general-building-part-acq.ts`의 `!== "actual"`).
 *
 * 종전 구현은 `usedEstimatedAcquisition`(boolean)만으로 갈래를 갈라 「환산 아님」인 감정·매매사례를
 * 실가와 함께 묶어 **가산**시켰다. 리뷰 실측: 감정 토지 + 자본적지출 5천만원에서
 * 476,052,911원 → 458,727,911원(17,325,000원 부당 감소).
 *
 * ⚠️ 현재 UI 라디오는 실거래가·환산 2종만 노출하지만 Zod는 4종을 허용한다(`transfer-tax-schema.ts`).
 *    UI 확장 시 즉시 활성화되는 잠복 결함이므로 여기서 봉인한다.
 */
describe("A-20 — 감정·매매사례 파트는 본문만 적용", () => {
  const APPRAISAL_LAND = gbAsset({
    landAcqMode: "appraisal",
    buildingAcqMode: "estimated",
    landAcquisitionPrice: "300000000",
  } as Partial<AssetForm>);

  it("🔴 감정가액 파트의 자본적지출은 `addition`에 들어가지 않는다", () => {
    const cards = cardsOf(APPRAISAL_LAND);
    const swap = resolveGeneralBuildingSwap(cards, undefined, undefined, {
      land: { direct: 50_000_000, mode: "appraisal" },
      building: { direct: 0, mode: "estimated" },
    });
    expect(swap.addition.has("land")).toBe(false);
    expect(swap.allocation.has("land")).toBe(false);
    expect(swap.perPart?.land?.directSide).toBe(0);
  });

  it("매매사례가액 파트도 같다", () => {
    const cards = cardsOf(APPRAISAL_LAND);
    const swap = resolveGeneralBuildingSwap(cards, undefined, undefined, {
      land: { direct: 50_000_000, mode: "salesCase" },
    });
    expect(swap.addition.has("land")).toBe(false);
    expect(swap.allocation.has("land")).toBe(false);
  });

  it("감정 파트에는 양도비 안분분도 반영되지 않는다 — 본문에 제3호가 없다", () => {
    const cards = cardsOf(APPRAISAL_LAND);
    const swap = resolveGeneralBuildingSwap(cards, undefined, 100_000_000, {
      land: { direct: 0, mode: "appraisal" },
      transferExpense: 100_000_000,
    });
    expect(swap.addition.has("land")).toBe(false);
    expect(swap.perPart?.land?.directSide).toBe(0);
  });

  it("감정 파트도 개산공제는 받는다 — §163⑥의 「그 밖의 경우」", () => {
    const cards = cardsOf(APPRAISAL_LAND);
    const land = cards.find((c) => c.propertyType === "land");
    expect(land?.estimatedDeduction).toBeGreaterThan(0);
  });
});
