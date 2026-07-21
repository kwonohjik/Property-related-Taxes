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
  // ⑧ 부담부증여 (소령 §159) — Phase 2 (2026-05-12): transferType === "burdened_gift" 분기.
  // 호환성: 레거시 acquisitionCause === "burdened_gift" OR 조건 fallback.
  // bg* 필드 + 양도시·취득시 자산별 기준시가(gb*)가 필수.
  const isBurdenedGiftGB =
    asset.transferType === "burdened_gift" ||
    asset.acquisitionCause === "burdened_gift";
  if (isBurdenedGiftGB) {
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

  // ── §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1 토지·건물 모두 상속, 설계 §0) ──
  // mode 분기 이전에 배치 — C2(부분 상속)를 취득시 기준시가 요구 전에 조기 차단(UX).
  const isLandInherited = asset.acquisitionCause === "inheritance";
  const isBuildingInherited = asset.gbBuildingAcquisitionCause === "inheritance";
  if (isLandInherited || isBuildingInherited) {
    // V1: Phase 1 = C1 단독. 부분 상속(한쪽만)은 혼합 배선 미설계 → Phase 2 차단.
    if (isLandInherited !== isBuildingInherited) {
      return `${label}: 일반건물의 토지·건물 중 한쪽만 상속으로 취득한 조합은 아직 지원하지 않습니다. (토지·건물 모두 상속이거나, 모두 상속이 아니어야 합니다)`;
    }
    // V2: 상속은 실거래가 모드 전용 — 환산·증축 조합 차단.
    if (asset.useEstimatedAcquisition || asset.gbHasExtension) {
      return `${label}: 상속 취득 일반건물은 환산취득가·증축 조합을 지원하지 않습니다. 실거래가 모드(환산취득가 토글 OFF·증축 토글 OFF)로 입력하세요.`;
    }
    // V3·V4: 상속개시일 평가액 필수 — 자동 안분 fallback 금지(mirror-pattern·API 변환과 동일 소스).
    if (!parseAmount(asset.publishedValueAtInheritance)) {
      return `${label}: 상속개시일 토지 평가액을 입력하세요. (자산 구분 "토지" 선택 후 상속세 신고가액 또는 보충적평가)`;
    }
    if (!parseAmount(asset.gbBuildingInheritedValue)) {
      return `${label}: 상속개시일 건물 신고가액을 입력하세요.`;
    }
  }

  // ── §163⑨ 증여 취득가액 직접 산정 (Phase 2 — block 방식) ──
  // 증여받은 자산은 증여일 현재 상증법 §60~66 평가액(증여 신고가액)을 취득당시 실지거래가액으로
  // 본다(§163⑨) → 취득가액 "확인 가능" → §166③ 환산·§163⑥ 개산공제 배제. 증여 신고가액은
  // 항상 확인 가능하므로 환산 자체가 법적 불필요 → 환산·증축 조합을 차단하고 실가(신고가액=취득가액)를 강제.
  // 상속과 달리 별도 신고가액 필드 없이 fixedAcquisitionPrice→actual 경로로 §166⑥ 안분되므로
  // 자산별 reported 분리(gbBuildingInheritedValue 등) 불요. pre-1985 증여는 §176의2④ 의제취득
  // 영역이므로 게이트 false → 기존 환산 fallback(회귀-safe).
  const isLandGift =
    asset.acquisitionCause === "gift" && (asset.acquisitionDate ?? "") >= "1985-01-01";
  const isBuildingGift =
    asset.gbBuildingAcquisitionCause === "gift" && (asset.acquisitionDate ?? "") >= "1985-01-01";
  if (isLandGift || isBuildingGift) {
    if (asset.useEstimatedAcquisition || asset.gbHasExtension) {
      return `${label}: 증여 취득 일반건물은 환산취득가·증축 조합을 지원하지 않습니다. 실거래가 모드(환산취득가 토글 OFF·증축 토글 OFF)로 증여일 평가액을 취득가액으로 입력하세요. (소득세법 시행령 §163⑨)`;
    }
    if (!parseAmount(asset.fixedAcquisitionPrice)) {
      return `${label}: 증여 신고가액(취득가액)을 입력하세요. 증여일 평가액을 취득당시 실지거래가액으로 사용합니다. (소득세법 시행령 §163⑨)`;
    }
  }

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

  // ── 사례 35: 주택→상가 용도변경 validation (사전법규재산 2022-684) ──
  if (asset.gbHouseToCommercialConversion === true) {
    if (!asset.gbConversionDate) {
      return `${label}: 주택→상가 용도변경을 선택했습니다. 용도변경일을 입력하세요.`;
    }
    if (asset.acquisitionDate && asset.gbConversionDate < asset.acquisitionDate) {
      return `${label}: 용도변경일은 취득일(${asset.acquisitionDate}) 이후여야 합니다.`;
    }
    if (formTransferDate && asset.gbConversionDate > formTransferDate) {
      return `${label}: 용도변경일은 양도일(${formTransferDate}) 이전이어야 합니다.`;
    }
    if (typeof asset.gbWasMultiHouseAtConversion !== "boolean") {
      return `${label}: 변경 당시 다주택자 여부를 선택하세요.`;
    }
  }

  // ── 사례 35 후속-1: §99-164-10 환산주택가격 4필드 필수 ──
  if (asset.gbHasFirstDisclosure === true) {
    if (!asset.useEstimatedAcquisition) {
      return `${label}: 환산주택가격 입력은 환산취득가 모드에서만 가능합니다.`;
    }
    if (!parseAmount(asset.gbFirstDisclosurePrice)) {
      return `${label}: 최초공시주택가격을 입력하세요 (§99-164-10).`;
    }
    if (!parseAmount(asset.gbFirstDisclosureLandStdPrice)) {
      return `${label}: 최초공시 당시 토지 기준시가를 입력하세요.`;
    }
    if (!parseAmount(asset.gbFirstDisclosureBuildingStdPrice)) {
      return `${label}: 최초공시 당시 건물 기준시가를 입력하세요.`;
    }
  }

  return null;
}
