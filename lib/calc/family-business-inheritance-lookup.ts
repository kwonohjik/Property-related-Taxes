/**
 * 가업상속공제 적용 자산 양도세 prefill — Mediator (UI ↔ Storage ↔ Engine)
 *
 * Track 2 (transfer-fb-cgt-credit-integration) K10 — 상속세 마법사 결과에서
 * 가업상속공제 적용 사례를 추출하여 양도세 마법사
 * `FamilyBusinessInheritanceTransferSection`의 4 필드 prefill 소스 제공.
 *
 * Source 매핑 (상속세 result → 양도세 input):
 *   - `fbDeductionAppliedRate` ← `result.deductionDetail.familyBusinessDetail.appliedRate` (commit 1ce8820)
 *   - `inheritanceDate`        ← `input.deathDate` (상속개시일)
 *   - `inheritanceMarketValue` ← `input.estateItems[i].marketValue` (사용자가 1건 선택)
 *   - `decedentAcquisitionPrice` ← ❌ 상속세 엔진 미추적 → 사용자 별도 입력
 *
 * 정책:
 *   - 후보 함수는 records 인자만 받음 (repository 호출 책임은 modal에 위임)
 *   - 손상 레코드는 warnings에 기록 후 silent skip (throw 금지)
 *   - taxType !== "inheritance" → silent skip
 *   - familyBusinessDetail.deduction === 0 → skip (가업상속공제 미적용)
 *   - appliedRate === 0 → skip (분모 0 가드)
 *   - 가업 자산 0건 → warnings.no_assets
 *   - 양도일 < deathDate → warnings.transfer_before_inheritance
 *
 * Design: docs/02-design/features/transfer-fb-cgt-credit-integration/engine.design.md K10
 */

import type { FamilyBusinessRateBasis } from "@/lib/tax-engine/family-business-applied-rate";
import type { FamilyBusinessRateUnavailableReason } from "@/lib/tax-engine/family-business-applied-rate";
import { deriveFamilyBusinessRateBasis } from "@/lib/tax-engine/family-business-applied-rate";
import { basisToFraction } from "@/lib/tax-engine/family-business-applied-rate";
import { calcCorporateBusinessAssets } from "@/lib/tax-engine/property-valuation-corporate";
import { resolveEstateItemValue } from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { CalculationRecord } from "@/lib/storage/types";

// ============================================================
// 공개 타입
// ============================================================

/**
 * 가업상속공제 적용 자산 후보 (양도세 prefill 소스).
 */
export interface FamilyBusinessInheritanceCandidate {
  /** Source 식별자 (record.id) — 선택 후 sourceCalculationId로 전달 */
  calculationId: string;
  /** 상속개시일 (ISO YYYY-MM-DD) — inheritanceDate prefill */
  deathDate: string;
  /** 상속세 엔진 적용률(공제 ÷ 재산가액, 0~1) — 정보용. prefill은 자산별 `rateBasis`를 쓴다 */
  appliedRate: number;
  /** 가업상속공제 적용액 (원) — 정보용 표시 */
  deduction: number;
  /** 자동/직접입력 모드 표시용 */
  usedDirectInput: boolean;
  /** 영위 연수 (정보용 라벨) */
  operatingYears: number;
  /** 가업 자산 목록 (사용자가 1건 선택 → inheritanceMarketValue prefill) */
  familyBusinessAssets: FamilyBusinessAssetCandidate[];
  /** 저장 시각 — 정렬 동률 시 사용 */
  createdAt: string;
  /** 자동 생성 title — 결과 화면 링크 라벨 */
  title: string;
}

/**
 * 가업상속공제 분류된 EstateItem 1건 (자산-수준 후보).
 */
export interface FamilyBusinessAssetCandidate {
  /** EstateItem.id (없으면 인덱스 기반 fallback `idx-${i}`) */
  itemId: string;
  /** EstateItem.name — 카드 라벨 */
  name: string;
  /** EstateItem.familyBusinessCategory — 자동 분류 라벨 */
  category: string;
  /** 상속개시일 평가액 — inheritanceMarketValue prefill 값 (상속세 엔진과 같은 `resolveEstateItemValue`) */
  marketValue: number;
  /**
   * 이 자산의 적용률 법정량 — 양도일로 신·구 산식을 고른 결과(`deriveFamilyBusinessRateBasis`).
   * 법인가업 주식은 양도일 2026.2.27. 이후 (총자산 − 사업무관자산) ÷ 총자산이라 자산마다 다르다.
   */
  rateBasis?: FamilyBusinessRateBasis;
  /** 이력에서 적용률을 산정할 수 없는 사유 — 선택은 되지만 적용률은 사용자가 입력한다 */
  rateUnavailable?: FamilyBusinessRateUnavailableReason;
}

/** 이력 불러오기를 쓰는 화면 — 법인가업의 대상 자산은 주식등이다(「소득세법 시행령」 §163의2④2호) */
export type FbLookupTarget = "real_estate" | "stock";

export type FbLookupWarningReason =
  | "result_missing"
  | "no_family_business"
  | "rate_zero"
  | "no_assets"
  | "transfer_before_inheritance"
  | "death_date_missing"
  /** 가업 자산은 있으나 모두 다른 화면의 대상(부동산 화면의 법인 주식 · 주식 화면의 사업용 자산) */
  | "wrong_target_only";

export interface FbLookupWarning {
  calculationId: string;
  reason: FbLookupWarningReason;
  message: string;
}

export interface FbLookupResult {
  candidates: FamilyBusinessInheritanceCandidate[];
  warnings: FbLookupWarning[];
}

/**
 * 양도세 마법사 prefill payload — 선택 후 store에 set할 슬라이스.
 *   decedentAcquisitionPrice는 0 — UI에서 사용자가 별도 입력해야 함.
 */
export interface FamilyBusinessInheritancePrefill {
  /** 0 — 사용자 별도 입력 필요 (상속세 엔진 미추적) */
  decedentAcquisitionPrice: number;
  /** 선택된 자산의 marketValue */
  inheritanceMarketValue: number;
  /** 0~1 */
  fbDeductionAppliedRate: number;
  /** 적용률 법정량 — 있으면 `fbDeductionAppliedRate`는 그 비율의 표시값이다 */
  fbRateBasis?: FamilyBusinessRateBasis;
  /** 적용률을 이력에서 산정할 수 없었다 — 화면은 빈 금액 입력으로 시작해 사용자 입력을 받는다 */
  rateUnavailable?: FamilyBusinessRateUnavailableReason;
  /** YYYY-MM-DD */
  inheritanceDate: string;
  /** Source 추적 */
  sourceCalculationId: string;
  /** Source 자산 식별자 (메타 표시용) */
  sourceItemId: string;
}

// ============================================================
// 후보 필터링
// ============================================================

/**
 * 상속세 이력에서 가업상속공제 적용 사례를 추출.
 *
 * 알고리즘:
 *   1. taxType !== "inheritance" → silent skip
 *   2. result.deductionDetail.familyBusinessDetail 누락 → warnings.result_missing
 *   3. familyBusinessDetail.deduction === 0 → warnings.no_family_business
 *   4. appliedRate === 0 (또는 NaN) → warnings.rate_zero
 *   5. input.deathDate 누락 → warnings.death_date_missing
 *   6. 양도일 < deathDate → warnings.transfer_before_inheritance
 *   7. estateItems 중 familyBusinessCategory 가진 항목 0건 → warnings.no_assets
 *   8. 위 모두 통과 → candidates.push (자산 목록 포함)
 *
 * 정렬: deathDate desc → createdAt desc
 */
export function filterFamilyBusinessInheritanceCandidates(
  records: CalculationRecord[],
  currentTransferDate: string,
  target: FbLookupTarget = "real_estate",
): FbLookupResult {
  const current = new Date(currentTransferDate);
  const candidates: FamilyBusinessInheritanceCandidate[] = [];
  const warnings: FbLookupWarning[] = [];

  for (const record of records) {
    if (record.taxType !== "inheritance") continue; // 다른 세목 — silent

    const input = record.inputData as Record<string, unknown> | undefined;
    const rawResult = record.resultData as Record<string, unknown> | undefined;
    const result =
      rawResult && typeof rawResult === "object" && "result" in rawResult
        ? (rawResult.result as Record<string, unknown>)
        : rawResult;

    const deductionDetail = result?.deductionDetail as
      | Record<string, unknown>
      | undefined;
    const fbDetail = deductionDetail?.familyBusinessDetail as
      | Record<string, unknown>
      | undefined;

    if (!fbDetail || typeof fbDetail !== "object") {
      warnings.push({
        calculationId: record.id,
        reason: "result_missing",
        message: `${record.title}: 가업상속공제 상세 누락`,
      });
      continue;
    }

    const deduction = fbDetail.deduction;
    if (typeof deduction !== "number" || deduction <= 0) {
      warnings.push({
        calculationId: record.id,
        reason: "no_family_business",
        message: `${record.title}: 가업상속공제 미적용`,
      });
      continue;
    }

    const appliedRate = fbDetail.appliedRate;
    if (typeof appliedRate !== "number" || !isFinite(appliedRate) || appliedRate <= 0) {
      warnings.push({
        calculationId: record.id,
        reason: "rate_zero",
        message: `${record.title}: 가업상속공제 적용률 0 — 의제 산식 적용 불가`,
      });
      continue;
    }

    const deathDate = input?.deathDate;
    if (typeof deathDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(deathDate)) {
      warnings.push({
        calculationId: record.id,
        reason: "death_date_missing",
        message: `${record.title}: 상속개시일(deathDate) 누락 또는 형식 오류`,
      });
      continue;
    }

    const deathDateObj = new Date(deathDate);
    if (deathDateObj > current) {
      warnings.push({
        calculationId: record.id,
        reason: "transfer_before_inheritance",
        message: `${record.title}: 상속개시일(${deathDate})이 현재 양도일 이후 — 양도 불가`,
      });
      continue;
    }

    const usedDirectInput =
      typeof fbDetail.usedDirectInput === "boolean" ? fbDetail.usedDirectInput : false;
    const operatingYears =
      typeof fbDetail.operatingYears === "number" ? fbDetail.operatingYears : 0;

    // 가업 자산 추출 — 이력 `inputData`는 상속세 **폼 상태**라 주식 카드는 `stockItems`에 있다
    // (`InheritanceTaxForm` — 엔진 input은 두 배열을 합친다). 종전에는 `estateItems`만 읽어
    // 법인가업 주식(주식 카드에서만 고를 수 있다)이 후보에 오지 않았다.
    const items = [
      ...(Array.isArray(input?.estateItems) ? (input.estateItems as Array<Record<string, unknown>>) : []),
      ...(Array.isArray(input?.stockItems) ? (input.stockItems as Array<Record<string, unknown>>) : []),
    ];
    const familyBusinessAssets: FamilyBusinessAssetCandidate[] = [];
    let otherTargetCount = 0;
    items.forEach((item, i) => {
      if (!item || typeof item !== "object") return;
      const cat = item.familyBusinessCategory;
      if (typeof cat !== "string" || cat.length === 0) return;
      // 상속개시일 평가액 — 상속세 엔진과 같은 해석(시가·감정가·매매사례·기준시가·비상장 평가).
      // 종전에는 `marketValue`만 보아 감정가·기준시가·비상장 평가 자산이 조용히 빠졌다.
      const marketValue = resolveEstateItemValue(item as unknown as EstateItem, deathDate);
      if (!(marketValue > 0)) return;
      const isCorporateStock = cat === "corporate_stock";
      if (isCorporateStock !== (target === "stock")) {
        otherTargetCount += 1;
        return;
      }
      const totalAssets = item.corporateTotalAssets;
      const derived = deriveFamilyBusinessRateBasis({
        transferDate: current,
        isCorporateStock,
        deduction,
        finalValue: fbDetail.finalValue,
        usedDirectInput,
        corporate:
          isCorporateStock && typeof totalAssets === "number" && totalAssets > 0
            ? calcCorporateBusinessAssets(
                totalAssets,
                item.corporateNonBusinessAssets as Parameters<typeof calcCorporateBusinessAssets>[1],
                deathDate,
              )
            : undefined,
      });
      familyBusinessAssets.push({
        itemId: typeof item.id === "string" ? item.id : `idx-${i}`,
        name: typeof item.name === "string" ? item.name : `자산 ${i + 1}`,
        category: cat,
        marketValue,
        // 구 레코드(공제액·재산가액 정수 echo 없음)는 이력의 `appliedRate`(구 ③ 산식 그대로)를 쓴다 — 사유를 싣지 않는다.
        ...("basis" in derived
          ? { rateBasis: derived.basis }
          : derived.unavailable === "deduction_missing"
            ? {}
            : { rateUnavailable: derived.unavailable }),
      });
    });

    if (familyBusinessAssets.length === 0) {
      warnings.push(
        otherTargetCount > 0
          ? {
              calculationId: record.id,
              reason: "wrong_target_only",
              message:
                target === "real_estate"
                  ? `${record.title}: 가업 자산이 법인가업 주식뿐 — 주식 양도 화면에서 불러오세요`
                  : `${record.title}: 가업 자산이 개인가업 사업용 자산뿐 — 부동산 양도 화면에서 불러오세요`,
            }
          : {
              calculationId: record.id,
              reason: "no_assets",
              message: `${record.title}: 가업 분류 자산 0건 — 직접입력 모드 사례`,
            },
      );
      continue;
    }

    candidates.push({
      calculationId: record.id,
      deathDate,
      appliedRate,
      deduction,
      usedDirectInput,
      operatingYears,
      familyBusinessAssets,
      createdAt: record.createdAt,
      title: record.title,
    });
  }

  // 정렬: deathDate desc → createdAt desc
  candidates.sort((a, b) => {
    if (a.deathDate !== b.deathDate) return a.deathDate < b.deathDate ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  return { candidates, warnings };
}

// ============================================================
// 후보 → prefill 변환
// ============================================================

/**
 * 후보 + 선택 자산 인덱스 → 양도세 prefill payload.
 *
 * decedentAcquisitionPrice는 0으로 반환 — 상속세 엔진 미추적 필드이므로
 * 사용자가 UI에서 별도 입력해야 함.
 */
export function candidateToPrefill(
  candidate: FamilyBusinessInheritanceCandidate,
  selectedAssetItemId: string,
): FamilyBusinessInheritancePrefill | null {
  const asset = candidate.familyBusinessAssets.find((a) => a.itemId === selectedAssetItemId);
  if (!asset) return null;

  return {
    decedentAcquisitionPrice: 0,
    inheritanceMarketValue: asset.marketValue,
    // 법정량이 있으면 표시값도 그 비율로 맞춘다 — ⑧·⑫ 정합 술어(`familyBusinessRateBasisError`)가 둘을 대조한다.
    // 산정할 수 없으면 0으로 두고 사유를 넘긴다 — 1(직접입력 모드의 표시값) 등으로 채우지 않는다(자동 fallback 금지).
    fbDeductionAppliedRate: asset.rateBasis
      ? (() => {
          const f = basisToFraction(asset.rateBasis);
          return f.numerator / f.denominator;
        })()
      : asset.rateUnavailable
        ? 0
        : candidate.appliedRate,
    ...(asset.rateBasis ? { fbRateBasis: asset.rateBasis } : {}),
    ...(asset.rateUnavailable ? { rateUnavailable: asset.rateUnavailable } : {}),
    inheritanceDate: candidate.deathDate,
    sourceCalculationId: candidate.calculationId,
    sourceItemId: asset.itemId,
  };
}
