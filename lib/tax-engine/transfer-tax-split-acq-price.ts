/**
 * 분리취득(토지·건물 별개 취득) — **취득가액 산정**.
 *
 * `transfer-tax-split-gain.ts`에서 분리했다(800줄 정책). 그 파일은 이 결과로 **양도차익**을
 * 만들고, 방향은 한쪽뿐이다(취득가액 → 차익). 여기서는 차익을 계산하지 않는다.
 *
 * 종전 import 경로 호환을 위해 `transfer-tax-split-gain.ts`가 공개 3종을 재export한다.
 */
import type {
  TransferTaxInput,
  SplitLandExpropriationValuationDetail,
} from "./types/transfer.types";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import {
  calcLandStdPriceAtAcq,
  calcDerivedBuildingStdAtAcq,
} from "@/lib/calc/transfer-tax-split-acq-mode";
import { applySplitLandExpropriationValuation } from "./transfer-tax-expropriation-valuation";

/**
 * 취득시 기준시가 — 토지분·건물분 산출 (축 B). 산출 불가 시 null.
 *
 * 토지분은 항상 `㎡당 개별공시지가 × 면적`(소득세법 §99①1호 가목)이다.
 * 건물분은 자산 종류에 따라 **공시 구조가 다르다**:
 *
 * - **주택(라목)**: 개별주택가격·공동주택가격은 **부수토지를 포함한 결합 공시**다.
 *   건물분 단독 공시가 존재하지 않으므로 `결합 총액 − 토지분` 역산이 정본이며,
 *   이 역산이 `토지분 + 건물분 ≡ 라목 총액` 항등성을 지켜 개산공제 합계를
 *   법정액(§163⑥2호가목 = 라목 가액 × 3/100)과 일치시킨다.
 *
 * - **일반 건물(가목 토지 + 나목 건물)**: 개별공시지가와 국세청장 산정 건물 기준시가가
 *   **각각 별도로 공시**된다. 결합 총액이라는 공시 자체가 없고 사용자가 더한 값일 뿐이다.
 *   토지·건물 취득시점이 다르면 각 파트는 **자기 취득일의 고시분**으로 조회해야 하는데
 *   (§164③ 직전 고시분), 총액에서 역산하면 건물분에 토지 취득시점이 섞인다.
 *   → 별개 취득 + 건물 기준시가 명시 입력 시 **파트별 독립**으로 전환한다.
 */
export function calcAcqStdPair(
  input: TransferTaxInput,
): { land: number | null; building: number | null; buildingDerived: boolean } | null {
  // 산식은 `lib/calc`의 단일 소스를 쓴다 — UI 표시가 같은 함수를 공유해야
  // 절사 규약이 갈리지 않는다(표시 411,459 vs 계산 411,460 드리프트 방지).
  const landStd = calcLandStdPriceAtAcq(
    input.standardPricePerSqmAtAcquisition ?? 0,
    input.acquisitionArea ?? 0,
  );

  const buildingStd = input.buildingStandardPriceAtAcquisition;
  // **주택도 포함**한다(2026-07-30). §163⑥2호가목은 "라목의 주택 **취득당시**의 라목 가액 × 3/100"
  // 이라 **취득 당시 라목 주택으로서의 가액이 존재**해야 적용된다. 토지를 먼저 취득하고 건물을
  // 나중에 신축·취득했다면 토지 취득 당시엔 주택이 없어 라목 결합 공시 자체가 없고,
  // 각 파트에 §163⑥1호(토지)·2호(건물)가 따로 적용된다.
  if (input.isSeparateAcquisition === true && buildingStd != null) {
    // 파트별 독립 — 결합 총액(standardPriceAtAcquisition)을 참조하지 않는다.
    // 혼합 역산(신규 land + (레거시 총액 − 신규 land)) 금지: 서로 다른 취득시점 값의 뺄셈은 근거가 없다.
    //
    // ⚠️ **토지분이 null이어도 쌍을 버리지 않는다**(2026-07-30). 종전에는 토지분이 없으면 쌍 전체를
    //    null로 만들어, 토지=실거래가 + 건물=환산에서 **계산에 쓰이지도 않는 토지 기준시가**를
    //    강제했다(미입력 시 throw). 파트별 필요 여부는 호출부가 `requiresAcqStdPricePart`로
    //    판정한다 — 필요한 파트가 null이면 그 파트를 지목해 차단한다.
    return { land: landStd, building: buildingStd, buildingDerived: false };
  }

  // 레거시 역산 — 주택(정상 경로) 및 건물 기준시가 미입력 시(한시 후퇴).
  // 산식은 `lib/calc`의 단일 소스를 쓴다.
  if (landStd != null) {
    const building = calcDerivedBuildingStdAtAcq(input.standardPriceAtAcquisition ?? 0, landStd);
    if (building != null) return { land: landStd, building, buildingDerived: true };
  }

  // 역산 불가(총액 미입력 등). **별개취득만** 파트별 부분 산출로 후퇴한다 — 실가 파트의 기준시가는
  // 계산에 등장하지 않으므로 한쪽만 알아도 그 파트는 정상 산출된다(필요 여부는 호출부가 판정).
  // 비-별개취득은 총액 안분이 전제라 부분 산출이 의미 없으므로 **종전대로 쌍 전체 null**.
  if (input.isSeparateAcquisition !== true) return null;
  return { land: landStd, building: buildingStd ?? null, buildingDerived: false };
}

/**
 * 안분 비율 산출 — 토지 기준시가 / (토지 + 건물) 기준시가.
 *
 * 분모를 `input.standardPriceAtAcquisition`이 아니라 **파트 합계**로 두는 것이 정본이다.
 * 레거시 역산 경로에서는 두 값이 항등이라 산출값이 완전히 동일하다:
 *   · `landStd ≤ total` → `building = total − land` → 합 = total (동일)
 *   · `landStd > total` → `building = 0` → 합 = landStd → 비율 1 (종전 `min(land/total, 1)`과 동일)
 * 파트별 독립 경로에서는 합계가 유일하게 옳은 분모다(결합 총액이 애초에 공시되지 않음).
 */
export function calcApportionRatio(input: TransferTaxInput): { land: number; building: number } | null {
  const pair = calcAcqStdPair(input);
  // 비율은 **양쪽이 모두 있을 때만** 정의된다 — 한쪽만 아는 상태에서 비율을 만들면
  // "토지 0% : 건물 100%" 같은 침묵 오산출이 된다. 소비부는 술어가 이미 차단한다.
  if (!pair || pair.land == null || pair.building == null) return null;
  const total = pair.land + pair.building;
  if (total <= 0) return null;
  const landRatio = Math.min(pair.land / total, 1);
  return { land: landRatio, building: 1 - landRatio };
}

/**
 * 토지/건물 쌍 분리 — 입력 우선 → 한쪽만 있으면 반대쪽은 잔액 → 둘 다 없으면 기준시가 비율 안분.
 *
 * 소득령 §166⑥: 실지거래가액 확인 시 그 가액, **구분할 수 없는 때**에만 기준시가 비율로 안분.
 * 한쪽만 아는 경우 반대쪽은 `총액 − 입력값`으로 **유일하게 확정**되므로 안분이 아니라 도출이다
 * (총액은 필수 입력). 종전에는 반대쪽을 비율로 채워 합계가 총액과 어긋났다(건물만 입력 시).
 *
 * ⚠️ overflow(입력 > 총액)는 여기서 clamp하지 않는다 — validate가 차단한다.
 *    엔진이 조용히 0으로 깎으면 오답이 눈에 안 띈다.
 */
export function splitPair(
  total: number,
  landIn: number | undefined,
  buildingIn: number | undefined,
  landRatio: number | null,
  what = "가액",
): { land: number; building: number } {
  if (landIn != null && buildingIn != null) return { land: landIn, building: buildingIn };
  if (landIn != null) return { land: landIn, building: total - landIn };
  if (buildingIn != null) return { land: total - buildingIn, building: buildingIn };
  // 양쪽 미입력 → 비율 안분이 유일한 도출 수단. 비율이 없으면 **조용히 0으로 메우지 않는다**.
  // `requiresAcqStdPrice`가 이 경로를 이미 차단하므로 도달 불가 — 도달했다면 술어 버그다.
  if (landRatio == null) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `${what}을 토지·건물로 나눌 수 없습니다 — 파트별 금액 또는 취득시 기준시가(㎡당 개별공시지가 × 면적)를 입력하세요.`,
      { what },
    );
  }
  const land = Math.floor(total * landRatio);
  return { land, building: total - land };
}

/** `calcPartAcquisitionPrice` 컨텍스트 — 종전 클로저가 `input`에서 캡처하던 값 그대로. */
export interface PartAcqPriceContext {
  /** 별개 취득(파트별 완결) 여부 — API 변환이 파생해 전달한 값 */
  isSeparate: boolean;
  /** 취득시 기준시가 토지 비율 (비-별개취득 안분용). 없으면 null */
  landRatio: number | null;
  landAcquisitionPrice?: number;
  buildingAcquisitionPrice?: number;
  landSalesCaseValue?: number;
  buildingSalesCaseValue?: number;
  /** 자산 전체 총액 — 비-별개취득에서만 안분 base로 쓰인다 */
  acquisitionPrice?: number;
  appraisalValue?: number;
  similarSalesValue?: number;
}

/**
 * **파트 1개의 취득가액** — 4방식(실가·환산·감정·매매사례) 단일 정본.
 *
 * `calcSplitAcquisitionPrice` 내부 클로저(`calcOnePart`)에서 최상위로 승격했다(2026-08-05 P3).
 * **분기 순서·산식·null 승격 규약을 글자 그대로 보존**한다 — 주택·건물 split 경로의 회귀 0이
 * 조건이다(memory `feedback_800line_split_export_preservation`).
 *
 * 승격 이유: 일반건물 전용 경로(`general-building-route-helper.ts`)가 같은 산정을 필요로 하는데,
 * 클로저인 채로는 재구현밖에 방법이 없어 dual-truth가 된다(계획서 D-1 안 B).
 *
 * 반환 `null` = **미입력**이다. 호출부가 차단해야 하며 `?? 0`으로 메우면 감정·매매사례에서
 * "취득가액 0 + 개산공제 3%"라는 그럴듯한 소액이 남아 오답이 눈에 띄지 않는다.
 */
export function calcPartAcquisitionPrice(
  mode: PartAcqMode,
  isLand: boolean,
  partTransferPrice: number,
  partStdAtAcq: number,
  partStdAtTransfer: number,
  ctx: PartAcqPriceContext,
): number | null {
  const { isSeparate, landRatio } = ctx;
  switch (mode) {
    case "estimated":
      // 환산취득가: 파트 양도가 × (파트 취득시 기준시가 / 파트 양도시 기준시가)
      // — 총액 미참조 구조라 별개 취득 여부와 무관하게 동일.
      return partStdAtTransfer > 0
        ? Math.floor(partTransferPrice * (partStdAtAcq / partStdAtTransfer))
        : 0;
    case "salesCase": {
      // 매매사례가액(소령 §176의2③1호) — 파트별 명시 입력(land/buildingSalesCaseValue) 우선.
      const own = isLand ? ctx.landSalesCaseValue : ctx.buildingSalesCaseValue;
      if (own != null) return own;
      if (isSeparate) return null;
      // 동시 취득(겸용·selfOwns 강제 분리 등) — 총액이 실재하므로 §166⑥ "구분할 수 없는 때" 안분.
      const base = ctx.similarSalesValue ?? ctx.acquisitionPrice ?? 0;
      // 비율 없이 조용히 나누지 않는다 — 술어(requiresAcqStdPrice 1절: 비-actual 파트)가
      // salesCase를 이미 걸러내므로 도달 불가 방어선이다.
      const pair = splitPair(base, undefined, undefined, landRatio, "매매사례가액");
      return isLand ? pair.land : pair.building;
    }
    case "appraisal": {
      // 감정가액 — 감정평가서가 토지·건물을 각각 평가하는 경우가 많아 직접 입력 허용(실거래가와 동일 구조).
      const own = isLand ? ctx.landAcquisitionPrice : ctx.buildingAcquisitionPrice;
      if (isSeparate) return own ?? null;
      const base = ctx.appraisalValue ?? ctx.acquisitionPrice ?? 0;
      const pair = splitPair(base, ctx.landAcquisitionPrice, ctx.buildingAcquisitionPrice, landRatio, "취득가액");
      return isLand ? pair.land : pair.building;
    }
    case "actual":
    default: {
      const own = isLand ? ctx.landAcquisitionPrice : ctx.buildingAcquisitionPrice;
      if (isSeparate) return own ?? null;
      const base = ctx.acquisitionPrice ?? 0;
      const pair = splitPair(base, ctx.landAcquisitionPrice, ctx.buildingAcquisitionPrice, landRatio, "취득가액");
      return isLand ? pair.land : pair.building;
    }
  }
}


/**
 * `splitPair`가 음수 잔액(또는 총액 초과 합)을 만드는 입력인가 — **validate 전용 판정식**.
 *
 * splitPair의 분기와 1:1로 대응한다(dual-truth 회피). validate가 이 함수를 import해
 * 엔진과 같은 규칙으로 차단하므로 "UI 통과 ↔ validate 차단" 모순이 생기지 않는다.
 * 엔진 자신은 clamp하지 않는다 — 조용히 0으로 깎으면 오답이 눈에 띄지 않기 때문.
 */
export function isSplitPairOverflow(
  total: number,
  landIn: number | undefined,
  buildingIn: number | undefined,
): boolean {
  // 둘 다 입력 시 splitPair는 총액과 무관하게 입력값을 그대로 쓴다 → **합 ≠ 총액이면 차단**.
  // `>`만 막으면 **과소 합이 침묵 통과**한다: 양도가액 축에서 합 < 총액 = 양도차익 과소 = 세액 과소.
  // (예: 총 10억인데 토지 3억 + 건물 3억 → 양도차익 4억 과소). 초과·미달 모두 모순 입력이다.
  if (landIn != null && buildingIn != null) return landIn + buildingIn !== total;
  // 한쪽만 입력 → 반대쪽은 잔액이므로 합은 항상 총액. 입력값이 총액을 넘을 때만 음수 발생.
  if (landIn != null) return landIn > total;
  if (buildingIn != null) return buildingIn > total;
  return false; // 둘 다 미입력 → 비율 안분 → 모순 불가
}

/** 파트별 취득 방식 (Phase A — 토지·건물 독립 4-way) */
export type PartAcqMode = "actual" | "estimated" | "appraisal" | "salesCase";

/**
 * 파트 모드 미제공 시 자산 전체 플래그에서 파생 — 기존 단일-모드 판정과 100% 동일.
 * landAcqMode/buildingAcqMode 둘 다 미제공이면 land/building 모두 이 값으로 귀결되므로
 * 레거시 경로(calcSplitAcquisitionPrice의 예전 단일 분기)와 산출값이 완전히 일치한다.
 */
export function deriveLegacyAcqMode(input: TransferTaxInput): PartAcqMode {
  if (input.useEstimatedAcquisition) return "estimated";
  if (input.acquisitionMethod === "appraisal") return "appraisal";
  if (input.acquisitionMethod === "salesCase") return "salesCase";
  return "actual";
}

/*
 * 🗑️ `calcSaleApportionRatio`는 **2026-08-06(Phase 1-C)에 제거**됐다.
 *
 * 양도가액 안분은 이제 `transfer-tax-split-sale-price.ts`의 `resolveTransferPriceSplit`
 * → `sale-split-apportion-basis.ts`의 `resolveSaleApportionBasis`가 단일 정본이다. 그쪽은
 * **비율이 아니라 금액 쌍**을 낸다 — §100③이 「안분계산한 **가액**」과의 차이를 보므로 비교 대상이
 * 금액이어야 하고, 부가령 §64①1호 **단서**(감정평가가액 우선) 서열도 함께 담긴다.
 *
 * 비율 함수를 남겨 두면 「기준시가 비율」과 「basis 서열 적용 금액」이 갈려 dual-truth가 된다
 * (메모리 `feedback_ui_engine_dual_truth_avoidance`). 이 자리 표식은 lib/calc의 주석들이
 * 옛 이름을 가리키고 있어 이동 경로를 남기기 위한 것이다.
 */

/**
 * §6.1 SoT — 파트별 취득 모드에서 자산 전체 `useEstimatedAcquisition` 단방향 파생.
 * 어느 한 파트든 환산(estimated)이면 true. Phase C(UI/API 배관) 소비자용 헬퍼 —
 * 본 Phase A0/A/B에서는 아직 호출부 없음(엔진 코어만 우선 정리).
 */
export function deriveUseEstimatedAcquisitionFromParts(
  landAcqMode: PartAcqMode | undefined,
  buildingAcqMode: PartAcqMode | undefined,
): boolean {
  return landAcqMode === "estimated" || buildingAcqMode === "estimated";
}

/** 취득가액 분리 — 파트별 독립 4-way(실가/환산/감정/매매사례). 모드 미제공 파트는 자산 전체 플래그 파생. */
export function calcSplitAcquisitionPrice(
  input: TransferTaxInput,
  landTransferPrice: number,
  buildingTransferPrice: number,
  landStdAtAcq: number,
  buildingStdAtAcq: number,
  landRatio: number | null,
): {
  land: number;
  building: number;
  landMode: PartAcqMode;
  buildingMode: PartAcqMode;
  splitLandExpropriationValuationDetail?: SplitLandExpropriationValuationDetail;
} {
  const landMode: PartAcqMode = input.landAcqMode ?? deriveLegacyAcqMode(input);
  const buildingMode: PartAcqMode = input.buildingAcqMode ?? deriveLegacyAcqMode(input);
  // 별개 취득 판정은 엔진이 재판정하지 않는다 — API 변환이 `isSeparateAcquisition`
  // (lib/calc/transfer-tax-split-acq-mode.ts)로 파생해 전달한다. 엔진은 폼 전용 플래그
  // (hasSeperateLandAcquisitionDate·isMixedUseHouse)를 볼 수 없으므로 재현이 불가능하고,
  // 재구현하면 dual-truth가 된다.
  const isSeparate = input.isSeparateAcquisition === true;

  // 환산(estimated) 분모 — 양도시 기준시가 파트별.
  // ⚠️ `landRatio`(취득시 비율) 후퇴는 **비율이 산출된 경우에만** 가능하다. 케이스 a(양쪽 실가)는
  //    비율 자체가 없고 이 값도 쓰이지 않으므로 0으로 둔다(환산 파트가 없어 분모가 소비되지 않음).
  const totalStdAtTransfer = input.standardPriceAtTransfer ?? 0;
  const landStdAtTransferBase = input.landStandardPriceAtTransfer
    ?? (landRatio != null ? Math.floor(totalStdAtTransfer * landRatio) : 0);
  const buildingStdAtTransfer = input.buildingStandardPriceAtTransfer
    ?? Math.max(totalStdAtTransfer - landStdAtTransferBase, 0);

  // §164⑨1호 공익수용 특례 — **토지분이 환산(estimated) 모드일 때만** 분모를 min[]로 낮춘다
  // (건물분 무변경 — 시행규칙 §80⑧, 계획 D16-GB). 미충족 시 null → landStdAtTransferBase 유지(회귀 0).
  let landStdAtTransfer = landStdAtTransferBase;
  let splitLandExpropriationValuationDetail: SplitLandExpropriationValuationDetail | undefined;
  if (landMode === "estimated") {
    const landExprVal = applySplitLandExpropriationValuation({
      propertyType: input.propertyType,
      useEstimatedAcquisition: true,
      transferCause: input.transferCause,
      transferDate: input.transferDate,
      landStdTotalAtTransfer: landStdAtTransferBase,
      compensationTotal: input.splitLandCompensationTotal,
      compensationBasisTotal: input.splitLandCompensationBasisTotal,
    });
    landStdAtTransfer = landExprVal?.denominator ?? landStdAtTransferBase;
    splitLandExpropriationValuationDetail = landExprVal?.detail;
  }

  /**
   * 별개 취득(`isSeparateAcquisition`) 자산에서 **취득가액 축은 파트별로 완결**한다 —
   * 총액(`acquisitionPrice`·`appraisalValue`·`similarSalesValue`)을 일절 참조하지 않는다.
   *
   * 토지를 먼저 사고 건물을 나중에 지은(또는 승계한) 자산은 취득가액이 애초에 **두 개**다.
   * "총액"은 사후 합계일 뿐 실재하지 않으므로, 그것을 기준으로 잔액(`총액 − 반대편`)을 도출하거나
   * 기준시가 비율로 안분하면 각 파트의 실지거래가액과 무관한 값이 나온다
   * (소득세법 §97①1호 "그 자산 취득에 든 실지거래가액" · §114⑦ · 소득령 §176의2③ — **자산별** 추계).
   *
   * 매매사례가액도 마찬가지다 — §176의2③1호의 탐색 창이 **각 파트 취득일 전후 3개월**로
   * 서로 다르므로, 서로 다른 시점의 사례를 하나로 묶어 안분할 법적 근거가 없다.
   *
   * 미입력은 `null`로 승격해 호출부가 차단한다. `?? 0`으로 메우면 감정·매매사례 모드에서
   * "취득가액 0 + 개산공제 3%"라는 그럴듯한 소액이 남아 오답이 눈에 띄지 않는다.
   */
  const partCtx: PartAcqPriceContext = {
    isSeparate,
    landRatio,
    landAcquisitionPrice: input.landAcquisitionPrice,
    buildingAcquisitionPrice: input.buildingAcquisitionPrice,
    landSalesCaseValue: input.landSalesCaseValue,
    buildingSalesCaseValue: input.buildingSalesCaseValue,
    acquisitionPrice: input.acquisitionPrice,
    appraisalValue: input.appraisalValue,
    similarSalesValue: input.similarSalesValue,
  };

  const landRaw = calcPartAcquisitionPrice(landMode, true, landTransferPrice, landStdAtAcq, landStdAtTransfer, partCtx);
  const buildingRaw = calcPartAcquisitionPrice(buildingMode, false, buildingTransferPrice, buildingStdAtAcq, buildingStdAtTransfer, partCtx);

  // 미입력 차단 — **본인 소유 파트만** 대상. `selfOwns≠both`이면 비소유 파트의 gain은
  // 상위(transfer-tax.ts:315)에서 버려지므로 그 파트의 미입력은 오답을 만들지 않는다.
  const selfOwns = input.selfOwns ?? "both";
  const missing: string[] = [];
  if (landRaw == null && selfOwns !== "building_only") missing.push("토지");
  if (buildingRaw == null && selfOwns !== "land_only") missing.push("건물");
  if (missing.length > 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `토지·건물을 서로 다른 시점에 취득한 자산은 ${missing.join("·")} 취득가액을 각각 입력해야 합니다 — `
        + `나머지 금액에서 자동 계산되지 않습니다 (소득세법 §97①1호·§114⑦, 소득령 §176의2③).`,
      { missingParts: missing, landMode, buildingMode },
    );
  }

  return {
    land: landRaw ?? 0,
    building: buildingRaw ?? 0,
    landMode,
    buildingMode,
    splitLandExpropriationValuationDetail,
  };
}
