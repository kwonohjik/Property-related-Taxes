/**
 * anchor: 부담부증여는 **사용자 취득가액을 소비하지 않는다** — 전 자산종류 (§10-5)
 *
 * 계획서: `docs/02-design/features/transfer-gb-inheritance-extension-3part.plan.md` §10-5
 *
 * ## 무엇을 고정하는가
 *
 * 「소득세법 시행령」 제159조 제1항 제1호가 「양도로 보는 부분」의 취득가액을 **채무비율**로
 * 정하므로, `runBurdenedGiftStep`이 `workingInput.acquisitionPrice`를 §159 안분값으로
 * **덮어쓴다**. ⇒ 사용자가 상속개시일 평가액·증여 신고가액·실거래가 어느 이름으로 적었든
 * 그 값은 세액에 도달하지 않는다.
 *
 * 이것이 **UI에서 그 칸을 숨기는 근거**다. 매매 경로는 이미 숨기고 있었고
 * (`CompanionAcqPurchaseBlock.tsx:262`), 상속·증여만 예외라 「입력했는데 세액이 그대로」인
 * 칸이 남아 있었다(`feedback_ui_engine_dual_truth_avoidance`).
 *
 * ⚠️ **이 테스트가 뒤집히면 UI 게이트를 함께 재검토하라.** 취득가액이 소비되도록 엔진이
 *    바뀌었다면 숨긴 칸이 곧 **입력 경로 상실**이 된다
 *    (`feedback_ui_gate_removes_sole_input_path`).
 *
 * ⚠️ 부담부증여 K-4(실지취득가 안분)의 입력은 여기서 다루는 `acquisitionPrice`가 아니라
 *    `BurdenedGiftInfo.actualLandAcquisitionPrice` 등 **전용 필드**다
 *    (`transfer-tax-api-burdened-gift.ts:86-97` ← `bgActualAcquisition*`). 그 축은 살아 있다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

const burdenedGiftInfo: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: 300_000_000,
  mortgageDebtAmount: 200_000_000,
  annualRentTotal: 0,
  landStdPriceAtTransfer: 600_000_000,
  buildingStdPriceAtTransfer: 200_000_000,
  landStdPriceAtAcquisition: 300_000_000,
  buildingStdPriceAtAcquisition: 100_000_000,
};

function run(propertyType: string, acquisitionPrice: number) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType,
      transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("2005-05-01"),
      transferPrice: 0,
      acquisitionPrice,
      expenses: 0,
      useEstimatedAcquisition: false,
      acquisitionCause: "burdened_gift",
      isOneHousehold: false,
      householdHousingCount: 0,
      burdenedGiftInfo,
    } as Partial<TransferTaxInput>),
    rates,
  );
}

describe("§10-5 부담부증여 — 사용자 취득가액은 §159가 덮어쓴다", () => {
  const KINDS = ["general_building", "housing", "land", "commercial_building"] as const;

  it.each(KINDS)("%s — 취득가액 0원과 50억원의 세액이 같다", (kind) => {
    const zero = run(kind, 0);
    const huge = run(kind, 5_000_000_000);
    expect(huge.calculatedTax).toBe(zero.calculatedTax);
  });

  it("네 자산종류가 모두 같은 값을 낸다 — §159 안분은 자산종류에 의존하지 않는다", () => {
    /**
     * 같은 기준시가·채무를 주면 §159 산식이 동일하므로 결과도 같아야 한다. 어긋나면
     * 자산종류별 분기가 §159 안분값을 덮어쓴 것이다(위 「덮어쓴다」 전제가 깨진 신호).
     */
    const taxes = KINDS.map((k) => run(k, 0).calculatedTax);
    expect(new Set(taxes).size).toBe(1);
    expect(taxes[0]).toBe(43_615_000);
  });
});
