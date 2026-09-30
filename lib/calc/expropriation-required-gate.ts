/**
 * §164⑨ 특례 입력의 **필수 게이트 — ⑧(UI validate)와 ⑫(Zod)가 공유하는 단일 술어**
 * (2026-09-30 Zod↔엔진 필수 점검 2차 EX-1~3 · 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.2).
 *
 * ## 왜 공유하는가
 *
 * 특례 트랙마다 「자산 종류 × 양도원인 × 양도일 × 환산 × 다필지 × 분리취득 × PHD × 겸용」 게이트가 얽혀 있다.
 * ⑫가 이 조건을 따로 적으면 ⑧과 어긋나 「⑧ 통과 ↔ ⑫ 400」(막다른 길) 또는 그 반대가 된다.
 * ⇒ 판정은 **중립 사실(`ExprGateFacts`)** 위에서 이 파일의 함수 하나로 하고, 두 층은 **사실을 만드는
 *   어댑터만** 각자 가진다(⑧: `AssetForm` → 사실 · ⑫: API 본문 → 사실).
 *
 * ## 자산 종류 축 — `assetKind`(⑧) vs `propertyType`(⑫)
 *
 * 두 enum은 다르지만 §164⑨ 트랙이 보는 5개 값(`land`·`building`·`housing`·`general_building`·
 * `commercial_building`)은 **문자열이 같다**(`lib/tax-engine/expropriation-scope.ts` 헤더). 겸용주택만
 * 다르다 — ⑧은 `housing` + `isMixedUseHouse`, ⑫는 `propertyType: "mixed-use-house"`(+ `mixedUse` 서브객체).
 * ⇒ 사실에는 `assetKind: "housing"` + `isMixedUse: true`로 **⑧ 축으로 정규화**해 넣는다(⑫ 어댑터 책임).
 *
 * 자산 종류 목록 자체는 `expropriation-scope.ts` 단일 소스를 조회한다 — 여기서 나열하지 않는다.
 */
import {
  isExprValuationEligibleAssetKind,
  isAuctionEligibleAssetKind,
  isHousingExprEligibleAssetKind,
  isSplitLandExprEligibleAssetKind,
  EXPR_VALUATION_MIN_TRANSFER_DATE as MIN_TRANSFER_DATE,
} from "@/lib/tax-engine/expropriation-scope";

/** 게이트 판정에 쓰는 사실 — 두 층의 어댑터가 채운다 */
export interface ExprGateFacts {
  /** ⑧ `AssetForm.assetKind` 축 (겸용은 `"housing"` + `isMixedUse`) */
  assetKind: string | undefined;
  /** 겸용주택(§160① 단서) */
  isMixedUse: boolean;
  transferCause: string | undefined;
  /** 양도일 YYYY-MM-DD (사전식 비교 = 날짜 비교) */
  transferDate: string | undefined;
  useEstimatedAcquisition: boolean;
  /** 다필지 — 필지별 값을 쓴다(자산-수준 트랙 제외) */
  parcelMode: boolean;
  /** 토지·건물 취득일 분리 */
  separateLandAcquisition: boolean;
  /** §164⑤ 개별주택가격 미공시 3시점 환산 */
  usePreHousingDisclosure: boolean;
  /** §164⑨2호 공매·경락 */
  isAuctionTransfer: boolean;
}

function isAfterMinDate(f: ExprGateFacts): boolean {
  return !!f.transferDate && f.transferDate >= MIN_TRANSFER_DATE;
}

/** 수용 + 양도일 게이트 (자산-수준 공통 축) */
function isExpropriationOnOrAfterMin(f: ExprGateFacts): boolean {
  return f.transferCause === "public_expropriation" && isAfterMinDate(f);
}

/**
 * §164⑨1호 원/㎡ 트랙 — 보상가액(원/㎡)·보상산정 기초 기준시가(원/㎡) 필수.
 * 건물 split은 per-sqm 경로가 우회되고(split 토지분 트랙), 다필지는 필지별 값이다.
 */
export function isExprPerSqmRequired(f: ExprGateFacts): boolean {
  if (!isExprValuationEligibleAssetKind(f.assetKind)) return false;
  if (isSplitLandExprEligibleAssetKind(f.assetKind) && f.separateLandAcquisition) return false;
  if (f.parcelMode) return false;
  if (!f.useEstimatedAcquisition) return false;
  return isExpropriationOnOrAfterMin(f);
}

/**
 * §164⑨2호 공매·경락 — `"conflict"`(1호와 동시 선택: N3 배타) · `"required"`(공매·경락가액 필수) · `null`.
 * 다필지·분리취득은 2호가 엔진에 도달하지 않으므로 값을 요구하지 않는다(A08).
 */
export function exprAuctionGate(f: ExprGateFacts): "conflict" | "required" | null {
  if (!f.isAuctionTransfer) return null;
  if (f.transferCause === "public_expropriation") return "conflict";
  if (!isAuctionEligibleAssetKind(f.assetKind)) return null;
  if (!f.useEstimatedAcquisition) return null;
  if (f.parcelMode || f.separateLandAcquisition) return null;
  if (!isAfterMinDate(f)) return null;
  return "required";
}

/**
 * §164⑨1호 주택(라목) 총액 트랙 — 보상액 총액·보상산정 기초 기준시가 총액 필수.
 * 겸용은 겸용 트랙 전담, 주택 regular split(비-PHD)은 미지원(C-06b가 차단)이라 제외한다.
 */
export function isExprHousingTotalRequired(f: ExprGateFacts): boolean {
  if (!isHousingExprEligibleAssetKind(f.assetKind)) return false;
  if (f.isMixedUse) return false;
  if (f.parcelMode) return false;
  if (f.separateLandAcquisition && !f.usePreHousingDisclosure) return false;
  if (!f.useEstimatedAcquisition) return false;
  return isExpropriationOnOrAfterMin(f);
}

/**
 * §164⑨1호 건물 split 토지분 트랙 — `"required"`(토지분 보상 총액 2필드 필수) ·
 * `"housing_regular_unsupported"`(주택 regular split — 미지원 차단, C-06b·Q6) ·
 * `"companion_unsupported"`(함께양도 자산 — 명시 차단, A05) · `null`.
 */
export function exprSplitLandGate(
  f: ExprGateFacts,
  isNonPrimaryAsset = false,
): "required" | "housing_regular_unsupported" | "companion_unsupported" | null {
  if (f.assetKind === "housing" && f.isMixedUse) return null;
  if (!f.separateLandAcquisition) return null;
  if (f.parcelMode) return null;
  if (!f.useEstimatedAcquisition) return null;
  if (!isExpropriationOnOrAfterMin(f)) return null;
  if (f.assetKind === "housing" && !f.usePreHousingDisclosure) return "housing_regular_unsupported";
  if (!isSplitLandExprEligibleAssetKind(f.assetKind)) return null;
  if (isNonPrimaryAsset) return "companion_unsupported";
  return "required";
}

/**
 * §164⑨1호 겸용주택(나·라 복합) — 주택분·상가분 토지 보상 총액 4필드 필수.
 * 겸용은 환산 기반이라 `useEstimatedAcquisition` 게이트를 두지 않는다.
 */
export function isExprMixedUseRequired(f: ExprGateFacts): boolean {
  if (!(f.assetKind === "housing" && f.isMixedUse)) return false;
  return isExpropriationOnOrAfterMin(f);
}
