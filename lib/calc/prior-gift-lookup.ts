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
 * 추론 불가 필드(isHeir/doneeId/beneficiaryType/corporateGiftComputedTax)는 미설정.
 */
export function candidateToPriorGift(c: PriorGiftCandidate): PriorGift {
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
    // doneeId / beneficiaryType / corporateGiftComputedTax: 이력 추론 불가 → 미설정
  };
}
