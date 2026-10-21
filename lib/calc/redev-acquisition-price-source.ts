/**
 * 재개발·재건축(시행령 §166) 자산의 **실가 모드 취득가액이 어느 칸에서 오는가** — 주 자산 ④와 컴패니언 ④의 단일 leaf.
 *
 * 원조합원(입주권·비승계 완공APT)은 상단 「취득가액」 칸이 화면에 없다(`CompanionAcqPurchaseBlock` 게이트) —
 * 취득가액은 §166 섹션의 「종전 부동산 취득가액」(`redevActualAcquisitionPrice`)이 정한다.
 * 숨은 `fixedAcquisitionPrice`를 읽으면 비어 있을 때 ⑩이 400, 옛 값이 남아 있으면 엔진이 그 값을 취득가액으로 쓴다.
 * 승계조합원 완공APT만 상단 칸(`fixedAcquisitionPrice`)이 유일한 입력 경로다(E2-01).
 *
 * 주 자산(`transfer-tax-api.ts`)과 컴패니언(`transfer-tax-api-companion-payload.ts` `fixedAcquisitionPriceRaw`)이
 * 각자 이 규칙을 다시 쓰면 한쪽만 빠뜨려도 조용히 어긋난다 — 두 곳이 이 파일만 쓴다.
 */

import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { isSuccessorRightTransfer } from "./transfer-successor-right";
import { isFullFractionalBundle } from "./transfer-tax-api-asset-basics";
import { effectiveBundledSaleMode } from "./bundled-sale-mode";

/**
 * §166 서브객체(`redevelopment`)를 만드는 자산인가 — 완공APT 또는 **원조합원** 입주권.
 * 승계조합원 입주권은 §166① 요건 밖이라 제외한다(§97①1호 가목 일반 경로).
 */
export function isRedevelopmentSec166Asset(
  asset: Pick<AssetForm, "assetKind" | "isSuccessorRightToMoveIn">,
): boolean {
  return (
    !isSuccessorRightTransfer(asset) &&
    (asset.assetKind === "redevelopment_apt" || asset.assetKind === "right_to_move_in")
  );
}

/**
 * §166 자산의 실가 모드 취득가액(100% 기준 · 지분 스케일 전).
 *  · 승계조합원 완공APT(사례 48) — 자산 카드 `fixedAcquisitionPrice`
 *  · 그 밖(사례 45/46 원조합원) — §166 섹션 `redevActualAcquisitionPrice`
 */
export function redevActualAcquisitionPriceRaw(
  asset: Pick<AssetForm, "redevIsSuccessorMember" | "fixedAcquisitionPrice" | "redevActualAcquisitionPrice">,
): number {
  return asset.redevIsSuccessorMember === "yes"
    ? parseAmount(asset.fixedAcquisitionPrice)
    : parseAmount(asset.redevActualAcquisitionPrice);
}

/**
 * 원조합원 §166 자산(입주권 · 비승계 완공APT)은 일반 「취득가액 산정 방식」·「취득시/양도시 기준시가」 영역이
 * 화면에 없다 — ⑤ `CompanionAcqPurchaseBlock` 렌더 게이트가 이 술어를 쓴다. 부담부증여는 「② 양도정보」에
 * 기준시가 두 칸이 있어 제외한다(Playwright 실측).
 */
export function redevHidesGeneralAcqSection(
  asset: Pick<AssetForm, "assetKind" | "isSuccessorRightToMoveIn" | "redevIsSuccessorMember" | "transferType">,
): boolean {
  return (
    asset.transferType !== "burdened_gift" &&
    isRedevelopmentSec166Asset(asset) &&
    asset.redevIsSuccessorMember !== "yes"
  );
}

/**
 * 그 자산의 일반 기준시가 두 칸 중 **화면에 없는 칸** — ④는 싣지 않고 ⑧은 감면 기준시가 폴백으로 인정하지 않는다.
 *
 * 감면 카드의 기준시가 칸이 비면 엔진은 자산 기준시가로 대신 계산한다(§97의3⑤·§97의5② 안분 —
 * `rental-97-router.ts`, §99·§99의3·§98의x 5년 안분 — `income-deduction-router.ts`·`unsold-hybrid*.ts`).
 * 숨은 칸에 자산 종류를 바꾸기 전 값이 남아 있으면 그 값이 세액에 들어갔다(330,990,000 대 181,170,000 —
 * 계획서 `docs/00-pm/redev-hidden-stdprice-reduction.plan.md` §1.3).
 *
 * 함께 양도 **안분 모드**의 양도시 기준시가는 안분 키로 화면에 있다(`CompanionSaleModeBlock`) — 계속 인정한다(Q-2 a).
 */
export function redevHiddenGeneralStdPrice(
  asset: Pick<AssetForm, "assetKind" | "isSuccessorRightToMoveIn" | "redevIsSuccessorMember" | "transferType">,
  form: Pick<TransferFormData, "assets" | "assetSplitMode" | "bundledSaleMode">,
): { acq: boolean; transfer: boolean } {
  if (!redevHidesGeneralAcqSection(asset)) return { acq: false, transfer: false };
  const apportionKeyShown =
    form.assets.length > 1 &&
    !isFullFractionalBundle(form.assets, form.assetSplitMode) &&
    effectiveBundledSaleMode(form) === "apportioned";
  return { acq: true, transfer: !apportionKeyShown };
}
