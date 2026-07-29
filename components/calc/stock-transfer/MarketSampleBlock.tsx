"use client";

/**
 * MarketSampleBlock — R-1' 매매사례가액 입력 블록 (영§176의2③1호)
 *
 * 비상장·기타자산 전용. 취득·양도 양쪽 매매사례 입력 가능.
 * ±3개월 (90일) 초과 시 warning, 특수관계인 의심 keyword 안내.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface MarketSampleBlockProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  isListed: boolean;
}

export function MarketSampleBlock({ form, onChange, isListed }: MarketSampleBlockProps) {
  return (
    <div className="space-y-4">
      {isListed && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-4 py-3 text-sm text-rose-700">
          상장주식에는 매매사례가액을 적용할 수 없습니다 (영§176의2③1호 단서 — 주권상장법인 주식등 제외). 비상장·기타자산 전용.
        </div>
      )}

      {/* 취득 매매사례 (amber tone) */}
      <ToneCard tone="amber" sectionNum={1} title="취득 매매사례가액 (영§176의2③1호)" bodyClassName="space-y-3" noDark>
        <CurrencyInput
          label="1주당 취득 매매사례가액"
          hint="유사 매매사례 가액 (원) — 취득일 전후 3개월 이내"
          value={form.acquisitionMarketSamplePrice}
          onChange={(v) => onChange({ acquisitionMarketSamplePrice: v })}
        />
        <FieldCard label="사례 거래일" hint="취득일 ±3개월 권장 (초과 시 warning)">
          <DateInput
            value={form.acquisitionMarketSampleDate}
            onChange={(v) => onChange({ acquisitionMarketSampleDate: v })}
          />
        </FieldCard>
        <FieldCard label="거래상대 (메타)" hint="특수관계인 의심 keyword 자동 검출 — §98① 부당거래 검토용">
          <input
            type="text"
            className="w-full rounded border border-amber-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            value={form.acquisitionMarketSampleCounterparty}
            onChange={(e) => onChange({ acquisitionMarketSampleCounterparty: e.target.value })}
            placeholder="거래상대 명의·관계 (예: 제3자, 친족 등)"
          />
        </FieldCard>
      </ToneCard>

      {/* 양도 매매사례 (emerald tone) */}
      <ToneCard tone="emerald" sectionNum={2} title="양도 매매사례가액 (선택)" bodyClassName="space-y-3" noDark>
        <p className="text-xs text-emerald-700/80">
          입력 시 1주당 양도가액 대신 우선 적용됩니다.
        </p>
        <CurrencyInput
          label="1주당 양도 매매사례가액"
          hint="유사 매매사례 가액 (원) — 양도일 전후 3개월 이내"
          value={form.transferMarketSamplePrice}
          onChange={(v) => onChange({ transferMarketSamplePrice: v })}
        />
        <FieldCard label="사례 거래일">
          <DateInput
            value={form.transferMarketSampleDate}
            onChange={(v) => onChange({ transferMarketSampleDate: v })}
          />
        </FieldCard>
        <FieldCard label="거래상대 (메타)">
          <input
            type="text"
            className="w-full rounded border border-emerald-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            value={form.transferMarketSampleCounterparty}
            onChange={(e) => onChange({ transferMarketSampleCounterparty: e.target.value })}
            placeholder="거래상대 명의·관계"
          />
        </FieldCard>
      </ToneCard>
    </div>
  );
}
