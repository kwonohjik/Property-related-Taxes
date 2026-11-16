/**
 * 토지를 건물보다 **나중에** 취득한 분리취득 주택 — 구간 입력의 토지 보유기간 중 거주 개월 ④ 전송 조각 (계획서 split-land-residence-rate-4289 §8).
 *
 * 규칙·게이트·검증 본문은 엔진 leaf `transfer-land-holding-residence.ts`(엔진·⑫ 공유)다. 이 파일은 **④가 실제로 보내는 사실**(토지 취득일·건물 취득일·소유 축)에서
 * 그 leaf의 게이트 술어(`landAcquiredAfterBuilding`)를 그대로 부르고, 구간 입력이면 각 거주 구간을 [토지 취득일, 양도일]로 잘라 합산한다 —
 * 개월 규칙은 거주 구간 합산(`sumResidenceMonths` · §154⑥ 초일 산입)과 같다(`sumResidenceMonthsFrom`, 축 B 늦은 지분 거주와 같은 함수).
 *
 * 직접 개월 입력은 거주 시점이 없어 키를 싣지 않는다 — 엔진이 `min(거주 개월, 토지 보유 개월)`로 상한하고 결과에 확인 필요를 고지한다(Q-5-1 b).
 * 토지가 건물보다 나중 취득이 아니거나 분리 계산 대상 자산(주택·건물)이 아니면 키를 싣지 않는다(싣으면 엔진·⑫가 막는다 — stale 방지).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { sumResidenceMonthsFrom } from "@/lib/stores/calc-wizard-asset-residence";
import { landAcquiredAfterBuilding } from "@/lib/tax-engine/transfer-land-holding-residence";
import { anyPartCarryover } from "./transfer-land-part-cause";
import { normalizeBuildingCauseInputs } from "./transfer-land-part-cause";
import { effectiveSelfOwns, selfOwnsSplitApplicable } from "./self-owns-scope";
import { primaryAcquisitionDateOf } from "./transfer-tax-api-carryover";
import { primaryEnginePropertyType } from "./transfer-tax-api-helpers";
import { mergePrimaryBasic } from "./transfer-tax-api-helpers";
import { isFullFractionalBundle } from "./transfer-tax-api-helpers";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";

export function buildLandHoldingResidencePayload(
  asset: Pick<AssetForm, "residenceInputMode" | "residencePeriods"> & Parameters<typeof anyPartCarryover>[0],
  /** ④가 그 자산에 실제로 싣는 값 — 토지 취득일(`buildSplitPayload`의 `landAcquisitionDate`)·소유 축(`selfOwns` — `both`면 없다)·건물 취득일(`acquisitionDate`) */
  sent: { propertyType?: unknown; landAcquisitionDate?: unknown; selfOwns?: unknown; buildingAcquisitionDate?: unknown },
): { landHoldingResidenceMonths?: number } {
  if (asset.residenceInputMode !== "interval") return {};
  // 파트 이월과세(토지만·건물만·증여자 분리)는 엔진이 파트 취득일을 증여자 취득일로 치환해 계산한다 — 이 규칙을 걸지 않는다(엔진 시나리오 입력도 같다).
  if (anyPartCarryover(asset)) return {};
  // 엔진이 토지·건물을 나눠 계산하는 자산(주택·건물 — ⑫ `isSplitable`과 같은 범위)만이다. 일반건물·겸용주택 등은 토지 취득일이 달라도 이 거주 규칙이 닿지 않는다(싣으면 ⑫가 막는다).
  if (sent.propertyType !== "housing" && sent.propertyType !== "building") return {};
  // ④ 분리 payload는 넓은 타입으로 오므로 문자열만 읽는다(날짜 문자열이 아니면 게이트가 닫힌다).
  const landDate = typeof sent.landAcquisitionDate === "string" ? sent.landAcquisitionDate : undefined;
  const buildingDate = typeof sent.buildingAcquisitionDate === "string" ? sent.buildingAcquisitionDate : undefined;
  const selfOwns = typeof sent.selfOwns === "string" ? sent.selfOwns : undefined;
  if (!landDate || !landAcquiredAfterBuilding({ landAcquisitionDate: landDate, buildingAcquisitionDate: buildingDate, selfOwns })) return {};
  return { landHoldingResidenceMonths: sumResidenceMonthsFrom(asset.residencePeriods ?? [], landDate) };
}

/**
 * ⑤ 표시 술어 — 이 자산이 「토지를 건물보다 나중에 취득한 분리취득 주택」이라 거주 입력이 토지 보유기간으로 잘리는가(직접 입력은 엔진 상한 · 구간 입력은 ④ 겹침).
 * ④가 싣는 값의 게이트(`buildLandHoldingResidencePayload`)와 **같은 사실**을 폼 값에서 읽는다 — 분리 계산 자산(주택·건물, 겸용 제외) ∧ 본인이 토지·건물 모두 소유 ∧
 * 파트 이월과세 아님 ∧ 별개 취득 토글 ON ∧ 토지 취득일 > 건물 취득일. 거주 입력 방식은 보지 않는다(방식별 안내 문구는 호출부가 가른다).
 */
export function landHoldingResidenceApplies(
  rawAsset: Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns" | "hasSeperateLandAcquisitionDate" | "landAcquisitionDate" | "acquisitionDate" | "acquisitionCause" | "carryover"> &
    Parameters<typeof anyPartCarryover>[0] &
    Parameters<typeof normalizeBuildingCauseInputs>[0],
): boolean {
  // ④ `buildSplitPayload`와 같은 D2 정규화 사본을 읽는다 — 상속·증여 호스트의 stale 분리 입력(토글만 켜진 잔재)은 「분리 없음」이다.
  const asset = normalizeBuildingCauseInputs(rawAsset);
  if (!selfOwnsSplitApplicable(asset) || effectiveSelfOwns(asset) !== "both") return false;
  if (anyPartCarryover(asset) || asset.hasSeperateLandAcquisitionDate !== true) return false;
  return landAcquiredAfterBuilding({ landAcquisitionDate: asset.landAcquisitionDate, buildingAcquisitionDate: primaryAcquisitionDateOf(asset as AssetForm) });
}

/**
 * 함께 양도 **주택 부수토지 카드**(L-1b)가 주 주택보다 나중에 취득됐는가 — ⑤ 표시·④ 전송 공용 술어(거주 입력 방식은 보지 않는다).
 * 주 자산이 주택(겸용 제외)이고 카드가 부수토지(`landNature: appurtenant`)이며 카드 취득일 > 주 주택 취득일(이월과세면 증여 등기접수일 — `primaryAcquisitionDateOf`).
 * 카드는 거주를 주 자산에서 승계한다(`bundled-split-helpers.ts`) — 주 자산이 거주 칸을 가진 쪽이라 입력 방식도 주 자산 것이다.
 */
export function appurtenantCardAfterPrimaryHouse(
  card: Pick<AssetForm, "assetKind" | "landNature" | "acquisitionDate">,
  primary: Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "redevSubject" | "acquisitionDate" | "acquisitionCause" | "carryover">,
): boolean {
  if (card.assetKind !== "land" || card.landNature !== "appurtenant") return false;
  if (primaryEnginePropertyType(primary) !== "housing") return false;
  return landAcquiredAfterBuilding({ landAcquisitionDate: card.acquisitionDate, buildingAcquisitionDate: primaryAcquisitionDateOf(primary as AssetForm) });
}

/**
 * ④ — 주 자산이 구간 입력이면 그 구간과 [카드 취득일, 양도일]의 겹침 개월을 카드에 싣는다. 직접 입력이면 싣지 않는다(엔진이 카드 보유 개월로 상한하고 고지한다).
 * `residencePeriodMonths`(승계할 거주 합계)는 줄이지 않는다 — 표2 대상 판정(거주 2년)이 같은 값을 읽는다.
 * 용도변경 주택은 주거용 사용일 이전 거주를 합계에서 이미 잘랐으므로(`clampResidenceToHousingPeriod`) 겹침도 같은 시작일로 자른다.
 */
export function buildAppurtenantCardHoldingResidencePayload(
  card: Pick<AssetForm, "assetKind" | "landNature" | "acquisitionDate">,
  primary: Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "redevSubject" | "acquisitionDate" | "acquisitionCause" | "carryover" | "residenceInputMode" | "residencePeriods"> &
    Parameters<typeof isUsageConversionActive>[0] & { residentialUseStartDate?: string },
): { landHoldingResidenceMonths?: number } {
  if (primary.residenceInputMode !== "interval" || !appurtenantCardAfterPrimaryHouse(card, primary)) return {};
  const conv = isUsageConversionActive(primary) ? primary.residentialUseStartDate : undefined;
  const start = conv && conv > card.acquisitionDate ? conv : card.acquisitionDate;
  return { landHoldingResidenceMonths: sumResidenceMonthsFrom(primary.residencePeriods ?? [], start) };
}

/**
 * 겸용주택(주택분 토지)이 「토지를 건물보다 나중에 취득」한 경우인가 — ⑤ 표시·④ 전송 공용 술어(거주 입력 방식은 보지 않는다).
 * 토지·건물 취득일은 ④가 `mixedUse`에 싣는 값과 같은 식이다(`landAcquisitionDate || acquisitionDate` · `acquisitionDate`).
 */
export function mixedLandHoldingResidenceApplies(
  primary: Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "landAcquisitionDate" | "acquisitionDate">,
): boolean {
  if (primary.assetKind !== "housing" || !primary.isMixedUseHouse) return false;
  const land = primary.landAcquisitionDate || primary.acquisitionDate;
  return landAcquiredAfterBuilding({ landAcquisitionDate: land, buildingAcquisitionDate: primary.acquisitionDate });
}

/**
 * ④ 겸용주택 — 거주를 정수 연수로만 받는 서브객체(`mixedUse`)용. 토지를 건물보다 나중에 취득했고 구간 입력이면 [토지 취득일, 양도일]과의 겹침 개월을 `floor(÷12)`한 연수를 싣는다.
 * 직접 입력이면 싣지 않는다(엔진이 min(거주 연수, 토지 보유 연수)로 상한하고 고지한다). 게이트는 ⑤와 같은 술어 `mixedLandHoldingResidenceApplies`다.
 */
export function buildMixedLandHoldingResidencePayload(
  primary: Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "residenceInputMode" | "residencePeriods" | "landAcquisitionDate" | "acquisitionDate">,
): { landHoldingResidencePeriodYears?: number } {
  if (primary.residenceInputMode !== "interval" || !mixedLandHoldingResidenceApplies(primary)) return {};
  const land = primary.landAcquisitionDate || primary.acquisitionDate;
  return { landHoldingResidencePeriodYears: Math.floor(sumResidenceMonthsFrom(primary.residencePeriods ?? [], land) / 12) };
}

/**
 * ⑤ V-11 안내 게이트 — 거주를 **개월 수로 직접 입력**하는 칸에서, 이 규칙(토지 파트 거주기간 = 토지 보유기간 중 거주)이 걸리는 자산인가.
 * 세 경로가 같은 칸(주택 자산의 「거주기간(개월)」)에서 입력된다: 분리취득 주택(`landHoldingResidenceApplies`) · 겸용주택 주택분 토지(`mixedLandHoldingResidenceApplies`) ·
 * 주 자산 주택이 함께 양도하는 부수토지 카드(`appurtenantCardAfterPrimaryHouse` — 카드는 거주를 첫 자산에서 승계하므로 첫 자산이 그 칸의 자산일 때만).
 * 구간 입력이면 ④가 겹침을 계산해 보내므로 이 안내를 띄우지 않는다. 술어는 ④ 전송과 같은 것을 import한다(재정의 금지).
 */
export function landHoldingResidenceDirectHintApplies(
  residenceAsset: AssetForm,
  formAssets: readonly AssetForm[],
  assetSplitMode?: "companion" | "fractional",
): boolean {
  if (residenceAsset.residenceInputMode !== "direct") return false;
  if (landHoldingResidenceApplies(residenceAsset) || mixedLandHoldingResidenceApplies(residenceAsset)) return true;
  const first = formAssets[0];
  if (!first || first.assetId !== residenceAsset.assetId) return false;
  // 축 B 지분 카드는 거주를 첫 지분 칸에서 승계한다 — 지분 카드가 토지를 건물보다 나중에 취득했으면 같은 칸 입력이 그 지분의 토지 보유 개월로 잘린다(④ `shareLandHolding`과 같은 병합 사본).
  if (isFullFractionalBundle([...formAssets], assetSplitMode) && formAssets.slice(1).some((s) => landHoldingResidenceApplies(mergePrimaryBasic(s, first)))) return true;
  return formAssets.slice(1).some((card) => appurtenantCardAfterPrimaryHouse(card, first));
}
