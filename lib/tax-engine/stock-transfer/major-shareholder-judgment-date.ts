/**
 * 대주주 판정 기준일(직전 사업연도 종료일) 제안 — 「소득세법 시행령」 §157④.
 *
 * §157④는 「주주 1인과 기타주주가 **직전 사업연도 종료일 현재** 소유하고 있는 주식등의
 * 합계액」을 기준으로 대주주를 판정한다. 사업연도는 법인마다 다르므로 이 값은 **제안**일 뿐
 * 확정이 아니다 — 12월 결산을 가정해 도출하고, 사용자가 폼에서 보고 고칠 수 있어야 한다.
 *
 * ⚠️ 이것은 「자동 fallback」이 아니다. 종전 `stock-transfer-tax-api.ts`가 미입력 시
 * **오늘 날짜**를 API 변환 단계에서 몰래 채우던 것과 다르다 — 그 값은 화면에 나타나지
 * 않았고 사건(양도일)과도 무관해, 2021년 양도 건에 2026년 임계를 적용해 판정을 뒤집었다.
 * 여기서는 (1) 양도일에서 도출하고 (2) 폼 필드에 실어 화면에 보이며 (3) 수정 가능하다.
 */

/** "YYYY-MM-DD" 형식인지 */
function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * 양도일 → 직전 사업연도 종료일 제안값 (12월 결산 가정).
 *
 * @returns "YYYY-12-31" · 입력이 날짜 형식이 아니면 빈 문자열(제안하지 않음)
 */
export function suggestPriorYearEndDate(transferDate: string): string {
  if (!isIsoDate(transferDate)) return "";
  const year = Number(transferDate.slice(0, 4));
  if (!Number.isFinite(year) || year < 1900) return "";
  return `${year - 1}-12-31`;
}

/**
 * 분할 양도(lot) 여러 건에서 제안값을 도출한다.
 *
 * 엔진은 판정 기준일을 **하나만** 받으므로 lot들이 같은 과세기간에 속함을 전제한다.
 * 가장 이른 양도일을 기준으로 삼는다 — 연도가 섞이면 애초에 별개 신고 단위다.
 *
 * @returns 제안값 · 유효한 lot 양도일이 없으면 빈 문자열
 */
export function suggestPriorYearEndDateFromLots(
  lots: ReadonlyArray<{ transferDate: string }>,
): string {
  const dates = lots.map((l) => l.transferDate).filter(isIsoDate).sort();
  if (dates.length === 0) return "";
  return suggestPriorYearEndDate(dates[0]);
}
