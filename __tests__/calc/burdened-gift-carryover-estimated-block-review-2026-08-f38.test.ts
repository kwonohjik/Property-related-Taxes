/**
 * F38 — 부담부증여 × 이월과세에서 「환산취득가 사용」을 켜면 ⑧·⑫를 모두 통과한 끝에
 * 엔진 fail-fast로 HTTP 500이 나던 결함의 회귀 anchor (코드리뷰 2026-08).
 *
 * ## 결함
 * 엔진 `assertCarryoverDonorBasis`(`lib/tax-engine/transfer-tax-carryover-burdened-gift.ts:99~106`)는
 * `ct.useEstimatedAcquisition === true`이면 무조건 `TaxCalculationError`를 던진다. 그런데 ⑧
 * (`lib/calc/transfer-tax-validate-bg.ts` (1-b))은 같은 함수의 **다른 한 throw**(당초 증여자 필드
 * 미입력)만 미러하고 있었다.
 *
 * ⇒ 사용자는 ⑧이 오히려 환산 모드 선택·취득시 기준시가 입력을 **요구한 끝에** 통과하고,
 *   마법사 마지막 단계에서 500 배너를 받는다.
 *
 * ## 수정 전 실측 (이 파일의 픽스처 그대로)
 * · `validateBurdenedGiftAsset(환산 ON)` = **null** (통과) → 제출 시 엔진 throw → route 500
 * · `validateBurdenedGiftAsset(환산 OFF)` = null (정상 — 계산까지 도달)
 *
 * 세액은 변하지 않는다(엔진이 hard fail이라 틀린 값이 나온 적은 없다). 오류 시점을
 * 「제출 후 500」에서 「인라인 필드 오류」로 앞당기는 수정이다.
 *
 * ## UI 토글을 숨기지 않은 이유
 * 일반양도에서 토글을 켠 뒤 양도 형태를 부담부증여로 바꾸면 store에 `useEstimatedAcquisition=true`가
 * 남는데, 토글을 숨기면 그 값을 끌 **유일한 입력 경로가 사라져** 500이 영구화된다
 * (`feedback_ui_gate_removes_sole_input_path`). CB-3이 그 「끌 수 있다」를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const LABEL = "자산1";
const CONVERTED_BLOCK = "이월과세 취득가액을 환산으로 구할 수 없습니다";
const MISSING_DONOR_BLOCK = "「당초 증여자」";

/** 부담부증여 × 이월과세 — 당초 증여자 두 칸까지 채운 상태(= 종전에 ⑧을 통과하던 입력) */
function bgCarryoverAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    transferType: "burdened_gift",
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2023-06-01",
    bgValuationMode: "sangjeungbeop_standard",
    bgLendingDepositTotal: "300,000,000",
    bgMortgageDebtAmount: "200,000,000",
    bgDonorRelation: "spouse",
    bgCoDonorLandStdPriceAtAcq: "0",
    bgCoDonorBuildingStdPriceAtAcq: "150,000,000",
    standardPriceAtAcq: "200,000,000",
    standardPriceAtTransfer: "800,000,000",
    ...over,
  } as AssetForm;
}

describe("[F38] 부담부증여 × 이월과세 × 환산취득가 — ⑧ 차단", () => {
  it("CB-1: 환산 ON이면 엔진 fail-fast와 같은 사유로 ⑧이 먼저 막는다", () => {
    const msg = validateBurdenedGiftAsset(
      bgCarryoverAsset({
        carryover: { useEstimatedAcquisition: true, estimationMode: "general" },
      } as Partial<AssetForm>),
      LABEL,
    );
    expect(msg).not.toBeNull();
    expect(msg).toContain(CONVERTED_BLOCK);
    // 근거 조문을 문구에 남긴다 — 사용자가 다음 행동을 고를 수 있어야 한다.
    expect(msg).toContain("제159조 제1항 제1호");
  });

  it("CB-2: 환산 OFF는 계속 통과한다 (지원 조합 — over-block 금지)", () => {
    const msg = validateBurdenedGiftAsset(
      bgCarryoverAsset({
        carryover: { useEstimatedAcquisition: false },
      } as Partial<AssetForm>),
      LABEL,
    );
    expect(msg).toBeNull();
  });

  it("CB-3: 「당초 증여자 미입력」이 새 차단보다 **앞선다** (검사 순서 고정)", () => {
    // 두 조건이 동시에 성립하는 입력. 순서가 뒤바뀌면 지원되는 조합(환산 OFF)에서
    // 「당초 증여자 입력 요구」를 가로채는 회귀가 난다.
    const msg = validateBurdenedGiftAsset(
      bgCarryoverAsset({
        bgCoDonorLandStdPriceAtAcq: "",
        bgCoDonorBuildingStdPriceAtAcq: "",
        carryover: { useEstimatedAcquisition: true, estimationMode: "general" },
      } as Partial<AssetForm>),
      LABEL,
    );
    expect(msg).toContain(MISSING_DONOR_BLOCK);
    expect(msg).not.toContain(CONVERTED_BLOCK);
  });

  it("CB-4: 일반양도(부담부증여 아님)는 이 차단의 대상이 아니다", () => {
    // 이 경로가 살아 있어야 「환산 토글을 끄러 되돌아갈 수 있다」가 성립한다
    // — UI 숨김을 채택하지 않은 근거(feedback_ui_gate_removes_sole_input_path).
    const msg = validateBurdenedGiftAsset(
      bgCarryoverAsset({
        transferType: "regular",
        carryover: { useEstimatedAcquisition: true, estimationMode: "general" },
      } as Partial<AssetForm>),
      LABEL,
    );
    expect(msg).toBeNull();
  });

  it("CB-5: 이월과세가 아닌 취득원인은 환산 ON이어도 차단하지 않는다", () => {
    const msg = validateBurdenedGiftAsset(
      bgCarryoverAsset({
        acquisitionCause: "purchase",
        carryover: { useEstimatedAcquisition: true, estimationMode: "general" },
      } as Partial<AssetForm>),
      LABEL,
    );
    expect(msg).toBeNull();
  });
});
