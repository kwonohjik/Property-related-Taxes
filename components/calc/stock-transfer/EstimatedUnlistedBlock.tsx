"use client";

/**
 * EstimatedUnlistedBlock — 비상장 보충적 평가 입력 블록 (PR-2)
 *
 * 시행령 §165④1: 가중평균 (순손익×3 + 순자산×2)÷5 + 80% 하한
 * 시행령 §165④3: 순자산 단독 4사유
 * 시행령 §165⑤: 부동산과다보유법인 가중치 반전 (isHeavyRealEstateForValuation)
 *
 * 입력값 규약:
 *   NetIncomePerShare = 1주당 순손익가치 (= 1주당 순손익액 ÷ 10% 이미 반영한 값)
 *   NetAssetPerShare  = 1주당 순자산가치
 */

import { useMemo } from "react";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface EstimatedUnlistedBlockProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

const NET_ASSET_ONLY_REASON_OPTIONS = [
  { value: "", label: "해당 없음", description: "가중평균 (§165④1 본칙) 적용" },
  {
    value: "liquidation_or_owner_death",
    label: "가목: 청산 진행 또는 사업자 사망",
    description: "청산 중인 법인 또는 사업자가 사망한 경우",
  },
  {
    value: "no_business_or_short_or_closed",
    label: "나목: 사업 개시 전·1년 미만·휴폐업",
    description: "순손익가치 산출이 불가능한 경우",
  },
  {
    value: "stock_holding_company",
    label: "다목: 주식가액 80% 이상 (지주회사형)",
    description: "주식·출자지분이 순자산의 80% 이상인 법인",
  },
  {
    value: "remaining_term_under_3y",
    label: "라목: 잔여 존속기한 3년 이내",
    description: "정관상 존속기한이 3년 이내로 남은 법인",
  },
];

export function EstimatedUnlistedBlock({ form, onChange }: EstimatedUnlistedBlockProps) {
  const netAssetOnlyReason = form.netAssetOnlyReason || "";
  const isNetAssetOnly = netAssetOnlyReason !== "";
  const isHeavyRE = form.isHeavyRealEstateForValuation;

  // 가중치 안내
  const niWeight = isHeavyRE ? "2/5" : "3/5";
  const naWeight = isHeavyRE ? "3/5" : "2/5";

  // 양도기준시가 미리보기 (useMemo — useEffect→store 미러링 금지)
  const transferStdPricePreview = useMemo(() => {
    const ni = parseAmount(form.transferYearNetIncomePerShare);
    const na = parseAmount(form.transferYearNetAssetPerShare);
    if (ni <= 0 && na <= 0) return null;

    if (isNetAssetOnly) {
      // 순자산 단독 → 80% 하한 없음
      return { perShare: Math.floor(na), floor80Applied: false, method: "net_asset_only" as const };
    }

    const niW = isHeavyRE ? 2 : 3;
    const naW = isHeavyRE ? 3 : 2;
    const weighted = (ni * niW + na * naW) / 5;
    const floor80 = na * 0.8;

    if (weighted > 0 && floor80 > weighted) {
      return { perShare: Math.floor(floor80), floor80Applied: true, method: "weighted_avg" as const };
    }
    return { perShare: Math.floor(weighted), floor80Applied: false, method: "weighted_avg" as const };
  }, [
    form.transferYearNetIncomePerShare,
    form.transferYearNetAssetPerShare,
    isNetAssetOnly,
    isHeavyRE,
  ]);

  // 취득기준시가 미리보기
  const acquisitionStdPricePreview = useMemo(() => {
    const ni = parseAmount(form.acquisitionYearNetIncomePerShare);
    const na = parseAmount(form.acquisitionYearNetAssetPerShare);
    if (ni <= 0 && na <= 0) return null;

    if (isNetAssetOnly) {
      return Math.floor(na);
    }

    const niW = isHeavyRE ? 2 : 3;
    const naW = isHeavyRE ? 3 : 2;
    return Math.floor((ni * niW + na * naW) / 5);
  }, [
    form.acquisitionYearNetIncomePerShare,
    form.acquisitionYearNetAssetPerShare,
    isNetAssetOnly,
    isHeavyRE,
  ]);

  return (
    <div className="space-y-6">
      {/* 가중치 안내 카드 */}
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          isHeavyRE
            ? "border-violet-200 bg-violet-50/70 text-violet-800"
            : "border-fuchsia-200 bg-fuchsia-50/60 text-fuchsia-800"
        }`}
      >
        <p className="font-semibold">
          비상장 보충적 평가 — 시행령 §165④1
          {isHeavyRE && " (가중치 반전 적용 — §165⑤ 부동산과다보유)"}
        </p>
        <p className="text-xs mt-1">
          {isNetAssetOnly
            ? "순자산가치 단독 평가 (§165④3) — 80% 하한 미적용"
            : `가중평균 = (순손익가치 × ${niWeight} + 순자산가치 × ${naWeight}) ÷ 5 + 80% 하한`}
        </p>
        <p className="text-xs text-fuchsia-600 mt-1">
          입력값: 순손익가치 = 1주당 순손익액 ÷ 10% (이미 반영된 값으로 입력)
        </p>
      </div>

      {/* 순자산 단독 사유 선택 */}
      <FieldCard
        label="순자산 단독 평가 사유 (§165④3)"
        hint="해당 사유가 있는 경우만 선택. 없으면 '해당 없음'으로 둡니다."
      >
        <RadioCardGroup
          name="netAssetOnlyReason"
          value={netAssetOnlyReason}
          onChange={(v) =>
            onChange({
              netAssetOnlyReason: v as StockTransferFormData["netAssetOnlyReason"] | "",
            })
          }
          tone="amber"
          layout="stack"
          options={NET_ASSET_ONLY_REASON_OPTIONS}
        />
      </FieldCard>

      {/* 양도일 직전 사업연도 입력 */}
      <div>
        <p className="text-sm font-medium text-slate-700 mb-3">
          양도일 직전 사업연도 평가 (양도기준시가 산출용)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {!isNetAssetOnly && (
            <CurrencyInput
              label="1주당 순손익가치"
              required
              hint="= 1주당 순손익액 ÷ 10% (할인율 적용 후 값)"
              value={form.transferYearNetIncomePerShare}
              onChange={(v) => onChange({ transferYearNetIncomePerShare: v })}
            />
          )}
          <CurrencyInput
            label="1주당 순자산가치"
            required
            hint="직전 사업연도 말 기준 순자산 ÷ 발행주식수"
            value={form.transferYearNetAssetPerShare}
            onChange={(v) => onChange({ transferYearNetAssetPerShare: v })}
          />
        </div>

        {/* 양도기준시가 미리보기 */}
        {transferStdPricePreview && (
          <div
            className={`mt-2 rounded border px-3 py-2 text-sm ${
              transferStdPricePreview.floor80Applied
                ? "border-rose-200 bg-rose-50/60 text-rose-700"
                : "border-emerald-200 bg-emerald-50/60 text-emerald-700"
            }`}
          >
            <span className="font-medium">
              양도기준시가 (1주당): {transferStdPricePreview.perShare.toLocaleString()}원
            </span>
            {transferStdPricePreview.floor80Applied && (
              <span className="ml-2 text-xs">(80% 하한 발동 — §165④1 단서)</span>
            )}
            {transferStdPricePreview.method === "net_asset_only" && (
              <span className="ml-2 text-xs">(순자산 단독 — §165④3)</span>
            )}
          </div>
        )}
      </div>

      {/* 취득일 직전 사업연도 입력 */}
      <div>
        <p className="text-sm font-medium text-slate-700 mb-3">
          취득일 직전 사업연도 평가 (취득기준시가 산출용)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {!isNetAssetOnly && (
            <CurrencyInput
              label="1주당 순손익가치 (취득시점)"
              required
              hint="취득일 직전 사업연도 기준 (원)"
              value={form.acquisitionYearNetIncomePerShare}
              onChange={(v) => onChange({ acquisitionYearNetIncomePerShare: v })}
            />
          )}
          <CurrencyInput
            label="1주당 순자산가치 (취득시점)"
            required
            hint="취득일 직전 사업연도 기준 (원)"
            value={form.acquisitionYearNetAssetPerShare}
            onChange={(v) => onChange({ acquisitionYearNetAssetPerShare: v })}
          />
        </div>

        {/* 취득기준시가 미리보기 */}
        {acquisitionStdPricePreview !== null && (
          <div className="mt-2 rounded border border-sky-200 bg-sky-50/60 px-3 py-2 text-sm text-sky-700">
            취득기준시가 (1주당): {acquisitionStdPricePreview.toLocaleString()}원
            <span className="ml-2 text-xs">
              (개산공제 기준 = {acquisitionStdPricePreview.toLocaleString()} ×{" "}
              {parseInt(form.shareCount || "0", 10).toLocaleString()}주 × 1%)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
