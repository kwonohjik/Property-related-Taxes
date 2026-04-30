/**
 * 주택 수 자동 산정 오케스트레이터 (Phase 3)
 *
 * 6차원 매트릭스 통합:
 *   1. 시점  — 권리취득일 소급 (§28의4①)
 *   2. 지분  — 공유지분 1세대 내/외 (§28의4④)
 *   3. 상속  — 공동상속 주된 상속자 + 5년 미경과 제외 (§28의4⑤⑥3호)
 *   4. 권리  — 입주권·분양권 포함 + 혼인 전 분양권 제외
 *   5. 세대  — 별도 세대 인정 4종 (§28의3②)
 *   6. 한시  — 신축·임대·미분양 카운트 제외 (§28의4②)
 *
 * + 신탁재산 위탁자 가산 (§13의3 1호)
 * + 일시적 2주택 D-day 안내 (P3-3 연계)
 *
 * 호환성 보장:
 *   기존 `houseCountAfter` (직접 입력) 계속 지원.
 *   `houseCountInput` 제공 시 자동 산정 결과 우선.
 *   없으면 기존 `houseCountAfter` 값 그대로 사용.
 *
 * 순수 함수 — DB 직접 호출 없음.
 */

import { ACQUISITION } from "../legal-codes";
import {
  getHouseCountReferenceDate,
  getEarliestRightAcquisitionDate,
} from "./right-acquisition";
import { isSeparateHousehold, hasMinorWithApparentIncomeCondition } from "./household";
import { isExcludedBy5YearRule, assessMainInheritor } from "./inheritance";
import { countCoOwnedHouse } from "./co-ownership";
import {
  getExclusionReasonsForHouse,
  getExclusionReasonsForRight,
  getExclusionReasonsForOffice,
} from "./exclusions";
import { assessHansiBenefitForPendingAcquisition } from "./hansi";
import { getDisposalDeadlineDate, getDisposalDeadlineYears } from "../acquisition-surcharge/multi-house";
import type {
  HouseCountInput,
  HouseCountResult,
  OwnedHouseInfo,
  ExcludedItem,
  HansiBenefitDetail,
} from "./types";

// ============================================================
// 메인 계산 함수
// ============================================================

/**
 * [P3] 1세대 취득세 적용 주택 수 자동 산정
 *
 * 6차원 매트릭스 + 신탁재산 + 일시적 2주택 D-day 통합 계산.
 *
 * @param input 주택 수 산정 입력
 * @returns 실효 주택 수 + 제외 내역 + 권리취득일 + 세대 별도 정보
 */
export function calculateHouseCount(input: HouseCountInput): HouseCountResult {
  const warnings: string[] = [];
  const legalBasis: string[] = [];
  const excludedDetails: ExcludedItem[] = [];
  const hansiBenefitDetails: HansiBenefitDetail[] = [];

  // ── Step 1: 권리취득일 소급 — 기준일 결정 (§28의4①) ──
  const rightDateResult = getHouseCountReferenceDate({
    acquiredViaRight: input.pendingAcquisition?.acquiredViaRight,
    rightAcquisitionDate: input.pendingAcquisition?.rightAcquisitionDate,
    balancePaymentDate: input.referenceDate,
  });

  // 입주권·분양권 권리취득일 중 가장 빠른 날도 고려
  const rightDates: string[] = [];
  if (input.pendingAcquisition?.acquiredViaRight && input.pendingAcquisition?.rightAcquisitionDate) {
    rightDates.push(input.pendingAcquisition.rightAcquisitionDate);
  }
  input.rights.forEach((r) => rightDates.push(r.rightAcquisitionDate));

  const effectiveReferenceDate =
    rightDateResult.isRightAcquisitionSoGup && rightDates.length > 0
      ? getEarliestRightAcquisitionDate(rightDates)
      : rightDateResult.referenceDate;

  if (rightDateResult.isRightAcquisitionSoGup) {
    legalBasis.push(rightDateResult.legalBasis);
    warnings.push(rightDateResult.description);
  }

  // ── Step 2: 세대 별도 인정 판정 (§28의3②) ──
  const separateHouseholdInfo = isSeparateHousehold(input.household);

  // 미성년 자녀가 소득 조건 있는 것처럼 보이는 경우 경고
  if (hasMinorWithApparentIncomeCondition(input.household)) {
    warnings.push(
      "미성년(만 19세 미만) 자녀는 30세 미만 소득 조건을 충족하더라도 별도 세대 인정 불가합니다 (지방세법 시행령 §28의3② 1호 단서)."
    );
  }

  if (separateHouseholdInfo.isSeparate && separateHouseholdInfo.legalBasis) {
    legalBasis.push(separateHouseholdInfo.legalBasis);
  }

  // ── Step 3: 보유 주택 제외 판정 + 공유지분 + 공동상속 ──
  let includedHouseCount = 0;

  for (const house of input.houses) {
    // (3a) 제외 11종 + 한시 특례 체크
    const exclusions = getExclusionReasonsForHouse(house, effectiveReferenceDate);

    if (exclusions.length > 0) {
      excludedDetails.push(...exclusions);
      legalBasis.push(...exclusions.map((e) => e.legalBasis));
      continue; // 제외 항목은 카운트 스킵
    }

    // (3b) 공동상속 — 5년 경과 후 주된 상속자 판정
    // (5년 미경과는 이미 exclusions에서 처리됨)
    if (house.inheritanceDate && !isExcludedBy5YearRule(house.inheritanceDate, effectiveReferenceDate)) {
      // 5년 경과 → 공동상속 여부 확인
      if (house.shareInInheritance !== undefined && house.maxShareInInheritors !== undefined) {
        const mainResult = assessMainInheritor({
          shareOfTaxpayer: house.shareInInheritance,
          maxShareInInheritors: house.maxShareInInheritors,
          tieInMaxShare: house.tieInMaxShare ?? false,
          isResident: house.isResidentInInheritedHouse ?? false,
          isOldest: house.isOldestInheritor ?? false,
        });

        if (!mainResult.isMainInheritor) {
          // 주된 상속자 아님 → 카운트 제외
          excludedDetails.push({
            assetId: house.id,
            assetType: "house",
            reason: "inheritance_under_5yr", // 가장 유사한 사유로 매핑
            legalBasis: mainResult.legalBasis,
            description: mainResult.reason,
          });
          legalBasis.push(mainResult.legalBasis);
          continue;
        }
        // 주된 상속자 → 카운트 포함 (공유지분 체크로 진행)
        legalBasis.push(mainResult.legalBasis);
      }
    }

    // (3c) 공유지분 카운트 (§28의4④)
    const coResult = countCoOwnedHouse({
      ownershipShare: house.ownershipShare,
      coOwnersAllInHousehold: house.coOwnersAllInHousehold,
    });

    includedHouseCount += coResult.countForTaxpayer;
    if (house.ownershipShare !== undefined && house.ownershipShare < 1.0) {
      legalBasis.push(coResult.legalBasis);
    }
  }

  // ── Step 4: 입주권·분양권 제외 판정 + 카운트 ──
  let includedRightCount = 0;

  for (const right of input.rights) {
    const exclusions = getExclusionReasonsForRight(right, effectiveReferenceDate);

    if (exclusions.length > 0) {
      excludedDetails.push(...exclusions);
      legalBasis.push(...exclusions.map((e) => e.legalBasis));
      continue;
    }

    // 제외 사유 없으면 주택 수에 포함 (1주택으로 카운트)
    includedRightCount += 1;
  }

  // ── Step 5: 오피스텔 제외 판정 + 카운트 ──
  let includedOfficeCount = 0;

  for (const office of input.offices) {
    const exclusions = getExclusionReasonsForOffice(office, effectiveReferenceDate);

    if (exclusions.length > 0) {
      excludedDetails.push(...exclusions);
      legalBasis.push(...exclusions.map((e) => e.legalBasis));
      continue;
    }

    // 제외 사유 없음 + 시가표준액 1억 초과 → 카운트
    // (exclusions.ts에서 1억 이하는 이미 제외됨)
    includedOfficeCount += 1;
  }

  // ── Step 6: 신탁재산 위탁자 가산 (§13의3 1호) ──
  const trustedCount = input.trustedHouseCount ?? 0;
  if (trustedCount > 0) {
    legalBasis.push(ACQUISITION.TRUST_HOUSE_COUNT);
  }

  // ── Step 7: 취득 대상 주택 한시 특례 판정 (§28의4②) ──
  // 취득일: pendingAcquisition이 있으면 referenceDate 또는 오늘 날짜
  const acquisitionDate = input.referenceDate ?? new Date().toISOString().slice(0, 10);

  const hansiBenefitResult = assessHansiBenefitForPendingAcquisition(
    input.pendingAcquisition,
    acquisitionDate
  );

  warnings.push(...hansiBenefitResult.warnings);

  let pendingIncluded = true; // 취득 주택이 카운트에 포함되는지 여부
  let pendingCount = 0;

  if (input.pendingAcquisition) {
    if (hansiBenefitResult.isHansiBenefit) {
      // 한시 특례 → 취득 주택 카운트 제외
      pendingIncluded = false;
      if (hansiBenefitResult.excludedItem) {
        excludedDetails.push(hansiBenefitResult.excludedItem);
      }
      if (hansiBenefitResult.legalBasis) {
        legalBasis.push(hansiBenefitResult.legalBasis);
        hansiBenefitDetails.push({
          assetType: "pending",
          type: hansiBenefitResult.benefitType!,
          legalBasis: hansiBenefitResult.legalBasis,
        });
      }
      warnings.push(hansiBenefitResult.description ?? "");
    } else {
      // 한시 특례 미해당 → 취득 주택 카운트 포함 (1주택)
      pendingCount = 1;
    }
  }

  // ── Step 8: 전체 카운트 집계 ──
  const baseCount = includedHouseCount + includedRightCount + includedOfficeCount + trustedCount;
  const totalCount = baseCount + (input.pendingAcquisition ? 1 : 0); // 제외 전 총 자산 수
  const effectiveCount = baseCount + pendingCount;                    // 실효 주택 수

  // ── Step 9: 일시적 2주택 D-day 안내 (P3-3 연계) ──
  let temporaryTwoHouseWarning: string | undefined;

  if (
    effectiveCount === 2 &&
    input.pendingAcquisition &&
    pendingIncluded
  ) {
    // 취득 후 2주택 — 일시적 2주택 가능성 안내
    // 실제 일시적 2주택 판정은 assessSurcharge에서 수행
    // 여기서는 D-day 계산 안내만 제공
    const referenceForDisposal = input.referenceDate ?? acquisitionDate;
    const prevRegion = "non_regulated"; // 기본값 (실제는 입력에서 받아야 함)
    const newRegion = "non_regulated";

    const deadlineYears = getDisposalDeadlineYears(referenceForDisposal, prevRegion, newRegion);
    const deadlineDate = getDisposalDeadlineDate(referenceForDisposal, prevRegion, newRegion);

    temporaryTwoHouseWarning = [
      `취득 후 2주택 상태입니다.`,
      `일시적 2주택 비과세 적용 시 종전 주택을 ${deadlineDate}까지(${deadlineYears}년 이내) 처분해야 합니다.`,
      `조정대상지역 여부 및 잔금일에 따라 처분기한이 변동될 수 있습니다.`,
    ].join(" ");
  }

  // 중복 법령 제거
  const uniqueLegalBasis = [...new Set(legalBasis.filter(Boolean))];
  const uniqueWarnings = [...new Set(warnings.filter(Boolean))];

  return {
    totalCount,
    effectiveCount,
    pendingAcquisitionIncluded: pendingIncluded,
    excludedDetails,
    hansiBenefitDetails: hansiBenefitDetails.length > 0 ? hansiBenefitDetails : undefined,
    referenceDate: effectiveReferenceDate,
    separateHousehold: separateHouseholdInfo.isSeparate ? separateHouseholdInfo : undefined,
    temporaryTwoHouseWarning,
    trustedHouseCount: trustedCount > 0 ? trustedCount : undefined,
    warnings: uniqueWarnings,
    legalBasis: uniqueLegalBasis,
  };
}

// ============================================================
// 호환성 헬퍼 — 기존 houseCountAfter와 통합
// ============================================================

/**
 * houseCountInput 기반 자동 산정과 기존 houseCountAfter 직접 입력의 통합 결정
 *
 * - houseCountInput 제공 시: calculateHouseCount 결과 우선
 * - houseCountInput 미제공 시: 기존 houseCountAfter 값 그대로 사용
 *
 * @param houseCountInput Phase 3 자동 산정 입력 (optional)
 * @param houseCountAfter 기존 직접 입력 값 (optional)
 * @returns 실효 주택 수 + 상세 결과 (있는 경우)
 */
export function resolveHouseCount(
  houseCountInput: HouseCountInput | undefined,
  houseCountAfter: number | undefined
): { effectiveCount: number; detail?: HouseCountResult } {
  if (houseCountInput) {
    const detail = calculateHouseCount(houseCountInput);
    return { effectiveCount: detail.effectiveCount, detail };
  }

  return { effectiveCount: houseCountAfter ?? 0 };
}

// ============================================================
// 타입 re-export
// ============================================================

export type {
  HouseCountInput,
  HouseCountResult,
  OwnedHouseInfo,
  ExcludedItem,
  HansiBenefitDetail,
  SeparateHouseholdInfo,
  SeparateHouseholdReason,
  ExclusionReason,
  RightAsset,
  OfficeAsset,
  PendingAcquisition,
  Household,
  HouseholdMember,
} from "./types";

export { isSeparateHousehold } from "./household";
export { isExcludedBy5YearRule, assessMainInheritor } from "./inheritance";
export { countCoOwnedHouse } from "./co-ownership";
export { getHouseCountReferenceDate, getEarliestRightAcquisitionDate } from "./right-acquisition";
export { assessHansiBenefitForPendingAcquisition } from "./hansi";
export { isExcludedByLowValue } from "./exclusions";
