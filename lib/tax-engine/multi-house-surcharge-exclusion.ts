/**
 * 다주택 중과세 — 중과 배제·유예 판정군 (Layer 2 내부 모듈)
 *
 * multi-house-surcharge-helpers.ts 800줄 정책 분할(-exclusion, 2026-06):
 *   - 3주택+ ①~⑨ 그룹 배제 판정 (⑩ 유일한 1주택)
 *   - 한시 유예 조건부 판정 (2022.5.10 ~ 2026.5.9)
 *   - 중과배제 사유 종합 판단 (determineSurchargeExclusion)
 *
 * 의존: 산정 헬퍼를 -count에서 import (단방향, 순환 0).
 */

import { addYears, differenceInYears } from "date-fns";
import { isSurchargeSuspended } from "./tax-utils";
import {
  MULTI_HOUSE,
  SURCHARGE_EXCLUSION_WINDOW,
  SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW,
} from "./legal-codes";
import type { SurchargeSpecialRulesData } from "./schemas/rate-table.schema";
import type {
  HouseInfo,
  MultiHouseSurchargeInput,
  ExclusionReason,
  RegulatedAreaHistory,
} from "./types/multi-house-surcharge.types";
import {
  calcRentalPeriodYears,
  isLongTermRentalHousingExempt,
  getRentalTypeLabel,
  isTaxIncentiveRentalHousingExempt,
  isSmallNewHouseSpecial,
} from "./multi-house-surcharge-count";

// ============================================================
// 3주택+ ①~⑨ 그룹 배제 판정 (⑩번 "유일한 1주택" 판정용)
// ============================================================

export function isGroupExcludable(house: HouseInfo, transferDate: Date): boolean {
  if (house.regionCriteria === "VALUE") {
    const price = house.transferOfficialPrice ?? house.officialPrice;
    if (price <= 300_000_000) return true;
  }
  if (isLongTermRentalHousingExempt(house, transferDate)) return true;
  if (isTaxIncentiveRentalHousingExempt(house)) return true;
  if (house.isEmployeeHousing && (house.freeProvisionYears ?? 0) >= 10) return true;
  if (house.isTaxSpecialExemption) return true;
  if (house.isCulturalHeritage) return true;
  if (house.isInherited && house.inheritedDate) {
    if (differenceInYears(transferDate, house.inheritedDate) < 5) return true;
  }
  if (house.isMortgageExecution) {
    if (differenceInYears(transferDate, house.acquisitionDate) < 3) return true;
  }
  if (house.isDayCareCenter && (house.dayCareOperationYears ?? 0) >= 5) return true;
  return false;
}

export function getGroupExcludeReason(house: HouseInfo, transferDate: Date): string {
  if (house.regionCriteria === "VALUE") {
    const price = house.transferOfficialPrice ?? house.officialPrice;
    if (price <= 300_000_000) return "① 지방 저가주택 (3억 이하)";
  }
  if (isLongTermRentalHousingExempt(house, transferDate)) {
    return `② 장기임대주택 (${getRentalTypeLabel(house.rentalType)})`;
  }
  if (isTaxIncentiveRentalHousingExempt(house)) return "③ 조특법 감면 임대주택";
  if (house.isEmployeeHousing && (house.freeProvisionYears ?? 0) >= 10) return "④ 사원용 주택 (10년 이상)";
  if (house.isTaxSpecialExemption) return "⑤ 조특법 특례";
  if (house.isCulturalHeritage) return "⑥ 문화재";
  if (house.isInherited && house.inheritedDate) {
    if (differenceInYears(transferDate, house.inheritedDate) < 5) return "⑦ 상속주택 (5년 이내)";
  }
  if (house.isMortgageExecution) {
    if (differenceInYears(transferDate, house.acquisitionDate) < 3) return "⑧ 저당권 실행 (3년 이내)";
  }
  if (house.isDayCareCenter && (house.dayCareOperationYears ?? 0) >= 5) return "⑨ 어린이집 (5년 이상)";
  return "일반주택 (배제 불가)";
}

// ============================================================
// 한시 유예 조건부 판정 (2022.5.10 ~ 2026.5.9)
// ============================================================

// 단일 출처: SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end (드리프트 방지)
const GRACE_PERIOD_END = new Date(SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end);
const GRACE_NEW_DESIGNATION_DATE = new Date("2025-10-16");

function checkGracePeriodExemption(
  transferDate: Date,
  gracePeriod: NonNullable<MultiHouseSurchargeInput["gracePeriod"]>,
): boolean {
  const { contractDate, isLandPermitArea, hasTenantInResidence, areaDesignatedDate } = gracePeriod;

  // 한시 유예는 2022.5.10 ~ 2026.5.9 사이 매매계약에만 적용 — 하한·상한 모두 검증.
  // (하한 누락 시 유예 시행 전 계약도 조건B/C 충족 시 잘못 배제 — 적대적 리뷰 적발)
  if (contractDate < new Date(SURCHARGE_EXCLUSION_WINDOW.start)) return false;
  if (contractDate > GRACE_PERIOD_END) return false;

  const isNewlyDesignated = areaDesignatedDate && areaDesignatedDate >= GRACE_NEW_DESIGNATION_DATE;
  const maxMonths = isNewlyDesignated ? 6 : 4;

  const deadlineDate = new Date(contractDate);
  deadlineDate.setMonth(deadlineDate.getMonth() + maxMonths);
  const conditionB = transferDate <= deadlineDate;

  const conditionC = isLandPermitArea && hasTenantInResidence;

  return conditionB || conditionC;
}

function getFirstDesignatedDate(
  regionCode: string,
  history: RegulatedAreaHistory,
): Date | null {
  const region = history.regions.find((r) => r.code === regionCode);
  if (!region || region.designations.length === 0) return null;

  const dates = region.designations.map((d) => new Date(d.designatedDate));
  return dates.sort((a, b) => a.getTime() - b.getTime())[0];
}

// ============================================================
// Step 3: 중과세 배제 사유 판단 (소령 §167-10, §167-3 ①)
// ============================================================

export function determineSurchargeExclusion(
  input: MultiHouseSurchargeInput,
  effectiveHouseCount: number,
  isRegulated: boolean,
  suspensionRules: SurchargeSpecialRulesData | null,
  regulatedAreaHistory: RegulatedAreaHistory | null,
  excludedHouseIds: Set<string>,
  /** #2a: 오케스트레이터 Step 1.5에서 §167의3⑨ 차감이 적용됐는지 — 배제 2(§155⑤) 오염 방지 */
  marriageSubtractionApplied: boolean,
): {
  isExcluded: boolean;
  exclusionReasons: ExclusionReason[];
  isSuspended: boolean;
} {
  const exclusionReasons: ExclusionReason[] = [];
  const sellingHouse = input.houses.find((h) => h.id === input.sellingHouseId);

  // 배제 1: 일시적 2주택
  if (effectiveHouseCount === 2 && input.temporaryTwoHouse) {
    const { previousHouseId, newHouseId } = input.temporaryTwoHouse;
    if (input.sellingHouseId === previousHouseId) {
      const newHouse = input.houses.find((h) => h.id === newHouseId);
      if (newHouse) {
        const relaxDate = new Date(SURCHARGE_EXCLUSION_WINDOW.start);
        const deadlineYears = isRegulated && newHouse.acquisitionDate < relaxDate ? 1 : 3;
        const deadline = addYears(newHouse.acquisitionDate, deadlineYears);
        if (input.transferDate <= deadline) {
          exclusionReasons.push({
            type: "temporary_two_house",
            detail: `신규주택 취득일(${newHouse.acquisitionDate.toISOString().slice(0, 10)}) + ${deadlineYears}년 처분기한 이내`,
          });
          return { isExcluded: true, exclusionReasons, isSuspended: false };
        }
      }
    }
  }

  // 배제 2: 혼인합가 1세대1주택 의제 (§167의10①15호 → §155⑤, 2주택 10년)
  // ⑨ 차감으로 3→2가 된 경우(marriageSubtractionApplied)는 §155 비해당 → 배제 제외(본인 2주택 중과).
  // §154① 게이트: 15호는 "§154① 요건 모두 충족하는 주택"에 한정 → 양도 주택 보유·거주 요건 미충족 시 배제 부적용.
  //   미제공(?? true)은 충족 간주(직접 호출 하위호환); 파이프라인은 transfer-tax.ts에서 precompute해 주입.
  if (
    input.marriageMerge &&
    effectiveHouseCount === 2 &&
    !marriageSubtractionApplied &&
    (input.sellingHouseMeetsOneHouseRequirements ?? true)
  ) {
    const m = input.marriageMerge.marriageDate;
    if (
      input.transferDate >= m &&
      input.transferDate <= addYears(m, MULTI_HOUSE.MARRIAGE_MERGE_YEARS_2HOUSE)
    ) {
      exclusionReasons.push({
        type: "marriage_merge",
        detail: `혼인일(${m.toISOString().slice(0, 10)}) 10년내 먼저 양도 — 1세대1주택 의제 중과 배제 (${MULTI_HOUSE.MARRIAGE_MERGE_2HOUSE_BASIS})`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }
  }

  // 배제 3: 동거봉양 합가 10년 이내 (§155 ⑦)
  if (input.parentalCareMerge) {
    const yearsFromMerge = differenceInYears(input.transferDate, input.parentalCareMerge.mergeDate);
    if (yearsFromMerge < 10) {
      exclusionReasons.push({
        type: "parental_care_merge",
        detail: `동거봉양 합가 후 ${yearsFromMerge}년 (10년 이내)`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }
  }

  // 배제 4: ⑪ 공고일 이전 매매계약 + 계약금 지급 증빙
  if (
    sellingHouse?.contractDate &&
    sellingHouse.hasContractDepositProof &&
    sellingHouse.regionCode &&
    regulatedAreaHistory
  ) {
    const firstDesignatedDate = getFirstDesignatedDate(sellingHouse.regionCode, regulatedAreaHistory);
    if (firstDesignatedDate && sellingHouse.contractDate < firstDesignatedDate) {
      exclusionReasons.push({
        type: "pre_designation_contract",
        detail: `매매계약일(${sellingHouse.contractDate.toISOString().slice(0, 10)}) < 조정대상지역 지정일(${firstDesignatedDate.toISOString().slice(0, 10)}) + 계약금 증빙 확인`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }
  }

  // 3주택+ 전용 배제 (양도 주택 자체가 배제 항목 해당)
  if (effectiveHouseCount >= 3 && sellingHouse) {
    if (sellingHouse.isMortgageExecution) {
      const yearsHeld = differenceInYears(input.transferDate, sellingHouse.acquisitionDate);
      if (yearsHeld < 3) {
        exclusionReasons.push({
          type: "mortgage_execution_3years",
          detail: `저당권 실행·채권변제 취득(${sellingHouse.acquisitionDate.toISOString().slice(0, 10)})로부터 ${yearsHeld}년 (3년 미경과)`,
        });
        return { isExcluded: true, exclusionReasons, isSuspended: false };
      }
    }

    if (sellingHouse.isEmployeeHousing && (sellingHouse.freeProvisionYears ?? 0) >= 10) {
      exclusionReasons.push({
        type: "employee_housing_10years",
        detail: `사원용 주택 ${sellingHouse.freeProvisionYears}년 무상 제공 (10년 이상)`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    if (sellingHouse.isTaxSpecialExemption) {
      exclusionReasons.push({ type: "tax_special_exemption", detail: "조세특례제한법 특례 적용 주택" });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    if (sellingHouse.isCulturalHeritage) {
      exclusionReasons.push({ type: "cultural_heritage", detail: "국가유산(문화재) 주택" });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    if (sellingHouse.isDayCareCenter && (sellingHouse.dayCareOperationYears ?? 0) >= 5) {
      exclusionReasons.push({
        type: "daycare_center_5years",
        detail: `어린이집 ${sellingHouse.dayCareOperationYears}년 운영 (5년 이상)`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    if (isTaxIncentiveRentalHousingExempt(sellingHouse)) {
      exclusionReasons.push({
        type: "tax_incentive_rental",
        detail: `조특법 감면 장기임대주택 (국민주택 ${calcRentalPeriodYears(sellingHouse)}년 임대)`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    if (isSmallNewHouseSpecial(sellingHouse)) {
      exclusionReasons.push({
        type: "small_new_house",
        detail: `소형 신축/미분양 특례 (전용 ${sellingHouse.exclusiveArea ?? "?"}㎡)`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }
  }

  // 2주택 전용 배제 (소령 §167-10 ①)
  if (effectiveHouseCount === 2 && sellingHouse) {
    const otherEffectiveHouses = input.houses.filter(
      (h) => h.id !== input.sellingHouseId && !excludedHouseIds.has(h.id),
    );

    // ③ 취학·근무상 형편·질병 등 부득이한 사유
    const hasUnavoidableHouse = otherEffectiveHouses.some((h) => {
      if (!h.isUnavoidableReason) return false;
      if ((h.unavoidableResidenceYears ?? 0) < 1) return false;
      if (h.officialPrice > 300_000_000) return false;
      if (h.unavoidableReasonResolvedDate) {
        const yearsFromResolved = differenceInYears(input.transferDate, h.unavoidableReasonResolvedDate);
        if (yearsFromResolved >= 3) return false;
      }
      return true;
    });
    if (hasUnavoidableHouse) {
      exclusionReasons.push({
        type: "unavoidable_reason_two_house",
        detail: `취학·근무상 형편·질병 요양 등 부득이한 사유로 취득한 주택 (기준시가 3억 이하·1년 이상 거주) 보유 — 2주택 중과배제 (${MULTI_HOUSE.TWO_HOUSE_UNAVOIDABLE})`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    // ⑧ 소송 취득/진행 중 주택
    const hasLitigationHouse = otherEffectiveHouses.some((h) => {
      if (!h.isLitigationHousing) return false;
      if (h.litigationAcquisitionDate) {
        return differenceInYears(input.transferDate, h.litigationAcquisitionDate) < 3;
      }
      return true;
    });
    if (hasLitigationHouse) {
      const litigationHouse = otherEffectiveHouses.find((h) => h.isLitigationHousing)!;
      const detail = litigationHouse.litigationAcquisitionDate
        ? `법원 결정 취득(${litigationHouse.litigationAcquisitionDate.toISOString().slice(0, 10)})로부터 3년 이내 — 2주택 중과배제 (${MULTI_HOUSE.TWO_HOUSE_LITIGATION})`
        : `소송 진행 중인 주택 보유 — 2주택 중과배제 (${MULTI_HOUSE.TWO_HOUSE_LITIGATION})`;
      exclusionReasons.push({ type: "litigation_housing_two_house", detail });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    // ⑩ 기준시가 1억 이하 소형 주택 (정비구역 제외)
    const hasLowPriceSmallHouse = otherEffectiveHouses.some(
      (h) => h.officialPrice <= 100_000_000 && !h.isRedevelopmentZone,
    );
    if (hasLowPriceSmallHouse) {
      exclusionReasons.push({
        type: "low_price_two_house",
        detail: `기준시가 1억 이하 소형 주택 보유로 2주택 중과배제 (${MULTI_HOUSE.TWO_HOUSE_SMALL_HOUSE})`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }
  }

  // 한시 유예 판단 (§167의3①12의2·§167의10①12의2: 보유 2년 이상 + 2026.5.9까지 양도)
  const surchargeKey = effectiveHouseCount >= 3 ? "multi_house_3plus" : "multi_house_2";
  let suspended = false;

  // 12의2 본문: 양도 주택 보유기간 2년 이상 요건(§95④ 기산). 미충족 시 배제(suspension) 부적용
  // → 기존 §104 경로(단기 단일세율 vs 기본+중과 비교과세)로 처리. (재개발 조합원 기존건물 기산은
  //   sellingHouse.acquisitionDate가 그 기산일을 담는다는 전제 — 기존 §167의3 3년 판정 L213과 동일 관례.)
  const suspensionHoldingYears = sellingHouse
    ? differenceInYears(input.transferDate, sellingHouse.acquisitionDate)
    : 0;

  if (suspensionHoldingYears >= MULTI_HOUSE.SURCHARGE_SUSPENSION_MIN_HOLDING_YEARS) {
    if (input.gracePeriod && suspensionRules?.surcharge_suspended) {
      const typeMatches =
        !suspensionRules.suspended_types ||
        suspensionRules.suspended_types.includes(surchargeKey);
      if (typeMatches) {
        suspended = checkGracePeriodExemption(input.transferDate, input.gracePeriod);
      }
    } else if (suspensionRules) {
      suspended = isSurchargeSuspended(suspensionRules, input.transferDate, surchargeKey);
    }
  }

  return { isExcluded: false, exclusionReasons, isSuspended: suspended };
}
