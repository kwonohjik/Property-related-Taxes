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

import { createElement, Fragment, type ReactNode } from "react";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import type { GeneralBuildingOutput } from "@/lib/tax-engine/general-building-valuation";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { baseCardId, isSameShare } from "@/lib/tax-engine/general-building-share-id";

/**
 * 엔진 §95③ 12억 초과 안분 STEP formula(문자열)를 Frac 분수 표기로 변환 (PR #746 표준).
 * 형식: "<차익> × (<라벨 분자> - 12억) / <라벨 분모>" — 미일치 시 원문 문자열 fallback.
 * .ts 파일이라 JSX 대신 createElement 사용.
 */
export function prorationFormulaAsFrac(formula: string): ReactNode {
  const m = formula.match(/^(.+?) × \((.+?)\) \/ (.+)$/);
  if (!m) return formula;
  return createElement(
    Fragment,
    null,
    `${m[1]} × `,
    createElement(Frac, { top: m[2], bottom: m[3] }),
  );
}

/**
 * propertyId가 토지에 해당하는지 — 일반건물(land/land_business/land_nbl) + 토지 자산.
 *
 * 🔴 **`baseCardId`를 반드시 통과시킨다.** 지분(%) 분할 카드는 `land#0` 꼴이라 정확 비교로는
 *    항상 false가 되어, 이 파일의 산식이 통째로 `undefined`를 돌려준다(= 화면에 산식이 안 뜬다).
 *    2026-08-10 실측 — 규약은 `lib/tax-engine/general-building-share-id.ts`.
 */
function isLandProp(propertyId: string): boolean {
  const id = baseCardId(propertyId);
  return id === "land" || id === "land_business" || id === "land_nbl";
}

/** propertyId가 원건물에 해당하는지 — 사례 31 `building` · 사례 33 `building1` */
function isBuildingProp(propertyId: string): boolean {
  const id = baseCardId(propertyId);
  return id === "building" || id === "building1";
}

/** 사례 33 증축분 건물 카드인지. */
function isBuilding1Prop(propertyId: string): boolean {
  return baseCardId(propertyId) === "building1";
}

/** 사례 33 증축분 건물 카드인지 (`building2`). */
function isBuilding2Prop(propertyId: string): boolean {
  return baseCardId(propertyId) === "building2";
}

/**
 * `gb.assetCards`에서 **같은 지분의** 짝 카드를 찾는다.
 *
 * 🔴 base id만 보고 찾으면 지분 0의 건물 카드가 지분 1의 토지 산식에 끌려 들어간다
 *    (일괄 실가 취득가 안분이 대표 사례 — 지분마다 `bundledAcquisitionPrice`가 다르다).
 */
function findSiblingCard(
  cards: { propertyId: string; acquisitionPrice: number; transferPrice: number }[],
  baseId: string,
  selfPropertyId: string,
) {
  return cards.find(
    (c) => baseCardId(c.propertyId) === baseId && isSameShare(c.propertyId, selfPropertyId),
  );
}

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
 *  - 그 외(사례 27·28·일반 다건): 자산별 직접 입력값 fallback
 */
export function buildGbTransferFormula(
  p: PerPropertyBreakdown,
  gb: GeneralBuildingOutput | undefined,
  totalTransferPrice: number,
  burdenedGift?: TransferBurdenedGiftBreakdown,
): string | undefined {
  // 부담부증여 §159①2호 분기 (우선 적용) — 자산별 양도가액 = 자산기준시가 × 채무액 / 양도시 보충적평가
  if (burdenedGift) {
    const asset = isLandProp(p.propertyId)
      ? burdenedGift.perAsset.land
      : isBuildingProp(p.propertyId)
        ? burdenedGift.perAsset.building
        : undefined;
    if (asset) {
      const debt = burdenedGift.assumedDebtAmount;
      const max = burdenedGift.sangjeungbeopValuation.max;
      // 양도가액 = 자산별 양도시 기준시가 × 채무액 / 양도시 보충적평가 (소령 §159①2호)
      return `양도가액 = 자산기준시가 × 채무액 / 양도시 보충적평가 (소령 §159①2호)\n        = ${fmt(asset.sangjeungbeopValue)} × ${fmt(debt)} / ${fmt(max)}\n        = ${fmt(p.transferPrice)}`;
    }
  }

  // 일반건물(사례 31·33) 분기 — gbDetail 존재 시 §166⑥ 안분 산식
  if (gb && gb.landStdTotal && gb.buildingStdTotal) {
    const landStd = gb.landStdTotal;
    const buildingStd = gb.buildingStdTotal;
    const extStd = gb.extensionStdTotal ?? 0;
    const denomParts =
      isExtensionCase(gb) && extStd > 0
        ? [landStd, buildingStd, extStd]
        : [landStd, buildingStd];

    if (isLandProp(p.propertyId)) {
      return buildAllocationFormula(totalTransferPrice, landStd, denomParts, p.transferPrice);
    }
    if (isBuildingProp(p.propertyId)) {
      return buildAllocationFormula(totalTransferPrice, buildingStd, denomParts, p.transferPrice);
    }
    if (isBuilding2Prop(p.propertyId)) {
      // 잔액 보정으로 산정됨 (사례 33)
      const land = denomParts.length >= 1 ? Math.floor((totalTransferPrice * landStd) / (landStd + buildingStd + extStd)) : 0;
      const b1 = Math.floor((totalTransferPrice * buildingStd) / (landStd + buildingStd + extStd));
      return buildResidualFormula(totalTransferPrice, [
        { label: "토지", value: land },
        { label: "건물(3001)", value: b1 },
      ], p.transferPrice);
    }
  }

  // 일반 다건(사례 27 분할취득·사례 28 일괄양도 등) fallback —
  // 자산별 양도가액은 사용자 입력 또는 엔진 안분 결과를 그대로 사용.
  // 안분 산식이 케이스별로 다양해 단순 입력값 표기로 통일 (검증 가능성 우선).
  return `자산별 입력 또는 엔진 산정 양도가액 = ${fmt(p.transferPrice)}`;
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
  burdenedGift?: TransferBurdenedGiftBreakdown,
): string | undefined {
  // 부담부증여 §159①1호 분기 (우선 적용) — 자산별 취득가액 = 취득시 자산기준시가 × 채무액 / 증여재산 평가액
  if (burdenedGift) {
    const bgAsset = isLandProp(p.propertyId)
      ? burdenedGift.perAsset.land
      : isBuildingProp(p.propertyId)
        ? burdenedGift.perAsset.building
        : undefined;
    if (bgAsset) {
      const debt = burdenedGift.assumedDebtAmount;
      const giftMax = burdenedGift.giftValuation.max;
      return `취득가액 = 취득시 자산기준시가 × 채무액 / 증여재산 평가액 (소령 §159①1호 단서 — 기준시가 모드 환산)\n        = ${fmt(bgAsset.stdPriceAtAcquisition)} × ${fmt(debt)} / ${fmt(giftMax)}\n        = ${fmt(p.acquisitionPrice)}`;
    }
  }

  // gbDetail 없는 일반 다건(사례 27·28 등) fallback — 자본적지출 합산 산식 표기
  if (!gb) {
    if (p.capitalExpenditureForDisplay > 0) {
      return `취득가액 ${fmt(p.acquisitionPrice)} + 자본적지출 ${fmt(p.capitalExpenditureForDisplay)} = ${fmt(p.acquisitionPrice + p.capitalExpenditureForDisplay)} (신고서 양식: 자본적지출 §97① 가목 합산 표시)`;
    }
    return `자산별 취득가액 = ${fmt(p.acquisitionPrice)}`;
  }

  // 자본적지출은 신고서 양식 표시 관행에 따라 취득가액에 합산되어 표시됨.
  // 산식은 안분 결과만 표기하고 자본적지출은 별도 메모 처리 (단순화).
  const displayValue = p.acquisitionPrice + p.capitalExpenditureForDisplay;

  // ── 실가 모드 분기 (사례 35 등 — 환산취득가 미사용, 일괄 실가 안분) ──
  // bundledActualAcquisitionPrice가 채워져 있으면 실가 모드.
  // §166⑥ 양도시 기준시가 비율로 일괄 취득가액 안분 → 토지·건물별 취득가.
  if (
    gb.bundledActualAcquisitionPrice !== undefined &&
    !gb.extensionStdTotal &&
    !gb.acqExtensionStdTotal &&
    !asset?.useEstimatedAcquisition
  ) {
    const bundledAcq = gb.bundledActualAcquisitionPrice;
    const landStd = gb.landStdTotal;
    const buildingStd = gb.buildingStdTotal;
    if (landStd && buildingStd) {
      if (isLandProp(p.propertyId)) {
        // 토지 취득가 = 일괄 실가 × 양도시 토지기준시가 / (토지+건물 기준시가)
        return buildAllocationFormula(bundledAcq, landStd, [landStd, buildingStd], p.acquisitionPrice);
      }
      if (isBuildingProp(p.propertyId)) {
        const landAcq = bundledAcq - p.acquisitionPrice;
        return buildResidualFormula(bundledAcq, [
          { label: "토지", value: landAcq },
        ], p.acquisitionPrice);
      }
    }
  }

  // ── 사례 33 일괄+증축 (원건물 실가) ──────────────────────────
  if (isExtensionCase(gb) && isBundledActualCase(asset)) {
    const acqLandStd = gb.acqLandStdTotal;
    const acqB1Std = gb.acqBuilding1StdTotal;
    if (!acqLandStd || !acqB1Std) return undefined;

    if (isLandProp(p.propertyId)) {
      // 토지: bundledAcq × acqLandStd / (acqLandStd + acqB1Std) — 취득시 비율 안분
      // 짝 카드는 **같은 지분**에서 찾는다 — 지분마다 일괄 취득가가 다르다.
      const bundledAcq =
        displayValue +
        (findSiblingCard(gb.assetCards, "building1", p.propertyId)?.acquisitionPrice ?? 0);
      return buildAllocationFormula(bundledAcq, acqLandStd, [acqLandStd, acqB1Std], p.acquisitionPrice);
    }
    if (isBuilding1Prop(p.propertyId)) {
      const landAcqCard = gb.assetCards.find(
        (c) => isLandProp(c.propertyId) && isSameShare(c.propertyId, p.propertyId),
      );
      const bundledAcq = (landAcqCard?.acquisitionPrice ?? 0) + p.acquisitionPrice;
      return buildResidualFormula(bundledAcq, [
        { label: "토지", value: landAcqCard?.acquisitionPrice ?? 0 },
      ], p.acquisitionPrice);
    }
    if (isBuilding2Prop(p.propertyId)) {
      const b2TransferCard = findSiblingCard(gb.assetCards, "building2", p.propertyId);
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

  if (isLandProp(p.propertyId)) {
    return buildAllocationFormula(p.transferPrice, acqLandStd, [landStd], p.acquisitionPrice);
  }
  if (isBuildingProp(p.propertyId)) {
    return buildAllocationFormula(p.transferPrice, acqB1Std, [buildingStd], p.acquisitionPrice);
  }
  if (isBuilding2Prop(p.propertyId)) {
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
  burdenedGift?: TransferBurdenedGiftBreakdown,
): string | undefined {
  // 부담부증여 §163⑥ 분기 — 자산별 개산공제 = 안분 취득가액 × 3%
  if (burdenedGift) {
    const bgAsset = isLandProp(p.propertyId)
      ? burdenedGift.perAsset.land
      : isBuildingProp(p.propertyId)
        ? burdenedGift.perAsset.building
        : undefined;
    if (bgAsset) {
      return `필요경비 = 안분 취득가액 × 3% (개산공제, 소령 §163⑥)\n        = ${fmt(bgAsset.acquisitionPrice)} × 0.03\n        = ${fmt(bgAsset.estimatedDeduction)}`;
    }
  }

  const displayExp = Math.max(0, p.necessaryExpense - p.capitalExpenditureForDisplay);

  // gbDetail 없는 일반 다건(사례 27·28 등) fallback — 양도비만 표기
  if (!gb) {
    if (p.capitalExpenditureForDisplay > 0) {
      return `필요경비 ${fmt(p.necessaryExpense)} − 자본적지출 ${fmt(p.capitalExpenditureForDisplay)}(취득가액 흡수) = 양도비 ${fmt(displayExp)}`;
    }
    return `자산별 양도비 합계 = ${fmt(displayExp)} (§97① 나목)`;
  }

  // ── 실가 모드 분기 (사례 35 등) — §166⑥ 양도가 비율로 일괄 실가 양도비 안분 ──
  const isActualBundledMode =
    gb.bundledActualAcquisitionPrice !== undefined &&
    !gb.extensionStdTotal &&
    !gb.acqExtensionStdTotal;
  if (isActualBundledMode) {
    const totalExp = gb.bundledActualExpenses ?? 0;
    if (totalExp <= 0 && displayExp <= 0) {
      return `자산별 양도비 = 0 (입력 없음)`;
    }
    if (isLandProp(p.propertyId)) {
      const landStd = gb.landStdTotal;
      const buildingStd = gb.buildingStdTotal;
      if (landStd && buildingStd) {
        return buildAllocationFormula(totalExp, landStd, [landStd, buildingStd], displayExp);
      }
    }
    if (isBuildingProp(p.propertyId)) {
      return buildResidualFormula(totalExp, [
        { label: "토지", value: totalExp - displayExp },
      ], displayExp);
    }
    return `자산별 양도비 = ${fmt(displayExp)}`;
  }

  if (isLandProp(p.propertyId)) {
    if (!gb.acqLandStdTotal) return undefined;
    // base는 엔진 echo(지분 기준시가) 우선 — 100% 값을 쓰면 지분 자산에서 산식이 값을 못 만든다.
    return `취득시 토지기준시가 ${fmt(gb.estimatedDeduction?.landBase ?? gb.acqLandStdTotal)} × 3% = ${fmt(displayExp)}`;
  }
  if (isBuildingProp(p.propertyId)) {
    if (!gb.acqBuilding1StdTotal) return undefined;
    return `취득시 건물기준시가 ${fmt(gb.estimatedDeduction?.buildingBase ?? gb.acqBuilding1StdTotal)} × 3% = ${fmt(displayExp)}`;
  }
  if (isBuilding2Prop(p.propertyId)) {
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

// ── 다건 합산 절차 항목 빌더 (다건 모드 전용) ─────────────────────────

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { StatementItem } from "./DetailedStatementHelpers";
import { findStepByLabel } from "./DetailedStatementHelpers";
import { incomeDeductionRuralSurtax } from "./reduction-eligible-income";

/**
 * 다건 합산 절차 3개 항목(차손통산·기본공제 배분·비교과세)을 Map에 추가.
 *
 * 단건 모드에서는 result.steps에 해당 step이 없으므로 Map.set 자체를 건너뜀
 * → STATEMENT_GROUPS의 'aggregate' 그룹이 빈 itemKeys로 자동 미렌더.
 *
 * 데이터 출처: aggregate.aggregated.steps[] (transfer-tax-aggregate.ts:148/173/216)
 *  - "양도차손 통산 (§102② · 시행령 §167의2)"
 *  - "기본공제"
 *  - "비교과세 (§104⑤)"
 */
export function setAggregateProcedureItems(
  items: Map<string, StatementItem>,
  result: TransferTaxResult,
): void {
  const lossOffsetStep = findStepByLabel(result.steps, "양도차손 통산");
  if (lossOffsetStep) {
    items.set("lossOffset", {
      label: "양도차손 통산",
      value: lossOffsetStep.amount,
      formula:
        lossOffsetStep.formula ??
        "그룹 내 통산 + 타군 pro-rata 안분 (잔여 차손 소멸, 이월 불인정)",
      legalBasis: lossOffsetStep.legalBasis ?? "소득세법 §102② · 시행령 §167의2",
      note: "다건 양도 시 자산별 차손을 다른 자산의 차익과 통산. 잔여 차손은 이월 불인정.",
      summaryOnly: true,
    });
  }

  const basicAggregateStep = findStepByLabel(result.steps, "기본공제");
  if (basicAggregateStep) {
    items.set("basicDeductionAggregate", {
      label: "기본공제 배분 (다건)",
      value: basicAggregateStep.amount,
      formula:
        basicAggregateStep.formula ??
        "연 250만원 한도 자산별 배분 (MAX_BENEFIT 정책 — 세부담 최소 자산 우선)",
      legalBasis: basicAggregateStep.legalBasis ?? "소득세법 §103",
      note: "유자격 자산(미등기·exempt 제외) 간 한도 배분. 단일 자산은 전액 배정.",
      summaryOnly: true,
    });
  }

  const comparedStep = findStepByLabel(result.steps, "비교과세");
  if (comparedStep) {
    items.set("comparedTaxation", {
      label: "비교과세 (§104⑤)",
      value: comparedStep.amount,
      formula:
        comparedStep.formula ??
        "MAX(세율군별 합산세액, 전체누진세액) — 중과·단기 세율군 존재 시만",
      legalBasis: comparedStep.legalBasis ?? "소득세법 §104⑤",
      note: "다주택 중과·비사업용토지·단기보유 자산 포함 시 자동 활성화. 두 방법 중 큰 세액 적용.",
      summaryOnly: true,
    });
  }
}

/**
 * 7단계 부가세·지방세 4개 항목(농특세·지방소득세 산출/감면/결정)을 Map에 추가.
 * 자기완결 — items·result·totalPenalty만 사용(단건·다건 공통).
 */
export function buildSurtaxAndLocalTaxItems(
  items: Map<string, StatementItem>,
  result: TransferTaxResult,
  totalPenalty: number,
): void {
  const ruralSurtaxValue = incomeDeductionRuralSurtax(result);
  items.set("ruralSurtax", {
    label: "농어촌특별세",
    value: ruralSurtaxValue,
    formula: `(감면 전 산출세액 − 감면 후 산출세액) × 20% = ${ruralSurtaxValue.toLocaleString()} (§99의3·§99·§98의8 등 소득금액차감 감면 적용 시)`,
    legalBasis: "농어촌특별세법 §3·§5",
    summaryOnly: true,
  });

  const localCalc = Math.floor((result.determinedTax + totalPenalty) * 0.1);
  items.set("localCalculatedTax", {
    label: "지방소득세 산출세액",
    value: localCalc,
    formula: `(결정세액 ${result.determinedTax.toLocaleString()} + 가산세 ${totalPenalty.toLocaleString()}) × 10%`,
    legalBasis: "지방세법 §103의3",
    summaryOnly: true,
  });
  items.set("localReduction", {
    label: "지방세 감면세액",
    value: 0,
    formula: "현재 미구현 (지방세 감면 정책 미반영)",
    legalBasis: "지방세법 §92~§103",
    summaryOnly: true,
  });
  items.set("localDeterminedTax", {
    label: "지방세 결정세액",
    value: result.localIncomeTax,
    formula: `지방소득세 산출세액 ${localCalc.toLocaleString()} − 지방세 감면세액 0 = ${result.localIncomeTax.toLocaleString()} (원 미만 절사)`,
    legalBasis: "지방세법 §103",
    summaryOnly: true,
  });
}

/**
 * §99의3 소득금액 감면대상(§90② 소득금액차감) 산식 — 실제 변수값 인라인 + 분수 Frac 표기(PR #746 표준).
 * 5년 이내 = 전액 차감 / 5년 후 = 양도소득금액 × (5년시점−취득) ÷ (양도−취득) 안분.
 * 부호 케이스(양도시 기준시가 하락 등)로 전액·0 감면인 경우는 Frac 대신 서술.
 */
export function buildNew993ReducibleFormula(
  detail: NonNullable<TransferTaxResult["new993Detail"]>,
  income: number,
): ReactNode {
  const reducible = detail.reducibleTransferIncome;
  const base = detail.transferIncomeApplied ?? income;
  // 5년 이내 양도 — 양도소득금액 전액 차감
  if (detail.isWithin5Years) {
    return `양도소득금액 ${base.toLocaleString()} 전액 차감 (취득 후 5년 이내 양도 — 조특법 §99의3)`;
  }
  if (reducible <= 0) {
    return "감면 대상 없음 (5년시점·양도시 기준시가 부호 조건 미충족 — 재산 2014-2035)";
  }
  const acq = detail.standardPriceAtAcquisition;
  const y5 = detail.standardPriceAt5Years;
  const tr = detail.standardPriceAtTransfer;
  if (acq == null || y5 == null || tr == null) {
    return `양도소득금액 ${base.toLocaleString()} × 5년 안분비율 = ${reducible.toLocaleString()} (§99의3 §90② 소득금액차감)`;
  }
  // 전액 감면(양도시 기준시가 하락 등) — 분수 표기 부적합
  if (reducible >= base) {
    return `양도소득금액 ${base.toLocaleString()} 전액 감면 (양도시 기준시가가 5년시점 이하 — 조특법 §99의3)`;
  }
  const numerator = y5 - acq;
  const denominator = tr - acq;
  return createElement(
    Fragment,
    null,
    `양도소득금액 ${base.toLocaleString()} × `,
    createElement(Frac, {
      top: `5년시점 기준시가 ${y5.toLocaleString()} − 취득시 ${acq.toLocaleString()} = ${numerator.toLocaleString()}`,
      bottom: `양도시 기준시가 ${tr.toLocaleString()} − 취득시 ${acq.toLocaleString()} = ${denominator.toLocaleString()}`,
    }),
    ` = ${reducible.toLocaleString()} (§99의3 §90② 소득금액차감)`,
  );
}

/**
 * 취득가액 산식 — 단건은 실제 변수값(양도차익 항목과 동일 표기), 다건은 자산별 합계 요약.
 * 환산취득가 모드는 기준시가 비율식까지 풀어쓰되, 기준시가 echo가 없는
 * 감정가액·매매사례가액 모드는 추계 취득가액만 표시(비율식 부적용).
 */
export function buildAcquisitionPriceFormula(
  result: TransferTaxResult,
  isAggregate: boolean,
  totalTransferPrice: number,
  singleAcq: number,
  capEx: number,
): ReactNode {
  const capExStr = capEx > 0 ? ` + 자본적지출 ${capEx.toLocaleString()}` : "";
  // 환산취득가 = 양도가액 × (취득시 기준시가 ÷ 양도시 기준시가) — 분수를 Frac로 표기 (PR #746 표준).
  const estFrac = (prefix: string, stdAcq: number, stdTransfer: number, suffix: string): ReactNode =>
    createElement(
      Fragment,
      null,
      prefix,
      createElement(Frac, {
        top: `취득시 기준시가 ${stdAcq.toLocaleString()}`,
        bottom: `양도시 기준시가 ${stdTransfer.toLocaleString()}`,
      }),
      suffix,
    );
  if (isAggregate) {
    return result.usedEstimatedAcquisition
      ? "자산별 환산취득가 합계 — 시행령 §163·§176의2②"
      : "자산별 실제 거래가액 합계 (자본적지출 §97① 가목 합산)";
  }
  // 배우자등 이월과세 Scenario A 채택 — 증여자 취득 당시 취득가액 승계 (§97의2①).
  // 환산+증여세 경로에서는 엔진이 실가로 전환하므로 result.usedEstimatedAcquisition만으로는
  // 환산 여부를 알 수 없어 scenarioA echo를 사용한다.
  const coA = result.carryoverTaxationDetail;
  if (coA?.adoptedScenario === "A") {
    const a = coA.scenarioA;
    const donorCapexNote =
      a.donorCapexAddedToExpense > 0
        ? ` (증여자 자본적지출 ${a.donorCapexAddedToExpense.toLocaleString()} 포함 §97의2①2호)`
        : "";
    if (a.acquisitionWasEstimated) {
      const stdAcq = a.estimatedStdPriceAtAcquisition;
      const stdTransfer = a.estimatedStdPriceAtTransfer;
      return stdAcq != null && stdTransfer != null
        ? estFrac(
            `증여자 취득 당시 환산취득가 ${fmt(a.acquisitionPrice)} = 양도가액 ${totalTransferPrice.toLocaleString()} × `,
            stdAcq,
            stdTransfer,
            `${capExStr}${donorCapexNote} — 이월과세 §97의2① (증여자 취득가액 승계·시행령 §163⑨)`,
          )
        : `증여자 취득 당시 환산취득가 ${fmt(a.acquisitionPrice)}${capExStr}${donorCapexNote} — 이월과세 §97의2① (증여자 취득가액 승계·환산)`;
    }
    return `증여자 취득 당시 취득가액 ${fmt(a.acquisitionPrice)}${capExStr}${donorCapexNote} — 이월과세 §97의2① (증여자 취득가액 승계)`;
  }
  if (result.usedEstimatedAcquisition) {
    const estBase = (result.estimatedBase ?? 0).toLocaleString();
    const stdAcq = result.estimatedStdPriceAtAcquisition;
    const stdTransfer = result.estimatedStdPriceAtTransfer;
    return stdAcq != null && stdTransfer != null
      ? estFrac(
          `환산취득가 ${estBase} = 양도가액 ${totalTransferPrice.toLocaleString()} × `,
          stdAcq,
          stdTransfer,
          `${capExStr} — 시행령 §163·§176의2②`,
        )
      : `취득가액(추계) ${estBase}${capExStr} — 소득세법 §97 / 시행령 §163·§176의2`;
  }
  return `취득가액 ${(singleAcq - capEx).toLocaleString()}${capExStr} (실제 거래가액)`;
}

/**
 * 필요경비 산식 — 단건은 실제 변수값. 환산모드 본문은 개산공제(취득시 기준시가 × 3%),
 * §97② 단서 swap 시 직접경비(양도비), 실거래는 양도비 합계.
 */
export function buildNecessaryExpenseFormula(
  result: TransferTaxResult,
  isAggregate: boolean,
  singleExp: number,
): string {
  if (isAggregate) {
    return result.usedEstimatedAcquisition
      ? "자산별 개산공제·양도비 합계 — §97① 나목·시행령 §163⑥"
      : "자산별 양도비 합계 (중개수수료·법무사 비용 등) — §97① 나목";
  }
  // 배우자등 이월과세 Scenario A 채택 — 필요경비 = 양도비 등 + 증여세 상당액(§163의2).
  // singleExp = result.expenses − capEx = (양도비 등) + 증여세 상당액 (실가 전환 후 directSide 반영).
  const coA = result.carryoverTaxationDetail;
  if (coA?.adoptedScenario === "A") {
    const a = coA.scenarioA;
    const gift = a.giftTaxAddedToExpense;
    const baseExp = Math.max(0, singleExp - gift);
    // 증여자 취득이 환산(estimated) 모드면 본문 필요경비는 실제 양도비가 아니라
    // 개산공제(취득시 기준시가 × 3%, 시행령 §163⑥)다.
    //
    // ⚠️ 종전에는 **금액 자기일치**(`baseExp === floor(기준시가 × 3%)`)로 이를 역추론했다.
    //    UI가 §163⑥ 산식을 재구현하는 dual-truth였고, 공유지분 축소처럼 등식이 깨지는 변경이
    //    들어오면 개산공제를 "양도비 등"으로 **성격 자체를 오표시**한다.
    //    → 엔진 echo(`necessaryExpenseIsLumpDeduction`)로 판정하고, 산식 base도
    //      엔진이 실제로 쓴 값(`lumpDeductionBase` = 지분 기준시가)을 노출한다.
    const stdAcq = a.estimatedStdPriceAtAcquisition;
    const lumpBase = a.lumpDeductionBase ?? stdAcq;
    const isLumpDeduction = a.necessaryExpenseIsLumpDeduction === true && lumpBase != null;
    const baseLabel = isLumpDeduction
      ? `개산공제 ${baseExp.toLocaleString()} = 취득시 기준시가 ${lumpBase!.toLocaleString()} × 3% — 시행령 §163⑥`
      : `양도비 등 ${baseExp.toLocaleString()} (중개수수료·법무사 비용 등) — §97① 나목`;
    const parts: string[] = [baseLabel];
    if (gift > 0) {
      const limitNote = a.giftTaxLimitApplied
        ? ` (한도 ${a.giftTaxLimitCap.toLocaleString()} = 증여세 가산 전 양도차익 적용)`
        : "";
      parts.push(`증여세 상당액 ${gift.toLocaleString()}${limitNote} — 이월과세 §97의2①3호·시행령 §163의2②`);
    }
    const guardNote = a.donorCapexGuardApplied
      ? " ※ 양도일 2024-01-01 전 — 증여자 자본적지출 불산입(§97의2①2호 시행일)"
      : "";
    const body = parts.length > 1 ? `${parts.join(" + ")} = ${fmt(singleExp)}` : parts[0];
    return body + guardNote;
  }
  if (result.usedEstimatedAcquisition) {
    if (result.swapApplied) {
      return `양도비 ${singleExp.toLocaleString()} (§97② 단서 적용 — 자본적지출은 취득가액에 합산 표시)`;
    }
    const ded = (result.estimatedDeduction ?? 0).toLocaleString();
    const stdAcq = result.estimatedStdPriceAtAcquisition;
    return stdAcq != null
      ? `개산공제 ${ded} = 취득시 기준시가 ${stdAcq.toLocaleString()} × 3% — 소득세법 §97① 나목·시행령 §163⑥`
      : `개산공제 ${ded} (취득시 기준시가 × 3%) — §97① 나목·시행령 §163⑥`;
  }
  return `양도비 ${singleExp.toLocaleString()} (중개수수료·법무사 비용 등) — §97① 나목`;
}
