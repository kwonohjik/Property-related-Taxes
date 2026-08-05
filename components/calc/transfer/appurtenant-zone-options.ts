/**
 * 건축물 부속토지 판정용 용도지역 선택지 — 「지방세법 시행령」 제101조 제2항 적용배율표 기준.
 *
 * 일반건물(GB)·상업용건물(CB) 두 입력 화면이 공유한다. 값은 배율 정본
 * `lib/tax-engine/local-tax-zone-multiplier.ts`의 키와 일치해야 한다.
 *
 * ⚠️ 세분 전 주거지역(`residential`)은 표에 대응 항목이 없어 **선택지에 두지 않는다** —
 * 전용(5배)·일반(4배)·준주거(3배)가 모두 달라 통합 키로는 배율을 결정할 수 없다(추정 배율 금지).
 */
export const APPURTENANT_ZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "exclusive_residential", label: "전용주거" },
  { value: "general_residential",   label: "일반주거" },
  { value: "semi_residential",      label: "준주거" },
  { value: "commercial",            label: "상업지역" },
  { value: "industrial",            label: "공업지역" },
  { value: "green",                 label: "녹지지역" },
  { value: "management",            label: "관리지역" },
  { value: "agriculture_forest",    label: "농림지역" },
  { value: "natural_env",           label: "자연환경보전" },
  { value: "unplanned",             label: "도시계획 미지정" },
];
