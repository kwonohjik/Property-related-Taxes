/**
 * 같은 물건 지분 분할(축 B) 조합원입주권 — 둘째 이후 지분 카드가 첫 카드에서 받는 §89①4호 판정 선언.
 *
 * 6필드는 **판정 메뉴만** 받는다(`app/calc/one-house-exemption/steps/Step3.tsx` — `assets[0]`만 다룬다).
 * 지분 토글이 만드는 둘째 카드(`makeDefaultAsset`)에는 입력 경로가 없어 빈 값이 남고, 종전에는 그 빈 값이
 * 엔진에 가서 **그 지분만** 1세대1입주권 비과세를 잃었다(계획서 `docs/00-pm/second-share-card-redev-judgment-facts-copy.plan.md`).
 * 같은 물건·같은 세대의 사실이므로 첫 카드 값을 쓴다 — `mergePrimaryBasic`(④·⑧)과 지분 카드 화면이 이 함수 하나를 쓴다.
 *
 * 복사하지 않는 경우:
 *  - 완공APT(`redevelopment_apt`) — 그쪽은 인가일 요건 선언·종전주택 거주월수를 계산기 카드마다 편집한다
 *    (`ExemptionAtApprovalCard`·`RedevelopmentResidenceSplitSection`). 복사하면 화면 값과 엔진 값이 갈린다.
 *  - 첫 카드나 그 지분이 승계조합원 입주권 — 「인가일 현재 기존주택 소유」 선언이 승계 취득분에는 성립하지 않는다.
 *
 * `redevOriginalAssetType`(출자 자산)은 넣지 않는다 — 계산기에 카드별 입력 칸이 있다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isSuccessorRightTransfer } from "./transfer-successor-right";

type JudgmentFactKey =
  | "redevExemptionEligibleAtApproval"
  | "redevLandHouseholdOwnedBuilding"
  | "redevOtherHouseAcquisitionDate"
  | "redevOtherHouseDisposalDelayReason"
  | "redevPriorHouseHoldingMonths"
  | "redevPriorHouseResidenceMonths";

export function soleSplitRightJudgmentFacts(
  share: Pick<AssetForm, "isSuccessorRightToMoveIn">,
  primary: AssetForm,
): Partial<Pick<AssetForm, JudgmentFactKey>> {
  if (primary.assetKind !== "right_to_move_in") return {};
  if (isSuccessorRightTransfer(primary)) return {};
  if (isSuccessorRightTransfer({ assetKind: primary.assetKind, isSuccessorRightToMoveIn: share.isSuccessorRightToMoveIn })) return {};
  return {
    redevExemptionEligibleAtApproval: primary.redevExemptionEligibleAtApproval,
    redevLandHouseholdOwnedBuilding: primary.redevLandHouseholdOwnedBuilding,
    redevOtherHouseAcquisitionDate: primary.redevOtherHouseAcquisitionDate,
    redevOtherHouseDisposalDelayReason: primary.redevOtherHouseDisposalDelayReason,
    redevPriorHouseHoldingMonths: primary.redevPriorHouseHoldingMonths,
    redevPriorHouseResidenceMonths: primary.redevPriorHouseResidenceMonths,
  };
}
