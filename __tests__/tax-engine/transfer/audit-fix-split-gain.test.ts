/**
 * 감사 확정 결함 회귀 테스트
 * findingRef: transfer-tax-split-gain.ts:230 (calcSplitGainPreDisclosure)
 *
 * 결함: §164⑤ PHD(개별주택가격 미공시) 토지/건물 분리 경로가 환산취득가 + 개산공제(§163⑥)에
 *       더해 자본적지출(landDirectExpenses/buildingDirectExpenses)을 무조건 추가 차감 →
 *       환산 모드 필요경비 이중계상(과소과세).
 *
 * 법령: 소득세법 §97②2호 — 환산취득가액 모드의 필요경비는
 *       MAX(가목: 환산취득가+개산공제, 나목: 자본적지출+양도비)로 '택일'한다('합'이 아님).
 *       (memory feedback_97_2_swap_necessary_expense_max_not_sum)
 *       비-PHD calcSplitGain의 applyAssetSwap이 이미 이 규칙을 구현하나 PHD 경로만 누락되어 있었다.
 *
 * 기대값 도출(법령 MAX 규칙 독립 산출 — 엔진 출력 복붙 아님):
 *   건물 가목(estimatedSide) = 환산취득가 169,332,955 + 개산공제 4,454,759 = 173,787,714
 *   건물 양도가액 = 182,278,676 (fixture Excel anchor)
 *   ▷ 본문(가목) 채택: buildingGain = 182,278,676 − 173,787,714 = 8,490,962 (= PHD_BLDG_GAIN)
 *   ▷ 단서(나목) 채택(자본적지출 180,000,000 > 173,787,714):
 *        buildingGain = 182,278,676 − 180,000,000 = 2,278,676
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";
import {
  PHD_INPUT,
  PHD_TRANSFER_PRICE,
  PHD_LAND_GAIN, // 139,089,851 (토지 — 자본적지출 없음, 불변 baseline)
  PHD_BLDG_GAIN, // 8,490,962 (환산 169,332,955 + 개산공제 4,454,759만 차감)
  PHD_BLDG_ACQ_PRICE, // 169,332,955 (환산취득가)
  PHD_BLDG_LUMP_DED, // 4,454,759 (개산공제 §163⑥)
  PHD_BLDG_TRANSFER_PRICE, // 182,278,676
} from "../transfer-tax/_helpers/pre-housing-disclosure-fixture";

// §97②2호 가목 = 환산취득가 + 개산공제 (건물)
const BLDG_ESTIMATED_SIDE = PHD_BLDG_ACQ_PRICE + PHD_BLDG_LUMP_DED; // 173,787,714

function phdSplitInput(extra: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: PHD_TRANSFER_PRICE, // 715,000,000
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2014-09-14"), // 건물 취득일
    landAcquisitionDate: new Date("2013-06-01"), // 토지 취득일 → 분리 경로 활성
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    acquisitionMethod: "estimated",
    expenses: 0,
    landSplitMode: "apportioned",
    preHousingDisclosure: PHD_INPUT,
    ...extra,
  });
}

describe("감사수정: PHD(§164⑤) 분리 경로 §97②2호 필요경비 이중계상 제거", () => {
  it("baseline — 자본적지출 미입력 시 기존 결과 불변 (개산공제만 차감)", () => {
    const r = calcSplitGain(phdSplitInput());
    expect(r).not.toBeNull();
    // Excel anchor 그대로 유지 (회귀 없음)
    expect(r!.land.gain).toBe(PHD_LAND_GAIN); // 139,089,851
    expect(r!.building.gain).toBe(PHD_BLDG_GAIN); // 8,490,962
    expect(r!.land.swapApplied).toBe(false);
    expect(r!.building.swapApplied).toBe(false);
  });

  it("본문(가목) — 소액 자본적지출은 개산공제 위에 추가 차감되지 않는다 (이중계상 제거)", () => {
    // 자본적지출 1,000,000 < 가목 173,787,714 → MAX = 가목 → 자본적지출 미차감.
    const r = calcSplitGain(phdSplitInput({ buildingDirectExpenses: 1_000_000 }));
    expect(r).not.toBeNull();

    // 핵심: buildingGain = 양도가액 − 가목(환산+개산공제)만. 1,000,000 추가 차감 금지.
    //  (수정 전 버그 코드는 8,490,962 − 1,000,000 = 7,490,962 을 반환했다.)
    expect(r!.building.gain).toBe(PHD_BLDG_GAIN); // 8,490,962
    expect(r!.building.swapApplied).toBe(false);
    expect(r!.building.directExpenses).toBe(0); // 본문 → 자본적지출 미차감
    expect(r!.building.appraisalDeduction).toBe(PHD_BLDG_LUMP_DED); // 개산공제만

    // 토지(자본적지출 없음)는 영향 없음
    expect(r!.land.gain).toBe(PHD_LAND_GAIN);
    expect(r!.land.swapApplied).toBe(false);
  });

  it("단서(나목) — 자본적지출 > (환산+개산공제)이면 자본적지출 단독, 환산·개산공제 미차감", () => {
    const directExp = 180_000_000; // > 가목 173,787,714 → swap
    expect(directExp).toBeGreaterThan(BLDG_ESTIMATED_SIDE);
    const r = calcSplitGain(phdSplitInput({ buildingDirectExpenses: directExp }));
    expect(r).not.toBeNull();

    // 필요경비 = 나목(자본적지출) 단독 → buildingGain = 양도가액 − 자본적지출.
    const expected = PHD_BLDG_TRANSFER_PRICE - directExp; // 182,278,676 − 180,000,000 = 2,278,676
    expect(expected).toBe(2_278_676);
    expect(r!.building.gain).toBe(expected);
    expect(r!.building.swapApplied).toBe(true);
    expect(r!.building.directExpenses).toBe(directExp);
    expect(r!.building.appraisalDeduction).toBe(0); // swap 시 개산공제 미적용

    // 토지 baseline 유지
    expect(r!.land.gain).toBe(PHD_LAND_GAIN);
  });
});
