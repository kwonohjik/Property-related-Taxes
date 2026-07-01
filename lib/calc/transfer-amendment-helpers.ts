/**
 * 양도소득세 수정신고 공용 헬퍼 (클라이언트).
 *
 * 법정신고기한 도출 단일소스 — handleAmend hydration·validate·프리뷰가 공유(dual-truth 방지).
 */

/**
 * 확정신고기한 = 양도일이 속하는 과세기간의 다음 연도 5월 31일 (소득세법 §110①).
 * @param transferDate "YYYY-MM-DD" (미입력/부정형이면 "")
 * @returns "YYYY-05-31" 또는 ""
 */
export function deriveStatutoryDeadline(transferDate: string | undefined): string {
  if (!transferDate) return "";
  const year = parseInt(transferDate.slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1900) return "";
  return `${year + 1}-05-31`;
}
