/**
 * 영농상속공제 사후관리 추징 (F-7)
 *
 * 법령 (KoreanLaw MCP 검증 2026-05-21):
 *   - 상증법 §18의3④ (5년 내 처분·종사 중단 추징) — 산입액을 "과세가액에 산입하여 상속세를 부과"
 *   - 상증법 §18의3⑥ (조세포탈·회계부정 — 시행령 §16⑨ → §15⑲)
 *   - 상증법 §18의3⑦ (사유 발생일 속하는 달 말일 + 6개월 이내 신고)
 *   - 상증령 §16⑥ (정당한 사유 7종)
 *   - 상증령 §16⑦ ("100분의 100" — 과세가액 산입율, 추징세액률 아님)
 *   - 상증령 §16⑧1호 (이자상당액 기준 = "④ 전단에 따라 결정한 상속세액" = marginal 추징세액)
 *
 * ⚠️ 추징세액 = 상속세(과세표준 + 산입액) − 상속세(과세표준) = §26 누진 marginal 재계산(2026-07-17 재검증).
 *    산입액(공제 전액)을 곧 세액으로 보는 것은 오류(과세가액↔세액 차원 혼동, 최고 50%인데 100% 징수).
 *    가업 §18의2⑤(PR#635)와 동형 — 영농은 자산처분비율 없이 산입액=공제 전액.
 * 정수 연산: 이자상당액 BigInt 단일 floor (applyRate 다중 호출 정밀도 손실 회피)
 */

import {
  addMonths,
  addYears,
  differenceInDays,
  endOfMonth,
  isAfter,
  parseISO,
} from "date-fns";

import { calcInheritanceGiftTax } from "../inheritance-gift-common";
import type {
  CalculationStep,
  FarmingPostMgmtInput,
  FarmingPostMgmtJustifiedReason,
  FarmingPostMgmtResult,
  FarmingPostMgmtViolation,
} from "../types/inheritance-farming.types";

// ============================================================
// 정당사유 매칭 — §18의3④ 트랙에만 적용
// ============================================================

const FOURTH_PARA_VIOLATIONS: FarmingPostMgmtViolation[] = [
  "asset_disposed",
  "farming_ceased",
];

function isJustifiedReasonApplicable(
  violation: FarmingPostMgmtViolation,
): boolean {
  return FOURTH_PARA_VIOLATIONS.includes(violation);
}

function evaluateJustifiedReason(
  input: FarmingPostMgmtInput,
): FarmingPostMgmtJustifiedReason | undefined {
  if (!isJustifiedReasonApplicable(input.violation)) return undefined;
  if (!input.justifiedReason) return undefined;

  // 6호 법인주식 처분 — 최대주주 유지 조건
  if (input.justifiedReason === "corporate_stock_disposal") {
    return input.maintainsMajorShareholder === true
      ? "corporate_stock_disposal"
      : undefined;
  }
  // 1~5호·7호 — 단순 면제
  return input.justifiedReason;
}

const JUSTIFIED_REASON_LABEL: Record<FarmingPostMgmtJustifiedReason, string> = {
  heir_death: "상속인 사망 (§16⑥1호)",
  overseas_relocation: "해외이주 (§16⑥2호)",
  expropriation: "공익사업 수용·협의매수 (§16⑥3호)",
  government_transfer: "국가·지자체 양도·증여 (§16⑥4호)",
  land_exchange: "영농상 농지 교환·분합·대토 (§16⑥5호)",
  corporate_stock_disposal: "법인주식 처분 + 최대주주 유지 (§16⑥6호)",
  other_similar: "재정경제부령 유사 사유 (§16⑥7호)",
};

const VIOLATION_LABEL: Record<FarmingPostMgmtViolation, string> = {
  asset_disposed: "영농상속재산 처분 (§18의3④1호)",
  farming_ceased: "영농 종사 중단 (§18의3④2호)",
  tax_fraud_conviction: "조세포탈 형 확정 (§18의3⑥2호 + §15⑲1호)",
  accounting_fraud: "회계부정 형 확정 (§18의3⑥2호 + §15⑲2호)",
};

// ============================================================
// 이자상당액 — BigInt 단일 floor
// ============================================================

const RATE_SCALE = 1_000_000_000n;  // 1e9 — 이자율 소수점 9자리까지

function calcInterestAmount(
  determinedTax: number,
  days: number,
  interestRate: number,
): number {
  if (determinedTax <= 0 || days <= 0 || interestRate <= 0) return 0;
  // BigInt 곱셈 후 단일 floor — 정밀도 손실 회피
  // interestAmount = floor(determinedTax × days × interestRate / 365)
  // = floor(determinedTax × days × round(rate × 1e9) / (365 × 1e9))
  const rateScaled = BigInt(Math.round(interestRate * Number(RATE_SCALE)));
  const numerator =
    BigInt(determinedTax) * BigInt(days) * rateScaled;
  const denominator = BigInt(365) * RATE_SCALE;
  const result = numerator / denominator;
  return Number(result);
}

// ============================================================
// 신고기한 §18의3⑦ — 사유 발생일 속하는 달 말일 + 6개월
// ============================================================

function calcReportDeadline(violationDate: string): string {
  const date = parseISO(violationDate);
  const monthEnd = endOfMonth(date);
  const deadline = addMonths(monthEnd, 6);
  // YYYY-MM-DD 직렬화
  return deadline.toISOString().slice(0, 10);
}

// ============================================================
// 메인 — calcFarmingPostMgmt
// ============================================================

export function calcFarmingPostMgmt(
  originalDeduction: number,
  input: FarmingPostMgmtInput,
): FarmingPostMgmtResult {
  const safeOriginal = Math.max(0, originalDeduction);
  const reportDeadline = calcReportDeadline(input.violationDate);

  // 일수 — 신고기한 다음날부터 위반일까지 (위반일 포함).
  //   differenceInDays(위반일, 신고기한)이 곧 그 일수 (신고기한 자체는 제외, 다음날=1일차).
  //   가업 §18의2 daysFromFilingToViolation과 동일 관행. 종전 addDays(+1) 후 differenceInDays는
  //   첫날을 이중 배제해 1일 과소였음 (M-9).
  const interestDays = Math.max(
    0,
    differenceInDays(parseISO(input.violationDate), parseISO(input.filingDeadline)),
  );

  // §18의3④ 5년 사후관리기간 — ④ 트랙(처분·종사중단)만. 5년 경과 후 위반 → 무추징.
  //   민법 §157·§160② 계산: 상속개시일 기산 5년 만료일 = addYears(start, 5). 그 후 위반은 기간 외.
  //   §18의3⑥ 트랙(조세포탈·회계부정 형 확정)은 5년 제한 없음 → 게이트 미적용.
  if (
    isJustifiedReasonApplicable(input.violation) &&
    isAfter(
      parseISO(input.violationDate),
      addYears(parseISO(input.inheritanceStartDate), 5),
    )
  ) {
    return {
      recaptureRequired: false,
      outsideManagementPeriod: true,
      taxableAmountAddback: 0,
      recaptureAmount: 0,
      interestAmount: 0,
      totalRecapture: 0,
      reportDeadline,
      interestDays,
      breakdown: [
        {
          label: `위반 사유: ${VIOLATION_LABEL[input.violation]}`,
          amount: 0,
        },
        {
          label: "사후관리기간(5년) 경과 — 추징 대상 아님",
          amount: 0,
          note: `상속개시일 ${input.inheritanceStartDate} + 5년 < 위반일 ${input.violationDate} (상증법 §18의3④)`,
        },
        { label: "추징세액", amount: 0 },
        { label: "이자상당액", amount: 0 },
      ],
    };
  }

  // 정당사유 매칭 — §18의3④ 트랙만
  const exemptedBy = evaluateJustifiedReason(input);
  if (exemptedBy) {
    return {
      recaptureRequired: false,
      exemptedBy,
      taxableAmountAddback: 0,
      recaptureAmount: 0,
      interestAmount: 0,
      totalRecapture: 0,
      reportDeadline,
      interestDays,
      breakdown: [
        {
          label: `위반 사유: ${VIOLATION_LABEL[input.violation]}`,
          amount: 0,
        },
        {
          label: `면제 적용: ${JUSTIFIED_REASON_LABEL[exemptedBy]}`,
          amount: 0,
          note: "정당한 사유 인정 (시행령 §16⑥)",
        },
        { label: "추징세액", amount: 0 },
        { label: "이자상당액", amount: 0 },
      ],
    };
  }

  // 추징 적용 — 과세가액 산입 후 상속세 재계산 증가분 (§18의3④ 전단, C-2 동형)
  //   ① 산입액 = 공제액 × 100%(§16⑦). 영농은 자산처분비율 없이 전액.
  //   ② 추징세액 = 상속세(과세표준 + 산입액) − 상속세(과세표준) = §26 누진 marginal.
  const taxableAmountAddback = safeOriginal;
  const safeBase = Math.max(0, input.baseTaxableAmount);
  const recaptureAmount = Math.max(
    0,
    calcInheritanceGiftTax(safeBase + taxableAmountAddback) - calcInheritanceGiftTax(safeBase),
  );
  // 이자상당액 기준세액 = 재계산 증가분(§16⑧1호 "④ 전단에 따라 결정한 상속세액")
  const interestAmount = calcInterestAmount(
    recaptureAmount,
    interestDays,
    input.interestRate,
  );
  const totalRecapture = recaptureAmount + interestAmount;

  const breakdown: CalculationStep[] = [
    {
      label: `위반 사유: ${VIOLATION_LABEL[input.violation]}`,
      amount: 0,
    },
  ];

  // §18의3⑥ 트랙은 정당사유 미적용 안내
  if (!isJustifiedReasonApplicable(input.violation) && input.justifiedReason) {
    breakdown.push({
      label: `정당사유 미적용 — §18의3⑥ 트랙 (조세포탈·회계부정)`,
      amount: 0,
      note: "§16⑥ 정당사유는 §18의3④ 위반에만 적용",
    });
  } else if (
    isJustifiedReasonApplicable(input.violation) &&
    input.justifiedReason === "corporate_stock_disposal" &&
    input.maintainsMajorShareholder !== true
  ) {
    breakdown.push({
      label: `법인주식 처분 정당사유 부적용 — 최대주주 미유지`,
      amount: 0,
      note: "§16⑥6호 단서 — 최대주주 지위 유지 시만 면제",
    });
  }

  breakdown.push(
    {
      label: "공제받은 영농상속공제액",
      amount: safeOriginal,
    },
    {
      label: "상속세 과세가액 산입액 (§18의3④ 전단·§16⑦ 100%)",
      amount: taxableAmountAddback,
    },
    {
      label: "원래 상속세 과세표준",
      amount: safeBase,
    },
    {
      label: "추징세액 = 상속세(과세표준+산입액) − 상속세(과세표준)",
      amount: recaptureAmount,
      lawRef: "상증법 §18의3④",
    },
    {
      label: `이자상당액 산정 일수 (신고기한+1 ~ 위반일)`,
      amount: interestDays,
      note: `${input.filingDeadline} + 1일 ~ ${input.violationDate}`,
    },
    {
      label: `이자율 (국세기본법 §43의3②)`,
      amount: 0,
      note: `${(input.interestRate * 100).toFixed(3)}% (사용자 입력)`,
    },
    {
      label: "이자상당액 = 추징세액 × 일수 × 이자율 / 365",
      amount: interestAmount,
      lawRef: "시행령 §16⑧",
    },
    {
      label: "총 추징액 (세액 + 이자)",
      amount: totalRecapture,
    },
    {
      label: `신고기한 (§18의3⑦)`,
      amount: 0,
      note: `${reportDeadline} (사유 발생 월 말일 + 6개월)`,
    },
  );

  return {
    recaptureRequired: true,
    taxableAmountAddback,
    recaptureAmount,
    interestAmount,
    totalRecapture,
    reportDeadline,
    interestDays,
    breakdown,
  };
}
