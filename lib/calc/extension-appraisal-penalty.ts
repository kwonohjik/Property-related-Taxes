/**
 * 통상(비-부담부) 경로 — 증축 5년 이내 × 감정가액의 「증축한 부분에 한정한 감정가액」 입력 술어 (단일 출처).
 *
 * 소득세법 §114조의2① — 증축한 건물을 5년 이내에 양도하면서 취득가액을 감정가액으로 하면 **증축한 부분에 한정한** 감정가액의
 * 5%가 가산세다. 종전에는 건물 전체 감정가액(`appraisalValue`)을 base로 써서 신축과 같이 계산했다.
 * ⑤ 입력 칸 노출·⑧ 필수 검증·④ 전송이 같은 이 술어를 쓴다 — 각자 재기술하면 「칸은 안 뜨는데 엔진이 요구한다」 또는 그 반대가 된다.
 * 부담부증여는 `bgPresumedExtensionAppraisal`(`burdened-gift-presumed-acquisition.ts`)이 같은 역할이라 여기서 제외한다.
 *
 * 「감정가액」은 자산 단위 방식(`isAppraisalAcquisition`) **또는 토지·건물 분리 자산의 건물 파트 방식**(`buildingAcqMode`)이다
 * (2026-10-16). 분리 자산은 파트 라디오가 자산 단위 플래그를 갱신하지 않아 종전엔 칸이 뜨지 않았고, 엔진은 건물 파트 감정가액
 * 전체를 base로 썼다(실측 250,000,000 × 5%). 판정은 ④ `buildSplitPayload`의 파트 입력 게이트와 같다(별개 취득 토글·소유자 분리,
 * 건물 소유, D2 정규화 후 유효 파트 방식).
 *
 * 판정(5년·85㎡·2020.1.1 게이트)은 엔진과 같은 단일 소스 `calculateBuildingPenalty`(`bgAppraisalExtensionPenaltyApplies`가 감싼다).
 * 계획서: docs/00-pm/general-extension-appraisal-penalty.plan.md
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { bgAppraisalExtensionPenaltyApplies } from "./burdened-gift-presumed-acquisition";
import { effectiveSelfOwns } from "./self-owns-scope";
import { normalizeBuildingCauseInputs } from "./transfer-land-part-cause";
import { effectivePartAcqMode } from "./transfer-tax-split-acq-mode";

type Asset = Pick<
  AssetForm,
  | "assetKind"
  | "isSelfBuilt"
  | "acquisitionCause"
  | "buildingType"
  | "constructionDate"
  | "extensionFloorArea"
  | "transferType"
  | "isAppraisalAcquisition"
  | "isSalesCaseAcquisition"
  | "useEstimatedAcquisition"
  | "isMixedUseHouse"
  | "selfOwns"
  | "hasSeperateLandAcquisitionDate"
  | "buildingAcqMode"
  | "landAcquisitionCause"
  | "landCauseHost"
>;

/** 토지·건물 분리 자산의 건물 파트가 감정가액인가 — ④ `buildSplitPayload`의 `buildingAcqDirectActive`와 같은 판정. */
function splitBuildingPartAppraisal(raw: Asset): boolean {
  const asset = normalizeBuildingCauseInputs(raw);
  const selfOwns = effectiveSelfOwns(asset) ?? "both";
  const partInputsActive = asset.hasSeperateLandAcquisitionDate === true || selfOwns !== "both";
  return partInputsActive && selfOwns !== "land_only" && effectivePartAcqMode(asset.buildingAcqMode, asset) === "appraisal";
}

export function generalExtensionAppraisalApplies(asset: Asset, transferDate: string | undefined): boolean {
  return (
    asset.transferType !== "burdened_gift" &&
    (asset.isAppraisalAcquisition === true || splitBuildingPartAppraisal(asset)) &&
    bgAppraisalExtensionPenaltyApplies(asset, transferDate)
  );
}
