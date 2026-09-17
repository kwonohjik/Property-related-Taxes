"use client";

/**
 * ForeignStockExpenseBlock — 해외주식 **3단계**: 필요경비(§118의4) · 외국납부세액(§118의6)
 *
 * 계획서: `docs/00-pm/foreign-stock-wizard-step-realign.plan.md` §3 · Q-2
 * 검증 짝: `validateStep3Foreign`(외국납부세액 · 통화 · 납세일 기준환율)
 *
 * 🔑 **외국납부세액은 필요경비 바로 뒤**다(Q-2) — 「세액공제 ↔ 필요경비 산입」 택일이
 *   필요경비와 직결되고, 엔진도 STEP 5 에서 필요경비 산입을 먼저 처리한다(`foreign-stock.ts`).
 *
 * ⛔ 종전 블록의 「섹션 7: 신고일」은 **가져오지 않는다** — 3단계 신고 유형 섹션이 같은
 *   `form.filingDate` 를 이미 렌더한다(`Step3.tsx:447`). 옮기면 한 화면에 같은 칸이 두 번 뜬다.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CURRENCY_OPTIONS } from "./currency-options";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import {
  SectionBox,
  FOREIGN_TAX_METHOD_OPTIONS,
  type ForeignStockSectionProps,
} from "./foreign-stock-shared";

export function ForeignStockExpenseBlock({ form, onChange }: ForeignStockSectionProps) {
  const foreignTaxMethod = form.foreignTaxMethod;                // factory: "credit"

  return (
    <div className="space-y-5">
      {/* ── 섹션 5: 필요경비 (§118의4) ── */}
      <SectionBox label="필요경비 (§118의4)" tone="sky">
        <FieldCard
          label="자본적지출액 (외화)"
          hint="주식 가치를 높이기 위한 자본적 지출 (외화). 없으면 비워두세요."
          unit={form.transferCurrencyCode || "USD"}
        >
          <DecimalInput
            value={form.capitalExpenditureForeign}
            onChange={(v) => onChange({ capitalExpenditureForeign: v })}
            placeholder="없으면 비워두세요"
          />
        </FieldCard>

        <FieldCard
          label="양도비 (외화)"
          hint="거래 수수료·세금·기타 양도 비용 (외화). 없으면 비워두세요."
          unit={form.transferCurrencyCode || "USD"}
        >
          <DecimalInput
            value={form.transferCostForeign}
            onChange={(v) => onChange({ transferCostForeign: v })}
            placeholder="없으면 비워두세요"
          />
        </FieldCard>
      </SectionBox>

      {/* ── 섹션 6: 외국납부세액 (§118의6) ── */}
      <ToggleCard
        title="외국납부세액 있음 (§118의6)"
        description="해외에서 자본이득세 등을 납부한 경우 세액공제 또는 필요경비 산입을 선택할 수 있습니다."
        checked={form.hasForeignTax}
        onCheckedChange={(v) => onChange({ hasForeignTax: v })}
        tone="violet"
        trailing={
          <span className="text-xs text-violet-600 font-medium bg-violet-50 px-2 py-0.5 rounded">
            §118의6
          </span>
        }
      >
        <div className="space-y-3 mt-3">
          <FieldCard label="납부세액 통화" required>
            <select
              value={form.foreignTaxCurrencyCode}
              onChange={(e) => onChange({ foreignTaxCurrencyCode: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FieldCard>

          <FieldCard
            label="외국납부세액 (외화)"
            hint="실제 해외에서 납부한 세액 (외화 금액)"
            required
            unit={form.foreignTaxCurrencyCode || "USD"}
          >
            <DecimalInput
              value={form.foreignTaxPaidForeign}
              onChange={(v) => onChange({ foreignTaxPaidForeign: v })}
              placeholder="납부한 세액 (외화)"
            />
          </FieldCard>

          <FieldCard
            label="납세일 기준환율"
            hint="외국납부세액 납부일 기준 환율 (원/외화). §178의5"
            required
            unit={`KRW/${form.foreignTaxCurrencyCode || "USD"}`}
          >
            <DecimalInput
              value={form.foreignTaxExchangeRate}
              onChange={(v) => onChange({ foreignTaxExchangeRate: v })}
              placeholder="납부일 기준환율"
            />
          </FieldCard>

          <FieldCard
            label="처리 방법 선택"
            hint="이 신고 전체에 적용됩니다 — §118의6①은 과세기간 단위 택일이라 종목마다 다르게 고를 수 없습니다."
            required
          >
            <RadioCardGroup
              name="foreignTaxMethod"
              value={foreignTaxMethod}
              onChange={(v) => onChange({ foreignTaxMethod: v as "credit" | "expense" })}
              tone="violet"
              layout="stack"
              options={FOREIGN_TAX_METHOD_OPTIONS}
            />
          </FieldCard>
        </div>
      </ToggleCard>
    </div>
  );
}
