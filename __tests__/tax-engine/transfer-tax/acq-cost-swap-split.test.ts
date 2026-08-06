/**
 * 양도세 §97② 단서 swap — 토지·건물 분리 (calcSplitGain) 케이스 6.
 *
 * 자산 단위 독립 swap: 토지/건물 각각 (acqPrice + 개산공제) vs (직접경비) 비교.
 * 자산별 명시 입력(`landDirectExpenses` / `buildingDirectExpenses`)이 있을 때만 swap 활성.
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { baseTransferInput } from "../_helpers/mock-rates";

describe("§97② 단서 swap — 토지/건물 분리 (자산 단위)", () => {
  // 공통 시나리오: 토지·건물 각각 취득일 분리, 환산 모드, 5억 양도가
  function splitInput(extra: Record<string, unknown> = {}) {
    return baseTransferInput({
      transferPrice: 500_000_000,
      useEstimatedAcquisition: true,
      // 토지·건물 분리 활성
      landAcquisitionDate: new Date("2018-01-01"),
      acquisitionDate: new Date("2019-06-01"), // 건물 취득일
      // 양도가 분리 (토지 60% / 건물 40%)
      landTransferPrice: 300_000_000,
      buildingTransferPrice: 200_000_000,
      // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
      //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
      landStandardPriceAtTransfer: 300_000_000,
      buildingStandardPriceAtTransfer: 200_000_000,
      // 취득시 기준시가 — 토지 8천 / 건물 2천 = 1억 합
      standardPriceAtAcquisition: 100_000_000,
      standardPriceAtTransfer: 500_000_000,
      standardPricePerSqmAtAcquisition: 800_000,
      acquisitionArea: 100, // 토지 기준시가 = 80M (잔여 20M = 건물)
      ...extra,
    });
  }

  it("토지만 swap, 건물은 본문 — 자산 단위 독립", () => {
    // 토지 환산취득가 = 300M × (80M/300M) = 80M, 개산공제 = 80M × 3% = 2,400,000
    // 건물 환산취득가 = 200M × (20M/200M) = 20M, 개산공제 = 20M × 3% = 600,000
    // 토지 directExp = 100M (>> 82.4M, swap 발동)
    // 건물 directExp = 500K (<< 20.6M, 본문)
    const result = calcSplitGain(splitInput({
      landTransferPrice: 300_000_000,
      buildingTransferPrice: 200_000_000,
      // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
      //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
      landStandardPriceAtTransfer: 300_000_000,
      buildingStandardPriceAtTransfer: 200_000_000,
      standardPricePerSqmAtTransfer: 3_000_000,
      landDirectExpenses: 100_000_000, // 명시 입력 — swap 가능
      buildingDirectExpenses: 500_000,  // 명시 입력 — swap 비교 결과 본문
    }));

    expect(result).not.toBeNull();
    expect(result!.land.swapApplied).toBe(true);
    expect(result!.land.directExpenses).toBe(100_000_000);
    expect(result!.land.appraisalDeduction).toBe(0); // swap 시 개산공제 미적용

    expect(result!.building.swapApplied).toBe(false);
    expect(result!.building.directExpenses).toBe(0); // 본문 — directExp 차감 안 함
    expect(result!.building.appraisalDeduction).toBe(600_000); // 개산공제만

    // C-2: swap 발동 토지는 필요경비 = 나목(directExp 100M) 단독 → 환산취득가 미차감.
    expect(result!.land.gain).toBe(300_000_000 - 100_000_000); // 200,000,000 (환산 80M 미차감)
    // 본문 건물(swap 아님, C-2 영향 없음): 양도가 − 건물환산(20M) − 개산공제(600K)
    //
    // ⚠️ **2026-08-06 (Phase 1-D) — 159,400,000 → 179,400,000.**
    //    종전 fixture는 양도시 기준시가를 **입력하지 않아** 엔진이 `standardPriceAtTransfer`(5억)를
    //    **취득시 비율 0.8**로 나눠 토지 4억 / 건물 1억을 파생했다 ⇒ 건물 환산 분모 1억 → 환산 40M.
    //    그런데 그 파생값은 구분 기재(3억 : 2억 = 6:4)와 **100% 어긋난다**(8:2) — §100③ 하에서는
    //    성립하지 않는 조합이다. 구분 기재와 정합하게 3:2를 명시하니 건물 분모가 2억이 되어
    //    환산이 20M으로 바뀌었다.
    //    이 테스트의 주제(**swap이 자산 단위로 독립 발동**)는 그대로다 — 토지 swap 발동
    //    (directExp 100M > 82.4M) · 건물 본문(500K < 20.6M) 조건이 양쪽 모두 보존된다.
    expect(result!.building.gain).toBe(179_400_000);
  });

  it("자산별 미입력(undefined) → swap 비활성, 본문만 (개산공제만)", () => {
    const result = calcSplitGain(splitInput({
      standardPricePerSqmAtTransfer: 3_000_000,
      // landDirectExpenses / buildingDirectExpenses 둘 다 미입력
      // expenses(legacy) 만 있어도 swap 비활성
      expenses: 100_000_000,
    }));

    expect(result).not.toBeNull();
    expect(result!.land.swapApplied).toBe(false);
    expect(result!.land.directExpenses).toBe(0);
    expect(result!.land.appraisalDeduction).toBeGreaterThan(0);

    expect(result!.building.swapApplied).toBe(false);
    expect(result!.building.directExpenses).toBe(0);
    expect(result!.building.appraisalDeduction).toBeGreaterThan(0);
  });

  it("실가 모드 — directExp 그대로 차감, 개산공제 0, swap 무관", () => {
    const result = calcSplitGain(splitInput({
      useEstimatedAcquisition: false,
      acquisitionPrice: 200_000_000, // 실가 명시
      standardPricePerSqmAtTransfer: 3_000_000,
      landDirectExpenses: 30_000_000,
      buildingDirectExpenses: 10_000_000,
    }));

    expect(result).not.toBeNull();
    expect(result!.land.swapApplied).toBe(false);
    expect(result!.land.directExpenses).toBe(30_000_000);
    expect(result!.land.appraisalDeduction).toBe(0);

    expect(result!.building.swapApplied).toBe(false);
    expect(result!.building.directExpenses).toBe(10_000_000);
    expect(result!.building.appraisalDeduction).toBe(0);
  });

  it("토지·건물 둘 다 swap 발동", () => {
    const result = calcSplitGain(splitInput({
      standardPricePerSqmAtTransfer: 3_000_000,
      landDirectExpenses: 200_000_000, // >> 토지 환산+개산
      buildingDirectExpenses: 50_000_000, // >> 건물 환산+개산
    }));

    expect(result!.land.swapApplied).toBe(true);
    expect(result!.land.directExpenses).toBe(200_000_000);
    expect(result!.land.appraisalDeduction).toBe(0);

    expect(result!.building.swapApplied).toBe(true);
    expect(result!.building.directExpenses).toBe(50_000_000);
    expect(result!.building.appraisalDeduction).toBe(0);

    // C-2: 둘 다 swap → 각 필요경비 = 나목 단독(환산취득가 미차감).
    expect(result!.land.gain).toBe(300_000_000 - 200_000_000); // 100,000,000
    expect(result!.building.gain).toBe(200_000_000 - 50_000_000); // 150,000,000
  });
});
