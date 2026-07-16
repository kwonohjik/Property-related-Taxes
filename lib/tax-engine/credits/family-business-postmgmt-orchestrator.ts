/**
 * 가업상속공제 사후관리 추징 orchestrator (Phase F 통합)
 *
 * 법령: 상증법 §18의2⑤⑨⑩ + 상증령 §15⑧⑩⑪⑮⑯㉕ (KoreanLaw MCP 2026-06-04 검증)
 *
 * 동결 산식 헬퍼(family-business-postmanagement.ts·family-business-employment.ts)를 조립:
 *   위반별 면제판정(5년가드 → 명시 정당사유 → OFZ) → 추징 + 이자 → 정규직 4호 AND → 양도세 환원.
 *
 * 계획서: docs/00-pm/inheritance-family-business-postmgmt.plan.md (v3) §3
 */

import { addMonths, addYears, differenceInDays, endOfMonth, format, parseISO } from "date-fns";

import { INH } from "../legal-codes";
import {
  calcInheritanceGiftTax,
  DEFAULT_INHERITANCE_GIFT_BRACKETS,
} from "../inheritance-gift-common";
import { resolveEstateItemValue } from "../valuation/resolve-estate-item-value";
import type { AssetCategory } from "../types/inheritance-gift.types";
import type { EstateItem, FamilyBusinessDeductionDetail } from "../types/inheritance-gift.types";
import type {
  AmendmentReturnData,
  FamilyBusinessPostMgmtInput,
  FamilyBusinessPostMgmtMeta,
  FamilyBusinessPostMgmtResult,
  PostMgmtAssetType,
  PostMgmtViolationDetail,
} from "../types/inheritance-family-business-postmgmt.types";
import { calcInheritanceFilingDeadline } from "../deductions/family-business-autoderive";
import {
  calcAssetDisposalRatio,
  calcFamilyBusinessInterest,
  calcFamilyBusinessRecapture,
} from "./family-business-postmanagement";
import {
  calcRegularEmployeeAverage,
  isEmploymentDropViolation,
  isSalaryDropViolation,
} from "./family-business-employment";

/** EstateItem.category → 사후관리 자산 타입 (계획 §2-1) */
export function mapEstateItemToPostMgmtType(category: AssetCategory): PostMgmtAssetType {
  switch (category) {
    case "real_estate_land":
      return "land";
    case "real_estate_building":
    case "real_estate_apartment":
      return "building";
    case "listed_stock":
    case "unlisted_stock":
      return "stock";
    default:
      return "other";
  }
}

/**
 * §18의2⑤ "상속개시일부터 5년 이내" 가드 — 위반일이 사망일 + 5년 이내(경계 포함)인가.
 * 5년 초과 위반은 사후관리 대상 아님 → 자동 면제.
 */
export function isWithinFiveYears(violationDate: string, deathDate: string): boolean {
  const fiveYearLimit = addYears(parseISO(deathDate), 5);
  return parseISO(violationDate) <= fiveYearLimit;
}

/** 이자상당액 기산 일수 — 신고기한 다음날 ~ 위반일 (음수 가드) */
function daysFromFilingToViolation(filingDeadline: string, violationDate: string): number {
  return Math.max(0, differenceInDays(parseISO(violationDate), parseISO(filingDeadline)));
}

/**
 * 가업상속공제 사후관리 추징 시뮬레이션 (계획 §3-2).
 *
 * 위반별 면제 우선순위: (0) 5년 초과 자동 면제 → (1) 명시 정당사유 → (2) OFZ 자동 면제(§15⑪1·2호).
 * 미면제 시 추징(§15⑮ 100%, 자산처분은 §15⑩ 비율 추가곱·재차부과 단서) + 이자상당액(§15⑯).
 * 양도세 환원 공제(§18의2⑩, cgtCreditAmount)는 합계 추징에서 차감(음수 0 가드).
 */
export function calcFamilyBusinessPostMgmt(
  input: FamilyBusinessPostMgmtInput,
): FamilyBusinessPostMgmtResult {
  // §15⑩ 단서 — 재차 부과: 종전 처분 자산 합(분모에서 제외)
  const priorAssetDisposalSum = input.violations
    .filter((v) => v.type === "asset_disposal")
    .reduce((s, v) => s + (v.priorDisposedExcluded ?? 0), 0);

  // §18의2⑤ 추징세액 = 과세가액 산입 후 상속세 재계산 증가분 (공제액 자체가 세액이 아님 — C-2).
  //   base(상속개시 당시 과세표준, 공제 적용 후)에 산입액을 누적해 marginal-in-order로 증가분을 산정.
  //   율은 DB 미접근(standalone)이라 DEFAULT 상속세율 — 요약 경로(calcInheritanceGiftTax(taxBase))와 동일.
  const brackets = DEFAULT_INHERITANCE_GIFT_BRACKETS;
  let runningBase = input.baseTaxableAmount;
  let cumulativeAddback = 0;

  const perViolationDetail: PostMgmtViolationDetail[] = [];
  for (let i = 0; i < input.violations.length; i++) {
    const v = input.violations[i];

    // (0) 5년 초과 자동 면제 (§18의2⑤ "상속개시일부터 5년 이내")
    if (input.deathDate && !isWithinFiveYears(v.date, input.deathDate)) {
      perViolationDetail.push({ event: v, exempted: true, exemptionReason: "outside_five_year_period", recapture: 0, interest: 0 });
      continue;
    }

    // (1) 사용자 명시 정당사유 (§15⑧)
    const reason = input.justifiableReasons?.find((j) => j.violationRef === i);
    if (reason) {
      perViolationDetail.push({ event: v, exempted: true, exemptionReason: reason.reasonCode, recapture: 0, interest: 0 });
      continue;
    }

    // (2) OFZ 자동 면제 (§15㉕ → §15⑪1호·2호 한정, 3호 휴/폐업 제외)
    if (
      input.ofzExemptionActive &&
      v.type === "business_cessation" &&
      (v.cessationSubType === "ceo_not_serving" || v.cessationSubType === "industry_change")
    ) {
      perViolationDetail.push({ event: v, exempted: true, exemptionReason: "ofz_exemption", recapture: 0, interest: 0 });
      continue;
    }

    // 과세가액 산입액 (§15⑮ 100% × 자산처분비율)
    const assetDisposalRatio =
      v.type === "asset_disposal"
        ? calcAssetDisposalRatio(
            (v.disposedAssetValue ?? 0) - (v.priorDisposedExcluded ?? 0),
            (v.totalBusinessAssetValue ?? 0) - priorAssetDisposalSum,
          )
        : undefined;
    const recapture = calcFamilyBusinessRecapture(
      { appliedDeduction: input.appliedDeduction, violationType: v.type, assetDisposalRatio },
      INH.FAMILY_BUSINESS_DEDUCTION,
    );
    // 다중 위반 이중산입 방지 — 누적 산입액이 공제액(추징 원금)을 넘지 않도록 cap.
    const addback = Math.max(
      0,
      Math.min(recapture.taxableAmountAddback, input.appliedDeduction - cumulativeAddback),
    );

    // 추징세액 = 재계산 증가분 (base 누적 marginal). Σ증가분 = tax(base+Σ산입액) − tax(base).
    const marginalTax =
      calcInheritanceGiftTax(runningBase + addback, brackets) -
      calcInheritanceGiftTax(runningBase, brackets);
    runningBase += addback;
    cumulativeAddback += addback;

    // 이자상당액 (§15⑯) — 기준세액 = 재계산 증가분(marginalTax, CGT 차감 전). 신고기한 다음날 ~ 위반일.
    const days = daysFromFilingToViolation(input.filingDeadline, v.date);
    const interest = calcFamilyBusinessInterest(
      {
        determinedTax: marginalTax,
        daysFromFilingDeadlineToViolation: days,
        annualInterestRate: input.annualInterestRate,
      },
      INH.FAMILY_BUSINESS_DEDUCTION,
    );

    perViolationDetail.push({
      event: v,
      exempted: false,
      recapture: marginalTax,
      interest: interest.interestAmount,
    });
  }

  // 정규직·총급여 §⑤4호 AND
  let employmentResult: FamilyBusinessPostMgmtResult["employmentResult"];
  if (input.employmentTracking) {
    const et = input.employmentTracking;
    const fiveYearAvg = calcRegularEmployeeAverage(et.fiveYearData);
    const priorTwoYearAvg = calcRegularEmployeeAverage(et.priorTwoYearData);
    const employmentDrop = isEmploymentDropViolation(fiveYearAvg, priorTwoYearAvg);
    const salaryDrop = isSalaryDropViolation(et.fiveYearTotalSalary, et.priorTwoYearTotalSalary);
    employmentResult = {
      fiveYearAvg,
      priorTwoYearAvg,
      threshold: priorTwoYearAvg * 0.9,
      employmentDrop,
      salaryDrop,
      bothViolated: employmentDrop && salaryDrop, // §⑤4호 "각 목에 모두"
    };
  }

  // 합계 + 양도세 환원 공제 (§18의2⑩ — 산출세액=totalRecapture에서 차감, 음수 0 가드)
  const totalRecapture = perViolationDetail.reduce((s, v) => s + v.recapture, 0);
  const totalAddback = cumulativeAddback;
  const totalInterest = perViolationDetail.reduce((s, v) => s + v.interest, 0);
  const cgtCreditApplied = Math.min(totalRecapture, Math.max(0, input.cgtCreditAmount ?? 0));
  const netRecapture = Math.max(0, totalRecapture - cgtCreditApplied);

  return { totalRecapture, totalAddback, totalInterest, cgtCreditApplied, netRecapture, perViolationDetail, employmentResult };
}

/**
 * 상속세 수정신고 데이터 매핑 (별지 제9호서식, 계획 §4-4 L13).
 * 수정신고 기한 = 위반일이 속하는 달 말일 + 6개월 (§18의2⑨).
 */
export function buildAmendmentReturnData(
  postMgmtResult: FamilyBusinessPostMgmtResult,
  violationDate: string,
): AmendmentReturnData {
  return {
    additionalDeterminedTax: postMgmtResult.totalRecapture,
    interestPenalty: postMgmtResult.totalInterest,
    cgtCreditReceived: postMgmtResult.cgtCreditApplied,
    netPayable: postMgmtResult.netRecapture + postMgmtResult.totalInterest,
    amendmentDeadline: format(addMonths(endOfMonth(parseISO(violationDate)), 6), "yyyy-MM-dd"),
  };
}

/**
 * 가업상속공제 사후관리 메타 빌더 (inheritance-tax.ts orchestrator용, 계획 §3-3).
 * 가업상속공제 적용액 > 0 시에만 반환(직접입력 포함). 그 외 undefined.
 * 신고기한은 §67 단일소스(calcInheritanceFilingDeadline) 재사용.
 */
export function buildFamilyBusinessPostMgmtMeta(args: {
  familyBusinessDeduction: number;
  familyBusinessDetail: FamilyBusinessDeductionDetail | undefined;
  estateItems: EstateItem[] | undefined;
  deathDate: string | undefined;
  /** 상속개시 당시 상속세 과세표준 (가업상속공제 적용 후) — 추징 재계산 base prefill */
  baseTaxableAmount: number;
}): FamilyBusinessPostMgmtMeta | undefined {
  const { familyBusinessDeduction, familyBusinessDetail, estateItems, deathDate, baseTaxableAmount } = args;
  if (familyBusinessDeduction <= 0 || !familyBusinessDetail || !deathDate) return undefined;

  return {
    appliedDeduction: familyBusinessDetail.deduction,
    baseTaxableAmount,
    deathDate,
    filingDeadline: calcInheritanceFilingDeadline(deathDate),
    ofzExemptionActive: familyBusinessDetail.ofzExemptionActive ?? false,
    usedDirectInput: familyBusinessDetail.usedDirectInput,
    inheritedAssets: (estateItems ?? [])
      .filter((i) => i.familyBusinessCategory !== undefined)
      .map((i) => ({
        id: i.id,
        // J-1: §60 평가 우선순위(시가→감정가→기준시가→주식 보충평가) 통일.
        //   marketValue 직접 사용 시 비상장주식 V2·부동산(감정가·기준시가)은 value=0 누락.
        value: resolveEstateItemValue(i),
        type: mapEstateItemToPostMgmtType(i.category),
      })),
  };
}
