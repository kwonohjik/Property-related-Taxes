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

import type {
  TransferTaxInput,
  SplitGainResult,
  SplitPartResult,
  SplitLandExpropriationValuationDetail,
} from "./types/transfer.types";
import { applyRate, calculateHoldingPeriod } from "./tax-utils";
import { calcPreHousingDisclosureGain } from "./transfer-tax-pre-housing-disclosure";
import {
  applySplitLandExpropriationValuation,
  applyHousingExpropriationValuation,
} from "./transfer-tax-expropriation-valuation";

/** 안분 비율 산출 — 토지 기준시가 / 전체 기준시가 */
function calcApportionRatio(input: TransferTaxInput): { land: number; building: number } | null {
  const sqm = input.standardPricePerSqmAtAcquisition ?? 0;
  const area = input.acquisitionArea ?? 0;
  const total = input.standardPriceAtAcquisition ?? 0;

  if (sqm <= 0 || area <= 0 || total <= 0) return null;

  const landStd = Math.floor(sqm * area);
  const landRatio = Math.min(landStd / total, 1); // 클램핑: 토지 기준시가 > 전체 방지
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
  landRatio: number,
): { land: number; building: number } {
  if (landIn != null && buildingIn != null) return { land: landIn, building: buildingIn };
  if (landIn != null) return { land: landIn, building: total - landIn };
  if (buildingIn != null) return { land: total - buildingIn, building: buildingIn };
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

/** 취득가액 분리 (실가/환산/감정/매매사례 분기) */
function calcSplitAcquisitionPrice(
  input: TransferTaxInput,
  landTransferPrice: number,
  buildingTransferPrice: number,
  landStdAtAcq: number,
  buildingStdAtAcq: number,
  landRatio: number,
): {
  land: number;
  building: number;
  splitLandExpropriationValuationDetail?: SplitLandExpropriationValuationDetail;
} {
  if (input.useEstimatedAcquisition) {
    // 환산취득가: 각각의 양도가액 × (취득시 기준시가 / 양도시 기준시가)
    const totalStdAtTransfer = input.standardPriceAtTransfer ?? 0;
    const landStdAtTransfer = input.landStandardPriceAtTransfer
      ?? Math.floor(totalStdAtTransfer * landRatio);
    const buildingStdAtTransfer = input.buildingStandardPriceAtTransfer
      ?? Math.max(totalStdAtTransfer - landStdAtTransfer, 0);

    // §164⑨1호 공익수용 특례 — **토지분 환산 분모만** min[]로 낮춘다(건물분 무변경 — 시행규칙 §80⑧,
    // 계획 D16-GB). 미충족 시 null → 현행 landStdAtTransfer 유지(회귀 0).
    const landExprVal = applySplitLandExpropriationValuation({
      propertyType: input.propertyType,
      useEstimatedAcquisition: input.useEstimatedAcquisition,
      transferCause: input.transferCause,
      transferDate: input.transferDate,
      landStdTotalAtTransfer: landStdAtTransfer,
      compensationTotal: input.splitLandCompensationTotal,
      compensationBasisTotal: input.splitLandCompensationBasisTotal,
    });
    const effLandStdAtTransfer = landExprVal?.denominator ?? landStdAtTransfer;

    const landAcq = effLandStdAtTransfer > 0
      ? Math.floor(landTransferPrice * (landStdAtAcq / effLandStdAtTransfer))
      : 0;
    const buildingAcq = buildingStdAtTransfer > 0
      ? Math.floor(buildingTransferPrice * (buildingStdAtAcq / buildingStdAtTransfer))
      : 0;
    return { land: landAcq, building: buildingAcq, splitLandExpropriationValuationDetail: landExprVal?.detail };
  }

  if (input.acquisitionMethod === "salesCase") {
    // 매매사례가액(소령 §176의2③1호) — 비-split(transfer-tax-helpers.ts:343)과 동일 base.
    // 종전에는 분기가 없어 아래 실거래가로 fallthrough했고, API가 salesCase 시 acquisitionPrice: 0을
    // 보내므로(transfer-tax-api.ts:199-201) base = 0 → **취득가액이 통째로 소실**됐다.
    // 추계액이라 토지/건물 개별 실지가액이 존재하지 않는다 → landAcquisitionPrice를 읽지 않고 항상 안분
    // (§166⑥ "구분할 수 없는 때"). 감정가액 분기가 직접 입력을 허용하는 것과 다른 점.
    const base = input.similarSalesValue ?? input.acquisitionPrice ?? 0;
    const land = Math.floor(base * landRatio);
    return { land, building: base - land };
  }

  if (input.acquisitionMethod === "appraisal") {
    // 감정가액 — 감정평가서가 토지·건물을 각각 평가하는 경우가 많아 직접 입력을 허용(실거래가와 동일 구조).
    const base = input.appraisalValue ?? input.acquisitionPrice ?? 0;
    return splitPair(base, input.landAcquisitionPrice, input.buildingAcquisitionPrice, landRatio);
  }

  // 실거래가
  const base = input.acquisitionPrice ?? 0;
  return splitPair(base, input.landAcquisitionPrice, input.buildingAcquisitionPrice, landRatio);
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

  // ── 개별주택가격 미공시 취득 경로 (§164⑤) ──
  if (input.preHousingDisclosure && input.useEstimatedAcquisition) {
    return calcSplitGainPreDisclosure(input);
  }

  const ratio = calcApportionRatio(input);
  if (!ratio) return null;

  const { land: landRatio, building: buildingRatio } = ratio;

  // 취득시 기준시가 — 토지/건물 분리
  const totalStdAtAcq = input.standardPriceAtAcquisition ?? 0;
  const landStdAtAcq = Math.floor((input.standardPricePerSqmAtAcquisition ?? 0) * (input.acquisitionArea ?? 0));
  const buildingStdAtAcq = Math.max(totalStdAtAcq - landStdAtAcq, 0);

  // ① 양도가액 분리
  const totalTransfer = input.transferPrice;
  const { land: landTransferPrice, building: buildingTransferPrice } = splitPair(
    totalTransfer,
    input.landTransferPrice,
    input.buildingTransferPrice,
    landRatio,
  );

  // ② 취득가액 분리 (환산 모드 시 토지분 §164⑨1호 특례 산출근거 동반)
  const { land: landAcqPrice, building: buildingAcqPrice, splitLandExpropriationValuationDetail } =
    calcSplitAcquisitionPrice(
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
      ? splitPair(totalExpenses, input.landDirectExpenses, input.buildingDirectExpenses, landRatio)
      : { land: input.landDirectExpenses ?? 0, building: input.buildingDirectExpenses ?? 0 };

  // ④ 개산공제 — 환산취득가·감정가액 모드 시 (소득령 §163⑥)
  // salesCase 추가(2026-07-16): 비-split(transfer-tax-helpers.ts:339-348)은 매매사례가액에도
  // 개산공제를 적용하고 directExp를 차감하지 않는데, split만 실가 early-return으로 빠져 정반대로
  // 동작했다(개산공제 0 + directExp 전액 차감) → 드리프트 해소.
  // ⚠️ §97② swap은 이 플래그가 아니라 input.useEstimatedAcquisition 단독 게이트(아래 applyAssetSwap)라
  //    salesCase 추가에도 무영향 — "환산모드 전용" 정책 유지.
  const usesEstOrAppraisal =
    input.useEstimatedAcquisition ||
    input.acquisitionMethod === "appraisal" ||
    input.acquisitionMethod === "salesCase";
  const landAppraisalDed = usesEstOrAppraisal ? applyRate(landStdAtAcq, 0.03) : 0;
  const buildingAppraisalDed = usesEstOrAppraisal ? applyRate(buildingStdAtAcq, 0.03) : 0;

  // ⑤ §97② 단서 swap (환산/감정가액 모드 + 자산별 직접경비 명시 입력 시)
  // 본문: acqPrice(환산) + appraisalDed(개산공제). directExp는 차감 안 함.
  // 단서: directExp > (acqPrice + appraisalDed) → directExp로 swap.
  // 자산 단위 독립 적용 — 토지/건물 각각 비교.
  function applyAssetSwap(
    acqPrice: number,
    directExp: number,
    appraisalDed: number,
    explicitDirect: boolean,
  ): { effectiveDirect: number; effectiveAppraisalDed: number; swapApplied: boolean } {
    if (!usesEstOrAppraisal) {
      // 실가 모드 — directExp 그대로 차감, 개산공제 없음
      return { effectiveDirect: directExp, effectiveAppraisalDed: 0, swapApplied: false };
    }
    if (!explicitDirect) {
      // 자산별 명시 입력 없음 → 본문만, swap 불가
      return { effectiveDirect: 0, effectiveAppraisalDed: appraisalDed, swapApplied: false };
    }
    const estimatedSide = acqPrice + appraisalDed;
    // §97② 2호 단서는 취득가액을 '환산취득가액'으로 하는 경우 전용 — 감정가액 모드는 swap 없이 본문(개산공제)만.
    if (input.useEstimatedAcquisition && directExp > estimatedSide) {
      // 단서 — directExp로 swap (개산공제 미적용). 필요경비 = directExp 단독이므로 취득가액도 미차감(gain 산식에서 처리).
      return { effectiveDirect: directExp, effectiveAppraisalDed: 0, swapApplied: true };
    }
    // 본문 — 개산공제만, directExp 차감 안 함
    return { effectiveDirect: 0, effectiveAppraisalDed: appraisalDed, swapApplied: false };
  }
  const landSwap = applyAssetSwap(
    landAcqPrice,
    landDirectExp,
    landAppraisalDed,
    input.landDirectExpenses !== undefined,
  );
  const buildingSwap = applyAssetSwap(
    buildingAcqPrice,
    buildingDirectExp,
    buildingAppraisalDed,
    input.buildingDirectExpenses !== undefined,
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
    stdPriceAtAcq: usesEstOrAppraisal ? landStdAtAcq : undefined,
    gain: landGain,
    holdingYears: landHoldingYears,
    longTermRate: 0,
    longTermDeduction: 0,
    swapApplied: landSwap.swapApplied,
  };

  const buildingPart: SplitPartResult = {
    transferPrice: buildingTransferPrice,
    acquisitionPrice: buildingAcqPrice,
    directExpenses: buildingSwap.effectiveDirect,
    appraisalDeduction: buildingSwap.effectiveAppraisalDed,
    stdPriceAtAcq: usesEstOrAppraisal ? buildingStdAtAcq : undefined,
    gain: buildingGain,
    holdingYears: buildingHoldingYears,
    longTermRate: 0,
    longTermDeduction: 0,
    swapApplied: buildingSwap.swapApplied,
  };

  return {
    land: landPart,
    building: buildingPart,
    apportionRatio: { land: landRatio, building: buildingRatio },
    note: `토지 ${landHoldingYears}년 + 건물 ${buildingHoldingYears}년 분리 (안분비 토지 ${(landRatio * 100).toFixed(1)}% : 건물 ${(buildingRatio * 100).toFixed(1)}%)`,
    selfOwns: input.selfOwns ?? "both",
    splitLandExpropriationValuationDetail,
  };
}

/**
 * §164⑤ 경로: 개별주택가격 미공시 취득 + 3-시점 환산취득가 분리 계산.
 * calcPreHousingDisclosureGain() 결과로 SplitGainResult 구성.
 */
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
    input.preHousingDisclosure!,
    housingExprVal?.denominator,
  );

  // 추가 필요경비(자본적지출) 안분 — preHousingDisclosure 경로에서도 적용
  const totalExpenses = input.expenses ?? 0;
  const landExpRatio = phd.transferApportionRatio.land;
  const landDirectExp = input.landDirectExpenses ?? Math.floor(totalExpenses * landExpRatio);
  const buildingDirectExp = input.buildingDirectExpenses ?? (totalExpenses - landDirectExp);

  const landGain = phd.landTransferPrice - phd.landAcquisitionPrice - phd.landLumpDeduction - landDirectExp;
  const buildingGain = phd.buildingTransferPrice - phd.buildingAcquisitionPrice - phd.buildingLumpDeduction - buildingDirectExp;

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
    directExpenses: landDirectExp,
    appraisalDeduction: phd.landLumpDeduction,
    stdPriceAtAcq: phd.landHousingAtAcquisition,
    gain: landGain,
    holdingYears: landHoldingYears,
    longTermRate: 0,
    longTermDeduction: 0,
  };

  const buildingPart: SplitPartResult = {
    transferPrice: phd.buildingTransferPrice,
    acquisitionPrice: phd.buildingAcquisitionPrice,
    directExpenses: buildingDirectExp,
    appraisalDeduction: phd.buildingLumpDeduction,
    stdPriceAtAcq: phd.buildingHousingAtAcquisition,
    gain: buildingGain,
    holdingYears: buildingHoldingYears,
    longTermRate: 0,
    longTermDeduction: 0,
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
