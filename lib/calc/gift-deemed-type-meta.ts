/**
 * 증여의제(증여이익) 유형 라벨·근거 조문 — 화면(유형 선택·요약 카드)과 이력 제목의 단일 출처.
 *
 * `components/calc/deemed-gift/shared.tsx`에 있던 것을 옮겼다(그쪽은 재수출). 이력 제목 생성기
 * (`lib/storage/title-generator.ts`)가 쓰는데 `lib/storage`는 components를 import하지 않는다.
 */
import type { DeemedGiftType } from "@/lib/tax-engine/gift-deemed/types";

export const DEEMED_TYPE_META: Record<
  DeemedGiftType,
  { label: string; law: string }
> = {
  trust_benefit: { label: "신탁이익의 증여", law: "상증법 §33" },
  insurance: { label: "보험금의 증여", law: "상증법 §34" },
  bargain_transfer: { label: "저가양수·고가양도", law: "상증법 §35" },
  debt_forgiveness: { label: "채무면제 등", law: "상증법 §36" },
  free_realestate: { label: "부동산 무상사용", law: "상증법 §37" },
  free_loan: { label: "금전 무상대출", law: "상증법 §41의4" },
  free_loan_aggregated: { label: "금전 무상대출 — 여러 건 합산(§43②)", law: "상증법 §43②" },
  // Phase 2 자본거래 (엔진 구현 — UI 입력폼은 후속)
  merger: { label: "합병에 따른 이익", law: "상증법 §38" },
  capital_increase: { label: "증자에 따른 이익", law: "상증법 §39" },
  capital_increase_allocation: { label: "증자에 따른 이익 — 주주별(cap-table)", law: "상증법 §39" },
  capital_decrease: { label: "감자에 따른 이익", law: "상증법 §39의2" },
  contribution: { label: "현물출자에 따른 이익", law: "상증법 §39의3" },
  convertible_stock: { label: "전환주식에 따른 이익", law: "상증법 §39①3호" },
  convertible_bond: { label: "전환사채에 따른 이익", law: "상증법 §40" },
  // Phase 3 추정·의제
  acquisition_fund_presumption: { label: "재산취득자금 증여추정", law: "상증법 §45" },
  nominee_trust: { label: "명의신탁 증여의제", law: "상증법 §45의2" },
  // Phase 3 기타이익·자본거래연계·법인
  excess_dividend: { label: "초과배당에 따른 이익", law: "상증법 §41의2" },
  listing_gain: { label: "상장·합병상장 이익", law: "상증법 §41의3·§41의5" },
  property_service_use: { label: "재산사용·용역제공 이익", law: "상증법 §42" },
  org_change: { label: "법인 조직변경 이익", law: "상증법 §42의2" },
  value_increase: { label: "재산취득 후 가치증가 이익", law: "상증법 §42의3" },
  specific_corp: { label: "특정법인과의 거래 이익", law: "상증법 §45의5" },
  related_corp: { label: "일감몰아주기 증여의제", law: "상증법 §45의3" },
};
