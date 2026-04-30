/**
 * 다주택 중과세율 판정 모듈
 *
 * [P1-2] §13의2① 다주택 중과 (조정/비조정 × 주택 수)
 * [P1-3] §13의2② 무상취득(증여) 중과 — 3분기 흐름
 * [P1-5] 일시적 2주택 배제 — 시점별 처분기한
 *
 * 지방세법 §13의2① — 산식 구조 (법령 원문):
 *   "§11①7나의 세율(=4%)을 표준세율로 하여 + 중과기준세율 × N% 합한 세율"
 *   1호 (법인): 4% + 중과기준세율×400%(=8%p) = 12%
 *   2호 (조정 2주택 OR 비조정 3주택): 4% + 중과기준세율×200%(=4%p) = 8%
 *   3호 (조정 3주택+ OR 비조정 4주택+): 4% + 중과기준세율×400%(=8%p) = 12%
 *
 * [v4 반박 메모]: 외부 검토자가 "§13의2는 1천분의 120/80 직접 규정"이라 주장했으나,
 * 법령 원문은 명백히 "§11①7나 표준세율(4%) + 중과기준세율 가산" 구조.
 * 코드 가독성 보강을 위해 결과 직접 매핑 + 산식 주석 병기.
 */

import { ACQUISITION, ACQUISITION_CONST } from "../legal-codes";

// ============================================================
// 상수 정의 (§13의2① 결과 매핑 — 가독성 + 디버깅 용이성)
// ============================================================

/**
 * 다주택·법인 중과세율 상수
 * 법령 산식: §11①7나 표준세율(4%) + 중과기준세율(2%) × N%
 * - 1호/3호: 4% + 2%×400% = 4% + 8% = 12%
 * - 2호:     4% + 2%×200% = 4% + 4% = 8%
 */
export const SURCHARGE_RATES = {
  /** 1호 (법인): 4% + 8%p = 12% */
  CORP: 0.12,
  /** 2호 (조정 2주택 OR 비조정 3주택): 4% + 4%p = 8% */
  MULTI_HOUSE_8: 0.08,
  /** 3호 (조정 3주택+ OR 비조정 4주택+): 4% + 8%p = 12% */
  MULTI_HOUSE_12: 0.12,
  /** 무상취득 중과 (§13의2②): 4% + 8%p = 12% */
  GIFT_12: 0.12,
} as const;

// ============================================================
// P1-2: 다주택 중과 판정 (§13의2①)
// ============================================================

/** 다주택 중과 판정 결과 */
export interface MultiHouseSurchargeResult {
  isSurcharged: boolean;
  surchargeRate?: number;
  appliedBranch: "corp_housing" | "multi_house_8" | "multi_house_12" | "basic";
  reason: string;
  legalBasis: string[];
}

/**
 * [P1-2] 다주택 중과세율 판정
 *
 * [v4 D2] 법인 주택 12% — 주택 수 카운트 skip 최적화
 * 법인이면 주택 수 평가 불필요하고 12% 즉시 리턴.
 *
 * [v4 D8] §13의2 vs §13② 중과제외업종 단서 차이 명시:
 * §13의2① 1호 단서는 시행령 §28의2 8호 나목 5종만 적용
 * (주택건설사업자·주택조합·민간임대·공공주택건설·도시정비사업자).
 * 사회기반시설·해외건설 등은 §13② 대도시 법인 중과 단서 한정.
 */
export function assessMultiHouseSurcharge(input: {
  acquiredBy: string;
  isHousing: boolean;
  isRegulatedArea: boolean;
  houseCount: number;
  isOnerousAcquisition: boolean;
}): MultiHouseSurchargeResult {
  const { acquiredBy, isHousing, isRegulatedArea, houseCount, isOnerousAcquisition } = input;

  // 주택 아닌 경우 다주택 중과 미적용
  if (!isHousing) {
    return {
      isSurcharged: false,
      appliedBranch: "basic",
      reason: "주택이 아닌 물건 — 다주택 중과 미적용",
      legalBasis: [],
    };
  }

  // 유상취득이 아닌 경우 다주택 중과 미적용
  // (§13의2① 본문: "유상으로 취득하는 경우" — 상속·증여 등 무상취득 별도 규정)
  if (!isOnerousAcquisition) {
    return {
      isSurcharged: false,
      appliedBranch: "basic",
      reason: "무상취득 — 다주택 중과 §13의2① 미적용 (유상취득만 해당)",
      legalBasis: [],
    };
  }

  // [v4 D2] 법인 주택: 주택 수 skip, 즉시 12%
  if (acquiredBy === "corporation") {
    return {
      isSurcharged: true,
      surchargeRate: SURCHARGE_RATES.CORP,
      appliedBranch: "corp_housing",
      reason: `법인 주택 유상취득 중과 (${ACQUISITION.MULTI_HOUSE_SURCHARGE} 1호) — 12%`,
      legalBasis: [ACQUISITION.MULTI_HOUSE_SURCHARGE],
    };
  }

  // §13의2① 2호: 조정 2주택 OR 비조정 3주택 → 8%
  if (
    (isRegulatedArea && houseCount === 2) ||
    (!isRegulatedArea && houseCount === 3)
  ) {
    const context = isRegulatedArea ? `조정대상지역 ${houseCount}주택` : `비조정지역 ${houseCount}주택`;
    return {
      isSurcharged: true,
      surchargeRate: SURCHARGE_RATES.MULTI_HOUSE_8,
      appliedBranch: "multi_house_8",
      reason: `${context} 취득 중과 (${ACQUISITION.MULTI_HOUSE_SURCHARGE} 2호) — 8%`,
      legalBasis: [ACQUISITION.MULTI_HOUSE_SURCHARGE],
    };
  }

  // §13의2① 3호: 조정 3주택+ OR 비조정 4주택+ → 12%
  if (
    (isRegulatedArea && houseCount >= 3) ||
    (!isRegulatedArea && houseCount >= 4)
  ) {
    const context = isRegulatedArea ? `조정대상지역 ${houseCount}주택` : `비조정지역 ${houseCount}주택`;
    return {
      isSurcharged: true,
      surchargeRate: SURCHARGE_RATES.MULTI_HOUSE_12,
      appliedBranch: "multi_house_12",
      reason: `${context} 취득 중과 (${ACQUISITION.MULTI_HOUSE_SURCHARGE} 3호) — 12%`,
      legalBasis: [ACQUISITION.MULTI_HOUSE_SURCHARGE],
    };
  }

  // 중과 미해당 → §11①8 가격별 주택세율 (1~3% 또는 6~9억 선형보간)
  const noSurchargeReason = isRegulatedArea
    ? `조정대상지역 1주택 취득 — 기본세율 적용`
    : `비조정대상지역 주택 취득 — 주택 수 무관 기본세율 적용`;

  return {
    isSurcharged: false,
    appliedBranch: "basic",
    reason: noSurchargeReason,
    legalBasis: [],
  };
}

// ============================================================
// P1-3: 무상취득(증여) 중과 — 3분기 흐름 (§13의2②)
// ============================================================

/**
 * [P1-3] 무상취득 증여 중과 판정 — 3분기 흐름
 *
 * 지방세법 §13의2② — 산식 (법령 원문):
 * "§11①2(증여 3.5%/2.8%)에도 불구하고 §11①7나 표준세율(4%) + 중과기준세율×400%(=8%p) = 12%"
 * 단서 배제 시 §11①2 표준세율로 복귀 (3.5% 일반 / 2.8% 비영리)
 *
 * [v4 M3 명시] 3분기 흐름:
 * 1. 시가표준액 3억 미만 → 일반 증여 표준세율
 * 2. 비조정지역 → 일반 증여 표준세율
 * 3. 조정지역 + 3억 이상 → 단서 배제 검토 → 배제 시 기본세율 / 미배제 시 12%
 *
 * [v4 M4] giftorRelation enum:
 * 시행령 §28의6② 1호 구조: 증여자가 1세대 1주택자 → 그 1세대 내 가족(배우자/직계존속/직계비속)이
 * 무상취득 시 단서 적용. 수증자 입장에서 본 증여자의 관계.
 *
 * 별장 폐지(2023.3.14)는 §13⑤ 사치성 한정 — §13의2 무상취득 중과와는 무관.
 * (별장은 주택 아니므로 다주택 카운트에도 미포함)
 */
export interface GiftSurchargeResult {
  isSurcharged: boolean;
  surchargeRate?: number;
  appliedBranch: "gift_12" | "basic";
  exclusionReason?: string;
  reason: string;
  legalBasis: string[];
}

/** 단서 배제 대상 증여자 관계 — 시행령 §28의6② 1호 */
type GiftorRelation =
  | "spouse"                  // 가목: 증여자가 수증자의 배우자
  | "lineal_ascendant"        // 나목 1: 증여자가 수증자의 직계존속 (부모·조부모)
  | "lineal_ascendant_spouse" // 나목 2: 증여자가 수증자의 직계존속의 배우자 (계부·계모)
  | "lineal_descendant"       // 다목 1: 증여자가 수증자의 직계비속 (자녀·손자녀)
  | "lineal_descendant_step"  // 다목 2: 증여자가 수증자의 의붓자녀 (혼인 중 배우자의 직계비속)
  | "other";

/** 단서 배제 적용 여부: 가목~다목 해당 여부 */
function isFamilyRelationForExclusion(giftorRelation: GiftorRelation | undefined): boolean {
  if (!giftorRelation) return false;
  return [
    "spouse",
    "lineal_ascendant",
    "lineal_ascendant_spouse",
    "lineal_descendant",
    "lineal_descendant_step",
  ].includes(giftorRelation);
}

export function assessGiftSurcharge(input: {
  isHousing: boolean;
  isRegulatedArea: boolean;
  wholeStdValue: number;                   // 전체 주택 시가표준액 (§13의2② 3억 기준)
  giftorIs1HHHolder?: boolean;             // 증여자가 1세대 1주택자인지
  giftorRelation?: GiftorRelation;         // 수증자 관점의 증여자 신분 (§28의6②)
  specialRateType?: string;                // 세율특례 사유 (divorce_division 시 단서 배제)
}): GiftSurchargeResult {
  const { isHousing, isRegulatedArea, wholeStdValue } = input;

  // 주택이 아니면 증여 중과 미적용
  if (!isHousing) {
    return {
      isSurcharged: false,
      appliedBranch: "basic",
      reason: "주택이 아닌 물건 — 증여 중과 §13의2② 미적용",
      legalBasis: [],
    };
  }

  // [분기 1] 시가표준액 3억 미만 → 일반 증여 표준세율 (§13의2② 본문: 3억 이상 조건)
  if (wholeStdValue < ACQUISITION_CONST.GIFT_SURCHARGE_STD_VALUE_MIN) {
    return {
      isSurcharged: false,
      appliedBranch: "basic",
      reason: `시가표준액 ${wholeStdValue.toLocaleString()}원이 3억원 미만 — 일반 증여 표준세율 적용 (${ACQUISITION.GIFT_SURCHARGE})`,
      legalBasis: [ACQUISITION.GIFT_SURCHARGE],
    };
  }

  // [분기 2] 비조정지역 → 중과 적용 안 됨 (§13의2② 본문 "조정대상지역" 한정)
  if (!isRegulatedArea) {
    return {
      isSurcharged: false,
      appliedBranch: "basic",
      reason: `비조정대상지역 증여 — 일반 증여 표준세율 적용 (${ACQUISITION.GIFT_SURCHARGE} 조정지역 한정)`,
      legalBasis: [ACQUISITION.GIFT_SURCHARGE],
    };
  }

  // [분기 3] 조정지역 + 3억 이상 → 단서 배제 검토

  // 단서 배제 1: 시행령 §28의6② 1호 — 1세대 1주택자가 소유한 주택을 가족이 무상취득
  // 증여자 1세대 1주택자 조건 + 가목~다목 관계 모두 충족 필요
  if (input.giftorIs1HHHolder && isFamilyRelationForExclusion(input.giftorRelation)) {
    const familyLabel = {
      spouse: "배우자(가목)",
      lineal_ascendant: "직계존속(나목 1)",
      lineal_ascendant_spouse: "직계존속의 배우자(계부·계모, 나목 2)",
      lineal_descendant: "직계비속(다목 1)",
      lineal_descendant_step: "의붓자녀(혼인 중 배우자의 직계비속, 다목 2)",
    }[input.giftorRelation as string] ?? "가족";

    return {
      isSurcharged: false,
      appliedBranch: "basic",
      exclusionReason: `1세대 1주택자의 ${familyLabel} 무상취득 — 단서 배제 (${ACQUISITION.GIFT_SURCHARGE_EXCLUSION} ②1호)`,
      reason: `1세대 1주택자의 ${familyLabel} 무상취득 — 일반 증여 표준세율 적용`,
      legalBasis: [ACQUISITION.GIFT_SURCHARGE, ACQUISITION.GIFT_SURCHARGE_EXCLUSION],
    };
  }

  // 단서 배제 2: 시행령 §28의6② 2호 — §15①6 이혼 재산분할 세율특례 적용 대상
  if (input.specialRateType === "divorce_division") {
    return {
      isSurcharged: false,
      appliedBranch: "basic",
      exclusionReason: `이혼 재산분할(§15①6) 세율특례 적용 — 단서 배제 (${ACQUISITION.GIFT_SURCHARGE_EXCLUSION} ②2호)`,
      reason: "이혼 재산분할 특례 — 일반 표준세율 적용",
      legalBasis: [ACQUISITION.GIFT_SURCHARGE, ACQUISITION.GIFT_SURCHARGE_EXCLUSION],
    };
  }

  // [분기 4] 조정지역 + 3억 이상 + 단서 미배제 → 12% 중과
  return {
    isSurcharged: true,
    surchargeRate: SURCHARGE_RATES.GIFT_12,
    appliedBranch: "gift_12",
    reason: `조정대상지역 + 시가표준액 ${wholeStdValue.toLocaleString()}원(3억 이상) 증여 중과 (${ACQUISITION.GIFT_SURCHARGE}) — 12%`,
    legalBasis: [ACQUISITION.GIFT_SURCHARGE],
  };
}

// ============================================================
// P1-5: 일시적 2주택 — 시점별 처분기한 (§28의5)
// ============================================================

/**
 * [P1-5] 일시적 2주택 처분기한 계산
 *
 * 지방세법 시행령 §28의5① 변천:
 * - 2023.2.28~ 현행: 모든 경우 3년 단일
 * - 2022.5.10 ~ 2023.2.27: 조정+조정 2년 / 그 외 3년
 * - ~2022.5.9: 조정+조정 1년 / 그 외 3년
 *
 * @returns 처분기한 연수 (1, 2, 또는 3)
 */
export function getDisposalDeadlineYears(
  balanceDate: string | Date,
  prevRegion: "regulated" | "non_regulated",
  newRegion: "regulated" | "non_regulated"
): number {
  const date = typeof balanceDate === "string" ? new Date(balanceDate) : balanceDate;
  const isAllRegulated = prevRegion === "regulated" && newRegion === "regulated";

  // 2023.2.28 ~ 현행: 모든 경우 3년 단일
  if (date >= new Date("2023-02-28")) return 3;

  // 2022.5.10 ~ 2023.2.27: 조정+조정 2년, 그 외 3년
  if (date >= new Date("2022-05-10")) return isAllRegulated ? 2 : 3;

  // ~2022.5.9: 조정+조정 1년, 그 외 3년
  return isAllRegulated ? 1 : 3;
}

/**
 * [P1-5] 일시적 2주택 처분기한 날짜 계산
 *
 * @param balanceDate 신규 주택 잔금일
 * @param prevRegion 종전 주택 지역 (조정/비조정)
 * @param newRegion 신규 주택 지역 (조정/비조정)
 * @returns 처분기한 날짜 문자열 (YYYY-MM-DD)
 */
export function getDisposalDeadlineDate(
  balanceDate: string,
  prevRegion: "regulated" | "non_regulated",
  newRegion: "regulated" | "non_regulated"
): string {
  const years = getDisposalDeadlineYears(balanceDate, prevRegion, newRegion);
  const date = new Date(balanceDate);
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString().slice(0, 10);
}

/**
 * [P1-5] 일시적 2주택 배제 판정
 *
 * 조건: 취득 후 2주택 + isTemporaryTwoHouse = true
 * 결과: 중과 배제 + 처분기한 D-day 안내
 */
export interface TemporaryTwoHouseResult {
  isExcluded: boolean;
  disposalDeadlineYears?: number;
  disposalDeadlineDate?: string;
  warning?: string;
}

export function assessTemporaryTwoHouse(input: {
  houseCount: number;
  isTemporaryTwoHouse?: boolean;
  balanceDate?: string;
  previousHouseRegion?: "regulated" | "non_regulated";
  newHouseRegion?: "regulated" | "non_regulated";
}): TemporaryTwoHouseResult {
  const { houseCount, isTemporaryTwoHouse, balanceDate } = input;

  // 일시적 2주택은 취득 후 2주택일 때만 적용
  if (houseCount !== 2 || !isTemporaryTwoHouse) {
    return { isExcluded: false };
  }

  const prevRegion = input.previousHouseRegion ?? "non_regulated";
  const newRegion = input.newHouseRegion ?? "non_regulated";
  const date = balanceDate ?? new Date().toISOString().slice(0, 10);

  const years = getDisposalDeadlineYears(date, prevRegion, newRegion);
  const deadlineDate = getDisposalDeadlineDate(date, prevRegion, newRegion);

  return {
    isExcluded: true,
    disposalDeadlineYears: years,
    disposalDeadlineDate: deadlineDate,
    warning: [
      `일시적 2주택 중과 배제 — 종전 주택을 ${deadlineDate}까지(${years}년 이내) 처분해야 합니다.`,
      "처분기한 내 처분 시 기본세율 확정. 미처분 시 중과세율 차액(8%-기본세율)이 추징됩니다.",
      `법적 근거: ${ACQUISITION.TEMP_2HOUSE_EXCLUSION}`,
    ].join(" "),
  };
}
