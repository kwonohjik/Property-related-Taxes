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

import { addMonths } from "../utc-date";
import { safeMultiplyThenDivide } from "../tax-utils";
import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { RENTAL_97_5_PERIOD } from "../legal-codes/transfer";
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
  rentCheckEnd97,
  rentIntervalViolationsFromRuleDate,
  DEFAULT_JEONSE_CONVERSION_RATE,
} from "./rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97IneligibleReason, Rental97Result } from "./types";
import { evaluateRental975Continuity } from "./rental-97-5-period";

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

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
   * 1-0) 상속받은 임대주택 — 조특령 §97의5③ → §97⑤3호 피상속인 임대기간 합산 (V-13 · `inheritance975` 타입 주석).
   * 날짜 순서가 어긋나면 피상속인 분이 양도일까지 잘리거나 음수가 된다 — §97의4(`rental-97-4.ts` 1-0)와 같은 조건으로 막는다.
   */
  const inh = input.inheritance975;
  const inhInvalid =
    inh !== undefined &&
    (inh.decedentRentalStartDate.getTime() >= inh.inheritanceDate.getTime() ||
      inh.decedentRegistrationDate.getTime() >= inh.inheritanceDate.getTime() ||
      inh.inheritanceDate.getTime() > input.transferDate.getTime());
  if (inhInvalid) {
    reasons.push({
      code: "INVALID_INHERITANCE_DATES",
      message:
        "피상속인의 임대개시일·등록등일은 상속개시일보다 앞서고, 상속개시일은 양도일 이전이어야 합니다 (조특령 §97의5③ → §97⑤3호 — 피상속인 임대기간 합산).",
      legalBasis: RENTAL_97_5_PERIOD.PERIOD_CALC,
    });
  }
  /** 합산에 쓸 상속 입력 — 날짜가 어긋나면 합산하지 않는다(위 사유로 이미 부적격) */
  const mergeInh = inh && !inhInvalid ? inh : undefined;

  /**
   * ①2호 계속 임대 판정을 먼저 한다 — 3) 임대료 증액 판정의 기산일이 「합산했는지」에 달려 있다.
   * 합산 판정과 상속인 단독 판정 중 첫 구간이 긴 쪽을 쓴다(Q-2 a · `evaluateRental975Continuity` ·
   * `rental-97-5-vacancy-break.plan.md`). 상속인 단독이 이기면 합산하지 않은 것과 같다.
   * 종점을 정할 수 없으면(종료일 미입력·범위 밖 — 4)에서 부적격) 판정 없이 입력대로 합산한다.
   */
  const ownStart = input.rentalStartDate ? rental97EffectiveStart(input) : undefined;
  const periodEndCheck = ownStart ? periodEnd975(input, ownStart) : undefined;
  const continuity =
    ownStart && periodEndCheck?.end
      ? evaluateRental975Continuity({
          ownStart,
          end: periodEndCheck.end,
          vacancyPeriods: input.vacancyPeriods ?? [],
          deemedRentalPeriods: input.deemedRentalPeriods ?? [],
          inheritance: mergeInh,
        })
      : undefined;
  /** 실제로 합산한 상속 입력 */
  const usedInh = continuity && !continuity.merged ? undefined : mergeInh;
  /** 피상속인 의제 임대개시일 — 임대개시일·장기일반·공공지원 등록등일 중 늦은 날(령 §97의5③ 후단과 같은 규칙) */
  const decedentStart = usedInh
    ? new Date(Math.max(usedInh.decedentRentalStartDate.getTime(), usedInh.decedentRegistrationDate.getTime()))
    : undefined;

  /**
   * 1-1) ①1호 — 「민간매입임대주택 및 … 공공매입임대주택을 취득」 (리뷰 6번)
   * 민특법 §2 3호 민간매입임대주택 = 「임대사업자가 **매매 등**으로 소유권을 취득하여 임대하는 민간임대주택」.
   * 증여 취득(부동산납세과-486, 2017.5.17)·분양권 승계 취득 후 완공(법령해석과-2193, 2017.7.28)도 해당한다.
   * 빠지는 것은 민간건설임대주택(§2 2호 — 임대사업자가 임대 목적으로 **건설**)이다.
   * 상속 취득: 화면은 교재 서술에 따라 매입임대로 안내한다. 상속을 「매매 등」으로 본 해석례는 확보하지 못했다
   * (rental-97-5-textbook-gaps.plan.md V-3 확인 필요). 엔진은 취득원인을 보지 않으므로 상속을 막지 않는다.
   * 상속의 취득일은 상속개시일(자산 카드 취득일)이다 — 하한(부칙 §34)·상한·3개월 모두 이 날로 판정한다(V-10 사용자 확인 2026-11-13).
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

  /**
   * 2-1) 세무서 사업자등록도 취득일로부터 3개월 이내 — **사용자 정책 결정** (2026-11-12 Q-1·Q-2,
   *      `docs/01-plan/features/rental-97-5-textbook-gaps.plan.md` §3.2).
   *
   * ⚠️ 법령 문언에는 없는 요건이다. 법 §97의5①1호의 3개월은 「「민간임대주택에 관한 특별법」에 따라 …
   *    등록」뿐이고, 「소득세법」 §168 사업자등록은 조특령 §97의5③의 **임대개시 기산** 축이다(아래 4)).
   *    국세청 해석례 9건에서도 근거를 찾지 못했다. 교재(실무서) 서술을 따르기로 한 사용자 결정이므로
   *    메시지에 호(①1호)를 붙이지 않는다 — 그 호에 없는 요건이라 오귀속이 된다.
   * 취득 전 사업자등록(다른 임대주택으로 이미 등록)은 통과한다.
   */
  if (input.acquisitionDate && input.isTaxRegistered && input.taxRegistrationDate) {
    const deadline = addMonths(input.acquisitionDate, RENTAL_97_5_REGISTRATION_MONTHS);
    if (input.taxRegistrationDate.getTime() > deadline.getTime()) {
      reasons.push({
        code: "TAX_REGISTRATION_AFTER_3_MONTHS",
        message: "취득일로부터 3개월 이내에 세무서 사업자등록을 하지 않았습니다.",
        legalBasis,
      });
    }
  }

  // 3) ①3호 — 임대료 증액 제한 (§97의3①2호 준용)
  if (input.rentHistory && input.rentHistory.length >= 2) {
    // 임대개시일(령 §97의3④·§97의5③ 기산일) 이후 체결·갱신한 계약의 증액만 판정한다
    // 상속 합산이면 피상속인 분부터 — 합산된 「임대기간 중」 요건이다(V-13 Q-E).
    const rentStart = decedentStart ?? rental97EffectiveStart(input);
    // 종점 — 양도 전 임대 종료·등록 말소일 뒤 계약은 세지 않는다(서면-2017-법령해석재산-1253 · `rentCheckEnd97`)
    const rentEnd = rentCheckEnd97(input);
    const capViolations = rentViolationsFromRentalStart(
      validateRentIncrease(input.rentHistory, input.jeonseConversionRate ?? DEFAULT_JEONSE_CONVERSION_RATE).violations,
      rentStart,
      rentEnd,
    );
    if (capViolations.length > 0) {
      reasons.push({
        code: "RENT_INCREASE_VIOLATED",
        message: `임대료(환산보증금) 증액 5% 제한 위반 계약 ${capViolations.length}건 (§97의5①3호 — §97의3①2호 준용). 임대사업자 등록일·세무서 사업자등록일·실제 임대개시일 중 가장 늦은 날 이후, 임대 종료일(등록 말소일) 이전에 체결·갱신한 계약만 셉니다.`,
        legalBasis,
      });
    }
    // 리뷰 9번 — 조특령 §97의3③1호 후단: 계약·증액 후 1년 이내 재증액 금지
    // 직전(기준) 계약이 2020.2.11 이후 + 증액 계약이 임대개시일 이후 — 대통령령 제30390호 부칙 §16
    const intervalViolations = rentViolationsFromRentalStart(
      rentIntervalViolationsFromRuleDate(
        validateRentIncreaseInterval(input.rentHistory, input.jeonseConversionRate ?? DEFAULT_JEONSE_CONVERSION_RATE)
          .violations,
      ),
      rentStart,
      rentEnd,
    );
    if (intervalViolations.length > 0) {
      reasons.push({
        code: "RENT_INCREASE_WITHIN_1_YEAR",
        message:
          `마지막 증액일(증액 전이면 첫 계약일)로부터 1년 이내에 임대료(환산보증금)를 올린 계약 ${intervalViolations.length}건 ` +
          `(${intervalViolations.map((v) => `${ymd(v.lastIncreaseDate)} → ${ymd(v.contractDate)}`).join(", ")}) ` +
          `— 조특령 §97의3③1호 후단 「증액이 있은 후 1년 이내에는 하지 못하고」 (§97의5①3호 준용). ` +
          `1년은 민법 기간 계산으로 다음 해 같은 날에 만료합니다. 임대사업자 등록일·세무서 사업자등록일·실제 임대개시일 중 가장 늦은 날 이후, 임대 종료일(등록 말소일) 이전에 체결·갱신한 계약만 세며, 직전 계약이 2020.2.11 이후인 경우부터 적용합니다(대통령령 제30390호 부칙 §16).`,
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
  let rentalPeriod975: { decedent: { start: string; end: string }; heir: { start: string; end: string } } | undefined;
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
     * 그날부터 개시한다(종전에는 예/아니오만 받아 기산일에 반영하지 못했다). 기산일은 위 `ownStart`다.
     *
     * 종점 — 법 §97의5①2호 「10년 이상 계속하여 … 임대한 **후 양도**할 것」 (`periodEnd975`).
     * 양도 전에 임대를 끝냈으면(`rentalContinuesToTransfer === false`) 종점은 **임대 종료일**이다.
     * 🔴 종전에는 항상 양도일이었다 — 조기 종료 선언이 안분 비율(령 §97의5② B)만 바꾸고
     *    10년 판정은 그대로 통과시켰다. 미입력은 양도일로 대체하지 않는다(자동 fallback 금지).
     * 등록이 말소(자진·자동)됐으면 말소일도 같은 칸으로 받는다 — 령 ① 「그 등록한 기간 동안」이므로 말소 뒤
     * 계속 임대한 기간은 임대기간이 아니다(`rental-97-5-deregistration-end.plan.md` D-1).
     */
    if (periodEndCheck?.issue === "missing") {
      reasons.push({
        code: "MISSING_RENTAL_END_DATE",
        message: "양도 전에 임대를 종료했거나 등록이 말소된 경우 임대 종료일(등록 말소일 중 먼저 온 날)을 입력해야 합니다 (§97의5①2호 — 10년 계속 임대 판정의 종점 · 조특령 §97의5① 「그 등록한 기간 동안」).",
        legalBasis,
      });
    } else if (periodEndCheck?.issue === "invalid") {
      reasons.push({
        code: "INVALID_RENTAL_END_DATE",
        message: "임대 종료일은 임대개시일(등록일이 늦으면 등록일)과 양도일 사이여야 합니다 — 등록 말소일을 넣은 경우도 같습니다 (§97의5①2호).",
        legalBasis,
      });
    }

    if (continuity && periodEndCheck?.end) {
      // 상속 합산(V-13) — 피상속인 분을 앞에 붙여 한 구간으로 「계속」을 본다(Q-A·Q-D · `inheritanceMergeSpan975`).
      // 6개월 초과 공실은 계속성을 끊고 기산일부터 첫 구간만 센다(Q-1 a), 수용·정비사업 간주기간은 계속 임대로 본다.
      const span = continuity.span;
      if (usedInh && span.decedentStart) {
        rentalPeriod975 = {
          decedent: { start: ymd(span.decedentStart), end: ymd(usedInh.inheritanceDate) },
          heir: { start: ymd(span.heirStart), end: ymd(periodEndCheck.end) },
        };
      }
      eligibleRentalYears = continuity.years;
      if (eligibleRentalYears < RENTAL_97_5_MANDATORY_YEARS) {
        const counted = continuity.countedSegment;
        const restartNote =
          continuity.breaks.length > 0
            ? ` 10년을 채우기 전에 6개월을 넘는 공실(${continuity.breaks.map((b) => `${ymd(b.start)}~${ymd(b.end)}`).join(", ")})이 ` +
              `있어 계속 임대가 끊겼습니다 — 기산일부터 첫 공실 전까지(${counted ? `${ymd(counted.start)}~${ymd(counted.end)}` : "0일"})만 셉니다. ` +
              `끊긴 뒤 다시 임대한 기간은 「등록 후 … 계속하여」 임대한 기간이 아닙니다 (§97의5①2호 · 조특령 §97의5①1호 — 6개월 이내 공실만 계속 임대로 봄).`
            : "";
        const mergeNote = rentalPeriod975
          ? ` 피상속인 임대기간(${rentalPeriod975.decedent.start}~${rentalPeriod975.decedent.end})을 합산했습니다 (${RENTAL_97_5_PERIOD.PERIOD_CALC} → ${RENTAL_97_5_PERIOD.INHERITANCE_MERGE}).`
          : "";
        reasons.push({
          code: "RENTAL_PERIOD_SHORT",
          message: `계속 임대기간 ${eligibleRentalYears}년 — 10년 이상 계속 임대 요건 미달 (§97의5①2호).${restartNote}${mergeNote}`,
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
    ...(rentalPeriod975 ? { rentalPeriod975 } : {}),
    ...(section90 ? { section90 } : {}),
  };
}

/**
 * ①2호 판정 종점 — 계속 임대면 양도일, 양도 전 임대 종료(말소 포함)면 임대 종료일.
 * 종료일이 없거나 [기산일, 양도일] 밖이면 종점을 정하지 않는다 — 사유는 호출부가 붙인다(자동 fallback 금지).
 */
function periodEnd975(
  input: Rental97EvaluationInput,
  effectiveStart: Date,
): { end?: Date; issue?: "missing" | "invalid" } {
  if (input.rentalContinuesToTransfer !== false) return { end: input.transferDate };
  if (!input.rentalEndDate) return { issue: "missing" };
  if (
    input.rentalEndDate.getTime() > input.transferDate.getTime() ||
    input.rentalEndDate.getTime() < effectiveStart.getTime()
  ) {
    return { issue: "invalid" };
  }
  return { end: input.rentalEndDate };
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
