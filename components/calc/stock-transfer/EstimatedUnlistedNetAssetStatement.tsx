"use client";

/**
 * EstimatedUnlistedNetAssetStatement — 비상장 §165④ 순자산가액 계산서 thin wrapper.
 *
 * [stock-transfer-unlisted-direct-calc] ui.design §4-B
 * PostListing YearColumn(상증령 §55 동일 산식) 재사용 — col="EUTransfer" / "EUAcq".
 *
 * isNetAssetOnly === true 시에도 NA는 항상 노출 (순자산 단독 평가 자체가 NA 사용).
 */

import { YearColumn } from "./PostListingNetAssetStatement";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function EstimatedUnlistedNetAssetStatement({ form, onChange }: Props) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">
          2
        </span>
        <p className="text-sm font-semibold text-emerald-800">
          순자산가액 계산서 (소령 §165④1 나목 — 양도/취득연도)
        </p>
      </div>
      <p className="text-xs text-amber-700 bg-amber-50/70 border border-amber-200 rounded px-2 py-1.5">
        {UNLISTED_MESSAGES.GOODWILL_NOTICE}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <YearColumn form={form} onChange={onChange} col="EUTransfer" />
        <YearColumn form={form} onChange={onChange} col="EUAcq" />
      </div>
    </div>
  );
}
