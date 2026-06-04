/**
 * 연부연납 (상증법 §71)
 *
 * 상속세·증여세 결정세액이 2,000만원을 초과하는 경우
 * 납세자의 신청에 따라 분할 납부 가능.
 *
 * 연납기간:
 *   상속세 일반  : 허가일로부터 5년
 *   가업상속     : 허가일로부터 최대 20년 (10년 거치 후 10년 납부)
 *   증여세 일반  : 허가일로부터 5년
 *
 * 이자 상당액:
 *   국세환급가산금 이자율 기준 (시행령 §68 → 매년 고시)
 *   단순화: 연간 이자율은 Orchestrator가 DB에서 로드하여 전달
 *
 * 납부 계획:
 *   허가 시 1회분 납부 + 나머지를 연 1회씩 균등 납부
 */

import { addYears, differenceInCalendarDays } from "date-fns";
import { TAX_CREDIT } from "../legal-codes";
import type { CalculationStep } from "../types/inheritance-gift.types";
import {
  CURRENT_SURCHARGE_RATE,
  lookupSurchargeRate,
  surchargeRateBoundariesWithin,
} from "../data/installment-surcharge-rates";

export { CURRENT_SURCHARGE_RATE } from "../data/installment-surcharge-rates";

// ============================================================
// 연부연납 기준 한도
// ============================================================

/** 연부연납 신청 가능 최소 세액: 2천만원 (§71 ①) */
const INSTALLMENT_MIN_TAX = 20_000_000;

/** 일반 최대 연납 기간: 5년 (§71 ①) */
const GENERAL_MAX_YEARS = 5;

/** 가업상속 최대 연납 기간: 20년 (§71 ① 단서) */
const FAMILY_BUSINESS_MAX_YEARS = 20;

// ============================================================
// 연부연납 계획 계산
// ============================================================

export interface InstallmentPaymentInput {
  /** 결정세액 */
  finalTax: number;
  /** 가업상속 여부 (최대 20년 적용) */
  isFamilyBusiness?: boolean;
  /** 납부자 선택 연납 기간 (년) — 미입력 시 최대 기간 적용 */
  requestedYears?: number;
  /**
   * 연납 이자율 (연간, e.g. 0.018 = 1.8%)
   * DB에서 로드하거나 별도 입력
   */
  annualInterestRate?: number;
}

export interface InstallmentScheduleItem {
  /** 납부 회차 (0 = 허가 즉시, 1부터 = 이후 연납 회차) */
  installmentNo: number;
  /** 납부 원금 */
  principal: number;
  /** 이자 상당액 */
  interest: number;
  /** 합계 납부액 */
  total: number;
}

export interface InstallmentPaymentResult {
  /** 연부연납 가능 여부 */
  eligible: boolean;
  /** 실제 적용 연납 기간 */
  appliedYears: number;
  /** 허가 즉시 납부액 (= 결정세액 / (연납기간+1), 첫 회) */
  initialPayment: number;
  /** 연납 회별 원금 */
  annualPrincipal: number;
  /** 연납 일정 (이자 포함) */
  schedule: InstallmentScheduleItem[];
  breakdown: CalculationStep[];
}

/**
 * 연부연납 계획 계산 (§71)
 *
 * @param input 연부연납 입력
 */
export function calcInstallmentPayment(
  input: InstallmentPaymentInput,
): InstallmentPaymentResult {
  const {
    finalTax,
    isFamilyBusiness = false,
    requestedYears,
    annualInterestRate = 0.018,
  } = input;

  // 연부연납 가능 여부 판단 (§71 ①)
  const eligible = finalTax > INSTALLMENT_MIN_TAX;

  if (!eligible) {
    return {
      eligible: false,
      appliedYears: 0,
      initialPayment: finalTax,
      annualPrincipal: 0,
      schedule: [],
      breakdown: [
        {
          label: "연부연납 불가 — 결정세액 2천만원 이하",
          amount: finalTax,
          lawRef: TAX_CREDIT.INSTALLMENT,
        },
      ],
    };
  }

  const maxYears = isFamilyBusiness
    ? FAMILY_BUSINESS_MAX_YEARS
    : GENERAL_MAX_YEARS;
  const appliedYears = Math.min(requestedYears ?? maxYears, maxYears);

  // 첫 회 납부: 총세액 / (연납 기간 + 1)
  const initialPayment = Math.floor(finalTax / (appliedYears + 1));
  // 나머지 연납 원금 (총세액 - 첫 회)
  const remainingTax = finalTax - initialPayment;

  // 연납 일정 생성 (간이 이자 계산)
  const schedule: InstallmentScheduleItem[] = [
    {
      installmentNo: 0,
      principal: initialPayment,
      interest: 0,
      total: initialPayment,
    },
  ];

  if (isFamilyBusiness && appliedYears > 10) {
    // 가업상속 특례: 최초 10년 거치(이자만 납부) + 이후 납부 기간 균등 분할 (§71 ① 단서)
    const deferralYears = 10;
    const paymentYears = appliedYears - deferralYears;
    const annualPrincipal = Math.floor(remainingTax / paymentYears);

    let outstandingBalance = remainingTax;

    // 거치 기간 (1~10년): 이자만 납부, 원금 0
    for (let year = 1; year <= deferralYears; year++) {
      const interest = Math.floor(outstandingBalance * annualInterestRate);
      schedule.push({
        installmentNo: year,
        principal: 0,
        interest,
        total: interest,
      });
    }

    // 납부 기간 (11~20년): 원금 + 이자 납부
    for (let year = deferralYears + 1; year <= appliedYears; year++) {
      const interest = Math.floor(outstandingBalance * annualInterestRate);
      const principal =
        year === appliedYears
          ? outstandingBalance
          : annualPrincipal;
      schedule.push({
        installmentNo: year,
        principal,
        interest,
        total: principal + interest,
      });
      outstandingBalance -= principal;
    }
  } else {
    // 일반 연납: 균등 분할
    const annualPrincipal = Math.floor(remainingTax / appliedYears);
    let outstandingBalance = remainingTax;

    for (let year = 1; year <= appliedYears; year++) {
      const interest = Math.floor(outstandingBalance * annualInterestRate);
      const principal =
        year === appliedYears
          ? outstandingBalance
          : annualPrincipal;
      schedule.push({
        installmentNo: year,
        principal,
        interest,
        total: principal + interest,
      });
      outstandingBalance -= principal;
    }
  }

  const annualPrincipal = isFamilyBusiness && appliedYears > 10
    ? Math.floor(remainingTax / (appliedYears - 10))
    : Math.floor(remainingTax / appliedYears);

  const breakdown: CalculationStep[] = [
    {
      label: `연부연납 적용 (${appliedYears}년 분할, 이자율 ${(annualInterestRate * 100).toFixed(1)}%)`,
      amount: finalTax,
      lawRef: TAX_CREDIT.INSTALLMENT,
    },
    {
      label: "허가 즉시 납부액",
      amount: initialPayment,
    },
    {
      label: `연납 회별 원금 (×${appliedYears}회)`,
      amount: annualPrincipal,
    },
  ];

  return {
    eligible,
    appliedYears,
    initialPayment,
    annualPrincipal,
    schedule,
    breakdown,
  };
}

// ============================================================
// 연부연납 일정표 (상속세 — §71·§72·§68·§69) — 신규 엔진
// 설계: docs/02-design/features/inheritance-installment-payment.design.md
// ============================================================

/** 연부연납 신청 가능 최소 세액: 2천만원 **초과** (§71①) */
const INSTALLMENT_ELIGIBILITY_THRESHOLD = 20_000_000;

/** 각 회분 분할납부세액 최소: 1천만원 **초과** (§71② 단서, 시행령 §68①) */
const MIN_PER_INSTALLMENT = 10_000_000;

/** 일반 상속재산 최대 연부연납 기간 (§71②1나) */
const INHERITANCE_GENERAL_MAX_YEARS = 10;

/** 가업상속재산 최대 연부연납 기간 (§71②1가, 모드 A 균등) — 기존 FAMILY_BUSINESS_MAX_YEARS와 동일값, 명칭 충돌 회피 */
const FB_INSTALLMENT_MAX_YEARS = 20;

/** 가업상속 거치 기간 (모드 B, §71②1가 후단) */
const FB_INSTALLMENT_GRACE_YEARS = 10;

/**
 * 연부연납 적격 판정 (§71①). 무거운 일정 계산 없이 적격만 판정 — 인쇄 게이트·요약용.
 */
export function isInstallmentEligible(finalTax: number): boolean {
  return finalTax > INSTALLMENT_ELIGIBILITY_THRESHOLD;
}

export type FamilyBusinessInstallmentMode = "straight20" | "grace10";

export interface InstallmentScheduleInput {
  /** 결정세액 = 연부연납 대상금액 (상속세 납부세액) */
  finalTax: number;
  /** 신고·납부기한 = 상속개시일이 속하는 달의 말일부터 6개월 (§67①, 해외 9개월) */
  filingDeadline: Date;
  /** 사용자 희망 연부연납 기간(년) — 일반분 상한(≤10) 적용 */
  requestedYears: number;
  /** 가업상속재산 분기 (옵션, §68②) */
  familyBusiness?: {
    /** 가업상속재산가액 (result.familyBusinessDeductionDetail.finalValue) */
    familyBusinessValue: number;
    /** 가업상속공제액 (result.familyBusinessDeduction) */
    familyBusinessDeduction: number;
    /** 총상속재산가액 (result.grossEstateValue) */
    grossEstateValue: number;
    /** 납부방식: 20년 균등 / 10년 거치+10년 (확인필요①, 기본 straight20) */
    mode: FamilyBusinessInstallmentMode;
  };
  /** 미래 회차 가산율 (decimal, 사용자 입력, 기본 현행 3.1%) */
  futureSurchargeRate?: number;
  /** 과거/미래 경계 (호출처 주입 — 엔진 내부 Date.now 금지) */
  today: Date;
}

export interface InstallmentScheduleRow {
  /** 회차 (0 = 신고기한 즉납, 1.. = 연부연납) */
  installmentNo: number;
  /** 납부일자 */
  dueDate: Date;
  /** 납부원금 */
  principal: number;
  /** 연부연납 가산금 (§72) */
  surcharge: number;
  /** 합계 (원금 + 가산금) */
  total: number;
  /** 세그먼트 — 가업상속 분기 표시용 */
  segment: "general" | "family_business";
}

export interface InstallmentScheduleResult {
  eligible: boolean;
  requestedYears: number;
  /** 1천만원 단서로 자동 단축된 실제 일반분 기간 */
  appliedYears: number;
  autoShortened: boolean;
  /** 연부연납 허가 총세액 = finalTax − 신고기한 즉납분 합계 */
  deferredTotal: number;
  /** 회차별 행 (연도 기준 세그먼트 합산) */
  rows: InstallmentScheduleRow[];
  totalPrincipal: number;
  totalSurcharge: number;
  grandTotal: number;
  notes: string[];
}

/** 내부: 한 세그먼트(일반분 또는 가업분)의 회차별 원금·base 산정 */
interface SegmentInstallment {
  installmentNo: number;
  dueDate: Date;
  principal: number;
  /** §72 가산금 base (당해 회차 가산금 산정 잔액) */
  base: number;
  /** 직전 납부기한(가산금 일수 기산점) */
  prevDue: Date;
}

/**
 * §72 가산금 — (prevDue 다음날 ~ curDue) 기간을 가산율 변경일·today 경계로 분할 안분.
 * - 과거 구간: 고시 연혁율(§69①②)
 * - 미래 구간: 사용자 입력율(futureRate)
 * - 분모 365 고정 (§72 산식 ×1/365)
 */
function calcSurcharge(
  base: number,
  prevDue: Date,
  curDue: Date,
  today: Date,
  futureRate: number,
): number {
  if (base <= 0 || differenceInCalendarDays(curDue, prevDue) <= 0) return 0;

  // 분할 경계: prevDue, (가산율 변경일들), today(구간 내일 때), curDue
  const points: Date[] = [prevDue, ...surchargeRateBoundariesWithin(prevDue, curDue), curDue];
  if (today.getTime() > prevDue.getTime() && today.getTime() < curDue.getTime()) {
    points.push(today);
  }
  points.sort((a, b) => a.getTime() - b.getTime());

  // 정수 연산(BigInt): 소구간별 base×days×(rate×1e6) 누적 → 마지막에 365×1e6로 1회 절사.
  // 부동소수 오차 회피([[feedback_safemul_decimal_apportion_precision]]) + 대형 상속재산 overflow 회피.
  const SCALE = 1_000_000n; // 율 정밀도 (0.018 → 18000)
  let accNumerator = 0n;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const days = differenceInCalendarDays(b, a);
    if (days <= 0) continue;
    // 소구간 시작점 기준 율: today 이후면 미래 입력율, 아니면 고시 연혁율
    const rate = a.getTime() >= today.getTime() ? futureRate : lookupSurchargeRate(a);
    const ratePerScale = BigInt(Math.round(rate * Number(SCALE)));
    accNumerator += BigInt(base) * BigInt(days) * ratePerScale;
  }
  return Number(accNumerator / (365n * SCALE));
}

/**
 * 한 세그먼트의 회차별 원금·base 생성.
 * @param segTax     세그먼트 대상금액
 * @param years      연부연납 기간(N) — 회차 0..N (총 N+1회)
 * @param graceYears 거치 기간(가업 모드 B). 0이면 균등.
 *   >0이면 §71②1가·§68①1호: 거치 회차 0..graceYears-1 원금 0(가산금만),
 *   "허가 후 graceYears년이 되는 날"(회차 graceYears)부터 원금 분할.
 *   매년 원금 = 대상 / (연부연납기간+1) = 대상 / (years-graceYears+1).
 *   ⚠️ 거치기간 가산금은 실무(매년 이자 납부) 기준으로 계상. §72 본문(처음 분할납부세액에
 *      신고기한~첫 납부 일수 합산) 문리해석과 다를 수 있어 세무사 확인 필요(확인필요①).
 */
function buildSegment(
  segTax: number,
  years: number,
  filingDeadline: Date,
  graceYears: number,
): SegmentInstallment[] {
  const rows: SegmentInstallment[] = [];
  const deferredTotal = segTax; // 가산금 base 기준은 허가 총세액(= segTax). 회차0 원금은 별도 차감.

  if (graceYears <= 0) {
    // 균등: 회차 0..N, 매 회 segTax/(N+1), 마지막 잔액 흡수
    const per = Math.floor(segTax / (years + 1));
    let paidAfterDeadline = 0; // 신고기한 이후 납부 누계(가산금 base 차감용)
    const per0 = per; // 회차0(신고기한 즉납)
    const deferred = segTax - per0; // §72 허가 총세액
    for (let k = 0; k <= years; k++) {
      const dueDate = addYears(filingDeadline, k);
      const principal = k < years ? per : segTax - per * years; // 마지막 잔액 흡수
      const prevDue = k <= 1 ? filingDeadline : addYears(filingDeadline, k - 1);
      // base: 회차0 가산금 없음. 회차1 = deferred 전액. 이후 = deferred − 직전회까지 납부 분할세액
      const base = k === 0 ? 0 : deferred - paidAfterDeadline;
      rows.push({ installmentNo: k, dueDate, principal, base, prevDue });
      if (k >= 1) paidAfterDeadline += principal;
    }
    void deferredTotal;
    return rows;
  }

  // 거치(모드 B, §68①1호): 거치 회차 0..graceYears-1 원금 0(가산금만, base=segTax 전액),
  // "허가 후 graceYears년이 되는 날"(회차 graceYears)부터 원금 분할.
  // 원금 분할 회수 = years−graceYears+1 (anchor 포함 = §68① "+1"). 매년 = 대상/(분할회수).
  const principalCount = years - graceYears + 1; // 예: 20-10+1 = 11
  const per = principalCount > 0 ? Math.floor(segTax / principalCount) : segTax;
  let paid = 0;
  for (let k = 0; k <= years; k++) {
    const dueDate = addYears(filingDeadline, k);
    const prevDue = k <= 1 ? filingDeadline : addYears(filingDeadline, k - 1);
    let principal = 0;
    if (k >= graceYears) {
      // 거치 후 첫 원금 회차(k=graceYears)부터. 마지막 회차(k=years)는 잔액 흡수.
      principal = k < years ? per : segTax - per * (principalCount - 1);
    }
    // 가산금 base: 거치기간(원금 0)에도 매년 잔액(=segTax) × 율 이자 계상(실무 기준).
    const base = k === 0 ? 0 : segTax - paid;
    rows.push({ installmentNo: k, dueDate, principal, base, prevDue });
    if (k >= 1) paid += principal;
  }
  return rows;
}

/**
 * 1천만원 단서(§71②) 충족 최대 일반분 기간 탐색.
 * floor(segTax/(y+1)) > 1천만 인 최대 y ∈ [1, cap].
 */
function resolveAppliedYears(segTax: number, requested: number, cap: number): number {
  const ceil = Math.min(Math.max(requested, 1), cap);
  for (let y = ceil; y >= 1; y--) {
    if (Math.floor(segTax / (y + 1)) > MIN_PER_INSTALLMENT) return y;
  }
  return 1; // y=1에서도 미충족이면 1 반환(부적격 note는 호출부에서)
}

/**
 * 연부연납 일정표 계산 (§71·§72·§68·§69).
 */
export function calcInstallmentSchedule(
  input: InstallmentScheduleInput,
): InstallmentScheduleResult {
  const {
    finalTax,
    filingDeadline,
    requestedYears,
    familyBusiness,
    futureSurchargeRate = CURRENT_SURCHARGE_RATE,
    today,
  } = input;

  const notes: string[] = [];
  const eligible = isInstallmentEligible(finalTax);

  if (!eligible) {
    return {
      eligible: false,
      requestedYears,
      appliedYears: 0,
      autoShortened: false,
      deferredTotal: 0,
      rows: [],
      totalPrincipal: 0,
      totalSurcharge: 0,
      grandTotal: 0,
      notes: ["결정세액이 2천만원 이하 — 연부연납 신청 불가 (상증법 §71①)"],
    };
  }

  // ── 가업상속재산분 / 일반재산분 세액 안분 (§68②) ─────────────────
  let fbTax = 0;
  let generalTax = finalTax;
  if (familyBusiness) {
    const denom = familyBusiness.grossEstateValue - familyBusiness.familyBusinessDeduction;
    const numer = familyBusiness.familyBusinessValue - familyBusiness.familyBusinessDeduction;
    if (denom > 0 && numer > 0) {
      fbTax = Math.floor((finalTax * numer) / denom);
      if (fbTax > finalTax) fbTax = finalTax;
      generalTax = finalTax - fbTax;
    } else {
      notes.push(
        "가업상속 안분 분모(총상속재산가액−가업상속공제액)가 0 이하 — 일반 상속으로 계산",
      );
    }
  }

  // ── 일반재산분: 1천만원 단서 자동 단축 ────────────────────────────
  const generalAppliedYears = resolveAppliedYears(
    generalTax,
    requestedYears,
    INHERITANCE_GENERAL_MAX_YEARS,
  );
  const autoShortened =
    generalAppliedYears < Math.min(requestedYears, INHERITANCE_GENERAL_MAX_YEARS);
  if (autoShortened) {
    notes.push(
      `§71② 단서(각 회분 분납세액 1천만원 초과)로 일반분 연부연납 기간을 ${generalAppliedYears}년으로 단축(희망 ${requestedYears}년)`,
    );
  }
  if (Math.floor(generalTax / 2) <= MIN_PER_INSTALLMENT) {
    notes.push(
      "일반분이 1회 분할(1년)에서도 회분 1천만원 초과 요건을 충족하지 못함 — 연부연납 실익 제한",
    );
  }

  // ── 세그먼트별 일정 생성 ──────────────────────────────────────────
  const generalSeg = buildSegment(generalTax, generalAppliedYears, filingDeadline, 0);

  let fbSeg: SegmentInstallment[] = [];
  if (fbTax > 0) {
    const grace =
      familyBusiness?.mode === "grace10" ? FB_INSTALLMENT_GRACE_YEARS : 0;
    fbSeg = buildSegment(fbTax, FB_INSTALLMENT_MAX_YEARS, filingDeadline, grace);
    if (grace > 0) {
      notes.push(
        "가업상속 10년 거치 방식 — 거치기간(1~10년차) 가산금은 매년 이자 납부 기준으로 계상했습니다. §72 본문(처음 분할납부세액에 신고기한~첫 납부 일수 합산) 문리해석과 다를 수 있어 세무사 확인을 권장합니다.",
      );
    }
  }

  // ── 연도(회차) 기준 병합 + 가산금 계산 ────────────────────────────
  const maxNo = Math.max(
    generalSeg.length ? generalSeg[generalSeg.length - 1].installmentNo : 0,
    fbSeg.length ? fbSeg[fbSeg.length - 1].installmentNo : 0,
  );

  const rows: InstallmentScheduleRow[] = [];
  let totalSurcharge = 0;
  const segOf = (segments: SegmentInstallment[], k: number) =>
    segments.find((s) => s.installmentNo === k);

  for (let k = 0; k <= maxNo; k++) {
    const g = segOf(generalSeg, k);
    const f = segOf(fbSeg, k);

    const gSur = g ? calcSurcharge(g.base, g.prevDue, g.dueDate, today, futureSurchargeRate) : 0;
    const fSur = f ? calcSurcharge(f.base, f.prevDue, f.dueDate, today, futureSurchargeRate) : 0;

    const dueDate = (g ?? f)!.dueDate;

    // 가업분 존재 시 세그먼트별 행 분리(표 그룹), 아니면 단일 행
    if (fbTax > 0) {
      if (g) {
        rows.push({
          installmentNo: k,
          dueDate,
          principal: g.principal,
          surcharge: gSur,
          total: g.principal + gSur,
          segment: "general",
        });
      }
      if (f) {
        rows.push({
          installmentNo: k,
          dueDate,
          principal: f.principal,
          surcharge: fSur,
          total: f.principal + fSur,
          segment: "family_business",
        });
      }
    } else if (g) {
      rows.push({
        installmentNo: k,
        dueDate,
        principal: g.principal,
        surcharge: gSur,
        total: g.principal + gSur,
        segment: "general",
      });
    }
    totalSurcharge += gSur + fSur;
  }

  const totalPrincipal = generalTax + fbTax; // = finalTax
  const deferredTotal =
    totalPrincipal -
    ((generalSeg.find((s) => s.installmentNo === 0)?.principal ?? 0) +
      (fbSeg.find((s) => s.installmentNo === 0)?.principal ?? 0));

  if (futureSurchargeRate !== CURRENT_SURCHARGE_RATE) {
    notes.push(
      `미래 회차 가산율 연 ${(futureSurchargeRate * 100).toFixed(2)}% 가정(사용자 입력)`,
    );
  }

  return {
    eligible: true,
    requestedYears,
    appliedYears: generalAppliedYears,
    autoShortened,
    deferredTotal,
    rows,
    totalPrincipal,
    totalSurcharge,
    grandTotal: totalPrincipal + totalSurcharge,
    notes,
  };
}
