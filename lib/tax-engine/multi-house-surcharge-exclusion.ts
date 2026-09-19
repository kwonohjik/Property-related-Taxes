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

import { addMonths, addDays, subDays, differenceInYears } from "date-fns";
import { isSurchargeSuspended } from "./tax-utils";
import {
  MERGE_SURCHARGE_154_GATE_EFFECTIVE_DATE,
  MULTI_HOUSE,
  SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW,
  SURCHARGE_TRANSITION,
  SURCHARGE_TRANSITION_FOUR_MONTH_SGG,
  SURCHARGE_TRANSITION_DESIGNATION_DATE,
} from "./legal-codes";
import { REGULATED_REGIONS } from "./data/regulated-areas";
import type { RegulatedRegion } from "./data/regulated-areas";
import type { SurchargeSpecialRulesData } from "./schemas/rate-table.schema";
import type {
  HouseInfo,
  MultiHouseSurchargeInput,
  ExclusionReason,
  RegulatedAreaHistory,
} from "./types/multi-house-surcharge.types";
import {
  calcRentalPeriodYears,
  isSurchargeExemptRental,
  isSurchargeExemptInherited,
  getRentalTypeLabel,
  isTaxIncentiveRentalHousingExempt,
  isSmallNewHouseSpecial,
  isLongTermRentalDutyPeriodPending,
} from "./multi-house-surcharge-count";

// ============================================================
// 3주택+ ①~⑨ 그룹 배제 판정 (⑩번 "유일한 1주택" 판정용)
// ============================================================

export function isGroupExcludable(house: HouseInfo, transferDate: Date): boolean {
  if (house.regionCriteria === "VALUE") {
    const price = house.transferOfficialPrice ?? house.officialPrice;
    if (price <= 300_000_000) return true;
  }
  // ②·⑦은 D16부터 주택 수에서 빠지지 않고 여기에 도달한다 — 양도 주택 자체 배제와 같은 술어.
  if (isSurchargeExemptRental(house, transferDate)) return true;
  if (isTaxIncentiveRentalHousingExempt(house)) return true;
  if (house.isEmployeeHousing && (house.freeProvisionYears ?? 0) >= 10) return true;
  if (house.isTaxSpecialExemption) return true;
  if (house.isCulturalHeritage) return true;
  if (isSurchargeExemptInherited(house, transferDate)) return true;
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
  if (isSurchargeExemptRental(house, transferDate)) {
    return house.rentalType
      ? `② 장기임대주택 (${getRentalTypeLabel(house.rentalType)})`
      : "② 장기임대 등록주택 (말소 전)";
  }
  if (isTaxIncentiveRentalHousingExempt(house)) return "③ 조특법 감면 임대주택";
  if (house.isEmployeeHousing && (house.freeProvisionYears ?? 0) >= 10) return "④ 사원용 주택 (10년 이상)";
  if (house.isTaxSpecialExemption) return "⑤ 조특법 특례";
  if (house.isCulturalHeritage) return "⑥ 문화재";
  if (isSurchargeExemptInherited(house, transferDate)) return "⑦ 상속주택 (5년 이내 · §155②)";
  if (house.isMortgageExecution) {
    if (differenceInYears(transferDate, house.acquisitionDate) < 3) return "⑧ 저당권 실행 (3년 이내)";
  }
  if (house.isDayCareCenter && (house.dayCareOperationYears ?? 0) >= 5) return "⑨ 어린이집 (5년 이상)";
  return "일반주택 (배제 불가)";
}

// ============================================================
// §167의3④ — 의무임대기간등 충족 전에 일반주택을 양도하는 경우 (10호 전용 · F-10)
// ============================================================

/**
 * 「제1항제2호부터 제4호까지 또는 제8호의2」 주택이 **의무 기간만** 모자라면 사유 문구, 아니면 null.
 * 기간 외 요건은 각 호의 판정 그대로 요구한다(임대는 `isLongTermRentalDutyPeriodPending`).
 * 2주택은 §167의10②가 §167의3④를 준용한다.
 */
export function dutyPeriodPendingReason(house: HouseInfo, transferDate: Date): string | null {
  const basis = `의무기간 충족 전 — ${MULTI_HOUSE.DUTY_PERIOD_PENDING_BASIS}`;
  if (isLongTermRentalDutyPeriodPending(house, transferDate)) {
    return `② 장기임대주택 (${getRentalTypeLabel(house.rentalType)} · ${basis})`;
  }
  if (house.isTaxIncentiveRental && house.isNationalSizeHousing && calcRentalPeriodYears(house) < 5) {
    return `③ 조특법 감면 임대주택 (${basis})`;
  }
  if (house.isEmployeeHousing && (house.freeProvisionYears ?? 0) < 10) {
    return `④ 사원용 주택 (${basis})`;
  }
  if (house.isDayCareCenter && (house.dayCareOperationYears ?? 0) < 5) {
    return `⑨ 어린이집 (${basis})`;
  }
  return null;
}

/** 10호(「그 주택을 제외하고 1개의 주택만」) 판정용 — ①~⑨ 배제 + §167의3④ 의제. */
export function isExcludableForGeneralHouse(house: HouseInfo, transferDate: Date): boolean {
  return isGroupExcludable(house, transferDate) || dutyPeriodPendingReason(house, transferDate) !== null;
}

export function getGeneralHouseExcludeReason(house: HouseInfo, transferDate: Date): string {
  return isGroupExcludable(house, transferDate)
    ? getGroupExcludeReason(house, transferDate)
    : (dutyPeriodPendingReason(house, transferDate) ?? "일반주택 (배제 불가)");
}

/** §167의3⑤ — ④를 적용받은 뒤 의무기간등을 채우지 못하면 차액을 신고·납부해야 한다. */
export const DUTY_PERIOD_PENDING_WARNING =
  "의무임대기간(의무무상·의무사용기간)을 채우기 전인 임대주택등을 장기임대주택등으로 보아 중과를 배제했습니다" +
  `(${MULTI_HOUSE.DUTY_PERIOD_PENDING_BASIS}). 이후 그 요건을 채우지 못하게 되면 사유 발생일이 속하는 달의 말일부터 ` +
  `2개월 이내에 중과했을 세액과의 차액을 신고·납부해야 합니다(${MULTI_HOUSE.DUTY_PERIOD_PENDING_CLAWBACK_BASIS}).`;

// ============================================================
// 한시 유예 조건부 판정 (2022.5.10 ~ 2026.5.9)
// ============================================================

// 단일 출처: SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end (가목 기한, 드리프트 방지)
const GRACE_PERIOD_A_DEADLINE = new Date(SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end);

/**
 * 나목4) 표 지역 판정 — 계약일부터 양도 기한 개월수(4 또는 6).
 * 강남4구(서초·송파·용산 포함)는 4개월. 그 외 2025-10-16 지정 조정대상지역(서울 나머지 21구 +
 * 경기 신규지정 12개 시군구)은 6개월. 그 외(용인기흥·구리 등 2026-07-01 지정)는 보수적 4개월.
 * regionCode 미제공 시에도 보수적 4개월(§7 — 근사 방향은 UI 경고로 안내, 여기선 배제로 이어지지 않음).
 *
 * 단일 진실: REGULATED_REGIONS(data/regulated-areas.ts) 데이터에서 직접 파생 — 명단 하드코딩 금지.
 */
/**
 * "기산일부터 N개월 이내"의 만료일 — 국세기본법 §4 → 민법 §157(초일불산입)·§160(역월) 준용.
 * §157: 초일불산입 → 기산일은 시작일 익일. §160②: 만료 = 최후 월의 기산일 해당날의 전일.
 * §160③: 최종월에 해당일이 없으면 그 월의 말일로 만료(전일 빼지 않음).
 * date-fns `addMonths`는 초일산입 응당일이라 월말 계약에서 1~2일 이른 기한(납세자 불리)을 준다 → 교정.
 * 예: 계약 2026-04-30 +4개월 → addMonths 08-30 vs 민법 08-31 / 계약 02-28 +4개월 → 06-28 vs 06-30.
 */
export function civilMonthsDeadline(startDate: Date, months: number): Date {
  const 기산 = addDays(startDate, 1); // §157 초일불산입
  const 응당 = addMonths(기산, months);
  // date-fns가 말일로 clamp했으면(기산일≠응당일 day) §160③ 말일 만료 — 전일 빼지 않음.
  if (기산.getUTCDate() !== 응당.getUTCDate()) return 응당;
  return subDays(응당, 1); // §160② 전일
}

export function transitionExemptionMonths(
  regionCode: string | undefined,
  regions: RegulatedRegion[] = REGULATED_REGIONS,
): number | null {
  // 소재지 미확보 — 나·다목 대상 지역 판정 불가(근거 없이 배제하지 않음). UI가 소재지 입력 유도.
  if (!regionCode) return null;
  const sgg = regionCode.slice(0, 5);
  if (SURCHARGE_TRANSITION_FOUR_MONTH_SGG.has(sgg)) return SURCHARGE_TRANSITION.MONTHS_DEFAULT;

  const hasDesignation20251016 = (code: string): boolean => {
    const region = regions.find((r) => r.code === code);
    if (!region) return false;
    return region.designations.some((d) => d.designatedDate === SURCHARGE_TRANSITION_DESIGNATION_DATE);
  };

  // 시군구(5자리) 개별 엔트리(경기 신규지정) 우선, 없으면 서울 전역 "11" 엔트리로 폴백
  // (서울 나머지 21구는 개별 엔트리 없이 "11" 전역 재지정으로 커버됨).
  if (hasDesignation20251016(sgg)) return SURCHARGE_TRANSITION.MONTHS_TABLE_REGION;
  if (sgg.startsWith("11") && hasDesignation20251016("11")) return SURCHARGE_TRANSITION.MONTHS_TABLE_REGION;

  // 강남4구·2025-10-16 지정 지역이 아니면 나·다목 경과조치 대상 아님.
  // 나·다목은 "2026-05-09까지 허가신청/계약"이 요건이므로, 그 시점에 조정대상지역이 아니었던
  // 지역(예: 용인 기흥·구리 등 2026-07-01 지정)은 처음부터 대상이 될 수 없다 → null(부적용).
  return null;
}

/**
 * 다주택 중과 한시 배제 판정 — §167의3①12의2 가·나·다목 (§167의10①12의2 미러 동일).
 *
 * ★ 가목 우선 게이트: 양도일 ≤ 2026-05-09이면 계약·허가 조건 무관하게 배제(가목).
 *   (자가검증 발견 — 현행 나·다 조건만 판정하면 가목 해당자가 나·다 미충족 시 오과세되던 버그 정정)
 * 나목(isLandPermitTarget === true): 허가신청(≤5-09)·허가수령·계약금증빙 + 계약일부터 4/6개월
 *   (2026-05-10 이후 계약 시 절대기한 2026-09-09/11-09로 한정).
 * 다목(isLandPermitTarget === false): 계약(≤5-09)+계약금증빙 + 계약일부터 4/6개월(절대기한 자동충족).
 * 조건C(토지허가구역+임차인 무기한 배제)는 확정 시행령 원문에 근거 없어 제거(G3).
 */
export function checkGracePeriodExemption(
  transferDate: Date,
  gracePeriod: NonNullable<MultiHouseSurchargeInput["gracePeriod"]>,
  sellingRegionCode?: string,
): { suspended: boolean; basis?: "a" | "na" | "da"; deadline?: Date } {
  // ★ 가목 우선 게이트 (G3′)
  if (transferDate <= GRACE_PERIOD_A_DEADLINE) {
    return { suspended: true, basis: "a" };
  }

  const {
    contractDate,
    isLandPermitTarget,
    permitApplicationDate,
    permitGranted,
    depositReceiptConfirmed,
  } = gracePeriod;

  const deadlineOfMonths = SURCHARGE_TRANSITION.DEADLINE;
  const months = transitionExemptionMonths(sellingRegionCode);
  // 소재지가 나·다목 경과조치 대상 지역(강남4구 또는 2025-10-16 지정)이 아니면 부적용.
  // 미확보·2026-07-01 지정(용인기흥·구리 등)은 2026-05-09 기준 조정대상이 아니므로 나·다목 성립 불가.
  if (months === null) return { suspended: false };
  const contractAfter0510 = contractDate > new Date(deadlineOfMonths);

  if (isLandPermitTarget === true) {
    // 나목
    if (!permitApplicationDate || permitApplicationDate > new Date(deadlineOfMonths)) {
      return { suspended: false };
    }
    if (!permitGranted || !depositReceiptConfirmed) return { suspended: false };

    let deadline = civilMonthsDeadline(contractDate, months);
    if (contractAfter0510) {
      const absolute = new Date(
        months === SURCHARGE_TRANSITION.MONTHS_TABLE_REGION
          ? SURCHARGE_TRANSITION.ABSOLUTE_DEADLINE_6M
          : SURCHARGE_TRANSITION.ABSOLUTE_DEADLINE_4M,
      );
      if (absolute < deadline) deadline = absolute;
    }
    return transferDate <= deadline
      ? { suspended: true, basis: "na", deadline }
      : { suspended: false, basis: "na", deadline };
  }

  if (isLandPermitTarget === false) {
    // 다목
    if (contractAfter0510 || !depositReceiptConfirmed) return { suspended: false };
    const deadline = civilMonthsDeadline(contractDate, months);
    return transferDate <= deadline
      ? { suspended: true, basis: "da", deadline }
      : { suspended: false, basis: "da", deadline };
  }

  // isLandPermitTarget 미제공 — 나·다목 어느 쪽도 판정 불가(허가 대상 여부 필수 입력)
  return { suspended: false };
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

/** 15호 배제 사유 — 의제 근거 항마다 라벨과 근거 조문이 다르다. */
function deemedOneHouseExclusionReason(
  input: MultiHouseSurchargeInput,
  mergeUnderOldRule: boolean,
): ExclusionReason {
  switch (input.deemedOneHouseBy155) {
    case "rural_house":
      return {
        type: "rural_house",
        detail: `농어촌주택 보유 1세대1주택 의제 (${MULTI_HOUSE.RURAL_HOUSE_2HOUSE_BASIS})`,
      };
    case "marriage_merge": {
      const d = input.marriageMerge!.marriageDate.toISOString().slice(0, 10);
      const basis = mergeUnderOldRule
        ? MULTI_HOUSE.MARRIAGE_MERGE_2HOUSE_BASIS_OLD
        : MULTI_HOUSE.MARRIAGE_MERGE_2HOUSE_BASIS;
      return {
        type: "marriage_merge",
        detail: `혼인일(${d}) 10년 내 먼저 양도 — 1세대1주택 의제 중과 배제 (${basis})`,
      };
    }
    case "parental_care_merge": {
      const d = input.parentalCareMerge!.mergeDate.toISOString().slice(0, 10);
      const basis = mergeUnderOldRule
        ? MULTI_HOUSE.PARENTAL_CARE_MERGE_2HOUSE_BASIS_OLD
        : MULTI_HOUSE.PARENTAL_CARE_MERGE_2HOUSE_BASIS;
      return {
        type: "parental_care_merge",
        detail: `동거봉양 합가일(${d}) 10년 내 먼저 양도 — 1세대1주택 의제 중과 배제 (${basis})`,
      };
    }
    default:
      return {
        type: "temporary_two_house",
        detail: `일시적 2주택 1세대1주택 의제 — 종전주택 처분기한 이내 (${MULTI_HOUSE.TEMP_TWO_HOUSE_2HOUSE_BASIS})`,
      };
  }
}

// ============================================================
// Step 3: 중과세 배제 사유 판단 (소령 §167-10, §167-3 ①)
// ============================================================

export function determineSurchargeExclusion(
  input: MultiHouseSurchargeInput,
  effectiveHouseCount: number,
  suspensionRules: SurchargeSpecialRulesData | null,
  regulatedAreaHistory: RegulatedAreaHistory | null,
  excludedHouseIds: Set<string>,
  /** #2a: 오케스트레이터 Step 1.5에서 §167의3⑨ 차감이 적용됐는지 — 배제 2(§155⑤) 오염 방지 */
  marriageSubtractionApplied: boolean,
): {
  isExcluded: boolean;
  exclusionReasons: ExclusionReason[];
  isSuspended: boolean;
  suspensionBasis?: "a" | "na" | "da";
  suspensionDeadline?: Date;
} {
  const exclusionReasons: ExclusionReason[] = [];
  const sellingHouse = input.houses.find((h) => h.id === input.sellingHouseId);

  // 배제 1: §155 1세대1주택 의제 — 영 §167의10①15호(3주택 이상은 §167의3①13호 동문).
  // 15호 2요소: ① §155 의제 성립 — caller가 **비과세 정본으로 선판정**해 주입한다
  //   (①⑦ `resolveDeemedOneHouseBy155`, ④⑤ `resolveMergeDeeming`). 여기서 재판정하지 않는다 —
  //   종전 배제 2(혼인)·3(동거봉양)은 자체 판정이라 2주택·먼저 양도·합가 전 취득·§154① 요건이
  //   빠져 비과세와 어긋났다(계획서 transfer-review-4-defects D9).
  // ② §154① 요건 모두 충족 — 미제공(?? true)은 충족 간주(직접 호출 하위호환).
  //   합가(④⑤)는 2023.2.28. 전 양도분이면 구 5호(동거봉양)·6호(혼인)라 ② 요건이 없다.
  const deemed = input.deemedOneHouseBy155;
  const isMergeDeemed = deemed === "marriage_merge" || deemed === "parental_care_merge";
  const mergeUnderOldRule = isMergeDeemed && input.transferDate < MERGE_SURCHARGE_154_GATE_EFFECTIVE_DATE;
  if (
    effectiveHouseCount === 2 &&
    deemed &&
    // ⑨ 차감으로 3→2가 된 경우는 §155⑤ 비해당 → 본인 2주택 중과
    !(deemed === "marriage_merge" && marriageSubtractionApplied) &&
    (mergeUnderOldRule || (input.sellingHouseMeetsOneHouseRequirements ?? true))
  ) {
    exclusionReasons.push(deemedOneHouseExclusionReason(input, mergeUnderOldRule));
    return { isExcluded: true, exclusionReasons, isSuspended: false };
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

  // 양도 주택 **자체**가 §167의3①2호~8호·8호의2에 해당하는 경우의 배제.
  //
  // 근거가 주택 수에 따라 갈린다:
  //   3주택 이상 → §167의3① 각 호 **직접**
  //   2주택      → §167의10①**2호**「제167조의3제1항제2호부터 제8호까지 및 제8호의2 중
  //                어느 하나에 해당하는 주택」 — **준용**
  // ⚠️ 2026-07-31 정정(계획서 F-7): 종전에는 `>= 3` 게이트라 **2주택에서 하나도 적용되지 않았다.**
  //    3주택이면 배제되는데 2주택이면 중과되는 역전이었고 과다과세 방향이었다.
  //    2호 장기임대·7호 상속 5년도 D16(2026-09-18)부터 여기서 판정한다 — 종전에는 주택 수에서
  //    빼는 바람에 양도 주택 자체가 상속 5년이면 그 주택을 뺀 나머지로 중과했다(과다).
  if (effectiveHouseCount >= 2 && sellingHouse) {
    const selfBasis = (threeHouse: string) =>
      effectiveHouseCount >= 3 ? threeHouse : MULTI_HOUSE.TWO_HOUSE_167_3_REFERENCE_BASIS;

    if (isSurchargeExemptInherited(sellingHouse, input.transferDate)) {
      exclusionReasons.push({
        type: "inherited_house_5years",
        detail: `§155②에 해당하는 상속주택 — 상속개시일(${sellingHouse.inheritedDate!.toISOString().slice(0, 10)})부터 5년 이내 양도 (${selfBasis(MULTI_HOUSE.INHERITED_5Y_EXCLUSION_BASIS)})`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    if (isSurchargeExemptRental(sellingHouse, input.transferDate)) {
      exclusionReasons.push({
        type: "long_term_rental_house",
        detail: `장기임대주택 양도 (${selfBasis(MULTI_HOUSE.LONG_TERM_RENTAL_EXCLUSION_BASIS)})`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

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

    // 소형 신축·미분양(§167의3①12호)은 위 준용 범위(2~8·8의2) 밖이지만 §167의10①**12호**가
    // 별도로 준용하므로 2주택에서도 성립한다. 통상은 `countEffectiveHouses`가 주택 수에서
    // 먼저 빼므로 여기까지 오지 않는 backstop이다.
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

    // ④ §167의10①4호 「제155조제8항에 따른 수도권 밖에 소재하는 주택」.
    //   15호(§155 의제)를 거치지 않는 **별개 호**다. caller가 §155⑧ 요건을 판정해 주입한다.
    if (input.unavoidableOutsideCapitalHouse) {
      exclusionReasons.push({
        type: "unavoidable_outside_capital",
        detail: `부득이한 사유로 취득한 수도권 밖 주택 보유 — 2주택 중과배제 (${MULTI_HOUSE.TWO_HOUSE_OUTSIDE_CAPITAL})`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

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

    // §167의10①10호 — 「제1호부터 제7호까지의 규정에 해당하는 주택을 제외하고 1개의 주택만을
    //   소유하고 있는 경우 그 해당 주택」. 「제1호부터 제7호」는 §167의10① **자신의** 호다(V-1) —
    //   2호가 §167의3①2호~8호·8호의2(장기임대·감면임대·사원용·조특법·국가유산·상속 5년·저당권·
    //   어린이집)를 준용한다. 3호(부득이)·4호(§155⑧)·7호(소송)는 위에서 따로 본다.
    //   종전에는 7호·2호를 주택 수에서 빼 1주택으로 만들었고, 사원용 등 나머지 2호 주택은 이 호가
    //   없어 +20%p 중과였다(D16).
    //   §167의3④(②로 준용) — 의무기간만 모자란 임대주택등도 여기서는 장기임대주택등으로 본다(F-10).
    const otherIsExcludable = otherEffectiveHouses.find((h) => isExcludableForGeneralHouse(h, input.transferDate));
    if (otherEffectiveHouses.length === 1 && otherIsExcludable) {
      exclusionReasons.push({
        type: "only_general_two_house",
        detail: `다른 주택이 ${getGeneralHouseExcludeReason(otherIsExcludable, input.transferDate)}에 해당 — 그 주택을 제외하고 1주택만 소유 (${MULTI_HOUSE.TWO_HOUSE_ONLY_GENERAL})`,
      });
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

  // 한시 유예 판단 (§167의3①12의2·§167의10①12의2: 보유 2년 이상 + 가·나·다목)
  const surchargeKey = effectiveHouseCount >= 3 ? "multi_house_3plus" : "multi_house_2";
  let suspended = false;
  let suspensionBasis: "a" | "na" | "da" | undefined;
  let suspensionDeadline: Date | undefined;

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
        const result = checkGracePeriodExemption(
          input.transferDate,
          input.gracePeriod,
          sellingHouse?.regionCode,
        );
        suspended = result.suspended;
        suspensionBasis = result.basis;
        suspensionDeadline = result.deadline;
      }
    } else if (suspensionRules) {
      suspended = isSurchargeSuspended(suspensionRules, input.transferDate, surchargeKey);
    }
  }

  return {
    isExcluded: false,
    exclusionReasons,
    isSuspended: suspended,
    ...(suspensionBasis ? { suspensionBasis } : {}),
    ...(suspensionDeadline ? { suspensionDeadline } : {}),
  };
}
