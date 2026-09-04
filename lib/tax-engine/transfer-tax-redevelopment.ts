/**
 * 재개발/재건축 양도세 — transfer-tax.ts 통합 finalize
 *
 * transfer-tax.ts STEP 0.6 다음 분기에서 호출되어
 * runRedevelopment 결과를 TransferTaxResult 로 마감 (STEP 5·6·7·7.5·9·10).
 *
 * 본 분기는 일반 housing/right_to_move_in 분기를 우회한다:
 * - STEP 2 (calcTransferGain) skip — redevelopment 3분할 결과 사용
 * - STEP 3 (12억 안분) — §95③·시행령 §160 활성화 (사례 45 1세대1주택 + 12억 초과)
 * - STEP 4 (calcLongTermHoldingDeduction) skip — 분기별 LTHD 이미 산정
 * - STEP 5·6·7 통상 흐름 (기본공제·과세표준·산출세액)
 * - STEP 7.5·9·10·11 감면·농특세·지방소득세·가산세·세액합계 — **이 파일이 직접 계산한다**
 *
 * ⚠️ **`finalizeTransferTax`를 호출하지 않는다**(Step I 주석에 같은 사실이 적혀 있다).
 *    종전 헤더는 「transfer-tax-finalize.ts 재사용」이라 적어, 감면·농특세를 finalize가
 *    처리해 준다고 읽히게 했다 — 실제로는 Step C.5·F.2·F.5·F.6·F.7이 이 파일 안에 있다
 *    (2026-08-25 E3-02에서 배선). 재사용하는 것은 `emitPenaltySteps`(Step G.5) 뿐이다.
 *    ⇒ **감면 경로를 넓히면 농특세 2-pass(Step F.2)도 이 파일에서 함께 넓혀야 한다.**
 *
 * 사례 44 anchor (1세대1주택 X — STEP 3 미발동):
 *   산출세액 56,799,400 / 지방소득세 5,679,940 / 세액합계 62,479,340
 *
 * 사례 45 anchor (1세대1주택 + 양도가 15억 + 12억 초과):
 *   산출세액 11,311,376 / 지방소득세 1,131,137 / 세액합계 12,442,514
 */

import { isRedevelopmentActive } from "./redevelopment";
import { runRedevelopmentGainSteps } from "./transfer-tax-redevelopment-steps";
import { calcTax, calcReductions } from "./transfer-tax-rate-calc";
import { applyReductionStatutoryCap } from "./transfer-tax-reduction-cap";
import { resolveTaxCreditRuralSurtax, HYBRID_ARTICLE } from "./transfer-tax-rural-surtax";
import {
  resolveIncomeDeduction,
  buildIncomeDeductionStep,
  RATE_SPECIAL_REDUCTION_IDS,
} from "./transfer-reductions/income-deduction-router";
import {
  emitRedevelopmentSteps,
} from "./transfer-tax-redevelopment-transforms";
import type { MultiHouseSurchargeResult } from "./types/multi-house-surcharge.types";
import { calcBasicDeduction, getReductionLegalBasis } from "./transfer-tax-helpers";
import { applyRate, truncateToWon } from "./tax-utils";
import { REDEVELOPMENT, TRANSFER } from "./legal-codes";
import { resolveLTHDStartDate } from "./transfer-tax-finalize";
import { emitPenaltySteps } from "./transfer-tax-penalty-steps";
import { computeAmendment } from "./transfer-tax-amendment";
import type {
  TransferTaxInput,
  TransferTaxResult,
  CalculationStep,
  CarryoverTaxationDetail,
} from "./types/transfer.types";
import type { ParsedRates } from "./transfer-tax-helpers";


// ──────────────────────────────────────────────────────────────────────────────
// 진입점 — transfer-tax.ts 에서 분기 라우팅
// ──────────────────────────────────────────────────────────────────────────────

/**
 * redevelopment 분기 활성 여부 (transfer-tax.ts 에서 분기 판정).
 * 재수출 (편의용).
 */
export { isRedevelopmentActive };

/**
 * redevelopment 분기 진입 — TransferTaxResult 까지 직접 빌드.
 *
 * @param input 원본 TransferTaxInput (workingInput, burdenedGift override 후)
 * @param parsedRates 세율 데이터
 * @param baseSteps STEP 0 ~ STEP 0.6 까지 누적된 steps (현재 사용처에서 빈 배열 또는 누적 배열 전달)
 */

export function calculateRedevelopmentTax(
  input: TransferTaxInput,
  parsedRates: ParsedRates,
  baseSteps: CalculationStep[],
  /**
   * 다주택 중과 정밀 판정(`houses[]` 기반). 종전에는 `transfer-tax.ts`가 **넘기지 않아**
   * 재개발 신축주택에 §104⑦이 통째로 미적용됐다(실측 Δ 59,823,642원 과소).
   * 미제공이면 `resolveSurchargeApplication`이 원시 플래그로 fallback한다.
   */
  multiHouseSurchargeResult?: MultiHouseSurchargeResult,
  /**
   * STEP 0.65 호출부가 넘기는 값들 — 이 분기가 메인 파이프라인을 **조기 이탈**하기 때문에
   * 상류에서 이미 판정해 둔 것을 명시적으로 받아야 결과에 실린다.
   * 넘기지 않으면 종전과 동일하게 동작한다(additive).
   */
  opts?: {
    /**
     * §89①3호가목 비과세 판정 결과 (subject="apt" 전용 — `transfer-tax.ts` STEP 0.65에서 산정).
     * 조합원입주권(subject="right")은 §89①4호이고 `applyOneRightExemption`이 담당하므로 undefined다.
     */
    exemptionResult?: { isExempt: boolean; isPartialExempt: boolean; exemptReason?: string };
    /** §97의2 배우자등 이월과세 A/B 판정 근거 (STEP 0.475 산출). */
    carryoverDetail?: CarryoverTaxationDetail;
    /**
     * STEP 0 ~ 0.65 사이에 누적된 비차단 안내(부담부증여 다주택 경고 등).
     * 정상 경로는 `transfer-tax-finalize.ts`가 결과에 그대로 싣는데 이 분기만 버리고 있었다.
     */
    warnings?: string[];
    /**
     * STEP 0.9+0.95 주택수 제외 상세 (§99의4·§98의9·보유 감면주택).
     * 이 분기가 조기이탈이라 넘겨받지 않으면 결과에 실리지 않는다 — §99의4⑥ 추징 경고가
     * `clawbackWarning` 한 필드에만 존재해 다른 경로로 대체 노출되지 않는다 (D4-08).
     */
    houseCountExclusion?: Pick<
      TransferTaxResult,
      "new994Detail" | "unsold989Detail" | "specialHouseExclusionDetail"
    >;
    /**
     * §163⑨ 상속·증여 취득가액 의제 판정 결과 (STEP 0.45 산출) — A19(2026-09-02).
     *
     * `transfer-tax-finalize.ts:604-605`가 **같은 step에서 두 필드**를 싣는다
     * (`inheritedAcquisitionDetail` = `.result` · `inheritedHouseValuationDetail` =
     * `.houseValuationResult`). 이 분기는 `finalizeTransferTax`를 호출하지 않으므로
     * 넘겨받지 않으면 둘 다 사라지고, `ReductionDetailCards`의 `hasAny`가 false가 되어
     * **카드 묶음 전체가 렌더되지 않는다**.
     *
     * 이 분기는 바로 앞에서 `resolveInheritedRedevelopmentAcqPrice`로 그 값을 **소비까지
     * 하면서** 근거만 버리고 있었다. 세액은 불변(소비처가 표시 계층뿐 — 전수 확인).
     */
    inheritedAcquisitionStep?: {
      result?: TransferTaxResult["inheritedAcquisitionDetail"];
      houseValuationResult?: TransferTaxResult["inheritedHouseValuationDetail"];
    };
  },
): TransferTaxResult {
  const steps: CalculationStep[] = [...baseSteps];
  /** CB-02·D5-05 — LTHD 계열 특례 미반영 고지(결과 warnings로도 노출) */
  let lthdSpecialNotice: string | undefined;
  // 토지만 출자한 조합원입주권은 1세대1주택 특례(비과세·LTHD 표2) 대상이 아니다.
  //
  //   §89①4호 본문 — 「조합원입주권을 1개 보유한 1세대[…관리처분계획의 인가일… 현재
  //     **제3호가목에 해당하는 기존주택을 소유하는 세대**]가 …양도하는 경우」
  //     ⇒ 토지 출자는 인가일 현재 기존주택이 없어 비과세 요건 자체가 불성립.
  //   §95② 단서 — 「…1세대 1주택(이에 딸린 토지를 포함한다)에 해당하는 **자산**의 경우에는
  //     …표 2…」 ⇒ 종전자산이 주택이 아니면 표2 진입 불가(표1만).
  //
  // 환산 경로는 이미 `isOneHouseSingle: false` 고정이었으나
  // (`redevelopment-land-contribution.ts:166`) 실가 경로(`runOriginalMember`)는
  // 이 값을 그대로 전달해(`redevelopment.ts:535`) 표2가 적용됐다(2026-08-13 제보).
  //
  // ⚠️ subject="right" 한정 — 토지를 출자하고 **완공 APT**를 양도하는 경우(subject="apt")는
  //    주택 양도라 §89①3호·§95② 표2 대상이 될 수 있다.
  const isLandContributedRight =
    input.redevelopment!.subject === "right" &&
    input.redevelopment!.originalAssetType === "land";
  const isOneHouseSingle =
    !isLandContributedRight &&
    input.isOneHousehold === true &&
    input.householdHousingCount === 1;

  /**
   * ⚠️ **LTHD 표2 진입은 §89①4호와 다른 축이다 — 술어를 공유하지 않는다.**
   *
   * 리뷰(E3-03)는 「12억 안분과 LTHD 표2가 같은 술어를 써야 한다」고 제안했다. **법령 실독으로
   * 기각한다.** 표2의 근거는 §89①4호가 아니라 §95② 단서 → **시행령 §159의4**이고, 그 문언은:
   *
   * > 법 제95조제2항 표 외의 부분 단서 … 에서 "대통령령으로 정하는 1세대 1주택"이란 각각
   * > **1세대가 양도일 현재 국내에 1주택**(제155조·제155조의2·제156조의2·제156조의3 및 그 밖의
   * > 규정에 따라 1세대 1주택으로 보는 주택을 포함한다)**을 보유**하고 **보유기간 중 거주기간이
   * > 2년 이상**인 것을 말한다.
   *
   * ⇒ 판정 기준은 **「양도일 현재 세대 주택 수 1 + 거주 2년」**이지 §89①4호 나목의 3년 요건이
   *   아니다. 현행 `isOneHouseSingle`이 이 문언과 정확히 일치한다.
   *
   * 실제로 나목 술어로 바꿔 보니 **기존 12건이 실패**했다(`case-redev-right-12억-1house` 9 ·
   * `case-redev-right-transfer-pay-lthd-split` 1 · `land-contributed-right-no-one-house` 1 등) —
   * 그 spec들이 §159의4를 옳게 encode하고 있었다. 「연관돼 보이는 두 판정」이 실은 다른 조문에서
   * 나온다는 사례로 남긴다.
   */
  /**
   * ─ Step A~A.8 — **§166 3분할 산출 · 12억 안분 · 비과세 게이트 · §95② 배제**.
   *
   * `transfer-tax-redevelopment-steps.ts`로 분리했다(800줄 정책 — 이 함수가 828줄이었다).
   * 입력 3개·출력 5개로 이음매가 좁아 **구조분해로 받으면 하류 참조가 바뀌지 않는다**.
   */
  const { allocated, isHighValue, lthdExclusionReason, redevAfterRight, rental97Special } =
    runRedevelopmentGainSteps(input, parsedRates, steps, isOneHouseSingle, lthdSpecialNotice, multiHouseSurchargeResult, opts?.exemptionResult);

  // ─ Step B: 양도차익·LTHD steps emit (인가전 / 인가후 기존 / 청산금 3분할) ─
  emitRedevelopmentSteps(steps, redevAfterRight, input.redevelopment!);

  // ─ Step C: 양도소득금액 ─
  const transferIncomeBefore993 = redevAfterRight.total.taxableIncome;
  steps.push({
    label: "양도소득금액",
    formula: `양도차익 ${redevAfterRight.total.gain.toLocaleString()} - 장기보유공제 ${redevAfterRight.total.lthd.toLocaleString()}`,
    amount: transferIncomeBefore993,
    legalBasis: REDEVELOPMENT.GAIN_BASE,
  });

  /**
   * ─ Step C.5: **차감형** 감면 (§99의3·§99·§98의8 + 하이브리드 5년 후) ─ (E3-02)
   *
   * 조특법 감면은 효과 방식이 둘로 갈린다 — **양도소득금액을 차감**하는 형(차감형)과
   * **산출세액을 차감**하는 형(세액감면형). 차감형은 과세표준을 바꾸므로 **산출세액보다 앞**에
   * 와야 하고, 세액감면형은 산출세액 뒤(Step F.5)에 온다. 정상 경로의 STEP 4.6과 같은 자리다
   * (`transfer-tax.ts`).
   *
   * 종전 이 분기는 `input.reductions`를 **한 번도 읽지 않았다** — 두 트랙 모두 침묵 소실했다.
   * 감면 자산종류 게이트(`transfer-reductions/asset-kind-gate.ts`)가 `redevelopment_apt`·
   * `right_to_move_in`을 **허용 자산으로 명시**하고 ④·⑫도 통과시키므로, 감면은 엔진 input까지
   * 정상 도달한 뒤 여기서 사라졌다.
   */
  let transferIncome = transferIncomeBefore993;
  const incomeDeduction = resolveIncomeDeduction(input.reductions, {
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    assetContractDate: input.assetContractDate,
    transferPrice: input.transferPrice,
    // 고가주택 가액 요건은 물건 전체 기준 — Step A의 §95③ 12억 안분과 같은 소스를 쓴다.
    totalPropertyTransferPrice: input.totalPropertyTransferPrice,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    transferIncome: transferIncomeBefore993,
  });
  if (incomeDeduction.appliedId) {
    transferIncome = Math.max(0, transferIncomeBefore993 - incomeDeduction.reducible);
  }
  if (incomeDeduction.stepLabel) {
    steps.push(buildIncomeDeductionStep(incomeDeduction, transferIncomeBefore993, transferIncome));
  }

  // ─ Step D: 기본공제 (STEP 5) ─
  // calcBasicDeduction(taxableGain, lth) 시그니처: afterLTH = taxableGain - lth.
  // redevAfterRight.total.gain 을 첫 인자로 전달 (taxableIncome 은 이미 lthd 차감 후 — 이중 차감 방지).
  const basicDeduction = calcBasicDeduction(
    redevAfterRight.total.gain,
    redevAfterRight.total.lthd,
    input.annualBasicDeductionUsed,
    input.isUnregistered ?? false,
    parsedRates.basicDeductionRules,
  );
  steps.push({
    label: "기본공제",
    formula: `연 한도 ${parsedRates.basicDeductionRules.annualLimit.toLocaleString()} - 기사용 ${input.annualBasicDeductionUsed.toLocaleString()}`,
    amount: basicDeduction,
    legalBasis: TRANSFER.BASIC_DEDUCTION,
  });

  // ─ Step E: 과세표준 (STEP 6) ─
  const taxBase = Math.max(0, transferIncome - basicDeduction);
  steps.push({
    label: "과세표준",
    formula: `양도소득금액 ${transferIncome.toLocaleString()} - 기본공제 ${basicDeduction.toLocaleString()}`,
    amount: taxBase,
    legalBasis: TRANSFER.TAX_BASE_CALC,
  });

  /**
   * ─ Step F: 산출세액 (STEP 7) — calcTax 재사용 ─
   *
   * 세율 특칙 두 개를 정상 경로(`transfer-tax.ts` STEP 7)와 **같은 술어**로 건다 (E3-02).
   * 차감형 감면을 배선하면서 이 특칙을 빠뜨리면, 감면은 반영되는데 세율만 틀린
   * **새로운 조용한 오답**이 생긴다.
   *   · P3 (§98의3④·§98의5③·§98의6③) — 적격 시 단기세율(§104①2·3호) 배제
   *   · P5 (§98①1호)                  — 세율 20% 단일 강제 (§104① 불구)
   */
  const rateSpecialActive =
    incomeDeduction.eligibleId !== undefined &&
    RATE_SPECIAL_REDUCTION_IDS.includes(incomeDeduction.eligibleId);
  const flatRate20Active = incomeDeduction.eligibleId === "unsold_98";
  /**
   * §98의2 × 조합원 경로 — **결합이 구조적으로 성립하지 않는다** (CB-02·D5-05 후속).
   *
   * §97의3·§97의4는 위 Step A.8b가 계산에 반영한다. 남은 것은 §98의2뿐인데, 이 조합은
   * 애초에 존재할 수 없다:
   *
   * - 조특법 §98의2①의 대상은 조특령이 정하는 **미분양주택**(사업주체등이 공급했으나 분양되지
   *   않은 주택)이다. 재개발·재건축 **조합원 물량은 관리처분계획에 따라 배정**되는 것이라
   *   분양 대상이 아니므로 미분양주택에 해당할 수 없다.
   * - 반대로 미분양 일반분양분을 취득한 자는 조합원이 아니라 취득일이 잔금청산일 하나뿐이라
   *   소령 §166⑤의 3분기 구조 자체가 없다.
   *
   * ⇒ 정상 경로는 `asset-kind-gate.ts`가 ⑤·⑧에서 차단한다. 여기 남긴 것은 그 게이트를 거치지
   *   않는 **API 직접 호출**용 방어다 — 「아직 반영하지 않았다」가 아니라 「적용 대상이 아니다」로
   *   적어야 한다. 종전 문구는 사용자가 받을 수 있는 특례를 놓치고 있다고 오해하게 만들었다.
   */
  const unsold982Selected = (input.reductions ?? []).filter((r) => r.type === "unsold_98_2");
  if (unsold982Selected.length > 0) {
    const notice =
      "지방 미분양주택 과세특례(조세특례제한법 §98의2①1호)는 재개발·재건축 조합원이 취득한 " +
      "자산에는 적용되지 않습니다 — 조합원 배정분은 사업주체가 공급하고 남은 미분양주택에 " +
      "해당할 수 없습니다. 이 계산에 반영하지 않았습니다.";
    steps.push({
      label: "조특법 §98의2 — 적용 대상 아님 (조합원 취득 자산)",
      formula: notice,
      amount: 0,
      legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
    });
    lthdSpecialNotice = notice;
  }
  const taxRateInput = flatRate20Active
    ? { ...input, forceFlatRate20: true }
    : rateSpecialActive
      ? { ...input, suppressShortTermRate: true }
      : input;
  const taxResult = calcTax(taxBase, parsedRates, taxRateInput, multiHouseSurchargeResult);
  const fmtPct = (r: number) => `${Math.round(r * 100)}%`;
  steps.push({
    label: "산출세액",
    formula: `과세표준 ${taxBase.toLocaleString()} × 세율 ${fmtPct(taxResult.appliedRate)}${taxResult.progressiveDeduction ? ` - 누진공제 ${taxResult.progressiveDeduction.toLocaleString()}` : ""}`,
    amount: taxResult.calculatedTax,
    legalBasis: TRANSFER.TAX_RATE,
  });

  /**
   * ─ Step F.2: **차감형** 감면의 농어촌특별세 (2-pass) ─ (E3-02)
   *
   * 차감형은 세액이 아니라 **양도소득금액**을 줄이므로 감면세액이 직접 드러나지 않는다.
   * 「농어촌특별세법」 §2①1호의 「소득공제」에 해당하므로, 과세표준을 **감면 전 소득금액으로
   * 다시 세워 산출세액을 한 번 더 구한 뒤 그 차액**을 감면세액으로 본다 —
   * 정상 경로 `transfer-tax-finalize.ts` STEP 7.5와 같은 2-pass다.
   *
   * ⚠️ Step C.5만 배선하고 이 블록을 빠뜨리면 **차감은 되는데 농특세만 0**이 된다 —
   *    감면 소실을 고치면서 새 과소과세를 만드는 셈이다.
   */
  let ruralSurtax993 = 0;
  if (incomeDeduction.appliedId) {
    const activePrelim =
      incomeDeduction.new993Detail ??
      incomeDeduction.new99Detail ??
      incomeDeduction.unsold988Detail ??
      incomeDeduction.unsold987Detail ??
      incomeDeduction.unsold992Detail ??
      incomeDeduction.unsold983Detail ??
      incomeDeduction.unsold985Detail ??
      incomeDeduction.unsold986Detail;
    // 농특세 비과세 (농특세령 §4⑦1호 — §98의3·§98의5): 차감 효과는 유지하고 농특세만 0.
    const isSurtaxExempt =
      activePrelim !== undefined &&
      "ruralSurtaxExempt" in activePrelim &&
      activePrelim.ruralSurtaxExempt === true;
    const taxBaseBefore993 = Math.max(0, transferIncomeBefore993 - basicDeduction);
    const taxResultBefore993 = calcTax(
      taxBaseBefore993,
      parsedRates,
      taxRateInput,
      multiHouseSurchargeResult,
    );
    const taxReduction993 = Math.max(0, taxResultBefore993.calculatedTax - taxResult.calculatedTax);
    ruralSurtax993 = isSurtaxExempt ? 0 : applyRate(taxReduction993, 0.2);
    if (ruralSurtax993 > 0) {
      steps.push({
        label: "차감형 감면 농어촌특별세 (감면세액 × 20%)",
        formula: `(감면 전 산출세액 ${taxResultBefore993.calculatedTax.toLocaleString()} − 감면 후 산출세액 ${taxResult.calculatedTax.toLocaleString()}) × 20% = ${ruralSurtax993.toLocaleString()}`,
        amount: ruralSurtax993,
        legalBasis: TRANSFER.RURAL_SURTAX_993,
      });
    }
  }

  /**
   * ─ Step F.5: **세액감면형** 감면 (§77·§77의2·§77의3·§97 시리즈 등) ─ (E3-02)
   *
   * 정상 경로 `transfer-tax-finalize.ts` STEP 8과 같은 인자·같은 순서로 `calcReductions`를
   * 부른다. 조특법 §127⑦ 중복배제(후보 배열 max)·§133② 5년 누적한도도 그 함수/모듈이 담당하므로
   * 여기서 다시 판정하지 않는다 — **판정을 복사하면 두 번째 진실이 생긴다**.
   */
  const {
    reductionAmount,
    reductionType,
    reductionTypeApplied,
    reductionLegalBasisOverride,
    reducibleIncome,
    aggregateReductionRate,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    gbDesignatedLandDetail,
    replacementLandDetail,
    selfFarmingReductionDetail,
    rental97TaxDetail,
  } = calcReductions(
    taxResult.calculatedTax,
    input.reductions,
    parsedRates.selfFarmingRules,
    input.rentalReductionDetails,
    parsedRates.longTermRentalRules,
    input.newHousingDetails,
    parsedRates.newHousingMatrix,
    input.transferDate,
    // 양도소득금액 = 과세양도차익 − 장기보유특별공제 (§77 감면 소득 안분 기준)
    Math.max(0, redevAfterRight.total.gain - redevAfterRight.total.lthd),
    basicDeduction,
    taxBase,
    input.acquisitionDate,
    input.standardPriceAtAcquisition,
    input.standardPriceAtTransfer,
    input.assetContractDate,
  );
  steps.push({
    label: "감면세액",
    formula: reductionType ? `${reductionType} 감면 ${reductionAmount.toLocaleString()}` : "감면 없음",
    amount: reductionAmount,
    // D1-12 — **id**를 넘긴다(라벨 아님).
    legalBasis: getReductionLegalBasis(
      reductionTypeApplied,
      publicExpropriationDetail?.useLegacyRates,
      reductionLegalBasisOverride,
    ),
  });

  // ─ Step F.6: 조특법 §133② 5년 누적 한도 ─
  const cap = applyReductionStatutoryCap({
    reductionAmount,
    reductionTypeApplied,
    transferYear: input.transferDate.getFullYear(),
    priorUsage: input.priorReductionUsage ?? [],
  });
  const cappedReductionAmount = cap.cappedAmount;
  if (cap.step) steps.push(cap.step);

  /**
   * ─ Step F.7: 농어촌특별세 ─ 「농어촌특별세법」 §5①1호 (감면세액 × 20%)
   *
   * 하이브리드(5년 내 세액감면형 미분양)와 그 밖의 세액감면형을 **배타적으로** 가른다 —
   * 같은 감면에 두 번 부과하지 않기 위해서다. 과세/비과세 열거 판정은
   * `transfer-tax-rural-surtax.ts` 단일 소스이고, 판정 못 한 유형은 **부과하지 않되 사유를 남긴다**
   * (법 근거 없는 불리 적용 금지).
   */
  let ruralSurtax = 0;
  if (reductionTypeApplied !== undefined && cappedReductionAmount > 0) {
    const isHybrid = HYBRID_ARTICLE[reductionTypeApplied] !== undefined;
    if (isHybrid) {
      ruralSurtax = applyRate(cappedReductionAmount, 0.2);
      steps.push({
        label: `${HYBRID_ARTICLE[reductionTypeApplied]} 농어촌특별세 (감면세액 × 20%)`,
        formula: `감면세액 ${cappedReductionAmount.toLocaleString()} × 20% = ${ruralSurtax.toLocaleString()}`,
        amount: ruralSurtax,
        legalBasis: "농어촌특별세법 §5①1호",
      });
    } else {
      const verdict = resolveTaxCreditRuralSurtax({
        reductionTypeApplied,
        reductionAmount: cappedReductionAmount,
        isSelfCultivatedExpropriatedLand: input.isSelfCultivatedExpropriatedLand,
      });
      ruralSurtax = verdict.surtax;
      if (verdict.surtax > 0) {
        steps.push({
          label: "농어촌특별세 (감면세액 × 20%)",
          formula: `감면세액 ${cappedReductionAmount.toLocaleString()} × 20% = ${verdict.surtax.toLocaleString()} — ${verdict.reason}`,
          amount: verdict.surtax,
          legalBasis: verdict.legalBasis,
        });
      } else if (verdict.verdict === "unknown") {
        // 침묵 금지 — 근거를 못 찾아 부과하지 않았다는 사실 자체를 남긴다.
        steps.push({
          label: "농어촌특별세 — 미판정",
          formula: verdict.reason,
          amount: 0,
          legalBasis: verdict.legalBasis,
        });
      }
    }
  }

  // ─ Step G: 결정세액 = 산출세액 − 감면 (원 미만 절사) · 지방소득세 (10%, 원 미만 절사) ─
  // 재개발 경로는 §114조의2 환산가액적용가산세 대상이 아니므로 가산세분 가산은 없다.
  const determinedTax = truncateToWon(Math.max(0, taxResult.calculatedTax - cappedReductionAmount));
  if (cappedReductionAmount > 0) {
    steps.push({
      label: "결정세액",
      formula: `산출세액 ${taxResult.calculatedTax.toLocaleString()} - 감면 ${cappedReductionAmount.toLocaleString()} (원 미만 절사)`,
      amount: determinedTax,
      legalBasis: TRANSFER.FINAL_TAX,
    });
  }
  const localIncomeTax = truncateToWon(applyRate(determinedTax, 0.1));
  if (determinedTax > 0) {
    steps.push({
      label: "지방소득세",
      formula: `${determinedTax.toLocaleString()} × 10%`,
      amount: localIncomeTax,
      legalBasis: TRANSFER.LOCAL_INCOME_TAX,
    });
  }

  // ─ Step G.5: 신고불성실·납부지연 가산세 (국세기본법 §47의2~4) ─
  // 일반 finalize 경로와 동일하게 emitPenaltySteps 재사용 — 재개발/입주권 양도도
  // 가산세는 자산 종류와 무관한 보편 항목이다. 입력에 filingPenaltyDetails·
  // delayedPaymentDetails가 없으면 filingDelayedPenalty=0·step 미푸시로 기존 동작 불변(additive).
  const { penaltyDetail, filingDelayedPenalty, totalAllPenalty } = emitPenaltySteps(
    input,
    steps,
    determinedTax,
    0, // penaltyTax(§114조의2 환산가액적용가산세) — 재개발 경로 미해당
    0, // penaltyBase
    undefined,
  );

  // ─ Step H: 세액합계 ─ (농특세는 §5①1호 감면분 — 정상 경로 STEP 11과 동일하게 합산한다)
  const ruralSurtaxTotal = ruralSurtax + ruralSurtax993;
  const totalTax = determinedTax + localIncomeTax + filingDelayedPenalty + ruralSurtaxTotal;
  steps.push({
    label: "세액합계",
    formula: (filingDelayedPenalty > 0
      ? `총결정세액 ${(determinedTax + totalAllPenalty).toLocaleString()} + 지방소득세 ${localIncomeTax.toLocaleString()}`
      : `${cappedReductionAmount > 0 ? "결정세액" : "산출세액"} ${determinedTax.toLocaleString()} + 지방소득세 ${localIncomeTax.toLocaleString()}`)
      + (ruralSurtaxTotal > 0 ? ` + 농특세 ${ruralSurtaxTotal.toLocaleString()}` : ""),
    amount: totalTax,
    legalBasis: REDEVELOPMENT.GAIN_BASE,
  });

  // ─ Step H.5: 수정신고(경정) — 추가납부세액 + 선택적 가산세 (끝 append) ─
  // input.amendment 없으면 undefined → 무영향(additive). finalize STEP 12.5와 동일 패턴.
  const amendmentDetail = input.amendment
    ? computeAmendment(input.amendment, determinedTax)
    : undefined;
  if (amendmentDetail) {
    for (const s of amendmentDetail.steps) steps.push({ ...s, sub: s.sub ?? true });
  }

  // ─ Step I: TransferTaxResult 빌드 ─
  return {
    /**
     * 전액 비과세 — 두 규정이 각각 자기 축에서 판정한다.
     *   · `oneRightExemptionApplied`      : 조합원입주권 §89①**4호** 가목 (`applyOneRightExemption`)
     *   · `aptOneHouseExemptionApplied`   : 완공 신축주택 §89①**3호** 가목 (2026-08-25 신설 — E3-01)
     * subject 가드로 서로 배타적이라 OR로 합쳐도 두 규정이 겹치지 않는다.
     */
    isExempt:
      redevAfterRight.oneRightExemptionApplied === true ||
      redevAfterRight.aptOneHouseExemptionApplied === true,
    /**
     * 🔴 **부분 비과세(고가주택) 플래그 — 종전에는 이 분기가 채우지 않았다** (E3-06).
     *
     * `transfer-tax-carryover.ts:351`의 §97의2②2호 자동 판정이
     * `resultA.isExempt === true || resultA.isPartialExempt === true`를 보는데,
     * 재개발 자산에서는 이 필드가 항상 undefined라 **언제나 false**였다.
     */
    isPartialExempt:
      redevAfterRight.oneRightHighValueApplied === true || (isHighValue && !!allocated.highValueAllocation),
    ...(opts?.exemptionResult?.exemptReason
      ? { exemptReason: opts.exemptionResult.exemptReason }
      : {}),
    /**
     * 🔴 **§97의2 이월과세 A/B 판정 근거 — 종전에는 통째로 소실됐다** (E3-06).
     *
     * STEP 0.475가 A/B를 계산해 `workingInput`까지 교체해 놓고, 이 분기가 조기 반환하며
     * detail을 담지 않았다(정상 경로는 `transfer-tax-finalize.ts`의 `buildTransferResultDetails`가
     * `carryoverTaxationDetail: ctx.carryoverDetail`로 싣는다). 파급 셋:
     *   ① 결과 화면 `CarryoverComparisonCard` 미표시 — 취득가액이 증여자 것으로 바뀐 근거를 볼 수 없다
     *   ② 다건 집계가 `p.carryoverTaxationDetail?.isEligible === true`로 §97의2②3호 신고단위 비교
     *      대상을 추리므로(`transfer-tax-aggregate.ts:661-663`) 재개발·입주권 자산이 조용히 빠진다
     *   ③ `adoptedCarryoverAcquisitionPrice(...)`가 undefined가 되어 신고서 표시 취득가액이
     *      수증자 취득가액으로 되돌아간다(`transfer-tax-aggregate.ts:508`)
     */
    ...(opts?.carryoverDetail ? { carryoverTaxationDetail: opts.carryoverDetail } : {}),
    // A19: §163⑨ 근거 2장 — 정상 경로의 `transfer-tax-finalize.ts:604-605`와 동형.
    ...(opts?.inheritedAcquisitionStep?.result
      ? { inheritedAcquisitionDetail: opts.inheritedAcquisitionStep.result }
      : {}),
    ...(opts?.inheritedAcquisitionStep?.houseValuationResult
      ? { inheritedHouseValuationDetail: opts.inheritedAcquisitionStep.houseValuationResult }
      : {}),
    // D4-08 — STEP 0.9+0.95 주택수 제외 상세. 이 분기가 조기이탈이라 상류에서 받아 실어야 한다.
    ...(opts?.houseCountExclusion ?? {}),
    /** 비차단 안내 — 정상 경로와 동형으로 항상 키를 싣는다(종전에는 키 자체가 없었다). */
    warnings: lthdSpecialNotice ? [...(opts?.warnings ?? []), lthdSpecialNotice] : (opts?.warnings ?? []),
    transferGain: redevAfterRight.total.gain,
    taxableGain: redevAfterRight.total.gain,
    usedEstimatedAcquisition: input.useEstimatedAcquisition ?? false,
    longTermHoldingDeduction: redevAfterRight.total.lthd,
    longTermHoldingRate: 0, // 분기별 율 (3종) — redevelopmentDetail.preApproval/postApproval/settlement.lthdRate 참조
    /**
     * §97의3·§97의4 특례 근거 echo — 결과 카드가 「왜 공제율이 달라졌는지」를 보여준다.
     * 정상 경로(`transfer-tax-lthd.ts`)는 항상 싣는데 이 분기만 비어 있었다 (CB-07과 같은 성질).
     * 적격이 아니어도 싣는다 — 선택했는데 화면에서 통째로 사라지면 사유를 알 길이 없다.
     */
    ...(rental97Special ? { rental97LthdDetail: rental97Special } : {}),
    lthdStartDate: resolveLTHDStartDate(input),
    basicDeduction,
    taxBase,
    appliedRate: taxResult.appliedRate,
    progressiveDeduction: taxResult.progressiveDeduction,
    calculatedTax: taxResult.calculatedTax,
    isSurchargeSuspended: taxResult.surchargeSuspended,
    surchargeRate: taxResult.surchargeRate,
    surchargeType: taxResult.surchargeType,
    /**
     * 🔴 **다건 집계가 중과를 재판정하지 않게 하는 echo** (F01과 동형).
     *
     * `transfer-tax-aggregate-helpers.ts`의 `assetTaxOf`는 자산별 세율을 다시 구하면서
     * `records[i].result.multiHouseSurchargeEvaluation`을 `calcTax`에 넘긴다. 이 필드가
     * 없으면 `calcTax`가 **원시 플래그로 재판정**해 단건이 배제한 중과가 다건에서 되살아난다
     * (optional이라 TypeScript가 못 잡는다).
     *
     * 종전에는 재개발 경로 자체가 중과를 안 걸어서 드러나지 않았다 — **중과를 여는 이 배치가
     * 그 위험을 새로 활성화**한다(memory `feedback_ui_gate_expansion_activates_latent_defect`).
     */
    multiHouseSurchargeEvaluation: multiHouseSurchargeResult,
    /**
     * 🔑 **배제한 이유를 화면까지 보낸다** — 일반 경로(`transfer-tax-lthd.ts`)는 이 필드를
     * 채우는데 재개발 경로만 비어 있었다. 그러면 상세명세서·결과 카드가 「양도차익 × **0%**」로만
     * 표시해 **왜 0인지 알 수 없다**(memory `feedback_engine_result_display_drift`).
     *
     * 배제 여부와 이 필드는 **같은 술어**(`lthdExclusionReason`)에서 나온다 — 따로 판정하면
     * 「공제는 0인데 사유는 없다」는 세 번째 진실이 생긴다. 그래서 Step A.8이 사유까지 확정하고
     * 여기서는 그 값을 그대로 싣는다(2026-08-25 미등기 사유 추가 — E2-04).
     */
    ...(lthdExclusionReason ? { lthdExclusionReason } : {}),
    /**
     * 🔴 **조특법 감면 — 종전에는 `0` 하드코딩이었다** (E3-02).
     *
     * 이 분기는 `finalizeTransferTax`를 타지 않고 결과를 직접 조립하는데, `input.reductions`를
     * 한 번도 읽지 않아 감면세액·감면유형·각 detail·농특세가 **전부 소실**했다. 감면 게이트가
     * 재개발·입주권을 허용 자산으로 명시하고 ④·⑫도 통과시키므로, 사용자에게는 감면이 선택된
     * 상태로 보이는데 세액은 미선택과 **1원도 다르지 않았다**(실측: 응답 전 필드 동일).
     *
     * 값은 §133② 5년 누적한도 반영본(`cappedReductionAmount`)이다 — 결정세액 산식과 같은 값을
     * 실어야 「표시된 감면액으로 역산하면 결정세액이 안 맞는」 세 번째 진실이 생기지 않는다.
     */
    reductionAmount: cappedReductionAmount,
    reductionType,
    reductionTypeApplied,
    reducibleIncome,
    aggregateReductionRate,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    gbDesignatedLandDetail,
    replacementLandDetail,
    selfFarmingReductionDetail,
    rental97TaxDetail,
    determinedTax,
    penaltyTax: 0,
    penaltyBase: 0,
    localIncomeTax,
    penaltyDetail,
    // [echo] 농특세 총액(§99의3분 + 감면분). 종전에는 이 경로가 `ruralSurtax993`조차 싣지
    // 않아 재개발·입주권에서는 소득금액차감형 농특세까지 화면에서 0이 됐다 — `totalTax`엔 있다.
    ruralSurtax: ruralSurtaxTotal,
    totalTax,
    amendmentDetail,
    steps,
    // 재개발 상세 부착
    redevelopmentDetail: redevAfterRight,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼 — STEP 3 (12억 안분) §95③·시행령 §160
// ──────────────────────────────────────────────────────────────────────────────
