/**
 * §166 재개발·재건축 — **Step A~A.8**: 3분할 산출 · §89① 12억 안분 · 비과세 게이트 · §95② 배제.
 *
 * `transfer-tax-redevelopment.ts`의 `calculateRedevelopmentTax`(828줄 단일 함수)에서
 * 분리했다(800줄 정책). **입력 3개·출력 5개**로 이음매가 좁아, 호출부가 구조분해로 받으면
 * 하류 참조가 하나도 바뀌지 않는다 — 무동작 리팩터임을 그 형태가 보장한다.
 *
 * ⚠️ `steps`는 **호출부 배열을 그대로 받아 push**한다(반환하지 않는다) — 종전 순서를 지키기 위함이다.
 */
import { runRedevelopment } from "./redevelopment";
import { resolveSurchargeApplication } from "./transfer-tax-surcharge-predicate";
import {
  HIGH_VALUE_THRESHOLD,
  applyLthdExclusion,
  applyHighValueAllocation,
  applySettlementExemption,
  applyOneRightExemption,
  applyAptOneHouseExemption,
  applyRental97LthdSpecial,
} from "./transfer-tax-redevelopment-transforms";
import { evaluateRental97Lthd } from "./transfer-reductions/rental-97-router";
import { usesTable2 } from "./redevelopment-lthd";
import type { MultiHouseSurchargeResult } from "./types/multi-house-surcharge.types";
import { REDEVELOPMENT, TRANSFER } from "./legal-codes";
import type {
  TransferTaxInput,
  RedevelopmentResult,
  CalculationStep,
} from "./types/transfer.types";
import type { ParsedRates } from "./transfer-tax-helpers";

export function runRedevelopmentGainSteps(
  input: TransferTaxInput,
  parsedRates: ParsedRates,
  steps: CalculationStep[],
  isOneHouseSingle: boolean,
  lthdSpecialNotice: string | undefined,
  multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined,
  /** §89①3호가목 비과세 판정 결과 — `opts.exemptionResult`(subject="apt" 전용). 마스킹에만 쓴다. */
  exemptionResult: { isExempt: boolean; isPartialExempt: boolean; exemptReason?: string } | undefined,
) {
  // ─ Step A: redevelopment orchestrator 호출 ─
  const redevRaw: RedevelopmentResult = runRedevelopment({
    redevelopment: input.redevelopment!,
    acquisitionDate: input.acquisitionDate,
    transferDate: input.transferDate,
    transferPrice: input.transferPrice,
    actualAcquisitionPrice: input.useEstimatedAcquisition ? undefined : input.acquisitionPrice,
    useEstimatedAcquisition: input.useEstimatedAcquisition ?? false,
    isOneHouseSingle,
    residencePeriodMonths: input.residencePeriodMonths,
    priorHouseResidenceMonths: input.redevelopment!.priorHouseResidenceMonths,
    newHouseResidenceMonths: input.redevelopment!.newHouseResidenceMonths,
    isSuccessorRightToMoveIn: input.isSuccessorRightToMoveIn,
    ownershipRatio: input.ownershipRatio,
    isUnregistered: input.isUnregistered,
  });

  /**
   * ─ Step A.45: §89①3호가목 **전액 비과세** (완공 신축주택 전용) — 2026-08-25 신설 (E3-01) ─
   *
   * 판정은 `transfer-tax.ts` STEP 0.65가 일반 주택 경로와 **같은 `checkExemption`**으로 내려
   * `opts.exemptionResult`로 넘긴다. 여기서는 그 결과를 마스킹에만 쓴다(판정 이중화 금지).
   * subject="right"(조합원입주권)는 §89①**4호**이고 Step A.7 `applyOneRightExemption`이 담당하므로
   * 호출부가 undefined를 넘긴다 — 이 블록은 no-op이 된다.
   */
  const aptExemption =
    input.redevelopment!.subject === "apt" ? exemptionResult : undefined;
  const redevAfterExemption = applyAptOneHouseExemption(
    redevRaw,
    input.redevelopment!,
    aptExemption?.isExempt === true,
  );
  if (redevAfterExemption.aptOneHouseExemptionApplied) {
    steps.push({
      label: "1세대1주택 비과세",
      formula:
        `§89①3호 가목 — ${aptExemption?.exemptReason ?? "1세대1주택 요건 충족"} + ` +
        `양도가액 ${input.transferPrice.toLocaleString()} ≤ 12억 → 전액 비과세`,
      amount: 0,
      legalBasis: REDEVELOPMENT.GAIN_BASE,
    });
  }

  // ─ Step A.5: STEP 3 (12억 안분) — §95③·시행령 §160 ─
  // 1세대1주택 + 양도가액 > 12억 시: 분기별 양도차익·LTHD 를 taxableRatio 비례 축소.
  // 그 외: redevRaw.total 그대로 사용 (사례 44 회귀 0).
  //
  // 🔴 **트리거가 `isOneHouseSingle`(세대 주택수 1)에서 `checkExemption` 판정으로 바뀌었다**
  //    (2026-08-25 — E3-01). 종전에는 §154① 보유·거주 요건도, §91① 미등기 배제도 보지 않고
  //    「세대 주택수 1」만으로 안분을 걸었다. 그러면 12억 **이하**에서는 비과세가 없는데
  //    12억 **초과**에서는 요건 무검증 안분이 걸리는 모순이 생긴다.
  //
  // 🔴 **subject="right"는 이 경로를 아예 타지 않는다** (2026-08-25 — E3-03).
  //    조합원입주권의 12억 안분은 §89①4호 **각 목 외의 부분 단서**이고, 그 요건 판정과 안분은
  //    Step A.7 `applyOneRightExemption`이 전담한다. 종전에는 여기서 `isOneHouseSingle`
  //    (= 세대 주택수 1)만으로 **apt용 안분**이 걸려, §89①4호 요건을 하나도 충족하지 못한
  //    세대에도 과세대상 양도차익이 1/5 수준으로 깎였다
  //    (실측: 15억·주택1채 → 479,638,500 → 70,485,800 · Δ 409,152,700 과소).
  const isHighValue = aptExemption
    ? aptExemption.isPartialExempt === true
    : input.redevelopment!.subject !== "right" &&
      isOneHouseSingle &&
      input.transferPrice > HIGH_VALUE_THRESHOLD;
  const allocated: RedevelopmentResult = isHighValue
    ? applyHighValueAllocation(redevAfterExemption, input.transferPrice, input.redevelopment!)
    : redevAfterExemption;

  if (isHighValue && allocated.highValueAllocation) {
    const ha = allocated.highValueAllocation;
    steps.push({
      label: "1세대1주택 12억 초과 과세대상 양도차익 안분",
      formula: `전체 양도차익 ${redevRaw.total.gain.toLocaleString()} × (양도가액 ${input.transferPrice.toLocaleString()} - 12억) / 양도가액 = ${ha.taxableGain.toLocaleString()} (비과세분 ${ha.nontaxableGain.toLocaleString()})`,
      amount: ha.taxableGain,
      legalBasis: REDEVELOPMENT.REDEV_HIGH_VALUE_ALLOCATION,
    });
  }

  // ─ Step A.6: 사례 47 settlement 분기 1세대1주택 비과세 차감 ─
  // 트리거: settlementDirection="receive" + exemptionEligibleAtApproval=true
  //         + rightsValue ≤ 12억 + receiveOnlyMode !== true + isOneHouseSingle=true
  // 근거: PDF 사례수정 2 (2)-1번 주석 + 서면2016-법령해석재산-2705
  const redev: RedevelopmentResult = applySettlementExemption(
    allocated,
    input.redevelopment!,
    isOneHouseSingle,
  );

  if (redev.settlementExemptionApplied) {
    const exemptedGain = redev.exemptedGain ?? 0;
    const exemptedLthd = redev.exemptedLthd ?? 0;
    steps.push({
      label: "청산금 수령분 1세대1주택 비과세 차감",
      formula: `안분 후 양도차익 ${exemptedGain.toLocaleString()} + LTHD ${exemptedLthd.toLocaleString()} 합산 제외 (인가일 평가액 ${input.redevelopment!.rightsValue.toLocaleString()} ≤ 12억 + 1세대1주택 비과세 요건 충족 — 서면2016-법령해석재산-2705)`,
      amount: -(exemptedGain - exemptedLthd),
      legalBasis: REDEVELOPMENT.GAIN_BASE,
    });
  }

  // ─ Step A.7: 사례 36 §89①4호 가목 1세대1입주권 비과세 게이트 ─
  // 트리거: subject="right" + exemptionEligibleAtApproval=true + householdHousingCount=0
  //         + householdRightCount=1 + isOneHousehold=true
  // - 12억 이하: 전액 비과세 (3분기 gain/lthd 모두 0 → 산출세액 0)
  // - 12억 초과: §89①4호 각 목 외의 부분 단서 안분 (taxableRatio 적용 후 비과세분 마스킹)
  // subject="right" 가드 — 사례 44~48 (apt) 경로 영향 0 (회귀 안전)
  const redevAfterRightRaw: RedevelopmentResult = applyOneRightExemption(
    redev,
    input.redevelopment!,
    input,
  );

  // ─ Step A.8: §95② 장기보유특별공제 배제 ─
  //
  // 「소득세법」 §95② — 「"장기보유 특별공제액"이란 제94조제1항제1호에 따른 자산(**제104조제3항에
  // 따른 미등기양도자산**과 **같은 조 제7항 각 호에 따른 자산은 제외한다**)으로서 …」
  // 재개발 신축주택(완공 APT)은 §94①1호 자산(건물)이라 이 괄호가 그대로 걸린다.
  //
  // ⚠️ **일반 경로의 배제(`transfer-tax-lthd.ts` L-0·L-1)를 타지 않는다** — 재개발은 LTHD를
  //    `runRedevelopment`가 **분기별로** 산정해 넘기므로 배제가 자동으로 따라오지 않는다.
  //    그래서 여기서 직접 건다.
  //
  // 🔴 **괄호는 둘을 배제하는데 종전에는 하나만 걸었다** (2026-08-25 — E2-04).
  //    트리거가 `isSurchargeApplied`(§104⑦) 하나뿐이라 **미등기양도자산(§104③)에도 LTHD가
  //    그대로 차감**됐다. 미등기를 켜면 세율(70%)·기본공제(0)는 정상으로 바뀌므로 화면상
  //    「반영됐다」처럼 보여 결함이 드러나지 않았다(실측 산출세액 112,840,000원 과소).
  //    일반 경로는 L-0에서 `isUnregistered`를 가장 먼저 보고 `exclusionReason: "unregistered"`를
  //    반환한다 — **사유 우선순위도 그쪽에 맞춘다**(미등기가 중과보다 앞).
  //
  // 🔑 **분기 3개와 합계를 함께 0으로** 만든다. 합계만 0으로 두면 결과 화면이
  //    「공제 0인데 분기엔 값이 있다」로 어긋난다(memory `feedback_engine_result_display_drift`).
  const surchargeApplication = resolveSurchargeApplication(
    input,
    multiHouseSurchargeResult,
    parsedRates.surchargeSpecialRules,
  );
  const lthdExcludedByUnregistered = input.isUnregistered === true;
  const lthdExcludedBySurcharge = surchargeApplication.isSurchargeApplied;
  const lthdExclusionReason: "unregistered" | "multi_house_surcharge" | undefined =
    lthdExcludedByUnregistered
      ? "unregistered"
      : lthdExcludedBySurcharge
        ? "multi_house_surcharge"
        : undefined;
  const redevAfterLthdExclusion: RedevelopmentResult = lthdExclusionReason
    ? applyLthdExclusion(redevAfterRightRaw)
    : redevAfterRightRaw;

  /**
   * ─ Step A.8b: 조특법 §97의3①·§97의4① **장기보유특별공제 특례** ─
   *
   * 두 조문은 감면세액이 아니라 **LTHD 공제율 자체**를 바꾼다. 종전에는 이 분기가
   * `calcLongTermHoldingDeduction`(정상 경로의 특례 반영 지점)을 부르지 않아 선택해도
   * 계산에 반영되지 않았다(CB-02·D5-05는 고지만 했다).
   *
   * 결합 규칙이 따로 필요하지 않다는 근거는 `applyRental97LthdSpecial` 헤더에 적었다 —
   * §97의3은 임대분에 **고정 70%**라 보유기간이 개입하지 않고, §97의4는 **가산**이라
   * 분기별 합과 전체 적용이 같은 값이다.
   *
   * ⚠️ LTHD가 배제된 경우(미등기 §95② 괄호·다주택 중과)에는 적용하지 않는다 — 배제를
   *   특례가 되살리면 §95②의 배제 문언이 무력화된다.
   */
  const rental97Special = lthdExclusionReason
    ? undefined
    : evaluateRental97Lthd(input.reductions, {
        transferDate: input.transferDate,
        acquisitionDate: input.acquisitionDate,
        stdPriceAtAcquisition: input.standardPriceAtAcquisition,
        stdPriceAtTransfer: input.standardPriceAtTransfer,
      });
  const table2ActiveForRedev = usesTable2(
    isOneHouseSingle,
    Math.floor((input.residencePeriodMonths ?? 0) / 12),
  );
  let redevAfterRight: RedevelopmentResult = redevAfterLthdExclusion;
  if (
    rental97Special?.isEligible &&
    rental97Special.effectCategory === "long_term_holding_special" &&
    rental97Special.overrideRate !== undefined
  ) {
    // §97의3 — 임대분 70% 대체
    redevAfterRight = applyRental97LthdSpecial(redevAfterLthdExclusion, {
      overrideRate: rental97Special.overrideRate,
      rentalGainRatio: rental97Special.rentalGainRatio,
    });
    steps.push({
      label: "장기보유특별공제 특례 — 장기일반민간임대주택 (조특법 §97의3①)",
      formula:
        `임대기간분 양도차익 × 70% + 비임대분 × 분기별 공제율. 임대분 비율 ` +
        `${(rental97Special.rentalGainRatio * 100).toFixed(2)}% (조특령 §97의3⑤) · ` +
        `인가전·인가후 기존건물·청산금 3분기에 각각 적용 (소득세법 시행령 §166⑤). ` +
        `공제액 ${redevAfterLthdExclusion.total.lthd.toLocaleString()} → ` +
        `${redevAfterRight.total.lthd.toLocaleString()}`,
      amount: redevAfterRight.total.lthd,
      legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
    });
  } else if (
    rental97Special?.isEligible &&
    rental97Special.effectCategory === "long_term_holding_additional" &&
    rental97Special.additionalRate !== undefined
  ) {
    if (table2ActiveForRedev) {
      // §97의4① **단서** — 표2(§95② 단서) 대상이면 가산하지 않는다.
      const notice =
        "1세대1주택 장기보유특별공제 표2(소득세법 §95② 단서) 적용 대상이므로 " +
        "§97의4 추가공제율을 가산하지 않습니다 (조특법 §97의4① 단서).";
      steps.push({
        label: "장기보유특별공제 특례 — 미가산 (조특법 §97의4① 단서)",
        formula: notice,
        amount: 0,
        legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
      });
      lthdSpecialNotice = notice;
    } else {
      redevAfterRight = applyRental97LthdSpecial(redevAfterLthdExclusion, {
        additionalRate: rental97Special.additionalRate,
        rentalGainRatio: 1,
      });
      steps.push({
        label: "장기보유특별공제 특례 — 장기임대주택 추가공제율 (조특법 §97의4①)",
        formula:
          `분기별 §95② 공제율 + 추가율 ${(rental97Special.additionalRate * 100).toFixed(0)}%p. ` +
          `보유 3년 미만으로 기본 공제율이 0인 분기는 가산하지 않는다. ` +
          `공제액 ${redevAfterLthdExclusion.total.lthd.toLocaleString()} → ` +
          `${redevAfterRight.total.lthd.toLocaleString()}`,
        amount: redevAfterRight.total.lthd,
        legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
      });
    }
  }

  if (lthdExclusionReason === "unregistered") {
    steps.push({
      label: "장기보유특별공제 배제 (미등기양도자산)",
      formula:
        `§95② 괄호 — 「제104조제3항에 따른 미등기양도자산 … 은 제외한다」. ` +
        `배제 전 공제액 ${redevAfterRightRaw.total.lthd.toLocaleString()}`,
      amount: 0,
      legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
    });
  } else if (lthdExclusionReason === "multi_house_surcharge") {
    steps.push({
      label: "장기보유특별공제 배제 (다주택 중과)",
      formula:
        `§95② 괄호 — 「제104조제7항 각 호에 따른 자산은 제외한다」. ` +
        `중과 유형 ${surchargeApplication.surchargeTypeKey} · 배제 전 공제액 ${redevAfterRightRaw.total.lthd.toLocaleString()}`,
      amount: 0,
      legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
    });
  }

  if (redevAfterRight.oneRightExemptionApplied) {
    steps.push({
      label: "1세대1입주권 비과세",
      formula: `§89①4호 가목 — 양도일 현재 입주권 1개 + 다른 주택 없음 + 인가일 기준 종전주택 비과세 요건 충족 + 양도가액 ${input.transferPrice.toLocaleString()} ≤ 12억 → 전액 비과세`,
      amount: 0,
      legalBasis: REDEVELOPMENT.GAIN_BASE,
    });
  }

  if (redevAfterRight.oneRightHighValueApplied && redevAfterRight.highValueAllocation) {
    const ha = redevAfterRight.highValueAllocation;
    steps.push({
      label: "1세대1입주권 12억 초과 과세대상 양도차익 안분",
      formula: `§89①4호 각 목 외의 부분 단서 + §95③ — 전체 양도차익 ${redev.total.gain.toLocaleString()} × (양도가액 ${input.transferPrice.toLocaleString()} - 12억) / 양도가액 = ${ha.taxableGain.toLocaleString()} (비과세분 ${ha.nontaxableGain.toLocaleString()})`,
      amount: ha.taxableGain,
      legalBasis: REDEVELOPMENT.REDEV_HIGH_VALUE_ALLOCATION,
    });
  }
  return { allocated, isHighValue, lthdExclusionReason, redevAfterRight, rental97Special };
}
