/**
 * 비사업용 토지 §168의11③1호 간주임대료 정기예금 이자율 (부가가치세법 시행령 §65① 산식)
 *
 * 율 근거: 부가가치세법 시행규칙 §47 "계약기간 1년의 정기예금 이자율".
 * - 현행 1,000분의 31 (= 3.1%) — KoreanLaw MCP 본문 검증 2026-06-29 (시행규칙 MST 284995).
 *   시행일 2025-03-21(제01116호) 교차참조(LBOX 메타·국세 환급가산금율 동일 조정 이력).
 *
 * ⚠️ 추정 금지: 2025-03-21 이전 과거 연도값은 권위 있는 버전별 확인이 되지 않아 미등재.
 *    해당 시점 양도/직전 과세기간은 resolveDeemedRentRate가 null 반환 → 엔진이
 *    "간주임대료율 확인 필요"로 경고하고 간주임대료를 적용하지 않는다(임의값 금지).
 *    과거 연도 사례가 필요하면 시행규칙 §47 버전별(efflaw) 실증 후 본 테이블에 추가.
 *
 * 분수(rateNum/rateDen)로 보관 — 정수연산(safeMultiplyThenDivide)에 그대로 사용, 부동소수 회피.
 */
export interface DeemedRentRate {
  /** 시행일 (YYYY-MM-DD, inclusive) */
  from: string;
  /** 이자율 분자 */
  rateNum: number;
  /** 이자율 분모 */
  rateDen: number;
}

/** 시행일 내림차순 정렬 유지 (resolve는 최신부터 매칭) */
export const NBL_DEEMED_RENT_RATES: readonly DeemedRentRate[] = [
  { from: "2025-03-21", rateNum: 31, rateDen: 1000 }, // 현행 3.1% (검증 2026-06-29)
];

/** Date | "YYYY-MM-DD" | year(number) → "YYYY-MM-DD" 정규화 (연도만 주면 연말 기준 — §168의11④ 과세기간 종료일) */
function toDateStr(d: Date | string | number): string {
  if (typeof d === "number") return `${d}-12-31`;
  if (typeof d === "string") return d.length >= 10 ? d.slice(0, 10) : `${d}-12-31`;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 해당 과세기간(날짜/연도)에 적용되는 정기예금 이자율 반환.
 * @returns 매칭 율(분수) 또는 미등재(미검증) 연도면 null.
 */
export function resolveDeemedRentRate(dateOrYear: Date | string | number): DeemedRentRate | null {
  const target = toDateStr(dateOrYear);
  for (const r of NBL_DEEMED_RENT_RATES) {
    if (target >= r.from) return r;
  }
  return null;
}
