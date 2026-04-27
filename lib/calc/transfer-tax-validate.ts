/**
 * 양도소득세 계산기 단계별 유효성 검사 (Step1·Step3 통합 후 4단계)
 *
 * step 0: 자산 목록 (취득상세·환산취득가·1990·신축증축 모두 포함)
 * step 1: 보유 상황
 * step 2: 감면·공제
 * step 3: 가산세 (선택)
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData, AssetForm } from "@/lib/stores/calc-wizard-store";

/** 다필지 자산 검증 — primary 자산이 다필지 모드일 때 */
function validateParcelMode(primary: AssetForm): string | null {
  const parcels = primary.parcels ?? [];
  if (parcels.length === 0) return "필지를 최소 1개 추가하세요.";
  for (let i = 0; i < parcels.length; i++) {
    const p = parcels[i];
    const label = `필지 ${i + 1}`;
    const scenario = p.areaScenario ?? "partial";

    if (!p.useDayAfterReplotting && !p.acquisitionDate)
      return `${label}: 취득일을 선택하세요.`;
    if (p.useDayAfterReplotting && !p.replottingConfirmDate)
      return `${label}: 환지처분확정일을 선택하세요.`;

    if (scenario === "reduction") {
      if (!p.entitlementArea || parseFloat(p.entitlementArea) <= 0)
        return `${label}: 권리면적을 입력하세요.`;
      if (!p.allocatedArea || parseFloat(p.allocatedArea) <= 0)
        return `${label}: 교부면적을 입력하세요.`;
      if (!p.priorLandArea || parseFloat(p.priorLandArea) <= 0)
        return `${label}: 종전토지면적을 입력하세요.`;
      if (parseFloat(p.entitlementArea) <= parseFloat(p.allocatedArea))
        return `${label}: 감환지는 권리면적이 교부면적보다 커야 합니다.`;
    } else {
      if (!p.transferArea || parseFloat(p.transferArea) <= 0)
        return `${label}: 양도면적을 입력하세요.`;
      if (scenario === "partial") {
        if (!p.acquisitionArea || parseFloat(p.acquisitionArea) <= 0)
          return `${label}: 총 취득면적을 입력하세요.`;
        if (parseFloat(p.acquisitionArea) < parseFloat(p.transferArea))
          return `${label}: 취득면적은 양도면적 이상이어야 합니다.`;
      }
    }

    if (p.acquisitionMethod === "estimated") {
      if (!p.standardPricePerSqmAtAcq || parseFloat(p.standardPricePerSqmAtAcq) <= 0)
        return `${label}: 취득시 ㎡당 기준시가를 입력하세요.`;
      if (!p.standardPricePerSqmAtTransfer || parseFloat(p.standardPricePerSqmAtTransfer) <= 0)
        return `${label}: 양도시 ㎡당 기준시가를 입력하세요.`;
    } else {
      if (!p.acquisitionPrice || parseAmount(p.acquisitionPrice) <= 0)
        return `${label}: 취득가액을 입력하세요.`;
    }
  }
  return null;
}

/** 자산 카드 1건의 취득 정보 검증 (취득가·환산·1990·신축) */
function validateAssetAcquisition(asset: AssetForm, label: string): string | null {
  if (!asset.acquisitionDate) return `${label}: 취득일을 입력하세요.`;

  const isAppraisal = asset.isAppraisalAcquisition === true;
  const isEstimated = !isAppraisal && asset.useEstimatedAcquisition === true;
  const hasPre1990 = (asset.pre1990Enabled ?? false) && asset.assetKind === "land";
  const isParcelMode = asset.parcelMode === true && asset.assetKind === "land";

  // 1) 다필지 모드는 별도 검증
  if (isParcelMode) return validateParcelMode(asset);

  // 2) 환지처분 시나리오
  if (asset.assetKind === "land") {
    const scenario = asset.areaScenario ?? "same";
    if (scenario === "reduction") {
      if (!asset.replottingConfirmDate) return `${label}: 환지처분확정일을 입력하세요.`;
      if (!asset.entitlementArea || parseFloat(asset.entitlementArea) <= 0)
        return `${label}: 환지 권리면적을 입력하세요.`;
      if (!asset.allocatedArea || parseFloat(asset.allocatedArea) <= 0)
        return `${label}: 환지 교부면적을 입력하세요.`;
      if (!asset.priorLandArea || parseFloat(asset.priorLandArea) <= 0)
        return `${label}: 환지 이전 종전면적을 입력하세요.`;
      if (parseFloat(asset.entitlementArea) <= parseFloat(asset.allocatedArea))
        return `${label}: 감환지는 권리면적이 교부면적보다 커야 합니다.`;
    }
    if (scenario === "increase") {
      if (!asset.replottingConfirmDate) return `${label}: 환지처분확정일을 입력하세요.`;
      if (!asset.acquisitionArea || parseFloat(asset.acquisitionArea) <= 0)
        return `${label}: 취득 당시 면적(권리면적 기준)을 입력하세요.`;
      if (!asset.transferArea || parseFloat(asset.transferArea) <= 0)
        return `${label}: 양도 당시 면적을 입력하세요.`;
    }
  }

  // 3) 1990.8.30. 이전 토지 환산 (자산-수준)
  if (hasPre1990) {
    const areaSqm = parseFloat((asset.acquisitionArea || "").replace(/,/g, ""));
    if (!areaSqm || areaSqm <= 0) return `${label}: 취득 당시 면적(㎡)을 입력하세요.`;
    if (!asset.pre1990PricePerSqm_1990 || parseAmount(asset.pre1990PricePerSqm_1990) <= 0)
      return `${label}: 1990.1.1. 개별공시지가(원/㎡)를 입력하세요.`;
    if (!asset.pre1990PricePerSqm_atTransfer || parseAmount(asset.pre1990PricePerSqm_atTransfer) <= 0)
      return `${label}: 양도당시 개별공시지가(원/㎡)를 입력하세요.`;
    const gradeValid = (raw: string) => {
      const n = Number((raw || "").replace(/,/g, ""));
      return Number.isFinite(n) && n > 0;
    };
    if (!gradeValid(asset.pre1990Grade_current)) return `${label}: 1990.8.30. 현재 토지등급을 입력하세요.`;
    if (!gradeValid(asset.pre1990Grade_prev)) return `${label}: 1990.8.30. 직전 토지등급을 입력하세요.`;
    if (!gradeValid(asset.pre1990Grade_atAcq)) return `${label}: 취득시 유효 토지등급을 입력하세요.`;
  }

  // 4) 환산취득가 — 기준시가
  // 주의: usePreHousingDisclosure === true 경로에서는 §164⑤ 3-시점 입력으로 자동 도출되므로
  //   standardPriceAtAcq / standardPriceAtTransfer 직접 입력 불요.
  const usesPhd = asset.usePreHousingDisclosure === true && asset.hasSeperateLandAcquisitionDate === true;
  if (isEstimated && !hasPre1990 && !usesPhd) {
    if (!asset.standardPriceAtAcq || parseAmount(asset.standardPriceAtAcq) <= 0)
      return `${label}: 취득 당시 기준시가를 입력하세요.`;
    if (!asset.standardPriceAtTransfer || parseAmount(asset.standardPriceAtTransfer) <= 0)
      return `${label}: 양도 당시 기준시가를 입력하세요.`;
  }

  // 4-2) 개별주택가격 미공시 취득 환산 (§164⑤) — 11개 필수 필드
  if (usesPhd) {
    if (!asset.phdFirstDisclosureDate)
      return `${label}: 최초 고시일을 입력하세요.`;
    if (!asset.phdFirstDisclosureHousingPrice || parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
      return `${label}: 최초 고시 개별주택가격을 입력하세요.`;
    if (!asset.acquisitionArea || parseFloat(asset.acquisitionArea) <= 0)
      return `${label}: 토지 면적(㎡)을 입력하세요. (자산 기본 정보)`;
    if (!asset.phdLandPricePerSqmAtAcq || parseAmount(asset.phdLandPricePerSqmAtAcq) <= 0)
      return `${label}: 취득시 토지 단위 공시지가를 입력하세요.`;
    if (!asset.phdBuildingStdPriceAtAcq || parseAmount(asset.phdBuildingStdPriceAtAcq) <= 0)
      return `${label}: 취득시 건물 기준시가를 입력하세요.`;
    if (!asset.phdLandPricePerSqmAtFirst || parseAmount(asset.phdLandPricePerSqmAtFirst) <= 0)
      return `${label}: 최초공시일 토지 단위 공시지가를 입력하세요.`;
    if (!asset.phdBuildingStdPriceAtFirst || parseAmount(asset.phdBuildingStdPriceAtFirst) <= 0)
      return `${label}: 최초공시일 건물 기준시가를 입력하세요.`;
    if (!asset.phdTransferHousingPrice || parseAmount(asset.phdTransferHousingPrice) <= 0)
      return `${label}: 양도시 개별주택가격을 입력하세요.`;
    if (!asset.phdLandPricePerSqmAtTransfer || parseAmount(asset.phdLandPricePerSqmAtTransfer) <= 0)
      return `${label}: 양도시 토지 단위 공시지가를 입력하세요.`;
    if (!asset.phdBuildingStdPriceAtTransfer || parseAmount(asset.phdBuildingStdPriceAtTransfer) <= 0)
      return `${label}: 양도시 건물 기준시가를 입력하세요.`;
  }

  // 5) 취득가액 — 실거래가·감정가액 모두 fixedAcquisitionPrice 입력 루틴
  if (!isEstimated && !hasPre1990) {
    if (asset.acquisitionCause === "purchase") {
      if (!asset.fixedAcquisitionPrice || parseAmount(asset.fixedAcquisitionPrice) <= 0)
        return `${label}: ${isAppraisal ? "감정가액" : "취득가액"}을 입력하세요.`;
    } else if (asset.acquisitionCause === "gift") {
      if (!asset.fixedAcquisitionPrice || parseAmount(asset.fixedAcquisitionPrice) <= 0)
        return `${label}: 증여 신고가액을 입력하세요.`;
      if (!asset.donorAcquisitionDate)
        return `${label}: 증여자 취득일을 입력하세요.`;
    } else if (asset.acquisitionCause === "inheritance") {
      if (!asset.decedentAcquisitionDate)
        return `${label}: 피상속인 취득일을 입력하세요.`;
      const hasAuto = asset.inheritanceValuationMode === "auto";
      const hasManual =
        asset.inheritanceValuationMode === "manual" &&
        asset.fixedAcquisitionPrice &&
        parseAmount(asset.fixedAcquisitionPrice) > 0;
      if (!hasAuto && !hasManual)
        return `${label}: 상속 취득가액(보충평가 또는 직접입력)을 입력하세요.`;
    }
  }

  // 6) 신축·증축 (매매 + housing/building 전용)
  if (asset.isSelfBuilt && asset.acquisitionCause === "purchase") {
    if (!asset.buildingType) return `${label}: 신축·증축 구분을 선택하세요.`;
    if (!asset.constructionDate) return `${label}: 신축·증축 완공일을 입력하세요.`;
    if (asset.buildingType === "extension" && (!asset.extensionFloorArea || parseFloat(asset.extensionFloorArea) <= 0))
      return `${label}: 증축 부분 바닥면적을 입력하세요.`;
  }

  // 7) 취득일-양도일 순서
  return null;
}

export function validateStep(step: number, form: TransferFormData): string | null {
  // step 0: 자산 목록 (취득 정보 통합)
  if (step === 0) {
    if (!form.assets || form.assets.length === 0) return "자산을 최소 1건 입력하세요.";
    if (!form.transferDate) return "양도일을 선택하세요.";
    if (!form.contractTotalPrice || parseAmount(form.contractTotalPrice) <= 0)
      return "총 양도가액을 입력하세요.";

    for (let i = 0; i < form.assets.length; i++) {
      const a = form.assets[i];
      const label = form.assets.length === 1 ? "자산" : `자산 ${i + 1}`;

      if (!a.assetKind) return `${label}: 자산 유형을 선택하세요.`;

      // 다자산 양도가액
      if (form.assets.length > 1) {
        if (form.bundledSaleMode === "actual") {
          if (!a.actualSalePrice || parseAmount(a.actualSalePrice) <= 0)
            return `${label}: 계약서상 양도가액을 입력하세요.`;
        } else {
          if (!a.standardPriceAtTransfer || parseAmount(a.standardPriceAtTransfer) <= 0)
            return `${label}: 양도시 기준시가를 입력하세요.`;
        }
      }

      // 자산별 취득 정보 검증 (취득일 + 취득가 + 환산 + 1990 + 신축)
      const acqError = validateAssetAcquisition(a, label);
      if (acqError) return acqError;

      // 취득일-양도일 순서 (다필지 모드 외)
      if (!a.parcelMode && a.acquisitionDate && a.acquisitionDate >= form.transferDate)
        return `${label}: 취득일은 양도일보다 이전이어야 합니다.`;

      // 상속·증여자 취득일 순서
      if (
        a.acquisitionCause === "inheritance" &&
        a.decedentAcquisitionDate &&
        a.acquisitionDate &&
        a.decedentAcquisitionDate >= a.acquisitionDate
      )
        return `${label}: 피상속인 취득일은 상속개시일보다 이전이어야 합니다.`;
      if (
        a.acquisitionCause === "gift" &&
        a.donorAcquisitionDate &&
        a.acquisitionDate &&
        a.donorAcquisitionDate >= a.acquisitionDate
      )
        return `${label}: 증여자 취득일은 증여일보다 이전이어야 합니다.`;
    }

    // actual 모드 합계 검증
    if (form.assets.length > 1 && form.bundledSaleMode === "actual") {
      const sumActual = form.assets.reduce(
        (s, a) => s + parseAmount(a.actualSalePrice),
        0,
      );
      if (sumActual !== parseAmount(form.contractTotalPrice))
        return "구분 기재된 양도가액 합이 총 양도가액과 일치하지 않습니다.";
    }
  }

  // step 1: 보유 상황 (구 step 3)
  if (step === 1) {
    if (!form.householdHousingCount) return "세대 보유 주택 수를 선택하세요.";
  }

  // step 2: 감면·공제 (구 step 4)
  if (step === 2) {
    for (const asset of form.assets ?? []) {
      for (const r of asset.reductions ?? []) {
        if (r.type === "public_expropriation") {
          const cash = parseAmount(r.expropriationCash || "0");
          const bond = parseAmount(r.expropriationBond || "0");
          if (cash + bond <= 0) return "현금 또는 채권 보상액 중 최소 하나를 입력하세요.";
          if (!r.expropriationApprovalDate) return "사업인정고시일을 선택하세요.";
          if (form.transferDate && r.expropriationApprovalDate >= form.transferDate)
            return "사업인정고시일은 양도일보다 이전이어야 합니다.";
        }
      }
    }
  }

  // step 3: 가산세 (선택, 검증 없음 — useEffect로 자동 동기화)

  return null;
}
