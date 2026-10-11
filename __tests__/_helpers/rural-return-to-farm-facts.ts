/**
 * §155⑦3호 귀농주택 — ⑩4호·⑪·귀농 전 취득 일반주택 **유리한 답** 픽스처 (결정 #44).
 *
 * 새 사실이 없으면 엔진은 불성립으로 본다(원칙 1) — 귀농주택의 **다른 요건**(대지면적·세대전원 이사·5년 기한 등)을 시험하는
 * 기존 anchor는 이 사실을 명시 값으로 채워야 그 요건을 실제로 시험한다(픽스처 기본값이 게이트 결함을 가리지 않게 —
 * `feedback_fixture_default_masks_gate_defect`).
 */

/** 엔진 입력(`TransferTaxInput["ruralHouse"]`) 모양 */
export const RETURN_TO_FARM_OK = {
  farmlandBasis: "ga",
  farmlandHolder: "self",
  priorReturnFarmExemption: "none",
  generalHouseAcquiredBeforeReturn: "yes",
} as const;

/** 명부 행(`HouseEntry`) 모양 */
export const RETURN_TO_FARM_ROW_OK = {
  ruralFarmlandBasis: "ga",
  ruralFarmlandHolder: "self",
  ruralPriorReturnFarmExemption: "none",
  ruralGeneralHouseBeforeReturn: "yes",
} as const;
