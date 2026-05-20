"use client";

/**
 * AcquisitionSidebar — 취득세 마법사 진행 사이드바 (P5UI-7)
 *
 * WizardSidebar 패턴 준수.
 * computeAcquisitionSummary(form) 순수 함수로 합계 계산.
 */

import { useMemo } from "react";
import { WizardSidebar } from "@/components/calc/shared/WizardSidebar";
import type { WizardSidebarStep, WizardSidebarSummaryItem } from "@/components/calc/shared/WizardSidebar";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { FormState } from "./shared";
import { STEPS, isDeemedAcquisitionCause } from "./shared";

// ============================================================
// 합계 계산 순수 함수
// ============================================================

export interface AcquisitionSummary {
  acquisitionValue: number | null;
  standardValue: number | null;
  houseCountAfter: number | null;
  isRegulated: boolean;
  isCorporation: boolean;
  estimatedBaseRate: string | null;
  /** 간주취득 유형 라벨 */
  deemedType?: string;
  /** 간주취득 과세표준 미리보기 */
  deemedTaxBase?: number | null;
  /** 연부취득 여부 */
  isInstallment?: boolean;
  /** 연부 회차 수 */
  installmentCount?: number;
}

/**
 * 현재까지 입력된 폼 데이터로 요약 정보 계산
 * 사이드바에 표시할 항목만 반환 (0·null은 제외)
 */
export function computeAcquisitionSummary(form: FormState): AcquisitionSummary {
  // ─── 간주취득 분기 ───
  const isDeemedMajor = form.acquisitionCause === "deemed_major_shareholder";
  const isDeemedLand  = form.acquisitionCause === "deemed_land_category";
  const isDeemedReno  = form.acquisitionCause === "deemed_renovation";

  if (isDeemedMajor) {
    if (form.deemedMajorIsListed) {
      return {
        acquisitionValue: null, standardValue: null, houseCountAfter: null,
        isRegulated: false, isCorporation: false,
        estimatedBaseRate: "비과세 (상장법인)",
        deemedType: "과점주주", deemedTaxBase: null,
      };
    }
    const corpVal = parseAmount(form.deemedMajorCorporateAssetValue ?? "") ?? 0;
    const prevR   = parseFloat(form.deemedMajorPrevShareRatio ?? "0") / 100;
    const newR    = parseFloat(form.deemedMajorNewShareRatio  ?? "0") / 100;
    const taxableRatio = Math.max(0, newR - prevR);
    const deemedBase = corpVal > 0 && taxableRatio > 0
      ? Math.floor(corpVal * taxableRatio)
      : null;
    return {
      acquisitionValue: null, standardValue: null, houseCountAfter: null,
      isRegulated: false, isCorporation: false,
      estimatedBaseRate: deemedBase ? "2% (간주취득)" : null,
      deemedType: "과점주주", deemedTaxBase: deemedBase,
    };
  }

  if (isDeemedLand) {
    const prevSv = parseAmount(form.deemedLandPrevStandardValue ?? "") ?? 0;
    const newSv  = parseAmount(form.deemedLandNewStandardValue  ?? "") ?? 0;
    const deemedBase = newSv > prevSv ? newSv - prevSv : null;
    return {
      acquisitionValue: null, standardValue: null, houseCountAfter: null,
      isRegulated: false, isCorporation: false,
      estimatedBaseRate: deemedBase ? "2% (간주취득)" : null,
      deemedType: "지목변경", deemedTaxBase: deemedBase,
    };
  }

  if (isDeemedReno) {
    const prevSv = parseAmount(form.deemedRenovationPrevStandardValue ?? "") ?? 0;
    const newSv  = parseAmount(form.deemedRenovationNewStandardValue  ?? "") ?? 0;
    const deemedBase = newSv > prevSv ? newSv - prevSv : null;
    return {
      acquisitionValue: null, standardValue: null, houseCountAfter: null,
      isRegulated: false, isCorporation: false,
      estimatedBaseRate: deemedBase ? "2% (간주취득)" : null,
      deemedType: "건물 개수", deemedTaxBase: deemedBase,
    };
  }

  // ─── 일반 취득 ───
  const isOriginal = ["new_construction", "extension", "reconstruction", "reclamation"].includes(form.acquisitionCause);
  const isBurdened = form.acquisitionCause === "burdened_gift";

  // ─── 연부취득 분기 ───
  if (
    form.acquisitionCause === "purchase" &&
    form.isInstallmentAcquisition &&
    Array.isArray(form.installments) &&
    form.installments.length > 0
  ) {
    const installmentTotal = form.installments.reduce(
      (s, p) => s + (parseAmount(p.amount) ?? 0), 0
    );
    const acqValue = installmentTotal > 0 ? installmentTotal : null;
    const stdValue = parseAmount(form.standardValue) || null;

    // 예상 세율 (주택 유상거래 기준)
    let estimatedBaseRate: string | null = null;
    if (form.propertyType === "housing" && acqValue) {
      const isCorp = form.acquiredBy === "corporation";
      const houseCount = parseInt(form.houseCountAfter) > 0 ? parseInt(form.houseCountAfter) : 1;
      const regulated = form.isRegulatedArea;
      if (isCorp) {
        estimatedBaseRate = "12% (법인 중과)";
      } else if (regulated && houseCount >= 3) {
        estimatedBaseRate = "12% (조정 3주택+)";
      } else if (regulated && houseCount === 2) {
        estimatedBaseRate = "8% (조정 2주택)";
      } else if (!regulated && houseCount >= 4) {
        estimatedBaseRate = "12% (비조정 4주택+)";
      } else if (!regulated && houseCount >= 3) {
        estimatedBaseRate = "8% (비조정 3주택)";
      } else if (acqValue <= 600_000_000) {
        estimatedBaseRate = "1%";
      } else if (acqValue >= 900_000_000) {
        estimatedBaseRate = "3%";
      } else {
        const rate = (acqValue * 2 / 300_000_000 - 3) / 100;
        estimatedBaseRate = `${(rate * 100).toFixed(3)}% (선형보간)`;
      }
    } else if (form.propertyType === "land" || form.propertyType === "land_farmland" || form.propertyType === "building") {
      estimatedBaseRate = "4%";
    }

    return {
      acquisitionValue: acqValue,
      standardValue: stdValue,
      houseCountAfter: form.propertyType === "housing"
        ? (parseInt(form.houseCountAfter) > 0 ? parseInt(form.houseCountAfter) : null)
        : null,
      isRegulated: form.isRegulatedArea,
      isCorporation: form.acquiredBy === "corporation",
      estimatedBaseRate,
      isInstallment: true,
      installmentCount: form.installments.length,
    };
  }

  let rawValue = 0;
  if (isBurdened) {
    rawValue = parseAmount(form.marketValue) ?? 0;
  } else if (isOriginal) {
    rawValue = parseAmount(form.constructionCost) ?? 0;
  } else {
    rawValue = parseAmount(form.reportedPrice) ?? 0;
  }

  const acqValue = rawValue > 0 ? rawValue : null;
  const stdValue = parseAmount(form.standardValue) || null;
  const hcnt = parseInt(form.houseCountAfter) > 0 ? parseInt(form.houseCountAfter) : null;

  // 대략적인 세율 미리보기 (주택 유상거래 기준)
  let estimatedBaseRate: string | null = null;
  if (form.propertyType === "housing" && acqValue) {
    const isCorp = form.acquiredBy === "corporation";
    const houseCount = hcnt ?? 1;
    const regulated = form.isRegulatedArea;

    if (isCorp) {
      estimatedBaseRate = "12% (법인 중과)";
    } else if (regulated && houseCount >= 3) {
      estimatedBaseRate = "12% (조정 3주택+)";
    } else if (regulated && houseCount === 2) {
      estimatedBaseRate = "8% (조정 2주택)";
    } else if (!regulated && houseCount >= 4) {
      estimatedBaseRate = "12% (비조정 4주택+)";
    } else if (!regulated && houseCount >= 3) {
      estimatedBaseRate = "8% (비조정 3주택)";
    } else if (acqValue <= 600_000_000) {
      estimatedBaseRate = "1%";
    } else if (acqValue >= 900_000_000) {
      estimatedBaseRate = "3%";
    } else {
      const rate = (acqValue * 2 / 300_000_000 - 3) / 100;
      estimatedBaseRate = `${(rate * 100).toFixed(3)}% (선형보간)`;
    }
  } else if (form.propertyType === "land" || form.propertyType === "land_farmland" || form.propertyType === "building") {
    if (form.acquisitionCause === "inheritance" || form.acquisitionCause === "inheritance_farmland") {
      estimatedBaseRate = form.propertyType === "land_farmland" ? "2.3%" : "2.8%";
    } else if (form.acquisitionCause === "gift") {
      estimatedBaseRate = "3.5%";
    } else {
      estimatedBaseRate = "4%";
    }
  }

  return {
    acquisitionValue: acqValue,
    standardValue: stdValue,
    houseCountAfter: form.propertyType === "housing" ? hcnt : null,
    isRegulated: form.isRegulatedArea,
    isCorporation: form.acquiredBy === "corporation",
    estimatedBaseRate,
  };
}

// ============================================================
// 사이드바 컴포넌트
// ============================================================

interface Props {
  form: FormState;
  currentStep: number;
  onStepClick: (step: number) => void;
}

export function AcquisitionSidebar({ form, currentStep, onStepClick }: Props) {
  const isDeemed = isDeemedAcquisitionCause(form.acquisitionCause);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- 명시 deps로 selector 안정화. Compiler 자동 메모와 별도로 유지
  const summary = useMemo(() => computeAcquisitionSummary(form), [
    form.reportedPrice,
    form.marketValue,
    form.constructionCost,
    form.standardValue,
    form.houseCountAfter,
    form.isRegulatedArea,
    form.acquiredBy,
    form.propertyType,
    form.acquisitionCause,
    form.deemedMajorIsListed,
    form.deemedMajorCorporateAssetValue,
    form.deemedMajorPrevShareRatio,
    form.deemedMajorNewShareRatio,
    form.deemedLandPrevStandardValue,
    form.deemedLandNewStandardValue,
    form.deemedRenovationPrevStandardValue,
    form.deemedRenovationNewStandardValue,
    form.isInstallmentAcquisition,
    form.installments,
    form.installmentTotalContractPrice,
  ]);

  const activeSteps = isDeemed
    ? ["취득 정보", "간주취득 상세"]
    : STEPS;

  const steps: WizardSidebarStep[] = activeSteps.map((label, i) => ({
    label,
    status: i < currentStep ? "done" : i === currentStep ? "active" : "todo",
    onClick: () => onStepClick(i),
  }));

  const summaryItems: WizardSidebarSummaryItem[] = [];

  // 간주취득 사이드바 요약
  if (summary.deemedType) {
    summaryItems.push({ label: "간주취득 유형", value: summary.deemedType });

    if (summary.estimatedBaseRate === "비과세 (상장법인)") {
      summaryItems.push({ label: "판정", value: "비과세 (상장법인)", highlight: true });
    } else if (summary.deemedTaxBase !== null && summary.deemedTaxBase !== undefined && summary.deemedTaxBase > 0) {
      summaryItems.push({ label: "과세표준 (차액)", value: summary.deemedTaxBase });
      summaryItems.push({
        label: "예상 취득세 (2%)",
        value: Math.floor(summary.deemedTaxBase * 0.02),
        highlight: true,
      });
    }
  } else if (summary.isInstallment && summary.installmentCount) {
    // 연부취득 사이드바 요약
    summaryItems.push({ label: "취득 방식", value: "연부취득 (§10의5)" });
    summaryItems.push({ label: "회차 수", value: `${summary.installmentCount}회차` });
    if (summary.acquisitionValue) {
      summaryItems.push({ label: "회차 합계", value: summary.acquisitionValue });
    }
    if (summary.standardValue) {
      summaryItems.push({ label: "시가표준액", value: summary.standardValue });
    }
    if (summary.houseCountAfter !== null) {
      summaryItems.push({ label: "취득 후 주택 수", value: `${summary.houseCountAfter}주택` });
    }
    if (summary.estimatedBaseRate && currentStep >= 2) {
      summaryItems.push({
        label: "예상 세율",
        value: summary.estimatedBaseRate,
        highlight: true,
      });
    }
  } else {
    // 일반 취득 사이드바 요약
    if (summary.acquisitionValue) {
      const causeLabel = form.acquisitionCause === "burdened_gift"
        ? "시가 (부담부증여)"
        : ["new_construction", "extension", "reconstruction", "reclamation"].includes(form.acquisitionCause)
        ? "공사비"
        : "취득가액";
      summaryItems.push({
        label: causeLabel,
        value: summary.acquisitionValue,
      });
    }

    if (summary.standardValue) {
      summaryItems.push({ label: "시가표준액", value: summary.standardValue });
    }

    if (summary.houseCountAfter !== null) {
      summaryItems.push({ label: "취득 후 주택 수", value: `${summary.houseCountAfter}주택` });
    }

    if (summary.estimatedBaseRate && currentStep >= 2) {
      summaryItems.push({
        label: "예상 세율",
        value: summary.estimatedBaseRate,
        highlight: true,
      });
    }
  }

  return (
    <WizardSidebar
      title="취득세 계산"
      steps={steps}
      summary={summaryItems.length > 0 ? summaryItems : undefined}
    />
  );
}
