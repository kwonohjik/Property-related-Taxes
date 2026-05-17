"use client";

/**
 * PostListingValuationCard — 취득 후 상장 환산취득가 (Step 2)
 *
 * 소령 §165⑤ 본문 — 취득 당시 비상장 주식이 양도 시점엔 상장된 경우:
 *   1주당 취득기준시가 = 상장일 직전 1주당 평가가액 × (취득일 직전 1주당 평가가액 / 상장일 직전 1주당 평가가액)
 *
 * 비상장 보충적 평가 (3시점: 양도연도·상장연도·취득연도):
 *   1주당 평가 = 순손익가치×3/5 + 순자산가치×2/5 (일반)
 *              = 순손익가치×2/5 + 순자산가치×3/5 (부동산과다보유 가중치 반전)
 *
 * 소칙 §81④ — 취득일·상장일 평가액 동일 시 월할 가산
 *
 * 사례 48 본칙 anchor:
 *   상장일 직전 1주당 평가 = 61,570×3/5 + 5,352×2/5 = 39,083 (→ 8,001)
 *   취득일 직전 1주당 평가 = 44,520×3/5 + 4,348×2/5 = 28,451 (→ 5,824)
 *   취득가 = 5,824 × 5,000주 = 29,120,000
 */

import { useMemo } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface PostListingValuationCardProps {
  form: Pick<
    StockTransferFormData,
    | "acquiredBeforeListing"
    | "tradingHaltAtTransfer"
    | "listingDate"
    | "listingDatePriceAvg1Month"
    | "transferDatePriceAvg1Month"
    | "listingYearNetIncomePerShare"
    | "listingYearNetAssetPerShare"
    | "acquisitionYearNetIncomePerShare"
    | "acquisitionYearNetAssetPerShare"
    | "shareCount"
    | "isHeavyRealEstateForValuation"
  >;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

function calcWeightedAvg(
  netIncome: number,
  netAsset: number,
  isHeavyRE: boolean
): number {
  if (isHeavyRE) {
    // 부동산과다보유 가중치 반전 (소령 §165⑤ 단서)
    return Math.floor((netIncome * 2) / 5 + (netAsset * 3) / 5);
  }
  return Math.floor((netIncome * 3) / 5 + (netAsset * 2) / 5);
}

export function PostListingValuationCard({ form, onChange }: PostListingValuationCardProps) {
  // 취득기준시가 계산 미리보기 (useMemo — store 미러링 금지)
  const preview = useMemo(() => {
    const listingAvg = parseAmount(form.listingDatePriceAvg1Month);
    const listingNI = parseAmount(form.listingYearNetIncomePerShare);
    const listingNA = parseAmount(form.listingYearNetAssetPerShare);
    const acqNI = parseAmount(form.acquisitionYearNetIncomePerShare);
    const acqNA = parseAmount(form.acquisitionYearNetAssetPerShare);
    const shareCount = parseInt(form.shareCount || "0", 10);

    if (!listingAvg || !listingNI || !listingNA || !acqNI || !acqNA) return null;

    const listingEval = calcWeightedAvg(listingNI, listingNA, form.isHeavyRealEstateForValuation);
    const acqEval = calcWeightedAvg(acqNI, acqNA, form.isHeavyRealEstateForValuation);

    if (!listingEval) return null;

    // 환산비율 = 취득일 직전 평가 / 상장일 직전 평가
    const ratio = acqEval / listingEval;
    // 1주당 취득기준시가 = 상장일 직전 1개월 종가평균 × 환산비율
    const perShareStdPrice = Math.floor(listingAvg * ratio);
    const totalAcqPrice = perShareStdPrice * shareCount;

    return {
      listingEval,
      acqEval,
      ratio: ratio.toFixed(4),
      perShareStdPrice,
      totalAcqPrice,
    };
  }, [
    form.listingDatePriceAvg1Month,
    form.listingYearNetIncomePerShare,
    form.listingYearNetAssetPerShare,
    form.acquisitionYearNetIncomePerShare,
    form.acquisitionYearNetAssetPerShare,
    form.shareCount,
    form.isHeavyRealEstateForValuation,
  ]);

  return (
    <ToggleCard
      checked={form.acquiredBeforeListing}
      onCheckedChange={(v) => onChange({ acquiredBeforeListing: v })}
      title="취득 후 상장 — 환산취득가 (소령 §165⑤)"
      description="취득 당시 비상장이었으나 양도 시점에 상장된 주식 — 상장일 직전 평가가액 기반 환산"
      tone="amber"
    >
      <div className="mt-4 space-y-4">
        {/* violet 안내 카드 (§165⑤ 산식 설명) */}
        <div className="rounded-lg border border-violet-200 bg-violet-50/70 px-4 py-3 text-sm">
          <p className="font-semibold text-violet-800 mb-2">환산 산식 (소령 §165⑤ 본문)</p>
          <div className="text-violet-700 space-y-1 text-xs font-mono">
            <p>1주당 취득기준시가 = 상장일직전1개월종가평균 × (취득연도 평가가액 ÷ 상장연도 평가가액)</p>
            <p>1주당 평가가액 = 순손익가치×3/5 + 순자산가치×2/5</p>
          </div>
        </div>

        {/* 상장일 */}
        <FieldCard label="상장일" required hint="최초 상장 기준일 (YYYY-MM-DD)">
          <DateInput
            value={form.listingDate}
            onChange={(v) => onChange({ listingDate: v })}
          />
        </FieldCard>

        {/* 상장일 직전 1개월 종가평균 (§99①3) */}
        <CurrencyInput
          label="상장일 직전 1개월 종가 평균"
          required
          hint="상장일 직전 1개월간의 평균 종가 (원, §99①3)"
          value={form.listingDatePriceAvg1Month}
          onChange={(v) => onChange({ listingDatePriceAvg1Month: v })}
          placeholder="8,001"
        />

        {/* 상장연도 비상장 보충적 평가 */}
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800 mb-3">
            상장연도 비상장 보충적 평가 (소령 §165⑤ 분모 기준)
          </p>
          <div className="space-y-3">
            <CurrencyInput
              label="상장연도 1주당 순손익가치"
              required
              hint="직전 사업연도 기준 (원)"
              value={form.listingYearNetIncomePerShare}
              onChange={(v) => onChange({ listingYearNetIncomePerShare: v })}
              placeholder="61,570"
            />
            <CurrencyInput
              label="상장연도 1주당 순자산가치"
              required
              hint="직전 사업연도 기준 (원)"
              value={form.listingYearNetAssetPerShare}
              onChange={(v) => onChange({ listingYearNetAssetPerShare: v })}
              placeholder="5,352"
            />
          </div>
        </div>

        {/* 취득연도 비상장 보충적 평가 */}
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800 mb-3">
            취득연도 비상장 보충적 평가 (소령 §165⑤ 분자 기준)
          </p>
          <div className="space-y-3">
            <CurrencyInput
              label="취득연도 1주당 순손익가치"
              required
              hint="직전 사업연도 기준 (원)"
              value={form.acquisitionYearNetIncomePerShare}
              onChange={(v) => onChange({ acquisitionYearNetIncomePerShare: v })}
              placeholder="44,520"
            />
            <CurrencyInput
              label="취득연도 1주당 순자산가치"
              required
              hint="직전 사업연도 기준 (원)"
              value={form.acquisitionYearNetAssetPerShare}
              onChange={(v) => onChange({ acquisitionYearNetAssetPerShare: v })}
              placeholder="4,348"
            />
          </div>
        </div>

        {/* 환산 미리보기 (useMemo 결과) */}
        {preview && (
          <div className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 text-sm">
            <p className="font-semibold text-violet-800 mb-2">환산취득가 미리보기</p>
            <div className="space-y-1 text-violet-700 text-xs">
              <p>
                상장연도 평가가액 = {form.listingYearNetIncomePerShare || "-"}×3/5 +{" "}
                {form.listingYearNetAssetPerShare || "-"}×2/5 ={" "}
                <strong>{preview.listingEval.toLocaleString()}</strong>
              </p>
              <p>
                취득연도 평가가액 = {form.acquisitionYearNetIncomePerShare || "-"}×3/5 +{" "}
                {form.acquisitionYearNetAssetPerShare || "-"}×2/5 ={" "}
                <strong>{preview.acqEval.toLocaleString()}</strong>
              </p>
              <p>
                환산비율 = {preview.acqEval.toLocaleString()} ÷ {preview.listingEval.toLocaleString()}{" "}
                = <strong>{preview.ratio}</strong>
              </p>
              <p>
                1주당 취득기준시가 = 종가평균 {parseAmount(form.listingDatePriceAvg1Month).toLocaleString()} ×{" "}
                {preview.ratio} = <strong>{preview.perShareStdPrice.toLocaleString()}</strong>
              </p>
              {parseInt(form.shareCount || "0", 10) > 0 && (
                <p className="text-violet-900 font-medium">
                  취득가액 = {preview.perShareStdPrice.toLocaleString()} ×{" "}
                  {parseInt(form.shareCount, 10).toLocaleString()}주 ={" "}
                  <strong>{preview.totalAcqPrice.toLocaleString()}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        {/* 거래정지 토글 (§165③) */}
        <ToggleCard
          checked={form.tradingHaltAtTransfer}
          onCheckedChange={(v) => onChange({ tradingHaltAtTransfer: v })}
          title="양도일 거래정지·관리종목 지정"
          description="소령 §165③ — 거래정지 시 1개월 종가평균 대신 비상장 보충 평가 사용"
          tone="rose"
        />
      </div>
    </ToggleCard>
  );
}
