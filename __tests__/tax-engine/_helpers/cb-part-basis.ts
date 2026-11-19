/**
 * 상업용건물 부수토지 초과분의 토지·건물 구분 기준시가 픽스처 (NBL2611-V5-BX01).
 *
 * `LAND_ONLY` — 건물분 기준시가 0 → 양도차익 전부가 토지분이라 초과 비율이 자산 전체에 곱해진다. 결함(건물분에도 곱함) 수정 **전** 동작과
 * 같은 세액이므로, 초과분이 있는 기존 anchor가 «비율 → 세액» 계약만 검증할 때 쓴다. 건물분이 섞인 정답(토지분에만 중과)은
 * `commercial-nbl-land-part.anchor.test.ts`가 고정한다.
 */
export const CB_PART_BASIS_LAND_ONLY = {
  acquisitionLandStd: 1_000_000_000,
  acquisitionBuildingStd: 0,
  transferLandStd: 1_000_000_000,
  transferBuildingStd: 0,
} as const;

/** 폼(AssetForm) 형태 — `cbPart*` 4칸이 모두 채워진 «토지 100%» */
export const CB_PART_FORM_LAND_ONLY = {
  cbPartAcqLandStd: "1000000000",
  cbPartAcqBuildingStd: "0",
  cbPartTransferLandStd: "1000000000",
  cbPartTransferBuildingStd: "0",
} as const;
