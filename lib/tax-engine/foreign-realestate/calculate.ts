/**
 * 국외자산 부동산 양도소득세 — 순수 엔진 (소득세법 §118의2~§118의8). DB 호출 없음, 세율은 매개변수.
 *
 * 순서: 자산별 환산 → 양도차익(필요경비 산입방법이면 외국납부세액 차감, §118의6①2호) → 장특 0(§118의8 단서) → 자산별 양도소득금액
 *       → 기본공제 §118의7(과세기간당 1회, 먼저 양도한 자산부터) → 과세표준 합계(천원 절사 없음)
 *       → §118의5① §55① 세율 1회 → 산출세액 → 외국납부세액 세액공제(§118의6①1호) → 개인지방소득세(`local-tax.ts`).
 * 거주 5년 미만은 §118의2 과세대상 아님(세액 0, 오류 아님). 양도일 < 2020-01-01은 지원 범위 밖이라 던진다.
 * 같은 과세기간(양도일 연도)이 아니면 던진다. 양도차손 자산이 양도차익 자산과 섞이면 던진다(§102 미준용 — 통산도 배제도 근거 미확인).
 */
import { calculateProgressiveTax } from "../tax-utils";
import { TRANSFER_FOREIGN_RE } from "../legal-codes/transfer-foreign-realestate";
import { buildAssetRow } from "./convert";
import { allocateBasicDeduction } from "./basic-deduction";
import { attachForeignTax, prepareForeignTax, rowsAfterMethod, withCreditMethod } from "./foreign-tax";
import {
  FOREIGN_RE_MIN_RESIDENCE_YEARS,
  FOREIGN_RE_SUPPORTED_FROM,
  assertAssetsPresent,
  assertDomesticResidenceYears,
  assertNoLossNetting,
  assertSameTaxYear,
  assertSupportedTransferDate,
  assertUniqueAssetIds,
} from "./input-asserts";
import {
  assertSortedBrackets,
  localForeignTaxCredit,
  localIncomeTaxBeforeCredit,
  selectBracket,
  truncateLocalIncomeTax,
} from "./local-tax";
import type {
  ForeignRealEstateConfirmationCode,
  ForeignRealEstateInput,
  ForeignRealEstateRates,
  ForeignRealEstateResult,
} from "./types";

export { FOREIGN_RE_MIN_RESIDENCE_YEARS };

export function calculateForeignRealEstateTransferTax(
  input: ForeignRealEstateInput,
  rates: ForeignRealEstateRates,
): ForeignRealEstateResult {
  assertDomesticResidenceYears(input.domesticResidenceYears);
  assertAssetsPresent(input.assets.length);
  const ids = input.assets.map((a) => a.id);
  assertUniqueAssetIds(ids);
  assertSortedBrackets(rates.brackets);

  // 환율·일자 검증을 거주 판정보다 먼저 — 5년 미만이어도 입력 오류는 막는다
  const prepared = prepareForeignTax(input.foreignTax, ids);
  let rows = input.assets.map((a, i) => buildAssetRow(a, i));
  input.assets.forEach((a, i) => assertSupportedTransferDate(a.transferDate, i));
  assertSameTaxYear(input.assets);
  rows = attachForeignTax(rows, prepared);

  const appliedLawDate = rows.reduce((m, r) => (r.transferDate > m ? r.transferDate : m), rows[0].transferDate);
  const base = {
    domesticResidenceYears: input.domesticResidenceYears,
    capitalGainTotal: rows.reduce((s, r) => s + r.capitalGain, 0),
    longTermDeduction: 0 as const,
    supportedFrom: FOREIGN_RE_SUPPORTED_FROM,
    appliedLawDate,
  };

  if (input.domesticResidenceYears < FOREIGN_RE_MIN_RESIDENCE_YEARS) {
    return {
      ...base,
      rows: rows.map((r) => ({ ...r, foreignTax: { ...r.foreignTax, unappliedKrw: 0 } })),
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
      foreignTaxPaidKrwTotal: 0,
      foreignTaxCreditApplied: 0,
      foreignTaxUnappliedKrw: 0,
      determinedTax: 0,
      localIncomeTaxBase: 0,
      localForeignTaxCredit: 0,
      localIncomeTaxBeforeRounding: 0,
      localIncomeTax: 0,
      totalTax: 0,
      warnings: [],
      appliedRules: [TRANSFER_FOREIGN_RE.SECTION_118_2_SCOPE],
      confirmationNeeded: [],
    };
  }

  rows = rowsAfterMethod(rows, prepared);
  assertNoLossNetting(rows);

  const allocation = allocateBasicDeduction(rows, rates.basicDeductionAnnualLimit);
  rows = allocation.rows;
  const { basicDeduction } = allocation;
  const incomeAmountTotal = rows.reduce((s, r) => s + r.incomeAmount, 0);
  const taxBase = incomeAmountTotal - basicDeduction;
  const bracket = taxBase > 0 ? selectBracket(taxBase, rates.brackets) : undefined;
  const calculatedTax = calculateProgressiveTax(taxBase, rates.brackets);

  let foreignTaxCreditApplied = 0;
  if (prepared?.method === "credit") {
    const credited = withCreditMethod(rows, calculatedTax);
    rows = credited.rows;
    foreignTaxCreditApplied = credited.applied;
  }
  const determinedTax = calculatedTax - foreignTaxCreditApplied;
  const foreignTaxPaidKrwTotal = rows.reduce((s, r) => s + r.foreignTax.paidKrw, 0);
  const foreignTaxUnappliedKrw = rows.reduce((s, r) => s + r.foreignTax.unappliedKrw, 0);

  const localBefore = localIncomeTaxBeforeCredit(taxBase, rates.brackets);
  const localCredit = localForeignTaxCredit(foreignTaxCreditApplied, localBefore);
  const localIncomeTaxBeforeRounding = localBefore - localCredit;
  const localIncomeTax = truncateLocalIncomeTax(localIncomeTaxBeforeRounding);

  // 지방세법 §103의3④(조례 가감 — «제1항에 따른 표준세율» 대상, 국외 세율은 ③)·⑨(⑤ 준용 가중)는 국외 부동산에 반영하지 않는다 — 사용자 결정 완결(2026-11-28 · 재제안 금지)
  const warnings: string[] = [];
  if (foreignTaxUnappliedKrw > 0 && prepared?.method === "credit") {
    warnings.push(
      "외국납부세액이 공제한도(소득세법 §118의6①1호)를 넘는 부분은 공제되지 않으며 같은 조에 이월 규정이 없어 다음 과세기간으로 넘기지 않았습니다.",
    );
  }
  const confirmationNeeded: ForeignRealEstateConfirmationCode[] = [];
  if (prepared?.method === "credit") confirmationNeeded.push("FOREIGN_TAX_CREDIT_FX_DATE_NOT_STATUTORY");
  confirmationNeeded.push("UNSUPPORTED_SITUATIONS_NOT_EVALUATED");

  return {
    ...base,
    rows,
    capitalGainTotal: rows.reduce((s, r) => s + r.capitalGain, 0),
    taxCategory: "foreign_realestate",
    isLiable: true,
    incomeAmountTotal,
    basicDeduction,
    taxBase,
    appliedRate: bracket?.rate ?? 0,
    progressiveDeduction: bracket?.deduction ?? 0,
    calculatedTax,
    ...(prepared ? { foreignTaxMethod: prepared.method } : {}),
    foreignTaxPaidKrwTotal,
    foreignTaxCreditApplied,
    foreignTaxUnappliedKrw,
    determinedTax,
    localIncomeTaxBase: taxBase,
    localForeignTaxCredit: localCredit,
    localIncomeTaxBeforeRounding,
    localIncomeTax,
    totalTax: determinedTax + localIncomeTax,
    warnings,
    appliedRules: [
      TRANSFER_FOREIGN_RE.SECTION_118_2_SCOPE,
      TRANSFER_FOREIGN_RE.SECTION_118_3_TRANSFER_VALUE,
      TRANSFER_FOREIGN_RE.SECTION_118_4_NECESSARY_EXPENSES,
      TRANSFER_FOREIGN_RE.DECREE_178_5_FX_BASE_RATE,
      TRANSFER_FOREIGN_RE.SECTION_118_8_MUTATIS_NO_LTHD,
      TRANSFER_FOREIGN_RE.SECTION_118_7_BASIC_DEDUCTION,
      ...(rows.length > 1 ? [TRANSFER_FOREIGN_RE.SECTION_118_7_DEDUCTION_ORDER] : []),
      TRANSFER_FOREIGN_RE.SECTION_118_5_RATE,
      ...(prepared
        ? [TRANSFER_FOREIGN_RE.SECTION_118_6_FOREIGN_TAX, TRANSFER_FOREIGN_RE.DECREE_178_7_FOREIGN_TAX]
        : []),
      TRANSFER_FOREIGN_RE.LOCAL_103_3_FOREIGN_TAX_BASE,
      TRANSFER_FOREIGN_RE.LOCAL_103_3_3_RATE,
      TRANSFER_FOREIGN_RE.LOCAL_92_1_RATE_TABLE,
      ...(localCredit > 0
        ? [TRANSFER_FOREIGN_RE.LOCAL_SPECIAL_97_3_FOREIGN_TAX_CREDIT, TRANSFER_FOREIGN_RE.LOCAL_103_4_CREDIT_CAP]
        : []),
      TRANSFER_FOREIGN_RE.LOCAL_BASIC_59_ROUNDING,
      TRANSFER_FOREIGN_RE.TREASURY_47_1_ROUND_10,
    ],
    confirmationNeeded,
  };
}
