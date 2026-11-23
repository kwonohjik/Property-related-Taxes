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
import type { GbSec1639Basis } from "@/lib/tax-engine/types/general-building.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { baseCardId, isSameShare } from "@/lib/tax-engine/general-building-share-id";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { NECESSARY_EXPENSE } from "@/lib/tax-engine/legal-codes/transfer-necessary-expense";
import { capExInAcquisitionColumnOfProperty } from "./exempt-gross-gain";
import { splitAcqFormulaText } from "./split-acq-text";
import { splitAcqModeLabel } from "@/lib/tax-engine/transfer-tax-split-display";
import { buildBgAcquisitionFormula, bgOwnerSplitPerAssetFormulas } from "./DetailedStatementBgFormulas";
import { buildGbNonStdTransferFormula } from "./gb-sale-split-transfer-formula";
import { gbLandSplitTail } from "./gb-sale-split-transfer-formula";

/**
 * 묶음 카드별 명세(`cards`)가 있으면 이 파트 카드가 속한 지분·자산의 명세를 읽는다 — 카드 id 접미사(`land#0` → `0`)가 `cards[].propertyId`와 같다
 * (`tagGbCards`). 접미사가 없는 단건·`cards`가 없는 물건 전체 명세는 그대로.
 */
export function cardBg(bg: TransferBurdenedGiftBreakdown | undefined, propertyId: string): TransferBurdenedGiftBreakdown | undefined {
  const i = propertyId.indexOf("#");
  if (!bg?.cards || i < 0) return bg;
  const key = propertyId.slice(i + 1);
  return bg.cards.find((c) => c.propertyId === key)?.breakdown ?? bg;
}

/**
 * propertyId가 토지에 해당하는지 — 일반건물(land/land_business/land_nbl) + 토지 자산.
 *
 * 🔴 **`baseCardId`를 반드시 통과시킨다.** 지분(%) 분할 카드는 `land#0` 꼴이라 정확 비교로는
 *    항상 false가 되어, 이 파일의 산식이 통째로 `undefined`를 돌려준다(= 화면에 산식이 안 뜬다).
 *    2026-08-10 실측 — 규약은 `lib/tax-engine/general-building-share-id.ts`.
 */
export function isLandProp(propertyId: string): boolean {
  const id = baseCardId(propertyId);
  return id === "land" || id === "land_business" || id === "land_nbl";
}

/** propertyId가 원건물에 해당하는지 — 사례 31 `building` · 사례 33 `building1` */
export function isBuildingProp(propertyId: string): boolean {
  const id = baseCardId(propertyId);
  return id === "building" || id === "building1";
}

/** 사례 33 증축분 건물 카드인지. */
function isBuilding1Prop(propertyId: string): boolean {
  return baseCardId(propertyId) === "building1";
}

/** 사례 33 증축분 건물 카드인지 (`building2`). */
/**
 * §163⑨ 상속·증여 파트 취득가액의 근거 문구. 본문 — 상속개시일·증여일 평가액을 실지거래가액으로 본다.
 * 단서 1호(토지 — 영 §164④ 가액)·2호(건물 — 영 §164⑤ 가액) — 평가액과 그 가액 중 많은 금액.
 */
function sec1639BasisText(basis: GbSec1639Basis, isLand: boolean): string {
  const valued = basis.cause === "inheritance" ? "상속개시일 평가액" : "증여일 평가액";
  if (basis.adopted === "reported") return `${valued} — 소득세법 시행령 §163⑨`;
  return isLand
    ? `${valued}보다 많은 소득세법 시행령 §164④ 가액 — 같은 영 §163⑨ 단서 1호`
    : `${valued}보다 많은 소득세법 시행령 §164⑤ 가액 — 같은 영 §163⑨ 단서 2호`;
}

export function isBuilding2Prop(propertyId: string): boolean {
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

/**
 * 토지가 사업용·비사업용 초과분 두 장이면 토지 **전체** 식(`head`) 뒤에 이 카드 몫 꼬리를 붙인다(`gbLandSplitTail`).
 * 엔진은 토지 전체를 먼저 환산·안분·개산공제한 뒤 인정면적 비율로 가른다 — 카드 몫에 비율을 바로 곱하면 좌변이 우변을 못 만든다(후보 ⑤).
 */
export function withLandSplitTail(head: string, split: { tail: string; residual: boolean }): string {
  return `${head}\n        ${split.tail}${split.residual ? " (비사업용 초과분 · 잔액)" : ""}`;
}

/** 이 카드 몫의 취득가액 꼬리 — 토지 두 장이 아니면 `undefined`. */
const landAcqSplit = (p: PerPropertyBreakdown, gb: GeneralBuildingOutput) =>
  gbLandSplitTail(p, gb, (c) => c.acquisitionPrice, p.acquisitionPrice);

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
  burdenedGift = cardBg(burdenedGift, p.propertyId);
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

  // R-c05-01 — 구분 기재 채택·감정가액 안분은 기준시가 안분식이 등식이 아니다(그 값을 적는다).
  const nonStd = gb ? buildGbNonStdTransferFormula(p, gb, totalTransferPrice) : undefined;
  if (nonStd) return nonStd;

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
      // 토지 두 장(사업용·비사업용 초과분)이면 안분식 우변은 토지 전체 값이고, 카드 값은 그 몫이다(R-c05-01 형제).
      const landSplit = gbLandSplitTail(p, gb);
      return landSplit
        ? `${buildAllocationFormula(totalTransferPrice, landStd, denomParts, landSplit.whole)}\n        ${landSplit.tail}${landSplit.residual ? " (비사업용 초과분 · 잔액)" : ""}`
        : buildAllocationFormula(totalTransferPrice, landStd, denomParts, p.transferPrice);
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
  /**
   * §97③ 감가상각비 — `p.acquisitionPrice`는 엔진이 공제한 **후** 값이다. 아래 산식 분기들은 안분·환산 식의
   * 우변에 그 값을 적으므로 그대로 두면 **좌변이 우변을 만들지 못한다**(산식 = 공제 전 취득가액).
   * 공제 전 값(`+ 감가상각비`)으로 산식을 만들고 마지막 줄에 공제를 덧붙인다 — 값이 산식 끝에서 자기를 만든다.
   */
  const dep = p.depreciationAmount ?? 0;
  if (dep > 0) {
    const gross = buildGbAcquisitionFormulaCore({ ...p, acquisitionPrice: p.acquisitionPrice + dep, depreciationAmount: undefined }, gb, asset, burdenedGift);
    return gross === undefined
      ? undefined
      : `${gross}\n        − 감가상각비 ${fmt(dep)} (소득세법 §97③ — 건물분 취득가액에서 공제) = ${fmt(p.acquisitionPrice)}`;
  }
  return buildGbAcquisitionFormulaCore(p, gb, asset, burdenedGift);
}

function buildGbAcquisitionFormulaCore(
  p: PerPropertyBreakdown,
  gb: GeneralBuildingOutput | undefined,
  asset: AssetForm | undefined,
  burdenedGift?: TransferBurdenedGiftBreakdown,
): string | undefined {
  // 부담부증여 §159①1호 분기 (우선 적용) — 자산별 취득가액 = 취득시 자산기준시가 × 채무액 / 증여재산 평가액
  burdenedGift = cardBg(burdenedGift, p.propertyId);
  if (burdenedGift) {
    const bgAsset = isLandProp(p.propertyId)
      ? burdenedGift.perAsset.land
      : isBuildingProp(p.propertyId)
        ? burdenedGift.perAsset.building
        : undefined;
    if (bgAsset) {
      // 방식(기준시가·실지·환산·매매사례·감정)별 산식 — `DetailedStatementBgFormulas`(Q-7)
      return buildBgAcquisitionFormula(burdenedGift, bgAsset, p.acquisitionPrice);
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
    const head = a.acquisitionWasEstimated
      ? "증여자 취득 당시 환산취득가"
      : "증여자 취득 당시 취득가액";
    // 취득가액 칸으로 옮겨 얹은 본인 자본적지출 — 값(`p.acquisitionPrice + 이동분`)과 산식이 같은 수를 적게 한다(단건 경로 `capExStr` 와 같은 형태).
    const shiftedCapex = capExInAcquisitionColumnOfProperty(p);
    const capExStr = shiftedCapex > 0 ? ` + 자본적지출 ${fmt(shiftedCapex)}` : "";
    // 재개발(§166)은 A의 취득가액이 단계별 분할의 합이다 — 인가 전 분(§166③ 환산 또는 증여자 취득가액)에 인가 후·청산금 분이 더해져
    //   「환산취득가」가 아니다(계획서 `redev-carryover-residue-bundle.plan.md` B-2). 이월과세 A 채택이면 `redevelopmentDetail`이 A의 분할이다.
    const redevPre = p.redevelopmentDetail?.preApproval;
    if (redevPre) {
      const preLabel = a.acquisitionWasEstimated ? "§166③ 환산" : "증여자 취득가액";
      return `증여자 취득 당시 기준 취득가액 ${fmt(a.acquisitionPrice)}${capExStr} — §166 분할 합(인가 전 분 ${preLabel} ${fmt(redevPre.apportionedAcquisition)} 포함) · 이월과세 §97의2① (증여자 취득가액 승계)`;
    }
    return `${head} ${fmt(a.acquisitionPrice)}${capExStr} — 이월과세 §97의2① (증여자 취득가액 승계)`;
  }

  /**
   * 토지·건물 별개 취득(split) 분리 자산 — 파트별 산정방식·취득가액을 엔진 `splitDetail` echo로 그린다(H-5 표시 보강).
   * 종전에는 이 자산이 `!gb` fallback으로 떨어져 「자산별 취득가액 = 0」이라 적혔다. 값은 엔진 echo(E-U1)가 정본이다.
   */
  // 부담부증여 × 소유자 분리 — 증여한 파트의 §159 산식(분리 문구가 기준시가 안분을 「환산취득가」로 적던 것을 대신한다).
  const ownerSplitFormulas = bgOwnerSplitPerAssetFormulas(p);
  if (ownerSplitFormulas) return ownerSplitFormulas.acquisition;
  const splitText = splitAcqFormulaText(p.splitDetail);
  if (splitText) return splitText;

  // 취득가액 칸으로 옮겨 얹는 자본적지출 — 실가 모드는 0(필요경비 칸에 머문다), swap·이월과세 A만 양수.
  const capExShift = capExInAcquisitionColumnOfProperty(p);

  // gbDetail 없는 일반 다건(사례 27·28 등) fallback — 자본적지출 합산 산식 표기(예외 축 한정)
  if (!gb) {
    if (capExShift > 0) {
      return `취득가액 ${fmt(p.acquisitionPrice)} + 자본적지출 ${fmt(capExShift)} = ${fmt(p.acquisitionPrice + capExShift)} (신고서 양식: 자본적지출(${NECESSARY_EXPENSE.CAPITAL_EXPENDITURE}) 합산 표시)`;
    }
    // 겸용 컴패니언 파트 카드 — 겸용 엔진이 정한 산정방식을 밝힌다(카드 자체는 실가 item이라 다른 echo가 없다, #10).
    const modeTag = p.displayAcquisitionMode ? `(${splitAcqModeLabel(p.displayAcquisitionMode)})` : "";
    return p.depreciationAmount
      ? `자산별 취득가액${modeTag} = ${fmt(p.acquisitionPrice)} (감가상각비 ${fmt(p.depreciationAmount)} 공제 후 — 소득세법 §97③)`
      : `자산별 취득가액${modeTag} = ${fmt(p.acquisitionPrice)}`;
  }

  // 자본적지출은 실가 모드에서 필요경비 칸에 머문다. 예외 축(swap·이월과세 A)만 취득가액에 합산 표시.
  // 산식은 안분 결과만 표기하고 자본적지출은 별도 메모 처리 (단순화).
  const displayValue = p.acquisitionPrice + capExShift;

  // ── 감정가액·매매사례가액 파트 (A2 §9.2 D3) ──
  // 아래 분기들은 취득가액을 「양도가액 × 취득시 기준시가 ÷ 양도시 기준시가」(환산)로 그리는데, 감정·매매사례 파트의 취득가액은
  // 그 곱이 **아니다** — 적힌 산식이 적힌 값을 못 만드는 거짓 등식이 된다. echo가 있을 때만 가드한다(옛 이력은 현행 유지).
  // 실가 파트(혼합 환산의 기존 거짓 등식)는 Phase C 범위다(Q-F).
  const gbModeCard = gb.assetCards.find(
    (c) => baseCardId(c.propertyId) === baseCardId(p.propertyId) && isSameShare(c.propertyId, p.propertyId),
  );
  if (gbModeCard?.acquisitionMode === "appraisal" || gbModeCard?.acquisitionMode === "salesCase") {
    return gbModeCard.acquisitionMode === "appraisal"
      ? `자산별 취득가액 = ${fmt(displayValue)} (감정가액 — 소득세법 §97①1호 나목 · 같은 법 시행령 §176의2③2호)`
      : `자산별 취득가액 = ${fmt(displayValue)} (매매사례가액 — 소득세법 §97①1호 나목 · 같은 법 시행령 §176의2③1호)`;
  }

  // ── §163⑨ 상속·증여 파트 ──
  // 부분 상속·증여 파트는 값이 파트 슬롯으로 와 아래 「실거래가」 분기에 떨어졌고, C1 상속 분기는 단서 ②(영 §164 가액)가 채택돼도
  // 「상속개시일 평가액」이라 적었다(적힌 이름 ≠ 적힌 값). 엔진 echo `sec1639Basis`가 정본이다 — 없는 구 이력은 아래 종전 문구.
  if (gbModeCard?.acquisitionMode === "actual" && gbModeCard.sec1639Basis) {
    return `자산별 취득가액 = ${fmt(displayValue)} (${sec1639BasisText(gbModeCard.sec1639Basis, isLandProp(p.propertyId))})`;
  }

  // ── 실거래가 파트 직접 입력 (Q-F) ──
  // 별개 취득이라 파트별 실거래가를 **각각 입력**한 카드다 — 값은 입력 그대로이고 어떤 안분·환산식도 이 값을 만들지 못한다.
  // 종전에는 아래 분기들이 「양도가액 × 취득시 ÷ 양도시 기준시가 = 실가」·「0 × … = 실가」·「잔액 보정」을 붙여 좌변이 우변을
  // 못 만드는 거짓 등식이 됐다(실측 505,748,404 ≠ 300,000,000). `acquisitionMode:"actual"`만으로는 일괄 실가 안분(사례 35)과 구별되지
  // 않으므로 엔진 echo `actualSource`가 정본이다 — 숨은 자산 단위 총액(stale)·`bundledActualAcquisitionPrice`로 가르지 않는다.
  // echo가 없는 구 이력은 종전 산식을 유지한다. 증축분(건물2)은 별도 직접 입력 문구가 아래에 있어 제외한다.
  if (gbModeCard?.acquisitionMode === "actual" && gbModeCard.actualSource === "part_input" && !isBuilding2Prop(p.propertyId)) {
    return `자산별 취득가액 = ${fmt(displayValue)} (실거래가 — 소득세법 §97①1호 가목)`;
  }
  // 상속(§163⑨) — 상속개시일 평가액을 그대로 쓴다. 아래 일괄 실가 안분 분기로 떨어지면 「0 × … = 평가액」 거짓 등식이 된다.
  if (gbModeCard?.acquisitionMode === "actual" && gbModeCard.actualSource === "inherited") {
    return `자산별 취득가액 = ${fmt(displayValue)} (상속개시일 평가액 — 소득세법 시행령 §163⑨)`;
  }

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
    // 엔진은 일괄 실가를 **취득시** 기준시가 비율로 안분한다(`general-building-route-actual.ts` P-2 — 소득세법 §100② 본문
    // 「취득 당시」). echo `actualSource:"bundled_apportion"`이 있으면 분모를 취득시 값으로 맞춘다 — 종전 양도시 분모는
    // 적힌 식이 적힌 값을 못 만들었다(684,656,902 ≠ 691,818,892). echo가 없는 구 이력은 종전 식을 유지한다.
    const apportionAtAcq = gbModeCard?.actualSource === "bundled_apportion";
    const landStd = apportionAtAcq ? gb.acqLandStdTotal : gb.landStdTotal;
    const buildingStd = apportionAtAcq ? gb.acqBuilding1StdTotal : gb.buildingStdTotal;
    if (landStd && buildingStd) {
      if (isLandProp(p.propertyId)) {
        // 토지 취득가 = 일괄 실가 × 토지기준시가 / (토지+건물 기준시가) — 기준시가 시점은 위 `apportionAtAcq`
        // 토지 두 장이면 우변은 토지 전체이고 카드 값은 그 몫이다(후보 ⑤).
        const acqSplit = landAcqSplit(p, gb);
        return acqSplit
          ? withLandSplitTail(buildAllocationFormula(bundledAcq, landStd, [landStd, buildingStd], acqSplit.whole), acqSplit)
          : buildAllocationFormula(bundledAcq, landStd, [landStd, buildingStd], p.acquisitionPrice);
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
  // 원건물 실가 중 환산 파트(토지 상속 + 건물 매매 환산 등)는 일괄 안분값이 아니다 — 아래 일괄 안분식 대신 환산식으로 간다.
  const extensionEstimatedPart = gbModeCard?.acquisitionMode === "estimated" && !isBuilding2Prop(p.propertyId);
  if (isExtensionCase(gb) && isBundledActualCase(asset) && !extensionEstimatedPart) {
    const acqLandStd = gb.acqLandStdTotal;
    const acqB1Std = gb.acqBuilding1StdTotal;
    if (!acqLandStd || !acqB1Std) return undefined;

    if (isLandProp(p.propertyId)) {
      // 토지: bundledAcq × acqLandStd / (acqLandStd + acqB1Std) — 취득시 비율 안분
      // 짝 카드는 **같은 지분**에서 찾는다 — 지분마다 일괄 취득가가 다르다.
      // 토지 두 장이면 일괄 총액은 토지 두 장 합 + 건물(3001)이고 우변은 토지 전체, 카드 값은 그 몫이다(후보 ⑤).
      const acqSplit = landAcqSplit(p, gb);
      const bundledAcq =
        (acqSplit ? acqSplit.whole : displayValue) +
        (findSiblingCard(gb.assetCards, "building1", p.propertyId)?.acquisitionPrice ?? 0);
      return acqSplit
        ? withLandSplitTail(buildAllocationFormula(bundledAcq, acqLandStd, [acqLandStd, acqB1Std], acqSplit.whole), acqSplit)
        : buildAllocationFormula(bundledAcq, acqLandStd, [acqLandStd, acqB1Std], p.acquisitionPrice);
    }
    if (isBuilding1Prop(p.propertyId)) {
      // 토지가 두 장(사업용·비사업용 초과분)이면 둘 다 더한다 — 한 장만 빼면 잔액식이 일괄 총액을 못 만든다(후보 ⑤).
      const landAcq = gb.assetCards
        .filter((c) => isLandProp(c.propertyId) && isSameShare(c.propertyId, p.propertyId))
        .reduce((s, c) => s + c.acquisitionPrice, 0);
      const bundledAcq = landAcq + p.acquisitionPrice;
      return buildResidualFormula(bundledAcq, [
        { label: "토지", value: landAcq },
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
    // §164⑨ 1호 공익수용 — 엔진은 토지 환산 분모를 낮춘 값으로 쓴다(`calculateConvertedAcquisition`). 원 기준시가를 적으면 산식 ≠ 값.
    const exprDetail = gb.expropriationValuationDetail;
    const exprDenom = exprDetail?.denominator;
    // 특례 게이트만 통과하고 ㎡당 기준시가가 그대로 최소값이면 «낮춘 값»이 아니다 — 그때는 특례 적용 분모라고만 적는다.
    const exprLowered = exprDetail !== undefined && exprDetail.chosenPerSqm < exprDetail.perSqmCandidates.standard;
    const exprNote =
      exprDenom === undefined
        ? ""
        : exprLowered
          ? ` (분모: 양도 당시 토지기준시가를 ${TRANSFER.EXPROPRIATION_VALUATION_CLAUSE_1} 공익수용 특례로 낮춘 값)`
          : ` (분모: ${TRANSFER.EXPROPRIATION_VALUATION_CLAUSE_1} 공익수용 특례 적용 — 양도 당시 토지기준시가가 가장 적은 금액)`;
    const landDenom = exprDenom ?? landStd;
    // 토지 두 장이면 엔진은 토지 전체 양도가액을 환산한 뒤 가른다 — 카드 몫 양도가액을 환산하면 ±원 어긋난다(후보 ⑤).
    const acqSplit = landAcqSplit(p, gb);
    const transferWhole = gbLandSplitTail(p, gb)?.whole;
    return acqSplit && transferWhole !== undefined
      ? withLandSplitTail(`${buildAllocationFormula(transferWhole, acqLandStd, [landDenom], acqSplit.whole)}${exprNote}`, acqSplit)
      : `${buildAllocationFormula(p.transferPrice, acqLandStd, [landDenom], p.acquisitionPrice)}${exprNote}`;
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
