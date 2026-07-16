/**
 * 공익수용 §164⑨ 1호 환산 min[] 특례 — 보상 2필드 필수 검증 (⑧).
 *
 * 800줄 정책에 따라 `transfer-tax-validate-asset.ts`에서 분리. 자산-수준(단건)과 필지별(다필지)
 * 검증이 **같은 규약**을 쓰므로 한 파일에 둔다.
 *
 * ## ⑧ 규칙 — UI 노출 조건과 **동일**해야 한다
 *
 * | 층 | 위치 | 조건 |
 * |---|---|---|
 * | UI(단건) | `ExpropriationBlock.tsx` `showValuationMin` | 적격 자산 + 환산 + 양도≥2009.02.04 |
 * | UI(다필지) | `AssetSectionAcquisition.tsx` `showExpropriationMin` × `ParcelListInput` `p.acquisitionMethod` | 수용 + 양도≥2009.02.04 + 필지 환산 |
 * | validate | **이 파일** | 동상 |
 * | 엔진 | `applyExpropriationValuation` (5조건) | 동상 + 후보값 > 0 |
 *
 * 불일치 시 "UI 통과 ↔ validate 차단" 모순이 난다. 적격 자산 판정은
 * `lib/tax-engine/expropriation-scope.ts` **단일 소스** 위임 — 여기서 자산종류를 나열하면 드리프트다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import {
  isExprValuationEligibleAssetKind,
  isAuctionEligibleAssetKind,
  EXPR_VALUATION_MIN_TRANSFER_DATE as MIN_TRANSFER_DATE,
} from "@/lib/tax-engine/expropriation-scope";
import type { AssetForm, ParcelFormItem } from "@/lib/stores/calc-wizard-asset";

/** 수용 + 양도일 게이트 (자산-수준 공통 축) */
function isExprValuationDateAndCauseOk(
  asset: AssetForm,
  formTransferDate: string | undefined,
): boolean {
  return (
    asset.transferCause === "public_expropriation" &&
    !!formTransferDate &&
    formTransferDate >= MIN_TRANSFER_DATE
  );
}

/**
 * 자산-수준(단건) 보상 2필드 필수 검증.
 * 다필지는 필지별 값을 쓰므로 제외한다(`validateExprValuationParcel`).
 */
export function validateExprValuationAsset(
  asset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
): string | null {
  if (!isExprValuationEligibleAssetKind(asset.assetKind)) return null;
  if (asset.parcelMode) return null; // 다필지 → 필지별 검증
  if (!asset.useEstimatedAcquisition) return null;
  if (!isExprValuationDateAndCauseOk(asset, formTransferDate)) return null;

  if (!parseAmount(asset.compensationPerSqm))
    return `${label}: 공익수용 환산 특례 — 보상가액(원/㎡)을 입력하세요.`;
  if (!parseAmount(asset.compensationBasisStdPrice))
    return `${label}: 공익수용 환산 특례 — 보상산정 기초 기준시가(원/㎡)를 입력하세요.`;
  return null;
}

/**
 * 필지별 보상 2필드 필수 검증 (다필지).
 * 필지마다 개별공시지가가 달라 min[] 선택이 독립이므로 값도 필지별이다.
 *
 * @param primary 자산(수용 여부·양도원인은 자산-수준)
 * @param parcel  대상 필지 (환산 방식일 때만 의미)
 * @param label   "필지 N"
 */
export function validateExprValuationParcel(
  primary: AssetForm,
  parcel: ParcelFormItem,
  label: string,
  formTransferDate: string | undefined,
): string | null {
  if (parcel.acquisitionMethod !== "estimated") return null;
  if (!isExprValuationDateAndCauseOk(primary, formTransferDate)) return null;

  if (!parseAmount(parcel.compensationPerSqm))
    return `${label}: 공익수용 환산 특례 — 보상가액(원/㎡)을 입력하세요.`;
  if (!parseAmount(parcel.compensationBasisStdPrice))
    return `${label}: 공익수용 환산 특례 — 보상산정 기초 기준시가(원/㎡)를 입력하세요.`;
  return null;
}

/**
 * §164⑨2호 공매·경락 특례 검증 (P4).
 * N3 배타(1호와 동시 불가) + 게이트 충족 시 공매·경락가액 필수.
 */
export function validateAuctionAsset(
  asset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
): string | null {
  if (!asset.isAuctionTransfer) return null;
  // N3 배타 — 1호(수용)와 동시 불가(§164⑨ "어느 하나"). 상태 무관 우선 차단.
  if (asset.transferCause === "public_expropriation")
    return `${label}: 공익수용(1호)과 공매·경락(2호) 특례는 동시에 적용할 수 없습니다(§164⑨ "어느 하나").`;
  if (!isAuctionEligibleAssetKind(asset.assetKind)) return null;
  if (!asset.useEstimatedAcquisition) return null;
  if (!formTransferDate || formTransferDate < MIN_TRANSFER_DATE) return null;

  if (!parseAmount(asset.auctionPrice))
    return `${label}: 공매·경락 특례 — 공매·경락가액을 입력하세요.`;
  return null;
}
