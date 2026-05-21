/**
 * 증여세 사전증여 이력 조회·변환 — Mediator (UI ↔ Storage ↔ Engine helper)
 *
 * 책임:
 *   1. IndexedDB의 증여세 이력(CalculationRecord[])에서 §47 합산 후보를 추출
 *   2. 엔진 헬퍼(isSameDonorGroup·differenceInYears)를 single source of truth로 재사용
 *   3. PriorGiftCandidate → PriorGift 변환
 *
 * 정책:
 *   - 후보 함수는 records 인자만 받음 (repository 호출 책임은 modal에 위임)
 *   - 손상 레코드는 warnings에 기록 후 silent skip (throw 금지)
 *   - inputData는 GiftTaxForm.FormState 그대로 직렬화된 형태 (priorGifts·donor·donorRelation 등)
 *   - 합산 회차(inputData.priorGifts.length > 0)는 포함 + hasInnerPriorGifts 메타 부착
 *
 * Design: docs/02-design/features/gift-tax-prior-gift-history-lookup.design.md
 * Plan:   docs/00-pm/gift-tax-prior-gift-history-lookup.plan.md
 */

import { differenceInYears } from "date-fns";
import type {
  DonorRelation,
  GiftDonorRelation,
  GiftPriorPropertyCategory,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { CalculationRecord } from "@/lib/storage/types";

// ============================================================
// 공개 타입
// ============================================================

export interface PriorGiftCandidate {
  /** Source 식별자 (record.id) — 선택 후 PriorGift.sourceCalculationId로 전달 */
  calculationId: string;
  /** ISO YYYY-MM-DD */
  giftDate: string;
  /** 의뢰인 ID (세무사 모드 — null = 본인) */
  clientId: string | null;
  /** §47 그룹 판정 키 (정보용 — 카드 라벨 표시) */
  donor: GiftDonorRelation;
  /** 당시 수증자-증여자 관계 (정보용) */
  donorRelation: DonorRelation | undefined;
  /** result.grossGiftValue (증여재산가액) */
  grossGiftValue: number;
  /** result.finalTax — §28 공제 인용 (납부세액) */
  finalTax: number;
  /** result.taxBase = ⑤ */
  taxBase: number;
  /** result.computedTax = ⑦ */
  computedTax: number;
  /** result.additionalGenerationSkipSurcharge = ⑫ */
  additionalGenerationSkipSurcharge: number;
  /** inputData.isGenerationSkip */
  wasGenerationSkip: boolean;
  /** inputData.priorGifts.length > 0 — UI 배지용 메타 (이중 합산 위험 안내) */
  hasInnerPriorGifts: boolean;
  /** 저장 시각 — 정렬 동률 시 사용 */
  createdAt: string;
  /** 자동 생성 title — 결과 화면 링크 라벨 */
  title: string;
  // 신고서 부표 1 표시 메타 (2026-05-20) — 자동 채움 prefill용
  /** 출처 EstateItem.category → PriorGift.propertyCategory 자동 prefill */
  propertyCategory?: GiftPriorPropertyCategory;
  /** 출처 EstateItem.name → PriorGift.propertyName 자동 prefill */
  propertyName?: string;
}

export type LookupWarningReason =
  | "donor_missing"
  | "result_missing"
  | "future_date"
  | "exceed_10y"
  | "excluded"
  | "different_client";

export interface LookupWarning {
  calculationId: string;
  reason: LookupWarningReason;
  message: string;
}

export interface LookupResult {
  candidates: PriorGiftCandidate[];
  warnings: LookupWarning[];
}

// ============================================================
// 상수 — donor enum 가드용
// ============================================================

const VALID_DONORS: ReadonlyArray<GiftDonorRelation> = [
  "father",
  "mother",
  "grandparent",
  "spouse",
  "lineal_descendant",
  "sibling",
  "other_relative",
  "other",
];

function isValidDonor(v: unknown): v is GiftDonorRelation {
  return typeof v === "string" && VALID_DONORS.includes(v as GiftDonorRelation);
}

// ============================================================
// 후보 필터링
// ============================================================

/**
 * 증여세 이력에서 동일 수증자(=의뢰인) 사전증여 후보를 추출.
 *
 * 수증자 식별 모델 (단일 진실):
 *   - 일반 납세자 모드: 수증자 = 본인. records는 이미 userId 필터링됨 → currentClientId === null이면 record.clientId === null만 노출.
 *   - 세무사 모드: 수증자 = 의뢰인. currentClientId 매칭으로 의뢰인별 이력 격리.
 *
 * 알고리즘:
 *   1. taxType !== "gift" → silent skip
 *   2. excludeCalculationIds 포함 → warnings.excluded
 *   3. record.clientId !== currentClientId → warnings.different_client
 *   4. donor 누락 또는 비-enum → warnings.donor_missing
 *   5. result.taxBase/computedTax/grossGiftValue 누락 → warnings.result_missing
 *   6. priorDate >= current → warnings.future_date (sanity)
 *   7. differenceInYears > 10 → warnings.exceed_10y
 *   8. 위 모두 통과 → candidates.push
 *
 * 정렬: giftDate desc → createdAt desc
 */
export function filterPriorGiftCandidates(
  records: CalculationRecord[],
  currentGiftDate: string,
  currentClientId: string | null,
  excludeCalculationIds: ReadonlyArray<string>,
): LookupResult {
  const current = new Date(currentGiftDate);
  const candidates: PriorGiftCandidate[] = [];
  const warnings: LookupWarning[] = [];
  const excludeSet = new Set(excludeCalculationIds);

  for (const record of records) {
    if (record.taxType !== "gift") continue; // 다른 세목 — silent

    if (excludeSet.has(record.id)) {
      warnings.push({
        calculationId: record.id,
        reason: "excluded",
        message: "이미 사전증여 목록에 추가된 회차",
      });
      continue;
    }

    // 수증자(=의뢰인) 격리 — clientId 정확 일치
    if (record.clientId !== currentClientId) {
      warnings.push({
        calculationId: record.id,
        reason: "different_client",
        message: `${record.title}: 다른 의뢰인의 이력 — 격리됨`,
      });
      continue;
    }

    const input = record.inputData as Record<string, unknown> | undefined;
    const rawResult = record.resultData as Record<string, unknown> | undefined;
    const result =
      rawResult && typeof rawResult === "object" && "result" in rawResult
        ? (rawResult.result as Record<string, unknown>)
        : rawResult;

    if (!isValidDonor(input?.donor)) {
      warnings.push({
        calculationId: record.id,
        reason: "donor_missing",
        message: `${record.title}: 증여자 관계(donor) 미입력`,
      });
      continue;
    }

    if (
      typeof result?.grossGiftValue !== "number" ||
      typeof result?.taxBase !== "number" ||
      typeof result?.computedTax !== "number"
    ) {
      warnings.push({
        calculationId: record.id,
        reason: "result_missing",
        message: `${record.title}: 계산 결과 누락 (taxBase/computedTax/grossGiftValue)`,
      });
      continue;
    }

    const inputGiftDate = input?.giftDate;
    if (typeof inputGiftDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(inputGiftDate)) {
      warnings.push({
        calculationId: record.id,
        reason: "result_missing",
        message: `${record.title}: 증여일 형식 오류`,
      });
      continue;
    }

    const priorDate = new Date(inputGiftDate);
    if (priorDate >= current) {
      warnings.push({
        calculationId: record.id,
        reason: "future_date",
        message: `${record.title}: 증여일이 현재 증여일 이후 (${inputGiftDate})`,
      });
      continue;
    }

    if (differenceInYears(current, priorDate) > 10) {
      warnings.push({
        calculationId: record.id,
        reason: "exceed_10y",
        message: `${record.title}: 10년 초과 (${inputGiftDate})`,
      });
      continue;
    }

    const donorRelationRaw = input.donorRelation;
    const donorRelation: DonorRelation | undefined =
      typeof donorRelationRaw === "string"
        ? (donorRelationRaw as DonorRelation)
        : undefined;

    const priorGifts = input.priorGifts;
    const hasInnerPriorGifts = Array.isArray(priorGifts) && priorGifts.length > 0;

    // 부표 1 표시 메타 prefill — 출처 EstateItem 첫 항목 활용
    // input.giftItems가 GiftTaxForm FormState 구조이면 직접, 그 외 fallback
    const giftItems = Array.isArray(input.giftItems) ? input.giftItems : [];
    const stockItems = Array.isArray(input.stockItems) ? input.stockItems : [];
    const firstItem =
      (giftItems[0] as { category?: string; name?: string } | undefined) ??
      (stockItems[0] as { category?: string; name?: string } | undefined);
    const VALID_CATEGORIES: GiftPriorPropertyCategory[] = [
      "cash", "real_estate_land", "real_estate_apartment", "real_estate_building",
      "listed_stock", "unlisted_stock", "financial", "deposit", "other",
    ];
    const prefilledCategory =
      firstItem?.category && VALID_CATEGORIES.includes(firstItem.category as GiftPriorPropertyCategory)
        ? (firstItem.category as GiftPriorPropertyCategory)
        : undefined;
    const prefilledName =
      typeof firstItem?.name === "string" && firstItem.name.trim()
        ? firstItem.name.trim()
        : undefined;

    candidates.push({
      calculationId: record.id,
      giftDate: inputGiftDate,
      clientId: record.clientId,
      donor: input.donor as GiftDonorRelation,
      donorRelation,
      grossGiftValue: result.grossGiftValue as number,
      finalTax: typeof result.finalTax === "number" ? result.finalTax : 0,
      taxBase: result.taxBase as number,
      computedTax: result.computedTax as number,
      additionalGenerationSkipSurcharge:
        typeof result.additionalGenerationSkipSurcharge === "number"
          ? result.additionalGenerationSkipSurcharge
          : 0,
      wasGenerationSkip: Boolean(input.isGenerationSkip),
      hasInnerPriorGifts,
      createdAt: record.createdAt,
      title: record.title,
      propertyCategory: prefilledCategory,
      propertyName: prefilledName,
    });
  }

  // 정렬: giftDate desc (최근 우선), 동률 시 createdAt desc
  candidates.sort((a, b) => {
    if (a.giftDate !== b.giftDate) return b.giftDate.localeCompare(a.giftDate);
    return b.createdAt.localeCompare(a.createdAt);
  });

  return { candidates, warnings };
}

// ============================================================
// 후보 → PriorGift 변환
// ============================================================

/**
 * PriorGiftCandidate 를 GiftTaxForm.FormState.priorGifts 에 append 가능한 PriorGift 로 변환.
 *
 * 자동 채움 9필드 + sourceCalculationId 메타 1.
 * 추론 불가 필드(doneeId/beneficiaryType)는 옵션 파라미터로 처리.
 *
 * @param c 후보 데이터 (저장된 증여세 이력에서 추출)
 * @param options 변환 옵션:
 *   - `asCorporate: true` — 영리법인 사전증여로 변환 (§13①2호 + §3의2②)
 *     · `isHeir=false` 강제 (5년 cutoff 활성)
 *     · `giftTaxPaid=0` 강제 (§4의2③ 비과세, §28 공제 중복 방지)
 *     · `beneficiaryType="corporate"` set
 *     · `corporateGiftComputedTax = c.computedTax` 매핑 (§3의2② 한도 분자)
 *     · 자연인 enum 필드(donor·doneeRelation)는 set 안 함
 *   - 옵션 없음 — 자연인 사전증여 (기존 동작 보존)
 */
export function candidateToPriorGift(
  c: PriorGiftCandidate,
  options: { asCorporate?: boolean } = {},
): PriorGift {
  if (options.asCorporate) {
    return {
      giftDate: c.giftDate,
      isHeir: false, // §13①2호 5년 cutoff 강제
      giftAmount: c.grossGiftValue,
      giftTaxPaid: 0, // §4의2③ 비과세 (영리법인은 법인세 처리)
      giftTaxBase: c.taxBase, // §3의2② 한도 분자 fallback (corporateGiftComputedTax가 우선)
      beneficiaryType: "corporate",
      corporateGiftComputedTax: c.computedTax, // §3의2② 면제 한도용
      sourceCalculationId: c.calculationId,
      propertyCategory: c.propertyCategory,
      propertyName: c.propertyName,
      // donor / doneeRelation: 자연인 enum이므로 corporate 모드에서 미설정
      // doneeId: Heir.id 참조 필요 — 사용자가 별도 매핑 (Phase 2 후속에서 입력 UI 동반)
    };
  }
  return {
    giftDate: c.giftDate,
    isHeir: true, // 상속세 모드 미사용 시 무영향 (default)
    giftAmount: c.grossGiftValue,
    giftTaxPaid: c.finalTax,
    giftTaxBase: c.taxBase, // ⑤
    doneeRelation: c.donorRelation,
    donor: c.donor,
    computedTax: c.computedTax, // ⑦
    additionalGenerationSkipSurcharge: c.additionalGenerationSkipSurcharge, // ⑫
    wasGenerationSkip: c.wasGenerationSkip,
    sourceCalculationId: c.calculationId,
    // 부표 1 표시 메타 (자동 prefill) — 사용자 수정 시 hasUserEditedFields가 sourceCalculationId 제거
    propertyCategory: c.propertyCategory,
    propertyName: c.propertyName,
    // propertyLocation은 EstateItem에 소재지 필드가 없어 자동 prefill 불가 — 사용자 명시 입력
    // doneeId / beneficiaryType / corporateGiftComputedTax: 이력 추론 불가 → 미설정
  };
}

// ============================================================
// PR 1 (2026-05-22) — 상속세 모드 후보 추출 (옵션 B 전수 조회)
// ============================================================

/**
 * 상속세 모드 — 피상속인 전수 조회 (계획서 1 v2 옵션 B 단일 채택).
 *
 * 증여세 모드의 `filterPriorGiftCandidates` 와 달리:
 *   - donor §47 동일인 그룹 매칭 미적용 (모든 증여자 후보 노출)
 *   - clientId 격리 미적용 (currentClientId=null → 본인 record만 자연 노출)
 *   - cutoff 기준: 상속개시일 (deathDate) 기준 10년 (실제 cutoff는 isHeir에 따라
 *     5년/10년 결정되지만, 모달은 사용자가 선택 후 수동 매핑이므로 최대 10년 폭으로 검색)
 *
 * @param records IndexedDB 에서 로드한 증여세 이력
 * @param deathDate 상속개시일 ISO YYYY-MM-DD
 * @param excludeCalculationIds 이미 추가된 calculationId
 */
export function filterInheritancePriorGiftCandidates(
  records: CalculationRecord[],
  deathDate: string,
  excludeCalculationIds: ReadonlyArray<string>,
): LookupResult {
  const current = new Date(deathDate);
  const candidates: PriorGiftCandidate[] = [];
  const warnings: LookupWarning[] = [];
  const excludeSet = new Set(excludeCalculationIds);

  for (const record of records) {
    if (record.taxType !== "gift") continue;

    if (excludeSet.has(record.id)) {
      warnings.push({
        calculationId: record.id,
        reason: "excluded",
        message: "이미 사전증여 목록에 추가된 회차",
      });
      continue;
    }

    const input = record.inputData as Record<string, unknown> | undefined;
    const rawResult = record.resultData as Record<string, unknown> | undefined;
    const result =
      rawResult && typeof rawResult === "object" && "result" in rawResult
        ? (rawResult.result as Record<string, unknown>)
        : rawResult;

    if (!isValidDonor(input?.donor)) {
      warnings.push({
        calculationId: record.id,
        reason: "donor_missing",
        message: `${record.title}: 증여자 관계(donor) 미입력`,
      });
      continue;
    }

    if (
      typeof result?.grossGiftValue !== "number" ||
      typeof result?.taxBase !== "number" ||
      typeof result?.computedTax !== "number"
    ) {
      warnings.push({
        calculationId: record.id,
        reason: "result_missing",
        message: `${record.title}: 계산 결과 누락`,
      });
      continue;
    }

    const inputGiftDate = input?.giftDate;
    if (typeof inputGiftDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(inputGiftDate)) {
      warnings.push({
        calculationId: record.id,
        reason: "result_missing",
        message: `${record.title}: 증여일 형식 오류`,
      });
      continue;
    }

    const priorDate = new Date(inputGiftDate);
    if (priorDate >= current) {
      warnings.push({
        calculationId: record.id,
        reason: "future_date",
        message: `${record.title}: 증여일이 상속개시일 이후 (${inputGiftDate})`,
      });
      continue;
    }

    if (differenceInYears(current, priorDate) > 10) {
      warnings.push({
        calculationId: record.id,
        reason: "exceed_10y",
        message: `${record.title}: 10년 초과 (${inputGiftDate})`,
      });
      continue;
    }

    const donorRelationRaw = input.donorRelation;
    const donorRelation: DonorRelation | undefined =
      typeof donorRelationRaw === "string"
        ? (donorRelationRaw as DonorRelation)
        : undefined;

    const priorGifts = input.priorGifts;
    const hasInnerPriorGifts = Array.isArray(priorGifts) && priorGifts.length > 0;

    candidates.push({
      calculationId: record.id,
      giftDate: inputGiftDate,
      clientId: record.clientId,
      donor: input.donor as GiftDonorRelation,
      donorRelation,
      grossGiftValue: result.grossGiftValue as number,
      finalTax: typeof result.finalTax === "number" ? result.finalTax : 0,
      taxBase: result.taxBase as number,
      computedTax: result.computedTax as number,
      additionalGenerationSkipSurcharge:
        typeof result.additionalGenerationSkipSurcharge === "number"
          ? result.additionalGenerationSkipSurcharge
          : 0,
      wasGenerationSkip: Boolean(input.isGenerationSkip),
      hasInnerPriorGifts,
      createdAt: record.createdAt,
      title: record.title,
    });
  }

  candidates.sort((a, b) => {
    if (a.giftDate !== b.giftDate) return b.giftDate.localeCompare(a.giftDate);
    return b.createdAt.localeCompare(a.createdAt);
  });

  return { candidates, warnings };
}
