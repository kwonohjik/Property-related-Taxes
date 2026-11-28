"use client";

/**
 * 과세표준 → 산출세액 → 외국납부세액 → 지방소득세 → 총 납부세액 (소득세법 §118의5~§118의7 · 지방세법 §103·§103의3·§92① · 지방세특례제한법 §97③).
 *
 * 순서 = 엔진 순서(`calculate.ts`): 양도소득금액 합계 → 기본공제 §118의7① → 과세표준 → §55① 세율 1회 → 산출세액 →
 * 외국납부세액 세액공제(§118의6①1호) → 결정세액 → 개인지방소득세(§92① 세율 − 지특법 §97③ 공제, 10원 미만 절사).
 * 지방소득세 «산출세액»은 결과가 따로 싣지 않아 `끝수 처리 전 금액 + §97③ 공제`로 되짚는다(둘 다 엔진 값).
 */
import { TRANSFER_FOREIGN_RE } from "@/lib/tax-engine/legal-codes/transfer-foreign-realestate";
import type { ForeignRealEstateResult } from "@/lib/tax-engine/foreign-realestate";
import { AmountRow, FxRow, NoteRow, SectionBox, fmt, pctText } from "./foreign-result-parts";

/** 소득세 세율 → 지방세법 §92① 세율(10분의 1) 표기 */
const localRateText = (rate: number) => pctText(rate / 10);

export function ForeignTaxCalcSection({ result }: { result: ForeignRealEstateResult }) {
  const r = result;
  const multi = r.rows.length >= 2;
  const creditMethod = r.foreignTaxMethod === "credit";
  const creditRows = creditMethod ? r.rows.filter((row) => row.foreignTax.paidKrw > 0) : [];
  const localBefore = r.localIncomeTaxBeforeRounding + r.localForeignTaxCredit;
  return (
    <SectionBox title="과세표준·세액 계산" testId="foreign-tax-calc">
      <AmountRow
        label="양도소득금액"
        formula={multi ? r.rows.map((row) => `${row.id} ${fmt(row.incomeAmount)}`).join(" + ") : undefined}
        amount={r.incomeAmountTotal}
        testId="foreign-income-total"
      />
      <AmountRow
        label={`기본공제 (${TRANSFER_FOREIGN_RE.SECTION_118_7_BASIC_DEDUCTION})`}
        formula={
          multi
            ? `과세기간(양도일 연도)당 1회 — ${TRANSFER_FOREIGN_RE.SECTION_118_7_DEDUCTION_ORDER}에 따라 먼저 양도한 자산부터 공제`
            : "과세기간(양도일 연도)당 1회, 국내 양도소득 기본공제와 별도 한도"
        }
        amount={r.basicDeduction}
        testId="foreign-basic-deduction"
      />
      <AmountRow
        label="과세표준"
        formula={`양도소득금액 ${fmt(r.incomeAmountTotal)} − 기본공제 ${fmt(r.basicDeduction)}`}
        amount={r.taxBase}
        strong
        testId="foreign-tax-base"
      />
      <AmountRow
        label={`산출세액 (${TRANSFER_FOREIGN_RE.SECTION_118_5_RATE} — 소득세 기본세율)`}
        formula={r.taxBase > 0 ? `과세표준 ${fmt(r.taxBase)} × 세율 ${pctText(r.appliedRate)} − 누진공제 ${fmt(r.progressiveDeduction)}` : "과세표준이 없어 산출세액은 없습니다"}
        amount={r.calculatedTax}
        strong
        testId="foreign-calculated-tax"
      />

      {r.foreignTaxMethod === "expense" && (
        <NoteRow label={`외국납부세액 — 필요경비 산입방법 (${TRANSFER_FOREIGN_RE.SECTION_118_6_FOREIGN_TAX})`} testId="foreign-ftc-expense-note">
          외국납부세액을 양도차익에서 차감해 계산했으므로 산출세액에서 따로 공제하지 않습니다.
        </NoteRow>
      )}
      {creditMethod &&
        creditRows.map((row) => (
          <div key={row.id} className="mt-1 rounded-lg border border-dashed border-border p-2" data-testid={`foreign-ftc-${row.id}`}>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              외국납부세액 세액공제방법 — {row.id} ({TRANSFER_FOREIGN_RE.SECTION_118_6_FOREIGN_TAX} · {TRANSFER_FOREIGN_RE.DECREE_178_7_FOREIGN_TAX})
            </p>
            {row.foreignTax.items.map((it, j) => (
              <FxRow key={j} label={`외국납부세액 ${j + 1}`} item={it} />
            ))}
            <AmountRow
              label="공제한도"
              formula={`산출세액 ${fmt(r.calculatedTax)} × (해당 국외자산 양도소득금액 ${fmt(row.incomeAmount)}) / (국외자산 양도소득금액 합계 ${fmt(r.incomeAmountTotal)})`}
              amount={row.foreignTax.limit}
              testId={`foreign-ftc-limit-${row.id}`}
            />
            <AmountRow
              label="공제액"
              formula={`외국납부세액 ${fmt(row.foreignTax.paidKrw)}과 공제한도 ${fmt(row.foreignTax.limit)} 중 작은 금액`}
              amount={row.foreignTax.applied}
              strong
              testId={`foreign-ftc-applied-${row.id}`}
            />
            {row.foreignTax.unappliedKrw > 0 && (
              <AmountRow
                label="공제받지 못한 외국납부세액"
                formula="한도를 넘는 부분 — 같은 조에 이월 규정이 없어 다음 과세기간으로 넘기지 않았습니다"
                amount={row.foreignTax.unappliedKrw}
                tone="warn"
                testId={`foreign-ftc-unapplied-${row.id}`}
              />
            )}
          </div>
        ))}
      <AmountRow
        label="결정세액"
        formula={creditMethod ? `산출세액 ${fmt(r.calculatedTax)} − 외국납부세액 공제 ${fmt(r.foreignTaxCreditApplied)}` : undefined}
        amount={r.determinedTax}
        strong
        testId="foreign-determined-tax"
      />

      <div className="mt-2 border-t border-border pt-2">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">
          개인지방소득세 ({TRANSFER_FOREIGN_RE.LOCAL_103_3_FOREIGN_TAX_BASE} · {TRANSFER_FOREIGN_RE.LOCAL_103_3_3_RATE})
        </p>
        <AmountRow
          label={`지방소득세 산출세액 (${TRANSFER_FOREIGN_RE.LOCAL_92_1_RATE_TABLE})`}
          formula={
            r.localIncomeTaxBase > 0
              ? `과세표준 ${fmt(r.localIncomeTaxBase)} × 세율 ${localRateText(r.appliedRate)} − 누진공제 ${fmt(r.progressiveDeduction / 10)}`
              : "과세표준이 없어 지방소득세 산출세액은 없습니다"
          }
          amount={localBefore}
          testId="foreign-local-before"
        />
        {r.localForeignTaxCredit > 0 && (
          <AmountRow
            label={`외국납부세액 공제 (${TRANSFER_FOREIGN_RE.LOCAL_SPECIAL_97_3_FOREIGN_TAX_CREDIT})`}
            formula={`소득세 외국납부세액 공제액 ${fmt(r.foreignTaxCreditApplied)}의 10분의 1, 10원 미만 절사 (지방소득세 산출세액 한도 — ${TRANSFER_FOREIGN_RE.LOCAL_103_4_CREDIT_CAP})`}
            amount={r.localForeignTaxCredit}
            testId="foreign-local-credit"
          />
        )}
        <AmountRow
          label="지방소득세"
          formula={`10원 미만 절사 (${TRANSFER_FOREIGN_RE.LOCAL_BASIC_59_ROUNDING} → ${TRANSFER_FOREIGN_RE.TREASURY_47_1_ROUND_10})`}
          amount={r.localIncomeTax}
          strong
          testId="foreign-local-tax"
        />
      </div>

      <div className="mt-2 border-t border-border pt-2">
        <AmountRow
          label="총 납부세액"
          formula={`결정세액 ${fmt(r.determinedTax)} + 지방소득세 ${fmt(r.localIncomeTax)}`}
          amount={r.totalTax}
          strong
          testId="foreign-total-tax"
        />
      </div>
    </SectionBox>
  );
}
