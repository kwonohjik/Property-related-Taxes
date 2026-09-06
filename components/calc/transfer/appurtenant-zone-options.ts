/**
 * 건축물 부속토지 판정용 용도지역 선택지 — 「지방세법 시행령」 제101조 제2항 적용배율표 기준.
 *
 * 일반건물(GB)·상업용건물(CB) 두 입력 화면이 공유한다. 값은 배율 정본
 * `lib/tax-engine/local-tax-zone-multiplier.ts`의 키와 일치해야 한다.
 *
 * ## 🔴 `undesignated`가 빠져 있었다 (2026-09-07 UI 리뷰)
 *
 * 정본 키는 **11개**인데 선택지는 10개였고, 빠진 것이 「도시지역 **외** — 용도 미지정」
 * (`undesignated`, **7배**)이었다. 게다가 남아 있던 `unplanned`(「도시지역 5. 미계획지역」,
 * **4배**)의 라벨이 「도시계획 미지정」이라 **「용도 미지정」으로 읽혔다**.
 *
 * ⇒ 도시지역 밖 용도 미지정 토지를 가진 사용자에게는 **고를 수 있는 정답이 없었고**,
 *   라벨에 이끌려 4배(`unplanned`)를 고르면 배율이 7배에서 4배로 내려가 부속토지 인정 면적이
 *   줄고 초과분이 비사업용으로 넘어간다. 이 값은 `CommercialAppurtenantLandSection`·
 *   `GeneralBuildingNblSection`을 통해 세액에 직결된다.
 *
 * ⚠️ 세분 전 주거지역(`residential`)은 표에 대응 항목이 없어 **선택지에 두지 않는다** —
 * 전용(5배)·일반(4배)·준주거(3배)가 모두 달라 통합 키로는 배율을 결정할 수 없다(추정 배율 금지).
 *
 * ## 누락 재발 방지
 *
 * 라벨을 `Record<LocalTaxZoneKey, string>`으로 선언해 **정본 키가 하나라도 빠지면 tsc가 잡는다**.
 * 순서(표시 순)는 아래 배열이 정하고, 「배열이 전 키를 덮는가」는 anchor가 고정한다.
 */
import type { LocalTaxZoneKey } from "@/lib/tax-engine/local-tax-zone-multiplier";

/**
 * 키 → 화면 라벨. 괄호 안의 「도시지역」·「도시지역 외」는 §101② 표의 대분류다 —
 * 미계획지역(4배)과 용도 미지정(7배)이 라벨만으로 구별되게 한다.
 */
const APPURTENANT_ZONE_LABELS: Record<LocalTaxZoneKey, string> = {
  exclusive_residential: "전용주거",
  general_residential: "일반주거",
  semi_residential: "준주거",
  commercial: "상업지역",
  industrial: "공업지역",
  green: "녹지지역",
  unplanned: "미계획지역 (도시지역)",
  management: "관리지역",
  agriculture_forest: "농림지역",
  natural_env: "자연환경보전",
  undesignated: "용도 미지정 (도시지역 외)",
};

/** 표시 순 — §101② 표의 도시지역 1~5 → 도시지역 외 순서를 따른다. */
const APPURTENANT_ZONE_ORDER: readonly LocalTaxZoneKey[] = [
  "exclusive_residential",
  "general_residential",
  "semi_residential",
  "commercial",
  "industrial",
  "green",
  "unplanned",
  "management",
  "agriculture_forest",
  "natural_env",
  "undesignated",
];

export const APPURTENANT_ZONE_OPTIONS: { value: LocalTaxZoneKey; label: string }[] =
  APPURTENANT_ZONE_ORDER.map((value) => ({ value, label: APPURTENANT_ZONE_LABELS[value] }));
