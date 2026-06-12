/**
 * 종합부동산세 신고서 서식 단일출처 상수
 *
 * 설계: docs/02-design/features/comprehensive-case12-replica.ui.design.md §1
 * 2022년판 별지 서식 기준 (현행 시행규칙 서식 전면 재편 — 2025.3.21 개정으로 구별지 번호 변경)
 * 현행판과 상이하므로 헤더에 "2022년판" 명기.
 */

// ============================================================
// 셀 CSS 클래스 (amount-column-align 스킬)
// ============================================================

/** 금액 셀 공통: 우측정렬 + 고정폭 + 콤마 세로정렬 */
export const BESSHI_CELL_AMOUNT =
  "text-right font-mono tabular-nums whitespace-nowrap px-1.5 py-1 min-w-[90px]";

/** 라벨 셀 */
export const BESSHI_CELL_LABEL = "px-1.5 py-1 text-xs text-gray-800 dark:text-gray-200";

/** 칸번호 셀 */
export const BESSHI_CELL_NO =
  "px-1.5 py-1 text-center text-xs font-semibold text-violet-700 dark:text-violet-300 w-7";

/** 세율·비율 셀 */
export const BESSHI_CELL_RATE = "text-center font-mono tabular-nums px-1.5 py-1 min-w-[60px]";

/** 테이블 행 — 기본 구분선 */
export const BESSHI_ROW = "border-b border-gray-200 dark:border-gray-700";

/** 테이블 행 — 합계/강조 */
export const BESSHI_ROW_TOTAL =
  "border-b-2 border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 font-semibold";

/** 테이블 행 — 소제목 */
export const BESSHI_ROW_HEADER =
  "bg-gray-100 dark:bg-gray-800 border-b border-t border-gray-400 dark:border-gray-600";

// ============================================================
// 서식 헤더 (별지 번호 + 개정일 + 2022년판 표기)
// ============================================================

export const FORM_HEADER = {
  main: {
    /** 서식 제목 — 과세연도는 컴포넌트 props로 주입 */
    titleTemplate: (year: number) => `${year}년도 종합부동산세 신고서`,
    formCode: "별지 제3호서식",
    /** 현행판과 상이 — 2022년판 고정 */
    revised: "2022년판",
    hint: "현행 시행규칙 서식(2025.3.21 개정)과 별지 번호·양식이 다를 수 있습니다.",
  },
  buppyo3: {
    titleTemplate: (year: number) => `${year}년도 종합부동산세 과세표준 계산명세서`,
    formCode: "별지 제3호서식 부표",
    revised: "2022년판",
  },
  buppyo5: {
    titleTemplate: (year: number) =>
      `${year}년도 종합부동산세 세부담상한초과세액 계산명세서`,
    formCode: "별지 제5호서식",
    revised: "2022년판",
  },
  buppyo5sub: {
    titleTemplate: (year: number) =>
      `${year - 1}년도 직전연도 종합부동산세상당액 계산서`,
    formCode: "별지 제5호서식 부표",
    revised: "2022년판",
  },
} as const;

// ============================================================
// 구비서류 안내 4항 (신고서 우측 하단 고정)
// ============================================================

export const REQUIRED_DOCS = [
  "임대차계약서 사본 (임대주택 합산배제 신청의 경우)",
  "지방세 납부영수증 (재산세 부과 사실 확인)",
  "가족관계증명서 (1세대1주택자 확인)",
  "장기보유·고령자 공제 관련 증빙서류",
] as const;

// ============================================================
// 세부담 상한비율 행 라벨 (별지 5호서식 (3)표 ⑰)
// ============================================================

export const CAP_RATE_LABELS: Record<number, string> = {
  1.5: "150% (일반)",
  2.0: "200% (구 다주택)",
  3.0: "300% (구 다주택·3주택 이상)",
};

// ============================================================
// 열 구성 (주택/종합합산/별도합산)
// ============================================================

export const FORM_COLUMNS = [
  { key: "housing", label: "주택" },
  { key: "aggLand", label: "종합합산토지" },
  { key: "sepLand", label: "별도합산토지" },
] as const;

export type FormColumnKey = (typeof FORM_COLUMNS)[number]["key"];

// ============================================================
// 용지 규격 (신고서 하단 고정)
// ============================================================

export const PAPER_SPEC = "210mm×297mm[일반용지 70g/㎡(재활용품)]";

// ============================================================
// 포맷 헬퍼
// ============================================================

/** 천단위 콤마 ("원" 미표기) */
export function fmtKRW(n: number | undefined | null): string {
  if (n == null || n === 0) return "0";
  return Math.round(n).toLocaleString("ko-KR");
}

/** 빈칸 (미해당) */
export const DASH = "—";

/** 퍼센트 표기 (소수·배수 → %) */
export function fmtPct(rate: number, digits = 1): string {
  return `${(rate * 100).toFixed(digits).replace(/\.?0+$/, "")}%`;
}

/** data-besshi-cell testid 생성 헬퍼 */
export function besshiTestId(prefix: string, cell: string, col?: string): string {
  return col ? `${prefix}${cell}-${col}` : `${prefix}${cell}`;
}
