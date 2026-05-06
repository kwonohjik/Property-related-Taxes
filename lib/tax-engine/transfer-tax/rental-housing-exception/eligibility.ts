/**
 * 장기임대주택 거주주택 비과세 특례 — §155⑳ 3요건 자동 판정
 *
 * 판정 순서:
 * 1. 거주주택 요건 (보유 2년 + 거주 2년)
 * 2. 임대주택 호별 요건:
 *    (a) 등록신청일별 의무임대기간
 *    (b) 임대개시일 기준시가 상한
 *    (c) 아파트 등록 제한 (2020.7.11 이후)
 *    (d) 기타 요건 자기확인
 * 3. 1호라도 통과하면 PASS
 *
 * 법령 근거: 소득세법 시행령 §155⑳
 */

import { TRANSFER_RENTAL_HOUSING } from "../../legal-codes/transfer";
import type {
  RentalUnitInput,
  EligibilityResult,
  RentalUnitFailReason,
} from "./types";

// ============================================================
// 등록신청일별 의무임대기간 룩업
// ============================================================

/**
 * 등록신청일에 따른 의무임대기간(년) 반환
 *
 * 2020.7.10 이전:  단기(short-4) = 4년 / 장기(long-8, pre-2018) = 5년
 * 2020.7.11~8.17: 장기(long-8) = 8년
 * 2020.8.18 이후: 장기(long-10) = 10년
 * 2025.6.4 이후 단기: 단기(short-6) = 6년
 *
 * @returns 의무임대기간 (년)
 */
function lookupRequiredRentalYears(unit: RentalUnitInput): number {
  const d = unit.registrationDate;
  const regTs = d.getTime();

  const CUT_2020_07_11 = new Date("2020-07-11").getTime();
  const CUT_2020_08_18 = new Date("2020-08-18").getTime();
  const CUT_2025_06_04 = new Date("2025-06-04").getTime();

  if (unit.rentalType === "short-6") {
    // 2025.6.4 이후 신설 단기 6년
    return 6;
  }
  if (unit.rentalType === "short-4") {
    // 단기임대 4년 (2020.7.10 이전 등록)
    return 4;
  }
  if (unit.rentalType === "pre-2018") {
    // 구 임대주택법 적용 — 5년
    return 5;
  }
  // long-8 / long-10 분기
  if (regTs < CUT_2020_07_11) {
    // 2020.7.10 이전: 장기 5년 (당시 규정)
    return 5;
  }
  if (regTs < CUT_2020_08_18) {
    // 2020.7.11~8.17: 장기 8년
    return 8;
  }
  if (regTs >= CUT_2025_06_04) {
    // 2025.6.4 이후: 10년 (신규 단기 short-6은 위에서 처리)
    return 10;
  }
  // 2020.8.18 이후: 장기 10년
  return 10;
}

// ============================================================
// 기준시가 상한 룩업
// ============================================================

/**
 * 수도권/비수도권별 임대개시일 기준시가 상한 반환 (원)
 *
 * 수도권(서울메트로 포함): 6억원
 * 비수도권: 3억원
 * 조정대상지역: 수도권 기준 6억원 (소재지 기준 적용)
 *
 * @returns 기준시가 상한 (원)
 */
function lookupStandardPriceCap(
  unit: RentalUnitInput,
): number {
  switch (unit.region) {
    case "non-metro":
      return 300_000_000; // 3억
    case "seoul-metro":
    case "regulated-area":
    default:
      return 600_000_000; // 6억
  }
}

// ============================================================
// 아파트 등록 제한 판정
// ============================================================

/**
 * 2020.7.11 이후 등록한 아파트 장기일반민간임대는 §155⑳ 특례 불가
 *
 * 제외 대상:
 * - 2020.7.11 이후 임대사업자등록 신청한 장기일반민간임대 중 아파트
 * - 단기임대를 2020.7.11 이후 장기로 변경 신고한 아파트
 *
 * @returns true = 제한 대상 (특례 불가)
 */
function isApartmentRestricted(unit: RentalUnitInput): boolean {
  if (!unit.isApartment) return false;

  const CUT_2020_07_11 = new Date("2020-07-11").getTime();
  const regTs = unit.registrationDate.getTime();

  // 2020.7.11 이후 등록 아파트 → 제한
  if (regTs >= CUT_2020_07_11) return true;

  return false;
}

// ============================================================
// 단기임대 + 조정대상지역 제한 (2025.6.4 이후 short-6 신설)
// ============================================================

/**
 * 단기임대(short-6) + 조정대상지역 조합은 §155⑳ 특례 불가
 */
function isShortTermRegulated(unit: RentalUnitInput): boolean {
  return unit.rentalType === "short-6" && unit.region === "regulated-area";
}

// ============================================================
// 메인 판정 함수
// ============================================================

/**
 * §155⑳ 3요건 자동 판정
 *
 * @param rentalUnits 임대주택 배열 (최소 1호)
 * @param residenceHoldYears 거주주택 보유연수
 * @param residenceLiveYears 거주주택 거주연수
 * @returns EligibilityResult
 */
export function checkEligibility(
  rentalUnits: RentalUnitInput[],
  residenceHoldYears: number,
  residenceLiveYears: number,
): EligibilityResult {
  const residenceFailReasons: string[] = [];

  // ── 1. 거주주택 요건 ──
  if (residenceHoldYears < 2) {
    residenceFailReasons.push(
      `거주주택 보유기간 2년 미충족 (현재: ${residenceHoldYears}년)`,
    );
  }
  if (residenceLiveYears < 2) {
    residenceFailReasons.push(
      `거주주택 거주기간 2년 미충족 (현재: ${residenceLiveYears}년)`,
    );
  }

  // ── 2. 임대주택 호별 요건 ──
  const unitFailReasons: RentalUnitFailReason[] = [];
  let anyUnitPassed = false;

  for (let i = 0; i < rentalUnits.length; i++) {
    const unit = rentalUnits[i];
    const unitFails: RentalUnitFailReason[] = [];

    // (a) 의무임대기간
    const requiredYears = lookupRequiredRentalYears(unit);
    const actualYears = unit.rentalMonths / 12;
    if (actualYears < requiredYears) {
      unitFails.push({
        unitIndex: i,
        code: "RENTAL_PERIOD_SHORT",
        message: `${i + 1}호 의무임대기간 ${requiredYears}년 미충족 (현재: ${Math.floor(unit.rentalMonths / 12)}년 ${unit.rentalMonths % 12}개월)`,
      });
    }

    // (b) 기준시가 상한
    const priceCap = lookupStandardPriceCap(unit);
    if (unit.standardPriceAtRentalStart > priceCap) {
      unitFails.push({
        unitIndex: i,
        code: "STANDARD_PRICE_EXCEEDED",
        message: `${i + 1}호 임대개시일 기준시가 ${(priceCap / 100_000_000).toFixed(0)}억원 초과 (입력값: ${(unit.standardPriceAtRentalStart / 100_000_000).toFixed(2)}억원)`,
      });
    }

    // (c) 아파트 등록 제한
    if (isApartmentRestricted(unit)) {
      unitFails.push({
        unitIndex: i,
        code: "APARTMENT_RESTRICTED",
        message: `${i + 1}호: 2020.7.11 이후 등록 아파트 장기일반민간임대는 §155⑳ 특례 불가`,
      });
    }

    // (d) 단기임대 + 조정대상지역
    if (isShortTermRegulated(unit)) {
      unitFails.push({
        unitIndex: i,
        code: "SHORT_TERM_REGULATED",
        message: `${i + 1}호: 단기임대(6년) + 조정대상지역 조합은 §155⑳ 특례 불가`,
      });
    }

    // (e) 기타 요건 자기확인
    if (!unit.requirementsConfirmed) {
      unitFails.push({
        unitIndex: i,
        code: "REQUIREMENTS_NOT_CONFIRMED",
        message: `${i + 1}호: 기타 요건(임대료 5% 이내 증액·임대사업자 등록·임대료 지급 등) 확인 필요`,
      });
    }

    if (unitFails.length === 0) {
      anyUnitPassed = true;
    } else {
      unitFailReasons.push(...unitFails);
    }
  }

  const passed =
    residenceFailReasons.length === 0 && anyUnitPassed;

  return {
    passed,
    failReasons: unitFailReasons,
    residenceFailReasons,
    laws: [TRANSFER_RENTAL_HOUSING.PIT_RD_155_20],
  };
}

// ============================================================
// 단위 테스트용 내부 함수 export (테스트에서 직접 검증 가능하도록)
// ============================================================

export { lookupRequiredRentalYears, lookupStandardPriceCap, isApartmentRestricted };
