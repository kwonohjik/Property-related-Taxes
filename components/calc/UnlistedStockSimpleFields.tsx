"use client";

/**
 * UnlistedStockSimpleFields — 비상장주식 간편평가 입력 필드 (PR-2 분리)
 *
 * UnlistedStockEditor의 입력부 JSX를 800줄 정책 준수를 위해 분리.
 * 공통속성 4블록(FarmingCategory·FamilyBusiness·FinancialDeduction·HeirAllocation)은
 * UnlistedStockEditor에 남아 있음 (PR-4에서 EstateCommonAttributesSection으로 분리 예정).
 *
 * 상증법 §63①1호 다목, 시행령 §54
 *
 * PR-2 (3년치 순손익 입력):
 *  - weightedNetIncome 단일 칸 → netIncomeY1/Y2/Y3 3칸으로 교체
 *  - 연도별 결손(적자): 토글 없이 음수 직접 입력 (CurrencyInput allowNegative). signed 값 store 저장.
 *  - 음수 순자산도 직접 입력 — 엔진에서 0 처리 (상증령 §55① 후단).
 *  - 가중평균 미리보기: calcCompanyWeightedNetIncome3Y import (single-source)
 */

import { useMemo, useState } from "react";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  calcUnlistedStockPerShareValue,
  calcCompanyWeightedNetIncome3Y,
  resolveWeightedNetIncome,
} from "@/lib/tax-engine/property-valuation-stock";
import type { EstateItem, UnlistedStockData } from "@/lib/tax-engine/types/inheritance-gift.types";
import { UnlistedStockSpecialReasonSection } from "@/components/calc/inheritance/UnlistedStockSpecialReasonSection";

// ============================================================
// 비상장주식 유틸 (단일 source — UnlistedStockEditor에서 re-export)
// ============================================================

export function defaultStockData(existing?: UnlistedStockData): UnlistedStockData {
  return {
    totalShares: 0,
    ownedShares: 0,
    weightedNetIncome: 0,
    capitalizationRate: 0.1,
    netAssetValue: 0,
    ...existing,
  };
}

// ============================================================
// 비상장주식 계산 미리보기 (단일 source — UnlistedStockEditor에서 re-export)
// ============================================================

// §55③ 영업권 자동 배제 사유 한국어 라벨 (엔진 echo goodwill.excludedByLaw)
const GOODWILL_EXCLUSION_LABEL: Record<
  NonNullable<ReturnType<typeof calcUnlistedStockPerShareValue>["goodwill"]["excludedByLaw"]>,
  string
> = {
  liquidation: "청산·해산·합병 (§55③ 1호)",
  real_estate_80: "부동산 80% 이상 (§55③ 1호)",
  lt3y: "사업개시 3년 미만 (§55③ 2호)",
  continuous_loss_3y: "직전 3년 계속 결손 (§55③ 3호)",
};

interface UnlistedPreviewProps {
  preview: ReturnType<typeof calcUnlistedStockPerShareValue>;
  ownedShares: number;
  isRealEstateHeavy: boolean;
  isDeficit: boolean;
  isMinValueApplied: boolean;
  /** 회사 전체 3년 가중평균 순손익 (§56①) — 1주당 순손익가치 산출근거 표시용 */
  companyWeightedNetIncome?: number;
}

export function UnlistedStockPreview({
  preview,
  ownedShares,
  isRealEstateHeavy,
  isDeficit,
  isMinValueApplied,
  companyWeightedNetIncome,
}: UnlistedPreviewProps) {
  const totalValue = preview.perShareFinalValue * ownedShares;
  const iw = isRealEstateHeavy ? 2 : 3;
  const aw = isRealEstateHeavy ? 3 : 2;
  const goodwill = preview.goodwill;
  const hasGoodwill = goodwill.goodwillFinal > 0;
  const [goodwillOpen, setGoodwillOpen] = useState(false);

  return (
    <div className="rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-3 text-xs space-y-1.5">
      <p className="font-semibold text-gray-600 dark:text-gray-300 mb-2">계산 내역</p>

      {companyWeightedNetIncome != null && (
        <div className="flex justify-between text-gray-400 dark:text-gray-500 text-[11px]">
          <span>3년 가중평균 순손익 (회사 전체, §56①) ÷ (발행주식수 × 환원율)</span>
          <span>{Math.round(companyWeightedNetIncome).toLocaleString()}</span>
        </div>
      )}
      <div className="flex justify-between text-gray-500 dark:text-gray-400">
        <span>1주당 순손익가치</span>
        <span>{preview.perShareIncomeValue.toLocaleString()}</span>
      </div>

      {/* 영업권(§59②) 가산 — 이미지25 ㉮㉯㉰㉱ */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-1.5 mt-1.5 space-y-1">
        <div className="flex justify-between text-gray-500 dark:text-gray-400">
          <span>㉮ 영업권 포함 전 순자산가액 <span className="text-[10px] text-gray-400">(회사 전체)</span></span>
          <span>{goodwill.selfCapital.toLocaleString()}</span>
        </div>
        {hasGoodwill ? (
          <>
            <div className="flex justify-between items-start text-gray-500 dark:text-gray-400">
              <button
                type="button"
                onClick={() => setGoodwillOpen((o) => !o)}
                className="text-left text-indigo-600 dark:text-indigo-400 hover:underline print:hidden"
              >
                ㉯ 영업권 평가액 (§59②) {goodwillOpen ? "▲" : "▼"} 산출근거
              </button>
              <span className="hidden print:inline">㉯ 영업권 평가액 (§59②)</span>
              <span>{goodwill.goodwillFinal.toLocaleString()}</span>
            </div>
            {/* 산출근거 6줄 — 인쇄 시 자동 펼침 (print-only-css-toggle) */}
            <div className={`${goodwillOpen ? "block" : "hidden print:block"} rounded bg-indigo-50/60 dark:bg-indigo-900/20 px-2 py-1.5 space-y-0.5 text-[11px] text-gray-500 dark:text-gray-400`}>
              <div className="flex justify-between"><span>가. 최근 3년 가중평균 순손익액</span><span>{goodwill.weightedAvg3y.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>나. 가 × 50%</span><span>{goodwill.weightedAvgHalf.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>다. 자기자본 (영업권 포함 전 순자산)</span><span>{goodwill.selfCapital.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>마. 다 × 이자율(10%)</span><span>{goodwill.selfCapitalRate.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>초과이익 (나 − 마, 음수 시 0)</span><span>{goodwill.annualExcessProfit.toLocaleString()}</span></div>
              <div className="flex justify-between font-medium text-gray-600 dark:text-gray-300"><span>자. 영업권 = 초과이익 × 5년 연금현가</span><span>{goodwill.goodwillFinal.toLocaleString()}</span></div>
              <p className="text-[10px] text-gray-400 pt-0.5">5년 연금현가계수 3.7908 적용 (상증령 §59② · 상증규 §19① 10%)</p>
            </div>
            <div className="flex justify-between text-gray-500 dark:text-gray-400">
              <span>㉰ 영업권 포함 순자산가액 <span className="text-[10px] text-gray-400">(회사 전체)</span></span>
              <span>{preview.netAssetWithGoodwill.toLocaleString()}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between text-gray-400 dark:text-gray-500 text-[11px]">
            <span>㉯ 영업권 (§59②)</span>
            <span>
              0 — 미가산
              {goodwill.excludedByLaw ? ` (${GOODWILL_EXCLUSION_LABEL[goodwill.excludedByLaw]})` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="flex justify-between text-gray-500 dark:text-gray-400">
        <span>{hasGoodwill ? "㉱ 1주당 순자산가치 (영업권 포함)" : "1주당 순자산가치"}</span>
        <span>{preview.perShareAssetValue.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-gray-500 dark:text-gray-400">
        <span>가중평균 (순손익×{iw} + 순자산×{aw} ÷ 5)</span>
        <span>{preview.perShareWeightedValue.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-gray-500 dark:text-gray-400">
        <span>최소값 (순자산가치 × 80%)</span>
        <span>{preview.perShareMinValue.toLocaleString()}</span>
      </div>
      <div className="flex justify-between font-semibold text-gray-700 dark:text-gray-200 border-t border-gray-200 dark:border-gray-700 pt-1">
        <span>1주당 최종 평가액</span>
        <span className={isMinValueApplied ? "text-amber-600 dark:text-amber-400" : ""}>
          {preview.perShareFinalValue.toLocaleString()}
          {isMinValueApplied && " (최소값 적용)"}
        </span>
      </div>

      <div className="flex justify-between font-bold text-base border-t border-gray-300 dark:border-gray-600 pt-2 mt-1">
        <span className="text-gray-700 dark:text-gray-200">총 평가액</span>
        <span className="text-indigo-700 dark:text-indigo-300">{formatKRW(totalValue)}</span>
      </div>

      {/* 경고 메시지 */}
      {isDeficit && (
        <p className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1 mt-1">
          ⚠️ 적자법인 — 순손익가치 0 적용, 최소값(순자산 80%) 기준
          {goodwill.excludedByLaw === "continuous_loss_3y" && " · 영업권 미가산 (§55③ 3호)"}
        </p>
      )}
      {/* §55③ 배제 (적자 외 사유 — 청산·부동산80%·3년미만) */}
      {!isDeficit && goodwill.excludedByLaw && goodwill.excludedByLaw !== "continuous_loss_3y" && (
        <p className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1 mt-1">
          ⚠️ 영업권 미가산 — {GOODWILL_EXCLUSION_LABEL[goodwill.excludedByLaw]}
        </p>
      )}
      {isMinValueApplied && !isDeficit && (
        <p className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1 mt-1">
          ⚠️ 가중평균 &lt; 최소값 — 순자산가치 80% 최소값 적용
        </p>
      )}
    </div>
  );
}

// ============================================================
// Props
// ============================================================

export interface UnlistedStockSimpleFieldsProps {
  item: EstateItem;
  isRealEstateHeavy: boolean;
  onUpdate: (updated: EstateItem) => void;
  onUpdateHeavy: (v: boolean) => void;
  /** 상속세("inheritance") 또는 증여세("gift") — 연도 라벨 문구에 사용 */
  mode?: "inheritance" | "gift";
}

// ============================================================
// 간편평가 입력 필드 (회사명·부동산과다보유·§54④사유·주식수·순손익·순자산·미리보기)
// ============================================================

export function UnlistedStockSimpleFields({
  item,
  isRealEstateHeavy,
  onUpdate,
  onUpdateHeavy,
  mode = "inheritance",
}: UnlistedStockSimpleFieldsProps) {
  const set = (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });
  const setStock = (patch: Partial<UnlistedStockData>) =>
    set({ unlistedStockData: { ...defaultStockData(item.unlistedStockData), ...patch } });

  const data = item.unlistedStockData;

  // 결손(적자)은 별도 토글 없이 음수를 직접 입력받는다 (CurrencyInput allowNegative).
  // store(netIncomeY1~Y3)에 signed 값 그대로 저장 → 가중평균이 음수면 엔진에서 0 처리 (상증령 §56① 단서).

  // 연도 라벨 문구 — 상속개시일 vs 증여일
  const baseLabel = mode === "gift" ? "증여일" : "상속개시일";

  // ──────────────────────────────────────────────────────────────
  // 가중평균 미리보기 — 엔진 헬퍼 single-source (UI 자체 산식 금지)
  // ──────────────────────────────────────────────────────────────
  const weightedNetIncomePreview = useMemo(() => {
    const has3y =
      data?.netIncomeY1 != null ||
      data?.netIncomeY2 != null ||
      data?.netIncomeY3 != null;
    if (!has3y) return null;
    return calcCompanyWeightedNetIncome3Y(
      data?.netIncomeY1 ?? 0,
      data?.netIncomeY2 ?? 0,
      data?.netIncomeY3 ?? 0,
    );
  }, [data?.netIncomeY1, data?.netIncomeY2, data?.netIncomeY3]);

  // 계산 미리보기
  const preview = useMemo(() => {
    if (!data || data.totalShares <= 0) return null;
    try {
      return calcUnlistedStockPerShareValue(data, isRealEstateHeavy);
    } catch {
      return null;
    }
  }, [data, isRealEstateHeavy]);

  // 적자법인 판정: resolveWeightedNetIncome 기준 (엔진과 동일 로직)
  const isDeficit = data ? resolveWeightedNetIncome(data) <= 0 : false;

  // resolvedNetIncome > 0인데 1주당 순손익가치가 0으로 절사되는 경우
  const resolvedNetIncome = data ? resolveWeightedNetIncome(data) : 0;

  return (
    <div className="space-y-3">
      {/* 법적 근거 안내 */}
      <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded px-3 py-2">
        ℹ️ 1주당 가치 = (순손익가치×3 + 순자산가치×2) ÷ 5 (상증법 §63①1호 다목, 시행령 §54)
      </p>

      {/* 회사명 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          회사명 <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={item.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="예: ○○주식회사"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* 부동산과다보유법인 여부 */}
      <ToggleCard
        tone="rose"
        title="부동산과다보유법인"
        description="토지·건물·부동산권리 합계가 자산총액의 50% 이상인 법인 (소법 §94①4호다목) — 가중치 반전 (순손익 2/5 + 순자산 3/5), 상증령 §54① 본문 괄호"
        checked={isRealEstateHeavy}
        onCheckedChange={(v) => onUpdateHeavy(v)}
      >
        <p className="text-xs text-rose-700 dark:text-rose-300 font-medium">
          적용 가중치: 순손익가치×2 + 순자산가치×3 ÷ 5
        </p>
      </ToggleCard>

      {/* §54④ 순자산가치만 적용 사유 */}
      <UnlistedStockSpecialReasonSection
        value={data?.assetValueOnlyReason}
        onChange={(reason) => setStock({ assetValueOnlyReason: reason })}
      />

      {/* 총 발행주식 수 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          총 발행주식 수 (주) <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={data?.totalShares ? data.totalShares.toLocaleString() : ""}
          onChange={(e) => {
            const v = parseInt(e.target.value.replace(/,/g, "") || "0", 10);
            setStock({ totalShares: v });
          }}
          placeholder="총 발행주식 수 입력 (주)"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-[11px] text-muted-foreground">
          회사 전체 발행주식 총수 — 평가기준일 현재 (시행령 §56③)
        </p>
      </div>

      {/* 보유 주식 수 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          피상속인·수증자 보유 주식 수 (주) <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={data?.ownedShares ? data.ownedShares.toLocaleString() : ""}
          onChange={(e) => {
            const v = parseInt(e.target.value.replace(/,/g, "") || "0", 10);
            setStock({ ownedShares: v });
          }}
          placeholder="보유 주식 수 입력 (주)"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-[11px] text-muted-foreground">
          피상속인(또는 수증자)이 보유한 주식 수. 총 발행주식 수의 일부.
        </p>
      </div>

      {/* ─── 순손익가치 계산 입력 (PR-2: 3년치 입력) ─── */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
            순손익가치 계산 입력 — 연도별 순손익액 (상증령 §56①)
          </p>
          <p className="text-[11px] text-muted-foreground">
            각 연도 회사 전체 순손익액을 입력하면 가중평균을 자동 계산합니다.
            미입력 연도는 0으로 처리됩니다.
          </p>
        </div>

        {/* 직전 1사업연도 (가중치 ×3) */}
        <NetIncomeYearRow
          label={`직전 1사업연도 순손익액 (가중치 ×3)`}
          yearLabel={`${baseLabel} -1년`}
          value={data?.netIncomeY1}
          onChange={(v) => setStock({ netIncomeY1: v })}
          hint="회사 전체 금액 (1주당 ✗). 세무조정 완료된 각 사업연도 순손익액 (시행령 §56④). 결손(적자)은 음수로 입력."
        />

        {/* 직전 2사업연도 (가중치 ×2) */}
        <NetIncomeYearRow
          label={`직전 2사업연도 순손익액 (가중치 ×2)`}
          yearLabel={`${baseLabel} -2년`}
          value={data?.netIncomeY2}
          onChange={(v) => setStock({ netIncomeY2: v })}
          hint="회사 전체 금액 (1주당 ✗). 결손(적자)은 음수로 입력."
        />

        {/* 직전 3사업연도 (가중치 ×1) */}
        <NetIncomeYearRow
          label={`직전 3사업연도 순손익액 (가중치 ×1)`}
          yearLabel={`${baseLabel} -3년`}
          value={data?.netIncomeY3}
          onChange={(v) => setStock({ netIncomeY3: v })}
          hint="회사 전체 금액 (1주당 ✗). 결손(적자)은 음수로 입력."
        />

        {/* 가중평균 미리보기 */}
        {weightedNetIncomePreview !== null && (
          <div className="rounded-md bg-indigo-50/60 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 px-3 py-2 text-xs space-y-1">
            <p className="font-semibold text-indigo-700 dark:text-indigo-300">
              자동 계산: 3년 가중평균 순손익 (§56①)
            </p>
            <p className="text-indigo-600 dark:text-indigo-400">
              = (직전1년×3 + 직전2년×2 + 직전3년×1) ÷ 6
              {" = "}
              <span className="font-medium">{weightedNetIncomePreview.toLocaleString()}</span>
              {weightedNetIncomePreview <= 0 && (
                <span className="ml-1 text-amber-600 dark:text-amber-400">
                  → 0 적용 (음수 시 0, §56① 단서)
                </span>
              )}
            </p>
            {weightedNetIncomePreview <= 0 && (
              <p className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
                ⚠️ 적자법인 — 순손익가치 0 적용, 최소값(순자산 80%) 기준
              </p>
            )}
          </div>
        )}

        {/* 자본환원율 */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            자본환원율 (기본 10%)
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={data?.capitalizationRate
                ? String(data.capitalizationRate * 100)
                : ""}
              onChange={(e) => {
                const pct = parseFloat(e.target.value || "0");
                setStock({ capitalizationRate: isNaN(pct) ? 0.1 : pct / 100 });
              }}
              placeholder="10"
              className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              %
            </span>
          </div>
          <p className="text-xs text-gray-400">국세청 고시 기준 — 통상 10% 적용</p>
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
          순자산가치 계산 입력
        </p>

        {/* 순자산가치 — 음수 직접 입력 허용, 0 이하는 엔진에서 0 처리 (§55① 후단) */}
        <CurrencyInput
          label="순자산가치 (회사 전체, 영업권 포함 전)"
          value={data?.netAssetValue != null ? String(data.netAssetValue) : ""}
          onChange={(v) => setStock({ netAssetValue: parseAmount(v) })}
          allowNegative
          hint="영업권 포함 전 자기자본 (= 총자산 − 총부채, 평가기준일 재무상태표). 영업권은 §59②에 따라 자동 산출·가산됩니다. 0 이하면 0으로 처리 (시행령 §55①). 음수는 그대로 입력."
          required
        />
        {data?.netAssetValue != null && data.netAssetValue < 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 pl-1">
            음수 순자산 → 자기자본 0으로 처리 (상증법 §55① 후단). 영업권이 있으면 영업권만 가산됩니다.
          </p>
        )}
        {/* 영업권 자동 가산 안내 — 순손익 3년치 입력 시(미리계산 가능)에만 노출 */}
        {weightedNetIncomePreview !== null && (
          <p className="text-[11px] text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 rounded px-2 py-1.5">
            ℹ️ 입력한 순자산은 <strong>영업권 포함 전</strong> 금액입니다. §59② 영업권(최근 3년 가중평균 초과이익 기준)이 0을 초과하면 자동으로 가산되어 1주당 순자산가치에 반영됩니다.
          </p>
        )}
      </div>

      {/* 입력값 0 절사 경고 — 비현실적 입력 감지 */}
      {preview && data && data.totalShares > 0 && data.ownedShares > 0 &&
       data.netAssetValue > 0 && preview.perShareAssetValue === 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50/70 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          ⚠️ 입력한 회사 전체 순자산가치({data.netAssetValue.toLocaleString()}원)가 발행주식 수({data.totalShares.toLocaleString()}주)에 비해 매우 작아 1주당 가액이 0으로 절사됩니다.
          입력 단위가 &quot;회사 전체&quot;인지 다시 확인하세요. (1주당 금액을 입력하시려면 회사 전체 ÷ 발행주식 수 후 입력)
        </div>
      )}
      {preview && data && data.totalShares > 0 && data.ownedShares > 0 &&
       resolvedNetIncome > 0 && preview.perShareIncomeValue === 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50/70 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          ⚠️ 입력한 회사 전체 가중평균 순손익({resolvedNetIncome.toLocaleString()}원)이 발행주식 수에 비해 매우 작아 1주당 순손익가치가 0으로 절사됩니다. 단위 재확인 필요.
        </div>
      )}

      {/* 계산 미리보기 */}
      {preview && data && data.totalShares > 0 && data.ownedShares > 0 && (
        <UnlistedStockPreview
          preview={preview}
          ownedShares={data.ownedShares}
          isRealEstateHeavy={isRealEstateHeavy}
          isDeficit={isDeficit}
          isMinValueApplied={preview.perShareFinalValue === preview.perShareMinValue}
          companyWeightedNetIncome={resolvedNetIncome}
        />
      )}
    </div>
  );
}

// ============================================================
// 연도별 순손익 입력 행 (결손 토글 포함)
// ============================================================

interface NetIncomeYearRowProps {
  label: string;
  yearLabel: string;
  value: number | undefined;
  onChange: (val: number) => void;
  hint?: string;
}

/**
 * 단일 사업연도 순손익액 입력 행.
 * - 결손(적자)은 별도 토글 없이 음수를 직접 입력 (CurrencyInput allowNegative).
 * - store(netIncomeYN)에 signed 값 그대로 저장 → 가중평균 음수 시 엔진에서 0 처리 (상증령 §56① 단서).
 */
function NetIncomeYearRow({
  label,
  yearLabel,
  value,
  onChange,
  hint,
}: NetIncomeYearRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
        <span className="text-[11px] text-muted-foreground">({yearLabel})</span>
      </div>
      <CurrencyInput
        label=""
        value={value !== undefined ? String(value) : ""}
        onChange={(v) => onChange(parseAmount(v))}
        allowNegative
        hint={hint ?? "회사 전체 금액 (1주당 ✗). 결손(적자)은 음수로 입력."}
      />
      {value !== undefined && value < 0 && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400 pl-1">
          결손 입력: {value.toLocaleString()} (가중평균 산식에 음수로 반영)
        </p>
      )}
    </div>
  );
}
