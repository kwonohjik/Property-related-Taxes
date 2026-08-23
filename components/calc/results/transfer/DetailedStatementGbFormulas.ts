/**
 * 계산결과 상세명세서 — **일반건물(GB) 파트별** 산식 빌더.
 *
 * `DetailedStatementFormulaBuilders.ts`에서 분리 (800줄 정책, 2026-08-23 — 759 → 795로
 * 위험구간 진입). 이 파일의 관심사는 **토지·건물·증축 파트로 갈린 자산의 산식** 하나다.
 * 단건·공통 산식(양도차익·장특·세액 등)은 원 파일에 남는다.
 *
 * 공용 프리미티브(`fmt`·`buildAllocationFormula`·`buildResidualFormula`)도 여기 둔다 —
 * 원 파일이 이쪽을 import 하는 **단방향** 의존이라 순환이 생기지 않는다.
 *
 * 데이터 출처: `result.generalBuildingValuationDetail` (GeneralBuildingOutput).
 */

import type { GeneralBuildingOutput } from "@/lib/tax-engine/general-building-valuation";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { baseCardId, isSameShare } from "@/lib/tax-engine/general-building-share-id";

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

export function fmt(n: number | undefined): string {
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

  /**
   * 🔴 **배우자등 이월과세 시나리오 A 채택 — 환산 산식을 그리면 거짓 등식이 된다.**
   *
   * `p.acquisitionPrice`는 A-9(`ceafe4b1`) 이후 **채택된 시나리오의 취득가액**이다.
   * 그런데 아래 환산 분기는 `양도가액 × 취득시기준시가 ÷ 양도시기준시가 = p.acquisitionPrice`를
   * 인쇄하는데, 좌변은 §97의2①이 승계시킨 증여자 취득가액을 **유도하지 않는다**.
   *
   * 실측: `500,000,000 × 100,000,000 / 200,000,000 = 150,000,000` — 좌변 실계산 250,000,000,
   * **차이 100,000,000**. 환산·실가 두 모드 모두 어긋났다(이월과세면 항상).
   *
   * 단건 경로(`buildAcquisitionPriceFormula`)는 같은 분기를 **이미 갖고 있다** —
   * GB 파트별 경로에만 없어서 화면이 갈렸다.
   */
  const coA = p.carryoverTaxationDetail;
  if (coA?.adoptedScenario === "A") {
    const a = coA.scenarioA;
    const capexNote =
      a.donorCapexAddedToExpense > 0
        ? ` (증여자 자본적지출 ${fmt(a.donorCapexAddedToExpense)} 포함 §97의2①2호)`
        : "";
    const head = a.acquisitionWasEstimated
      ? "증여자 취득 당시 환산취득가"
      : "증여자 취득 당시 취득가액";
    return `${head} ${fmt(a.acquisitionPrice)}${capexNote} — 이월과세 §97의2① (증여자 취득가액 승계)`;
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
