/**
 * anchor: 부담부증여 기준시가 모드 「취득시 기준시가」 — validate(⑧) + 엔진 수치(P4)
 *
 * ## 무엇을 잡는가
 *
 * 1. **차단이 실재하는가** — 미입력이면 계산이 막혀야 한다. 종전에는 조용히 0으로 계산돼
 *    양도차익이 통째로 부풀었다.
 * 2. **UI 게이트(⑤)와 같은 술어인가** — 갈리면 「칸은 뜨는데 계산은 막힌다」가 된다.
 * 3. **land fallback** — 총액 대신 단가+면적을 채운 사용자는 막히면 안 된다(API와 동일 fallback).
 * 4. **수치** — 취득시 기준시가가 취득가액·개산공제를 실제로 가른다.
 *
 * 설계: docs/02-design/features/burdened-gift-acq-std-price-input-path.plan.md §6 P3·P4
 */
import { describe, it, expect } from "vitest";
import {
  needsBgAcqStdPriceInput,
  resolveBgAcqStdPrice,
} from "@/lib/calc/burdened-gift-acq-std-price";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type Arg = Parameters<typeof needsBgAcqStdPriceInput>[0];
const mk = (over: Partial<Arg>): Arg => ({
  assetKind: "housing" as AssetForm["assetKind"],
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_standard",
  standardPriceAtAcq: "",
  standardPricePerSqmAtAcq: "",
  acquisitionArea: "",
  ...over,
});

describe("G-1 게이트 — UI(⑤)와 validate(⑧)가 공유하는 단일 술어", () => {
  it.each(["housing", "building", "land", "commercial_building"] as const)(
    "%s + 기준시가 모드 → 입력 필요",
    (assetKind) => {
      expect(needsBgAcqStdPriceInput(mk({ assetKind }))).toBe(true);
    },
  );

  it("general_building → 불필요 (gb* 전용 축이 따로 있다)", () => {
    expect(needsBgAcqStdPriceInput(mk({ assetKind: "general_building" }))).toBe(false);
  });

  it("시가 모드 → 불필요 (K-4/K-5 축)", () => {
    expect(needsBgAcqStdPriceInput(mk({ bgValuationMode: "sangjeungbeop_market" }))).toBe(false);
  });

  it("일반 양도 → 불필요", () => {
    expect(needsBgAcqStdPriceInput(mk({ transferType: "regular" }))).toBe(false);
  });
});

describe("V-1 값 해석 — API와 같은 fallback", () => {
  it("총액 입력", () => {
    expect(resolveBgAcqStdPrice(mk({ standardPriceAtAcq: "500,000,000" }))).toBe(500_000_000);
  });

  it("🔑 land — 총액이 없으면 ㎡당 공시지가 × 취득면적 (막히면 안 된다)", () => {
    expect(
      resolveBgAcqStdPrice(
        mk({ assetKind: "land", standardPricePerSqmAtAcq: "3,210,000", acquisitionArea: "100" }),
      ),
    ).toBe(321_000_000);
  });

  it("🔴 구별력 — land가 아니면 단가×면적 fallback을 쓰지 않는다", () => {
    expect(
      resolveBgAcqStdPrice(
        mk({ assetKind: "housing", standardPricePerSqmAtAcq: "3,210,000", acquisitionArea: "100" }),
      ),
    ).toBe(0);
  });

  it("전부 비면 0 → 차단 대상", () => {
    expect(resolveBgAcqStdPrice(mk({}))).toBe(0);
  });
});

// ─── P4 수치 — 계획서 §1.1 표를 고정 ───────────────────────────

const breakdown = (acqBuildingStd: number) => {
  const info = {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 300_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_000_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: acqBuildingStd,
  } as unknown as BurdenedGiftInfo;
  return buildBurdenedGiftBreakdown({
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_000_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: acqBuildingStd,
    info,
  });
};

describe("N 수치 — 취득시 기준시가가 취득가액을 가른다 (채무비율 0.5)", () => {
  it("N-1 5억 입력 → 취득가액 250,000,000 · 개산공제 7,500,000", () => {
    const b = breakdown(500_000_000).perAsset.building;
    expect(b.acquisitionPrice).toBe(250_000_000);
    expect(b.estimatedDeduction).toBe(7_500_000);
    expect(b.transferPrice).toBe(500_000_000);
  });

  it("N-2 🔴 미입력(0) → 취득가액·개산공제 모두 0 (차단이 없으면 이 값이 그대로 나간다)", () => {
    const b = breakdown(0).perAsset.building;
    expect(b.acquisitionPrice).toBe(0);
    expect(b.estimatedDeduction).toBe(0);
    expect(b.transferPrice).toBe(500_000_000); // 양도가액은 그대로 → 차익만 부푼다
  });

  it("🔑 두 경우의 차이가 곧 과대과세분이다", () => {
    const five = breakdown(500_000_000).perAsset.building;
    const zero = breakdown(0).perAsset.building;
    const gap =
      five.acquisitionPrice + five.estimatedDeduction - (zero.acquisitionPrice + zero.estimatedDeduction);
    expect(gap).toBe(257_500_000);
  });
});
