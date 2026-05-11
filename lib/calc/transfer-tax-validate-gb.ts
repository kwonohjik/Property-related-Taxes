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

  if (asset.useEstimatedAcquisition) {
    // 환산취득가 모드 추가 검증
    if (!parseDecimal(asset.gbBuildingArea))
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
    // 증축일 필수
    if (!asset.gbExtensionDate)
      return `${label}: 증축일을 입력하세요.`;

    // 양도시 건물2 기준시가 총액 필수
    if (!parseAmount(asset.gbTransferExtensionBuildingStdPrice))
      return `${label}: 양도시 건물2 기준시가 총액(원)을 입력하세요. ㎡당 단가가 아닌 총액(원)입니다.`;

    // 취득시(증축시) 건물2 기준시가 총액 필수
    if (!parseAmount(asset.gbAcquisitionExtensionBuildingStdPrice))
      return `${label}: 취득시(증축시) 건물2 기준시가 총액(원)을 입력하세요. ㎡당 단가가 아닌 총액(원)입니다.`;

    // 증축 취득원인 필수
    if (
      !asset.gbExtensionAcquisitionCause ||
      !["purchase", "newConstruction"].includes(asset.gbExtensionAcquisitionCause)
    )
      return `${label}: 증축 취득원인을 선택하세요 (매매·자가증축 중).`;

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
