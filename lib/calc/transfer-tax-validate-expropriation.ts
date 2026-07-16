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
  isHousingExprEligibleAssetKind,
  isSplitLandExprEligibleAssetKind,
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
  // 건물 split(토지·건물 취득일 분리)은 per-sqm 경로가 우회되고 UI도 per-sqm 블록을 숨긴다
  // (`ExpropriationBlock.tsx` `showValuationMin = ... && !isSplitBuilding`) → per-sqm 필드를
  // 요구하면 "UI 통과 ↔ validate 차단" 모순(숨겨진 필드 요구)이 된다. split 토지분 검증에 위임.
  if (isSplitLandExprEligibleAssetKind(asset.assetKind) && asset.hasSeperateLandAcquisitionDate) return null;
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

/**
 * §164⑨1호 주택(라목) 총액 트랙 검증 (P5).
 * 주택 수용 + 환산 + 2009.02.04 시 보상 총액 2필드 필수.
 */
export function validateHousingExprAsset(
  asset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
): string | null {
  if (!isHousingExprEligibleAssetKind(asset.assetKind)) return null;
  if (asset.parcelMode) return null;
  // 주택 **regular** split(토지·건물 취득일 분리, 비-PHD)만 총액 트랙에서 제외 → §164⑨ 미지원(Q6),
  // C-06b(`validateSplitLandExprAsset`)가 차단 메시지 담당. UI도 `showHousingTotal`에서 숨긴다.
  // 주택 **PHD** split(§164⑦ 3시점 환산)은 총액 트랙을 정상 소비하므로(P6b/D15) 여기서 필드를 요구한다.
  if (asset.hasSeperateLandAcquisitionDate && !asset.usePreHousingDisclosure) return null;
  if (!asset.useEstimatedAcquisition) return null;
  if (!isExprValuationDateAndCauseOk(asset, formTransferDate)) return null;

  if (!parseAmount(asset.housingCompensationTotal))
    return `${label}: 주택 수용 환산 특례 — 보상액 총액을 입력하세요.`;
  if (!parseAmount(asset.housingCompensationBasisTotal))
    return `${label}: 주택 수용 환산 특례 — 보상산정 기초 기준시가 총액을 입력하세요.`;
  return null;
}

/**
 * §164⑨1호 건물 split 토지분 트랙 검증 (P6/D6) + 주택 regular split 차단 (C-06b·Q6).
 *
 * - **건물(나목) split** + 수용 + 환산 + 2009.02.04: 토지분 보상 총액 2필드 필수.
 * - **주택(라목) regular split**(비-PHD) + 수용 + 환산: **차단** — 개별주택가격은 총액이라
 *   토지·건물로 분해되지 않아 각목별 차감(§164⑨)을 적용할 수 없다(계획 Q6). PHD(§164⑦
 *   3시점 환산)는 분해를 수행하므로 제외(D15, 후속).
 */
export function validateSplitLandExprAsset(
  asset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
): string | null {
  // split(토지·건물 취득일 분리) + 수용 + 환산 + 2009.02.04 조합에서만 판정
  if (!asset.hasSeperateLandAcquisitionDate) return null;
  if (asset.parcelMode) return null;
  if (!asset.useEstimatedAcquisition) return null;
  if (!isExprValuationDateAndCauseOk(asset, formTransferDate)) return null;

  // C-06b — 주택 regular split(비-PHD)은 미지원. 총액 미분해로 §164⑨ 각목별 차감 불가.
  if (asset.assetKind === "housing" && !asset.usePreHousingDisclosure) {
    return `${label}: 주택은 토지·건물 취득일 분리(분리 양도) + 공익수용 환산 시 개별주택가격이 총액이라 §164⑨ 특례를 적용할 수 없습니다(미지원). 취득일을 분리하지 않거나 실지취득가액으로 계산하세요.`;
  }

  // 건물(나목) split — 토지분 보상 총액 2필드 필수
  if (!isSplitLandExprEligibleAssetKind(asset.assetKind)) return null;
  if (!parseAmount(asset.splitLandCompensationTotal))
    return `${label}: 건물 분리 양도 공익수용 환산 특례 — 토지분 보상액 총액을 입력하세요.`;
  if (!parseAmount(asset.splitLandCompensationBasisTotal))
    return `${label}: 건물 분리 양도 공익수용 환산 특례 — 토지분 보상산정 기초 기준시가 총액을 입력하세요.`;
  return null;
}
