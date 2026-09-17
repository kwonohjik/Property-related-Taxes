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


// ── 지원 국가 목록 ──
export const COUNTRY_OPTIONS = [
  { value: "US", label: "미국 (USD)" },
  { value: "JP", label: "일본 (JPY)" },
  { value: "CN", label: "중국 (CNY)" },
  { value: "HK", label: "홍콩 (HKD)" },
  { value: "GB", label: "영국 (GBP)" },
  { value: "DE", label: "독일 (EUR)" },
  { value: "FR", label: "프랑스 (EUR)" },
  { value: "OTHER", label: "기타" },
];

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


// ── 외국납부세액 처리 방법 (§118의6①) ──
//
// 🔑 **과세기간(신고) 단위 택일이다** — 종목마다 다르게 고를 수 없다.
//    §118의6①이 「다음 각 호의 방법 중 **하나를 선택**하여 적용할 수 있다」이고,
//    1호 산식의 A(국외 산출세액 합)·C(국외 양도소득금액 합)가 **과세기간 총량**이라
//    종목마다 갈리면 C의 구성이 명문 없이 정해진다(계획서 §4.2 · 2026-09-01 확정).
export const FOREIGN_TAX_METHOD_OPTIONS = [
  {
    value: "credit",
    label: "세액공제 (§118의6①1호)",
    description: "한도 = 국외 산출세액 합 × 해당 종목 양도소득금액 / 국외 양도소득금액 합",
  },
  {
    value: "expense",
    label: "필요경비 산입 (§118의6①2호)",
    description: "양도차익 계산 시 필요경비로 처리",
  },
];
