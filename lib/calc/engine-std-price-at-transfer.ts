/**
 * 엔진에 도달하는 자산 **양도시 기준시가**(`standardPriceAtTransfer`) — ④(주 자산·컴패니언 본문)와 ⑧(감면 기준시가 폴백)의 단일 leaf.
 *
 * 감면 카드의 양도시 기준시가 칸이 비면 엔진은 자산 입력의 `standardPriceAtTransfer`로 대신 계산한다
 * (§99의3·§99·§98의x 5년 안분 — `income-deduction-router.ts`, §97 계열 안분 — `rental-97-router.ts`, §69 편입 — `self-farming-reduction.ts`).
 * 종전 ⑧은 자산의 일반 칸 값을 그대로 인정했는데 ④는 그 값을 조건부로만 실어 두 층이 어긋났다
 * (계획서 `docs/00-pm/burdened-gift-bundle-hidden-stdprice.plan.md` §1.1·§1.5):
 *
 * - **주 자산**: ④는 환산 등에서만 싣는다. 실가 모드에 남은 값은 ⑧만 통과시키고 엔진은 `MISSING_STD_PRICE`로 감면을 뺐다.
 * - **컴패니언**: ④가 모드와 무관하게 실었다. 실가 거래 모드에서는 화면에 없는 칸인데 엔진이 감면 기준시가로 썼다
 *   (§99의3 결정세액 192,330,000 → 170,660,000). 이제 그 칸이 화면에 있는 경우에만 싣는다(D3).
 *
 * ⇒ ④가 이 파일로 값을 만들고 ⑧이 같은 함수를 부른다. 취득시 기준시가는 대상이 아니다 — 엔진이 1990 전 토지·PHD에서 스스로
 *   만들어(`transfer-tax-precalc.ts:108` 등) 「④ 본문 = 엔진 입력」이 성립하지 않는다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { primaryAcquisitionModeFlags } from "./transfer-tax-api-primary-context";
import { redevHiddenGeneralStdPrice } from "./redev-acquisition-price-source";
import {
  isSuccessorRightTransfer,
  successorRightEstimationMode,
  successorRightStdPriceAtTransfer,
} from "./transfer-successor-right";
import { replotIncrementStdPriceAtTransfer } from "./replot-increment-std-price";
import { isSplitPayloadActive } from "./transfer-tax-api-split";
import { hasPre1990LandEstimation } from "./transfer-pre1990-land-gate";
import { stdPriceAtTransferComesFromElsewhere } from "./burdened-gift-transfer-price-scope";
import { isFullFractionalBundle, mergePrimaryBasic, getOwnershipRatio } from "./transfer-tax-api-helpers";
import { effectiveBundledSaleMode } from "./bundled-sale-mode";
import { buildCarryoverPayload } from "./transfer-tax-api-carryover";
import { neutralizeCarryoverDonorSplitForCompanion } from "./transfer-land-part-cause";

/** 자산 카드의 「양도시 기준시가」 입력값 — 증환지 증가분은 당초분에서 파생(⑤·⑥·⑧과 같은 leaf). §166⑥ 안분 키의 출발점이기도 하다. */
export function assetStdPriceAtTransferInput(asset: AssetForm, primary?: AssetForm): number | undefined {
  const raw = parseAmount(asset.standardPriceAtTransfer);
  return raw > 0 ? raw : replotIncrementStdPriceAtTransfer(asset, primary);
}

/** 주 자산 ④ 본문의 `standardPriceAtTransfer`. */
export function primaryEngineStdPriceAtTransfer(
  primary: AssetForm,
  form: Pick<TransferFormData, "assets" | "assetSplitMode" | "bundledSaleMode">,
): number | undefined {
  const { isSuccessorRight, isEstimated, hasPre1990, usesPhd, isCarryoverGeneral } = primaryAcquisitionModeFlags(primary);
  // pre1990 모드: 양도시 기준시가는 form 입력값을 그대로 — 서브엔진은 산출하지 않는다.
  if (usesPhd) return undefined;
  if (hasPre1990) return parseAmount(primary.standardPriceAtTransfer) || undefined;
  if (isCarryoverGeneral) return parseAmount(primary.carryover?.donorStandardPriceAtTransfer ?? "") || undefined;
  // 승계 입주권 환산 분모 — §165①(양도일까지 납입액 + 양도일 프리미엄) (R-12). 감정·매매사례는 분모가 필요 없다.
  if (isSuccessorRight && isEstimated) return successorRightStdPriceAtTransfer(primary) || undefined;
  if (isEstimated && !redevHiddenGeneralStdPrice(primary, form).transfer) return parseAmount(primary.standardPriceAtTransfer) || undefined;
  /**
   * 함께 양도 안분 모드의 안분 키 — 화면에 있다(`CompanionSaleModeBlock`). 컴패니언과 같은 규칙으로 감면 기준시가로도 싣는다
   * (계획서 `docs/00-pm/burdened-gift-bundle-residuals.plan.md` Q-3 a · #2346 Q-2 a). 감면이 없으면 세액이 같다(PA-3 11종).
   * 축 B는 안분 키가 없고(총액 × 지분), 부담부증여는 §159가 양도가액을 정해 범위 밖이다.
   */
  if (
    form.assets.length >= 2 &&
    !isFullFractionalBundle(form.assets, form.assetSplitMode) &&
    effectiveBundledSaleMode(form) === "apportioned" &&
    primary.transferType !== "burdened_gift"
  )
    return parseAmount(primary.standardPriceAtTransfer) || undefined;
  return undefined;
}

/**
 * 컴패니언의 일반 「양도시 기준시가」 칸이 **화면에 있는가**(D3).
 *
 * - 안분 모드: 안분 키 칸(`CompanionSaleModeBlock`) — #2346 Q-2 a 「안분 키는 감면 기준시가로 계속 인정」.
 * - 환산·분리 축: `CompanionAcqStdPriceSection.tsx:93`(`useEstimatedAcquisition || isSplit`). 1990 전 토지 환산도 그 안이다.
 * - 부담부증여: ⑤가 자산별로 안분 블록을 띄운다 — 다른 칸으로 받는 자산(입주권·일반건물·겸용·시가 모드)만 없다.
 * - 축 B(같은 물건 지분 분할): 안분 키가 없다(양도가액 = 총액 × 지분). 칸은 환산·분리 축·1990 전 토지에서만 있다
 *   (Playwright 실측 — 실가 0개 · 환산 카드마다 1개, 계획서 `burdened-gift-bundle-residuals.plan.md` §5 PR-1 1단계).
 *   부담부증여 지분은 ② 양도정보가 첫 카드 값이라 종전대로 싣는다(범위 밖).
 */
function companionGeneralStdAtTransferShown(
  asset: AssetForm,
  form: TransferFormData,
  bundledSaleMode: "actual" | "apportioned",
  transferDate: string,
): boolean {
  const axisB = isFullFractionalBundle(form.assets, form.assetSplitMode);
  if (asset.transferType === "burdened_gift") return axisB || !stdPriceAtTransferComesFromElsewhere(asset);
  return (
    (!axisB && bundledSaleMode === "apportioned") ||
    asset.useEstimatedAcquisition ||
    isSplitPayloadActive(asset, false, { transferDate, isNonPrimary: true }) ||
    hasPre1990LandEstimation(asset)
  );
}

/**
 * 컴패니언 ④ `buildAssetPayload`의 `standardPriceAtTransfer`(이월과세 general override 전).
 * `form`이 없는 직접 호출(테스트)은 단건으로 보고 화면 판정을 건너뛴다(종전 동작).
 */
export function companionEngineStdPriceAtTransfer(
  asset: AssetForm,
  ctx: { bundledSaleMode: "actual" | "apportioned"; transferDate: string; primary?: AssetForm; form?: TransferFormData },
): number | undefined {
  // 승계 입주권 환산 분모 — 영 §165①. 주 자산 ④와 같은 leaf·같은 게이트(환산만).
  if (isSuccessorRightTransfer(asset) && successorRightEstimationMode(asset) === "estimated")
    return successorRightStdPriceAtTransfer(asset) || undefined;
  // 원조합원 §166 자산은 이 칸이 화면에 없다(안분 모드의 안분 키만 보인다).
  if (redevHiddenGeneralStdPrice(asset, ctx.form ?? { assets: [asset], bundledSaleMode: ctx.bundledSaleMode }).transfer) return undefined;
  if (ctx.form && !companionGeneralStdAtTransferShown(asset, ctx.form, ctx.bundledSaleMode, ctx.transferDate)) return undefined;
  return assetStdPriceAtTransferInput(asset, ctx.primary);
}

/**
 * ⑧ 진입점 — `form.assets[assetIndex]`가 엔진에 싣는 양도시 기준시가(없으면 0). ④가 그 자산에 하는 변환을 그대로 따른다:
 * 주 자산은 `primaryEngineStdPriceAtTransfer`, 컴패니언은 축 B 병합 → 이월과세 분리 중립화 → `buildAssetPayload`(이월과세 general이면
 * 증여자 값으로 override — `transfer-tax-api-companion-payload.ts`의 `topLevelOverrides` 스프레드).
 */
export function engineStdPriceAtTransfer(form: TransferFormData, assetIndex: number): number {
  const asset = form.assets[assetIndex];
  if (!asset) return 0;
  if (assetIndex === 0) return primaryEngineStdPriceAtTransfer(asset, form) ?? 0;
  const primary = form.assets[0];
  // 일반건물 지분 묶음은 ④가 `companionAssets`를 만들지 않는다(`generalBuildingShares[]` — 양도시 기준시가는 첫 카드의 GB 물건 값).
  if (primary.assetKind === "general_building" && isFullFractionalBundle(form.assets, form.assetSplitMode)) return 0;
  const merged = neutralizeCarryoverDonorSplitForCompanion(
    isFullFractionalBundle(form.assets, form.assetSplitMode) ? mergePrimaryBasic(asset, primary) : asset,
    true,
  );
  const carry = buildCarryoverPayload(merged, form.transferDate, getOwnershipRatio(merged));
  if (carry && "standardPriceAtTransfer" in carry.topLevelOverrides) return carry.topLevelOverrides.standardPriceAtTransfer ?? 0;
  return (
    companionEngineStdPriceAtTransfer(merged, {
      bundledSaleMode: effectiveBundledSaleMode(form),
      transferDate: form.transferDate,
      primary,
      form,
    }) ?? 0
  );
}
