/**
 * 토지/건물 취득일 분리 양도차익 계산 모듈
 *
 * housing·building 자산에서 토지와 건물의 취득일이 다른 경우
 * (원시취득·신축·승계취득 시점 차이 등) 각각의 양도차익을 계산한다.
 *
 * 소득세법 §95②, 소득령 §166⑥·§168②:
 * - 양도가액·취득가액·필요경비·개산공제를 토지/건물 각각 구분 계산
 * - 실제 가액 확인 시 그 가액 사용, 미확인 시 기준시가 비율로 안분
 */

import { estimatedDeductionRate } from "./legal-codes";
import type {
  TransferTaxInput,
  SplitGainResult,
  SplitPartResult,
  SplitLandExpropriationValuationDetail,
} from "./types/transfer.types";
import { applyRate, calculateHoldingPeriod, computeEstimatedDeduction, computeLumpSumDeductionBase } from "./tax-utils";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { requiresAcqStdPrice } from "@/lib/calc/transfer-tax-split-acq-mode";
import { calcLandStdPriceAtAcq } from "@/lib/calc/transfer-tax-split-acq-mode";
import { calcPreHousingDisclosureGain } from "./transfer-tax-pre-housing-disclosure";
import {
  applySplitLandExpropriationValuation,
  applyHousingExpropriationValuation,
} from "./transfer-tax-expropriation-valuation";

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
function calcAcqStdPair(input: TransferTaxInput): { land: number; building: number } | null {
  // 산식은 `lib/calc`의 단일 소스를 쓴다 — UI 읽기 전용 표시가 같은 함수를 공유해야
  // 절사 규약이 갈리지 않는다(표시 411,459 vs 계산 411,460 드리프트 방지).
  const landStd = calcLandStdPriceAtAcq(
    input.standardPricePerSqmAtAcquisition ?? 0,
    input.acquisitionArea ?? 0,
  );
  if (landStd == null) return null;

  const buildingStd = input.buildingStandardPriceAtAcquisition;
  if (input.propertyType === "building" && input.isSeparateAcquisition === true && buildingStd != null) {
    // 파트별 독립 — 결합 총액(standardPriceAtAcquisition)을 참조하지 않는다.
    // 혼합 역산(신규 land + (레거시 총액 − 신규 land)) 금지: 서로 다른 취득시점 값의 뺄셈은 근거가 없다.
    return { land: landStd, building: buildingStd };
  }

  // 레거시 역산 — 주택(정상 경로) 및 건물 기준시가 미입력 시(한시 후퇴).
  const total = input.standardPriceAtAcquisition ?? 0;
  if (total <= 0) return null;
  return { land: landStd, building: Math.max(total - landStd, 0) };
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
function calcApportionRatio(input: TransferTaxInput): { land: number; building: number } | null {
  const pair = calcAcqStdPair(input);
  if (!pair) return null;
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
function splitPair(
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
type PartAcqMode = "actual" | "estimated" | "appraisal" | "salesCase";

/**
 * 파트 모드 미제공 시 자산 전체 플래그에서 파생 — 기존 단일-모드 판정과 100% 동일.
 * landAcqMode/buildingAcqMode 둘 다 미제공이면 land/building 모두 이 값으로 귀결되므로
 * 레거시 경로(calcSplitAcquisitionPrice의 예전 단일 분기)와 산출값이 완전히 일치한다.
 */
function deriveLegacyAcqMode(input: TransferTaxInput): PartAcqMode {
  if (input.useEstimatedAcquisition) return "estimated";
  if (input.acquisitionMethod === "appraisal") return "appraisal";
  if (input.acquisitionMethod === "salesCase") return "salesCase";
  return "actual";
}

/**
 * 양도가액 안분 비율 — **양도시** 기준시가 비율 (부가가치세법 시행령 §64①1호 "공급계약일(=양도)
 * 현재 기준시가" 준용, 소득령 §166⑥). 토지·건물 양도시 기준시가가 **모두** 명시 입력된 경우에만
 * 산출한다 — 부분 입력을 임의로 보완(자동 안분)하지 않는다.
 */
export function calcSaleApportionRatio(
  input: TransferTaxInput,
): { land: number; building: number } | null {
  const landStd = input.landStandardPriceAtTransfer;
  const buildingStd = input.buildingStandardPriceAtTransfer;
  if (landStd == null || buildingStd == null) return null;
  const total = landStd + buildingStd;
  if (total <= 0) return null;
  const landRatio = Math.min(landStd / total, 1);
  return { land: landRatio, building: 1 - landRatio };
}

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
function calcSplitAcquisitionPrice(
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
  function calcOnePart(
    mode: PartAcqMode,
    isLand: boolean,
    partTransferPrice: number,
    partStdAtAcq: number,
    partStdAtTransfer: number,
  ): number | null {
    switch (mode) {
      case "estimated":
        // 환산취득가: 파트 양도가 × (파트 취득시 기준시가 / 파트 양도시 기준시가)
        // — 총액 미참조 구조라 별개 취득 여부와 무관하게 동일.
        return partStdAtTransfer > 0
          ? Math.floor(partTransferPrice * (partStdAtAcq / partStdAtTransfer))
          : 0;
      case "salesCase": {
        // 매매사례가액(소령 §176의2③1호) — 파트별 명시 입력(land/buildingSalesCaseValue) 우선.
        const own = isLand ? input.landSalesCaseValue : input.buildingSalesCaseValue;
        if (own != null) return own;
        if (isSeparate) return null;
        // 동시 취득(겸용·selfOwns 강제 분리 등) — 총액이 실재하므로 §166⑥ "구분할 수 없는 때" 안분.
        const base = input.similarSalesValue ?? input.acquisitionPrice ?? 0;
        // 비율 없이 조용히 나누지 않는다 — 술어(requiresAcqStdPrice 1절: 비-actual 파트)가
        // salesCase를 이미 걸러내므로 도달 불가 방어선이다.
        const pair = splitPair(base, undefined, undefined, landRatio, "매매사례가액");
        return isLand ? pair.land : pair.building;
      }
      case "appraisal": {
        // 감정가액 — 감정평가서가 토지·건물을 각각 평가하는 경우가 많아 직접 입력 허용(실거래가와 동일 구조).
        const own = isLand ? input.landAcquisitionPrice : input.buildingAcquisitionPrice;
        if (isSeparate) return own ?? null;
        const base = input.appraisalValue ?? input.acquisitionPrice ?? 0;
        const pair = splitPair(base, input.landAcquisitionPrice, input.buildingAcquisitionPrice, landRatio, "취득가액");
        return isLand ? pair.land : pair.building;
      }
      case "actual":
      default: {
        const own = isLand ? input.landAcquisitionPrice : input.buildingAcquisitionPrice;
        if (isSeparate) return own ?? null;
        const base = input.acquisitionPrice ?? 0;
        const pair = splitPair(base, input.landAcquisitionPrice, input.buildingAcquisitionPrice, landRatio, "취득가액");
        return isLand ? pair.land : pair.building;
      }
    }
  }

  const landRaw = calcOnePart(landMode, true, landTransferPrice, landStdAtAcq, landStdAtTransfer);
  const buildingRaw = calcOnePart(buildingMode, false, buildingTransferPrice, buildingStdAtAcq, buildingStdAtTransfer);

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

/**
 * 토지/건물 분리 양도차익 계산.
 * landAcquisitionDate 미제공 또는 지원 대상 아닌 propertyType 시 null 반환.
 *
 * preHousingDisclosure 제공 시: §164⑤ 3-시점 알고리즘으로 취득시 기준시가 추정 후 안분.
 * 미제공 시: 기존 standardPricePerSqmAtAcquisition × acquisitionArea 기반 안분.
 *
 * [알려진 한계] 단기세율 혼합 케이스:
 *   토지 보유기간은 길지만 건물 보유기간이 2년 미만인 경우, 현재는 acquisitionDate(건물 취득일)
 *   기준 단일 세율이 전체에 적용된다. 건물에만 단기세율, 토지에는 누진세율을 파트별로 분리
 *   적용하는 로직은 미구현 (실무 발생 빈도 극히 낮음, 향후 과제).
 */
export function calcSplitGain(input: TransferTaxInput): SplitGainResult | null {
  if (!input.landAcquisitionDate) return null;
  if (input.propertyType !== "housing" && input.propertyType !== "building") return null;

  // 파트별 모드 조기 파생 — PHD 게이트 판정용(혼합 모드 시 오발동 방지).
  const earlyLandMode: PartAcqMode = input.landAcqMode ?? deriveLegacyAcqMode(input);
  const earlyBuildingMode: PartAcqMode = input.buildingAcqMode ?? deriveLegacyAcqMode(input);

  // ── 개별주택가격 미공시 취득 경로 (§164⑤) ──
  // 토지·건물 **모두** 환산(estimated)일 때만 진입 — 혼합 모드(예: 토지 실가+건물 환산)는
  // PHD 3-시점 알고리즘이 아니라 아래 파트별 경로로 처리한다(2026-07-28 게이트 강화).
  if (input.preHousingDisclosure && earlyLandMode === "estimated" && earlyBuildingMode === "estimated") {
    return calcSplitGainPreDisclosure(input);
  }

  // 양도시 기준시가 비율 — 술어와 본체(:352 상당)가 **공유**한다(중복 호출 제거).
  const saleRatio = calcSaleApportionRatio(input);

  const ratio = calcApportionRatio(input);
  // 취득시 기준시가는 취득가액을 **환산해야 할 때만** 필요하다. 양쪽 실가를 아는 케이스에서는
  // 계산 어디에도 등장하지 않으므로 진입을 막지 않는다(계획서 §3·§4.1, 사용자 확정 규칙 ③).
  // 종전에는 무조건 `if (!ratio) return null`이라, 파트 실가를 다 입력해도 분리 계산이
  // **오류 없이 비활성**되고 호출부가 단일자산 경로(취득가액 0)로 흘려 세액이 과대 산출됐다.
  // 판정은 UI·validate와 **같은 술어**(lib/calc — dual-truth 회피).
  if (
    !ratio &&
    requiresAcqStdPrice(input, {
      landMode: earlyLandMode,
      buildingMode: earlyBuildingMode,
      // 엔진은 별개취득을 재판정하지 않는다 — API 변환이 파생해 전달한다(:187-190 주석).
      isSeparate: input.isSeparateAcquisition === true,
      hasSaleRatio: saleRatio != null,
    })
  ) {
    // **별개 취득만 차단한다.** 그 경우 자산 전체 취득가액 칸이 UI에서 사라지므로, 단일 자산
    // 경로로 흘리면 취득가액 0 → 양도차익이 양도가액 전액이 된다(조용한 과대과세).
    // 비-별개취득(겸용·소유자분리 등 취득일 동일)은 총액이 실재해 단일 자산 경로가 정상 산출을
    // 내므로 **종전대로 null**을 유지한다 — 회귀 0.
    if (input.isSeparateAcquisition !== true) return null;
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "환산·감정·매매사례 취득가액 계산에는 취득시 ㎡당 개별공시지가와 토지 면적이 필요합니다 "
        + "(소득세법 §99①1호 가목).",
      { landMode: earlyLandMode, buildingMode: earlyBuildingMode },
    );
  }

  // ratio 미산출(케이스 a) 시 null 전파 — `0`으로 메우면 미래에 소비 지점이 추가됐을 때
  // 조용히 "토지 0% 안분"이 된다. 실제 소비부는 위 술어가 이미 걸러냈으므로 도달하지 않는다.
  const landRatio: number | null = ratio ? ratio.land : null;
  const buildingRatio: number | null = ratio ? ratio.building : null;

  // 취득시 기준시가 — 토지/건물 분리 (축 B). ratio와 **같은 소스**에서 산출한다
  // (calcAcqStdPair) — 별도 재계산하면 파트별 독립 경로에서 비율과 금액이 어긋난다.
  const acqStd = calcAcqStdPair(input); // 케이스 a에서는 null (술어가 소비부 도달을 차단)
  const landStdAtAcq = acqStd?.land ?? 0;
  const buildingStdAtAcq = acqStd?.building ?? 0;
  // 건물분이 결합 총액에서 역산된 값인가 — 주택(라목)은 **법정 정상 경로**, 건물은 한시 후퇴 표식.
  // 취득시 기준시가를 실제로 쓴 경우에만 "역산" 안내를 띄운다 — 실가 파트는 그 값을
  // 쓰지 않았으므로 안내가 거짓이 된다(결과 카드 fine-print, SplitGainDetailSection).
  const buildingStdDerivedFromTotal = acqStd != null && !(
    input.propertyType === "building" &&
    input.isSeparateAcquisition === true &&
    input.buildingStandardPriceAtAcquisition != null
  );

  // ① 양도가액 분리 — 소득령 §166⑥ → 부가가치세법 시행령 §64①1호 준용
  //    ("공급계약일 = **양도 현재**의 기준시가" 비율).
  //
  // ⚠️ **취득시 비율(landRatio)로 후퇴하지 않는다** (2026-07-29 사용자 확정 규칙 ①).
  //    종전에는 `saleRatio?.land ?? landRatio`로, 양도시 기준시가가 없으면 취득시 비율을
  //    조용히 썼다(회귀 0 목적의 한시 코드). 그러나 토지는 오르고 건물은 감가하므로 두 시점의
  //    비율은 크게 다르고(실측: 취득시 40% vs 양도시 80% → 토지 양도가액 4억 차이), 취득시
  //    비율로 양도대가를 나눌 법령 근거가 없다.
  //    → 근거가 없으면 `splitPair`가 차단한다(조용한 오답 금지). 사용자는 계약서 구분금액을
  //      입력하거나 양도시 토지·건물 기준시가를 입력해 해소한다(validate가 선차단).
  const totalTransfer = input.transferPrice;
  const effectiveSaleLandRatio = saleRatio?.land ?? null;
  const { land: landTransferPrice, building: buildingTransferPrice } = splitPair(
    totalTransfer,
    input.landTransferPrice,
    input.buildingTransferPrice,
    effectiveSaleLandRatio,
    "양도가액",
  );

  // ② 취득가액 분리 (파트별 독립 4-way — 환산 모드 시 토지분 §164⑨1호 특례 산출근거 동반)
  const {
    land: landAcqPrice,
    building: buildingAcqPrice,
    landMode,
    buildingMode,
    splitLandExpropriationValuationDetail,
  } = calcSplitAcquisitionPrice(
    input,
    landTransferPrice,
    buildingTransferPrice,
    landStdAtAcq,
    buildingStdAtAcq,
    landRatio,
  );

  // ③ 필요경비(자본적지출) 분리
  const totalExpenses = input.expenses ?? 0;
  // ⚠️ 이 쌍은 **총액 > 0일 때만** 안분/잔액 대상이다.
  //    `input.expenses`는 deprecated `directExpenses`에서 오므로(transfer-tax-api.ts:224-229)
  //    신규 입력 경로(capitalExpenditure)에선 **항상 0**이다. 그때 토지/건물 자본적지출 칸은
  //    "총액의 안분"이 아니라 **독립 입력**이며, 잔액 규칙을 적용하면 `0 − 입력값`이 음수가 되어
  //    반대편 공제를 상쇄해버린다(건물만 3천만 → 토지 −3천만 → 공제 전액 소멸 = 세액 과대).
  //    총액 > 0(legacy directExpenses)일 때만 잔액/안분으로 합계 불변식을 지킨다.
  // ⚠️ 계산값만 산출한다. swap 자격(explicitDirect)은 아래 호출부가 **입력 원본**
  //    (input.*DirectExpenses !== undefined)을 직접 보므로 여기 결과에서 파생시키면 안 된다.
  const { land: landDirectExp, building: buildingDirectExp } =
    totalExpenses > 0
      ? splitPair(totalExpenses, input.landDirectExpenses, input.buildingDirectExpenses, landRatio, "자본적지출")
      : { land: input.landDirectExpenses ?? 0, building: input.buildingDirectExpenses ?? 0 };

  // ④ 개산공제 — 파트별 모드가 환산·감정·매매사례일 때만 (소득령 §163⑥). 실가(actual) 파트는 0.
  // salesCase 추가(2026-07-16): 비-split(transfer-tax-helpers.ts:339-348)은 매매사례가액에도
  // 개산공제를 적용하고 directExp를 차감하지 않는데, split만 실가 early-return으로 빠져 정반대로
  // 동작했다(개산공제 0 + directExp 전액 차감) → 드리프트 해소.
  // ⚠️ §97② swap은 이 플래그가 아니라 파트 모드==="estimated" 단독 게이트(아래 applyAssetSwap)라
  //    salesCase 추가에도 무영향 — "환산모드 전용" 정책 유지. 파트별 독립(2026-07-28 mixed-mode).
  const landNonActual = landMode !== "actual";
  const buildingNonActual = buildingMode !== "actual";
  // 공유지분 축소(§163⑥ base) — 기준시가는 물건 전체(100%)로 유지하고 여기서만 지분을 적용한다.
  const ownRatio = input.ownershipRatio;
  // §104③ 미등기양도자산 → 3/1000 (단일 판정점 경유)
  const dedRate = estimatedDeductionRate(input.isUnregistered);
  const landAppraisalDed = landNonActual
    ? computeEstimatedDeduction(landStdAtAcq, dedRate, ownRatio)
    : 0;
  // ⚠️ **성분별 독립 floor가 정본이다. 잔액 흡수(「총액분 − 토지분」)를 넣지 말 것.**
  //    **소득세법 §100②**이 토지·건물 등을 함께 양도한 경우 "이를 **각각 구분하여 기장**"하도록
  //    규정하고, **소득령 §163⑥**은 1호(토지)·2호가목(건물·주택)을 **별개 호**로 열거해 각각
  //    자기 base × 3/100으로 정한다 — 「라목 총액 × 3% 하나가 법정액」을 강제하는 문언이 없다.
  //    (§166⑥은 "가액의 구분이 **불분명한 때**"의 안분방법만 규정 — 근거 조문이 아니다.)
  //    2026-07-28 흡수를 시도했다가 PHD Excel 정본 anchor(`pre-housing-disclosure.test.ts` D-7-2)와
  //    1원 어긋나 14건이 깨졌다. 같은 §166⑥ 구조이므로 여기도 독립 floor로 통일한다. 재시도 방지 기록.
  const buildingAppraisalDed = buildingNonActual
    ? computeEstimatedDeduction(buildingStdAtAcq, dedRate, ownRatio)
    : 0;

  const landSwap = applyAssetSwap(
    landAcqPrice,
    landDirectExp,
    landAppraisalDed,
    input.landDirectExpenses !== undefined,
    landNonActual,
    landMode === "estimated",
  );
  const buildingSwap = applyAssetSwap(
    buildingAcqPrice,
    buildingDirectExp,
    buildingAppraisalDed,
    input.buildingDirectExpenses !== undefined,
    buildingNonActual,
    buildingMode === "estimated",
  );

  // §97② 2호 단서 swap 시 필요경비 = directExp 단독 → 환산취득가액(acqPrice) 미차감.
  const landGain = landTransferPrice - (landSwap.swapApplied ? 0 : landAcqPrice) - landSwap.effectiveDirect - landSwap.effectiveAppraisalDed;
  const buildingGain = buildingTransferPrice - (buildingSwap.swapApplied ? 0 : buildingAcqPrice) - buildingSwap.effectiveDirect - buildingSwap.effectiveAppraisalDed;

  // ⑥ 보유연수 (민법 초일불산입)
  const { years: landHoldingYears } = calculateHoldingPeriod(
    input.landAcquisitionDate,
    input.transferDate,
  );
  const { years: buildingHoldingYears } = calculateHoldingPeriod(
    input.acquisitionDate,
    input.transferDate,
  );

  const landPart: SplitPartResult = {
    transferPrice: landTransferPrice,
    acquisitionPrice: landAcqPrice,
    directExpenses: landSwap.effectiveDirect,
    appraisalDeduction: landSwap.effectiveAppraisalDed,
    stdPriceAtAcq: landNonActual ? landStdAtAcq : undefined,
    lumpDeductionBase: landNonActual
      ? computeLumpSumDeductionBase(landStdAtAcq, ownRatio)
      : undefined,
    gain: landGain,
    holdingYears: landHoldingYears,
    longTermRate: 0,
    longTermDeduction: 0,
    swapApplied: landSwap.swapApplied,
    acqMode: landMode,
    // 토지분은 항상 `㎡당 공시지가 × 면적`(§99①1호 가목) — 역산이 아니다.
    stdPriceDerivedFromTotal: false,
  };

  const buildingPart: SplitPartResult = {
    transferPrice: buildingTransferPrice,
    acquisitionPrice: buildingAcqPrice,
    directExpenses: buildingSwap.effectiveDirect,
    appraisalDeduction: buildingSwap.effectiveAppraisalDed,
    stdPriceAtAcq: buildingNonActual ? buildingStdAtAcq : undefined,
    lumpDeductionBase: buildingNonActual
      ? computeLumpSumDeductionBase(buildingStdAtAcq, ownRatio)
      : undefined,
    gain: buildingGain,
    holdingYears: buildingHoldingYears,
    longTermRate: 0,
    longTermDeduction: 0,
    swapApplied: buildingSwap.swapApplied,
    acqMode: buildingMode,
    stdPriceDerivedFromTotal: buildingStdDerivedFromTotal,
  };

  return {
    land: landPart,
    building: buildingPart,
    // 케이스 a(양쪽 실가)는 안분 자체를 하지 않으므로 비율이 **정의되지 않는다**.
    // `{0,0}`으로 메우면 "안분비 토지 0.0% : 건물 100.0%"로 침묵 오표시된다.
    ...(landRatio != null && buildingRatio != null ? { apportionRatio: { land: landRatio, building: buildingRatio } } : {}),
    note:
      landRatio != null && buildingRatio != null
        ? `토지 ${landHoldingYears}년 + 건물 ${buildingHoldingYears}년 분리 (안분비 토지 ${(landRatio * 100).toFixed(1)}% : 건물 ${(buildingRatio * 100).toFixed(1)}%)`
        : `토지 ${landHoldingYears}년 + 건물 ${buildingHoldingYears}년 분리 (파트별 실지거래가액 — 기준시가 안분 미적용)`,
    selfOwns: input.selfOwns ?? "both",
    splitLandExpropriationValuationDetail,
  };
}

/**
 * §164⑤ 경로: 개별주택가격 미공시 취득 + 3-시점 환산취득가 분리 계산.
 * calcPreHousingDisclosureGain() 결과로 SplitGainResult 구성.
 */
// ⑤ §97② 단서 swap (환산/감정가액 모드 + 자산별 직접경비 명시 입력 시)
// 본문: acqPrice(환산) + appraisalDed(개산공제). directExp는 차감 안 함.
// 단서: directExp > (acqPrice + appraisalDed) → directExp로 swap.
// 자산 단위(파트별) 독립 적용 — 토지/건물 각각 비교.
function applyAssetSwap(
  acqPrice: number,
  directExp: number,
  appraisalDed: number,
  explicitDirect: boolean,
  nonActualMode: boolean,
  isEstimatedMode: boolean,
): { effectiveDirect: number; effectiveAppraisalDed: number; swapApplied: boolean } {
  if (!nonActualMode) {
    // 실가 모드 — directExp 그대로 차감, 개산공제 없음
    return { effectiveDirect: directExp, effectiveAppraisalDed: 0, swapApplied: false };
  }
  if (!explicitDirect) {
    // 자산별 명시 입력 없음 → 본문만, swap 불가
    return { effectiveDirect: 0, effectiveAppraisalDed: appraisalDed, swapApplied: false };
  }
  const estimatedSide = acqPrice + appraisalDed;
  // §97② 2호 단서는 취득가액을 '환산취득가액'으로 하는 경우 전용 — 감정·매매사례가액 모드는 swap 없이 본문(개산공제)만.
  if (isEstimatedMode && directExp > estimatedSide) {
    // 단서 — directExp로 swap (개산공제 미적용). 필요경비 = directExp 단독이므로 취득가액도 미차감(gain 산식에서 처리).
    return { effectiveDirect: directExp, effectiveAppraisalDed: 0, swapApplied: true };
  }
  // 본문 — 개산공제만, directExp 차감 안 함
  return { effectiveDirect: 0, effectiveAppraisalDed: appraisalDed, swapApplied: false };
}

function calcSplitGainPreDisclosure(input: TransferTaxInput): SplitGainResult {
  // §164⑨1호 공익수용 특례 — 양도시 개별주택가격(P_T)을 min(개별주택가격, 보상액, 보상기초)로 낮춰
  // **환산 분모에만** 주입한다(안분은 원 P_T 유지 — D16-GB 동형, 법령 검증 완료). 주택 총액 트랙 재사용.
  const housingExprVal = applyHousingExpropriationValuation({
    propertyType: input.propertyType,
    useEstimatedAcquisition: input.useEstimatedAcquisition,
    transferCause: input.transferCause,
    transferDate: input.transferDate,
    standardTotalAtTransfer: input.preHousingDisclosure!.transferHousingPrice,
    compensationTotal: input.housingCompensationTotal,
    compensationBasisTotal: input.housingCompensationBasisTotal,
  });
  const phd = calcPreHousingDisclosureGain(
    input.transferPrice,
    { ...input.preHousingDisclosure!, ownershipRatio: input.ownershipRatio, isUnregistered: input.isUnregistered },
    housingExprVal?.denominator,
  );

  // 추가 필요경비(자본적지출) 안분 — preHousingDisclosure 경로에서도 적용
  const totalExpenses = input.expenses ?? 0;
  const landExpRatio = phd.transferApportionRatio.land;
  const landDirectExp = input.landDirectExpenses ?? Math.floor(totalExpenses * landExpRatio);
  const buildingDirectExp = input.buildingDirectExpenses ?? (totalExpenses - landDirectExp);

  // §97②2호 택일(MAX) 적용 — 2026-07-29 정정(#591 감사 R7 — **세액 변경**).
  //   PHD(§164⑤) 경로는 항상 환산취득가 모드인데, 종전에는
  //   `환산취득가 + 개산공제 + 자본적지출`을 **전부 합산 차감**해 필요경비를 이중계상했다
  //   (양도차익 과소 → 세액 과소). 비-PHD 경로(`calcSplitGain`)는 이미 `applyAssetSwap`으로
  //   가목(환산+개산공제) ↔ 나목(자본적지출) **택일**을 구현하고 있어 두 경로가 어긋나 있었다.
  //   같은 헬퍼를 모듈 스코프로 올려 **한 곳에서만 정의**되게 했다.
  const phdLandSwap = applyAssetSwap(
    phd.landAcquisitionPrice,
    landDirectExp,
    phd.landLumpDeduction,
    input.landDirectExpenses !== undefined,
    true,  // PHD는 항상 추계(환산) 모드
    true,  // 환산취득가 모드 — §97②2호 단서 대상
  );
  const phdBuildingSwap = applyAssetSwap(
    phd.buildingAcquisitionPrice,
    buildingDirectExp,
    phd.buildingLumpDeduction,
    input.buildingDirectExpenses !== undefined,
    true,
    true,
  );
  const landGain =
    phd.landTransferPrice -
    (phdLandSwap.swapApplied ? 0 : phd.landAcquisitionPrice) -
    phdLandSwap.effectiveDirect -
    phdLandSwap.effectiveAppraisalDed;
  const buildingGain =
    phd.buildingTransferPrice -
    (phdBuildingSwap.swapApplied ? 0 : phd.buildingAcquisitionPrice) -
    phdBuildingSwap.effectiveDirect -
    phdBuildingSwap.effectiveAppraisalDed;

  const { years: landHoldingYears } = calculateHoldingPeriod(
    input.landAcquisitionDate!,
    input.transferDate,
  );
  const { years: buildingHoldingYears } = calculateHoldingPeriod(
    input.acquisitionDate,
    input.transferDate,
  );

  const landPart: SplitPartResult = {
    transferPrice: phd.landTransferPrice,
    acquisitionPrice: phd.landAcquisitionPrice,
    directExpenses: phdLandSwap.effectiveDirect,
    appraisalDeduction: phdLandSwap.effectiveAppraisalDed,
    stdPriceAtAcq: phd.landHousingAtAcquisition,
    gain: landGain,
    holdingYears: landHoldingYears,
    longTermRate: 0,
    longTermDeduction: 0,
    acqMode: "estimated",
    swapApplied: phdLandSwap.swapApplied,
  };

  const buildingPart: SplitPartResult = {
    transferPrice: phd.buildingTransferPrice,
    acquisitionPrice: phd.buildingAcquisitionPrice,
    directExpenses: phdBuildingSwap.effectiveDirect,
    appraisalDeduction: phdBuildingSwap.effectiveAppraisalDed,
    stdPriceAtAcq: phd.buildingHousingAtAcquisition,
    gain: buildingGain,
    holdingYears: buildingHoldingYears,
    longTermRate: 0,
    longTermDeduction: 0,
    acqMode: "estimated",
    swapApplied: phdBuildingSwap.swapApplied,
  };

  return {
    land: landPart,
    building: buildingPart,
    apportionRatio: phd.transferApportionRatio,
    note: `개별주택가격 미공시(§164⑤) — 토지 ${landHoldingYears}년 + 건물 ${buildingHoldingYears}년 분리`,
    selfOwns: input.selfOwns ?? "both",
    preHousingDisclosureDetail: phd,
    housingExpropriationValuationDetail: housingExprVal?.detail,
  };
}
