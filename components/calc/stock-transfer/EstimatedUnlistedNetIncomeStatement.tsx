"use client";

/**
 * EstimatedUnlistedNetIncomeStatement — 비상장 §165④ 순손익 계산서 thin wrapper.
 *
 * [stock-transfer-unlisted-direct-calc] ui.design §4-A
 * PostListing YearColumn(상증령 §54 동일 산식) 재사용 — col="EUTransfer" / "EUAcq".
 *
 * [E-6 (1)] isNetAssetOnly === true 시 컴포넌트 전체 비노출 + 안내 메시지.
 * 데이터 보존 정책: store 키는 그대로 유지, UI만 hidden (실수 토글 보호).
 */

import { YearColumn } from "./PostListingNetIncomeStatement";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import { shouldSkipNetIncome } from "@/lib/tax-engine/stock-transfer/unlisted-flat-adapter";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function EstimatedUnlistedNetIncomeStatement({ form, onChange }: Props) {
  // [E-6 (1)] 순자산 단독 평가 사유 발생 시 NI 24행 양/취 모두 비노출
  if (shouldSkipNetIncome(form)) {
    return (
      <div
        data-testid="eu-ni-hidden-notice"
        className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800"
      >
        ⓘ {UNLISTED_MESSAGES.NET_ASSET_ONLY_HIDDEN}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
          1
        </span>
        <p className="text-sm font-semibold text-sky-800">
          순손익 계산서 (상증령 §54 — 24행 × 양도/취득연도)
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <YearColumn form={form} onChange={onChange} col="EUTransfer" />
        <YearColumn form={form} onChange={onChange} col="EUAcq" />
      </div>
    </div>
  );
}
