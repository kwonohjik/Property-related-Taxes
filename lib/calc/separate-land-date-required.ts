/**
 * 「토지·건물 취득일 다름」(`hasSeperateLandAcquisitionDate`) 토글 ON + 토지 취득일 미입력 — 주택·건물(겸용·일반건물 제외)의 필수 게이트 단일 소스 (G2 후속).
 *
 * ## 결함 (probe 실측 — 이 게이트 전)
 * 토글을 켜면 취득일 칸이 «토지 취득일 · 건물 취득일» 2열이 된다. 토지 취득일을 비운 채 계산하면 ④는 토지 취득일을 싣지 않고(`isSplitPayloadActive`
 * 쪽 식 — 빈 값은 `undefined`) 엔진은 «같은 날 취득»으로 계산했는데 ⑧은 막지 않았다. 일반건물(`validateGeneralBuildingAsset` V-1)·겸용주택
 * (`validateMixedUseAsset`)은 같은 토글에서 토지 취득일을 이미 필수로 받는다 — 주택·건물만 «빈칸 = 같은 날»이라는 조용한 해석이었다.
 * 같은 날이라는 사실은 사용자가 같은 날짜를 적어서 알려야 한다(모름 = 불성립 + 확인 필요, 자동 안분·같은 날 폴백 금지).
 *
 * ## 범위 = 토지 취득일 칸이 화면에 있고 계산에 쓰이는 경우
 * - 주택·건물(`isLandBuildingSplitable`), 겸용주택 아님(자체 게이트 `validateMixedUseAsset`), 일반건물 아님(자체 게이트 V-1).
 * - 취득원인 매매 — 칸을 그리는 `CompanionAcqPurchaseBlock`은 매매(또는 D2 호스트)에서만 마운트된다. 상속·증여·신축의 토글 잔재(`hasStaleSplitInput`이
 *   «분리 없음»으로 읽는 상태 포함)는 칸이 없다. 소유자 분리(S3-1)는 토글을 강제로 켜지만 신축·상속·증여에서는 칸이 없다.
 * - 「토지는 다른 원인으로 취득」(D1)·「건물 상속·증여 + 토지 매매」(D2)는 엔진·⑫와 같은 leaf(`validateLandPartCause`)가 원인별 문구로 요구한다 → 제외(이중 안내 금지).
 * - 소유자 분리 «건물만 소유»는 토지를 내 것으로 보지 않아 토지 취득일이 계산에 쓰이지 않는다(④는 건물 취득일로 후퇴 송신) → 제외.
 *
 * ⑤(`CompanionAcqDateSection`의 필수 표시)·⑧(`validateAssetEntry`)이 이 술어 하나를 쓴다(UI 통과 ↔ validate 차단 모순 방지).
 * API(④·⑫)는 이 토글을 보내지 않는다 — 주택·건물 payload에서 토지 취득일 부재는 정당한 «같은 날»(토글 OFF)이라 서버가 막을 근거가 없고,
 * 막는 곳은 토글을 아는 ⑧ 하나다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { fieldError } from "./transfer-tax-validate-field";
import { isLandBuildingSplitable, effectiveSelfOwns } from "./self-owns-scope";
import { landCauseMixActive } from "./transfer-land-part-cause";

type Scope = Pick<
  AssetForm,
  | "assetKind" | "isMixedUseHouse" | "acquisitionCause" | "hasSeperateLandAcquisitionDate" | "landAcquisitionDate" | "selfOwns"
  | "landAcquisitionCause" | "landCauseHost" | "transferType"
>;

/** 토지 취득일 칸이 화면에 있고 계산에 쓰이는 자산인가 — ⑤의 필수 표시(`*`)와 ⑧ 요구의 같은 범위. */
export function separateLandDateRequired(asset: Scope): boolean {
  return (
    asset.hasSeperateLandAcquisitionDate === true &&
    isLandBuildingSplitable(asset.assetKind) &&
    !asset.isMixedUseHouse &&
    asset.acquisitionCause === "purchase" &&
    !landCauseMixActive(asset) &&
    (effectiveSelfOwns(asset) ?? "both") !== "building_only"
  );
}

/** 요구되는데 비어 있는가 — ⑧이 막는 조건. */
export function separateLandDateMissing(asset: Scope): boolean {
  return !asset.landAcquisitionDate && separateLandDateRequired(asset);
}

export const SEPARATE_LAND_DATE_REQUIRED_HINT =
  "「토지·건물 취득일 다름」을 켰으므로 토지 취득일을 입력하세요. 토지와 건물을 같은 날 취득했다면 같은 날짜를 입력하거나 토글을 끄세요.";

export function validateSeparateLandDateRequired(asset: AssetForm, label: string): string | null {
  return separateLandDateMissing(asset)
    ? fieldError("landAcquisitionDate", `${label}: ${SEPARATE_LAND_DATE_REQUIRED_HINT}`)
    : null;
}
