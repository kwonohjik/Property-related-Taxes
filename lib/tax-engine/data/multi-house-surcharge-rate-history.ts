/**
 * 조정대상지역 다주택 중과 가산율 — 시행일별 역사 데이터 (소득세법 §104⑦).
 *
 * 개정 없는 확정 역사 데이터(정적 상수). 양도일 기준 적용.
 *   ~2018.3.31      : 중과 미적용 (제도 시행 전)
 *   2018.4.1~2021.5.31 : 2주택 +10%p / 3주택+ +20%p
 *   2021.6.1~          : 2주택 +20%p / 3주택+ +30%p (현행)
 *
 * 근거: 소득세법 §104⑦ 현행(KoreanLaw MST285523 본문 +20/+30 확인) + 시행일별 변천
 *       (국세청 양도세 세율 안내·다출처 일치). 한시 유예(2022.5.10~2026.5.9)는 본 가산율과
 *       별개로 isSurchargeSuspended가 처리.
 */

/** 시행일 내림차순 — 첫 매칭(transferDate >= from) 적용. */
export const MULTI_HOUSE_SURCHARGE_RATE_HISTORY = [
  { from: "2021-06-01", multi_house_2: 0.2, multi_house_3plus: 0.3 },
  { from: "2018-04-01", multi_house_2: 0.1, multi_house_3plus: 0.2 },
] as const;

/** 중과 제도 시행일 — 이 날짜 이전 양도분은 중과 미적용. */
export const MULTI_HOUSE_SURCHARGE_START_DATE = "2018-04-01";

/**
 * 양도일·중과유형에 해당하는 중과 가산율을 반환한다.
 * @returns 가산율(0.1~0.3). 2018.4.1 이전 양도분은 `null`(중과 미적용).
 */
export function resolveSurchargeAddonRate(
  transferDate: Date,
  surchargeType: "multi_house_2" | "multi_house_3plus",
): number | null {
  for (const tier of MULTI_HOUSE_SURCHARGE_RATE_HISTORY) {
    if (transferDate >= new Date(tier.from)) return tier[surchargeType];
  }
  return null;
}
