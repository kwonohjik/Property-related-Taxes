"use client";

/**
 * ExitTaxHoldingsMatrix — 국외전출세 보유 종목 다건 입력 행렬 (⑤ 동기화 지점)
 *
 * PR-4B §118의9 보유 종목별 시가 산정 입력
 * AcquisitionLotsMatrix 패턴 차용.
 *
 * 출국일 시가 산정 모드 4종 (§178의9):
 *   "market_price"    → 출국일 거래가액 직접 입력
 *   "prior_year_std"  → §99①3 1개월 종가평균
 *   "unlisted_sample" → 전후 각 3개월 매매사례가액 (§178의9②2호 가목)
 *   "unlisted_std"    → §99①4 비상장 기준시가 (매매사례 없음)
 *
 * 3중 패턴 강제 (feedback_store_default_vs_ui_display_fallback):
 *   value={holding.field} — display fallback 단독 금지, factory default 사용
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
 *   시가 미입력 → validate 차단 (자동 채우기 없음)
 *
 * "원" 단위 표기 금지 (feedback_no_won_suffix)
 * SelectOnFocusProvider 전역 적용 — 개별 onFocus 불필요
 */

import { useMemo } from "react";
import { nanoid } from "nanoid";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { ExitTaxHoldingForm } from "@/lib/stores/calc-wizard-stock-store";

// ── 시장 옵션 ──
const MARKET_OPTIONS: { value: ExitTaxHoldingForm["marketType"]; label: string }[] = [
  { value: "kospi", label: "코스피" },
  { value: "kosdaq", label: "코스닥" },
  { value: "konex", label: "코넥스" },
  { value: "unlisted", label: "비상장" },
];

// ── 시가 산정 모드 옵션 ──
const VALUATION_MODE_OPTIONS: {
  value: ExitTaxHoldingForm["departureDayValuationMode"];
  label: string;
  description: string;
}[] = [
  {
    value: "market_price",
    label: "출국일 거래가액",
    description: "§178의9① — 출국일에 실제 거래된 가액 직접 입력",
  },
  {
    value: "prior_year_std",
    label: "기준시가 (1개월 평균)",
    description: "§99①3 — 출국일 이전 1개월 종가 평균 (상장주식)",
  },
  {
    value: "unlisted_sample",
    label: "매매사례가액",
    description: "§178의9②2호 가목 — 출국일 전후 각 3개월 내 매매사례가액 (비상장)",
  },
  {
    value: "unlisted_std",
    label: "비상장 기준시가",
    description: "§99①4 — 매매사례 없는 비상장 주식 기준시가",
  },
];

interface ExitTaxHoldingsMatrixProps {
  holdings: ExitTaxHoldingForm[];
  onChange: (holdings: ExitTaxHoldingForm[]) => void;
}

export function ExitTaxHoldingsMatrix({ holdings, onChange }: ExitTaxHoldingsMatrixProps) {
  // 총 간주양도가액 미리보기 (useMemo — store 미러링 금지)
  const totalDepartureDayValue = useMemo(() => {
    return holdings.reduce((sum, h) => {
      const shares = parseInt(h.shareCount.replace(/,/g, ""), 10) || 0;
      const mode = h.departureDayValuationMode || "market_price";
      let priceStr = "";
      if (mode === "market_price") priceStr = h.departureDayMarketPrice;
      else if (mode === "prior_year_std") priceStr = h.priorYearEndMonthAvg;
      else if (mode === "unlisted_sample") priceStr = h.unlistedSamplePrice;
      else if (mode === "unlisted_std") priceStr = h.unlistedStdPricePerShare;
      const price = parseAmount(priceStr);
      return sum + shares * price;
    }, 0);
  }, [holdings]);

  // ── 행 추가 ──
  function addHolding() {
    onChange([
      ...holdings,
      {
        id: nanoid(),
        stockName: "",
        marketType: "kospi",
        shareCount: "",
        acquisitionDate: "",
        perShareAcquisitionPrice: "",
        departureDayValuationMode: "market_price",
        departureDayMarketPrice: "",
        priorYearEndMonthAvg: "",
        unlistedSamplePrice: "",
        unlistedStdPricePerShare: "",
      },
    ]);
  }

  // ── 행 삭제 ──
  function removeHolding(id: string) {
    onChange(holdings.filter((h) => h.id !== id));
  }

  // ── 행 필드 업데이트 ──
  function updateHolding(id: string, patch: Partial<ExitTaxHoldingForm>) {
    onChange(holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }

  return (
    <div className="space-y-4">
      {/* 보유 종목 행 목록 */}
      {holdings.map((holding, idx) => (
        <ToneCard
          key={holding.id}
          tone="amber"
          sectionNum={idx + 1}
          title={holding.stockName || `종목 ${idx + 1}`}
          bodyClassName="space-y-3"
          noDark
          titleExtra={
            <button
              type="button"
              onClick={() => removeHolding(holding.id)}
              className="ml-auto text-xs text-rose-500 hover:text-rose-700 font-medium px-2 py-0.5 rounded hover:bg-rose-50 transition-colors"
            >
              삭제
            </button>
          }
        >
          {/* 종목명 */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">종목명 *</label>
            <input
              type="text"
              value={holding.stockName}
              onChange={(e) => updateHolding(holding.id, { stockName: e.target.value })}
              placeholder="종목명 입력"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>

          {/*
            보유현황 신고서(별지 제104호서식) 전용 칸 — **세액 계산에는 쓰이지 않는다**.
            서식 ⑩⑫⑬ 을 채우려면 종목마다 필요한데 계산 입력으로는 불필요해 여기서만 받는다.
            비워 두면 서식의 해당 칸이 **빈칸으로 인쇄**된다(추정하지 않는다).
          */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">종목코드·사업자등록번호</label>
              <input
                type="text"
                value={holding.stockCodeOrBizNumber ?? ""}
                onChange={(e) =>
                  updateHolding(holding.id, { stockCodeOrBizNumber: e.target.value })
                }
                onFocus={(e) => e.target.select()}
                placeholder="신고서 ⑩ (선택)"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">1주당 액면가 (원)</label>
              <CurrencyInput
                label=""
                value={holding.faceValuePerShare ?? ""}
                onChange={(v) => updateHolding(holding.id, { faceValuePerShare: v })}
                hideUnit
                placeholder="신고서 ⑫ (선택)"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">보유 지분율 (%)</label>
              <input
                type="text"
                value={holding.ownershipRatio ?? ""}
                onChange={(e) => updateHolding(holding.id, { ownershipRatio: e.target.value })}
                onFocus={(e) => e.target.select()}
                placeholder="신고서 ⑬ (선택)"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* 시장 선택 */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">시장</label>
            <div className="grid grid-cols-4 gap-1">
              {MARKET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateHolding(holding.id, { marketType: opt.value })}
                  className={[
                    "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                    holding.marketType === opt.value
                      ? "border-amber-400 bg-amber-100 text-amber-800"
                      : "border-amber-200 bg-amber-50/40 text-amber-600 hover:bg-amber-50",
                  ].join(" ")}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 주식수 + 취득일 + 취득단가 */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">주식수 *</label>
              <CurrencyInput
                label=""
                value={holding.shareCount}
                onChange={(v) => updateHolding(holding.id, { shareCount: v })}
                hideUnit
                placeholder="보유 주식수 (주)"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">취득일 *</label>
              <DateInput
                value={holding.acquisitionDate}
                onChange={(v) => updateHolding(holding.id, { acquisitionDate: v })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">취득단가 (원) *</label>
              <CurrencyInput
                label=""
                value={holding.perShareAcquisitionPrice}
                onChange={(v) => updateHolding(holding.id, { perShareAcquisitionPrice: v })}
                hideUnit
                placeholder="1주당 취득가액"
              />
            </div>
          </div>

          {/* 출국일 시가 산정 모드 */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700">
              출국일 시가 산정 방법 (§178의9)
            </label>
            <RadioCardGroup
              name={`departureDayValuationMode-${holding.id}`}
              value={holding.departureDayValuationMode}
              onChange={(v) =>
                updateHolding(holding.id, {
                  departureDayValuationMode: v as ExitTaxHoldingForm["departureDayValuationMode"],
                })
              }
              tone="amber"
              layout="stack"
              options={VALUATION_MODE_OPTIONS}
            />
          </div>

          {/* 모드별 시가 입력 */}
          {holding.departureDayValuationMode === "market_price" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                출국일 거래가액 (1주당, 원) *
              </label>
              <CurrencyInput
                label=""
                value={holding.departureDayMarketPrice}
                onChange={(v) => updateHolding(holding.id, { departureDayMarketPrice: v })}
                hideUnit
                placeholder="출국일 실제 거래가액 (주당)"
              />
              <p className="text-caption text-gray-500">
                §178의9① — 출국일에 실제 거래된 가액. 자동 조회 없음, 직접 입력 필수.
              </p>
            </div>
          )}

          {holding.departureDayValuationMode === "prior_year_std" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                §99①3 기준시가 — 1개월 종가평균 (1주당, 원) *
              </label>
              <CurrencyInput
                label=""
                value={holding.priorYearEndMonthAvg}
                onChange={(v) => updateHolding(holding.id, { priorYearEndMonthAvg: v })}
                hideUnit
                placeholder="출국일 이전 1개월 종가 평균"
              />
              <p className="text-caption text-gray-500">
                출국일 이전 1개월간 종가 산술 평균. 상장주식에 적용.
              </p>
            </div>
          )}

          {holding.departureDayValuationMode === "unlisted_sample" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                매매사례가액 (1주당, 원) *
              </label>
              <CurrencyInput
                label=""
                value={holding.unlistedSamplePrice}
                onChange={(v) => updateHolding(holding.id, { unlistedSamplePrice: v })}
                hideUnit
                placeholder="전후 각 3개월 매매사례가액"
              />
              <p className="text-caption text-gray-500">
                §178의9②2호 가목 — 출국일 전후 각 3개월 이내 동일 주식 매매사례가액.
              </p>
            </div>
          )}

          {holding.departureDayValuationMode === "unlisted_std" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                §99①4 비상장 기준시가 (1주당, 원) *
              </label>
              <CurrencyInput
                label=""
                value={holding.unlistedStdPricePerShare}
                onChange={(v) => updateHolding(holding.id, { unlistedStdPricePerShare: v })}
                hideUnit
                placeholder="비상장 기준시가 (매매사례 없는 경우)"
              />
              <p className="text-caption text-gray-500">
                §99①4 — 매매사례가액이 없는 비상장주식의 보충적 평가액.
              </p>
            </div>
          )}

          {/* 종목별 간주양도가 미리보기 */}
          {(() => {
            const shares = parseInt(holding.shareCount.replace(/,/g, ""), 10) || 0;
            const mode = holding.departureDayValuationMode || "market_price";
            let priceStr = "";
            if (mode === "market_price") priceStr = holding.departureDayMarketPrice;
            else if (mode === "prior_year_std") priceStr = holding.priorYearEndMonthAvg;
            else if (mode === "unlisted_sample") priceStr = holding.unlistedSamplePrice;
            else if (mode === "unlisted_std") priceStr = holding.unlistedStdPricePerShare;
            const price = parseAmount(priceStr);
            const val = shares * price;
            if (val <= 0) return null;
            return (
              <div className="rounded bg-amber-100/60 border border-amber-200 px-3 py-1.5 text-xs text-amber-800">
                간주양도가액 참고: {shares.toLocaleString()}주 × {price.toLocaleString()} ={" "}
                <span className="font-semibold">{val.toLocaleString()}</span>
              </div>
            );
          })()}
        </ToneCard>
      ))}

      {/* 종목 추가 버튼 */}
      <button
        type="button"
        onClick={addHolding}
        className="w-full rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/30 py-3 text-sm font-medium text-amber-700 hover:bg-amber-50/60 transition-colors"
      >
        + 종목 추가
      </button>

      {/* 합산 미리보기 */}
      {holdings.length > 1 && totalDepartureDayValue > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
          <span className="font-semibold">보유 종목 합계 간주양도가액 (참고):</span>{" "}
          {totalDepartureDayValue.toLocaleString()}
        </div>
      )}

      {holdings.length === 0 && (
        <p className="text-center text-xs text-gray-400 py-2">
          &ldquo;종목 추가&rdquo; 버튼을 눌러 보유 종목을 입력하세요
        </p>
      )}
    </div>
  );
}
