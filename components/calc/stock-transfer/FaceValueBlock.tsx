"use client";

/**
 * FaceValueBlock — 장부분실 + 액면가 입력 블록 (PR-2)
 *
 * §99①4: 장부가 분실·멸실된 경우 취득기준시가 = 액면가
 * 환산취득가 = 양도가액 × (액면가 / 양도기준시가)
 *
 * 비상장 보충 평가(양도기준시가)도 입력 필요:
 *   - 양도일 직전 사업연도 순손익·순자산가치
 *   - 80% 하한 발동 여부 미리보기
 */

import { useMemo } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { calcSection165_4Value } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";

interface FaceValueBlockProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function FaceValueBlock({ form, onChange }: FaceValueBlockProps) {
  const isHeavyRE = form.isHeavyRealEstateForValuation;

  // 양도기준시가 미리보기 — 「제4항에 따른 평가액」의 정본에 위임한다.
  //
  // 🔑 종전에는 산식을 여기서 다시 썼고 두 군데가 정본과 갈렸다:
  //    ① 연혁 게이팅 없음 — 1997 양도에 3:2 + 80% 하한을 적용(정본은 순자산 단독)
  //    ② `ni > 0 ? 가중평균 : na` — 순손익 «미입력»이라는 가장 흔한 상태에서 25% 과대
  //       (20,000 vs 정본 16,000). 정본은 ni=0도 가중평균에 넣고 하한을 건다.
  //    [[feedback_ui_engine_dual_truth_avoidance]] · anchor PV-3
  const transferStdPreview = useMemo(() => {
    // 연혁 게이팅 기준일이 없으면 판정 불가 — 임의 기준일 fallback 금지
    const parsed = form.transferDate ? new Date(form.transferDate) : undefined;
    const evalDate = parsed && !isNaN(parsed.getTime()) ? parsed : undefined;
    if (!evalDate) return null;
    // 「미입력」과 「음수 입력」을 가른다 (종전 `na <= 0`은 자본잠식을 미입력 취급했다)
    const isBlank = (s: string | undefined) => !s || s.trim() === "";
    if (isBlank(form.transferYearNetIncomePerShare) && isBlank(form.transferYearNetAssetPerShare)) {
      return null;
    }
    const ni = parseAmount(form.transferYearNetIncomePerShare);
    const na = parseAmount(form.transferYearNetAssetPerShare);
    const v = calcSection165_4Value(ni, na, isHeavyRE, evalDate);
    return {
      perShare: v.value,
      floor80Applied: v.floorApplied,
      weighted: Math.floor(v.weightedRaw),
    };
  }, [
    form.transferDate,
    form.transferYearNetIncomePerShare,
    form.transferYearNetAssetPerShare,
    isHeavyRE,
  ]);

  // 환산취득가 미리보기 = 양도가 × 액면가 / 양도기준시가
  const acquisitionPreview = useMemo(() => {
    if (!transferStdPreview || transferStdPreview.perShare <= 0) return null;

    const faceValue = parseAmount(form.faceValuePerShare);
    if (faceValue <= 0) return null;

    const shares = parseInt(form.shareCount || "0", 10);

    // 교환 양도가 vs 실가
    let transferTotal: number;
    if (form.transferPriceMode === "exchange") {
      transferTotal =
        parseAmount(form.exchangePropertyValue) +
        parseAmount(form.exchangeDebtRelief) +
        parseAmount(form.exchangeCash);
    } else {
      const perShare = parseAmount(form.perShareTransferPrice);
      transferTotal = perShare * shares;
    }

    if (transferTotal <= 0) return null;

    // 환산취득가 = 양도가 × 액면가 / 양도기준시가
    const estimated = Math.floor((transferTotal * faceValue) / transferStdPreview.perShare);
    // 개산공제 기준 = 액면가 × 주식수
    const estimatedBase = faceValue * shares;
    const estimatedDeduction = Math.floor(estimatedBase * 0.01);

    return { estimated, estimatedBase, estimatedDeduction };
  }, [
    form.transferPriceMode,
    form.perShareTransferPrice,
    form.exchangePropertyValue,
    form.exchangeDebtRelief,
    form.exchangeCash,
    form.faceValuePerShare,
    form.shareCount,
    transferStdPreview,
  ]);

  return (
    <div className="space-y-5">
      {/* 안내 카드 */}
      <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-4 py-3 text-sm text-rose-800">
        <p className="font-semibold">장부분실·멸실 특례 (§99①4)</p>
        <p className="text-xs mt-1">
          장부가 분실된 경우 취득기준시가 = 액면가. 양도기준시가는 비상장 보충적 평가로 산출합니다.
        </p>
        <p className="text-xs mt-1 text-rose-600">
          환산취득가 = 양도가액 × 액면가 ÷ 양도기준시가 (§165④1 가중평균 + 80% 하한)
        </p>
      </div>

      {/* 장부분실 확인 */}
      <ToggleCard
        checked={form.bookLost}
        onCheckedChange={(v) => onChange({ bookLost: v })}
        title="장부 분실·멸실 확인 (§99①4)"
        description="장부가 분실·멸실된 경우에만 액면가 적용 가능. 납세자가 직접 증명해야 합니다."
        tone="rose"
      />

      {/* 액면가 입력 */}
      <CurrencyInput
        label="1주당 액면가"
        required
        hint="정관상 또는 상법상 액면가 (원)"
        value={form.faceValuePerShare}
        onChange={(v) => onChange({ faceValuePerShare: v })}
      />

      {/* 양도기준시가 산출을 위한 비상장 보충 평가 */}
      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">
          양도기준시가 산출 (비상장 보충 평가 — 양도일 직전 사업연도)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <CurrencyInput
            label="1주당 순손익가치"
            allowNegative
            hint="= 1주당 순손익액 ÷ 10% (없으면 0)"
            value={form.transferYearNetIncomePerShare}
            onChange={(v) => onChange({ transferYearNetIncomePerShare: v })}
          />
          <CurrencyInput
            label="1주당 순자산가치"
            required
            allowNegative
            hint="직전 사업연도 말 기준 (원)"
            value={form.transferYearNetAssetPerShare}
            onChange={(v) => onChange({ transferYearNetAssetPerShare: v })}
          />
        </div>

        {/* 양도기준시가 미리보기 */}
        {transferStdPreview && (
          <div
            className={`mt-2 rounded border px-3 py-2 text-sm ${
              transferStdPreview.floor80Applied
                ? "border-rose-300 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50/60 text-emerald-700"
            }`}
          >
            <span className="font-medium">
              양도기준시가 = {transferStdPreview.perShare.toLocaleString()}원
            </span>
            {transferStdPreview.floor80Applied && (
              <span className="ml-2 text-xs">
                (80% 하한 발동: 가중평균 {transferStdPreview.weighted?.toLocaleString()}
                원 → {transferStdPreview.perShare.toLocaleString()}원)
              </span>
            )}
          </div>
        )}
      </div>

      {/* 환산취득가 미리보기 */}
      {acquisitionPreview && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/70 px-4 py-3 text-sm text-violet-800">
          <p className="font-semibold mb-2">환산취득가 미리보기</p>
          <div className="space-y-1 text-xs">
            <p>
              환산취득가 ={" "}
              <strong>{acquisitionPreview.estimated.toLocaleString()}</strong>원
            </p>
            <p>
              개산공제 기준 (취득기준시가총액) ={" "}
              {acquisitionPreview.estimatedBase.toLocaleString()}원
            </p>
            <p>
              개산공제 = {acquisitionPreview.estimatedBase.toLocaleString()} × 1% ={" "}
              <strong>{acquisitionPreview.estimatedDeduction.toLocaleString()}</strong>원
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
