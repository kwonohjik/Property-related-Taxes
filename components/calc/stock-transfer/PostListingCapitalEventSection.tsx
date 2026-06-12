"use client";

/**
 * [B-5] PostListingCapitalEventSection — 상장일 이후 1개월 종가평균 증자·합병 기간 조정
 *
 * 상증령 §52의2②2호(§99①3·§63①1가목 준용 해석): 평가기간 중 증자·합병 발생 시
 * 발생일 이전 종가만 평균(발생일·이후 제외). 환산주식수 아닌 기간 절단.
 * ★ §165⑤ proxy 적용은 해석 — 명문·예규 미확인.
 *
 * 절단 미리보기는 엔진 헬퍼 calcClosingAvgWithEvent 직접 사용(UI 재계산 금지).
 */

import { useMemo } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { dayOfWeek } from "./PostListingClosingPriceTable";
import { calcClosingAvgWithEvent } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface Props {
  form: Pick<
    StockTransferFormData,
    | "listingPriceDates"
    | "listingPriceClosing"
    | "listingPriceBasisDate"
    | "listingPriceHasIncrease"
    | "listingPriceIncreaseDate"
  >;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function PostListingCapitalEventSection({ form, onChange }: Props) {
  // 절단 미리보기 — 엔진 헬퍼 단일 진실 [[feedback_ui_engine_dual_truth_avoidance]]
  const preview = useMemo(() => {
    const dates = form.listingPriceDates ?? [];
    const closes = dates.map((d, i) => {
      const dow = dayOfWeek(d);
      if (dow === 0 || dow === 6) return 0;
      return parseAmount(form.listingPriceClosing?.[i] || "0");
    });
    return calcClosingAvgWithEvent({
      dates,
      closes,
      basisDate: form.listingPriceBasisDate ?? "",
      hasIncrease: form.listingPriceHasIncrease === true,
      increaseDate: form.listingPriceIncreaseDate,
    });
  }, [
    form.listingPriceDates,
    form.listingPriceClosing,
    form.listingPriceBasisDate,
    form.listingPriceHasIncrease,
    form.listingPriceIncreaseDate,
  ]);

  return (
    <ToggleCard
      tone="rose"
      title="평가기간 중 증자·합병 발생 (상증령 §52의2②)"
      description="상장일 이후 1개월 종가 산정 기간 중 증자·합병이 있으면 ON — 발생일 이전 종가만 평균합니다(발생일·이후 제외). 권리락 등 가격 불연속 반영."
      checked={form.listingPriceHasIncrease === true}
      onCheckedChange={(v) => onChange({ listingPriceHasIncrease: v })}
    >
      <div className="space-y-2">
        <FieldCard label="증자·합병 발생일" hint="상장일 이후 1개월 윈도우 내. 이 날짜 이전 종가만 평균에 포함됩니다.">
          <DateInput
            value={form.listingPriceIncreaseDate}
            onChange={(v) => onChange({ listingPriceIncreaseDate: v })}
          />
        </FieldCard>
        {/* 절단 미리보기 */}
        {form.listingPriceIncreaseDate && preview.truncation && (
          <div className="rounded border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-700">
            기간 조정 후 평균 {preview.avg.toLocaleString()} (포함 {preview.truncation.includedDays}거래일 · 제외{" "}
            {preview.truncation.excludedDays}일)
          </div>
        )}
        {form.listingPriceIncreaseDate && preview.warning && (
          <div className="rounded border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-700">
            {preview.warning}
          </div>
        )}
        <p className="text-xs text-amber-700">
          ⓘ §165⑤ 환산의 상장일 종가평균에 §52의2② 기간 조정 적용은 해석에 따른 것으로, 명문·예규로 확정되지
          않았습니다.
        </p>
      </div>
    </ToggleCard>
  );
}
