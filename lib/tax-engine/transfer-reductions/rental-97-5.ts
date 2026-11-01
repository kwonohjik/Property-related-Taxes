/**
 * 조특법 §97의5 — 장기일반민간임대주택등 양도소득세 감면 (Phase 2 본격 구현)
 *
 * 효과: 임대기간 중 발생한 양도소득에 대한 양도소득세 100% 감면 (산출세액 단계).
 *
 * 요건 (law.go.kr 2026-06-11 현행 검증):
 * - ①1호: 2018.12.31까지 민간매입임대주택·공공매입임대주택 취득(2018.12.31까지 매매계약+계약금 포함)
 *          + 취득일로부터 3개월 이내에 공공지원/장기일반민간임대주택등으로 등록
 * - ①2호: 10년 이상 계속하여 장기일반민간임대주택등으로 임대 (령 §97의5① — 등록 10년+ 계속 임대.
 *          공실 6개월 이내·수용·재개발 등 중단 기간은 계속 임대 간주)
 * - ①3호: 임대기간 중 §97의3①2호 요건(임대료 증액 5% 제한 등) 준수
 * - ②: §97의3·§97의4와 중복 적용 불가
 * - 감면 범위: 임대기간 중 발생 양도소득 한정 — 기준시가 안분 (령 §97의5②),
 *   감면세액은 「소득세법」 §90① 산식(산출세액 × (B − C) ÷ D)으로 계산
 * - 국민주택규모·기준시가 한도: ①3호가 준용하는 조특령 §97의3③2호·4호로 **적용된다** (CA-01 —
 *   `checkRental973Clause24`). 종전 주석의 「전용면적 요건 없음」은 ①3호 준용 사슬을 놓친 결론이었다.
 * - §133 종합한도: §97의5는 §133 열거 대상 아님 — 한도 미적용
 */

import { addMonths } from "date-fns";
import { safeMultiplyThenDivide } from "../tax-utils";
import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { checkReductionPeriod } from "./period-check";
import {
  calcRentalGainFraction,
  applyRentalGainShare,
  type RentalGainFraction,
  checkRental973Clause24,
  validateRentIncrease,
  validateRentIncreaseInterval,
  rental97EffectiveStart,
  rentViolationsFromRentalStart,
  DEFAULT_JEONSE_CONVERSION_RATE,
} from "./rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97IneligibleReason, Rental97Result } from "./types";
import { evaluateContinuousRental975 } from "./rental-97-5-period";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const RENTAL_97_5_MANDATORY_YEARS = 10;
/** §97의5①1호 — 취득일로부터 등록까지 허용 개월 */
export const RENTAL_97_5_REGISTRATION_MONTHS = 3;

export function evaluateRental975(input: Rental97EvaluationInput): Rental97Result {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.RENTAL_97_5;
  const reasons: Rental97IneligibleReason[] = [];

  // 0) 시한 — 취득(계약) ~2018.12.31
  const period = checkReductionPeriod("rental_97_5", input);
  if (!period.inPeriod) {
    reasons.push({
      code: "OUT_OF_PERIOD",
      message: period.failReason ?? "취득·계약 시한(2018.12.31) 외",
      legalBasis,
    });
  }

  // 1) 필수 입력
  if (!input.registrationDate) {
    reasons.push({ code: "MISSING_REGISTRATION_DATE", message: "임대사업자 등록일이 입력되지 않았습니다.", legalBasis });
  }
  if (!input.rentalStartDate) {
    reasons.push({ code: "MISSING_RENTAL_START", message: "임대개시일이 입력되지 않았습니다.", legalBasis });
  }
  if (!input.acquisitionDate) {
    reasons.push({ code: "MISSING_ACQUISITION_DATE", message: "취득일이 입력되지 않았습니다 (3개월 내 등록 검증).", legalBasis });
  }
  if (!input.isTaxRegistered) {
    reasons.push({
      code: "TAX_REGISTRATION_REQUIRED",
      message: "세무서 사업자등록(소득세법 §168)이 확인되지 않았습니다 (조특령 §97의5③).",
      legalBasis: "조특령 §97의5③",
    });
  } else if (!input.taxRegistrationDate) {
    // 임대개시 기산일의 한 축 — 미입력을 「등록일 이전」으로 읽지 않는다(자동 fallback 금지)
    reasons.push({
      code: "MISSING_TAX_REGISTRATION_DATE",
      message: "세무서 사업자등록일이 입력되지 않았습니다 — 사업자등록일이 늦으면 그날부터 임대를 개시한 것으로 봅니다 (조특령 §97의5③).",
      legalBasis: "조특령 §97의5③",
    });
  }

  /**
   * 1-1) ①1호 — 「민간매입임대주택 및 … 공공매입임대주택을 취득」 (리뷰 6번)
   * 민특법 §2 3호 민간매입임대주택 = 「임대사업자가 **매매 등**으로 소유권을 취득하여 임대하는 민간임대주택」.
   * 증여 취득(부동산납세과-486, 2017.5.17)·분양권 승계 취득 후 완공(법령해석과-2193, 2017.7.28)도 해당한다.
   * 빠지는 것은 민간건설임대주택(§2 2호 — 임대사업자가 임대 목적으로 **건설**)이다.
   * 미입력은 충족으로 읽지 않는다.
   */
  if (input.isPurchaseRental !== true) {
    reasons.push({
      code: "NOT_PURCHASE_RENTAL",
      message:
        input.isPurchaseRental === false
          ? "건설임대주택(민특법 §2 2호)은 대상이 아닙니다 — 매입임대주택(매매·증여 등으로 소유권을 취득)이어야 합니다 (§97의5①1호)."
          : "매입임대주택(매매·증여 등으로 소유권을 취득한 주택)인지 확인되지 않았습니다 (§97의5①1호).",
      legalBasis,
    });
  }

  // 2) ①1호 — 취득일로부터 3개월 이내 등록
  if (input.acquisitionDate && input.registrationDate) {
    const deadline = addMonths(input.acquisitionDate, RENTAL_97_5_REGISTRATION_MONTHS);
    if (input.registrationDate.getTime() > deadline.getTime()) {
      reasons.push({
        code: "REGISTRATION_AFTER_3_MONTHS",
        message: "취득일로부터 3개월 이내에 장기일반민간임대주택등으로 등록하지 않았습니다 (§97의5①1호).",
        legalBasis,
      });
    }
  }

  // 3) ①3호 — 임대료 증액 제한 (§97의3①2호 준용)
  if (input.rentHistory && input.rentHistory.length >= 2) {
    // 임대개시일(령 §97의3④·§97의5③ 기산일) 이후 체결·갱신한 계약의 증액만 판정한다
    const rentStart = rental97EffectiveStart(input);
    const capViolations = rentViolationsFromRentalStart(
      validateRentIncrease(input.rentHistory, input.jeonseConversionRate ?? DEFAULT_JEONSE_CONVERSION_RATE).violations,
      rentStart,
    );
    if (capViolations.length > 0) {
      reasons.push({
        code: "RENT_INCREASE_VIOLATED",
        message: `임대료(환산보증금) 증액 5% 제한 위반 계약 ${capViolations.length}건 (§97의5①3호 — §97의3①2호 준용). 임대사업자 등록일·세무서 사업자등록일·실제 임대개시일 중 가장 늦은 날 이후 체결·갱신한 계약만 셉니다.`,
        legalBasis,
      });
    }
    // 리뷰 9번 — 조특령 §97의3③1호 후단: 계약·증액 후 1년 이내 재증액 금지
    const intervalViolations = rentViolationsFromRentalStart(
      validateRentIncreaseInterval(input.rentHistory, input.jeonseConversionRate ?? DEFAULT_JEONSE_CONVERSION_RATE)
        .violations,
      rentStart,
    );
    if (intervalViolations.length > 0) {
      reasons.push({
        code: "RENT_INCREASE_WITHIN_1_YEAR",
        message:
          `직전 계약(증액)일로부터 1년 이내에 임대료(환산보증금)를 올린 계약 ${intervalViolations.length}건 ` +
          `(${intervalViolations.map((v) => `${ymd(v.previousContractDate)} → ${ymd(v.contractDate)}`).join(", ")}) ` +
          `— 조특령 §97의3③1호 후단 「증액이 있은 후 1년 이내에는 하지 못하고」 (§97의5①3호 준용). ` +
          `1년은 민법 기간 계산으로 다음 해 같은 날에 만료합니다. 임대사업자 등록일·세무서 사업자등록일·실제 임대개시일 중 가장 늦은 날 이후 체결·갱신한 계약만 셉니다.`,
        legalBasis: "조특령 §97의3③1호",
      });
    }
  } else if (input.rentIncreaseViolated === true) {
    reasons.push({
      code: "RENT_INCREASE_VIOLATED",
      message: "임대료 증액 5% 제한 위반 이력이 신고되었습니다 (§97의5①3호).",
      legalBasis,
    });
  }

  /**
   * 3-1) ①3호 — 「임대기간 중 **제97조의3제1항제2호의 요건**을 준수할 것」 (CA-01)
   *
   * 그 위임 종점이 조특령 §97의3③ **1~4호 전부**다. 위 3)이 1호(임대료 5%)를 보고,
   * 2호(국민주택규모)·4호(기준시가 6억/3억)를 여기서 본다.
   * 3호(10년 이상 임대)는 아래 4)의 §97의5①2호 검사가 담당한다.
   *
   * 🔴 종전에는 1호만 검증했다 — `officialPriceAtStart`·`region`을 router가 넘겨주는데도
   *    평가기가 한도 비교를 하지 않는 dead pass-through였다.
   */
  reasons.push(...checkRental973Clause24(input, "§97의5①3호 준용 — "));

  // 4) ①2호 — 10년 이상 계속 임대
  let eligibleRentalYears = 0;
  if (input.rentalStartDate) {
    /**
     * 조특령 §97의5③ — 「…사업자등록과 임대사업자등록을 하고 장기일반민간임대주택등으로
     * **등록하여 임대하는 날부터** 임대를 개시한 것으로 본다」 (D2-02 — §97의3과 같은 구조)
     *
     * 법 §97의5①2호는 「장기일반민간임대주택등으로 **등록 후** 10년 이상 계속하여 …
     * 임대한 후 양도할 것」이고, 조특령 §97의5①은 「10년 이상 계속하여 등록하고,
     * 그 **등록한 기간 동안** 계속하여 10년 이상 임대한 경우로 한다」이다.
     * ⇒ 등록 이전 임대기간은 산입하지 않는다.
     *
     * 리뷰 9번 — 「소득세법」 §168 **사업자등록**도 같은 문장의 요건이다. 세무서 사업자등록이 늦으면
     * 그날부터 개시한다(종전에는 예/아니오만 받아 기산일에 반영하지 못했다).
     */
    const effectiveStart = rental97EffectiveStart(input) as Date; // rentalStartDate 확인됨

    /**
     * 종점 — 법 §97의5①2호 「10년 이상 계속하여 … 임대한 **후 양도**할 것」.
     * 양도 전에 임대를 끝냈으면(`rentalContinuesToTransfer === false`) 종점은 **임대 종료일**이다.
     * 🔴 종전에는 항상 양도일이었다 — 조기 종료 선언이 안분 비율(령 §97의5② B)만 바꾸고
     *    10년 판정은 그대로 통과시켰다. 미입력은 양도일로 대체하지 않는다(자동 fallback 금지).
     */
    const rentalEnded = input.rentalContinuesToTransfer === false;
    let periodEnd: Date | undefined = input.transferDate;
    if (rentalEnded) {
      periodEnd = undefined;
      if (!input.rentalEndDate) {
        reasons.push({
          code: "MISSING_RENTAL_END_DATE",
          message: "양도 전에 임대를 종료한 경우 임대 종료일을 입력해야 합니다 (§97의5①2호 — 10년 계속 임대 판정의 종점).",
          legalBasis,
        });
      } else if (
        input.rentalEndDate.getTime() > input.transferDate.getTime() ||
        input.rentalEndDate.getTime() < effectiveStart.getTime()
      ) {
        reasons.push({
          code: "INVALID_RENTAL_END_DATE",
          message: "임대 종료일은 임대개시일(등록일이 늦으면 등록일)과 양도일 사이여야 합니다 (§97의5①2호).",
          legalBasis,
        });
      } else {
        periodEnd = input.rentalEndDate;
      }
    }

    if (periodEnd) {
      // 리뷰 2·5번 — 6개월 초과 공실은 계속성을 끊고(가장 긴 연속 구간으로 판정), 수용·정비사업 간주기간은 계속 임대로 본다.
      const cont = evaluateContinuousRental975({
        start: effectiveStart,
        end: periodEnd,
        vacancyPeriods: input.vacancyPeriods ?? [],
        deemedRentalPeriods: input.deemedRentalPeriods ?? [],
      });
      eligibleRentalYears = cont.years;
      if (eligibleRentalYears < RENTAL_97_5_MANDATORY_YEARS) {
        const restartNote =
          cont.breaks.length > 0 && cont.longestSegment
            ? ` 6개월을 넘는 공실(${cont.breaks.map((b) => `${ymd(b.start)}~${ymd(b.end)}`).join(", ")})로 계속 임대가 ` +
              `끊겨, 가장 긴 계속 임대 구간(${ymd(cont.longestSegment.start)}~${ymd(cont.longestSegment.end)})으로 ` +
              `판정했습니다 (조특령 §97의5①1호 — 6개월 이내 공실만 계속 임대로 봄).`
            : "";
        reasons.push({
          code: "RENTAL_PERIOD_SHORT",
          message: `계속 임대기간 ${eligibleRentalYears}년 — 10년 이상 계속 임대 요건 미달 (§97의5①2호).${restartNote}`,
          legalBasis,
        });
      }
    }
  }

  // 5) 임대기간 분 양도소득 안분 (령 §97의5②)
  let rentalGainRatio = 1;
  let rentalGainFraction: RentalGainFraction | undefined;
  if (input.rentalStartDate && input.acquisitionDate) {
    const fraction = calcRentalGainFraction({
      rentalStartDate: input.rentalStartDate,
      acquisitionDate: input.acquisitionDate,
      // 조특령 §97의5② — 분자의 감수는 **취득당시** 기준시가다(§97의3의 임대개시일이 아니다).
      numeratorBase: "acquisition",
      rentalContinuesToTransfer: input.rentalContinuesToTransfer !== false,
      stdPriceAtRentalEnd: input.stdPriceAtRentalEnd,
      stdPriceAtAcquisition: input.stdPriceAtAcquisition,
      stdPriceAtRentalStart: input.stdPriceAtRentalStart ?? input.officialPriceAtStart,
      stdPriceAtTransfer: input.stdPriceAtTransfer,
    });
    if (fraction === null) {
      // 여기 도달하는 것은 「양도 전 임대 종료」뿐이다 — 계속 임대면 비율이 항상 1이다(헬퍼 조기 반환).
      const acq = input.stdPriceAtAcquisition;
      const trf = input.stdPriceAtTransfer;
      const pricesGiven =
        acq !== undefined && acq > 0 && trf !== undefined && trf > 0 &&
        input.stdPriceAtRentalEnd !== undefined && input.stdPriceAtRentalEnd > 0;
      reasons.push(
        pricesGiven && trf! <= acq!
          ? {
              code: "PRORATION_DENOMINATOR_NONPOSITIVE",
              message:
                "양도 당시 기준시가가 취득 당시 기준시가 이하여서 임대기간 분 양도소득 안분 산식" +
                "(조특령 §97의5②)의 분모가 0 이하입니다. 이 경우의 계산 방법은 법령에 없어 " +
                "자동 안분하지 않습니다 — 관할 세무서 확인이 필요합니다.",
              legalBasis: "조특령 §97의5②",
            }
          : {
              code: "MISSING_PRORATION_PRICES",
              message:
                "양도 전에 임대를 종료해 임대기간 분 양도소득 안분(조특령 §97의5②)이 필요하지만 " +
                "취득 당시·임대 종료일·양도 당시 기준시가가 모두 입력되지 않았습니다. 자동 안분은 수행하지 않습니다.",
              legalBasis: "조특령 §97의5②",
            },
      );
    } else {
      rentalGainRatio = fraction.num / fraction.den;
      rentalGainFraction = fraction;
    }
  }

  // 6) 산출세액 컨텍스트
  if (input.calculatedTax === undefined || input.calculatedTax < 0) {
    reasons.push({ code: "MISSING_CALCULATED_TAX", message: "산출세액 컨텍스트가 전달되지 않았습니다.", legalBasis });
  }

  if (reasons.length > 0) {
    return {
      id: "rental_97_5",
      isEligible: false,
      ineligibleReasons: reasons,
      legalBasis,
      effectCategory: "tax_amount",
    };
  }

  const { reductionAmount, section90 } = calcSection90Reduction(input, { rentalGainRatio, rentalGainFraction });

  return {
    id: "rental_97_5",
    isEligible: true,
    legalBasis,
    effectCategory: "tax_amount",
    reductionRate: 1.0,
    reductionAmount,
    rentalGainRatio,
    rentalGainFraction,
    isFullExemption: true,
    ...(section90 ? { section90 } : {}),
  };
}

/**
 * 감면세액 — 「소득세법」 §90① (감면율 100%):
 *
 *   감면액 = A × (B − C) ÷ D × E
 *   A 산출세액 · B 감면대상 양도소득금액(= 양도소득금액 × 임대기간 분 비율, 령 §97의5②)
 *   C 「제103조제2항에 따른」 기본공제 — 「감면소득금액 외의 양도소득금액에서 먼저 공제」하고
 *     남는 부분만 감면소득에 배정된다 · D 과세표준 · E 감면율(1)
 *
 * 🔴 종전에는 `A × 비율`이었다. 비율 < 1이면 감면 외 소득이 기본공제를 흡수해 C = 0이 되는데
 *    D는 기본공제만큼 작으므로 A × B ÷ D > A × 비율 — 감면이 과소했다
 *    (리뷰 실측: 산출세액 160,260,000원 · 비율 0.5 → 80,130,000원 vs §90① 80,560,343원).
 *
 * 비율 1이면 B − C = 양도소득금액 − 기본공제 = D이므로 A 그대로다 — 계산하지 않고 A를 쓴다.
 * §90① 입력(양도소득금액·기본공제·과세표준)이 없는 단위 호출은 A × 비율로 계산한다.
 */
function calcSection90Reduction(
  input: Rental97EvaluationInput,
  share: { rentalGainRatio: number; rentalGainFraction?: RentalGainFraction },
): {
  reductionAmount: number;
  section90?: { reducibleIncome: number; basicDeductionAllocated: number; taxBase: number };
} {
  const tax = input.calculatedTax!;
  const f = share.rentalGainFraction;
  const { transferIncome, basicDeduction, taxBase, reducibleBaseIncome } = input;
  // 비율 1 — 분수가 없거나 `{ num: 1, den: 1 }`(FULL_RENTAL_SHARE)·클램프로 num = den.
  // 감면대상이 양도소득금액 전체일 때만 A 그대로다(겸용주택 등 일부 파트 한정이면 §90①로 계산).
  const fullShare = !f || f.num >= f.den;
  if (fullShare && reducibleBaseIncome === undefined) return { reductionAmount: tax };

  if (transferIncome === undefined || basicDeduction === undefined || taxBase === undefined || taxBase <= 0) {
    return { reductionAmount: applyRentalGainShare(tax, share) };
  }
  const base = Math.min(transferIncome, Math.max(0, reducibleBaseIncome ?? transferIncome));
  if (fullShare && base === transferIncome) return { reductionAmount: tax };
  const reducibleIncome = applyRentalGainShare(base, share); // B
  const nonReducible = transferIncome - reducibleIncome;
  const basicDeductionAllocated = Math.min(reducibleIncome, Math.max(0, basicDeduction - nonReducible)); // C
  const reductionAmount = Math.min(
    tax,
    safeMultiplyThenDivide(tax, Math.max(0, reducibleIncome - basicDeductionAllocated), taxBase),
  );
  return { reductionAmount, section90: { reducibleIncome, basicDeductionAllocated, taxBase } };
}
