/**
 * 재개발/재건축 (시행령 §166) — Validation helper.
 *
 * transfer-tax-validate.ts 분리 — 800줄 정책.
 *
 * 검증 항목:
 *  - 분기 결정 ToggleCard (subject·approvalLawBasis·originalAssetType·settlementDirection)
 *  - 일정·금액 (approvalDate·rightsValue·preApprovalExpenses)
 *  - 인가일 ≥ 취득일 (승계조합원 인가 후 취득은 후속 PR 차단)
 *  - 청산금 수령 시 settlementSaleDate 필수 (NTS 집행기준 + §95④)
 *  - 환산 모드 (useEstimatedAcquisition=true) 시 acquisitionStdPrice + managementDisposalStdPrice 필수
 *  - §164⑦ 단서 — 최초공시일 입력 시 최초고시 기준시가 동반 필수
 *  - §164⑦ 단서 차단 — 취득일 < 최초공시일이면 firstDisclosureStdPrice 필수
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export function validateRedevelopmentAsset(asset: AssetForm, label: string): string | null {
  // ── 분기 결정 필드 ──
  // UI display fallback과 동일(RedevelopmentBlock.tsx):
  //   redevSubject || "apt", redevApprovalLawBasis || "urban_renovation_art_74",
  //   redevOriginalAssetType || "housing", redevSettlementDirection || "pay"
  // UI 통과 ↔ validate 차단 모순 방지(8지점 ⑧).
  const subject = asset.redevSubject || "apt";
  const approvalLawBasis = asset.redevApprovalLawBasis || "urban_renovation_art_74";
  const originalAssetType = asset.redevOriginalAssetType || "housing";
  const settlementDirection = asset.redevSettlementDirection || "pay";

  // 본 PR 미지원 분기는 명시 입력만 차단(라디오에서 disabled로 선택 불가지만 안전망).
  if (subject !== "apt") {
    return `${label}: 양도 대상은 본 PR에서 "완공 APT 양도"만 지원합니다. (입주권 양도는 후속 PR)`;
  }
  if (approvalLawBasis !== "urban_renovation_art_74") {
    return `${label}: 인가 법령 근거는 본 PR에서 "도정법 §74"만 지원합니다. (빈집소규모법 §29는 후속 PR)`;
  }
  if (originalAssetType !== "housing") {
    return `${label}: 출자 자산은 본 PR에서 "주택 출자"만 지원합니다. (토지 출자는 후속 PR)`;
  }
  if (settlementDirection !== "pay") {
    return `${label}: 청산금 방향은 본 PR에서 "납부"만 지원합니다. (수령은 후속 PR)`;
  }

  // ── 일정 ──
  if (!asset.redevApprovalDate) {
    return `${label}: 관리처분/사업시행계획 인가일을 입력하세요.`;
  }
  // 인가일 ≥ 취득일 (승계조합원 인가 후 취득은 본 PR 미지원)
  if (asset.acquisitionDate && new Date(asset.redevApprovalDate) < new Date(asset.acquisitionDate)) {
    return `${label}: 인가일은 취득일 이후여야 합니다. (승계조합원 인가 후 취득은 후속 지원 예정)`;
  }

  // ── 금액 ──
  if (parseAmount(asset.redevRightsValue) <= 0) {
    return `${label}: 권리가액을 입력하세요. (시행령 §166④ 평가액 — 관리처분 가격이 없는 경우는 후속 PR)`;
  }
  if (parseAmount(asset.redevSettlementAmount) < 0) {
    return `${label}: 청산금 금액을 입력하세요. (없으면 0)`;
  }
  if (parseAmount(asset.redevPreApprovalExpenses) < 0) {
    return `${label}: 인가전 분 필요경비를 입력하세요. (없으면 0)`;
  }

  // ── 청산금 수령 시 settlementSaleDate 필수 ──
  if (asset.redevSettlementDirection === "receive" && !asset.redevSettlementSaleDate) {
    return `${label}: 청산금 수령 시 소유권이전 고시일의 다음날을 입력하세요. (NTS 집행기준 + 소법 §95④)`;
  }

  // ── 실가 모드 검증 — 인가전 분 종전 주택 취득가액(실거래가) 필수 ──
  // 환산 모드(useEstimatedAcquisition=true) 시 비활성. §166①1호 인가전 분 차감 기준.
  if (!asset.useEstimatedAcquisition) {
    if (parseAmount(asset.redevActualAcquisitionPrice) <= 0) {
      return `${label}: 실가 모드 — 인가전 분 종전 주택 취득가액(실거래가)을 입력하세요. 취득가액 확인 불가 시 환산취득가 토글을 ON으로 전환하세요. (§166①1호)`;
    }
  }

  // ── 환산 모드 검증 — D(관리처분 라목값) 필수 ──
  if (asset.useEstimatedAcquisition) {
    if (parseAmount(asset.redevManagementDisposalHousingPrice) <= 0) {
      return `${label}: 환산 모드 — D(관리처분 인가일 개별주택공시가격)를 입력하세요. (시행령 §166③ 분모)`;
    }
  }

  // ── §164⑦ 본문 발동 트리거 여부 ──
  const isPreDisclosureTriggered =
    !!asset.useEstimatedAcquisition &&
    !!asset.redevFirstDisclosureDate &&
    !!asset.acquisitionDate &&
    new Date(asset.acquisitionDate) < new Date(asset.redevFirstDisclosureDate);

  if (isPreDisclosureTriggered) {
    // 본문 발동 — PHD 패턴 7필드 모두 필수
    if (parseAmount(asset.redevFirstDisclosureHousingPrice) <= 0) {
      return `${label}: §164⑦ 본문 — A(최초공시 주택가격) 입력 필수입니다.`;
    }
    const area = parseFloat((asset.redevLandArea || "").replace(/,/g, ""));
    if (!isFinite(area) || area <= 0) {
      return `${label}: §164⑦ 본문 — 토지면적(㎡) 입력 필수입니다.`;
    }
    if (parseAmount(asset.redevLandPricePerSqmAtAcq) <= 0) {
      return `${label}: §164⑦ 본문 — 취득시 토지 ㎡당 단가(공시지가 조회) 입력 필수입니다.`;
    }
    if (parseAmount(asset.redevBuildingStdPriceAtAcq) < 0) {
      return `${label}: §164⑦ 본문 — 취득시 건물 기준시가 입력 필수입니다.`;
    }
    if (parseAmount(asset.redevLandPricePerSqmAtFirst) <= 0) {
      return `${label}: §164⑦ 본문 — 최초공시 당시 토지 ㎡당 단가 입력 필수입니다.`;
    }
    if (parseAmount(asset.redevBuildingStdPriceAtFirst) < 0) {
      return `${label}: §164⑦ 본문 — 최초공시 당시 건물 기준시가 입력 필수입니다.`;
    }
  } else if (asset.useEstimatedAcquisition) {
    // 본문 미발동 — 취득당시 라목값 단일 필수
    if (parseAmount(asset.redevAcquisitionHousingPrice) <= 0) {
      return `${label}: 환산 모드 — 취득당시 개별주택공시가격을 입력하세요. (취득일 ≥ 최초공시일 또는 최초공시일 미입력)`;
    }
  }

  // ── 부분 입력 차단 — 최초공시일 없이 A·PHD 단가 입력 시 모순 안내 ──
  const hasFirstDisclosureDate = !!asset.redevFirstDisclosureDate;
  const hasA = parseAmount(asset.redevFirstDisclosureHousingPrice) > 0;
  const hasAnyPhd =
    parseAmount(asset.redevLandPricePerSqmAtAcq) > 0 ||
    parseAmount(asset.redevLandPricePerSqmAtFirst) > 0;
  if ((hasA || hasAnyPhd) && !hasFirstDisclosureDate) {
    return `${label}: A 또는 PHD 단가를 입력하셨다면 최초공시일도 입력하세요. (§164⑦ 본문 트리거)`;
  }

  return null;
}
