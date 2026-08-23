/**
 * anchor: split(토지·건물 별개취득) 자산의 **양도비(§97①3호)가 파트에 안분된다** (F23)
 *
 * ## 무엇이 없었나
 *
 * `calcSplitGain`은 파트 칸(`landDirectExpenses`·`buildingDirectExpenses`)만 읽고
 * **자산 단위 `transferExpense`를 읽지 않았다**. 파트 양도비 칸은 저장소에 **존재하지 않으므로**
 * (grep 0건) 어떤 경로로도 반영이 불가능했다 — 「소득세법」 §97①3호의 필요경비가 조용히 사라진다.
 *
 * 실측(수정 전 · 아래 픽스처): 양도비 30,000,000을 넣어도 **실가·환산 두 모드 모두**
 * 양도차익·세액이 **한 원도 움직이지 않았다**.
 *
 * ## 근거 — §100② 후문
 *
 * > 이 경우 **공통되는 취득가액과 양도비용**은 해당 자산의 가액에 **비례하여 안분계산**한다
 *
 * 양도비용이 **명문 열거**돼 있어 안분이 법정이다(「자동 안분 fallback 금지」 대상이 아니다).
 * 일반건물 경로가 이미 같은 규칙을 쓴다(`general-building-swap.ts` `resolvePerPart`) —
 * 양도가액 비례 floor + **마지막 파트 잔액 흡수**.
 *
 * ⚠️ **자본적지출은 이 열거에 없다.** 자산 단위 자본적지출은 안분하지 않고 파트 칸으로 안내한다
 *    (`transfer-tax-validate-split.ts` ④ · anchor `split-asset-capex-block-f23.anchor.test.ts`).
 *
 * ## 안전망은 0건이었다
 *
 * 착수 전 「양도비를 통째로 토지 파트에 얹는」 변이를 넣고 전체 회귀를 돌렸더니
 * **613파일 6,756테스트가 전건 통과**했다 — 이 축을 보는 테스트가 하나도 없었다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const LAND_TRANSFER = 900_000_000;
const BUILDING_TRANSFER = 600_000_000;
/** 양도가액 비례 = 900/1500 = 60% */
const TRANSFER_EXPENSE = 30_000_000;
const EXPECTED_LAND_SHARE = 18_000_000;
const EXPECTED_BUILDING_SHARE = TRANSFER_EXPENSE - EXPECTED_LAND_SHARE; // 잔액 흡수

function splitAsset(
  mode: "actual" | "estimated",
  over: Partial<TransferTaxInput> = {},
): TransferTaxInput {
  const est = mode === "estimated";
  return {
    ...baseTransferInput(),
    propertyType: "building",
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2015-03-01"),
    landAcquisitionDate: D("2012-01-01"),
    isSeparateAcquisition: true,
    transferPrice: LAND_TRANSFER + BUILDING_TRANSFER,
    acquisitionPrice: est ? 0 : 1_000_000_000,
    landTransferPrice: LAND_TRANSFER,
    buildingTransferPrice: BUILDING_TRANSFER,
    landStandardPriceAtTransfer: LAND_TRANSFER,
    buildingStandardPriceAtTransfer: BUILDING_TRANSFER,
    standardPricePerSqmAtAcquisition: 1_500_000,
    acquisitionArea: 200,
    buildingStandardPriceAtAcquisition: 200_000_000,
    ...(est
      ? {
          useEstimatedAcquisition: true,
          landAcqMode: "estimated" as const,
          buildingAcqMode: "estimated" as const,
        }
      : {
          landAcquisitionPrice: 600_000_000,
          buildingAcquisitionPrice: 400_000_000,
          landAcqMode: "actual" as const,
          buildingAcqMode: "actual" as const,
        }),
    isOneHousehold: false,
    householdHousingCount: 0,
    ...over,
  } as TransferTaxInput;
}

describe("F23 · split 양도비 §100② 후문 안분", () => {
  it("F23-01: 실가 파트 — 양도비가 양도가액 비례로 안분되어 각 파트에서 차감된다", () => {
    const before = calculateTransferTax(splitAsset("actual"), rates);
    const after = calculateTransferTax(
      splitAsset("actual", { transferExpense: TRANSFER_EXPENSE }),
      rates,
    );

    // 파트별 필요경비에 안분액이 실린다
    expect(after.splitDetail!.land.directExpenses).toBe(EXPECTED_LAND_SHARE);
    expect(after.splitDetail!.building.directExpenses).toBe(EXPECTED_BUILDING_SHARE);
    // 실가 파트는 §97①의 가산이므로 그대로 차익을 줄인다
    expect(before.transferGain - after.transferGain).toBe(TRANSFER_EXPENSE);
    expect(after.determinedTax).toBeLessThan(before.determinedTax);
  });

  it("F23-02: Σ 안분액 = 자산 단위 양도비 (잔액 흡수 — 1원도 새지 않는다)", () => {
    // ⚠️ **잔차가 나오는 값을 쓴다.** 딱 나눠떨어지는 금액(30,000,000 × 0.6)은 「각 파트 독립 floor」와
    //    「잔액 흡수」를 구별하지 못해 이 케이스가 무의미해진다.
    const odd = 10_000_001; // 토지 floor(6,000,000.6) = 6,000,000 → 건물이 4,000,001을 흡수
    const r = calculateTransferTax(splitAsset("actual", { transferExpense: odd }), rates);
    expect(r.splitDetail!.land.directExpenses).toBe(6_000_000);
    expect(r.splitDetail!.building.directExpenses).toBe(4_000_001);
    const sum = r.splitDetail!.land.directExpenses + r.splitDetail!.building.directExpenses;
    expect(sum).toBe(odd); // 독립 floor였다면 10,000,000이 되어 1원이 샌다
  });

  it("F23-03: 파트 자본적지출과 **합산**된다 (같은 파트의 §97① 필요경비)", () => {
    const r = calculateTransferTax(
      splitAsset("actual", {
        transferExpense: TRANSFER_EXPENSE,
        landDirectExpenses: 5_000_000,
        buildingDirectExpenses: 3_000_000,
      }),
      rates,
    );
    expect(r.splitDetail!.land.directExpenses).toBe(EXPECTED_LAND_SHARE + 5_000_000);
    expect(r.splitDetail!.building.directExpenses).toBe(EXPECTED_BUILDING_SHARE + 3_000_000);
  });

  it("F23-04: 🔴 환산 파트 — 양도비만 입력해도 §97②2호 나목이 성립한다", () => {
    // 나목(자본적지출+양도비)이 가목(환산취득가+개산공제)보다 커야 swap이 발동한다.
    // 토지 가목 = 300,000,000 + 9,000,000 → 나목이 이기려면 안분액이 그보다 커야 한다.
    const big = 800_000_000; // 토지분 480,000,000 · 건물분 320,000,000
    const r = calculateTransferTax(splitAsset("estimated", { transferExpense: big }), rates);
    expect(r.splitDetail!.land.directExpenses).toBe(480_000_000);
    expect(r.splitDetail!.land.swapApplied).toBe(true);

    // ⚠️ 이 케이스가 핵심이다 — 파트 자본적지출 칸이 **비어 있어도** 양도비만으로 나목이 선다.
    //    종전 `explicitDirect` 판정은 `landDirectExpenses !== undefined`만 봐서 여기서 다시 유실됐다.
    const baseline = calculateTransferTax(splitAsset("estimated"), rates);
    expect(r.transferGain).toBeLessThan(baseline.transferGain);
  });

  it("F23-05: 양도비 미입력이면 종전과 완전히 같다 (회귀 0)", () => {
    for (const mode of ["actual", "estimated"] as const) {
      const r = calculateTransferTax(splitAsset(mode), rates);
      expect(r.splitDetail!.land.directExpenses).toBe(0);
      expect(r.splitDetail!.building.directExpenses).toBe(0);
    }
    // 실가 스냅샷 — 안분 로직이 0 입력에서 값을 만들어내지 않는다
    expect(calculateTransferTax(splitAsset("actual"), rates).transferGain).toBe(500_000_000);
  });
});
