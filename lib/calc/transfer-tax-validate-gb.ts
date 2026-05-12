/**
 * 일반건물(토지+건물 일괄) 전용 유효성 검사 (⑧, §176의2②·§104의3·§166⑥)
 *
 * transfer-tax-validate.ts에서 분리. 함수 로직 변경 없이 순수 추출.
 * 사례 31(환산취득가 모드) + 사례 32(신축 단기양도) 검증 포함.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/**
 * 일반건물 자산 전용 검증.
 *
 * 면적·용도지역·양도시 기준시가는 취득방법 무관 필수.
 * 양도시 기준시가: 환산취득가 = 분모, 실거래가 = §166⑥ 토지·건물 안분 비율.
 *
 * @param asset  자산 폼 상태
 * @param label  오류 메시지 앞에 붙는 자산 라벨
 * @param formTransferDate  폼-전역 양도일 (YYYY-MM-DD) — 증축일 상한 검증에 사용
 * @returns 오류 메시지 (있을 경우) | null (검증 통과)
 */
export function validateGeneralBuildingAsset(
  asset: AssetForm,
  label: string,
  formTransferDate?: string,
): string | null {
  // ⑧ 부담부증여 (소령 §159) — 가장 먼저 분기. acquisitionCause === "burdened_gift" 시
  // bg* 필드 + 양도시·취득시 자산별 기준시가(gb*)가 필수.
  if (asset.acquisitionCause === "burdened_gift") {
    if (!asset.bgValuationMode)
      return `${label}: 부담부증여 평가 모드를 선택하세요 (상증법 기준시가/시가).`;
    const deposit = parseAmount(asset.bgLendingDepositTotal) || 0;
    const mortgageDebt = parseAmount(asset.bgMortgageDebtAmount) || 0;
    if (deposit + mortgageDebt <= 0)
      return `${label}: 부담부증여 인수 채무액(임대보증금 + 담보차입금)을 입력하세요.`;
    if (asset.bgValuationMode === "sangjeungbeop_market") {
      if (!asset.bgMarketValueAtTransfer || parseAmount(asset.bgMarketValueAtTransfer) <= 0)
        return `${label}: 시가 모드의 양도시 평가액을 입력하세요.`;
      if (!asset.bgMarketValueAtAcquisition || parseAmount(asset.bgMarketValueAtAcquisition) <= 0)
        return `${label}: 시가 모드의 취득시 평가액을 입력하세요.`;
    }
    if (!parseDecimal(asset.gbLandArea))
      return `${label}: 토지면적을 입력하세요.`;
    if (!parseAmount(asset.gbTransferLandPricePerSqm))
      return `${label}: 양도시 토지 공시지가를 입력하세요.`;
    if (!parseAmount(asset.gbAcqLandPricePerSqm))
      return `${label}: 취득시 토지 공시지가를 입력하세요.`;
    if (!parseAmount(asset.gbTransferBuildingValue))
      return `${label}: 양도시 건물기준시가 총액을 입력하세요.`;
    if (!parseAmount(asset.gbAcqBuildingValue))
      return `${label}: 취득시 건물기준시가 총액을 입력하세요.`;
    return null; // 부담부증여는 환산/신축 분기 미적용 — 여기서 종결
  }

  // 면적 — 모드 무관 필수
  if (!parseDecimal(asset.gbLandArea))
    return `${label}: 토지면적을 입력하세요.`;
  if (!parseDecimal(asset.gbBuildingFootprintArea))
    return `${label}: 건물 수평투영면적을 입력하세요.`;

  // 용도지역 — 필수
  if (!asset.gbZoneType)
    return `${label}: 용도지역을 선택하세요. 비사업용토지 판정 배율 결정에 필수입니다.`;

  // 양도시 기준시가 — 모드 무관 필수 (§166⑥ 토지·건물 안분 + 환산 분모)
  if (!parseAmount(asset.gbTransferLandPricePerSqm))
    return `${label}: 양도시 토지 공시지가를 입력하세요.`;
  if (!parseAmount(asset.gbTransferBuildingValue))
    return `${label}: 양도시 건물기준시가 총액을 입력하세요.`;

  // 0 분모 차단 (모드 무관)
  const transferLandStd =
    parseAmount(asset.gbTransferLandPricePerSqm) *
    parseDecimal(asset.gbLandArea);
  const transferBuildingStd = parseAmount(asset.gbTransferBuildingValue);
  if (transferLandStd + transferBuildingStd <= 0)
    return `${label}: 양도시 기준시가 합계가 0이면 안분이 불가합니다.`;

  // ⑧ 정합성 가드(삭제): 4가지 조합 모두 허용 — useEstimatedAcquisition 강제 조건 제거.
  // 기존 코드: gbHasExtension && !useEstimatedAcquisition 차단 → 사례 33 실가+증축 조합 불가 버그.
  // 4번째 라디오 onClick이 useEst=false 설정하므로 이 가드가 있으면 실가+증축 차단됨.

  // 환산취득가 모드 OR 사례 33 일괄 모드(실가+증축) 공통: 취득시 기준시가·건물 취득원인 검증.
  // 두 모드 모두 풀세트 payload(취득시 기준시가 + buildingAcquisitionCause)가 필요.
  if (asset.useEstimatedAcquisition || asset.gbHasExtension) {
    // 건물 연면적 — 환산 모드에서만 필수 (사례 33 일괄에서는 buildingFootprintArea로 대체 가능)
    if (asset.useEstimatedAcquisition && !parseDecimal(asset.gbBuildingArea))
      return `${label}: 건물 연면적을 입력하세요.`;
    if (!parseAmount(asset.gbAcqLandPricePerSqm))
      return `${label}: 취득시 토지 공시지가를 입력하세요.`;
    if (!parseAmount(asset.gbAcqBuildingValue))
      return `${label}: 취득시 건물기준시가 총액을 입력하세요.`;

    // (a) 건물 취득원인 미선택 차단
    const validBuildingCauses = [
      "purchase",
      "inheritance",
      "gift",
      "newConstruction",
    ];
    if (
      !asset.gbBuildingAcquisitionCause ||
      !validBuildingCauses.includes(asset.gbBuildingAcquisitionCause)
    ) {
      return `${label}: 건물 취득원인을 선택하세요 (매매·상속·증여·신축(자가건축) 중).`;
    }
    // (b) 신축(자가건축) + 건물 취득일 미입력 차단
    if (asset.gbBuildingAcquisitionCause === "newConstruction") {
      if (!asset.gbBuildingAcquisitionDate) {
        return `${label}: 신축(자가건축) 취득원인을 선택했습니다. 건물 취득일(영 §162①4호 빠른 날 — 사용승인서 교부일·사실상 사용일·임시사용승인일 중)을 입력하세요.`;
      }
      // 건물 취득일은 토지 취득일 이후여야 함
      if (
        asset.acquisitionDate &&
        asset.gbBuildingAcquisitionDate < asset.acquisitionDate
      ) {
        return `${label}: 건물 취득일은 토지 취득일(${asset.acquisitionDate}) 이후여야 합니다.`;
      }
    }
  }

  // 공통 취득일 검증
  if (!asset.acquisitionDate) return `${label}: 취득일을 입력하세요.`;

  // ⑧ 사례 33: 증축(gbHasExtension=true) 추가 검증
  if (asset.gbHasExtension) {
    // 사례 33 일괄 모드(실가+증축): 일괄 취득가 필수
    if (!asset.useEstimatedAcquisition && !parseAmount(asset.fixedAcquisitionPrice))
      return `${label}: 토지·건물 일괄 취득가액을 입력하세요. (사례 33: 토지·원건물 일괄 실거래가)`;

    // 공통 필수: 증축일
    if (!asset.gbExtensionDate)
      return `${label}: 증축일을 입력하세요.`;

    // 공통 필수: 증축 취득원인
    if (
      !asset.gbExtensionAcquisitionCause ||
      !["purchase", "newConstruction"].includes(asset.gbExtensionAcquisitionCause)
    )
      return `${label}: 증축 취득원인을 선택하세요 (매매·자가증축 중).`;

    // 모드별 필수 필드 분기
    const extMode = asset.gbExtensionAcquisitionMode || "estimated";
    if (extMode === "estimated") {
      // 환산취득가 모드: 건물2 기준시가 2종 필수
      if (!parseAmount(asset.gbTransferExtensionBuildingStdPrice))
        return `${label}: 양도시 건물2 기준시가 총액(원)을 입력하세요. ㎡당 단가가 아닌 총액(원)입니다.`;
      if (!parseAmount(asset.gbAcquisitionExtensionBuildingStdPrice))
        return `${label}: 취득시(증축시) 건물2 기준시가 총액(원)을 입력하세요. ㎡당 단가가 아닌 총액(원)입니다.`;
    } else if (extMode === "actual") {
      // 실거래가 모드: 증축 실거래가 필수 (필요경비는 0 허용)
      if (!parseAmount(asset.gbExtensionActualAcquisitionPrice))
        return `${label}: 증축 실거래가(원)를 입력하세요.`;
    } else {
      // 미선택 또는 알 수 없는 모드
      return `${label}: 증축분 취득방식(환산취득가/실거래가)을 선택하세요.`;
    }

    // 증축일 범위: max(토지취득일, 건물1취득일) 이후
    const landAcqDate = asset.acquisitionDate;
    const buildingAcqDate = asset.gbBuildingAcquisitionDate ?? landAcqDate;
    const minAcqDate =
      landAcqDate && buildingAcqDate
        ? landAcqDate > buildingAcqDate
          ? landAcqDate
          : buildingAcqDate
        : landAcqDate || buildingAcqDate;
    if (minAcqDate && asset.gbExtensionDate <= minAcqDate) {
      return `${label}: 증축일은 토지·건물1 취득일 중 늦은 날(${minAcqDate}) 이후여야 합니다.`;
    }

    // 증축일은 양도일 이전이어야 함
    if (formTransferDate && asset.gbExtensionDate >= formTransferDate) {
      return `${label}: 증축일은 양도일(${formTransferDate}) 이전이어야 합니다.`;
    }
  }

  return null;
}
