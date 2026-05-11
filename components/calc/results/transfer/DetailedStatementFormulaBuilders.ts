/**
 * 계산결과 상세명세서 — 자산별 산식 빌더 (사례 31·33 일반건물)
 *
 * 사용자가 자산별 펼침 행에서 "왜 이 값인가"를 직관적으로 검증할 수 있도록
 * 사용자 지정 형식의 산식 문자열을 생성:
 *   토지 양도가액 = 330,000,000 × 339,492,000 / (339,492,000+12,308,310+54,501,720)
 *                = 275,736,648
 *
 * 사례 분기:
 *  - 사례 31 (환산취득가, 증축 없음) — 2-way 양도가 안분 + 환산취득가 §176의2②
 *  - 사례 33 (일괄+증축) — 3-way 양도가 안분 + 토지·건물1 일괄 안분 + 건물2 환산
 *
 * 데이터 출처: result.generalBuildingValuationDetail (GeneralBuildingOutput).
 *  - landStdTotal·buildingStdTotal·extensionStdTotal (양도시 분모)
 *  - acqLandStdTotal·acqBuilding1StdTotal·acqExtensionStdTotal (취득시 분모)
 */

import type { GeneralBuildingOutput } from "@/lib/tax-engine/general-building-valuation";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// ── 포맷 헬퍼 ────────────────────────────────────────────────────

function fmt(n: number | undefined): string {
  if (n === undefined || !isFinite(n)) return "-";
  return n.toLocaleString("ko-KR");
}

/**
 * 표준 안분 산식 형식 빌더.
 *
 * @param totalValue   분자에 곱해지는 합계 (예: 양도가 330,000,000)
 * @param numerator    분자 (예: 토지 기준시가 339,492,000)
 * @param denomParts   분모 구성 부분 (예: [339,492,000, 12,308,310, 54,501,720])
 * @param resultValue  최종 결과값 (잔액 보정 반영)
 * @returns "330,000,000 × 339,492,000 / (339,492,000+12,308,310+54,501,720) = 275,736,648"
 */
export function buildAllocationFormula(
  totalValue: number,
  numerator: number,
  denomParts: number[],
  resultValue: number,
): string {
  const denomStr =
    denomParts.length === 1
      ? fmt(denomParts[0])
      : `(${denomParts.map(fmt).join("+")})`;
  return `${fmt(totalValue)} × ${fmt(numerator)} / ${denomStr} = ${fmt(resultValue)}`;
}

/** 잔액 보정 안내 — 다중 floor 오차를 잔액으로 흡수하는 마지막 카드 표기 */
export function buildResidualFormula(
  totalValue: number,
  prevSubtractions: { label: string; value: number }[],
  resultValue: number,
): string {
  const prevStr = prevSubtractions.map((p) => `${p.label} ${fmt(p.value)}`).join(" - ");
  return `${fmt(totalValue)} - ${prevStr} = ${fmt(resultValue)} (잔액 보정)`;
}

// ── 사례 분기 판정 ────────────────────────────────────────────────

/** 사례 33(증축 있음) 여부 — extensionStdTotal이 채워지면 true */
function isExtensionCase(gb: GeneralBuildingOutput | undefined): boolean {
  return !!gb?.extensionStdTotal && gb.extensionStdTotal > 0;
}

/** 사례 33 일괄 모드(원건물 실가) 여부 — asset의 일괄 취득가가 입력되어 있는가 */
function isBundledActualCase(asset: AssetForm | undefined): boolean {
  if (!asset) return false;
  // 사례 33 일괄 모드 신호: gbHasExtension + !useEstimatedAcquisition
  return !!asset.gbHasExtension && !asset.useEstimatedAcquisition;
}

// ── 양도가액 산식 (§166⑥ 안분) ───────────────────────────────────

/**
 * 양도가액 자산별 산식.
 *  - 사례 31: totalTransfer × landStd / (landStd + buildingStd)
 *  - 사례 33: totalTransfer × landStd / (landStd + buildingStd + extensionStd)
 */
export function buildGbTransferFormula(
  p: PerPropertyBreakdown,
  gb: GeneralBuildingOutput | undefined,
  totalTransferPrice: number,
): string | undefined {
  if (!gb || !gb.landStdTotal || !gb.buildingStdTotal) return undefined;

  const landStd = gb.landStdTotal;
  const buildingStd = gb.buildingStdTotal;
  const extStd = gb.extensionStdTotal ?? 0;
  const denomParts =
    isExtensionCase(gb) && extStd > 0
      ? [landStd, buildingStd, extStd]
      : [landStd, buildingStd];

  if (p.propertyId === "land" || p.propertyId === "land_business" || p.propertyId === "land_nbl") {
    return buildAllocationFormula(totalTransferPrice, landStd, denomParts, p.transferPrice);
  }
  if (p.propertyId === "building" || p.propertyId === "building1") {
    return buildAllocationFormula(totalTransferPrice, buildingStd, denomParts, p.transferPrice);
  }
  if (p.propertyId === "building2") {
    // 잔액 보정으로 산정됨 (사례 33)
    const land = denomParts.length >= 1 ? Math.floor((totalTransferPrice * landStd) / (landStd + buildingStd + extStd)) : 0;
    const b1 = Math.floor((totalTransferPrice * buildingStd) / (landStd + buildingStd + extStd));
    return buildResidualFormula(totalTransferPrice, [
      { label: "토지", value: land },
      { label: "건물(3001)", value: b1 },
    ], p.transferPrice);
  }
  return undefined;
}

// ── 취득가액 산식 ─────────────────────────────────────────────────

/**
 * 취득가액 자산별 산식.
 *  - 사례 31 (환산): allocation.land × acqLandStd / landStd  (§176의2②)
 *  - 사례 33 일괄(원건물 실가): bundledAcq × acqLandStd / (acqLandStd + acqBuilding1Std)
 *  - 사례 33 건물2 환산: building2Transfer × acqExtensionStd / extensionStd
 *
 * 사례 33에서 '일괄'·'환산' 분기는 asset.useEstimatedAcquisition + asset.gbHasExtension으로 판정.
 */
export function buildGbAcquisitionFormula(
  p: PerPropertyBreakdown,
  gb: GeneralBuildingOutput | undefined,
  asset: AssetForm | undefined,
): string | undefined {
  if (!gb) return undefined;

  // 자본적지출은 신고서 양식 표시 관행에 따라 취득가액에 합산되어 표시됨.
  // 산식은 안분 결과만 표기하고 자본적지출은 별도 메모 처리 (단순화).
  const displayValue = p.acquisitionPrice + p.capitalExpenditureForDisplay;

  // ── 사례 33 일괄+증축 (원건물 실가) ──────────────────────────
  if (isExtensionCase(gb) && isBundledActualCase(asset)) {
    const acqLandStd = gb.acqLandStdTotal;
    const acqB1Std = gb.acqBuilding1StdTotal;
    if (!acqLandStd || !acqB1Std) return undefined;

    if (p.propertyId === "land" || p.propertyId === "land_business" || p.propertyId === "land_nbl") {
      // 토지: bundledAcq × acqLandStd / (acqLandStd + acqB1Std) — 취득시 비율 안분
      const bundledAcq = displayValue + (gb.assetCards.find((c) => c.propertyId === "building1")?.acquisitionPrice ?? 0);
      return buildAllocationFormula(bundledAcq, acqLandStd, [acqLandStd, acqB1Std], p.acquisitionPrice);
    }
    if (p.propertyId === "building1") {
      const landAcqCard = gb.assetCards.find((c) =>
        c.propertyId === "land" || c.propertyId === "land_business" || c.propertyId === "land_nbl",
      );
      const bundledAcq = (landAcqCard?.acquisitionPrice ?? 0) + p.acquisitionPrice;
      return buildResidualFormula(bundledAcq, [
        { label: "토지", value: landAcqCard?.acquisitionPrice ?? 0 },
      ], p.acquisitionPrice);
    }
    if (p.propertyId === "building2") {
      const b2TransferCard = gb.assetCards.find((c) => c.propertyId === "building2");
      const b2Transfer = b2TransferCard?.transferPrice ?? p.transferPrice;
      const acqExtStd = gb.acqExtensionStdTotal;
      const extStd = gb.extensionStdTotal;
      if (!acqExtStd || !extStd) {
        // 실가 모드 — 직접 입력값
        return `사용자 직접 입력 (증축 실거래가) = ${fmt(p.acquisitionPrice)}`;
      }
      return buildAllocationFormula(b2Transfer, acqExtStd, [extStd], p.acquisitionPrice);
    }
  }

  // ── 사례 31 환산취득가 (또는 사례 33 환산 모드) ───────────────
  const landStd = gb.landStdTotal;
  const buildingStd = gb.buildingStdTotal;
  const acqLandStd = gb.acqLandStdTotal;
  const acqB1Std = gb.acqBuilding1StdTotal;

  if (!landStd || !buildingStd || !acqLandStd || !acqB1Std) return undefined;

  if (p.propertyId === "land" || p.propertyId === "land_business" || p.propertyId === "land_nbl") {
    return buildAllocationFormula(p.transferPrice, acqLandStd, [landStd], p.acquisitionPrice);
  }
  if (p.propertyId === "building" || p.propertyId === "building1") {
    return buildAllocationFormula(p.transferPrice, acqB1Std, [buildingStd], p.acquisitionPrice);
  }
  if (p.propertyId === "building2") {
    const acqExtStd = gb.acqExtensionStdTotal;
    const extStd = gb.extensionStdTotal;
    if (!acqExtStd || !extStd) {
      return `사용자 직접 입력 (증축 실거래가) = ${fmt(p.acquisitionPrice)}`;
    }
    return buildAllocationFormula(p.transferPrice, acqExtStd, [extStd], p.acquisitionPrice);
  }
  return undefined;
}

// ── 필요경비 산식 (개산공제 §163⑥) ─────────────────────────────────

/**
 * 필요경비 자산별 산식 — 개산공제 = 취득시 기준시가 × 3%.
 * 자본적지출은 신고서 양식 표시 관행에 따라 취득가액에 흡수되어 본 행에는 양도비만 남음.
 */
export function buildGbExpenseFormula(
  p: PerPropertyBreakdown,
  gb: GeneralBuildingOutput | undefined,
): string | undefined {
  if (!gb) return undefined;

  const displayExp = Math.max(0, p.necessaryExpense - p.capitalExpenditureForDisplay);

  if (p.propertyId === "land" || p.propertyId === "land_business" || p.propertyId === "land_nbl") {
    if (!gb.acqLandStdTotal) return undefined;
    return `취득시 토지기준시가 ${fmt(gb.acqLandStdTotal)} × 3% = ${fmt(displayExp)}`;
  }
  if (p.propertyId === "building" || p.propertyId === "building1") {
    if (!gb.acqBuilding1StdTotal) return undefined;
    return `취득시 건물기준시가 ${fmt(gb.acqBuilding1StdTotal)} × 3% = ${fmt(displayExp)}`;
  }
  if (p.propertyId === "building2") {
    if (!gb.acqExtensionStdTotal) {
      return `사용자 직접 입력 (증축 실제 필요경비) = ${fmt(displayExp)}`;
    }
    return `취득시 증축건물기준시가 ${fmt(gb.acqExtensionStdTotal)} × 3% = ${fmt(displayExp)}`;
  }
  return undefined;
}

// ── 단순 산식 (자산별 동일 산식) ──────────────────────────────────

/** 양도차익 = 양도가액 − 취득가액 − 필요경비 */
export function buildSubGainFormula(p: PerPropertyBreakdown): string {
  const displayAcq = p.acquisitionPrice + p.capitalExpenditureForDisplay;
  const displayExp = Math.max(0, p.necessaryExpense - p.capitalExpenditureForDisplay);
  return `${fmt(p.transferPrice)} - ${fmt(displayAcq)} - ${fmt(displayExp)} = ${fmt(p.transferGain)}`;
}

/** 과세대상 양도차익 = min(전체양도차익, max(0, income) + 장특공제) */
export function buildTaxableGainFormula(p: PerPropertyBreakdown): string {
  const tg = p.transferGain;
  const inc = Math.max(0, p.income);
  const lth = p.longTermHoldingDeduction;
  if (tg <= 0) return `차손 자산 — 양도차익 ${fmt(tg)} (음수)`;
  const sum = inc + lth;
  return `min(양도차익 ${fmt(tg)}, 양도소득금액 ${fmt(inc)} + 장특공제 ${fmt(lth)} = ${fmt(sum)}) = ${fmt(Math.min(tg, sum))}`;
}

/** 장특공제 = 과세대상양도차익 × 율 */
export function buildLthFormula(p: PerPropertyBreakdown): string {
  if (p.longTermHoldingDeduction === 0) {
    return p.transferGain <= 0 ? "차손 자산 — 장특공제 미적용" : "보유 3년 미만 또는 비적용 자산";
  }
  // 과세대상양도차익 추정 (다건은 정확값 노출 없음 — taxable = min(tg, income+lth))
  const tg = p.transferGain;
  const inc = Math.max(0, p.income);
  const lth = p.longTermHoldingDeduction;
  const taxable = tg > 0 ? Math.min(tg, inc + lth) : tg;
  if (taxable <= 0) return `장특공제 ${fmt(lth)}`;
  const ratePct = ((lth / taxable) * 100).toFixed(1).replace(/\.0$/, "");
  return `과세대상양도차익 ${fmt(taxable)} × ${ratePct}% = ${fmt(lth)}`;
}

/** 양도소득금액 = 과세대상양도차익 − 장특공제 (음수 가능 — 차손) */
export function buildIncomeFormula(p: PerPropertyBreakdown): string {
  const tg = p.transferGain;
  const inc = Math.max(0, p.income);
  const lth = p.longTermHoldingDeduction;
  const taxable = tg > 0 ? Math.min(tg, inc + lth) : tg;
  return `${fmt(taxable)} - ${fmt(lth)} = ${fmt(p.income)}`;
}

/** 산출세액(참고) = 그룹 과세표준 기여분 × (적용세율 + 중과세율) − 누진공제 */
export function buildCalculatedTaxFormula(p: PerPropertyBreakdown): string {
  const ratePct = ((p.appliedRate + (p.surchargeRate ?? 0)) * 100).toFixed(1).replace(/\.0$/, "");
  return `${fmt(p.taxBaseShare)} × ${ratePct}% - ${fmt(p.progressiveDeduction)} = ${fmt(p.refCalculatedTax)}`;
}

/** 결정세액 = 산출세액 − 감면 (자산별 참고값) */
export function buildDeterminedTaxFormula(p: PerPropertyBreakdown): string {
  if (p.reductionAggregated > 0) {
    return `${fmt(p.refCalculatedTax)} - ${fmt(p.reductionAggregated)} = ${fmt(p.refDeterminedTax)}`;
  }
  return `${fmt(p.refCalculatedTax)} (감면 없음)`;
}

/** 가산세액 = §114조의2 + 신고불성실·납부지연 */
export function buildPenaltyFormula(p: PerPropertyBreakdown): string {
  const parts: string[] = [];
  if (p.penaltyTax > 0) parts.push(`§114의2 ${fmt(p.penaltyTax)}`);
  if (p.filingDelayedPenaltyTax > 0) parts.push(`신고/납부지연 ${fmt(p.filingDelayedPenaltyTax)}`);
  if (parts.length === 0) return "가산세 없음";
  return `${parts.join(" + ")} = ${fmt(p.penaltyTax + p.filingDelayedPenaltyTax)}`;
}
