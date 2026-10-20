/**
 * STEP 2.5 헬퍼 — §155⑳ 거주주택 특례 경로의 **조특법 감면 · 농어촌특별세** 계산(순수 이동).
 *
 * `transfer-tax-rental-housing-step.ts` 800줄 정책 분리 — 로직·문구는 그대로 옮겼다. 순수 함수(DB 호출 없음) — `steps`에 단계를 push하는 부수효과만 있다.
 */
import { TRANSFER_RENTAL_HOUSING } from "./legal-codes/transfer";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";
import { calcReductions } from "./transfer-tax-rate-calc";
import { expropriationAcquisitionDate } from "./public-expropriation-reduction";
import { applyReductionStatutoryCap } from "./transfer-tax-reduction-cap";
import { resolveTaxCreditRuralSurtax } from "./transfer-tax-rural-surtax";
import { ALL_INCOME_DEDUCTION_IDS } from "./transfer-reductions/income-deduction-router";
import { LTHD_SPECIAL_REDUCTION_IDS } from "./transfer-reductions/unsold-hybrid-p3";
import { getReductionLegalBasis } from "./transfer-tax-helpers";
import type { ParsedRates } from "./transfer-tax-helpers";

export function applyRentalHousingReductions(args: {
  /** 원본 입력 — 사용자가 고른 감면 목록 */
  input: TransferTaxInput;
  effectiveInput: TransferTaxInput;
  parsedRates: ParsedRates;
  steps: CalculationStep[];
  /** 특례 경로 산출세액(감면 전) */
  calculatedTax: number;
  /** 특례 경로 과세대상 양도소득금액 합(장특·안분 후) */
  totalTaxableIncome: number;
  rheBasicDeduction: number;
  rheTaxBase: number;
}) {
  const { input, effectiveInput, parsedRates, steps, calculatedTax, totalTaxableIncome, rheBasicDeduction, rheTaxBase } = args;
  /**
   * ── 조특법 감면 (F08) ──────────────────────────────────────────────────
   *
   * 🔴 종전에는 이 경로가 `finalizeTransferTax`를 거치지 않는다는 **구현상의 이유로**
   *    사용자가 고른 감면을 한 줄의 안내도 없이 0으로 만들었다(실측: §77 공익수용
   *    **80,660,250**이 특례를 끄면 잡히고 켜면 0).
   *
   * **병용을 막는 명문이 없다.** 「조세특례제한법」 §127(중복지원의 배제)은 ⑦에서
   * 「둘 이상의 **감면규정**이 동시 적용되면 하나를 선택」이라고 정할 뿐, 「소득세법 시행령」
   * §155⑳ 비과세 특례와 감면의 병용을 배제하는 규정은 두지 않았다. 비과세분은 애초에
   * 과세대상이 아니고, **과세되는 부분**(고가주택 초과분·배율 초과 부수토지분)에 대해
   * 감면을 적용하는 구조 자체는 일반 경로와 다르지 않다.
   * ⇒ 근거 없이 0으로 만드는 것이 오히려 정당화되지 않는다.
   *
   * ## 두 축을 가른다
   *
   * · **세액감면형**(§69 자경농지·§77 공익수용·§77의2 대토·§97 시리즈 등) — 산출세액에서
   *   감면세액을 빼는 구조라 이 경로에도 **그대로 적용된다**. 일반 경로와 **같은 함수**
   *   (`calcReductions`)와 **같은 한도 규칙**(`applyReductionStatutoryCap`)을 쓴다.
   * · **차감형·하이브리드**({@link ALL_INCOME_DEDUCTION_IDS} 11종 — §99의3·§99·§98 시리즈) —
   *   **양도소득금액을 차감**하는 구조인데, 그것을 「소득세법 시행령」 §161 안분의 **앞/뒤
   *   어디에 얹을지 정한 명문이 없다**. 추정으로 자리를 정하면 조용히 틀린다.
   *   ⇒ 계산에 넣지 않고 **넣지 않았다는 사실을 표시**한다(종전 고지 유지).
   *
   * ✅ **농특세는 붙는다**(2026-08-23 `0b8aa295`로 별건 해소). 「농어촌특별세법」 §5①1호가
   *    조특법 감면세액 × 20%를 정하고 비과세는 시행령 §4가 **열거**한 것뿐이다.
   *    판정표는 `transfer-tax-rural-surtax.ts` **단일 소스**를 단건·이 경로·다건이 공유한다 —
   *    한 곳만 고치면 같은 감면이 경로에 따라 갈린다.
   *
   * 계획서: `docs/00-pm/transfer-review-2026-08-open-items.plan.md` §F08
   */
  const allReductions = input.reductions ?? [];
  const incomeDeductionIds = new Set<string>(ALL_INCOME_DEDUCTION_IDS);
  /** 차감형·하이브리드 — 이 경로가 계산하지 않는 축(§161 안분 위치 명문 부재). */
  const deferredReductions = allReductions.filter((r) => incomeDeductionIds.has(r.type));
  /** 세액감면형 — 일반 경로와 동일하게 계산한다. */
  const taxCreditReductions = allReductions.filter((r) => !incomeDeductionIds.has(r.type));
  /**
   * **LTHD 계열 특례 고지** (CB-02·D5-05) — 감면 효과는 3종인데 위 이분법은 2종만 가른다.
   *
   * §97의3①(임대기간분 70%)·§97의4①(표1 가산)·§98의2①1호(표2)는 **감면세액이 아니라
   * 장기보유특별공제율 자체**를 바꾸는 조문이라 `calcReductions`에서 계산되지 않는다.
   * 세액 반영은 §166⑤ 3분기 구조와의 결합 판단이 남아 있어 **아직 하지 않는다** —
   * 그때까지 「선택은 되는데 계산엔 없다」는 침묵만은 없앤다.
   */
  const lthdSpecialReductions = allReductions.filter((r) =>
    LTHD_SPECIAL_REDUCTION_IDS.includes(r.type),
  );

  const reductionResult = calcReductions(
    calculatedTax,
    taxCreditReductions,
    parsedRates.selfFarmingRules,
    effectiveInput.rentalReductionDetails,
    parsedRates.longTermRentalRules,
    // 신축주택(§99·§99의3)은 차감형이라 여기 넘기지 않는다 — 위 축 분리와 일관.
    undefined,
    parsedRates.newHousingMatrix,
    effectiveInput.transferDate,
    // 감면대상 소득 안분의 분모 — 이 경로의 **과세대상** 양도소득금액(장특 반영 후).
    Math.max(0, totalTaxableIncome),
    rheBasicDeduction,
    rheTaxBase,
    effectiveInput.acquisitionDate,
    effectiveInput.standardPriceAtAcquisition,
    effectiveInput.standardPriceAtTransfer,
    effectiveInput.assetContractDate,
    effectiveInput.isUnregistered,
    undefined, // 5B 파트별 판정 — 이 경로는 범위 밖
    expropriationAcquisitionDate(effectiveInput), // §77⑨·§77의3③ — 상속 = 피상속인 취득일
    effectiveInput.nonHeirBequest, // 수유자 — §69 피상속인 경작기간 미합산 · §77 불성립 고지
  );

  const cap = applyReductionStatutoryCap({
    reductionAmount: reductionResult.reductionAmount,
    reductionTypeApplied: reductionResult.reductionTypeApplied,
    transferYear: effectiveInput.transferDate.getFullYear(),
    priorUsage: effectiveInput.priorReductionUsage ?? [],
  });
  const rheReductionAmount = cap.cappedAmount;

  if (rheReductionAmount > 0 || reductionResult.reductionType) {
    steps.push({
      label: "감면세액",
      formula: reductionResult.reductionType
        ? `${reductionResult.reductionType} 감면 ${rheReductionAmount.toLocaleString()}`
        : "감면 없음",
      amount: rheReductionAmount,
      // D1-12 — **id**를 넘긴다(라벨 아님).
      legalBasis: getReductionLegalBasis(
        reductionResult.reductionTypeApplied,
        reductionResult.publicExpropriationDetail?.useLegacyRates,
        reductionResult.reductionLegalBasisOverride,
      ),
    });
  }
  if (cap.step) steps.push(cap.step);

  const reductionNotice =
    deferredReductions.length > 0
      ? `선택한 감면 중 ${deferredReductions.length}건(양도소득금액 차감형)은 이 계산에 반영되지 않았습니다 — 거주주택 비과세 특례(소득세법 시행령 §155⑳)의 §161 안분과 차감 순서를 정한 규정이 없습니다. 「조세특례제한법」 §99·§99의3은 고가주택 배제 단서가 명문이므로 적용 대상이 아닙니다.`
      : undefined;
  if (reductionNotice) {
    steps.push({
      label: "조특법 감면 — 미반영 (차감형)",
      formula: reductionNotice,
      amount: 0,
      legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
    });
  }
  const lthdNotice =
    lthdSpecialReductions.length > 0
      ? `선택한 감면 중 ${lthdSpecialReductions.length}건(장기보유특별공제 특례 — 조세특례제한법 §97의3①·§97의4①·§98의2①1호)은 이 계산에 반영되지 않았습니다. 이 경로가 양도하는 자산은 «거주주택»이고 §97의3·§97의4는 «임대주택»에 붙는 특례이므로 선택 자체를 재확인하시기 바랍니다.`
      : undefined;
  if (lthdNotice) {
    steps.push({
      label: "조특법 감면 — 미반영 (장기보유특별공제 특례)",
      formula: lthdNotice,
      amount: 0,
      legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
    });
  }

  /**
   * 농어촌특별세 — 일반 경로(STEP 8.8)와 **같은 판정표**를 쓴다(`transfer-tax-rural-surtax.ts`).
   * 여기서만 빼면 같은 감면이 특례 여부에 따라 농특세가 달라진다.
   */
  const rheSurtaxVerdict = resolveTaxCreditRuralSurtax({
    reductionTypeApplied: reductionResult.reductionTypeApplied,
    reductionAmount: rheReductionAmount,
    isSelfCultivatedExpropriatedLand: effectiveInput.isSelfCultivatedExpropriatedLand,
  });
  if (rheSurtaxVerdict.surtax > 0) {
    steps.push({
      label: "농어촌특별세 (감면세액 × 20%)",
      formula: `감면세액 ${rheReductionAmount.toLocaleString()} × 20% = ${rheSurtaxVerdict.surtax.toLocaleString()} — ${rheSurtaxVerdict.reason}`,
      amount: rheSurtaxVerdict.surtax,
      legalBasis: rheSurtaxVerdict.legalBasis,
    });
  }

  return { reductionResult, rheReductionAmount, rheSurtaxVerdict, reductionNotice, lthdNotice };
}
