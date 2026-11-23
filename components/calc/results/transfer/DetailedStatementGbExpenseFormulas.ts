/**
 * 계산결과 상세명세서 — **일반건물(GB) 파트별 필요경비** 산식 빌더(개산공제 §163⑥ · 실가 일괄 양도비·자본적지출 안분).
 *
 * `DetailedStatementGbFormulas.ts`에서 분리(800줄 정책, 2026-11-23 — 778줄 위험구간에 사례 35 토지 두 장 필요경비 갈래를 더하며).
 * 공용 프리미티브·카드 id 술어는 원 파일에서 import 한다 — 원 파일은 이 파일을 import 하지 않는다(단방향).
 */

import type { GeneralBuildingOutput } from "@/lib/tax-engine/general-building-valuation";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { baseCardId, isSameShare } from "@/lib/tax-engine/general-building-share-id";
import { shareIndexOf } from "@/lib/tax-engine/general-building-share-id";
import { ESTIMATED_DEDUCTION_RATE } from "@/lib/tax-engine/legal-codes";
import { NECESSARY_EXPENSE } from "@/lib/tax-engine/legal-codes/transfer-necessary-expense";
import { capExInAcquisitionColumnOfProperty } from "./exempt-gross-gain";
import { splitExpenseText } from "./split-acq-text";
import { splitAcqModeLabel } from "@/lib/tax-engine/transfer-tax-split-display";
import { buildBgExpenseFormula, bgOwnerSplitPerAssetFormulas } from "./DetailedStatementBgFormulas";
import { buildGbCarryoverExpenseFormula } from "./DetailedStatementGbCarryoverFormulas";
import { apportionByStdPrice } from "@/lib/tax-engine/std-price-apportion";
import { gbLandSplitTail } from "./gb-sale-split-transfer-formula";
import { fmt, buildAllocationFormula, buildResidualFormula } from "./DetailedStatementGbFormulas";
import { cardBg, isLandProp, isBuildingProp, isBuilding2Prop, withLandSplitTail } from "./DetailedStatementGbFormulas";

// ── 필요경비 산식 (개산공제 §163⑥) ─────────────────────────────────

/**
 * 개산공제율 표시 — **엔진 echo를 읽는다**(§163⑥ 3/100 · 1호 단서 미등기 3/1000).
 * 종전에는 「3%」를 박아 미등기 자산에서 적힌 산식이 적힌 값을 만들지 못했다(10배 어긋남).
 * echo가 없는 옛 결과(이력)는 등기 3%로 떨어진다 — 종전과 같은 표시다.
 */
function dedRatePct(rate: number | undefined): string {
  return `${((rate ?? ESTIMATED_DEDUCTION_RATE.LAND_BUILDING) * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

/**
 * 실가 일괄 경로 «자산별 양도비» 산식 — **신규 두 칸(자본적지출·양도비) 입력**용. 엔진 echo(`bundledActualTransferBasis` 등)로 적는다.
 *
 * 종전 산식은 legacy 칸(`bundledActualExpenses`)을 «총 양도비»로 쓰고 분모를 양도시 기준시가로 고정해, 신규 칸 입력에서는
 * `0 × 920,550,000 / (…) = 3,771,045`처럼 **자기 값을 못 만들었다**. 엔진은 양도비를 **각 파트에 적용된 양도가액**(구분 기재·감정·
 * 기준시가), 자본적지출을 **취득시 기준시가**로 나누므로 그 분모를 echo에서 읽어 적는다.
 *
 * 토지가 사업용·비사업용 초과분 두 장이면 토지 **전체** 식 뒤에 카드 몫 꼬리를 붙인다(`gbLandSplitTail` — 취득가액·개산공제와 같은 방식).
 * 종전에는 두 장 카드를 `undefined`로 돌려 legacy 산식으로 떨어졌고, 신규 칸 입력은 legacy 총액이 비어 「0 × … = 3,174,798」이 됐다
 * (결과뷰 리뷰 후보 ⑤ 형제 · 2026-11-23 실측).
 *
 * `undefined`를 돌려주면 호출부가 종전 산식으로 후퇴한다 — echo가 없는 옛 이력, 그 밖에 **적을 산식이 카드 값과 안 맞는** 모든 경우.
 * 파트 자본적지출 칸 입력은 아래 전용 함수가 적는다.
 */
function buildGbActualBundledExpenseFormula(
  p: PerPropertyBreakdown,
  gb: GeneralBuildingOutput,
  displayExp: number,
): string | undefined {
  const basis = gb.bundledActualTransferBasis;
  if (!basis) return undefined;
  if (gb.bundledActualPartCapitalExpenditure) {
    return buildGbPartCapexExpenseFormula(p, gb, basis, gb.bundledActualPartCapitalExpenditure, displayExp);
  }
  const capex = gb.bundledActualCapitalExpenditure ?? 0;
  const transfer = gb.bundledActualTransferExpense ?? 0;
  if (capex <= 0 && transfer <= 0) return undefined;
  const acqLand = gb.acqLandStdTotal ?? 0;
  const acqBuilding = gb.acqBuilding1StdTotal ?? 0;
  if (capex > 0 && acqLand + acqBuilding <= 0) return undefined;

  const capexLand = capex > 0 ? apportionByStdPrice(capex, acqLand, acqBuilding).land : 0;
  const transferLand = transfer > 0 ? apportionByStdPrice(transfer, basis.land, basis.building).land : 0;
  const landTotal = capexLand + transferLand;

  const id = baseCardId(p.propertyId);
  if (id === "building") {
    return capex + transfer - landTotal === displayExp
      ? buildResidualFormula(capex + transfer, [{ label: "토지", value: landTotal }], displayExp)
      : undefined;
  }
  const split = landExpenseSplit(p, gb, displayExp);
  if (id !== "land" && !split) return undefined;
  if (landTotal !== (split?.whole ?? displayExp)) return undefined;

  const transferText = transfer > 0
    ? buildAllocationFormula(transfer, basis.land, [basis.land, basis.building], transferLand)
    : undefined;
  const capexText = capex > 0
    ? buildAllocationFormula(capex, acqLand, [acqLand, acqBuilding], capexLand)
    : undefined;
  const text = transferText && capexText
    ? `양도비 ${transferText}\n        자본적지출 ${capexText}\n        합계 = ${fmt(landTotal)}`
    : (transferText ?? capexText)!;
  return split ? withLandSplitTail(text, split) : text;
}

/** 이 카드 몫의 필요경비 꼬리 — 토지 두 장(사업용·비사업용 초과분)이 아니면 `undefined`. 카드 값이 집계와 갈리면 `gbLandSplitTail`이 거른다. */
const landExpenseSplit = (p: PerPropertyBreakdown, gb: GeneralBuildingOutput, displayExp: number) =>
  gbLandSplitTail(p, gb, (c) => c.expenses, displayExp);

/**
 * 파트 자본적지출 칸(직접 입력)이 있는 실가 경로 — 그 파트의 자본적지출은 입력값 그대로, 양도비 몫은 안분해 더한다
 * (엔진 `resolvePartExpenses`와 같은 규칙). 적을 산식이 카드 값과 안 맞으면 `undefined`(위 함수와 같은 규약).
 */
function buildGbPartCapexExpenseFormula(
  p: PerPropertyBreakdown,
  gb: GeneralBuildingOutput,
  basis: { land: number; building: number },
  part: { land?: number; building?: number },
  displayExp: number,
): string | undefined {
  const id = baseCardId(p.propertyId);
  const split = landExpenseSplit(p, gb, displayExp);
  if (id !== "land" && id !== "building" && !split) return undefined;
  const isLand = id !== "building";
  const target = split?.whole ?? displayExp;
  const capex = gb.bundledActualCapitalExpenditure ?? 0;
  const transfer = gb.bundledActualTransferExpense ?? 0;
  const direct = isLand ? part.land : part.building;

  let capexValue = 0;
  let capexText: string | undefined;
  if (direct !== undefined) {
    capexValue = direct;
    capexText = `${fmt(direct)} (${isLand ? "토지" : "건물"} 칸 직접 입력)`;
  } else if (capex > 0) {
    const acqLand = gb.acqLandStdTotal ?? 0;
    const acqBuilding = gb.acqBuilding1StdTotal ?? 0;
    if (acqLand + acqBuilding <= 0) return undefined;
    const land = apportionByStdPrice(capex, acqLand, acqBuilding).land;
    capexValue = isLand ? land : capex - land;
    capexText = isLand
      ? buildAllocationFormula(capex, acqLand, [acqLand, acqBuilding], land)
      : buildResidualFormula(capex, [{ label: "토지", value: land }], capexValue);
  }

  let transferValue = 0;
  let transferText: string | undefined;
  if (transfer > 0) {
    const land = apportionByStdPrice(transfer, basis.land, basis.building).land;
    transferValue = isLand ? land : transfer - land;
    transferText = isLand
      ? buildAllocationFormula(transfer, basis.land, [basis.land, basis.building], land)
      : buildResidualFormula(transfer, [{ label: "토지", value: land }], transferValue);
  }

  if (capexValue + transferValue !== target) return undefined;
  const text = transferText && capexText
    ? `양도비 ${transferText}\n        자본적지출 ${capexText}\n        합계 = ${fmt(target)}`
    : capexText ? `자본적지출 ${capexText}` : transferText;
  return split && text ? withLandSplitTail(text, split) : text;
}

/**
 * 필요경비 자산별 산식 — 개산공제 = 취득시 기준시가 × 개산공제율(§163⑥ 3% · 미등기 0.3%).
 * 자본적지출은 실가 모드에서 필요경비 칸에 머문다. 예외 축(swap·이월과세 A)만 취득가액에 흡수되어 본 행에는 양도비만 남음.
 */
export function buildGbExpenseFormula(
  p: PerPropertyBreakdown,
  gbIn: GeneralBuildingOutput | undefined,
  burdenedGift?: TransferBurdenedGiftBreakdown,
): string | undefined {
  // 지분 분할 실가 경로 — 이 카드가 속한 지분의 필요경비 echo로 덮어 읽는다(지분마다 금액이 다르다).
  const shareEcho = gbIn?.shareActualExpenseEcho?.[String(shareIndexOf(p.propertyId))];
  const gb = gbIn && shareEcho ? { ...gbIn, ...shareEcho } : gbIn;
  // 부담부증여 §163⑥ 분기 — 자산별 개산공제 = 안분 취득가액 × 개산공제율
  burdenedGift = cardBg(burdenedGift, p.propertyId);
  if (burdenedGift) {
    const bgAsset = isLandProp(p.propertyId)
      ? burdenedGift.perAsset.land
      : isBuildingProp(p.propertyId)
        ? burdenedGift.perAsset.building
        : undefined;
    if (bgAsset) {
      return buildBgExpenseFormula(burdenedGift, bgAsset);
    }
  }

  // 부담부증여 × 소유자 분리 — 증여한 파트의 개산공제 산식(취득가액 줄과 같은 슬롯 echo).
  const ownerSplitFormulas = bgOwnerSplitPerAssetFormulas(p);
  if (ownerSplitFormulas) return ownerSplitFormulas.expense;
  // 토지·건물 별개 취득(split) 분리 자산 — 파트별 자본적지출·양도비 + 개산공제(echo). 개산공제 파트가 없으면 종전 문구.
  const splitExpText = splitExpenseText(p.splitDetail);
  if (splitExpText) return splitExpText;

  // 이월과세(§97의2) 카드 — 개산공제 분기로 떨어지면 「× 3% = 칸 값」이 거짓 등식이 된다(A: 본인 양도비·증여자 자본적지출·증여세 상당액 · B: 본인 지출뿐).
  const carryoverText = buildGbCarryoverExpenseFormula(
    p,
    dedRatePct(isBuildingProp(p.propertyId) ? gb?.estimatedDeduction?.buildingRate : gb?.estimatedDeduction?.landRate),
  );
  if (carryoverText !== undefined) return carryoverText;

  const capExShift = capExInAcquisitionColumnOfProperty(p);
  const displayExp = Math.max(0, p.necessaryExpense - capExShift);

  // gbDetail 없는 일반 다건(사례 27·28 등) fallback
  if (!gb) {
    // 예외 축(swap·이월과세 A) — 자본적지출이 취득가액 칸에 얹혀 있어 이 칸은 양도비만
    if (capExShift > 0) {
      return `필요경비 ${fmt(p.necessaryExpense)} − 자본적지출 ${fmt(capExShift)}(취득가액 흡수) = 양도비 ${fmt(displayExp)}`;
    }
    // 실가 모드 — 자본적지출 + 양도비 전액이 이 칸이다(§97① 2호·3호)
    const capEx = p.capitalExpenditureForDisplay;
    if (capEx > 0) {
      const transferExp = Math.max(0, p.necessaryExpense - capEx);
      return transferExp > 0
        ? `자본적지출 ${fmt(capEx)} + 양도비 ${fmt(transferExp)} = ${fmt(p.necessaryExpense)} (§97① 2호·3호)`
        : `자본적지출 ${fmt(capEx)} = ${fmt(p.necessaryExpense)} (§97① 2호)`;
    }
    // 겸용 컴패니언 파트 카드의 비-실가 파트 — 필요경비는 개산공제(§163⑥, 공통 실비 안분분 포함)다. 종전엔 「양도비」로 적었다(#10).
    if (p.displayAcquisitionMode && p.displayAcquisitionMode !== "actual") {
      return `개산공제 등 필요경비 = ${fmt(displayExp)} (${splitAcqModeLabel(p.displayAcquisitionMode)} 파트 — 시행령 §163⑥)`;
    }
    return `자산별 양도비 합계 = ${fmt(displayExp)} (${NECESSARY_EXPENSE.TRANSFER_COST})`;
  }

  // ── 실가 모드 분기 (사례 35 등) — §166⑥ 양도가 비율로 일괄 실가 양도비 안분 ──
  const isActualBundledMode =
    gb.bundledActualAcquisitionPrice !== undefined &&
    !gb.extensionStdTotal &&
    !gb.acqExtensionStdTotal;
  if (isActualBundledMode) {
    const echoed = buildGbActualBundledExpenseFormula(p, gb, displayExp);
    if (echoed) return echoed;
    const totalExp = gb.bundledActualExpenses ?? 0;
    if (totalExp <= 0 && displayExp <= 0) {
      return `자산별 양도비 = 0 (입력 없음)`;
    }
    if (isLandProp(p.propertyId)) {
      const landStd = gb.landStdTotal;
      const buildingStd = gb.buildingStdTotal;
      if (landStd && buildingStd) {
        // 토지 두 장이면 우변은 토지 전체 안분액이고 카드 값은 그 몫이다(후보 ⑤ 형제).
        const split = landExpenseSplit(p, gb, displayExp);
        return split
          ? withLandSplitTail(buildAllocationFormula(totalExp, landStd, [landStd, buildingStd], split.whole), split)
          : buildAllocationFormula(totalExp, landStd, [landStd, buildingStd], displayExp);
      }
    }
    if (isBuildingProp(p.propertyId)) {
      return buildResidualFormula(totalExp, [
        { label: "토지", value: totalExp - displayExp },
      ], displayExp);
    }
    return `자산별 양도비 = ${fmt(displayExp)}`;
  }

  /**
   * 그 파트가 **개산공제 경로인가** — 엔진 카드의 `usedEstimatedAcquisition`이 정본이다(F-21).
   *
   * 「소득세법」 제97조 제2항은 제1호(취득가액을 **실지거래가액**에 의하는 경우)와 제2호(그 밖의
   * 경우)를 나누고 §163⑥ 개산공제는 **제2호에만** 붙는다. §163⑨ 상속·증여 평가액은 「취득당시의
   * 실지거래가액으로 **본다**」이므로 1호다 ⇒ 개산공제 없음.
   *
   * 종전에는 그 파트에도 「취득시 기준시가 × 3%」라 적었다 — **실측 「238,000,000 × 3% = 0」**.
   * 산식이 자기 값을 못 만드는 것은 물론, **없는 근거를 댄 것**이다.
   *
   * ⚠️ `estimatedDeduction.landBase`(F-18·F-20의 base echo)를 이 신호로 겸용하지 않는다 —
   *    base가 없는 것이 「실가 파트」인지 「echo 이전에 저장된 옛 이력」인지 구별되지 않는다
   *    (`feedback_one_field_serving_two_legal_axes`). 카드 필드가 없는 옛 결과는 `undefined`라
   *    종전대로 개산공제 산식으로 떨어진다(표시 회귀 없음).
   */
  const partCard = gb.assetCards.find(
    (c) => baseCardId(c.propertyId) === baseCardId(p.propertyId) && isSameShare(c.propertyId, p.propertyId),
  );
  // 🔑 E-1 `acquisitionMode` echo가 정본이다 — boolean만 보면 감정·매매사례 파트(개산공제 적용)가 「실지거래가액 파트」로 읽혀
  //    「개산공제를 적용하지 않습니다」가 개산공제가 적용된 금액 옆에 붙는다(A2 §9.2 D1). 옛 이력(echo 없음)은 종전 boolean 판정.
  const isActualPart =
    partCard?.acquisitionMode !== undefined
      ? partCard.acquisitionMode === "actual"
      : partCard?.usedEstimatedAcquisition === false;
  const actualPartFormula = () =>
    displayExp > 0
      ? `자산별 양도비 = ${fmt(displayExp)} (${NECESSARY_EXPENSE.TRANSFER_COST})\n        ※ 실거래가 파트라 §163⑥ 개산공제를 적용하지 않습니다.`
      : `필요경비 없음 — 실거래가 파트라 §163⑥ 개산공제를 적용하지 않습니다.`;

  /*
   * §97②1호 가산분이 실린 카드(실가 파트의 자본적지출·양도비 안분 몫 — E-1) — 「자기 경비 + 안분 가산 = 합계」로 적는다.
   * 종전 문구(「자산별 양도비 = …」·「사용자 직접 입력 (증축 실제 필요경비)」)는 가산분을 다른 성질로 적었다.
   */
  const addition = gb.partDirectAddition?.[p.propertyId] ?? 0;
  if (addition > 0 && addition <= displayExp) {
    const own = displayExp - addition;
    const ownLabel = isBuilding2Prop(p.propertyId) ? "증축 실제 필요경비" : "일괄 취득 필요경비 안분";
    // 증축 전 자본적지출은 원건물에만 귀속된다 — 안분 몫과 나눠 적는다(`gb-extension-capex-timing.plan.md`).
    const before = Math.min(gb.partBeforeExtensionCapex?.[p.propertyId] ?? 0, addition);
    const terms: Array<[string, number]> = [
      ...(own > 0 ? [[ownLabel, own] as [string, number]] : []),
      ...(before > 0 ? [["증축 전 자본적지출", before] as [string, number]] : []),
      ...(addition - before > 0 ? [["자본적지출·양도비 안분", addition - before] as [string, number]] : []),
    ];
    return terms.length > 1
      ? `${terms.map(([l, v]) => `${l} ${fmt(v)}`).join(" + ")} = ${fmt(displayExp)} (§97②1호)`
      : `${terms[0][0]} = ${fmt(displayExp)} (§97②1호 — 실지거래가액 파트 가산)`;
  }

  if (isLandProp(p.propertyId)) {
    if (isActualPart) return actualPartFormula();
    if (!gb.acqLandStdTotal) return undefined;
    // base는 엔진 echo(지분 기준시가) 우선 — 100% 값을 쓰면 지분 자산에서 산식이 값을 못 만든다.
    const head = `취득시 토지기준시가 ${fmt(gb.estimatedDeduction?.landBase ?? gb.acqLandStdTotal)} × ${dedRatePct(gb.estimatedDeduction?.landRate)} = `;
    // 토지 두 장이면 base는 토지 전체라 우변도 전체 개산공제이고 카드 값은 그 몫이다(후보 ⑤).
    const expSplit = gbLandSplitTail(p, gb, (c) => c.expenses, displayExp);
    return expSplit ? withLandSplitTail(`${head}${fmt(expSplit.whole)}`, expSplit) : `${head}${fmt(displayExp)}`;
  }
  if (isBuildingProp(p.propertyId)) {
    if (isActualPart) return actualPartFormula();
    if (!gb.acqBuilding1StdTotal) return undefined;
    return `취득시 건물기준시가 ${fmt(gb.estimatedDeduction?.buildingBase ?? gb.acqBuilding1StdTotal)} × ${dedRatePct(gb.estimatedDeduction?.buildingRate)} = ${fmt(displayExp)}`;
  }
  if (isBuilding2Prop(p.propertyId)) {
    // base echo가 없으면 개산공제 경로가 아니다(증축분 실가 직접 입력) — 율도 base도 없다.
    // 100% 기준시가(`acqExtensionStdTotal`)를 base로 적으면 **지분 자산에서 산식이 자기 값을
    // 만들지 못한다**(실측 지분 0.5: 「1,000,000 × 3% = 15,000」). F-20.
    const extBase = gb.estimatedDeduction?.extensionBase;
    if (extBase === undefined || !gb.acqExtensionStdTotal) {
      return `사용자 직접 입력 (증축 실제 필요경비) = ${fmt(displayExp)}`;
    }
    return `취득시 증축건물기준시가 ${fmt(extBase)} × ${dedRatePct(gb.estimatedDeduction?.buildingRate)} = ${fmt(displayExp)}`;
  }
  return undefined;
}
