"use client";

/**
 * 해외주식 입력 블록 공용 — 섹션 상자 · 선택지 상수 · props 타입
 *
 * 계획서: `docs/00-pm/foreign-stock-wizard-step-realign.plan.md`
 *
 * 종전에는 `ForeignStockBlock.tsx`(572줄) 하나가 6개 섹션을 다 들고 **1단계에** 붙어 있었다.
 * 그 탓에 2·3단계가 국내 전용 칸을 다시 내밀어 **금액을 두 번 입력**하게 됐고, 그 국내 칸은
 * 국외 body 에 실리지도 않는 **유령 입력**이었다(계획서 §2.3 실측).
 *
 * ⇒ 블록을 단계별로 쪼갠다. 이 파일은 세 블록이 **함께 쓰는 것**만 담는다 — 복제하면 갈라진다.
 *
 * 🔑 **섹션 번호는 각 단계 안에서 1부터**다(계획서 Q-1). 단계가 갈렸으므로 종전 1~6 연번은 의미가 없다.
 */

// SectionBox·props 타입은 국외전출세와 **공용**이다 — 복제 금지(계획서 Q-2)
export { SectionBox } from "./stock-section-box";
export type { StockStepBlockProps as ForeignStockSectionProps } from "./stock-section-box";


// ── 통화 목록 ──


// ── 양도가액 수령 방식 (FS-09 §178의5②) ──
export const FS_RECEIPT_MODE_OPTIONS = [
  {
    value: "single",
    label: "단일 수령",
    description: "양도일 기준환율 1개 적용 (일반 거래)",
  },
  {
    value: "installments",
    label: "장기할부 분할 수령 (§178의5②)",
    description: "수령일별 기준환율 개별 적용 — 장기할부조건 양도",
  },
];


// ── 양도가액 모드 (single 모드 내) ──
export const FG_TRANSFER_MODE_OPTIONS = [
  { value: "per_share", label: "1주당 단가", description: "1주당 외화 단가 입력" },
  { value: "total", label: "총액 직접 입력", description: "총 외화 양도가액 직접 입력" },
];


// ── 취득가액 모드 ──
export const FG_ACQ_MODE_OPTIONS = [
  { value: "actual", label: "실지거래가액", description: "실제 취득 외화 단가" },
  { value: "market_price", label: "시가 산정 (§178의3)", description: "양도·취득일 이전 1개월 평균가격" },
];
