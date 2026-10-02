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
import { EXPR_VALUATION_MIN_TRANSFER_DATE as MIN_TRANSFER_DATE } from "@/lib/tax-engine/expropriation-scope";
import {
  type ExprGateFacts,
  isExprPerSqmRequired,
  exprAuctionGate,
  isExprHousingTotalRequired,
  exprSplitLandGate,
  isExprMixedUseRequired,
} from "./expropriation-required-gate";
import type { AssetForm, ParcelFormItem } from "@/lib/stores/calc-wizard-asset";
import { fieldError } from "./transfer-tax-validate-field";

/**
 * ⑧ 어댑터 — `AssetForm` → 게이트 사실. 판정은 `expropriation-required-gate.ts`가 한다
 * (⑫ `lib/api/transfer-tax-schema-required-refines-2a.ts`와 **같은 술어** — 2026-09-30 EX-1~3).
 */
function exprFactsFromAsset(asset: AssetForm, formTransferDate: string | undefined): ExprGateFacts {
  return {
    assetKind: asset.assetKind,
    isMixedUse: asset.assetKind === "housing" && !!asset.isMixedUseHouse,
    transferCause: asset.transferCause,
    transferDate: formTransferDate,
    useEstimatedAcquisition: !!asset.useEstimatedAcquisition,
    parcelMode: !!asset.parcelMode,
    separateLandAcquisition: !!asset.hasSeperateLandAcquisitionDate,
    usePreHousingDisclosure: !!asset.usePreHousingDisclosure,
    isAuctionTransfer: !!asset.isAuctionTransfer,
  };
}

/** 수용 + 양도일 게이트 (필지 축 — `validateExprValuationParcel` 전용) */
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
  // 게이트 = `isExprPerSqmRequired` — 적격 자산 · 건물 split 제외(per-sqm 경로 우회 + UI가 블록을
  // 숨김 → 요구하면 숨겨진 칸 요구) · 다필지 제외(필지별 검증) · 환산 · 수용 + 2009.02.04.
  if (!isExprPerSqmRequired(exprFactsFromAsset(asset, formTransferDate))) return null;

  if (!parseAmount(asset.compensationPerSqm))
    return fieldError("compensationPerSqm", `${label}: 공익수용 환산 특례 — 보상가액(원/㎡)을 입력하세요.`);
  if (!parseAmount(asset.compensationBasisStdPrice))
    return fieldError("compensationBasisStdPrice", `${label}: 공익수용 환산 특례 — 보상산정 기초 기준시가(원/㎡)를 입력하세요.`);
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

  // 필지별 입력칸의 앵커 키 — `parcels.${i}.…` (`ParcelListInput`)
  const parcelIdx = Math.max(0, (primary.parcels ?? []).indexOf(parcel));

  if (!parseAmount(parcel.compensationPerSqm))
    return fieldError(`parcels.${parcelIdx}.compensationPerSqm`, `${label}: 공익수용 환산 특례 — 보상가액(원/㎡)을 입력하세요.`);
  if (!parseAmount(parcel.compensationBasisStdPrice))
    return fieldError(`parcels.${parcelIdx}.compensationBasisStdPrice`, `${label}: 공익수용 환산 특례 — 보상산정 기초 기준시가(원/㎡)를 입력하세요.`);
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
  // 게이트 = `exprAuctionGate`. N3 배타 — 1호(수용)와 동시 불가(§164⑨ "어느 하나"), 상태 무관 우선 차단.
  // A08: 다필지·분리취득은 §164⑨2호가 엔진에 도달하지 않으므로 값을 요구하지 않는다 — 요구해 놓고
  // 무시하면 「차단됐다」가 아니라 「필수 입력을 버린다」가 된다.
  const gate = exprAuctionGate(exprFactsFromAsset(asset, formTransferDate));
  if (gate === "conflict")
    return `${label}: 공익수용(1호)과 공매·경락(2호) 특례는 동시에 적용할 수 없습니다(§164⑨ "어느 하나").`;
  if (gate !== "required") return null;

  if (!parseAmount(asset.auctionPrice))
    return fieldError("auctionPrice", `${label}: 공매·경락 특례 — 공매·경락가액을 입력하세요.`);
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
  // 게이트 = `isExprHousingTotalRequired`. 겸용은 `validateMixedUseExprAsset` 전담. 주택 **regular**
  // split(비-PHD)은 총액 트랙에서 제외(§164⑨ 미지원 Q6 — C-06b가 차단 메시지 담당, UI도 숨김).
  // 주택 **PHD** split(§164⑦ 3시점 환산)은 총액 트랙을 정상 소비하므로(P6b/D15) 필드를 요구한다.
  if (!isExprHousingTotalRequired(exprFactsFromAsset(asset, formTransferDate))) return null;

  if (!parseAmount(asset.housingCompensationTotal))
    return fieldError("housingCompensationTotal", `${label}: 주택 수용 환산 특례 — 보상액 총액을 입력하세요.`);
  if (!parseAmount(asset.housingCompensationBasisTotal))
    return fieldError("housingCompensationBasisTotal", `${label}: 주택 수용 환산 특례 — 보상산정 기초 기준시가 총액을 입력하세요.`);
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
  isNonPrimaryAsset = false,
): string | null {
  // 게이트 = `exprSplitLandGate` — split + 다필지 아님 + 환산 + 수용 + 2009.02.04 조합에서만 판정.
  // 겸용주택은 `validateMixedUseExprAsset` 전담(겸용은 항상 hasSeperateLandAcquisitionDate=true라
  // 제외하지 않으면 C-06b가 오발동해 겸용 수용을 "미지원"으로 잘못 차단한다 — 코드리뷰 2026-07-17).
  const gate = exprSplitLandGate(exprFactsFromAsset(asset, formTransferDate), isNonPrimaryAsset);

  // C-06b — 주택 regular split(비-PHD)은 미지원. 총액 미분해로 §164⑨ 각목별 차감 불가.
  if (gate === "housing_regular_unsupported") {
    return `${label}: 주택은 토지·건물 취득일 분리(분리 양도) + 공익수용 환산 시 개별주택가격이 총액이라 §164⑨ 특례를 적용할 수 없습니다(미지원). 취득일을 분리하지 않거나 실지취득가액으로 계산하세요.`;
  }

  /**
   * A05(2026-09-02): **컴패니언(함께양도 2번째 이후) 자산은 이 조합을 지원하지 않는다.**
   *
   * 종전에는 ⑧이 「토지분 보상액 총액을 입력하세요」로 **입력을 강제해 놓고** 그 값을 버렸다 —
   * 2필드가 ④⑫⑭ 어디에도 없어 엔진에 도달하지 않는다. 게다가 그 조합 전체가 원인 불명의
   * **HTTP 500**으로 죽는다(컴패니언 `standardPricePerSqmAtAcquisition` 채널 부재 —
   * 배선 지점 3곳이 전부 단건 전용이라 `calcSplitGain`이 `TaxCalculationError`를 던진다).
   *
   * 사용자 결정(2026-09-02)에 따라 **명시 차단**으로 확정한다. 2필드만 배선하는 것은
   * 금지다 — perSqm 채널을 먼저 열지 않으면 no-op이고(실측: 주입 전후 THROW 동일),
   * 채널을 여는 것은 신규 기능 규모다.
   *
   * 차단은 부수적으로 그 500 경로를 **도달 불가**로 만든다.
   */
  if (gate === "companion_unsupported") {
    return `${label}: 함께양도 자산은 토지·건물 분리취득 + 공익수용 환산(§164⑨1호) 조합을 지원하지 않습니다. 해당 자산을 첫 번째로 옮기거나 취득일 분리를 해제하세요.`;
  }

  if (gate !== "required") return null;

  if (!parseAmount(asset.splitLandCompensationTotal))
    return fieldError("splitLandCompensationTotal", `${label}: 건물 분리 양도 공익수용 환산 특례 — 토지분 보상액 총액을 입력하세요.`);
  if (!parseAmount(asset.splitLandCompensationBasisTotal))
    return fieldError("splitLandCompensationBasisTotal", `${label}: 건물 분리 양도 공익수용 환산 특례 — 토지분 보상산정 기초 기준시가 총액을 입력하세요.`);
  return null;
}

/**
 * §164⑨1호 겸용주택(나·라 복합) 공익수용 특례 검증 (P7/D8, 일반 §97).
 * 겸용 + 수용 + 2009.02.04 시 주택분·상가분 토지 보상 총액 4필드 필수(UI 노출 조건과 동일).
 * 겸용은 환산 기반이라 useEstimatedAcquisition 게이트는 두지 않는다(엔진이 환산 분모에만 적용).
 */
export function validateMixedUseExprAsset(
  asset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
): string | null {
  if (!isExprMixedUseRequired(exprFactsFromAsset(asset, formTransferDate))) return null;

  if (!parseAmount(asset.housingCompensationTotal))
    return fieldError("housingCompensationTotal", `${label}: 겸용주택 수용 — 주택분 보상액 총액을 입력하세요.`);
  if (!parseAmount(asset.housingCompensationBasisTotal))
    return fieldError("housingCompensationBasisTotal", `${label}: 겸용주택 수용 — 주택분 보상산정 기초 기준시가 총액을 입력하세요.`);
  if (!parseAmount(asset.mixedCommercialLandCompensationTotal))
    return fieldError("mixedCommercialLandCompensationTotal", `${label}: 겸용주택 수용 — 상가분 토지 보상액 총액을 입력하세요.`);
  if (!parseAmount(asset.mixedCommercialLandCompensationBasisTotal))
    return fieldError("mixedCommercialLandCompensationBasisTotal", `${label}: 겸용주택 수용 — 상가분 토지 보상산정 기초 개별공시지가 총액을 입력하세요.`);
  return null;
}
