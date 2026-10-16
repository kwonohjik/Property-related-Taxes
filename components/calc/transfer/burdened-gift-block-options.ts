/**
 * `BurdenedGiftBlock` 선택지·라벨 상수 — 800줄 정책으로 분리(2026-10-16, 동작 무변경).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export const VALUATION_MODE_OPTIONS = [
  {
    value: "sangjeungbeop_standard",
    label: "상증법 기준시가",
    description: "보충적평가 (개별공시지가 + 건물기준시가)",
  },
  {
    value: "sangjeungbeop_market",
    label: "상증법 시가",
    description: "매매사례·감정·보상·경매·공매가",
  },
] as const;

/**
 * ④ 「증여재산 평가」 칸의 자산별 라벨 — **그 칸이 무엇을 담는지가 자산마다 다르다**.
 *
 * 종전 라벨 「건물기준시가(상속 증여시)」는 두 방향으로 어긋났다:
 *  · 기준일 — 상증 평가 기준일은 **증여일**이다(양도일과 값은 같지만 용어가 다르다).
 *  · 범위   — `general_building`만 순수 건물분이고, 나머지 3종은 **토지를 포함**한다.
 *    (§61①2호 건물 / 3호 오피스텔·상업용건물 = 토지·건물 일괄 / 4호 주택 = 부수토지 포함)
 *    「건물」이라고만 쓰면 토지분을 뺀 금액을 넣게 되어 평가액이 조용히 과소해진다.
 *
 * `building`은 hint를 두지 않는다 — 아래 부수토지 안내 문단이 같은 말을 이미 한다.
 */
export const GIFT_STD_PRICE_FIELD: Partial<
  Record<AssetForm["assetKind"], { label: string; hint?: string }>
> = {
  general_building: {
    label: "증여일 건물 기준시가",
    hint: "건물분만 입력하세요(상증법 §61①2호). 토지분은 개별공시지가로 따로 산출됩니다.",
  },
  building: {
    label: "증여일 기준시가 (부수토지 포함)",
  },
  housing: {
    label: "증여일 주택 기준시가",
    hint: "개별주택가격·공동주택가격 — 부수토지를 포함해 일괄 고시된 가액(상증법 §61①4호)",
  },
  commercial_building: {
    label: "증여일 기준시가 (토지·건물 일괄)",
    hint: "국세청장이 토지와 건물을 일괄 고시한 가액(상증법 §61①3호)",
  },
  /**
   * 재개발·재건축으로 **완공된 신축주택**은 상증법 §61①4호(주택)로 평가한다 — `housing`과 같은 축이다.
   * 엔트리가 없으면 라벨이 「증여일 현재 기준시가」 기본값으로 떨어져 어떤 고시가액을
   * 넣어야 하는지 알 수 없다.
   */
  redevelopment_apt: {
    label: "증여일 주택 기준시가",
    hint: "개별주택가격·공동주택가격 — 부수토지를 포함해 일괄 고시된 가액(상증법 §61①4호)",
  },
};

// Phase 3: 증여자-수증자 관계 (상증법 §53 증여재산공제)
// 주의: enum 값 의미
//   lineal_descendant       = 수증자가 직계비속(성년) — 증여자가 직계비속(자녀→부모 방향) (§53③)
//   lineal_ascendant_adult  = 증여자가 직계존속, 수증자 성년 (§53② 본문)
//   lineal_ascendant_minor  = 증여자가 직계존속, 수증자 미성년 (§53② 단서)
// `description`은 화면에 렌더하지 않는다(2026-08-12 — 3열 배치로 옵션 카드 폭이 좁아져 제거).
// 공제액 근거로 남겨둔다 — 되살리려면 RadioCardGroup options에 description을 다시 매핑하면 된다.
export const DONOR_RELATION_OPTIONS = [
  {
    value: "lineal_descendant",
    label: "직계비속 (성년 수증자)",
    description: "수증자가 성년 직계비속(자녀·손자녀) — 증여재산공제 5천만 원",
  },
  {
    value: "lineal_ascendant_minor",
    label: "직계존속 (미성년 수증자)",
    description: "증여자가 직계존속, 수증자가 미성년 — 증여재산공제 2천만 원 (§53② 단서)",
  },
  {
    value: "lineal_ascendant_adult",
    label: "직계존속 (성년 수증자)",
    description: "증여자가 직계존속(부모·조부모), 수증자 성년 — 증여재산공제 5천만 원 (§53② 본문)",
  },
  {
    value: "spouse",
    label: "배우자",
    description: "법률혼 배우자 — 증여재산공제 6억 원",
  },
  {
    value: "other_relative",
    label: "기타 친족",
    description: "6촌 이내 혈족·4촌 이내 인척 — 증여재산공제 1천만 원",
  },
] as const;
