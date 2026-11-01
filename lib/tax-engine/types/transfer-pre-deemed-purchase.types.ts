/**
 * 의제취득일(1985.1.1.) 전 «매수» 부동산 — 영 §176조의2④ 입력·결과 타입
 * 계획서: `docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md`
 */

/** 엔진 입력 — 화면은 취득일 칸을 1985-01-01로 덮어쓰므로 실제 취득일을 따로 받는다(Q-1 B). */
export interface PreDeemedPurchaseInput {
  /** 실제 취득일 — 의제취득일 전이어야 적용한다 */
  originalAcquisitionDate: Date;
  /**
   * 환산·감정·매매사례 모드에서 ②의 기준이 되는 취득 당시 실지거래가액(선택 · Q-2 a).
   * 금액 규약은 `acquisitionPrice`와 같다(지분 자산이면 지분 금액). 실가 모드는 `acquisitionPrice`가 기준이라 쓰지 않는다.
   */
  actualPrice?: number;
  /** 취득월이 생산자물가지수 계열(1965.01~) 전이면 직접 입력하는 배율(의제취득일 직전 달 지수 ÷ 취득월 지수) */
  ppiRatio?: number;
}

/** 결과 echo — ①·② 비교 내역 */
export interface PreDeemedPurchaseDetail {
  /** 실제 취득일 "YYYY-MM-DD" */
  originalAcquisitionDate: string;
  /** 취득월 "YYYY-MM" */
  acquisitionMonth: string;
  /** 의제취득일 직전일이 속하는 달 — 항상 "1984-12" */
  deemedPrevMonth: string;
  ppiAtAcquisition?: number;
  ppiAtDeemedPrev?: number;
  ratioSource: "table" | "override";
  ratio: number;
  /** ②의 기준 실가 */
  actualBase: number;
  /** ② 취득 당시 실가 + 생산자물가상승분 */
  clause2Amount: number;
  /** ① 의제취득일 현재 추계 가액 — 실가 모드면 없다(미산정) */
  clause1Amount?: number;
  /** `redevelopment166_3` — 재개발 원조합원의 ①은 영 §166③ 값이다(계획서 Q-4 a) */
  clause1Method?: "estimated" | "appraisal" | "salesCase" | "redevelopment166_3";
  /** 동액이면 ② */
  selected: "clause1" | "clause2";
  /** ② 채택 = 실비(법 §97②1호 나목) · ① 채택 = 개산공제(법 §97②2호) */
  expenseBasis: "actual" | "estimated";
}
