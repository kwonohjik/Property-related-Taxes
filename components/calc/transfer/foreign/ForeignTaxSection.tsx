"use client";

/**
 * ForeignTaxSection — 외국납부세액(소득세법 §118의6) · 신고(과세기간) 단위 택일 + 자산별 납부 내역
 *
 * 법 §118의6①: 세액공제(1호) ↔ 필요경비 산입(2호) **중 하나를 선택** — 자산마다 다르게 고를 수 없다(한도 산식의 A·C가 과세기간 총량).
 * 입력 순서상 필요경비 직후에 둔다(필요경비 산입 택일이 양도차익과 직결 · D-6). 토글을 꺼도 입력한 납부 내역은 지우지 않는다(D-4) — ④·⑧이 게이트한다.
 * 납부 환율은 **납부일** 기준환율을 행마다 직접 입력한다 — 비워 두면 양도일 환율로 채우지 않고 ⑧이 막는다(K-13).
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ForeignDatedAmountRows } from "@/components/calc/foreign/ForeignDatedAmountRows";
import { COUNTRY_OPTIONS } from "@/components/calc/foreign/foreign-options";
import type { ForeignMoneyRowForm } from "@/lib/stores/calc-wizard-form-foreign";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { FOREIGN_RE_MAX_ROWS } from "@/lib/api/transfer-foreign-schema";
import { TRANSFER_FOREIGN_RE as RE } from "@/lib/tax-engine/legal-codes/transfer-foreign-realestate";
import { FOREIGN_TAX_FX_DATE_TEXT } from "@/lib/calc/transfer-foreign-messages";
import { FOREIGN_RE_TAX_METHOD_OPTIONS, ROW_EMPTY_HINT, krwOfExact, limitRows } from "./foreign-ui-shared";

interface Props {
  form: TransferFormData;
  onChange: (patch: Partial<TransferFormData>) => void;
}

export function ForeignTaxSection({ form, onChange }: Props) {
  const total = form.foreignAssets.reduce((n, a) => n + a.taxRows.length, 0);

  function setRows(assetIndex: number, next: ForeignMoneyRowForm[]) {
    const prev = form.foreignAssets[assetIndex].taxRows;
    // 전체 상한(`FOREIGN_RE_MAX_ROWS`)은 자산 합계 기준 — 넘기려는 추가는 받지 않는다
    const rows = next.length > prev.length && total >= FOREIGN_RE_MAX_ROWS ? prev : limitRows(next, prev);
    onChange({ foreignAssets: form.foreignAssets.map((a, i) => (i === assetIndex ? { ...a, taxRows: rows } : a)) });
  }

  return (
    <ToneCard tone="violet" title={`외국납부세액 (${RE.SECTION_118_6_FOREIGN_TAX})`} bodyClassName="space-y-3">
      <ToggleCard
        tone="violet"
        checked={form.foreignTaxEnabled}
        onCheckedChange={(foreignTaxEnabled) => onChange({ foreignTaxEnabled })}
        title="외국납부세액 있음"
        description="소재국에서 이 양도소득에 대한 세금을 납부했습니다"
        data-field="foreignTaxEnabled"
        data-testid="foreign-tax-toggle"
      >
        <div className="space-y-4">
          <RadioCardGroup
            name="foreignTaxMethod"
            tone="violet"
            value={form.foreignTaxMethod}
            onChange={(foreignTaxMethod) => onChange({ foreignTaxMethod })}
            options={FOREIGN_RE_TAX_METHOD_OPTIONS}
            aria-label="외국납부세액 처리 방법"
          />
          <p className="text-xs text-muted-foreground">
            두 방법 중 하나를 신고 전체에 적용합니다(자산마다 다르게 고를 수 없습니다). 납부일의 기준환율을 행마다 입력하세요.
          </p>
          <p className="text-xs text-muted-foreground" data-testid="foreign-tax-fx-date-hint">
            {FOREIGN_TAX_FX_DATE_TEXT}
          </p>
          {form.foreignAssets.map((a, i) => {
            const country = COUNTRY_OPTIONS.find((o) => o.value === a.countryCode)?.label.replace(/\s*\([A-Z]{3}\)$/, "");
            const name = [country, a.address.trim()].filter(Boolean).join(" · ");
            return (
              <div key={a.id} className="space-y-1" data-testid={`foreign-tax-rows-${i}`}>
                <p className="text-sm font-medium">
                  국외자산 {i + 1}
                  {name && <span className="ml-1 font-normal text-muted-foreground">({name})</span>}
                </p>
                <ForeignDatedAmountRows
                  rows={a.taxRows}
                  currencyCode={a.currency}
                  onChange={(next) => setRows(i, next)}
                  krwOf={krwOfExact}
                  fieldPrefix={`foreignTaxRow.${i}`}
                  labels={{
                    dateHeader: "납부일",
                    amountHeader: "납부세액",
                    rowNoun: "납부 내역",
                    emptyText: ROW_EMPTY_HINT,
                    addText: "+ 납부 내역 추가",
                  }}
                />
              </div>
            );
          })}
          {total >= FOREIGN_RE_MAX_ROWS && (
            <p className="text-xs text-muted-foreground">납부 내역은 전체 {FOREIGN_RE_MAX_ROWS}행까지 입력할 수 있습니다.</p>
          )}
        </div>
      </ToggleCard>
    </ToneCard>
  );
}
