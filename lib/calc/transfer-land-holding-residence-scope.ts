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
import { effectiveSelfOwns, selfOwnsSplitApplicable } from "./self-owns-scope";
import { primaryAcquisitionDateOf } from "./transfer-tax-api-carryover";

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
  asset: Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns" | "hasSeperateLandAcquisitionDate" | "landAcquisitionDate" | "acquisitionDate" | "acquisitionCause" | "carryover"> &
    Parameters<typeof anyPartCarryover>[0],
): boolean {
  if (!selfOwnsSplitApplicable(asset) || effectiveSelfOwns(asset) !== "both") return false;
  if (anyPartCarryover(asset) || asset.hasSeperateLandAcquisitionDate !== true) return false;
  return landAcquiredAfterBuilding({ landAcquisitionDate: asset.landAcquisitionDate, buildingAcquisitionDate: primaryAcquisitionDateOf(asset as AssetForm) });
}
