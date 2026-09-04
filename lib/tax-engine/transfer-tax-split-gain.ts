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
} from "./types/transfer.types";
import { applyRate, calculateHoldingPeriod, computeEstimatedDeduction, computeLumpSumDeductionBase } from "./tax-utils";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { requiresAcqStdPricePart } from "@/lib/calc/transfer-tax-split-acq-mode";
import { calcPreHousingDisclosureGain } from "./transfer-tax-pre-housing-disclosure";
import { resolveTransferPriceSplit } from "./transfer-tax-split-sale-price";
import {
  applyHousingExpropriationValuation,
} from "./transfer-tax-expropriation-valuation";

// ─── 분리취득 **취득가액 산정** — transfer-tax-split-acq-price.ts로 분리 (800줄 정책) ───
//     이 파일은 그 결과로 **양도차익**을 만든다. 방향은 한쪽뿐이다(취득가액 → 차익).
import type { PartAcqMode } from "./transfer-tax-split-acq-price";
import {
  calcAcqStdPair,
  calcApportionRatio,
  splitPair,
  deriveLegacyAcqMode,
  calcSplitAcquisitionPrice,
} from "./transfer-tax-split-acq-price";
export {
  type PartAcqMode,
  calcPartAcquisitionPrice,
  isSplitPairOverflow,
  deriveUseEstimatedAcquisitionFromParts,
} from "./transfer-tax-split-acq-price";

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

  const ratio = calcApportionRatio(input);
  // 취득시 기준시가 — 토지/건물 분리 (축 B). ratio와 **같은 소스**에서 산출한다
  // (calcAcqStdPair) — 별도 재계산하면 파트별 독립 경로에서 비율과 금액이 어긋난다.
  const acqStd = calcAcqStdPair(input);

  // 취득시 기준시가는 취득가액을 **환산해야 할 때만**, 그것도 **그 파트만** 필요하다
  // (2026-07-30 파트별 분해 — 계획서 transfer-split-acq-std-part-gating.plan.md §3).
  // 종전에는 술어가 파트를 구분하지 않아, 토지=실거래가 + 건물=환산에서 계산 어디에도 쓰이지
  // 않는 토지 공시지가·면적을 강제하고 미입력 시 throw했다.
  // 판정은 UI·validate와 **같은 술어**(lib/calc — dual-truth 회피).
  const stdNeedCtx = {
    landMode: earlyLandMode,
    buildingMode: earlyBuildingMode,
    // 엔진은 별개취득을 재판정하지 않는다 — API 변환이 파생해 전달한다(:187-190 주석).
    isSeparate: input.isSeparateAcquisition === true,
  };
  const missingStd: string[] = [];
  if (requiresAcqStdPricePart("land", input, stdNeedCtx) && acqStd?.land == null) {
    missingStd.push("토지분(취득시 ㎡당 개별공시지가 × 토지 면적 — 소득세법 §99①1호 가목)");
  }
  if (requiresAcqStdPricePart("building", input, stdNeedCtx) && acqStd?.building == null) {
    missingStd.push("건물분(국세청장 산정 기준시가 — 소득세법 §99①1호 나목)");
  }
  if (missingStd.length > 0) {
    // **별개 취득만 차단한다.** 그 경우 자산 전체 취득가액 칸이 UI에서 사라지므로, 단일 자산
    // 경로로 흘리면 취득가액 0 → 양도차익이 양도가액 전액이 된다(조용한 과대과세).
    // 비-별개취득(겸용·소유자분리 등 취득일 동일)은 총액이 실재해 단일 자산 경로가 정상 산출을
    // 내므로 **종전대로 null**을 유지한다 — 회귀 0.
    if (input.isSeparateAcquisition !== true) return null;
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `환산·감정·매매사례 취득가액 계산에는 취득시 기준시가 ${missingStd.join(" 및 ")}이 필요합니다.`,
      { missingStdPriceParts: missingStd, landMode: earlyLandMode, buildingMode: earlyBuildingMode },
    );
  }

  // ratio 미산출(케이스 a) 시 null 전파 — `0`으로 메우면 미래에 소비 지점이 추가됐을 때
  // 조용히 "토지 0% 안분"이 된다. 실제 소비부는 위 술어가 이미 걸러냈으므로 도달하지 않는다.
  const landRatio: number | null = ratio ? ratio.land : null;
  const buildingRatio: number | null = ratio ? ratio.building : null;

  // 필요한 파트의 non-null은 위 게이트가 보증한다 — 실가 파트만 0으로 떨어지며 그 값은
  // 개산공제·환산 분자 어디에도 쓰이지 않는다(landNonActual/buildingNonActual 게이트).
  const landStdAtAcq = acqStd?.land ?? 0;
  const buildingStdAtAcq = acqStd?.building ?? 0;
  // 건물분이 결합 총액에서 역산된 값인가 — 주택(라목)은 **법정 정상 경로**, 건물은 한시 후퇴 표식.
  // 취득시 기준시가를 실제로 쓴 경우에만 "역산" 안내를 띄운다 — 실가 파트는 그 값을
  // 쓰지 않았으므로 안내가 거짓이 된다(결과 카드 fine-print, SplitGainDetailSection).
  // ⚠️ 산출 지점(`calcAcqStdPair`)이 직접 알려준다 — 호출부가 조건을 재구성하면 분기가 늘 때마다
  //    어긋난다(별개취득이어도 건물분 미입력이면 레거시 역산으로 후퇴할 수 있다).
  const buildingStdDerivedFromTotal = acqStd?.buildingDerived === true;

  // ① 양도가액 분리 — 소득령 §166⑥ → 부가가치세법 시행령 §64①1호 준용
  //    ("공급계약일 = **양도 현재**의 기준시가" 비율).
  //
  // ⚠️ **취득시 비율(landRatio)로 후퇴하지 않는다** (2026-07-29 사용자 확정 규칙 ①).
  //    종전에는 `saleRatio?.land ?? landRatio`로, 양도시 기준시가가 없으면 취득시 비율을
  //    조용히 썼다(회귀 0 목적의 한시 코드). 그러나 토지는 오르고 건물은 감가하므로 두 시점의
  //    비율은 크게 다르고(실측: 취득시 40% vs 양도시 80% → 토지 양도가액 4억 차이), 취득시
  //    비율로 양도대가를 나눌 법령 근거가 없다.
  //    → 근거가 없으면 `resolveTransferPriceSplit`이 차단한다(조용한 오답 금지). 사용자는 계약서
  //      구분금액을 입력하거나 양도시 토지·건물 기준시가를 입력해 해소한다(validate가 선차단).
  //
  // 🔴 **§100③ 가드가 여기 붙는다**(2026-08-06 Phase 1-C). 구분 기재가 안분값과 30% 이상
  //    차이나면 「불분명한 때로 본다」 ⇒ 안분값으로 되돌린다. 판정 상세는 결과에 실어 표시
  //    계층이 그대로 읽게 한다. 산식·서열은 `transfer-tax-split-sale-price.ts` 단일 정본.
  const {
    land: landTransferPrice,
    building: buildingTransferPrice,
    judgment: saleSplitJudgment,
  } = resolveTransferPriceSplit(input);

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
  const { land: landCapex, building: buildingCapex } =
    totalExpenses > 0
      ? splitPair(totalExpenses, input.landDirectExpenses, input.buildingDirectExpenses, landRatio, "자본적지출")
      : { land: input.landDirectExpenses ?? 0, building: input.buildingDirectExpenses ?? 0 };

  /**
   * ③-b **자산 단위 양도비(§97①3호)를 파트에 안분한다.**
   *
   * 🔴 종전에는 split 경로가 `input.transferExpense`를 **읽지 않아 통째로 유실**됐다
   *    (실측: 30,000,000 입력 → 실가·환산 두 모드 모두 세액 변화 **0**). 파트 칸
   *    (`landTransferExpense` 등)은 저장소에 **존재하지 않으므로** 어떤 경로로도 반영이
   *    불가능한 상태였다 — 「소득세법」 §97①3호의 필요경비가 조용히 사라진 것이다.
   *
   * 근거는 **§100② 후문**이다 — 「이 경우 공통되는 취득가액과 **양도비용**은 해당 자산의 가액에
   * **비례하여 안분계산**한다」. 양도비용이 **명문 열거**돼 있으므로 안분은 법정이고,
   * 「자동 안분 fallback 금지」 정책의 대상이 아니다.
   * ⚠️ **자본적지출은 이 열거에 없다** — 그래서 자산 단위 자본적지출은 여기서 안분하지 않고
   *    `transfer-tax-validate-split.ts`가 파트 칸으로 안내한다(일반건물 경로 `validate-gb.ts`와 동형).
   *
   * 산식·잔액 규약은 일반건물 경로(`general-building-swap.ts` `resolvePerPart`)와 **같다** —
   * 양도가액 비례로 토지분을 floor하고 **건물분이 잔액을 흡수**해 `Σ = transferExpense`를 지킨다.
   */
  const totalTransferExpense = input.transferExpense ?? 0;
  const transferPriceTotal = landTransferPrice + buildingTransferPrice;
  const landTransferExpense =
    totalTransferExpense > 0 && transferPriceTotal > 0
      ? applyRate(totalTransferExpense, landTransferPrice / transferPriceTotal)
      : 0;
  const buildingTransferExpense = totalTransferExpense - landTransferExpense;
  const landDirectExp = landCapex + landTransferExpense;
  const buildingDirectExp = buildingCapex + buildingTransferExpense;

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

  // ⚠️ **양도비만 있어도 나목이 성립한다** — §97②2호 나목은 「자본적지출 + 양도비」다.
  //    `landDirectExpenses`(자본적지출 칸) 유무만 보면 양도비만 입력한 사용자는 환산 파트에서
  //    다시 유실된다(본문 갈래로 빠져 `effectiveDirect: 0`).
  const landSwap = applyAssetSwap(
    landAcqPrice,
    landDirectExp,
    landAppraisalDed,
    input.landDirectExpenses !== undefined || landTransferExpense > 0,
    landNonActual,
    landMode === "estimated",
  );
  const buildingSwap = applyAssetSwap(
    buildingAcqPrice,
    buildingDirectExp,
    buildingAppraisalDed,
    input.buildingDirectExpenses !== undefined || buildingTransferExpense > 0,
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
    // §100③ 판정 — 구분 기재가 있고 안분값도 산출된 경우에만 존재한다(위 resolveTransferPriceSplit).
    ...(saleSplitJudgment ? { saleSplitJudgment } : {}),
    // 비율 미산출 시 사유 문구는 **파트 모드로 갈린다**(2026-07-30). 종전에는 무조건
    // "파트별 실지거래가액"이었는데, 파트별 게이팅 이후 토지 실가 + 건물 환산도 이 분기에
    // 진입한다 — 건물이 환산인데 "실지거래가액"은 거짓이다.
    note:
      landRatio != null && buildingRatio != null
        ? `토지 ${landHoldingYears}년 + 건물 ${buildingHoldingYears}년 분리 (안분비 토지 ${(landRatio * 100).toFixed(1)}% : 건물 ${(buildingRatio * 100).toFixed(1)}%)`
        : `토지 ${landHoldingYears}년 + 건물 ${buildingHoldingYears}년 분리 (${
            landMode === "actual" && buildingMode === "actual"
              ? "파트별 실지거래가액"
              : "파트별 개별 산정"
          } — 기준시가 안분 미적용)`,
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
  const landCapex = input.landDirectExpenses ?? Math.floor(totalExpenses * landExpRatio);
  const buildingCapex = input.buildingDirectExpenses ?? (totalExpenses - landCapex);

  /**
   * **자산 단위 양도비(§97①3호)를 파트에 안분한다** — A06(2026-09-03).
   *
   * 🔴 종전에는 PHD 경로가 `input.transferExpense`를 **읽지 않아 통째로 유실**됐다.
   * 비-PHD split 경로(`calcSplitGain` ③-b)는 이미 같은 안분을 하고 있어 두 경로가 어긋나 있었다.
   *
   * 근거는 「소득세법」 §100② **후문의 명문**이다 — 「이 경우 **공통되는 취득가액과 양도비용**은
   * 해당 자산의 가액에 비례하여 안분계산한다」. 양도비는 그 열거에 **있다**.
   *
   * ⚠️ **자본적지출은 이 열거에 없다** — 그래서 자산 단위 자본적지출은 여기서 안분하지 않고
   *    `transfer-tax-validate-split.ts`가 파트 칸으로 안내한다(비-PHD·일반건물 경로와 동형).
   *    예규 법인46012-2439도 같은 순서다 — 「자본적지출액이 어느 하나의 개별필지에 귀속되는
   *    것이 분명한 경우에는 해당필지에 가산하고, 그 귀속이 불분명한 경우에는 … 안분」.
   *
   * 산식·잔액 규약은 비-PHD 경로와 **같다** — 양도가액 비례로 토지분을 floor하고
   * 건물분이 잔액을 흡수해 `Σ = transferExpense`를 지킨다.
   */
  const totalTransferExpense = input.transferExpense ?? 0;
  const phdTransferPriceTotal = phd.landTransferPrice + phd.buildingTransferPrice;
  const landTransferExpense =
    totalTransferExpense > 0 && phdTransferPriceTotal > 0
      ? applyRate(totalTransferExpense, phd.landTransferPrice / phdTransferPriceTotal)
      : 0;
  const buildingTransferExpense = totalTransferExpense - landTransferExpense;

  const landDirectExp = landCapex + landTransferExpense;
  const buildingDirectExp = buildingCapex + buildingTransferExpense;

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
    // 비-PHD 경로(:574)와 동일 규약 — 양도비만 입력한 사용자도 §97②2호 단서 비교 대상이다.
    input.landDirectExpenses !== undefined || landTransferExpense > 0,
    true,  // PHD는 항상 추계(환산) 모드
    true,  // 환산취득가 모드 — §97②2호 단서 대상
  );
  const phdBuildingSwap = applyAssetSwap(
    phd.buildingAcquisitionPrice,
    buildingDirectExp,
    phd.buildingLumpDeduction,
    input.buildingDirectExpenses !== undefined || buildingTransferExpense > 0,
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
