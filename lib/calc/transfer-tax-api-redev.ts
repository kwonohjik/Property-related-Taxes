/**
 * 재개발/재건축 (시행령 §166) — RedevelopmentInfo 서브객체 변환.
 *
 * transfer-tax-api-helpers.ts 800줄 정책에 따라 분리 (2026-05-15).
 * buildRedevelopmentPayload 단일 함수만 포함.
 *
 * assetKind === "redevelopment_apt" || "right_to_move_in" + redevSubject 입력 시 호출.
 *
 * 빈값/0 필드 fallback:
 * - postApprovalExpenses 미입력 → 0 (사례 44)
 * - 환산 케이스 외 acquisitionStdPrice/managementDisposalStdPrice 미입력 → undefined
 * - firstDisclosureDate/Price → undefined (단서 미발동)
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/**
 * AssetForm redev* 필드 → RedevelopmentInfo 서브객체 변환.
 *
 * 사례 37 land 분기 3중 패턴(UI/API/validate):
 *   LandPriceLookupField(단가×면적) 우선 > legacy 총액 직접 입력 fallback.
 *   UI·validate와 동일 우선순위 — API layer 단독 변환 금지(silent stripping 차단).
 */
export function buildRedevelopmentPayload(asset: AssetForm) {
  // UI display fallback과 동일(RedevelopmentBlock.tsx). 3중 패턴(UI/API/validate).
  // assetKind="right_to_move_in" 시 redevSubject 미입력이면 "right" fallback
  // (경로 A 버그 수정: assetKind="right_to_move_in" + redevSubject="" → "apt" 오변환 차단)
  const subjectDefault = asset.assetKind === "right_to_move_in" ? "right" : "apt";
  return {
    subject: (asset.redevSubject || subjectDefault) as "right" | "apt",
    approvalLawBasis: (asset.redevApprovalLawBasis || "urban_renovation_art_74") as "urban_renovation_art_74" | "small_housing_art_29",
    approvalDate: asset.redevApprovalDate,
    // 사례 48 — 승계조합원 모드: redev 권리가액 필드 숨김 → 자산 카드 fixedAcquisitionPrice 자동 미러 (UI 무결성용).
    // 엔진 runSuccessorMember는 input.actualAcquisitionPrice 우선 사용하므로 본 값은 fallback.
    rightsValue: asset.redevIsSuccessorMember === "yes"
      ? parseAmount(asset.fixedAcquisitionPrice)
      : parseAmount(asset.redevRightsValue),
    settlementDirection: (asset.redevSettlementDirection || "pay") as "pay" | "receive",
    settlementAmount: parseAmount(asset.redevSettlementAmount),
    settlementSaleDate: asset.redevSettlementSaleDate || undefined,
    preApprovalExpenses: parseAmount(asset.redevPreApprovalExpenses),
    // 인가후 분 필요경비 = redev 전용 입력 + 자본적지출(§97① 가목) + 양도비(§97① 나목)
    // 신축APT 양도 시점에 발생한 자본적지출·양도비는 인가후 분에 귀속.
    postApprovalExpenses: (() => {
      const redevPost = asset.redevPostApprovalExpenses ? parseAmount(asset.redevPostApprovalExpenses) : 0;
      const capex = parseAmount(asset.capitalExpenditure);
      const transferExp = parseAmount(asset.transferExpense);
      const total = redevPost + capex + transferExp;
      return total > 0 ? total : undefined;
    })(),
    originalAssetType: (asset.redevOriginalAssetType || "housing") as "land" | "housing" | undefined,
    acquisitionStdPrice: asset.redevAcquisitionStdPrice
      ? parseAmount(asset.redevAcquisitionStdPrice)
      : undefined,
    managementDisposalStdPrice: asset.redevManagementDisposalStdPrice
      ? parseAmount(asset.redevManagementDisposalStdPrice)
      : undefined,
    firstDisclosureDate: asset.redevFirstDisclosureDate || undefined,
    firstDisclosureHousingPrice: asset.redevFirstDisclosureHousingPrice
      ? parseAmount(asset.redevFirstDisclosureHousingPrice)
      : undefined,
    // PHD 패턴 — Sum_A·Sum_F 산정용 (housing 분기)
    landArea: asset.redevLandArea
      ? parseFloat(asset.redevLandArea.replace(/,/g, ""))
      : undefined,
    landPricePerSqmAtAcq: asset.redevLandPricePerSqmAtAcq
      ? parseAmount(asset.redevLandPricePerSqmAtAcq)
      : undefined,
    buildingStdPriceAtAcq: asset.redevBuildingStdPriceAtAcq
      ? parseAmount(asset.redevBuildingStdPriceAtAcq)
      : undefined,
    landPricePerSqmAtFirst: asset.redevLandPricePerSqmAtFirst
      ? parseAmount(asset.redevLandPricePerSqmAtFirst)
      : undefined,
    buildingStdPriceAtFirst: asset.redevBuildingStdPriceAtFirst
      ? parseAmount(asset.redevBuildingStdPriceAtFirst)
      : undefined,
    // 단일 라목값
    managementDisposalHousingPrice: asset.redevManagementDisposalHousingPrice
      ? parseAmount(asset.redevManagementDisposalHousingPrice)
      : undefined,
    acquisitionHousingPrice: asset.redevAcquisitionHousingPrice
      ? parseAmount(asset.redevAcquisitionHousingPrice)
      : undefined,
    // 사례 45 — 거주월수 분리 입력 (§155⑰ 통산 + 해석례 2020-386)
    // 빈문자열 → undefined (legacy fallback 의도 — 엔진에서 residencePeriodMonths 단일값 사용)
    priorHouseResidenceMonths: asset.redevPriorHouseResidenceMonths
      ? parseInt(asset.redevPriorHouseResidenceMonths.replace(/,/g, ""), 10)
      : undefined,
    newHouseResidenceMonths: asset.redevNewHouseResidenceMonths
      ? parseInt(asset.redevNewHouseResidenceMonths.replace(/,/g, ""), 10)
      : undefined,
    // 거주기간(입주일·퇴거일) — 결과 카드 산정 근거 표시용 pass-through
    priorResidenceStartDate: asset.redevPriorResidenceStartDate || undefined,
    priorResidenceEndDate: asset.redevPriorResidenceEndDate || undefined,
    newResidenceStartDate: asset.redevNewResidenceStartDate || undefined,
    newResidenceEndDate: asset.redevNewResidenceEndDate || undefined,
    // 사례 46 — 청산금 수령분 단독 신고 + 비과세 판정 시점 override
    receiveOnlyMode:
      asset.redevReceiveOnlyMode === "yes"
        ? true
        : asset.redevReceiveOnlyMode === "no"
          ? false
          : undefined,
    exemptionEligibleAtApproval:
      asset.redevExemptionEligibleAtApproval === "yes"
        ? true
        : asset.redevExemptionEligibleAtApproval === "no"
          ? false
          : undefined,
    // 사례 36 — 1세대1입주권 비과세 C-1 안전장치 (a) — 인가일 기준 종전주택 보유월수
    // UI 경고 카드(b) 자동 검증용. 엔진 계산에는 미사용 (비과세 판단 = exemptionEligibleAtApproval).
    priorHouseHoldingMonths:
      asset.redevPriorHouseHoldingMonths
        ? parseInt(asset.redevPriorHouseHoldingMonths.replace(/,/g, ""), 10) || undefined
        : undefined,
    // 사례 37 — 토지 출자 §166③ 환산 (subject="right" + originalAssetType="land")
    // 3중 패턴(UI/API/validate): LandPriceLookupField(단가×면적) 우선 > legacy 총액 직접 입력 fallback.
    // UI·validate와 동일 우선순위 — API layer 단독 변환 금지(silent stripping 차단).
    landStdPriceAtAcq: (() => {
      const landArea = parseDecimal(asset.redevLandArea) || 0;
      const pricePerSqmAcq = parseAmount(asset.redevLandPricePerSqmAtAcq) || 0;
      // 단가×면적 계산 우선 (land 분기 §166③ 분자)
      if (pricePerSqmAcq > 0 && landArea > 0) {
        return Math.floor(pricePerSqmAcq * landArea);
      }
      // legacy fallback: 총액 직접 입력 (redevLandStdPriceAtAcq @deprecated)
      const legacyAcq = asset.redevLandStdPriceAtAcq ? parseAmount(asset.redevLandStdPriceAtAcq) : 0;
      return legacyAcq > 0 ? legacyAcq : undefined;
    })(),
    landStdPriceAtApproval: (() => {
      const landArea = parseDecimal(asset.redevLandArea) || 0;
      const pricePerSqmApproval = parseAmount(asset.redevLandPricePerSqmAtApproval) || 0;
      // 단가×면적 계산 우선 (land 분기 §166③ 분모)
      if (pricePerSqmApproval > 0 && landArea > 0) {
        return Math.floor(pricePerSqmApproval * landArea);
      }
      // legacy fallback: 총액 직접 입력 (redevLandStdPriceAtApproval @deprecated)
      const legacyApproval = asset.redevLandStdPriceAtApproval ? parseAmount(asset.redevLandStdPriceAtApproval) : 0;
      return legacyApproval > 0 ? legacyApproval : undefined;
    })(),
    // 사례 48 — 승계조합원 신축APT 양도
    isSuccessorMember:
      asset.redevIsSuccessorMember === "yes"
        ? true
        : asset.redevIsSuccessorMember === "no"
          ? false
          : undefined,
    completionDate: asset.redevCompletionDate || undefined,
  };
}
