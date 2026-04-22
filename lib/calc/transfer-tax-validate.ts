/**
 * 양도소득세 계산기 단계별 유효성 검사
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

export function validateStep(step: number, form: TransferFormData): string | null {
  const isBundled = form.companionAssets && form.companionAssets.length > 0;

  if (step === 0) {
    if (!form.propertyType) return "양도하는 부동산 유형을 선택하세요.";
    if (isBundled) {
      if (!form.transferPrice || parseAmount(form.transferPrice) <= 0)
        return "총 양도가액을 입력하세요.";
      if (!form.standardPriceAtTransfer || parseAmount(form.standardPriceAtTransfer) <= 0)
        return "주된 자산의 양도시 기준시가를 입력하세요.";
      for (let i = 0; i < form.companionAssets.length; i++) {
        const a = form.companionAssets[i];
        if (!a.standardPriceAtTransfer || parseAmount(a.standardPriceAtTransfer) <= 0)
          return `동반자산 ${i + 1}: 양도시 기준시가를 입력하세요.`;
      }
    }
  }
  if (step === 1) {
    if (!form.transferPrice || parseAmount(form.transferPrice) <= 0) return "양도가액을 입력하세요.";
    if (!form.transferDate) return "양도일을 선택하세요.";
  }
  if (step === 2) {
    // 다필지 모드: 필지 배열 검증
    if (form.parcelMode && form.propertyType === "land") {
      if (!form.parcels || form.parcels.length === 0) return "필지를 최소 1개 추가하세요.";
      for (let i = 0; i < form.parcels.length; i++) {
        const p = form.parcels[i];
        const label = `필지 ${i + 1}`;
        if (!p.useDayAfterReplotting && !p.acquisitionDate) return `${label}: 취득일을 선택하세요.`;
        if (p.useDayAfterReplotting && !p.replottingConfirmDate) return `${label}: 환지처분확정일을 선택하세요.`;
        if (!p.transferArea || parseFloat(p.transferArea) <= 0) return `${label}: 양도면적을 입력하세요.`;
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
    if (!form.acquisitionDate) return "취득일을 선택하세요.";
    if (form.acquisitionDate >= form.transferDate) return "취득일은 양도일보다 이전이어야 합니다.";
    if (form.acquisitionCause === "inheritance") {
      if (!form.decedentAcquisitionDate) return "피상속인 취득일을 선택하세요.";
      if (form.decedentAcquisitionDate >= form.acquisitionDate)
        return "피상속인 취득일은 상속개시일보다 이전이어야 합니다.";
    }
    if (form.acquisitionCause === "gift") {
      if (!form.donorAcquisitionDate) return "증여자 취득일을 선택하세요.";
      if (form.donorAcquisitionDate >= form.acquisitionDate)
        return "증여자 취득일은 증여일보다 이전이어야 합니다.";
    }
    // 1990.8.30. 이전 토지 환산 모드: 엔진이 기준시가·취득가를 자동 산정하므로
    // 일반 가격 필드 검증을 건너뛰고 pre1990 고유 필드만 검증한다.
    if (form.pre1990Enabled && form.propertyType === "land") {
      const areaSqm = parseFloat((form.pre1990AreaSqm || "").replace(/,/g, ""));
      if (!areaSqm || areaSqm <= 0) return "토지 면적(㎡)을 입력하세요.";
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
    } else if (form.useEstimatedAcquisition) {
      if (!form.standardPriceAtAcquisition || parseAmount(form.standardPriceAtAcquisition) <= 0)
        return "취득 당시 기준시가를 입력하세요.";
      if (!form.standardPriceAtTransfer || parseAmount(form.standardPriceAtTransfer) <= 0)
        return "양도 당시 기준시가를 입력하세요.";
    } else {
      if (!form.acquisitionPrice || parseAmount(form.acquisitionPrice) < 0)
        return "취득가액을 입력하세요.";
    }
  }
  if (step === 3) {
    if (!form.householdHousingCount) return "세대 보유 주택 수를 선택하세요.";
  }
  if (step === 4) {
    if (form.reductionType === "public_expropriation") {
      const cash = parseAmount(form.expropriationCash || "0");
      const bond = parseAmount(form.expropriationBond || "0");
      if (cash + bond <= 0) return "현금 또는 채권 보상액 중 최소 하나를 입력하세요.";
      if (!form.expropriationApprovalDate) return "사업인정고시일을 선택하세요.";
      if (form.expropriationApprovalDate >= form.transferDate)
        return "사업인정고시일은 양도일보다 이전이어야 합니다.";
    }
  }
  return null;
}
