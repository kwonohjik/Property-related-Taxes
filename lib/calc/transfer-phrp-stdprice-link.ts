/**
 * §155⑳ 시나리오 B(임대→거주 전환, §161① 안분) 취득·양도시 기준시가를
 * 자산-수준 환산 입력(standardPriceAtAcq/standardPriceAtTransfer)과 연동하는지 판정.
 *
 * §161①의 "취득/양도 당시 기준시가"는 양도하는 그 주택의 동일 시점 기준시가로,
 * 환산취득가(§114⑦, 시행령 §176의2②)의 분자·분모와 법적으로 동일 값 — 별도 입력 근거 없음.
 *
 * 조건 = CompanionAcqPurchaseBlock에서 asset-level 기준시가 쌍이 실제 렌더되는 조건과 동일.
 * UI(RentalHousingExceptionSection)·API 변환(toRentalHousingExceptionApi)·
 * validate(validateRentalHousingException) 3곳이 이 함수 하나만 import — 조건 드리프트 방지.
 *
 * ⚠️ 산정 방식은 3중 배타 유니온(isSalesCase > isAppraisal > isEstimated —
 * CompanionAcqPurchaseBlock.tsx acqPriceMode, API 변환 transfer-tax-api.ts와 동일 우선순위).
 * stale 세션 플래그 혼재 방어를 위해 상위 우선순위 2모드를 명시 배제한다.
 *
 * assetKind는 호출부에서 이미 housing/right_to_move_in 한정(AssetSectionExtras) —
 * redevelopment_apt·commercial/general_building은 assetKind 게이트로 자연 제외.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export function isPhrpStdPriceLinked(asset: AssetForm): boolean {
  return (
    asset.useEstimatedAcquisition === true &&
    !asset.isSalesCaseAcquisition && // 매매사례가액 모드 아님 (우선순위 1위)
    !asset.isAppraisalAcquisition && // 감정가액 모드 아님 (우선순위 2위)
    asset.acquisitionCause === "purchase" &&
    // 부담부증여: 산정방식·기준시가 영역 전체 숨김(§159 자동 산정) — 연동 시 입력 불가능한 빈 값이 소스가 됨
    asset.transferType !== "burdened_gift" &&
    !asset.isMixedUseHouse && // 겸용주택: 기준시가는 분리계산 영역에서 부분별 입력
    !asset.usePreHousingDisclosure // PHD §164⑤/⑦: 취득기준시가는 엔진이 3-시점에서 도출
  );
}
