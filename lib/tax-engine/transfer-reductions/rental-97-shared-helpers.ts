/**
 * 장기임대 §97 시리즈 — 공유 순수 헬퍼
 *
 * 레거시 `rental-housing-reduction.ts`(삭제 — §155⑳ 리뷰 V-6 후속)에 복제돼 있던 순수 함수 3종의 **단일 소스**다(D1-08).
 *
 * 법령 근거:
 * - 공실 유예: **조문마다 다르다** — 아래 RENTAL_VACANCY_GRACE_MONTHS_* 주석 참조
 * - 임대료 5% 증액 제한·전월세 전환: 조특령 §97의3③1호 (민특법 §44④ 기준 준용)
 */

import { addDays, addMonths, addYears, differenceInDays, differenceInYears } from "../utc-date";
import { applyRate, safeMultiplyThenDivide } from "../tax-utils";
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
 *
 * ⚠️ §97의5 평가기(`rental-97-5.ts`)는 이 상수로 `calculateEffectiveRentalPeriod`(초과 공실 차감·통산)를 쓰지 않는다 —
 *    「계속하여」라 초과 공실이 계속성을 끊는다(`rental-97-5-period.ts`). 이 상수를 쓰던 레거시 엔진은 삭제됐다(헬퍼 사례 테스트만 쓴다).
 */
export const RENTAL_VACANCY_GRACE_MONTHS_97_5 = 6;

/** 전월세 전환율 기본값 (DB 미설정 시) */
export const DEFAULT_JEONSE_CONVERSION_RATE = 0.04;

export interface RentalRentViolation {
  /** 계약일 오름차순으로 정렬한 이력 기준 인덱스 — 입력 배열 인덱스가 아니다 (`sortRentHistory`) */
  contractIndex: number;
  contractDate: Date;
  /** 비교 기준이 된 직전 계약일 */
  previousContractDate: Date;
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
 * - 공실·무유예 구간은 **[rentalStartDate, transferDate]로 잘라서** 본다. 기간 밖 공실(등록 전·임대 종료 후)은
 *   임대기간을 줄일 수 없다 — 종전에는 통째로 차감해 등록 전 공실 1년 반이 10년을 8년으로 만들었다
 *   (리뷰 게이트 2026-11-01). 유예 판정도 잘린 구간으로 한다(§97의5 `evaluateContinuousRental975`와 같은 기준 — 가정).
 *   `transferDate`는 판정 종점이다 — §97의3은 조기 종료 시 임대 종료일을 넘긴다.
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
  const effectiveDays = calculateEffectiveRentalDays(
    rentalStartDate,
    transferDate,
    vacancyPeriods,
    graceMonths,
    noGracePeriods,
  );
  const effectiveEndDate = addDays(rentalStartDate, effectiveDays);
  return differenceInYears(effectiveEndDate, rentalStartDate);
}

/**
 * 유효 임대일수 — `calculateEffectiveRentalPeriod`의 일수 단계(공실 규칙 동일, 구간 [rentalStartDate, transferDate]).
 * 구간이 둘인 임대기간(조특령 §97⑤3호 — 피상속인 분 + 상속인 분)을 일수로 더한 뒤 연수로 바꿀 때 쓴다.
 */
export function calculateEffectiveRentalDays(
  rentalStartDate: Date,
  transferDate: Date,
  vacancyPeriods: Rental97VacancyPeriod[],
  graceMonths: number,
  noGracePeriods: Rental97VacancyPeriod[] = [],
): number {
  const totalDays = differenceInDays(transferDate, rentalStartDate);
  if (totalDays <= 0) return 0;

  const clip = (p: Rental97VacancyPeriod): Rental97VacancyPeriod | null => {
    const startDate = new Date(Math.max(p.startDate.getTime(), rentalStartDate.getTime()));
    const endDate = new Date(Math.min(p.endDate.getTime(), transferDate.getTime()));
    return endDate.getTime() > startDate.getTime() ? { startDate, endDate } : null;
  };

  let deductDays = 0;
  for (const raw of vacancyPeriods) {
    const vp = clip(raw);
    if (!vp) continue;
    const graceEnd = addMonths(vp.startDate, graceMonths);
    if (vp.endDate.getTime() > graceEnd.getTime()) {
      deductDays += differenceInDays(vp.endDate, vp.startDate);
    }
  }
  for (const raw of noGracePeriods) {
    const np = clip(raw);
    if (!np) continue;
    deductDays += differenceInDays(np.endDate, np.startDate);
  }

  return Math.max(0, totalDays - deductDays);
}

/** 조특령 §97⑤3호 합산 입력 — `Rental97EvaluationInput.inheritance974`·`975`·`973`과 같은 모양 */
export interface Rental97InheritanceDates {
  inheritanceDate: Date;
  decedentRegistrationDate: Date;
  decedentRentalStartDate: Date;
}

/**
 * 피상속인 날짜 순서 무효 — 피상속인 임대개시일·등록등일 ≥ 상속개시일 또는 상속개시일 > 양도일.
 * 어긋나면 피상속인 분이 음수가 되거나 양도일까지 늘어난다. §97의4(`rental-97-4.ts` 1-0)·§97의5(`rental-97-5.ts` 1-0)와
 * 같은 조건이다 — 그 둘은 인라인 그대로 두었다(V-14 Q-5: 이번에는 §97의3만 이 헬퍼를 쓴다).
 */
export function inheritanceDatesInvalid97(inh: Rental97InheritanceDates, transferDate: Date): boolean {
  return (
    inh.decedentRentalStartDate.getTime() >= inh.inheritanceDate.getTime() ||
    inh.decedentRegistrationDate.getTime() >= inh.inheritanceDate.getTime() ||
    inh.inheritanceDate.getTime() > transferDate.getTime()
  );
}

/**
 * 「통산」 임대기간에 피상속인 분을 합산한다 — 조특령 §97⑤3호(§97의3④·§97의4② 준용).
 * - 상속인 분 = [max(상속인 의제 개시일, 상속개시일), 종점]
 * - 피상속인 분 = [max(피상속인 임대개시일, 피상속인 등록등일), min(상속개시일, 종점)]
 * - 두 구간의 유효 일수(공실 규칙 동일)를 더해 피상속인 개시일 기준 만 연수로 바꾼다. 그 사이 간격은 세지 않는다.
 * `rental-97-4.ts`의 §97의4 인라인 합산과 같은 식이다(V-14 Q-0 A). 날짜 순서 검증은 호출부 몫이다.
 */
export function mergedRentalYears97(
  ownStart: Date,
  end: Date,
  inh: Rental97InheritanceDates,
  vacancyPeriods: Rental97VacancyPeriod[],
  graceMonths: number,
): { years: number; heirStart: Date; decedentStart: Date; decedentEnd: Date } {
  const heirStart = new Date(Math.max(ownStart.getTime(), inh.inheritanceDate.getTime()));
  const decedentStart = new Date(Math.max(inh.decedentRentalStartDate.getTime(), inh.decedentRegistrationDate.getTime()));
  const decedentEnd = new Date(Math.min(inh.inheritanceDate.getTime(), end.getTime()));
  const days =
    calculateEffectiveRentalDays(heirStart, end, vacancyPeriods, graceMonths) +
    calculateEffectiveRentalDays(decedentStart, decedentEnd, vacancyPeriods, graceMonths);
  return { years: differenceInYears(addDays(decedentStart, days), decedentStart), heirStart, decedentStart, decedentEnd };
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
 * 계약 이력을 계약일 오름차순으로 정렬한 사본 (같은 날은 입력 순서 유지).
 * 두 증액 검증은 「직전 계약」을 배열 앞 칸으로 읽는다 — 최신순으로 입력하면 증액이 감액으로 보여
 * 5% 위반이 숨고, 날짜가 역순인 쌍은 1년 위반으로 잘못 잡혔다(리뷰 게이트 2026-11-01).
 * UI·validate·Zod 어디서도 순서를 강제하지 않으므로 엔진 판정 직전에 정렬한다.
 */
export function sortRentHistory(history: Rental97RentHistoryItem[]): Rental97RentHistoryItem[] {
  return history
    .map((h, i) => ({ h, i }))
    .sort((a, b) => a.h.contractDate.getTime() - b.h.contractDate.getTime() || a.i - b.i)
    .map((x) => x.h);
}

/**
 * 직전 계약 대비 임대료 증액률 검증 — 환산보증금 5% 이내 (조특령 §97의3③1호).
 * 이력은 계약일 순으로 정렬해 비교한다 (`sortRentHistory`).
 * 위반 1건이라도 있으면 감면 전액 배제.
 */
export function validateRentIncrease(
  rawHistory: Rental97RentHistoryItem[],
  conversionRate: number,
  limit: number = 0.05,
): { isAllValid: boolean; violations: RentalRentViolation[] } {
  if (rawHistory.length < 2) return { isAllValid: true, violations: [] };
  const history = sortRentHistory(rawHistory);

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
        previousContractDate: history[i - 1].contractDate,
        increaseRate,
        maxAllowed: limit,
      });
    }
  }

  return { isAllValid: violations.length === 0, violations };
}

/**
 * §97의3·§97의5 임대개시 기산일 — 조특령 §97의3④·§97의5③
 * 「「소득세법」 제168조에 따른 사업자등록과 … 임대사업자등록을 하고 장기일반민간임대주택등으로
 *  등록하여 임대하는 날부터 임대를 개시한 것으로 본다」
 * ⇒ 임대일·임대사업자등록일·세무서 사업자등록일 중 **가장 늦은 날**. 임대일 미입력이면 undefined.
 */
export function rental97EffectiveStart(input: {
  rentalStartDate?: Date;
  registrationDate?: Date;
  taxRegistrationDate?: Date;
}): Date | undefined {
  if (!input.rentalStartDate) return undefined;
  return new Date(
    Math.max(
      input.rentalStartDate.getTime(),
      input.registrationDate?.getTime() ?? 0,
      input.taxRegistrationDate?.getTime() ?? 0,
    ),
  );
}

/**
 * §97의3·§97의5 임대료 증액 제한(령 §97의3③1호)은 **임대개시일부터** 지킬 요건이다
 * (법 §97의3①2호 「임대기간 중」 · §97의5①3호 「임대기간 중 … 준수할 것」 — 사용자 확인 2026-11-01).
 * ⇒ 증액한 계약의 체결·갱신일이 기산일 이후인 위반만 센다. 비교 기준(직전 계약)은 기산일 전 계약이어도 된다
 *   — 등록 당시 존속하던 계약의 임대료가 첫 기준이다.
 * 기산일을 모르면(임대일 미입력) 걸러내지 않는다 — 그 경우는 MISSING_RENTAL_START가 따로 막는다.
 *
 * 종점(`end`) — 양도 전에 임대를 끝냈거나 등록이 말소됐으면 그 날(`rentCheckEnd97`). 그 **뒤**에 체결·갱신한 계약은
 * 「임대기간 중」(령 §97의5① 「그 등록한 기간 동안」 · 령 §97의3② 「그 등록 기간 동안」)이 아니므로 세지 않는다.
 * 종점 **당일** 계약은 센다. 근거: 서면-2017-법령해석재산-1253(2019.4.19.) — §97의5 요건을 갖추어 10년 이상 임대한 후
 * 양도 시 해당 요건을 갖추지 못한 경우에도 감면대상. §97의3은 같은 「등록 기간」 문언으로 같이 적용한다(정면 해석례 없음 —
 * `docs/01-plan/features/rental-97-5-deregistration-end.plan.md` Q-3·V-2).
 */
export function rentViolationsFromRentalStart<T extends { contractDate: Date }>(
  violations: T[],
  start: Date | undefined,
  end?: Date,
): T[] {
  return violations.filter(
    (v) =>
      (!start || v.contractDate.getTime() >= start.getTime()) && (!end || v.contractDate.getTime() <= end.getTime()),
  );
}

/**
 * 임대료 요건의 종점 — 「양도 전에 임대 종료 또는 등록 말소」를 골랐을 때의 그 날. 아니면 없음(양도일까지 본다).
 * 종료일이 범위 밖이면 `INVALID_RENTAL_END_DATE`가 따로 막으므로 여기서 다시 검사하지 않는다.
 */
export function rentCheckEnd97(input: { rentalContinuesToTransfer?: boolean; rentalEndDate?: Date }): Date | undefined {
  return input.rentalContinuesToTransfer === false ? input.rentalEndDate : undefined;
}

/**
 * 1년 이내 재증액 금지의 시행일 — 세 조문 모두 2020.2.11 개정으로 생겼다 (KoreanLaw MCP 실독 2026-11-01).
 *   · 조특령 §97의3③1호 후단 「…증액이 있은 후 1년 이내에는 하지 못하고」 — 대통령령 제30390호.
 *     2020.1.1 시행본 ③1호는 「연 증가율이 100분의 5를 초과하지 아니할 것」뿐이었다.
 *     부칙 §16 「제97조의3제3항의 개정규정은 이 영 시행 이후 주택 임대차계약을 갱신하거나 새로 체결하는 분부터 적용」.
 *     §97의5①3호는 §97의3①2호 → 령 §97의3③을 준용하므로 같은 날이다.
 *   · 소령 §167의3①2호 가·다목 괄호(§97의4) — 대통령령 제30395호, 부칙 §16 같은 문언.
 * ⇒ **직전(기준) 계약**이 이 날 이후 체결·갱신된 경우에만 그 다음 증액의 1년 간격을 따진다(사용자 확인 2026-11-01).
 */
export const RENT_INTERVAL_RULE_FROM = new Date("2020-02-11");

/** 1년 재증액 위반 중 직전 계약이 2020.2.11 이후인 것만 (`RENT_INTERVAL_RULE_FROM` 주석) */
export function rentIntervalViolationsFromRuleDate<T extends { previousContractDate: Date }>(violations: T[]): T[] {
  return violations.filter((v) => v.previousContractDate.getTime() >= RENT_INTERVAL_RULE_FROM.getTime());
}

export interface RentIntervalViolation {
  /** 계약일 오름차순으로 정렬한 이력 기준 인덱스 */
  contractIndex: number;
  /** 1년 이내에 증액한 계약일 */
  contractDate: Date;
  /** 바로 앞 계약일 — 시행일 게이트(대통령령 제30390호·제30395호 부칙 §16)의 기준 */
  previousContractDate: Date;
  /** 1년 기산점 — 마지막 증액일(증액이 없었으면 첫 계약일) */
  lastIncreaseDate: Date;
}

/**
 * 임대료 증액 **간격** 검증 — 조특령 §97의3③1호 후단
 * 「이 경우 임대료등 증액 청구는 임대차계약 또는 약정한 임대료등의 증액이 있은 후 **1년 이내에는 하지 못하고**…」
 *
 * **마지막 증액일**로부터 1년 이내에 환산보증금이 오른 계약을 위반으로 본다(사용자 확인 2026-11-01).
 * - 기산점: 직전 증액이 있으면 그 증액 계약일, 아직 증액이 없으면 이력의 첫 계약일(임대차계약 체결).
 *   **동결·감액 갱신은 기산점을 새로 열지 않는다** — 종전에는 「직전 계약일」부터 세서, 동결 갱신 직후의
 *   증액을 1년 이내로 잡았다(마지막 증액으로부터는 1년이 지났는데도).
 * - 기간 계산: 민법 §157(초일 불산입)·§160 — 기산일 D의 1년은 **다음 해 같은 날**에 만료한다
 *   ⇒ 그날까지의 증액은 「1년 이내」다(가정: 계약 이력의 `contractDate`를 증액 시점으로 본다 — 청구일 입력은 없다).
 * - 감액·동결 계약은 증액이 아니므로 위반 판정 대상도 아니다.
 * - `previousContractDate`(바로 앞 계약)는 시행일 게이트(`rentIntervalViolationsFromRuleDate`)가 쓰고,
 *   `lastIncreaseDate`(기산점)는 1년 판정과 메시지가 쓴다.
 *
 * §97의3·§97의5(①3호 준용)·§97의4(소령 §167의3①2호 가·다목 괄호)가 호출한다.
 * 이력은 계약일 순으로 정렬해 비교한다 (`sortRentHistory`).
 */
export function validateRentIncreaseInterval(
  rawHistory: Rental97RentHistoryItem[],
  conversionRate: number,
): { isAllValid: boolean; violations: RentIntervalViolation[] } {
  const history = sortRentHistory(rawHistory);
  const violations: RentIntervalViolation[] = [];
  if (history.length === 0) return { isAllValid: true, violations };
  /** 1년 기산점 — 첫 계약일에서 시작해 증액이 있을 때만 그 계약일로 옮긴다 */
  let lastIncreaseDate = history[0].contractDate;
  for (let i = 1; i < history.length; i++) {
    const prev = convertToStandardDeposit(history[i - 1], conversionRate);
    const curr = convertToStandardDeposit(history[i], conversionRate);
    if (curr <= prev) continue; // 동결·감액 — 기산점 유지
    if (history[i].contractDate.getTime() <= addYears(lastIncreaseDate, 1).getTime()) {
      violations.push({
        contractIndex: i,
        contractDate: history[i].contractDate,
        previousContractDate: history[i - 1].contractDate,
        lastIncreaseDate,
      });
    }
    lastIncreaseDate = history[i].contractDate;
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
export function calcRentalGainFraction(args: {
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
}): RentalGainFraction | null {
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
    return FULL_RENTAL_SHARE;
  }
  /**
   * §97의5②(감수 = 취득당시 E) + 계속 임대(B = D) → (D − E) / (D − E) = 1 — **임대개시일과 무관**하다.
   *
   * 🔴 종전에는 위의 「임대개시 ≤ 취득일」 조건만 있었다. 그 조건은 감수가 임대개시일 C인
   *    §97의3⑤용이다. §97의5는 「취득 후 3개월 내 등록 → 임대개시」 구조라 임대개시일이 거의 항상
   *    취득일보다 늦어, 결과를 바꾸지 않는 기준시가 두 점을 요구하고 미입력이면 감면을 전액 배제했다.
   *    기준시가가 하락한 사안(D ≤ E)은 분모 ≤ 0이라 같은 사유로 배제됐다.
   *
   * 하락 사안도 1로 본다 — 계속 임대면 령 §97의5②의 「임대기간의 마지막 날」이 양도일이라
   * 분자와 분모가 **같은 식**(양도 당시 − 취득당시)이다. 즉 보유기간 전체가 임대기간이고, 양도소득 전부가
   * 「임대기간 중 발생한 양도소득」이다. 반면 조기 종료(B ≠ D)에서 D ≤ E면 두 식이 갈리고 산식이 성립하지
   * 않으므로 evaluator가 `PRORATION_DENOMINATOR_NONPOSITIVE`로 불적용 처리한다(자동 안분 금지).
   */
  if (args.rentalContinuesToTransfer && args.numeratorBase === "acquisition") {
    return FULL_RENTAL_SHARE;
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
  // 0~1 클램프를 분자에서 한다 — 분수 그대로 넘겨 소비처가 `floor(금액 × 분자 ÷ 분모)`로 정확히 곱하게 한다.
  return { num: Math.min(denominator, Math.max(0, rentalEnd - subtrahend)), den: denominator };
}

/** 임대기간 분 비율 — 정수 분수(분자·분모 = 기준시가 차). 비율 double을 곱하면 1원 과소가 난다(2026-10-11 실측). */
export interface RentalGainFraction {
  num: number;
  den: number;
}
const FULL_RENTAL_SHARE: RentalGainFraction = { num: 1, den: 1 };

/** 비율(0~1) — 표시·혼합 공제율 산정용. 금액 안분에는 `applyRentalGainShare`를 쓴다. */
export function calcRentalGainRatio(args: Parameters<typeof calcRentalGainFraction>[0]): number | null {
  const f = calcRentalGainFraction(args);
  return f === null ? null : f.num / f.den;
}

/**
 * 임대기간 분 금액 = floor(금액 × 분자 ÷ 분모) — 조특령 §97의3⑤·§97의5②.
 * 분수가 없으면(§97·§97의2·취득 즉시 계속 임대 등 비율 1인 효과) 비율로 곱한다.
 * 종전 `applyRate(금액, 비율)`은 비율이 0.7647…처럼 무한소수면 곱이 정수인 입력에서 1원 적게 나왔다.
 */
export function applyRentalGainShare(
  amount: number,
  eff: { rentalGainRatio: number; rentalGainFraction?: RentalGainFraction },
): number {
  if (eff.rentalGainFraction) return safeMultiplyThenDivide(amount, eff.rentalGainFraction.num, eff.rentalGainFraction.den);
  return applyRate(amount, eff.rentalGainRatio);
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
 * 부칙 ②의 「주택」은 1호 괄호의 「주택을 취득할 수 있는 권리를 포함한다. **이하 이 항에서 같다**」라
 * 1호·2호 모두 분양권·입주권을 포함한다(2026-11-12 MST 204913 원문).
 * - ②1호 주택 취득일 ≤ 2018-09-13 — `acquisitionDate`
 * - ②2호 매매계약 + 계약금 지급 ≤ 2018-09-13 — 자산-수준 `contractDate`(화면 「매매계약일(분양/매매)」 칸 —
 *   안내문 「분양·매매계약 + 계약금 납부 시점」, 장기임대 그룹에 표시된다)
 * - ②1호 권리 취득·②2호 증빙을 사용자가 확인 — `clause4Grandfathered === true`
 *   (주택 취득일·계약일 칸만으로는 분양권·입주권을 먼저 취득한 사실이 드러나지 않는다)
 *
 * 취득일이 없으면 부칙②1호를 성립시킬 수 없어 원칙(①)대로 적용한다. 실제 계산 경로에서는
 * 자산-수준 `acquisitionDate`가 항상 주입되므로 이 분기는 단위 호출에서만 도달한다.
 */
export function isClause4Applicable(args: {
  transferDate: Date;
  acquisitionDate?: Date;
  contractDate?: Date;
  clause4Grandfathered?: boolean;
}): boolean {
  if (args.transferDate.getTime() < CLAUSE4_EFFECTIVE_FROM.getTime()) return false; // 부칙 §2①
  const onOrBefore = (d?: Date) => d !== undefined && d.getTime() <= CLAUSE4_GRANDFATHER_ACQUISITION.getTime();
  if (onOrBefore(args.acquisitionDate)) return false; // 부칙 §2②1호
  if (onOrBefore(args.contractDate)) return false; // 부칙 §2②2호
  if (args.clause4Grandfathered === true) return false; // 부칙 §2②1호(권리)·2호 — 사용자 확인
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
 * ✅ **부칙②2호·권리 취득을 판정한다 (2026-11-12, `rental-97-5-textbook-gaps.plan.md` §3.3 PR-B).**
 *    종전에는 「`contractDate`는 시한 판정용이라 의미가 다르다」며 판정하지 않고 안내만 붙였다.
 *    그 칸의 화면 안내는 「분양·매매계약 + 계약금 납부 시점」이고 장기임대 그룹에도 표시된다 — 부칙②2호의
 *    사실(「매매계약을 체결하고 계약금을 지급한」)과 같다. 분양권·입주권을 먼저 취득한 사실(②1호 괄호)은
 *    그 칸으로 드러나지 않아 질문(`clause4Grandfathered`)으로 받는다. 종전 동작은 2018.9.13. 이전 분양권으로
 *    그 뒤 완공된 주택에 한도를 적용해 납세자에게 불리했다.
 */
export function checkRental973Clause24(
  input: {
    isNationalHousingScale?: boolean;
    officialPriceAtStart?: number;
    region?: "capital" | "non_capital";
    /** 부칙 §2 게이트 축 — 4호 적용 여부만 가른다(2호는 부칙 대상이 아니다). */
    transferDate: Date;
    acquisitionDate?: Date;
    /** 부칙 §2②2호 — 자산-수준 매매계약일(분양·매매계약 + 계약금 납부) */
    contractDate?: Date;
    /** 부칙 §2② — 2018.9.13. 이전 권리 취득·매매계약을 사용자가 확인 */
    clause4Grandfathered?: boolean;
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
   * 부칙②(2018-09-13 이전 권리 취득·매매계약 + 계약금 지급)로 빠질 수 있는 구간 — 질문을 안내한다.
   * 취득일이 2018-09-13을 넘는데 양도가 시행일 이후인 사안만 해당한다(여기 도달했으면 계약일·질문으로도 빠지지 않았다).
   */
  const mayQualifyByContract =
    input.acquisitionDate !== undefined &&
    input.acquisitionDate.getTime() > CLAUSE4_GRANDFATHER_ACQUISITION.getTime();
  const contractNote = mayQualifyByContract
    ? " 다만 2018.9.13. 이전에 이 주택(분양권·입주권 포함)을 취득했거나 매매계약을 체결하고 계약금을 지급한 사실이 " +
      "증빙서류로 확인되면 종전 규정에 따라 이 한도가 적용되지 않습니다 — 「2018.9.13. 이전 취득·계약」 질문에서 확인하세요 " +
      "(대통령령 제29241호 부칙 §2②)."
    : "";

  if (input.officialPriceAtStart === undefined || input.officialPriceAtStart <= 0) {
    reasons.push({
      code: "MISSING_OFFICIAL_PRICE",
      message:
        "임대개시일 당시 주택과 부수토지의 기준시가 합계가 입력되지 않았습니다 " +
        `(${legalBasisPrefix}조특령 §97의3③4호 한도 검증).`,
      legalBasis: "조특령 §97의3③4호",
    });
  } else if (
    input.region === undefined &&
    input.officialPriceAtStart > OFFICIAL_PRICE_LIMIT_NON_CAPITAL &&
    input.officialPriceAtStart <= OFFICIAL_PRICE_LIMIT_CAPITAL
  ) {
    /**
     * 리뷰 9번 — 소재지가 없으면 종전에는 수도권 한도(6억)로 읽었다. 3억 초과 ~ 6억 이하는 소재지가
     * 적격을 가르므로 추정하지 않는다(앱은 소재지를 항상 보낸다 — API 직접 호출만 해당).
     */
    reasons.push({
      code: "MISSING_REGION",
      message:
        "임대개시일 당시 기준시가가 3억원을 넘어 소재지(수도권/수도권 밖)에 따라 한도(6억/3억) 충족 여부가 달라지는데 " +
        `소재지가 입력되지 않았습니다 (${legalBasisPrefix}조특령 §97의3③4호).`,
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
