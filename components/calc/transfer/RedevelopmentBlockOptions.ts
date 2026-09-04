"use client";

/**
 * RedevelopmentBlock 라디오 옵션 상수 — 순수 데이터.
 *
 * 분리 사유: `RedevelopmentBlock.tsx` 800줄 정책(2026-08-13 ⑤ 취득가액 모드 통합 시 805줄 도달).
 * 로직 없이 라벨·설명·법령 근거만 나열하므로 렌더 파일에서 떼어내도 응집도 손실이 없다.
 */

export const ORIGINAL_ASSET_OPTIONS = [
  { value: "housing" as const, label: "주택 출자", description: "기존 주택(공동주택·단독주택)을 조합에 출자 — 사례 41·44~47" },
  { value: "land" as const, label: "토지 출자", description: "기존 토지를 조합에 출자 — 사례 37(입주권)·40(APT 양도)" },
];

export const SETTLEMENT_OPTIONS = [
  { value: "pay" as const, label: "청산금 납부", description: "권리가액 < 분양가 → 차액 납부 (시행령 §166②1호, 사례 40·41·44·45)" },
  { value: "receive" as const, label: "청산금 수령", description: "권리가액 > 분양가 → 차액 수령 (시행령 §166①2호 가목 / ②2호, 사례 38·39·46·47)" },
];

/**
 * 인가전 분 종전 부동산 취득가액 산정 방식 — ⑤ 섹션 라디오.
 *
 * 값은 기존 `useEstimatedAcquisition`(boolean)에 그대로 매핑한다(신규 필드 없음).
 * 종전에는 실가 카드와 「환산취득가 사용」 토글이 분리돼 모드 전환이 두 곳에 흩어져 있었다.
 *
 * 설명(description)은 두지 않는다 — 라벨만으로 충분하고 한 행에 나란히 놓기 위함
 * (2026-08-13 사용자 지시). 각 모드의 입력 UI 안에 법령 근거·hint가 이미 있다.
 */
export const ACQ_MODE_OPTIONS = [
  { value: "actual" as const, label: "실지거래가액" },
  { value: "estimated" as const, label: "환산취득가액" },
];

export const APPROVAL_LAW_OPTIONS = [
  { value: "urban_renovation_art_74" as const, label: "도시정비법 §74 (재개발/재건축)", description: "도시 및 주거환경정비법 §74 관리처분계획 인가 — 본류" },
  { value: "small_housing_art_29" as const, label: "빈집소규모정비법 §29 (소규모정비)", description: "빈집 및 소규모주택 정비에 관한 특례법 §29 사업시행계획 인가 — 아직 지원하지 않습니다" },
];
