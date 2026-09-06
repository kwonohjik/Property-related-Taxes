/**
 * 부담부증여 자산의 **양도가액·양도시 기준시가 입력 경로** — ⑤·⑧ 공용 술어 (2026-09-07 UI 리뷰).
 *
 * ## 왜 필요한가 — ⑤는 칸을 숨기는데 ⑧은 그 칸을 요구했다
 *
 * ⑧(`transfer-tax-validate-asset.ts:192`)은 **폼-전역** `form.bundledSaleMode`만 봤다.
 * 그런데 ⑤(`AssetSectionTransfer.tsx:94~98`)는 부담부증여 자산에 대해
 *
 * - 모드를 **자산별로 `"apportioned"`로 덮어써** 「계약서상 양도가액」 칸을 렌더하지 않고,
 * - `general_building` 또는 시가 모드(`sangjeungbeop_market`)에서는
 *   `CompanionSaleModeBlock` **자체를 렌더하지 않는다**.
 *
 * 그래서 함께양도 조합에서 두 갈래로 어긋났다:
 *
 * | 상황 | ⑧이 요구 | 화면 |
 * |---|---|---|
 * | 함께양도 + 「구분 기재(actual)」 + 부담부증여 자산 | 「계약서상 양도가액을 입력하세요」 | 칸 없음. 같은 화면은 「양도가액은 자동 산정됩니다」라고 안내한다 |
 * | 함께양도 + apportioned + 부담부증여 × GB/시가모드 | 「양도시 기준시가를 입력하세요」 | 칸 없음(값은 `gb*`·`bgMarketValueAtTransfer`가 받는다) |
 *
 * 함께양도 × 부담부증여는 2026-09-03에 **정식 개방된 조합**이다
 * (`transfer-tax-validate.ts:113~120`).
 *
 * ## 근거 — 그 값들은 실제로 쓰이지 않거나 다른 필드에서 온다
 *
 * - **양도가액**: ④가 채무 합계를 **placeholder**로 넣고 엔진 STEP 0.48이 §159로 다시
 *   계산한다(`transfer-tax-api.ts:191~196` — 「양도가액은 엔진 STEP 0.48에서 채무 안분 후
 *   자동 override」). 입력된 계약가액은 **엔진에 도달하지 않는다**.
 * - **양도시 기준시가**: §159 분모(C) 산정에 필요하지만, `general_building`은
 *   `gbTransferLandPricePerSqm × gbLandArea + gbTransferBuildingValue`
 *   (`transfer-tax-api-burdened-gift.ts:216~226`), 시가 모드는 `bgMarketValueAtTransfer`
 *   (:159)로 받는다 — `standardPriceAtTransfer`를 쓰지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/**
 * 이 자산의 양도가액을 **엔진이 스스로 산정**하는가(= 입력칸이 없고, 넣어도 쓰이지 않는다).
 */
export function usesSelfComputedTransferPrice(asset: AssetForm): boolean {
  return asset.transferType === "burdened_gift";
}

/**
 * 「양도시 기준시가」를 이 자산이 **다른 필드로** 받는가(= 공용 칸이 화면에 없다).
 *
 * ⑤의 `CompanionSaleModeBlock` 렌더 조건과 같은 술어다.
 */
export function stdPriceAtTransferComesFromElsewhere(asset: AssetForm): boolean {
  return (
    asset.transferType === "burdened_gift" &&
    (asset.assetKind === "general_building" ||
      asset.bgValuationMode === "sangjeungbeop_market")
  );
}
