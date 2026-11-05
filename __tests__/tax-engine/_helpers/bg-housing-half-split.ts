/**
 * 부담부증여 × 일체 주택 × 신축 — §114조의2 가산세 base 건물분 안분 입력(V-7 · `bg-housing-114-2-building-base.plan.md`) 테스트 공용값.
 *
 * 취득·양도 당시 모두 토지 기준시가 = 건물 기준시가(1:1)라 건물분 = 주택공시가격의 절반, 건물 양도가액 = 양도가액의 절반이다
 * (짝수 금액이면 절사 없음). 그래서 base = 종전(주택 전체 값) ÷ 2 — 엄격화(PR-2) 뒤 기존 시료의 가산세 고정값을 손으로 검증하기 쉽다.
 * 본인 신축 `selfBuiltHousing`·당초 증여자 신축 `donorBuilt.housing` 둘 다 이 모양이다.
 */
export const BG_HOUSING_HALF_SPLIT = {
  landPricePerSqmAtAcquisition: 1_000_000,
  landArea: 100,
  buildingStdPriceAtAcquisition: 100_000_000,
  landStdPriceAtTransfer: 100_000_000,
  buildingStdPriceAtTransfer: 100_000_000,
} as const;

type BgInputLike = {
  propertyType?: string;
  isSelfBuilt?: boolean;
  buildingType?: string;
  mixedUse?: unknown;
  selfBuiltHousing?: unknown;
  burdenedGiftInfo?: { valuationMode?: string; acquisitionMethod?: string };
};

/**
 * 엔진 `assertBgSelfBuiltHousingInput`이 받는 조합(주택 · 신축 · 시가 환산/감정 · 겸용 아님)일 때만 1:1 안분 입력을 넣는다 — 해당 없는 회귀 셀(신축 아님·실지·기준시가·증축)은 그대로 둔다.
 * `overrides`에 `selfBuiltHousing` 키가 있으면(값이 undefined여도) 손대지 않는다.
 */
export function withBgHousingHalfSplit<T extends BgInputLike>(input: T, overrides: object = {}): T {
  if ("selfBuiltHousing" in overrides) return input;
  const m = input.burdenedGiftInfo?.acquisitionMethod;
  const applies =
    input.propertyType === "housing" && input.isSelfBuilt === true && input.buildingType !== "extension" && !input.mixedUse &&
    input.burdenedGiftInfo?.valuationMode === "sangjeungbeop_market" && (m === "converted" || m === "appraisal");
  return applies ? { ...input, selfBuiltHousing: BG_HOUSING_HALF_SPLIT } : input;
}
