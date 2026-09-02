/**
 * 장기임대 §97 시리즈 — 공유 순수 헬퍼
 *
 * 레거시 `rental-housing-reduction.ts`에 복제돼 있던 순수 함수 3종의 **단일 소스**다(D1-08).
 * 레거시는 이 파일을 import한다 — 같은 조문의 임대기간을 두 곳에서 판정하지 않는다.
 *
 * 법령 근거:
 * - 공실 유예: **조문마다 다르다** — 아래 RENTAL_VACANCY_GRACE_MONTHS_* 주석 참조
 * - 임대료 5% 증액 제한·전월세 전환: 조특령 §97의3③1호 (민특법 §44④ 기준 준용)
 */

import { addDays, addMonths, differenceInDays, differenceInYears } from "date-fns";
import type {
  Rental97IneligibleReason,
  Rental97RentHistoryItem,
  Rental97VacancyPeriod,
} from "./types";

/**
 * 공실 유예 3월 — §97·§97의2·§97의3·§97의4 (D1-03·D2-08).
 *
 * 조특령 §97⑤5호가 「재정경제부령이 정하는 기간은 이를 주택임대기간에 산입할 것」으로 위임하고,
 * 그 종점인 **조특칙 §44**가 「기존 임차인의 퇴거일부터 다음 임차인의 **입주일**까지의 기간으로서
 * **3월이내**의 기간」이라 정한다.
 *
 * 이 5호는 다음 경로로 네 조문에 걸린다:
 * - §97의2 ← 조특령 §97의2② 「제97조제2항 내지 제6항 준용」(⑤ 전체)
 * - §97의3 ← 조특령 §97의3④ 「제97조제5항제1호ㆍ제3호 및 **제5호** 준용」
 * - §97의4 ← 조특령 §97의4② 「제97조제5항제1호ㆍ제3호 및 **제5호** 준용」
 */
export const RENTAL_VACANCY_GRACE_MONTHS_97 = 3;

/**
 * 공실 유예 6개월 — **§97의5 전용** (조특령 §97의5①1호).
 *
 * 「기존 임차인의 퇴거일부터 다음 임차인의 **주민등록을 이전하는 날**까지의 기간으로서
 * **6개월 이내**의 기간」 — 기산 종점도 3월 규칙(「입주일」)과 다르다.
 *
 * ⚠️ §97의5③은 조특령 §97⑤ 중 **1호·3호만** 준용하고 **5호를 준용하지 않는다** —
 *    그래서 조특칙 §44의 3월이 §97의5에는 걸리지 않고, 이 6개월이 §97의5 고유 규칙이다.
 *    반대로 이 6개월을 다른 조문에 전용하면 임대기간이 과대 산정돼 감면이 과다 적용된다.
 */
export const RENTAL_VACANCY_GRACE_MONTHS_97_5 = 6;

/** 전월세 전환율 기본값 (DB 미설정 시) */
export const DEFAULT_JEONSE_CONVERSION_RATE = 0.04;

export interface RentalRentViolation {
  contractIndex: number;
  contractDate: Date;
  increaseRate: number;
  maxAllowed: number;
}

/**
 * 유효 임대기간(년) 계산.
 *
 * - 유예 **이내**의 공실은 계속 임대한 것으로 보아 차감하지 않는다.
 * - 유예를 **초과**하면 그 구간 **전체**를 차감한다 — 조문이 산입 대상을 「…까지의 기간으로서
 *   3월(6개월)이내의 기간」으로 정의하므로, 유예를 넘긴 공실은 구간째로 산입 대상이 아니다.
 *   (초과분만 차감하는 것이 아니다.)
 * - 경계는 **「이내」라서 포함**이다 — 정확히 3월/6개월이면 차감하지 않는다.
 * - 유예는 **달력 월**로 잰다(`addMonths`). 「3월」을 90일로 환산하면 월 길이에 따라
 *   최대 이틀이 어긋나 납세자에게 불리해질 수 있다.
 *
 * @param graceMonths 조문별 유예 개월 — `RENTAL_VACANCY_GRACE_MONTHS_97`(3) 또는
 *                    `RENTAL_VACANCY_GRACE_MONTHS_97_5`(6). 기본값을 두지 않는다:
 *                    호출부가 조문을 명시하지 않으면 컴파일이 실패해야 한다.
 * @param noGracePeriods **유예 없이** 전부 차감할 구간 — 조특령 §97⑤4호의 「5호 미만의 주택을
 *                    임대한 기간」이 여기 해당한다. 그 기간은 애초에 주택임대기간이 아니므로
 *                    공실 유예를 적용할 여지가 없다(2개월이어도 차감된다).
 */
export function calculateEffectiveRentalPeriod(
  rentalStartDate: Date,
  transferDate: Date,
  vacancyPeriods: Rental97VacancyPeriod[],
  graceMonths: number,
  noGracePeriods: Rental97VacancyPeriod[] = [],
): number {
  const totalDays = differenceInDays(transferDate, rentalStartDate);
  if (totalDays <= 0) return 0;

  let deductDays = 0;
  for (const vp of vacancyPeriods) {
    const graceEnd = addMonths(vp.startDate, graceMonths);
    if (vp.endDate.getTime() > graceEnd.getTime()) {
      deductDays += differenceInDays(vp.endDate, vp.startDate);
    }
  }
  for (const np of noGracePeriods) {
    deductDays += Math.max(0, differenceInDays(np.endDate, np.startDate));
  }

  const effectiveDays = Math.max(0, totalDays - deductDays);
  const effectiveEndDate = addDays(rentalStartDate, effectiveDays);
  return differenceInYears(effectiveEndDate, rentalStartDate);
}

/**
 * 환산보증금 = 보증금 + (월세 × 12 / 전월세전환율). 원 미만 절사.
 */
export function convertToStandardDeposit(
  rent: Rental97RentHistoryItem,
  conversionRate: number,
): number {
  if (rent.contractType === "jeonse") {
    return rent.deposit;
  }
  return rent.deposit + Math.floor((rent.monthlyRent * 12) / conversionRate);
}

/**
 * 직전 계약 대비 임대료 증액률 검증 — 환산보증금 5% 이내 (조특령 §97의3③1호).
 * 위반 1건이라도 있으면 감면 전액 배제.
 */
export function validateRentIncrease(
  history: Rental97RentHistoryItem[],
  conversionRate: number,
  limit: number = 0.05,
): { isAllValid: boolean; violations: RentalRentViolation[] } {
  if (history.length < 2) return { isAllValid: true, violations: [] };

  const violations: RentalRentViolation[] = [];

  for (let i = 1; i < history.length; i++) {
    const prev = convertToStandardDeposit(history[i - 1], conversionRate);
    const curr = convertToStandardDeposit(history[i], conversionRate);

    if (prev === 0) continue; // 직전 환산보증금 0 — 비교 불가

    const increaseRate = (curr - prev) / prev;
    if (increaseRate > limit + 1e-9) {
      violations.push({
        contractIndex: i,
        contractDate: history[i].contractDate,
        increaseRate,
        maxAllowed: limit,
      });
    }
  }

  return { isAllValid: violations.length === 0, violations };
}

/**
 * 임대기간 분 양도차익(양도소득) 안분 비율 — **조문마다 분자가 다르다** (D2-03 · D2-06).
 *
 * ## 조특령 §97의3⑤ (LTHD 70% 특례)
 *   A × (B − C) ÷ (D − E)
 *   A: 「소득세법」 §92②1호 양도차익
 *   B: 제2항에 따른 **실제 임대기간의 마지막 날**의 기준시가
 *   C: 제2항에 따른 실제 임대기간의 **개시일**의 기준시가
 *   D: **양도일**의 기준시가   E: **취득일**의 기준시가
 *
 * ## 조특령 §97의5② (100% 세액감면)
 *   「소득세법」 §95① 양도소득금액
 *     × (제1항에 따른 **임대기간의 마지막 날**의 기준시가 − **취득당시** 기준시가)
 *     ÷ (**양도 당시** 기준시가 − **취득 당시** 기준시가)
 *
 * ⇒ 분모는 같고 **분자의 감수(subtrahend)가 다르다** — §97의3은 임대개시일(C),
 *   §97의5는 취득당시(E). 종전에는 한 함수가 두 조문을 겸했고, 그 산식이
 *   §97의3의 것도 §97의5의 것도 아닌 (D − C) / (D − E)였다:
 *   피감수를 **양도일 기준시가 D**로, §97의5의 감수를 **임대개시일 C**로 치환한 형태다.
 *
 * ## 피감수 B — 「임대기간의 마지막 날」이지 양도일이 아니다
 * 두 조문 모두 B를 D와 **별개 변수로 정의**한다. 임대를 종료하고 얼마 뒤에 양도하면
 * 두 값이 갈린다(§97의5①2호는 「10년 이상 계속하여 임대한 **후 양도**」다).
 * 임대가 양도일까지 계속된 경우에만 B = D이므로, 그 경우에는 `stdPriceAtRentalEnd`를
 * 주지 않아도 되고 기존 사안은 회귀하지 않는다.
 *
 * ## 반환
 * - `null` — 필요한 기준시가가 없거나 분모 ≤ 0. 호출측이 불적용 사유를 붙인다(자동 안분 금지).
 * - 그 외 0~1 클램프.
 */
export function calcRentalGainRatio(args: {
  rentalStartDate: Date;
  acquisitionDate: Date;
  /**
   * 분자의 감수 — 조문을 명시한다. 기본값을 두지 않는다:
   * 호출부가 조문을 밝히지 않으면 컴파일이 실패해야 한다.
   * - `"rental_start"` → 조특령 §97의3⑤ (C = 임대개시일 기준시가)
   * - `"acquisition"`  → 조특령 §97의5② (E = 취득당시 기준시가)
   */
  numeratorBase: "rental_start" | "acquisition";
  stdPriceAtAcquisition?: number;
  stdPriceAtRentalStart?: number;
  stdPriceAtTransfer?: number;
  /**
   * B — 실제 임대기간의 마지막 날 기준시가.
   * 임대가 양도일까지 계속된 경우(`rentalContinuesToTransfer`)에는 D를 쓴다.
   */
  stdPriceAtRentalEnd?: number;
  /** 임대가 양도일까지 계속되었는가. false면 `stdPriceAtRentalEnd`가 필수다. */
  rentalContinuesToTransfer: boolean;
}): number | null {
  const {
    stdPriceAtAcquisition: acq,
    stdPriceAtRentalStart: start,
    stdPriceAtTransfer: transfer,
  } = args;

  /**
   * 취득 즉시 임대 + 양도일까지 계속 임대 → 비율은 항상 1이다.
   * 그때 B = D이고 (§97의3의) C = E이므로 (D − E) / (D − E) = 1 —
   * **기준시가 값 자체가 결과를 좌우하지 않으므로** 3점을 요구하지 않는다.
   *
   * ⚠️ 「계속 임대」 조건이 빠지면 안 된다(D2-06 정정 3). 취득 즉시 임대라도 임대를
   *    일찍 끝내고 나중에 양도하면 B < D라 법문상 안분이 필요하다 —
   *    종전 코드는 기준시가를 보지도 않고 전액 임대분으로 처리했다.
   */
  if (
    args.rentalContinuesToTransfer &&
    args.rentalStartDate.getTime() <= args.acquisitionDate.getTime()
  ) {
    return 1;
  }

  if (acq === undefined || transfer === undefined || acq <= 0 || transfer <= 0) return null;

  // B — 임대 종료 시점 기준시가. 양도일까지 계속 임대했으면 D와 같다.
  const rentalEnd = args.rentalContinuesToTransfer ? transfer : args.stdPriceAtRentalEnd;
  if (rentalEnd === undefined || rentalEnd <= 0) return null;

  // 분자의 감수
  let subtrahend: number;
  if (args.numeratorBase === "acquisition") {
    subtrahend = acq;
  } else {
    // §97의3⑤ C — 임대개시일 기준시가.
    // 취득 즉시 임대(임대개시 ≤ 취득일)면 C가 곧 E이므로 취득시 기준시가를 쓴다.
    if (args.rentalStartDate.getTime() <= args.acquisitionDate.getTime()) {
      subtrahend = acq;
    } else {
      if (start === undefined || start <= 0) return null;
      subtrahend = start;
    }
  }

  const denominator = transfer - acq;
  if (denominator <= 0) return null;
  const ratio = (rentalEnd - subtrahend) / denominator;
  return Math.min(1, Math.max(0, ratio));
}

/** 조특령 §97의3③4호 — 임대개시일 당시 기준시가 한도 */
export const OFFICIAL_PRICE_LIMIT_CAPITAL = 600_000_000;
export const OFFICIAL_PRICE_LIMIT_NON_CAPITAL = 300_000_000;
/** 4호 신설 시행일 (대통령령 제29241호 부칙 §2① — 「이 영 시행 이후 양도하는 분」) */
const CLAUSE4_EFFECTIVE_FROM = new Date("2018-10-23");
/** 4호 부칙 §2②1호 — 이 날 **이전**에 주택을 취득했으면 종전 규정 */
const CLAUSE4_GRANDFATHER_ACQUISITION = new Date("2018-09-13");

/**
 * 조특령 §97의3③**4호**(기준시가 한도)를 적용할 사안인가 — 대통령령 제29241호 부칙 §2.
 *
 * 취득일이 없으면 부칙②1호를 성립시킬 수 없어 원칙(①)대로 적용한다. 실제 계산 경로에서는
 * 자산-수준 `acquisitionDate`가 항상 주입되므로 이 분기는 단위 호출에서만 도달한다.
 */
export function isClause4Applicable(args: {
  transferDate: Date;
  acquisitionDate?: Date;
}): boolean {
  if (args.transferDate.getTime() < CLAUSE4_EFFECTIVE_FROM.getTime()) return false; // 부칙 §2①
  if (
    args.acquisitionDate !== undefined &&
    args.acquisitionDate.getTime() <= CLAUSE4_GRANDFATHER_ACQUISITION.getTime()
  ) {
    return false; // 부칙 §2②1호
  }
  return true;
}

/**
 * 조특령 §97의3③ **2호·4호** 요건 검사 — §97의3과 §97의5가 **공유**한다 (CA-01).
 *
 * 조특법 §97의5①3호 — 「임대기간 중 **제97조의3제1항제2호의 요건**을 준수할 것」
 * 그 §97의3①2호가 위임한 「대통령령으로 정하는 임대보증금 또는 임대료 증액 제한 요건 등」이
 * 곧 조특령 §97의3③ **1~4호 전부**다:
 *   1. 임대료등 증가율 5% 이내 (각 evaluator가 `validateRentIncrease`로 처리)
 *   2. **「주택법」 §2 6호에 따른 국민주택규모 이하의 주택일 것**
 *   3. 임대개시일부터 10년 이상 임대할 것 (§97의5①2호가 자체 검사)
 *   4. **기준시가 합계액이 임대개시일 당시 6억원(수도권 밖의 지역인 경우에는 3억원)을
 *      초과하지 아니할 것**
 *
 * 🔴 §97의5는 1호만 검증했다 — 2호는 입력 필드조차 없었고, 4호는 UI·validate·Zod·router가
 *    값을 끝까지 날랐는데 **엔진이 한도 비교를 하지 않는 dead pass-through**였다.
 *    (`rental-97-5.ts`의 「전용면적 요건: 본조·시행령 모두 없음」 주석은 §97의5①3호의
 *     준용 사슬을 끝까지 읽지 않은 결론이다.)
 *
 * ✅ **4호의 시기 적용례를 확인했다 (2026-09-02).** 종전에는 「신설 시점·부칙을 확인하지
 *    못했다 … 별건으로 확인할 것」으로 남긴 채 **무조건 적용**하고 있었다. 실측 결과:
 *
 *    · **연혁** — 6억(수도권 밖 3억) 한도는 **대통령령 제29241호**(2018.10.23 공포·시행)에서
 *      신설됐다. 직전 시행본(2014.2.21 계열)에는 그 문언이 없다(법제처 `target=eflaw` 전수 대조).
 *    · **부칙 §2** —
 *      ① 「제97조의3제3항제4호의 개정규정은 **이 영 시행 이후 양도하는 분**부터 적용한다.」
 *      ② 「다음 각 호의 어느 하나에 해당하는 경우에는 … **종전의 규정에 따른다**.
 *         1. **2018년 9월 13일 이전에 주택**(주택을 취득할 수 있는 권리를 포함한다)**을 취득한 경우**
 *         2. 2018년 9월 13일 이전에 주택을 취득하기 위하여 **매매계약을 체결하고 계약금을 지급**한
 *            사실이 증빙서류에 의하여 확인되는 경우」
 *
 *    ⇒ 무조건 적용은 **납세자 불리 소급**이었다. 실측: 기준시가 7억·임대 10년 사안에서
 *      `OFFICIAL_PRICE_EXCEEDED`가 **단독 배제 사유**로 걸려 §97의3의 70% 공제율 대체를
 *      통째로 잃었다(양도 2018-10-01 · 취득 2010-01-01 등 부칙 예외 구간 전부).
 *      [[feedback_no_unfavorable_application_without_legal_basis]]
 *
 * ⚠️ **부칙②2호(계약금 지급 증빙)는 판정하지 않는다** — 그 사실을 담는 입력 필드가 없다.
 *    `contractDate`는 §99·§99의3·§98 시리즈의 **시한 판정용 분양/매매계약일**이라 의미가 다르므로
 *    전용하지 않는다([[feedback_ui_mode_flag_not_domain_semantics]]). 대신 그 구간
 *    (취득일 > 2018-09-13 · 양도일 ≥ 2018-10-23)에서는 배제 메시지에 2호 안내를 덧붙여
 *    **침묵하지 않는다**.
 */
export function checkRental973Clause24(
  input: {
    isNationalHousingScale?: boolean;
    officialPriceAtStart?: number;
    region?: "capital" | "non_capital";
    /** 부칙 §2 게이트 축 — 4호 적용 여부만 가른다(2호는 부칙 대상이 아니다). */
    transferDate: Date;
    acquisitionDate?: Date;
  },
  legalBasisPrefix: string,
): Rental97IneligibleReason[] {
  const reasons: Rental97IneligibleReason[] = [];

  // 2호 — 국민주택규모
  if (input.isNationalHousingScale !== true) {
    reasons.push({
      code: "NOT_NATIONAL_HOUSING_SCALE",
      message:
        "국민주택규모(전용 85㎡, 수도권 외 읍·면 100㎡) 이하 요건이 확인되지 않았습니다 " +
        `(${legalBasisPrefix}조특령 §97의3③2호).`,
      legalBasis: "조특령 §97의3③2호",
    });
  }

  // 4호 — 임대개시일 당시 기준시가 6억(수도권 밖 3억) 한도.
  // 부칙 §2로 적용 대상이 아니면 **검증 자체를 하지 않는다** — 값 미입력도 문제 삼지 않는다
  // (종전 규정에는 그 요건이 없었으므로 입력을 요구할 근거도 없다).
  if (!isClause4Applicable(input)) return reasons;

  /**
   * 부칙②**2호**(2018-09-13 이전 매매계약 + 계약금 지급) 해당 가능 구간 — 판정 불가라 고지한다.
   * 취득일이 2018-09-13을 넘는데 양도가 시행일 이후인 사안만 해당한다.
   */
  const mayQualifyByContract =
    input.acquisitionDate !== undefined &&
    input.acquisitionDate.getTime() > CLAUSE4_GRANDFATHER_ACQUISITION.getTime();
  const contractNote = mayQualifyByContract
    ? " 다만 2018.9.13. 이전에 매매계약을 체결하고 계약금을 지급한 사실이 증빙서류로 확인되면 " +
      "종전 규정에 따라 이 한도가 적용되지 않습니다 (대통령령 제29241호 부칙 §2②2호 — 본 계산기는 이 사실을 판정하지 않습니다)."
    : "";

  if (input.officialPriceAtStart === undefined || input.officialPriceAtStart <= 0) {
    reasons.push({
      code: "MISSING_OFFICIAL_PRICE",
      message:
        "임대개시일 당시 주택과 부수토지의 기준시가 합계가 입력되지 않았습니다 " +
        `(${legalBasisPrefix}조특령 §97의3③4호 한도 검증).`,
      legalBasis: "조특령 §97의3③4호",
    });
  } else {
    const limit =
      input.region === "non_capital" ? OFFICIAL_PRICE_LIMIT_NON_CAPITAL : OFFICIAL_PRICE_LIMIT_CAPITAL;
    if (input.officialPriceAtStart > limit) {
      reasons.push({
        code: "OFFICIAL_PRICE_EXCEEDED",
        message:
          `임대개시일 당시 기준시가 합계가 한도(${limit === OFFICIAL_PRICE_LIMIT_CAPITAL ? "6억" : "3억"}원)를 ` +
          `초과합니다 (${legalBasisPrefix}조특령 §97의3③4호).${contractNote}`,
        legalBasis: "조특령 §97의3③4호",
      });
    }
  }

  return reasons;
}
