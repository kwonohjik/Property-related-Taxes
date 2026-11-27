/**
 * 국외자산 부동산 양도소득세 — 단건 순수 엔진 (소득세법 §118의2~§118의8). DB 호출 없음, 세율은 매개변수.
 *
 * 순서: 환산 → 양도차익 → 장특 0(§118의8 단서) → 양도소득금액 → 기본공제 §118의7①(미등기 배제 없음)
 *       → 과세표준(천원 절사 없음) → §118의5① §55① 세율 → 산출세액 → 개인지방소득세(`local-tax.ts`).
 * 거주 5년 미만은 §118의2 과세대상 아님(세액 0, 오류 아님). 양도일 < 2020-01-01은 지원 범위 밖이라 던진다.
 */
import { calculateProgressiveTax } from "../tax-utils";
import { TaxCalculationError, TaxErrorCode } from "../tax-errors";
import { format } from "../utc-date";
import {
  FOREIGN_RE_SUPPORT_FROM_TRANSFER_DATE_MS,
  isForeignRealEstateSupportedTransferDate,
} from "../transfer-foreign-realestate-era";
import { TRANSFER_FOREIGN_RE } from "../legal-codes/transfer-foreign-realestate";
import { buildAssetRow } from "./convert";
import { assertSortedBrackets, calcForeignRealEstateLocalIncomeTax, selectBracket } from "./local-tax";
import type { ForeignRealEstateInput, ForeignRealEstateRates, ForeignRealEstateResult } from "./types";

/** 법 §118의2 본문 「계속 5년 이상」 */
export const FOREIGN_RE_MIN_RESIDENCE_YEARS = 5;

const SUPPORTED_FROM = format(new Date(FOREIGN_RE_SUPPORT_FROM_TRANSFER_DATE_MS), "yyyy-MM-dd");

const LOCAL_TAX_WARNING =
  "개인지방소득세는 표준세율(지방세법 §92①) 기준이며 지방자치단체 조례 가감(§103의3④)과 §103의3⑨의 가중은 반영하지 않았습니다.";

export function calculateForeignRealEstateTransferTax(
  input: ForeignRealEstateInput,
  rates: ForeignRealEstateRates,
): ForeignRealEstateResult {
  if (!Number.isInteger(input.domesticResidenceYears) || input.domesticResidenceYears < 0) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "domesticResidenceYears: 0 이상의 정수여야 합니다", {
      path: "domesticResidenceYears",
      value: input.domesticResidenceYears,
    });
  }
  if (input.assets.length !== 1) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "assets: 현재 단건(1건)만 계산합니다 (다건은 PR-3)", {
      path: "assets",
      count: input.assets.length,
    });
  }
  assertSortedBrackets(rates.brackets);

  const asset = input.assets[0];
  const row = buildAssetRow(asset, 0); // 환율·일자 검증을 거주 판정보다 먼저 — 5년 미만이어도 입력 오류는 막는다
  if (!isForeignRealEstateSupportedTransferDate(asset.transferDate)) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_DATE,
      `assets[0].transferDate: 양도일 ${SUPPORTED_FROM} 이후만 계산합니다`,
      { path: "assets[0].transferDate", reason: "TRANSFER_DATE_BEFORE_SUPPORT_START", supportedFrom: SUPPORTED_FROM },
    );
  }

  const base = {
    domesticResidenceYears: input.domesticResidenceYears,
    rows: [row],
    capitalGainTotal: row.capitalGain,
    longTermDeduction: 0 as const,
    supportedFrom: SUPPORTED_FROM,
    appliedLawDate: row.transferDate,
  };

  if (input.domesticResidenceYears < FOREIGN_RE_MIN_RESIDENCE_YEARS) {
    return {
      ...base,
      taxCategory: "not_liable",
      isLiable: false,
      notLiableReason: "RESIDENCE_UNDER_5_YEARS",
      ineligibleReason: "양도일까지 계속 5년 이상 국내에 주소 또는 거소를 둔 거주자가 아니면 국외자산 양도소득세 과세대상이 아닙니다 (소득세법 §118의2).",
      incomeAmountTotal: 0,
      basicDeduction: 0,
      taxBase: 0,
      appliedRate: 0,
      progressiveDeduction: 0,
      calculatedTax: 0,
      determinedTax: 0,
      localIncomeTaxBase: 0,
      localIncomeTax: 0,
      totalTax: 0,
      warnings: [],
      appliedRules: [TRANSFER_FOREIGN_RE.SECTION_118_2_SCOPE],
      confirmationNeeded: [],
    };
  }

  const incomeAmountTotal = row.incomeAmount;
  const basicDeduction = Math.min(incomeAmountTotal, rates.basicDeductionAnnualLimit);
  const taxBase = incomeAmountTotal - basicDeduction;
  const bracket = taxBase > 0 ? selectBracket(taxBase, rates.brackets) : undefined;
  const calculatedTax = calculateProgressiveTax(taxBase, rates.brackets);
  const localIncomeTax = calcForeignRealEstateLocalIncomeTax(taxBase, rates.brackets);

  return {
    ...base,
    taxCategory: "foreign_realestate",
    isLiable: true,
    incomeAmountTotal,
    basicDeduction,
    taxBase,
    appliedRate: bracket?.rate ?? 0,
    progressiveDeduction: bracket?.deduction ?? 0,
    calculatedTax,
    determinedTax: calculatedTax,
    localIncomeTaxBase: taxBase,
    localIncomeTax,
    totalTax: calculatedTax + localIncomeTax,
    warnings: [LOCAL_TAX_WARNING],
    appliedRules: [
      TRANSFER_FOREIGN_RE.SECTION_118_2_SCOPE,
      TRANSFER_FOREIGN_RE.SECTION_118_3_TRANSFER_VALUE,
      TRANSFER_FOREIGN_RE.SECTION_118_4_NECESSARY_EXPENSES,
      TRANSFER_FOREIGN_RE.DECREE_178_5_FX_BASE_RATE,
      TRANSFER_FOREIGN_RE.SECTION_118_8_MUTATIS_NO_LTHD,
      TRANSFER_FOREIGN_RE.SECTION_118_7_BASIC_DEDUCTION,
      TRANSFER_FOREIGN_RE.SECTION_118_5_RATE,
      TRANSFER_FOREIGN_RE.LOCAL_103_3_FOREIGN_TAX_BASE,
      TRANSFER_FOREIGN_RE.LOCAL_103_3_3_RATE,
      TRANSFER_FOREIGN_RE.LOCAL_92_1_RATE_TABLE,
      TRANSFER_FOREIGN_RE.LOCAL_BASIC_59_ROUNDING,
      TRANSFER_FOREIGN_RE.TREASURY_47_1_ROUND_10,
    ],
    confirmationNeeded: ["LOCAL_TAX_WEIGHTING_NOT_EVALUATED"],
  };
}
