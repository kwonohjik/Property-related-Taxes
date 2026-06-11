/**
 * 계산서 서식 공용 포맷 — 숫자 끝 "원" 금지(feedback_no_won_suffix), 지수 소수 표시.
 */

/** 금액·면적 콤마 포맷("원" 없음). 0/undefined = 빈칸 */
export const fmt = (n: number | undefined): string =>
  n === undefined || n === 0 ? "" : n.toLocaleString("ko-KR");

/** 지수(정수 100기준) → 소수(116 → "1.16"). undefined = 빈칸 */
export const idx2 = (n: number | undefined): string => (n === undefined ? "" : (n / 100).toFixed(2));

/** 잔가율(0.586) 그대로 */
export const ratio = (n: number | undefined): string => (n === undefined ? "" : String(n));

/** 조정률 항목 → "0.9(9)" (rate 90 → 0.9 · 번호 9). 빈 칸은 "( )" */
export function adjCell(item: { nos: number[]; rate: number } | undefined): string {
  if (!item) return "( )";
  return `${item.rate / 100}(${item.nos.join("·")})`;
}

/** 금액 셀 클래스(우측정렬·고정폭·콤마 세로정렬) */
export const AMOUNT_CELL = "text-right font-mono tabular-nums whitespace-nowrap";
