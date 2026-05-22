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
  /** 가업상속공제 적용률 (0~1) — fbDeductionAppliedRate prefill */
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
  /** EstateItem.marketValue — inheritanceMarketValue prefill 값 */
  marketValue: number;
}

export type FbLookupWarningReason =
  | "result_missing"
  | "no_family_business"
  | "rate_zero"
  | "no_assets"
  | "transfer_before_inheritance"
  | "death_date_missing";

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

    // 가업 자산 추출
    const estateItems = Array.isArray(input?.estateItems)
      ? (input.estateItems as Array<Record<string, unknown>>)
      : [];
    const familyBusinessAssets: FamilyBusinessAssetCandidate[] = [];
    estateItems.forEach((item, i) => {
      if (!item || typeof item !== "object") return;
      const cat = item.familyBusinessCategory;
      if (typeof cat !== "string" || cat.length === 0) return;
      const marketValue = item.marketValue;
      if (typeof marketValue !== "number" || marketValue <= 0) return;
      familyBusinessAssets.push({
        itemId: typeof item.id === "string" ? item.id : `idx-${i}`,
        name: typeof item.name === "string" ? item.name : `자산 ${i + 1}`,
        category: cat,
        marketValue,
      });
    });

    if (familyBusinessAssets.length === 0) {
      warnings.push({
        calculationId: record.id,
        reason: "no_assets",
        message: `${record.title}: 가업 분류 자산 0건 — 직접입력 모드 사례`,
      });
      continue;
    }

    const usedDirectInput =
      typeof fbDetail.usedDirectInput === "boolean" ? fbDetail.usedDirectInput : false;
    const operatingYears =
      typeof fbDetail.operatingYears === "number" ? fbDetail.operatingYears : 0;

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
    fbDeductionAppliedRate: candidate.appliedRate,
    inheritanceDate: candidate.deathDate,
    sourceCalculationId: candidate.calculationId,
    sourceItemId: asset.itemId,
  };
}
