/**
 * listed-besshi-constants — 상장주식 평가조서(갑·을) 양식 단일 출처 상수.
 *
 * 화면(`Page1CoverSection.tsx`·`Page2DailyClosingTable.tsx`)과
 * PDF(`lib/pdf/ListedStockBesshiPdfDocument.tsx`) 가 동일 상수 import — dual-truth 차단.
 *
 * 라벨 문구는 사용자 첨부 이미지(국세청 상장주식 평가조서) 1:1 매칭.
 *
 * Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md
 * Design UI: docs/02-design/features/listed-stock-besshi-form-replica.ui.design.md §1·§2
 */

// ============================================================
// 갑지 (Page 1) — 18칸 라벨
// ============================================================

export const LS_P1_LABELS = {
  formTitle: "상 장 주 식 평 가 조 서 (갑)",
  section1Title: "1. 평가대상 상장법인",
  section2Title: "2. 1주당 가액 평가",
  section3Title: "3. 미상장주식의 1주당가액 평가",

  // 1.평가대상 상장법인
  "①": "법    인    명",
  "②": "대 표 자",
  "③": "법 인 소 재 지",
  "④": "평가기준일\n(평가기준일이 공휴일\n등인 때 그 전일)",
  "⑤": "평 가 대 상 주 식\n        종         류",
  "⑥": "상 장 일 자",
  "⑦": "증 자 일 자",
  "⑧": "합 병 일 자",

  // 2.1주당 가액 평가
  "⑨": "평가기준일 이전·이후 각 2개월 동안 (또는 증자·합병일의 경우에는\n  상증법 52의2의 기간)의 종가평균(⑱)",
  "⑩": "최대주주 소유주식의 1주당 평가액 : ⑨ × 할증률",

  // 3.미상장주식의 1주당가액 평가
  "⑪": "직 전 기\n배 당 률",
  "⑫": "직전기 배당액\n(1주당액면가액 × ⑪)",
  "⑬": "배 당 기 산 일\n(주금납입다음날)",
  "⑭": "배당 기산일 전\n  일까지의 일 수",
  "⑮": "배당차액\n(⑫ × ⑭)",
  "⑯": "1 주 당 가 액\n(⑨ − ⑮)",
  "⑰": "최대주주 소유주식의 1주당평가액 : ⑯ × 할증률",
} as const;

export const LS_P1_STOCK_CLASS_LABEL: Record<"common" | "preferred", string> = {
  common: "보통주",
  preferred: "우선주",
};

// ============================================================
// 을지 (Page 2) — 표 헤더·소계행
// ============================================================

export const LS_P2_HEADERS = {
  formTitle: "상장주식 평가조서(을)",
  leftGroupHeader: "평가기준일 이전 2월",
  rightGroupHeader: "평가기준일 이후 2월",
  // 5열 헤더 (좌·우 동일)
  columns: ["NO", "월 일", "종 가", "월 일", "종 가"] as const,
  // 마지막 4행 라벨
  subtotalLabel: "소         계",
  tradingDaysLabel: "일       수",
  closingSumLabel: "종가합계(원)",
  closingAverageLabel: "종가평균(원)",
} as const;

// ============================================================
// 결과뷰 토글·산식 라벨
// ============================================================

// ============================================================
// 비영업일 라벨 단순화 — 평가조서(을) 양식
//   "일요일 · 거래일 제외" → "일요일" (이미지 12 정합)
// 양도세 테이블·키움 calendar nonTradingLabel 은 기존 suffix 유지.
// 본 헬퍼는 평가조서(을) 표시 단계에서만 적용 — 화면·PDF 공유.
// ============================================================

export function stripTradingExclusionSuffix(label: string | undefined | null): string {
  if (!label) return "";
  return label.replace(/\s*·\s*거래일\s*제외\s*$/, "");
}

export const LS_RESULT_LABELS = {
  page1Toggle: "▼ 상장주식 평가조서(갑)",
  page2Toggle: "▼ 상장주식 평가조서(을)",
  pdfButton: "📥 PDF 다운로드",
  printButton: "🖨️ 인쇄",
  formulaSection: "산출근거",
  premiumRateLabel: "§63③ 적용 할증률",
  premiumExclusionLabel: "할증 배제 사유",
} as const;
