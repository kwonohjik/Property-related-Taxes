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
  /** 수증자 본인 식별 (동일인 판단의 single source of truth) */
  doneeName: string;
  doneeBirthDate: string;
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
  | "donee_identity_missing"
  | "result_missing"
  | "future_date"
  | "exceed_10y"
  | "excluded"
  | "different_person";

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
 * 증여세 이력에서 동일인(수증자 이름+생년월일) 사전증여 후보를 추출.
 *
 * 알고리즘:
 *   1. taxType !== "gift" → silent skip
 *   2. excludeCalculationIds 포함 → warnings.excluded
 *   3. donor 누락 또는 비-enum → warnings.donor_missing
 *   4. doneeName 또는 doneeBirthDate 누락 → warnings.donee_identity_missing (legacy)
 *   5. result.taxBase/computedTax/grossGiftValue 누락 → warnings.result_missing
 *   6. priorDate >= current → warnings.future_date (sanity)
 *   7. differenceInYears > 10 → warnings.exceed_10y
 *   8. doneeName !== currentDoneeName OR doneeBirthDate !== currentDoneeBirthDate
 *      → warnings.different_person (다른 수증자)
 *   9. 위 모두 통과 → candidates.push
 *
 * 정렬: giftDate desc → createdAt desc
 *
 * 정책:
 *   - 수증자(donee) 이름+생년월일 정확 일치를 동일인 판정 기준으로 사용.
 *   - 같은 수증자가 여러 증여자로부터 받은 과거 회차를 한 화면에서 검토 가능.
 *   - §47 그룹 합산은 엔진(aggregatePriorGiftsForGift)이 selected priorGifts에서 자동 처리.
 */
export function filterPriorGiftCandidates(
  records: CalculationRecord[],
  currentGiftDate: string,
  currentDoneeName: string,
  currentDoneeBirthDate: string,
  excludeCalculationIds: ReadonlyArray<string>,
): LookupResult {
  const current = new Date(currentGiftDate);
  const candidates: PriorGiftCandidate[] = [];
  const warnings: LookupWarning[] = [];
  const excludeSet = new Set(excludeCalculationIds);
  const normName = currentDoneeName.trim();

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

    const recName =
      typeof input?.doneeName === "string" ? input.doneeName.trim() : "";
    const recBirth =
      typeof input?.doneeBirthDate === "string" ? input.doneeBirthDate : "";
    if (!recName || !recBirth) {
      warnings.push({
        calculationId: record.id,
        reason: "donee_identity_missing",
        message: `${record.title}: 수증자 이름·생년월일 미입력 (legacy 이력) — 수동 입력 필요`,
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

    if (recName !== normName || recBirth !== currentDoneeBirthDate) {
      warnings.push({
        calculationId: record.id,
        reason: "different_person",
        message: `${record.title}: 다른 수증자 (${recName} ${recBirth}) — 동일인 아님`,
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
      doneeName: recName,
      doneeBirthDate: recBirth,
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
