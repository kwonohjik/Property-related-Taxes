/**
 * 겸용주택 **별개 취득**(토지·건물 취득일 상이) — 파트별 취득가액 산정방식·취득가액 (B1 · 단일 소스 leaf).
 *
 * 설계: `docs/02-design/features/mixed-use-separate-acq-per-part.engine.design.md` §3·§4·§6.
 * 토지 파트·건물 파트가 각각 {실거래가·환산·감정·매매사례} 중 하나를 고르고, 각 파트 값을 4부분
 * (주택부수토지·주택건물·상가부수토지·상가건물)으로 나눠 취득가액·개산공제를 정한다.
 *
 * ## 이 파일이 갖는 것 (엔진 · ⑫ Zod · UI 어댑터가 **모두 이 한 곳**을 부른다 — 규칙 두 벌 금지)
 *  1. `isMixedUsePerPartAcq` — 파트 모델 trigger(객체 존재). 부재 = 총액 모델(구 이력).
 *  2. `collectMixedPartAcqIssues` / `assertMixedSeparateAcqSupported` — 결합 제외 7종(X-1~X-7)·값 누락.
 *  3. `mixedPartAcqNeeds` — **무엇이 쓰이는가** = 무엇이 필수인가. UI ⑤ 노출·⑧ 필수·⑫·엔진이 부른다.
 *  4. `applyMixedPartAcq` — 현행 환산 경로 split(est)와 공통경비 split(exp)에서 파트별 값으로 갈아끼운다.
 *
 * ## 모델 (환산 파트 불변식)
 * 환산 파트의 값은 **상대 파트 모드와 무관하게 양쪽 환산일 때의 값**이다 — 현행 환산 경로의 split(est)에서
 * 그 파트 값만 가져오므로 구성상 성립한다. 따라서 양쪽 환산 = 현행 총액-환산 모델과 1원 일치.
 *
 * ## 규칙
 *  - S-1 토지 파트 → 주택부수토지:상가부수토지 = **면적비**(같은 필지 = 같은 ㎡당 단가 — 「소득세법」 §100② 후문 유추).
 *  - S-2 건물 파트 → 주택건물:상가건물 = **계약액 우선**(실가 한정, 상가 = 총액 − 주택), 없으면 건물 취득일 나목 비율.
 *  - S-5 개산공제 = **비-실가 파트에만** 취득시 기준시가(basis) × 3%(미등기 3/1000) — basis는 현행 split의 값
 *    (주택 γ1 비례값 · 상가 가목·나목 원값). 실가 파트는 실제 필요경비(자본적지출·양도비 몫).
 *  - §97②2호 단서(가목 < 나목이면 나목)는 **환산 파트 묶음**으로 판정(양쪽 환산 = 현행 자산 단위와 동일).
 *  - 감정·매매사례 파트는 개산공제만(경비 미반영 — §97②2호 본문), 단서 대상 아님.
 *
 * 순수 함수다(DB·Date 변환 없음). 미입력은 **차단**이고 값을 지어내지 않는다(자동 안분 fallback 금지).
 */
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import { MIXED_USE } from "./legal-codes/transfer-mixed-use";
import { areMixedAcqDatesSeparate } from "./mixed-use-acq-date";
import { apportionByStdPrice } from "./std-price-apportion";
import { multiplyByArea } from "./area-utils";
import { splitDeemedExpense } from "./transfer-tax-mixed-use-inheritance";
import type { HousingGainSplit } from "./transfer-tax-mixed-use-housing";
import type { CommercialGainSplit } from "./transfer-tax-mixed-use-commercial";
import type { MixedUseAssetInput, MixedUseDerivedAreas } from "./types/transfer-mixed-use.types";
import type {
  MixedPartAcqNeeds,
  MixedPartAcqPartEcho,
  MixedPartKey,
  MixedSeparateAcquisition,
  MixedUseSeparateAcquisitionEcho,
} from "./types/transfer-mixed-use-part-acq.types";

/** 파트 산정방식 유효값 — ⑫ Zod enum의 단일 소스(`PartAcqMode`와 같은 집합). */
export const MIXED_PART_ACQ_MODES = ["actual", "estimated", "appraisal", "salesCase"] as const satisfies readonly PartAcqMode[];

/** 파트 모델 판정에 필요한 입력 — 엔진 입력(`MixedUseAssetInput`)과 Zod 출력이 구조적으로 모두 만족한다. */
export interface MixedPartAcqSource {
  separateAcquisition?: MixedSeparateAcquisition | null | undefined;
  /** Date(엔진) 또는 ISO 문자열(Zod) */
  landAcquisitionDate?: Date | string | null | undefined;
  buildingAcquisitionDate?: Date | string | null | undefined;
  partialUsageChange?: { direction: "house_to_commercial" | "commercial_to_house" } | null | undefined;
  transferCause?: string | undefined;
  acquisitionByInheritance?: boolean | undefined;
  acquisitionByGift?: boolean | undefined;
  useActualAcquisition?: boolean | undefined;
  useAppraisalSalesAcquisition?: boolean | undefined;
  acquisitionActualTotalPrice?: number | undefined;
  usePreHousingDisclosure?: boolean | undefined;
  preHousingDisclosure?: { buildingStdPriceAtAcquisition?: number | undefined } | null | undefined;
  capitalExpenditure?: number | undefined;
  housingInheritedExpense?: number | undefined;
  commercialInheritedExpense?: number | undefined;
}

/** 파트 모델 trigger — **객체 존재**. 같은 날 등 부적격은 true로 두고 `assert…`가 막는다(조용한 총액 모델 회귀 금지). */
export function isMixedUsePerPartAcq(a: { separateAcquisition?: unknown }): boolean {
  return a.separateAcquisition !== undefined && a.separateAcquisition !== null;
}

/**
 * **U-1 확정** — 취득시 기준시가 축(H_A·L_b·N·상가 취득시)이 필요한 「취득측 경비」 선언 여부.
 *
 *   `capitalExpenditure > 0` ∨ `housingInheritedExpense > 0` ∨ `commercialInheritedExpense > 0`
 *
 * 자본적지출은 취득시 기준시가로, 파트 직접 경비(주택분·상가분 실제 필요경비)는 취득시 토지:건물 비율로 나뉜다
 * (엔진이 실제로 소비). **양도비(`transferExpense`)는 넣지 않는다** — 양도시 기준시가(항상 필수)로 나뉘어 취득측
 * 값을 소비하지 않는다. 넣으면 소비하지 않는 값을 요구하게 된다(노출 ⇔ 소비).
 * (파트 직접 경비는 현행 엔진 필드 `housingInheritedExpense`·`commercialInheritedExpense`가 매매 실비도 담는다 — U-2.)
 */
export function isMixedExpenseDeclared(s: {
  capitalExpenditure?: number | undefined;
  housingInheritedExpense?: number | undefined;
  commercialInheritedExpense?: number | undefined;
}): boolean {
  return (s.capitalExpenditure ?? 0) > 0 || (s.housingInheritedExpense ?? 0) > 0 || (s.commercialInheritedExpense ?? 0) > 0;
}

export interface MixedPartAcqNeedsInput {
  modes: { land: PartAcqMode; building: PartAcqMode };
  /** 미공시 주택 §164⑦ 3시점 환산(PHD) — 환산 파트가 있을 때만 의미(없으면 X-7 오류). */
  usePhd?: boolean | undefined;
  /** 파트 모델에서는 X-1로 도달 불가 — 기존 술어와 같게 `commercial_to_house`면 주택측 요구를 끈다. */
  partialDirection?: "house_to_commercial" | "commercial_to_house" | undefined;
  /** `isMixedExpenseDeclared` (U-1) */
  expenseDeclared?: boolean | undefined;
  /** 건물 파트 실가 + 주택건물 계약액 입력 — 건물 나목 비율이 필요 없다. */
  buildingContractDeclared?: boolean | undefined;
}

/**
 * **파트 모델에서 무엇이 쓰이는가** — UI ⑤ 노출 · ⑧ 필수 · ⑫ · 엔진이 같은 술어를 부른다(규칙 두 벌 금지).
 *
 * | 모드 조합 | H_A·L_b | N(나목) | 상가 취득시 |
 * |---|---|---|---|
 * | 양쪽 실가 + 계약액 + 취득측 경비 없음 | 불요 | 불요 | 불요 |
 * | 양쪽 실가 + 계약액 없음(S-2 나목비) | 불요 | 필요 | 필요 |
 * | 하나라도 비-실가 **또는** 취득측 경비 선언 | 필요 | 필요 | 필요 |
 * | PHD | PHD 3시점이 대체(불요) | PHD `buildingStdPriceAtAcquisition` | 위와 같음 |
 *
 * 토지 S-1은 면적비라 기준시가가 필요 없다. 기존 필수 술어 3개(`isBuildingDayLandPriceRequired`·
 * `isHousingPriceAtAcqRequired`·`isHousingBuildingStdAtAcqRequired`)가 이 결과를 AND로 받는다 —
 * 파트 모델이 아니면 이 객체가 없어 기존 동작은 불변이다.
 */
export function mixedPartAcqNeeds(i: MixedPartAcqNeedsInput): MixedPartAcqNeeds {
  const nonActual = i.modes.land !== "actual" || i.modes.building !== "actual";
  const expense = i.expenseDeclared === true;
  const phd = i.usePhd === true;
  const c2h = i.partialDirection === "commercial_to_house";
  const buildingSplitNeedsStd = !(i.modes.building === "actual" && i.buildingContractDeclared === true);
  const housingChain = (nonActual || expense) && !phd && !c2h;
  return {
    housingPriceAtAcq: housingChain,
    landPricePerSqmAtBuildingDay: housingChain,
    housingBuildingStdAtAcq: !phd && !c2h && (nonActual || expense || buildingSplitNeedsStd),
    commercialStdAtAcq: nonActual || expense || buildingSplitNeedsStd,
  };
}

/** 계약액을 입력으로 보는가 — 0·미입력 = 계약액 없음. */
function contractOf(sep: MixedSeparateAcquisition): number {
  return sep.housingBuildingContractPrice !== undefined && sep.housingBuildingContractPrice > 0
    ? sep.housingBuildingContractPrice
    : 0;
}

/** 파트 모델이면 `mixedPartAcqNeeds`를, 아니면 undefined(= 기존 술어 불변). 엔진·⑫가 같은 소스에서 조립한다. */
export function mixedPartAcqNeedsOf(s: MixedPartAcqSource): MixedPartAcqNeeds | undefined {
  const sep = s.separateAcquisition;
  if (!sep) return undefined;
  return mixedPartAcqNeeds({
    modes: { land: sep.landMode, building: sep.buildingMode },
    usePhd: s.usePreHousingDisclosure,
    partialDirection: s.partialUsageChange?.direction,
    expenseDeclared: isMixedExpenseDeclared(s),
    buildingContractDeclared: contractOf(sep) > 0,
  });
}

export interface MixedPartAcqIssue {
  /** 결합 제외(`X-1`~`X-7`) 또는 값 누락(`X-6`) */
  code: "X-1" | "X-2" | "X-3" | "X-4" | "X-5" | "X-6" | "X-7";
  message: string;
  /** `mixedUse` 객체 기준 경로 — ⑫가 그대로 `ctx.addIssue`에 쓴다. */
  path: string[];
}

/** 파트가 값 필드를 읽는 모드인가(estimated는 값 없음). */
function landValueField(m: PartAcqMode): "landAcquisitionPrice" | "landSalesCaseValue" | undefined {
  return m === "actual" || m === "appraisal" ? "landAcquisitionPrice" : m === "salesCase" ? "landSalesCaseValue" : undefined;
}
function buildingValueField(m: PartAcqMode): "buildingAcquisitionPrice" | "buildingSalesCaseValue" | undefined {
  return m === "actual" || m === "appraisal" ? "buildingAcquisitionPrice" : m === "salesCase" ? "buildingSalesCaseValue" : undefined;
}

/**
 * 결합 제외 7종 + 값 누락 — **파트 모델일 때만** 적용(총액 모델은 현행 가드 그대로).
 * 엔진 throw · ⑫ superRefine · ⑧이 모두 이 목록을 쓴다(계획서 「제외엔 코드 가드 필수」).
 */
export function collectMixedPartAcqIssues(s: MixedPartAcqSource): MixedPartAcqIssue[] {
  const sep = s.separateAcquisition;
  if (!sep) return [];
  const out: MixedPartAcqIssue[] = [];
  const P = "separateAcquisition";

  if (s.partialUsageChange) {
    out.push({ code: "X-1", path: ["partialUsageChange"], message: `토지·건물 취득가액을 각각 입력하는 방식은 보유 중 일부 용도변경(${MIXED_USE.PARTIAL_USAGE_CHANGE})과 함께 쓸 수 없습니다 — 취득 당시 주택·상가 구성이 시점별로 달라 토지·건물 값을 나눌 면적과 기준시가가 정해지지 않습니다.` });
  }
  if (s.transferCause === "public_expropriation") {
    out.push({ code: "X-2", path: ["transferCause"], message: "토지·건물 취득가액을 각각 입력하는 방식은 공익사업 수용 양도 특례와 함께 쓸 수 없습니다." });
  }
  if (s.acquisitionByInheritance === true || s.acquisitionByGift === true) {
    out.push({ code: "X-3", path: [s.acquisitionByInheritance === true ? "acquisitionByInheritance" : "acquisitionByGift"], message: `토지·건물 취득가액을 각각 입력하는 방식은 매매 취득에만 쓸 수 있습니다 — 상속·증여 취득가액은 상증법 평가액으로 정해집니다(${MIXED_USE.INHERITANCE_DIRECT}).` });
  }
  if (s.useActualAcquisition === true) {
    out.push({ code: "X-4", path: ["useActualAcquisition"], message: "토지·건물 취득가액을 각각 입력하는 방식과 취득가액 총액(실거래가) 입력을 함께 지정할 수 없습니다." });
  }
  if (s.useAppraisalSalesAcquisition === true) {
    out.push({ code: "X-4", path: ["useAppraisalSalesAcquisition"], message: "토지·건물 취득가액을 각각 입력하는 방식과 취득가액 총액(감정가액·매매사례가액) 입력을 함께 지정할 수 없습니다." });
  }
  if ((s.acquisitionActualTotalPrice ?? 0) > 0) {
    out.push({ code: "X-4", path: ["acquisitionActualTotalPrice"], message: "토지·건물 취득가액을 각각 입력하는 방식과 취득가액 총액 입력을 함께 지정할 수 없습니다." });
  }
  if (!areMixedAcqDatesSeparate(s.landAcquisitionDate, s.buildingAcquisitionDate)) {
    out.push({ code: "X-5", path: ["buildingAcquisitionDate"], message: "토지·건물 취득가액을 각각 입력하는 방식은 토지와 건물의 취득일이 서로 다를 때만 쓸 수 있습니다." });
  }

  // X-6 값 누락 — 자동 안분 fallback 금지
  const lf = landValueField(sep.landMode);
  if (lf && !((sep[lf] ?? 0) > 0)) {
    out.push({ code: "X-6", path: [P, lf], message: `토지 ${sep.landMode === "salesCase" ? "매매사례가액" : sep.landMode === "appraisal" ? "감정가액" : "실거래가"}을 입력하세요 — 토지 취득가액은 값 없이 다른 값으로 대신 정하지 않습니다.` });
  }
  const bf = buildingValueField(sep.buildingMode);
  const bv = bf ? sep[bf] ?? 0 : 0;
  if (bf && !(bv > 0)) {
    out.push({ code: "X-6", path: [P, bf], message: `건물 ${sep.buildingMode === "salesCase" ? "매매사례가액" : sep.buildingMode === "appraisal" ? "감정가액" : "실거래가"}을 입력하세요 — 건물 취득가액은 값 없이 다른 값으로 대신 정하지 않습니다.` });
  }
  const contract = contractOf(sep);
  if (contract > 0) {
    if (sep.buildingMode !== "actual") {
      out.push({ code: "X-6", path: [P, "housingBuildingContractPrice"], message: "주택건물 계약액은 건물 취득가액이 실거래가일 때만 입력할 수 있습니다 — 감정가액·매매사례가액은 건물 기준시가 비율로 나눕니다." });
    } else if (bv > 0 && contract >= bv) {
      out.push({ code: "X-6", path: [P, "housingBuildingContractPrice"], message: "주택건물 계약액은 건물 실거래가 총액보다 작아야 합니다 — 상가건물분은 총액에서 주택건물 계약액을 뺀 금액입니다." });
    }
  }

  // X-7 PHD는 환산 파트가 있을 때만 의미가 있다 — 소비처 없는 PHD를 조용히 무시하지 않는다.
  const anyEstimated = sep.landMode === "estimated" || sep.buildingMode === "estimated";
  if (s.usePreHousingDisclosure === true) {
    if (!anyEstimated) {
      out.push({ code: "X-7", path: ["usePreHousingDisclosure"], message: `개별주택가격 미공시 환산(${MIXED_USE.PHD_164_7})은 토지 또는 건물 파트가 환산취득가일 때만 쓸 수 있습니다 — 두 파트 모두 실거래가·감정가액·매매사례가액이면 미공시 환산이 쓰이지 않습니다.` });
    } else if (sep.buildingMode !== "estimated" && !(contractOf(sep) > 0 && sep.buildingMode === "actual")) {
      // S-2 나목 비율의 나목 = PHD가 대체한 건물 취득일 주택건물 기준시가
      if (!((s.preHousingDisclosure?.buildingStdPriceAtAcquisition ?? 0) > 0)) {
        out.push({ code: "X-6", path: ["preHousingDisclosure", "buildingStdPriceAtAcquisition"], message: "건물 취득가액을 주택건물:상가건물로 나누려면 건물 취득일 기준 주택건물 기준시가가 필요합니다(미공시 환산 입력의 「취득 당시 건물 기준시가」)." });
      }
    }
  }
  return out;
}

/** 엔진 진입 가드 — 파트 모델인데 제외 조합·값 누락이면 throw. 총액 모델은 아무것도 하지 않는다. */
export function assertMixedSeparateAcqSupported(s: MixedPartAcqSource): void {
  const issues = collectMixedPartAcqIssues(s);
  if (issues.length > 0) {
    throw new Error(`겸용 별개 취득(토지·건물 취득가액 각각 입력): ${issues[0].message}`);
  }
}

// ──────────────────────────────────────────────────────────────
// 파트 값 적용
// ──────────────────────────────────────────────────────────────

export interface MixedPartAcqApplied {
  housing: HousingGainSplit;
  commercial: CommercialGainSplit;
  /** 단서 판정 전 주택분 취득가액 합 — `MixedUseHousingPart.estimatedAcquisitionPrice` 표시값(총액 모델과 같은 의미). */
  housingAcqTotal: number;
  proviso?: { estimatedSide: number; directSide: number; chosen: "estimated" | "direct" };
  echo: MixedUseSeparateAcquisitionEcho;
}

interface PartWork {
  key: MixedPartKey;
  mode: PartAcqMode;
  /** 값 기준 취득가액(단서 판정 전) */
  acq: number;
  /** 개산공제(est split — 비-실가 파트의 공제) */
  lump: number;
  /** 공통 경비(자본적지출·양도비) 몫(exp split) */
  common: number;
  /** 파트 직접 경비 몫(없으면 undefined) */
  direct: number | undefined;
  basis: number | undefined;
}

/**
 * 현행 환산 경로 split(`est`, 단서 미적용)과 공통경비 split(`exp`, 단서 적용 = 취득가액 0 + 경비 몫)에서
 * 파트별 값으로 갈아끼운다. 양도가액·보유기간·양도시 안분은 **건드리지 않는다**(est 그대로).
 *
 * 호출 전제: `assertMixedSeparateAcqSupported` 통과(값 누락·제외 조합 없음).
 */
export function applyMixedPartAcq(args: {
  asset: MixedUseAssetInput;
  acqDerived: MixedUseDerivedAreas;
  est: { housing: HousingGainSplit; commercial: CommercialGainSplit };
  exp: { housing: HousingGainSplit; commercial: CommercialGainSplit };
}): MixedPartAcqApplied {
  const { asset, acqDerived, est, exp } = args;
  const sep = asset.separateAcquisition;
  if (!sep) throw new Error("겸용 별개 취득: separateAcquisition이 없습니다.");

  // ── 파트 값 → 4부분 ──────────────────────────────────────────
  let hl: number, cl: number;
  let landSplit: MixedUseSeparateAcquisitionEcho["landSplit"];
  if (sep.landMode === "estimated") {
    hl = est.housing.landAcqPrice;
    cl = est.commercial.landAcqPrice;
  } else {
    const lf = landValueField(sep.landMode) as "landAcquisitionPrice" | "landSalesCaseValue";
    // S-1 — 면적비. 면적을 ×100 정수로 올려(부동소수 곱 금지) 같은 필지의 ㎡당 단가가 소거된 비율을 쓴다.
    const hArea = multiplyByArea(100, acqDerived.residentialLandArea);
    const cArea = multiplyByArea(100, acqDerived.commercialLandArea);
    if (hArea + cArea <= 0) throw new Error("겸용 별개 취득: 주택부수토지·상가부수토지 면적이 모두 0이라 토지 값을 나눌 수 없습니다.");
    const p = apportionByStdPrice(sep[lf] as number, hArea, cArea);
    hl = p.land;
    cl = p.building;
    landSplit = { basis: "area_ratio", housingArea: acqDerived.residentialLandArea, commercialArea: acqDerived.commercialLandArea };
  }

  let hb: number, cb: number;
  let buildingSplit: MixedUseSeparateAcquisitionEcho["buildingSplit"];
  if (sep.buildingMode === "estimated") {
    hb = est.housing.buildingAcqPrice;
    cb = est.commercial.buildingAcqPrice;
  } else {
    const bf = buildingValueField(sep.buildingMode) as "buildingAcquisitionPrice" | "buildingSalesCaseValue";
    const total = sep[bf] as number;
    const contract = contractOf(sep);
    if (sep.buildingMode === "actual" && contract > 0) {
      // S-2 계약액 우선 — 상가건물 = 총액 − 주택건물(도출). 계약액 < 총액은 가드가 보장한다.
      hb = contract;
      cb = total - contract;
      buildingSplit = { kind: "contract", contract };
    } else {
      const housingStd =
        asset.usePreHousingDisclosure === true && asset.preHousingDisclosure
          ? asset.preHousingDisclosure.buildingStdPriceAtAcquisition
          : asset.acquisitionStandardPrice.housingBuildingPrice;
      const commercialStd = asset.acquisitionStandardPrice.commercialBuildingPrice;
      if (!(housingStd !== undefined && housingStd > 0) || !(commercialStd > 0)) {
        throw new Error(
          "겸용 별개 취득: 건물 취득가액을 주택건물:상가건물로 나누려면 건물 취득일 기준 주택건물 기준시가(나목)와 상가건물 기준시가가 필요합니다. 용도별 계약액이 있으면 계약액을 입력하세요.",
        );
      }
      const p = apportionByStdPrice(total, housingStd, commercialStd);
      hb = p.land;
      cb = p.building;
      buildingSplit = { kind: "std_ratio", housingStd, commercialStd };
    }
  }

  // ── 파트별 개산공제·경비 재료 ─────────────────────────────────
  const housingDirect = asset.housingInheritedExpense ?? 0;
  const commercialDirect = asset.commercialInheritedExpense ?? 0;
  const hDirect =
    housingDirect > 0 ? splitDeemedExpense(housingDirect, est.housing.landStdPriceAtAcq ?? 0, est.housing.buildingStdPriceAtAcq ?? 0) : undefined;
  const cDirect =
    commercialDirect > 0 ? splitDeemedExpense(commercialDirect, est.commercial.landStdPriceAtAcq ?? 0, est.commercial.buildingStdPriceAtAcq ?? 0) : undefined;

  const parts: PartWork[] = [
    { key: "housingLand", mode: sep.landMode, acq: hl, lump: est.housing.landAppraisalDed, common: exp.housing.landAppraisalDed, direct: hDirect?.landAppraisalDed, basis: est.housing.landStdPriceAtAcq },
    { key: "housingBuilding", mode: sep.buildingMode, acq: hb, lump: est.housing.buildingAppraisalDed, common: exp.housing.buildingAppraisalDed, direct: hDirect?.buildingAppraisalDed, basis: est.housing.buildingStdPriceAtAcq },
    { key: "commercialLand", mode: sep.landMode, acq: cl, lump: est.commercial.landAppraisalDed, common: exp.commercial.landAppraisalDed, direct: cDirect?.landAppraisalDed, basis: est.commercial.landStdPriceAtAcq },
    { key: "commercialBuilding", mode: sep.buildingMode, acq: cb, lump: est.commercial.buildingAppraisalDed, common: exp.commercial.buildingAppraisalDed, direct: cDirect?.buildingAppraisalDed, basis: est.commercial.buildingStdPriceAtAcq },
  ];

  // ── 파트별 필요경비 결정 ─────────────────────────────────────
  //  actual: 실제 필요경비(직접 경비 우선, 없으면 공통 경비 몫) — §97②1호 가산
  //  appraisal·salesCase·estimated: 개산공제(§163⑥) — 경비 미반영(§97②2호 본문)
  const finalAcq = new Map<MixedPartKey, number>();
  const finalDed = new Map<MixedPartKey, number>();
  const deemed = new Map<MixedPartKey, boolean>();
  for (const p of parts) {
    finalAcq.set(p.key, p.acq);
    if (p.mode === "actual") {
      finalDed.set(p.key, p.direct ?? p.common);
      deemed.set(p.key, false);
    } else {
      finalDed.set(p.key, p.lump);
      deemed.set(p.key, true);
    }
  }

  // ── §97②2호 단서 — 환산 파트 묶음 판정 ────────────────────────
  const group = parts.filter((p) => p.mode === "estimated");
  const provisoDeclared = asset.capitalExpenditure !== undefined || asset.transferExpense !== undefined;
  let proviso: MixedPartAcqApplied["proviso"];
  let provisoGroup: MixedUseSeparateAcquisitionEcho["provisoGroup"];
  if (group.length > 0 && provisoDeclared) {
    const estimatedSide = group.reduce((s, p) => s + p.acq + p.lump, 0);
    const directSide = group.reduce((s, p) => s + p.common, 0);
    // 동률(==)은 본문 — 단서가 「적은 경우」로 명시한다(현행 자산 단위 판정과 같은 규칙).
    const chosen: "estimated" | "direct" = directSide > estimatedSide ? "direct" : "estimated";
    proviso = { estimatedSide, directSide, chosen };
    provisoGroup = {
      parts: [...(sep.landMode === "estimated" ? (["land"] as const) : []), ...(sep.buildingMode === "estimated" ? (["building"] as const) : [])],
      estimatedSide,
      directSide,
      chosen,
    };
    if (chosen === "direct") {
      // 가목이 「환산취득가액 + 개산공제」의 합계액이라 나목 채택 시 취득가액을 따로 빼면 이중차감 — 취득가액 0 + 경비 몫.
      for (const p of group) {
        finalAcq.set(p.key, 0);
        finalDed.set(p.key, p.common);
        deemed.set(p.key, false);
      }
    }
  }

  // ── split 재조립 (양도가액·보유기간은 est 그대로) ─────────────
  const acq = (k: MixedPartKey) => finalAcq.get(k) as number;
  const ded = (k: MixedPartKey) => finalDed.get(k) as number;
  const hLandGain = est.housing.landTransferPrice - acq("housingLand") - ded("housingLand");
  const hBuildingGain = est.housing.buildingTransferPrice - acq("housingBuilding") - ded("housingBuilding");
  const cLandGain = est.commercial.landTransferPrice - acq("commercialLand") - ded("commercialLand");
  const cBuildingGain = est.commercial.buildingTransferPrice - acq("commercialBuilding") - ded("commercialBuilding");

  const housing: HousingGainSplit = {
    ...est.housing,
    landAcqPrice: acq("housingLand"),
    buildingAcqPrice: acq("housingBuilding"),
    landAppraisalDed: ded("housingLand"),
    buildingAppraisalDed: ded("housingBuilding"),
    landGain: hLandGain,
    buildingGain: hBuildingGain,
    totalGain: hLandGain + hBuildingGain,
  };
  const commercial: CommercialGainSplit = {
    ...est.commercial,
    estimatedAcqPrice: cl + cb,
    landAcqPrice: acq("commercialLand"),
    buildingAcqPrice: acq("commercialBuilding"),
    landAppraisalDed: ded("commercialLand"),
    buildingAppraisalDed: ded("commercialBuilding"),
    landGain: cLandGain,
    buildingGain: cBuildingGain,
    totalGain: cLandGain + cBuildingGain,
  };

  const partEcho = (p: PartWork): MixedPartAcqPartEcho => ({
    mode: p.mode,
    acquisitionPrice: acq(p.key),
    deemedDeduction: deemed.get(p.key) as boolean,
    ...(p.mode !== "actual" && p.basis !== undefined ? { basis: p.basis } : {}),
  });
  const byKey = (k: MixedPartKey) => partEcho(parts.find((p) => p.key === k) as PartWork);
  const echo: MixedUseSeparateAcquisitionEcho = {
    landMode: sep.landMode,
    buildingMode: sep.buildingMode,
    parts: {
      housingLand: byKey("housingLand"),
      housingBuilding: byKey("housingBuilding"),
      commercialLand: byKey("commercialLand"),
      commercialBuilding: byKey("commercialBuilding"),
    },
    ...(landSplit ? { landSplit } : {}),
    ...(buildingSplit ? { buildingSplit } : {}),
    ...(provisoGroup ? { provisoGroup } : {}),
  };

  return { housing, commercial, housingAcqTotal: hl + hb, ...(proviso ? { proviso } : {}), echo };
}
