/**
 * §155⑳ 호별 미충족 사유 문구 — `eligibility.ts`에서 800줄 정책에 따라 분리(2026-10). 판정 로직 없음(failCode → 한국어 문구).
 */
import { TRANSFER_RENTAL_HOUSING } from "../../legal-codes/transfer";
import type { ArticleFailCode } from "../../rental-article/check";
import type { RentalArticle, RentalUnitInput } from "./types";

/**
 * 종전 「민간임대주택에 관한 특별법」 임대의무기간(년) — §43①이 가리키는 §2 5호(장기일반 「8년 이상」)·
 * 6호(단기 「4년 이상」) (법률 제17482호 개정 전, MST 211593). §155㉓1호 1/2 판정 전용(OH-39).
 */
export const TERMINATED_DUTY_YEARS: Record<NonNullable<RentalUnitInput["terminatedRegistrationType"]>, number> = {
  short_term: 4,
  long_term_general: 8,
};

// ============================================================
// 호별 미충족 메시지 빌더 (checkRentalArticle failCode → §155⑳ 한국어 메시지)
// ============================================================

export function buildFailMessage(
  code: ArticleFailCode,
  i: number,
  article: RentalArticle,
  requiredYears: number,
  stdPriceCap: number,
  unit: RentalUnitInput,
): string {
  const n = i + 1;
  switch (code) {
    case "BOTH_REG_REQUIRED":
      return `${n}호: 세무서 사업자등록일과 지자체 임대사업자등록신청일을 모두 입력해야 합니다(사업자등록등).`;
    case "RENTAL_PERIOD_SHORT":
      return `${n}호 의무임대기간 ${requiredYears}년 미충족 (현재: ${Math.floor(unit.rentalMonths / 12)}년 ${unit.rentalMonths % 12}개월)`;
    case "STANDARD_PRICE_EXCEEDED":
      return `${n}호 임대개시일 기준시가 ${(stdPriceCap / 100_000_000).toFixed(0)}억원 초과 (입력값: ${(unit.standardPriceAtRentalStart / 100_000_000).toFixed(2)}억원)`;
    case "APARTMENT_RESTRICTED":
      return `${n}호: 해당 유형(${article}목)에서 아파트는 §155⑳ 특례 대상이 아닙니다.`;
    case "SHORT_TERM_REGULATED":
      return `${n}호: 조정대상지역에 신규취득한 단기임대(아목)는 §155⑳ 특례 불가.`;
    case "SIZE_REQUIRED":
      return `${n}호: ${article === "라" ? "미분양매입임대주택은" : "건설임대는"} 대지면적·연면적을 입력해야 규모요건(대지 298㎡·연면적 149㎡ 이하)을 판정할 수 있습니다.`;
    case "SIZE_EXCEEDED":
      return `${n}호: ${article === "라" ? "미분양매입임대주택" : "건설임대"} 규모요건 초과 (대지 ${unit.landAreaM2}㎡·연면적 ${unit.totalFloorAreaM2}㎡ — 각 298㎡·149㎡ 이하 필요).`;
    case "MIN_UNITS_NOT_MET":
      // 목별 법문이 다르다(소령 §167의3①2호) — 나목 「국민주택규모 … 민간매입임대주택을 2호 이상」,
      // 라목 5) 「미분양매입임대주택이 같은 시ㆍ군에서 5호 이상」, 다·바·자목 「건설임대주택을 2호 이상」.
      if (article === "나") return `${n}호: 나목은 국민주택규모 민간매입임대주택을 2호 이상 임대해야 합니다.`;
      if (article === "라") return `${n}호: 라목은 미분양매입임대주택이 같은 시·군에서 5호 이상이어야 합니다.`;
      return `${n}호: 건설임대는 2호 이상 임대 요건을 충족해야 합니다.`;
    case "REG_DATE_GATE":
      if (article === "나") {
        return `${n}호: 나목(기존사업자)은 지자체 임대사업자 등록이 기존사업자기준일(2003.10.29.) 이전이고 세무서 사업자등록이 2004.6.30.까지(2003.10.29. 현재 지자체 등록자의 사업자등록 의제 포함)여야 합니다 — 입력한 등록일이 이 요건을 충족하지 않습니다.`;
      }
      if (article === "라") {
        return `${n}호: 라목(미분양)은 2008.6.11.~2009.6.30. 사이에 최초로 분양계약을 체결한 주택이어야 합니다 — 입력한 최초 분양계약일이 이 기간 밖이거나 비어 있습니다.`;
      }
      return `${n}호: 해당 유형(${article}목)의 등록기준일 요건을 충족하지 않습니다(단기 6년 유형은 2025.6.4 이후 등록).`;
    case "SHORT_TO_LONG_CHANGE":
      return `${n}호: 단기임대에서 장기일반으로 변경신고한 주택은 §155⑳ 특례 대상이 아닙니다.`;
    case "NATIONAL_SIZE_REQUIRED":
      return `${n}호: 국민주택규모(전용 85㎡·수도권 도시지역 60㎡ 이하) 요건을 충족해야 합니다.`;
    case "REGION_RESTRICTED":
      return `${n}호: 해당 유형은 비수도권 소재 주택만 대상입니다.`;
    case "RENTAL_TERMINATION_RESTRICTED": {
      // ⑳ 경로에서는 ㉓(말소 후 5년 내 거주주택 양도)만 이 코드를 쓴다 — 사목은 ⑳에서 도출되지 않는다.
      const t = unit.terminatedRegistrationType;
      if (!t) {
        return `${n}호: 말소된 임대주택의 민간임대주택 등록 유형(단기 4년·장기일반 8년)을 선택해야 ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_23} 1호(임대의무기간 1/2 이상)를 판정할 수 있습니다.`;
      }
      const duty = TERMINATED_DUTY_YEARS[t];
      return `${n}호: 자진말소는 「민간임대주택에 관한 특별법」 제43조 임대의무기간(${duty}년)의 1/2(${duty * 6}개월) 이상 임대해야 합니다 (현재: ${unit.rentalMonths}개월, ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_23} 1호).`;
    }
    case "REQUIREMENTS_NOT_CONFIRMED":
      return `${n}호: 기타 요건(임대료 5% 이내 증액·임대사업자 등록·임대료 지급 등) 확인 필요`;
    case "REGISTERED_AFTER_TRANSFER":
      return (
        `${n}호: 거주주택 양도일 현재 세무서 사업자등록과 지자체 임대주택 등록을 모두 마쳐야 합니다 ` +
        `(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20} 2호) — 입력한 등록일 중 양도일보다 늦은 날이 있습니다.`
      );
    case "APT_TRANSFER_DEADLINE_EXCEEDED":
      return (
        `${n}호: 해당 유형(${article}목)의 아파트는 ${TRANSFER_RENTAL_HOUSING.PIT_RD_167_3_11}에 따른 양도기한` +
        "(2027.12.31 — 임대의무기간 2027.1.1 이후 종료·2027.1.1 이후 조정대상지역 신규지정·정비사업 이전고시로 " +
        "각각 1년 연장될 수 있음)이 지난 후에도 양도하지 않아 장기임대주택으로 인정되지 않습니다."
      );
    default:
      return `${n}호: 임대주택 요건 미충족`;
  }
}

