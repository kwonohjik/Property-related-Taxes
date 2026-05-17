"use client";

/**
 * Step 1 — 자산·시장·대주주
 *
 * 입력 순서 = 엔진 계산 로직 순서 (feedback_ui_order_follows_logic):
 *   시장 분류 → 회사 분류 → 대주주 판정 → 기타자산 → 취득원인 →
 *   양도일·취득일 → 주식수·발행주식총수
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { MarketTypeBlock } from "@/components/calc/stock-transfer/MarketTypeBlock";
import { MajorShareholderBlock } from "@/components/calc/stock-transfer/MajorShareholderBlock";
import { CompanyTypeBlock } from "@/components/calc/stock-transfer/CompanyTypeBlock";
import { OtherAssetBlock } from "@/components/calc/stock-transfer/OtherAssetBlock";
import { AcquisitionCauseBlock } from "@/components/calc/stock-transfer/AcquisitionCauseBlock";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface Step1Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800 mb-4">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">
        {n}
      </span>
      {title}
    </h2>
  );
}

export function Step1({ form, onChange }: Step1Props) {
  return (
    <div className="space-y-8">
      {/* ① 시장 분류 */}
      <section>
        <SectionTitle n={1} title="시장 유형" />
        <MarketTypeBlock
          marketType={form.marketType}
          onChange={(marketType) => onChange({ marketType })}
        />
      </section>

      {/* ② 회사 분류 */}
      <section>
        <SectionTitle n={2} title="회사 규모 / K-OTC / 벤처기업" />
        <CompanyTypeBlock form={form} onChange={onChange} />
      </section>

      {/* ③ 대주주 판정 */}
      <section>
        <SectionTitle n={3} title="대주주 판정 (시행령 §157)" />
        <MajorShareholderBlock form={form} onChange={onChange} />
      </section>

      {/* ④ 기타자산 §94①4 */}
      {(form.marketType === "other_asset" ||
        form.isQualifyingBlockShareholder ||
        form.isHeavyRealEstateForRate) && (
        <section>
          <SectionTitle n={4} title="기타자산 해당 여부 (§94①4)" />
          <OtherAssetBlock form={form} onChange={onChange} />
        </section>
      )}

      {/* ⑤ 취득원인 + 단기 기산점 */}
      <section>
        <SectionTitle n={5} title="취득원인 (단기 30% 기산점 §104②)" />
        <AcquisitionCauseBlock form={form} onChange={onChange} />
      </section>

      {/* ⑥ 일자·수량 */}
      <section>
        <SectionTitle n={6} title="양도·취득 일자 및 주식수" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FieldCard label="취득일" required hint="실제 취득일 (YYYY-MM-DD)">
            <DateInput
              value={form.acquisitionDate}
              onChange={(v) => onChange({ acquisitionDate: v })}
            />
          </FieldCard>
          <FieldCard label="양도일" required hint="실제 양도일 (YYYY-MM-DD)">
            <DateInput
              value={form.transferDate}
              onChange={(v) => onChange({ transferDate: v })}
            />
          </FieldCard>
          <FieldCard label="양도 주식수" required hint="이번 거래에서 양도하는 주식수 (주)">
            <DecimalInput
              value={form.shareCount}
              onChange={(v) => onChange({ shareCount: v })}
              placeholder="5000"
            />
          </FieldCard>
          <FieldCard label="발행주식 총수" required hint="해당 법인의 발행주식 총수 (주)">
            <DecimalInput
              value={form.totalIssuedShares}
              onChange={(v) => onChange({ totalIssuedShares: v })}
              placeholder="100000"
            />
          </FieldCard>
        </div>
      </section>
    </div>
  );
}
