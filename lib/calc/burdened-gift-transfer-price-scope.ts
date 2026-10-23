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
import { isMixedBurdenedGift } from "./burdened-gift-mixed-use-scope";
import { isFullFractionalBundle } from "./transfer-tax-api-asset-basics";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { burdenedGiftPerAssetTotals } from "@/lib/tax-engine/burdened-gift-totals";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";

/**
 * 이 자산의 양도가액을 **엔진이 스스로 산정**하는가(= 입력칸이 없고, 넣어도 쓰이지 않는다).
 */
export function usesSelfComputedTransferPrice(asset: AssetForm): boolean {
  return asset.transferType === "burdened_gift";
}

/**
 * 함께 양도(다른 물건) 묶음의 부담부증여 구성 — ⑧(폼 `transferType`)·⑩·route(본문: 주 자산 `transferType`,
 * 컴패니언 `burdenedGiftInfo`)가 각자 자산별 플래그를 만들어 이 함수 하나로 판정한다.
 *
 * - `"all"`: 전 자산 부담부증여 — 양도가액을 §159가 정하고 엔진 STEP 0.48이 route 안분값을 덮어쓴다
 *   (`transfer-tax-burdened-gift-step.ts:161-164`). 안분 키·계약서 가액은 세액에 쓰이지 않는다(총액 1원도 같은 세액 —
 *   계획서 `docs/00-pm/burdened-gift-bundle-hidden-stdprice.plan.md` §1.2). 양도시 기준시가를 다른 칸으로 받는 자산은 키 칸이
 *   화면에 없으므로 요구하면 막다른 길이다.
 * - `"mixed"`: 일반 양도와 섞임 — 설계된 적이 없다. 부담부증여 자산이 §166⑥ 안분에 끼어 일반 자산 양도가액이 깎이고
 *   (600,000,000 → 171,428,571), 채무 재배분이 주 자산 기준으로 어긋난다(같은 계획서 §1.4). 명시 차단한다.
 *
 * 축 B(같은 물건 지분 분할)는 대상이 아니다 — ④가 컴패니언의 양도 형태를 주 자산에서 복사한다(`mergePrimaryBasic`).
 */
export function burdenedGiftBundleKind(isBurdenedGift: readonly boolean[]): "none" | "all" | "mixed" {
  if (!isBurdenedGift.some(Boolean)) return "none";
  return isBurdenedGift.every(Boolean) ? "all" : "mixed";
}

/**
 * ⑧이 막는 혼합 묶음인가 — 함께 양도(축 B 아님)에서 일반 양도와 부담부증여가 섞였다. ⑧ 차단과 ⑥ 사이드바 표시가 같은 술어를 쓴다
 * (사이드바가 이 묶음에 §166⑥ 안분값을 보여 주던 결함 — 계획서 `docs/00-pm/burdened-gift-bundle-residuals.plan.md` §1.1).
 */
export function isBlockedMixedBurdenedGiftBundle(
  assets: readonly AssetForm[],
  assetSplitMode: "companion" | "fractional" | undefined,
): boolean {
  return (
    !isFullFractionalBundle(assets as AssetForm[], assetSplitMode) &&
    burdenedGiftBundleKind(assets.map((a) => a.transferType === "burdened_gift")) === "mixed"
  );
}

/** 단건 부담부증여의 §159 양도가액 — 엔진 명세의 토지·건물 양도가액 합(소득세법 시행령 §159①). 결과 카드·사이드바가 같이 쓴다. */
export function burdenedGiftTransferPrice(brkd: Pick<TransferBurdenedGiftBreakdown, "perAsset">): number {
  return burdenedGiftPerAssetTotals(brkd).transferPrice;
}

export const MIXED_BURDENED_GIFT_BUNDLE_MESSAGE =
  "일반 양도 자산과 부담부증여 자산은 함께 양도로 계산할 수 없습니다. 부담부증여 자산만 묶거나, 각각 따로 계산하세요.";

/**
 * 「양도시 기준시가」를 이 자산이 **다른 필드로** 받는가(= 공용 칸이 화면에 없다).
 *
 * ⑤의 `CompanionSaleModeBlock` 렌더 조건과 같은 술어다.
 */
export function stdPriceAtTransferComesFromElsewhere(asset: AssetForm): boolean {
  return (
    asset.transferType === "burdened_gift" &&
    (asset.assetKind === "general_building" ||
      /**
       * 겸용주택 — 양도시 기준시가는 4부분 겸용 패널(`mixedTransfer*`)이 정본이고 엔진은 `standardPriceAtTransfer` 총액을 읽지 않는다.
       * 공용 칸을 띄우면 **엔진이 쓰지 않는 값**을 입력받게 된다(설계 UI R2 §4 DUP-1). ⑧도 같은 술어라 요구하지 않는다.
       */
      isMixedBurdenedGift(asset) ||
      /**
       * 조합원입주권 — 평가액이 ④′ 3항(`bgRight*`)에서 오고 ④ API 변환이 그 합계를
       * `buildingStdPriceAtTransfer`에 싣는다(2026-09-08). 공용 칸을 띄우면
       * **엔진이 쓰지 않는 값**을 입력받게 되고, `toPropertyKind`가 입주권을
       * `building_non_residential`로 매핑해 **비주거 건물 공시가격 조회 UI**까지 뜬다.
       */
      asset.assetKind === "right_to_move_in" ||
      /**
       * 시가 모드 — §159 분모(C)는 `bgMarketValueAtTransfer`가 받는다. 다만 **K-5(환산)** 는
       * 환산 분모로 양도시 기준시가를 쓴다(소령 §176의2②2호 · ④가 `standardPriceAtTransfer`를
       * 그대로 싣는다) — 그때는 공용 칸이 있어야 한다(2026-09-30 B2).
       */
      // 의제취득일 전 상속·증여 토지·주택·상가·건물(시가)은 ③의 분모를 상속·증여 의제 섹션의 칸이 받는다(계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §18).
      (asset.bgValuationMode === "sangjeungbeop_market" && (asset.bgAcquisitionMethod !== "converted" || isBgPreDeemedAsset(asset))))
  );
}
