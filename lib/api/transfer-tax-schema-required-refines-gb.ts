/**
 * 양도세 ⑫ — **일반건물**(`generalBuildingValuation`)이 필요로 하는데 Zod가 비워 두게 두던 값
 * (2026-09-30 Zod↔엔진 필수 점검 2차 · 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.2).
 *
 * 여기 있는 항목은 모두 비워 보내면 400이 아니라 **200 + 다른 세액**이었다(route·엔진이 빈 값을 0·
 * 다른 분기로 조용히 채운다) — 또는 `TaxCalculationError`(경로 없는 400)였다. 조건은 각 항목에 적은
 * ⑧ 위치의 거울이다(3중 패턴 — 어긋나면 「⑧ 통과 ↔ ⑫ 400」 모순이 된다).
 *
 * 두 진입점:
 *   - `refineGbValuationRequired` — `generalBuildingValuationSchema` superRefine에서 부른다.
 *     서브객체만으로 판정되는 규칙이라 단건·다건·컴패니언·지분 카드 모두에 걸린다.
 *   - `refineGbPropertyRequired` — 자산-수준 값(`transferType`·`acquisitionPrice`·
 *     `useEstimatedAcquisition`)이 필요한 규칙. `refinePropertyRequiredInputs`(단건·다건 주 자산)에서 부른다.
 */
import { z } from "zod";
import { usesBundledPartAcquisition } from "@/lib/tax-engine/general-building-part-acq";

type Issue = (path: (string | number)[], message: string) => void;
const issuer = (ctx: z.RefinementCtx, prefix: (string | number)[]): Issue => (path, message) =>
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...prefix, ...path], message });
const positive = (v: number | undefined) => typeof v === "number" && v > 0;

type PartMode = "actual" | "estimated" | "appraisal" | "salesCase";

type CarryoverPartLike = {
  giftDateAssetValue: number;
  useEstimatedAcquisition: boolean;
  donorAcquisitionPrice?: number;
  donorStandardPriceAtAcquisition?: number;
};
type CarryoverLegacyLike = {
  giftDateValuation: number;
  useEstimatedAcquisition: boolean;
  donorAcquisitionPrice?: number;
  donorStandardPriceAtAcquisition?: number;
  donorRelation?: string;
  donorDeceased?: boolean;
};

/** `generalBuildingValuationSchema`의 출력 중 여기서 읽는 필드. */
export type GbValuationLike = {
  actualPriceMode?: boolean;
  landAcqMode?: PartMode;
  buildingAcqMode?: PartMode;
  landAcquisitionPrice?: number;
  buildingAcquisitionPrice?: number;
  landSalesCaseValue?: number;
  buildingSalesCaseValue?: number;
  landDirectExpenses?: number;
  buildingDirectExpenses?: number;
  capitalExpenditure?: number;
  acquisitionLandPricePerSqm?: number;
  acquisitionBuildingStdPrice?: number;
  landAcquisitionCause?: string;
  buildingAcquisitionCause?: string;
  decedentAcquisitionDate?: string;
  buildingDecedentAcquisitionDate?: string;
  acquisitionByInheritance?: boolean;
  buildingAcquisitionByInheritance?: boolean;
  inheritedLandValue?: number;
  inheritedBuildingValue?: number;
  extensionInfo?: unknown;
  bundledAcquisitionPrice?: number;
  carryoverGiftEvent?: { giftTaxBase: number; donorRelation?: string; donorDeceased?: boolean };
  landCarryoverPart?: CarryoverPartLike;
  buildingCarryoverPart?: CarryoverPartLike;
  landCarryoverTaxation?: CarryoverLegacyLike;
  buildingCarryoverTaxation?: CarryoverLegacyLike;
};

/**
 * 서브객체만으로 판정되는 규칙.
 */
export function refineGbValuationRequired(v: GbValuationLike, ctx: z.RefinementCtx) {
  const issue = issuer(ctx, []);

  // D1 — 토지 상속: 피상속인 취득일(§95④·§104②1호 단기보유 통산). 엔진 GB 경로는 이 서브객체의 값을
  //      읽는다(최상위 `decedentAcquisitionDate`가 아니다) — 비우면 상속개시일부터 기산해 단기세율이 됐다.
  //      ⑧ `transfer-tax-validate-gb-required.ts` `validateGbDecedentDates`.
  if (v.landAcquisitionCause === "inheritance" && !v.decedentAcquisitionDate)
    issue(["decedentAcquisitionDate"], "상속으로 취득한 토지는 피상속인 취득일이 필요합니다 (소득세법 §95④·§104②1호)");

  // D3 — 건물 상속: 건물 피상속인 취득일. 토지도 상속이면 토지의 피상속인 취득일을 함께 쓴다
  //      (엔진 `buildingDecedentAcquisitionDate ?? decedentAcquisitionDate` — 같은 fallback).
  if (
    v.buildingAcquisitionCause === "inheritance" &&
    !v.buildingDecedentAcquisitionDate &&
    !(v.landAcquisitionCause === "inheritance" && v.decedentAcquisitionDate)
  )
    issue(["buildingDecedentAcquisitionDate"], "상속으로 취득한 건물은 피상속인 취득일이 필요합니다 (소득세법 §95④·§104②1호)");

  // I2 — 환산 경로(증축 없음)의 **비-환산 파트**는 그 파트의 취득가액이 필요하다. 비우면 엔진이
  //      `TaxCalculationError`(경로 없음)를 던졌다. ⑧ `transfer-tax-validate-gb.ts` V-7(상속 파트는
  //      평가액이 ④에서 이 칸으로 실린다 — V3·V4). 감정·실가 = `*AcquisitionPrice`, 매매사례 = `*SalesCaseValue`
  //      (2026-10-06 A1 F-1 — 종전엔 매매사례를 「이 칸을 읽지 않는다」며 제외했으나 값 필드가 신설됐다).
  //      분리 OFF 자산 단위 감정·매매사례는 파트 값 대신 일괄 총액(`bundledAcquisitionPrice`)이 원천이다 —
  //      엔진과 **같은 술어**(`usesBundledPartAcquisition`)로 판정한다.
  if (v.actualPriceMode !== true && v.extensionInfo === undefined) {
    const lm = v.landAcqMode ?? "estimated";
    const bm = v.buildingAcqMode ?? "estimated";
    const usesBundled = usesBundledPartAcquisition({ ...v, landAcqMode: lm, buildingAcqMode: bm });
    if (!usesBundled) {
      if (lm !== "estimated" && !positive(lm === "salesCase" ? v.landSalesCaseValue : v.landAcquisitionPrice))
        issue(
          [lm === "salesCase" ? "landSalesCaseValue" : "landAcquisitionPrice"],
          `환산이 아닌 토지 파트는 토지 취득가액(${lm === "salesCase" ? "매매사례가액" : lm === "appraisal" ? "감정가액" : "실지거래가액"})이 필요합니다 (소득세법 §97①1호)`,
        );
      if (bm !== "estimated" && !positive(bm === "salesCase" ? v.buildingSalesCaseValue : v.buildingAcquisitionPrice))
        issue(
          [bm === "salesCase" ? "buildingSalesCaseValue" : "buildingAcquisitionPrice"],
          `환산이 아닌 건물 파트는 건물 취득가액(${bm === "salesCase" ? "매매사례가액" : bm === "appraisal" ? "감정가액" : "실지거래가액"})이 필요합니다 (소득세법 §97①1호)`,
        );
    }
  }

  // Q-A3 — 증축(3파트) × **자산 단위(분리 OFF)** 감정가액·매매사례가액 **차단** (2026-10-06 사용자 확정).
  //        3파트 안분은 파트 값이 없는 파트를 「원건물 일괄 실가」로 계산하고 개산공제를 0으로 둔다 — 감정·매매사례 모드가
  //        **조용히 무시**된다(G-2의 3-way판). 파트 값이 있는 분리 ON 파트 감정·매매사례는 `applyPartAcqModes`가 처리하므로
  //        여기서 막지 않는다. ⑧ R9(A2)의 거울.
  if (v.extensionInfo !== undefined) {
    const own = (m: PartMode | undefined, price?: number, sales?: number) =>
      m === "salesCase" ? positive(sales) : positive(price);
    const landBlocked =
      (v.landAcqMode === "appraisal" || v.landAcqMode === "salesCase") &&
      !own(v.landAcqMode, v.landAcquisitionPrice, v.landSalesCaseValue);
    const buildingBlocked =
      (v.buildingAcqMode === "appraisal" || v.buildingAcqMode === "salesCase") &&
      !own(v.buildingAcqMode, v.buildingAcquisitionPrice, v.buildingSalesCaseValue);
    if (landBlocked || buildingBlocked)
      issue([landBlocked ? "landAcqMode" : "buildingAcqMode"], GB_EXTENSION_UNIFIED_ESTIMATE_MESSAGE);
  }
}

/** Q-A3 차단 문구 — ⑧ R9(A2)와 **같은 문자열**을 쓴다(UI 통과 ↔ 서버 400 문구 불일치 방지). */
export const GB_EXTENSION_UNIFIED_ESTIMATE_MESSAGE =
  "증축분이 있으면 원건물 취득가액을 감정가액·매매사례가액으로 산정할 수 없습니다. 「실거래가」 또는 「환산취득가」를 선택하세요.";

type GbPropertyLike = {
  transferType?: string;
  acquisitionPrice?: number;
  useEstimatedAcquisition: boolean;
  generalBuildingValuation?: unknown;
};

/**
 * 자산-수준 값이 필요한 규칙. 부담부증여는 §159가 취득가액을 정하고 ⑧도 자체 분기에서 종결하므로
 * (⑧ `transfer-tax-validate-gb.ts` 부담부증여 분기) 여기 규칙을 걸지 않는다.
 */
export function refineGbPropertyRequired(data: GbPropertyLike, ctx: z.RefinementCtx) {
  const v = data.generalBuildingValuation as GbValuationLike | null | undefined;
  if (!v || data.transferType === "burdened_gift") return;
  const issue = issuer(ctx, ["generalBuildingValuation"]);
  const bothInherited = v.acquisitionByInheritance === true && v.buildingAcquisitionByInheritance === true;
  const anyInherited = v.acquisitionByInheritance === true || v.buildingAcquisitionByInheritance === true;
  // route와 같은 값 — `route.ts`의 `bundledAcq`(일괄 취득가액 = 서브객체 값 우선, 없으면 자산 취득가액)
  const bundled = v.bundledAcquisitionPrice ?? data.acquisitionPrice ?? 0;
  const bothPartPrices = positive(v.landAcquisitionPrice) && positive(v.buildingAcquisitionPrice);

  if (v.actualPriceMode === true) {
    // I1 — 두 파트 모두 상속: 실가 경로는 상속개시일 평가액을 그대로 취득가액으로 배정한다
    //      (`general-building-route-actual.ts` `inheritedLandValue ?? 0`). ⑧ V3·V4.
    if (bothInherited) {
      if (!positive(v.inheritedLandValue))
        issue(["inheritedLandValue"], "상속으로 취득한 토지는 상속개시일 평가액이 필요합니다 (소득세법 시행령 §163⑨)");
      if (!positive(v.inheritedBuildingValue))
        issue(["inheritedBuildingValue"], "상속으로 취득한 건물은 상속개시일 평가액이 필요합니다 (소득세법 시행령 §163⑨)");
    }

    // I3 — 취득가액 원천: 파트별 실지거래가액 두 칸, 또는 일괄 취득가액. 둘 다 없으면 실가 경로가
    //      취득가액 **0**으로 계산했다. ⑧ V-7(분리 ON 파트 칸) · `validateGbBundledAcquisitionPrice`(분리 OFF 일괄 칸).
    //      이월과세 파트는 증여자 기준 값으로 따로 계산되므로(⑧도 일괄 칸을 요구하지 않는다) 제외한다.
    const carryover =
      v.landAcquisitionCause === "carryover_gift" || v.buildingAcquisitionCause === "carryover_gift";
    if (!bothInherited && !carryover && !bothPartPrices && !(bundled > 0)) {
      if (positive(v.landAcquisitionPrice))
        issue(["buildingAcquisitionPrice"], "건물 취득가액이 필요합니다 — 토지만 있으면 취득가액을 나눌 수 없습니다 (소득세법 §97①1호)");
      else if (positive(v.buildingAcquisitionPrice))
        issue(["landAcquisitionPrice"], "토지 취득가액이 필요합니다 — 건물만 있으면 취득가액을 나눌 수 없습니다 (소득세법 §97①1호)");
      else
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acquisitionPrice"],
          message: "일반건물 실지거래가액 — 토지·건물 일괄 취득가액 또는 파트별 취득가액 두 칸이 필요합니다 (소득세법 §97①1호)",
        });
    }

    // Z4·Z5 — 취득 축 안분(일괄 취득가액·자산 단위 자본적지출)에는 취득시 기준시가 **두 값**이 필요하다
    //         (§100② 「취득 당시」). 한쪽만 있으면 비율이 0/1로 기울고, 둘 다 없으면 route가 던졌다.
    //         ⑧ V-5b `needsGbActualAcqStdPrice`와 같은 조건(두 파트 상속은 취득가액을 안분하지 않는다).
    const splitsAcquisition = !bothInherited && !bothPartPrices && bundled > 0;
    const splitsCapex =
      positive(v.capitalExpenditure) &&
      !(v.landDirectExpenses !== undefined && v.buildingDirectExpenses !== undefined);
    if (splitsAcquisition || splitsCapex) {
      if (!positive(v.acquisitionLandPricePerSqm))
        issue(["acquisitionLandPricePerSqm"], "취득시 토지 공시지가가 필요합니다 — 취득가액·자본적지출을 토지·건물로 나누는 기준입니다 (소득세법 §100②)");
      if (!positive(v.acquisitionBuildingStdPrice))
        issue(["acquisitionBuildingStdPrice"], "취득시 건물기준시가 총액이 필요합니다 — 취득가액·자본적지출을 토지·건물로 나누는 기준입니다 (소득세법 §100②)");
    }
  } else if (v.extensionInfo !== undefined) {
    // X1 — 증축(3파트) 실가: 토지·건물1 일괄 취득가액. 비우면 route가 0을 주입했다.
    //      ⑧ 「토지·건물 일괄 취득가액을 입력하세요」(상속 파트·환산·분리 ON 제외) — 분리 ON은 파트 칸이 대신한다.
    const partSatisfied = (m: PartMode | undefined, price: number | undefined, sales: number | undefined) =>
      (m ?? "estimated") === "estimated" || positive(m === "salesCase" ? sales : price);
    const partsSatisfied =
      partSatisfied(v.landAcqMode, v.landAcquisitionPrice, v.landSalesCaseValue) &&
      partSatisfied(v.buildingAcqMode, v.buildingAcquisitionPrice, v.buildingSalesCaseValue);
    if (!anyInherited && !data.useEstimatedAcquisition && !partsSatisfied && !(bundled > 0))
      issue(["bundledAcquisitionPrice"], "증축이 있는 일반건물 — 토지·건물1 일괄 취득가액이 필요합니다 (사례 33 · 소득세법 §97①1호)");
  }

  refineGbCarryover(v, issue);
}

/**
 * C1~C4 — 이월과세(§97의2) 파트 입력. ⑧ `transfer-tax-validate-gb-carryover.ts`의 거울.
 * 비우면 `composeGbCarryover`가 그 파트의 이월과세를 **조용히 빼고**(일반 증여로 계산) 증여자 가액은 0으로 읽었다.
 */
function refineGbCarryover(v: GbValuationLike, issue: Issue) {
  const landC = v.landAcquisitionCause === "carryover_gift";
  const buildingC = v.buildingAcquisitionCause === "carryover_gift";
  if (!landC && !buildingC) return;
  const ev = v.carryoverGiftEvent;
  const relationOf = (legacy?: CarryoverLegacyLike) => ev?.donorRelation ?? legacy?.donorRelation;
  const deceasedOf = (legacy?: CarryoverLegacyLike) => ev?.donorDeceased ?? legacy?.donorDeceased;

  const parts: Array<["land" | "building", CarryoverPartLike | undefined, CarryoverLegacyLike | undefined]> = [];
  if (landC) parts.push(["land", v.landCarryoverPart, v.landCarryoverTaxation]);
  if (buildingC) parts.push(["building", v.buildingCarryoverPart, v.buildingCarryoverTaxation]);

  let partValueSum = 0;
  for (const [part, p, legacy] of parts) {
    const noun = part === "land" ? "토지" : "건물";
    // 관계 「그 외」는 엔진이 §97의2① 요건 불충족으로 미적용을 판정한다 — 증여자 기준 값은 쓰이지 않는다
    // (주 자산 규칙 `refineCarryoverTaxation(…, rejectOtherRelation=false)`와 같다).
    if (relationOf(legacy) === "other") continue;
    if (deceasedOf(legacy) && !relationOf(legacy))
      issue([ev ? "carryoverGiftEvent" : `${part}CarryoverTaxation`, "donorRelation"], "증여자 사망 선언 시 증여자와의 관계가 필요합니다 (소득세법 §97의2①)");
    if (p) {
      if (!ev) {
        issue(["carryoverGiftEvent"], `${noun} 파트 이월과세 입력(${part}CarryoverPart)은 증여 사건(carryoverGiftEvent)과 함께 보내야 합니다 (소득세법 시행령 §163의2②)`);
        continue;
      }
      partValueSum += p.giftDateAssetValue;
      checkDonorValues(p.giftDateAssetValue, p, [`${part}CarryoverPart`], noun, "giftDateAssetValue", issue);
    } else if (legacy) {
      checkDonorValues(legacy.giftDateValuation, legacy, [`${part}CarryoverTaxation`], noun, "giftDateValuation", issue);
    } else {
      issue([`${part}CarryoverPart`], `이월과세(증여)로 취득한 ${noun}은 이월과세 입력(${part}CarryoverPart 또는 ${part}CarryoverTaxation)이 필요합니다 (소득세법 §97의2)`);
    }
  }
  // Σ — 파트 평가액 합이 증여세 과세가액을 넘으면 증여세 상당액 합이 산출세액을 초과한다(⑧ 같은 검사).
  if (ev && ev.giftTaxBase > 0 && partValueSum > ev.giftTaxBase)
    issue(["carryoverGiftEvent", "giftTaxBase"], "파트별 증여 당시 평가액 합계가 증여세 과세가액을 초과합니다 (소득세법 시행령 §163의2②)");
}

function checkDonorValues(
  giftValue: number,
  p: { useEstimatedAcquisition: boolean; donorAcquisitionPrice?: number; donorStandardPriceAtAcquisition?: number },
  path: string[],
  noun: string,
  valueKey: string,
  issue: Issue,
) {
  if (!positive(giftValue))
    issue([...path, valueKey], `${noun} 이월과세 — 증여 당시 평가액이 필요합니다 (비교과세 시나리오 B 취득가액)`);
  if (p.useEstimatedAcquisition) {
    if (!positive(p.donorStandardPriceAtAcquisition))
      issue([...path, "donorStandardPriceAtAcquisition"], `${noun} 이월과세 환산 — 증여자 취득 당시 기준시가가 필요합니다 (환산 분자)`);
  } else if (!positive(p.donorAcquisitionPrice)) {
    issue([...path, "donorAcquisitionPrice"], `${noun} 이월과세 — 증여자의 취득가액이 필요합니다 (소득세법 §97의2①1호)`);
  }
}
