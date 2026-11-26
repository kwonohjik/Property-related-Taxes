/**
 * ⑧ 지분 모드 × 가업상속공제(transfer-fb-share UI 계획 §4.5) — 카드마다 자기 지분율로 판정한다.
 *
 * - V8-1 «물건 전체 기준» 확인(`fbShareBasisConfirmed`) — 화면 전용 확인이라 ⑫는 막지 않는다(의도된 비대칭 · `ownershipRemainderThirdParty` 선례).
 * - V8-3 지분율을 곱한 평가액 0원 — ⑫와 같은 엔진 술어(`familyBusinessShareMarketValueVanishes`).
 * 지분율은 ④가 body `ownershipRatio`를 만드는 것과 같은 함수(`getOwnershipRatio`)를 쓴다 — 엔진이 곱하는 값과 같다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { formatOwnershipPercent, getOwnershipRatio } from "./transfer-tax-api-asset-basics";
import {
  FB_SHARE_MARKET_VALUE_ZERO_MESSAGE,
  familyBusinessShareMarketValueVanishes,
} from "@/lib/tax-engine/family-business-share";

/** 지분 모드(지분율 < 1)인가 — ⑤ 안내 블록·⑧이 같은 술어를 쓴다 */
export function isFamilyBusinessShareMode(asset: AssetForm): boolean {
  return asset.familyBusinessInheritance !== undefined && getOwnershipRatio(asset) < 1;
}

export function familyBusinessSharePercentText(asset: AssetForm): string {
  return formatOwnershipPercent(asset.ownershipNumerator, asset.ownershipDenominator);
}

export function familyBusinessShareError(
  asset: AssetForm,
  fb: NonNullable<AssetForm["familyBusinessInheritance"]>,
): string | null {
  if (!isFamilyBusinessShareMode(asset)) return null;
  if (asset.fbShareBasisConfirmed !== true)
    return `지분 모드(${familyBusinessSharePercentText(asset)})의 가업상속공제 금액은 물건 전체(100%) 기준입니다. 금액이 물건 전체 기준인지 확인하는 항목을 켜세요.`;
  if (familyBusinessShareMarketValueVanishes(fb, getOwnershipRatio(asset))) return FB_SHARE_MARKET_VALUE_ZERO_MESSAGE;
  return null;
}
