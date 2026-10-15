/**
 * 통상(비-부담부) 경로 — 증축 5년 이내 × 감정가액의 「증축한 부분에 한정한 감정가액」 입력 술어 (단일 출처).
 *
 * 소득세법 §114조의2① — 증축한 건물을 5년 이내에 양도하면서 취득가액을 감정가액으로 하면 **증축한 부분에 한정한** 감정가액의
 * 5%가 가산세다. 종전에는 건물 전체 감정가액(`appraisalValue`)을 base로 써서 신축과 같이 계산했다.
 * ⑤ 입력 칸 노출·⑧ 필수 검증·④ 전송이 같은 이 술어를 쓴다 — 각자 재기술하면 「칸은 안 뜨는데 엔진이 요구한다」 또는 그 반대가 된다.
 * 부담부증여는 `bgPresumedExtensionAppraisal`(`burdened-gift-presumed-acquisition.ts`)이 같은 역할이라 여기서 제외한다.
 *
 * 판정(5년·85㎡·2020.1.1 게이트)은 엔진과 같은 단일 소스 `calculateBuildingPenalty`(`bgAppraisalExtensionPenaltyApplies`가 감싼다).
 * 계획서: docs/00-pm/general-extension-appraisal-penalty.plan.md
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { bgAppraisalExtensionPenaltyApplies } from "./burdened-gift-presumed-acquisition";

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
>;

export function generalExtensionAppraisalApplies(asset: Asset, transferDate: string | undefined): boolean {
  return (
    asset.transferType !== "burdened_gift" &&
    asset.isAppraisalAcquisition === true &&
    bgAppraisalExtensionPenaltyApplies(asset, transferDate)
  );
}
