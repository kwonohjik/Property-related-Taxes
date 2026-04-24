/**
 * 양도소득세 계산기 단계별 유효성 검사
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

export function validateStep(step: number, form: TransferFormData): string | null {
  const primary = form.assets?.[0];

  if (step === 0) {
    if (!form.assets || form.assets.length === 0) return "자산을 최소 1건 입력하세요.";
    if (!form.transferDate) return "양도일을 선택하세요.";
    if (!form.contractTotalPrice || parseAmount(form.contractTotalPrice) <= 0)
      return "총 양도가액을 입력하세요.";

    for (let i = 0; i < form.assets.length; i++) {
      const a = form.assets[i];
      const label = form.assets.length === 1 ? "자산" : `자산 ${i + 1}`;

      if (!a.assetKind) return `${label}: 자산 유형을 선택하세요.`;

      // 다자산일 때 자산별 양도가액
      if (form.assets.length > 1) {
        if (form.bundledSaleMode === "actual") {
          if (!a.actualSalePrice || parseAmount(a.actualSalePrice) <= 0)
            return `${label}: 계약서상 양도가액을 입력하세요.`;
        } else {
          if (!a.standardPriceAtTransfer || parseAmount(a.standardPriceAtTransfer) <= 0)
            return `${label}: 양도시 기준시가를 입력하세요.`;
        }
      }

      if (!a.acquisitionDate) return `${label}: 취득일을 입력하세요.`;

      if (a.acquisitionCause === "purchase") {
        if (a.useEstimatedAcquisition) {
          if (!a.standardPriceAtAcq || parseAmount(a.standardPriceAtAcq) <= 0)
            return `${label}: 취득시 기준시가를 입력하세요.`;
        } else {
          if (!a.fixedAcquisitionPrice || parseAmount(a.fixedAcquisitionPrice) <= 0)
            return `${label}: 취득가액을 입력하세요.`;
        }
      } else if (a.acquisitionCause === "gift") {
        if (!a.fixedAcquisitionPrice || parseAmount(a.fixedAcquisitionPrice) <= 0)
          return `${label}: 증여 신고가액을 입력하세요.`;
        if (!a.donorAcquisitionDate)
          return `${label}: 증여자 취득일을 입력하세요.`;
      } else if (a.acquisitionCause === "inheritance") {
        if (!a.decedentAcquisitionDate)
          return `${label}: 피상속인 취득일을 입력하세요.`;
        const hasAuto = a.inheritanceValuationMode === "auto";
        const hasManual =
          a.inheritanceValuationMode === "manual" &&
          a.fixedAcquisitionPrice &&
          parseAmount(a.fixedAcquisitionPrice) > 0;
        if (!hasAuto && !hasManual)
          return `${label}: 상속 취득가액(보충평가 또는 직접입력)을 입력하세요.`;
      }
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

  if (step === 1) {
    // step=0에서 자산·취득일이 입력되므로 여기서는 날짜 순서만 재검증
    if (primary?.acquisitionDate && form.transferDate && primary.acquisitionDate >= form.transferDate)
      return "취득일은 양도일보다 이전이어야 합니다.";
    if (
      primary?.acquisitionCause === "inheritance" &&
      primary.decedentAcquisitionDate &&
      primary.decedentAcquisitionDate >= primary.acquisitionDate
    )
      return "피상속인 취득일은 상속개시일보다 이전이어야 합니다.";
    if (
      primary?.acquisitionCause === "gift" &&
      primary.donorAcquisitionDate &&
      primary.donorAcquisitionDate >= primary.acquisitionDate
    )
      return "증여자 취득일은 증여일보다 이전이어야 합니다.";
  }

  if (step === 2) {
    const primaryKind = primary?.assetKind;
    const primaryAcqDate = primary?.acquisitionDate ?? "";

    // 다필지 모드 (parcelMode는 이제 자산별 필드)
    if (primary?.parcelMode && primaryKind === "land") {
      const parcels = primary.parcels ?? [];
      if (parcels.length === 0) return "필지를 최소 1개 추가하세요.";
      for (let i = 0; i < parcels.length; i++) {
        const p = parcels[i];
        const label = `필지 ${i + 1}`;
        const scenario = p.areaScenario ?? "partial";

        // 취득일 검증
        if (!p.useDayAfterReplotting && !p.acquisitionDate)
          return `${label}: 취득일을 선택하세요.`;
        if (p.useDayAfterReplotting && !p.replottingConfirmDate)
          return `${label}: 환지처분확정일을 선택하세요.`;

        // 시나리오별 면적 검증
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

        // 취득원인별 검증
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

    // 자산 레벨 환지처분 (단일 필지, parcelMode=false)
    if (primaryKind === "land" && !primary?.parcelMode) {
      const scenario = primary?.areaScenario ?? "same";
      if (scenario === "reduction") {
        if (!primary?.replottingConfirmDate) return "환지처분확정일을 입력하세요.";
        if (!primary?.entitlementArea || parseFloat(primary.entitlementArea) <= 0)
          return "환지 권리면적을 입력하세요.";
        if (!primary?.allocatedArea || parseFloat(primary.allocatedArea) <= 0)
          return "환지 교부면적을 입력하세요.";
        if (!primary?.priorLandArea || parseFloat(primary.priorLandArea) <= 0)
          return "환지 이전 종전면적을 입력하세요.";
        if (parseFloat(primary.entitlementArea) <= parseFloat(primary.allocatedArea))
          return "감환지는 권리면적이 교부면적보다 커야 합니다.";
      }
      if (scenario === "increase") {
        if (!primary?.replottingConfirmDate) return "환지처분확정일을 입력하세요.";
        if (!primary?.acquisitionArea || parseFloat(primary.acquisitionArea) <= 0)
          return "취득 당시 면적(권리면적 기준)을 입력하세요.";
        if (!primary?.transferArea || parseFloat(primary.transferArea) <= 0)
          return "양도 당시 면적을 입력하세요.";
      }
    }

    // 1990.8.30. 이전 토지 환산
    if (form.pre1990Enabled && primaryKind === "land") {
      const areaSqm = parseFloat((primary?.acquisitionArea || "").replace(/,/g, ""));
      if (!areaSqm || areaSqm <= 0) return "취득 당시 면적(㎡)을 입력하세요.";
      if (!form.pre1990PricePerSqm_1990 || parseAmount(form.pre1990PricePerSqm_1990) <= 0)
        return "1990.1.1. 개별공시지가(원/㎡)를 입력하세요.";
      if (!form.pre1990PricePerSqm_atTransfer || parseAmount(form.pre1990PricePerSqm_atTransfer) <= 0)
        return "양도당시 개별공시지가(원/㎡)를 입력하세요.";
      const gradeValid = (raw: string) => {
        const n = Number((raw || "").replace(/,/g, ""));
        return Number.isFinite(n) && n > 0;
      };
      if (!gradeValid(form.pre1990Grade_current)) return "1990.8.30. 현재 토지등급을 입력하세요.";
      if (!gradeValid(form.pre1990Grade_prev)) return "1990.8.30. 직전 토지등급을 입력하세요.";
      if (!gradeValid(form.pre1990Grade_atAcq)) return "취득시 유효 토지등급을 입력하세요.";
    }

    // 환산취득가 — 대표 자산 기준시가 검증
    const isEstimated =
      form.acquisitionMethod === "estimated" || (primary?.useEstimatedAcquisition ?? false);
    if (isEstimated && !form.pre1990Enabled) {
      if (!primary?.standardPriceAtAcq || parseAmount(primary.standardPriceAtAcq) <= 0)
        return "취득 당시 기준시가를 입력하세요.";
      if (!primary?.standardPriceAtTransfer || parseAmount(primary.standardPriceAtTransfer) <= 0)
        return "양도 당시 기준시가를 입력하세요.";
    }

    // 취득가액 — 실거래가 (대표 자산, Step3에서 취득방식 선택 후)
    const isAppraisal = form.acquisitionMethod === "appraisal";
    if (!isEstimated && !isAppraisal && !form.pre1990Enabled && !(primary?.parcelMode && primaryKind === "land")) {
      if (!primary?.fixedAcquisitionPrice || parseAmount(primary.fixedAcquisitionPrice) < 0)
        return "취득가액을 입력하세요.";
    }

    // 취득일-양도일 순서 재검증 (다필지 외)
    if (!primary?.parcelMode && primaryAcqDate && primaryAcqDate >= form.transferDate)
      return "취득일은 양도일보다 이전이어야 합니다.";
  }

  if (step === 3) {
    if (!form.householdHousingCount) return "세대 보유 주택 수를 선택하세요.";
  }

  if (step === 4) {
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

  return null;
}
