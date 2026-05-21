"use client";

/**
 * UnlistedStockEditor — 비상장주식 항목 편집기 (StockValuationForm 800줄 정책 분리)
 *
 * 상증법 §63①1호 다목, 시행령 §54
 */

import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  calcUnlistedStockPerShareValue,
} from "@/lib/tax-engine/property-valuation-stock";
import type { EstateItem, UnlistedStockData, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";
import { FarmingCategorySection } from "@/components/calc/inheritance/FarmingCategorySection";
import { FamilyBusinessCategorySection } from "@/components/calc/inheritance/FamilyBusinessCategorySection";
import { FinancialDeductionChip } from "@/components/calc/inheritance/FinancialDeductionChip";
import { HeirAllocationToggleSection } from "@/components/calc/inheritance/HeirAllocationToggleSection";
import { UnlistedStockSpecialReasonSection } from "@/components/calc/inheritance/UnlistedStockSpecialReasonSection";

// ============================================================
// 비상장주식 계산 미리보기
// ============================================================

interface UnlistedPreviewProps {
  preview: ReturnType<typeof calcUnlistedStockPerShareValue>;
  ownedShares: number;
  isRealEstateHeavy: boolean;
  isDeficit: boolean;
  isMinValueApplied: boolean;
}

export function UnlistedStockPreview({
  preview,
  ownedShares,
  isRealEstateHeavy,
  isDeficit,
  isMinValueApplied,
}: UnlistedPreviewProps) {
  const totalValue = preview.perShareFinalValue * ownedShares;
  const iw = isRealEstateHeavy ? 2 : 3;
  const aw = isRealEstateHeavy ? 3 : 2;

  return (
    <div className="rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-3 text-xs space-y-1.5">
      <p className="font-semibold text-gray-600 dark:text-gray-300 mb-2">계산 내역</p>

      <div className="flex justify-between text-gray-500 dark:text-gray-400">
        <span>1주당 순손익가치</span>
        <span>{preview.perShareIncomeValue.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-gray-500 dark:text-gray-400">
        <span>1주당 순자산가치</span>
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
// 비상장주식 유틸
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
// 비상장주식 항목 편집기
// ============================================================

export interface UnlistedStockEditorProps {
  item: EstateItem;
  index: number;
  isRealEstateHeavy: boolean;
  onUpdate: (updated: EstateItem) => void;
  onUpdateHeavy: (v: boolean) => void;
  onRemove: () => void;
  mode: "inheritance" | "gift";
  heirs?: Heir[];
}

export function UnlistedStockEditor({
  item,
  index,
  mode,
  heirs,
  isRealEstateHeavy,
  onUpdate,
  onUpdateHeavy,
  onRemove,
}: UnlistedStockEditorProps) {
  const set = (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });
  const setStock = (patch: Partial<UnlistedStockData>) =>
    set({ unlistedStockData: { ...defaultStockData(item.unlistedStockData), ...patch } });

  const data = item.unlistedStockData;

  // 계산 미리보기
  let preview: ReturnType<typeof calcUnlistedStockPerShareValue> | null = null;
  if (data && data.totalShares > 0) {
    try {
      preview = calcUnlistedStockPerShareValue(data, isRealEstateHeavy);
    } catch {
      preview = null;
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
            비상장주식 {index + 1}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          삭제
        </button>
      </div>

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
        tone="amber"
        title="부동산과다보유법인"
        description="총자산 중 부동산 비율 80% 이상 — 순자산가치 비중 증가 (시행령 §54④ 3호)"
        checked={isRealEstateHeavy}
        onCheckedChange={(v) => onUpdateHeavy(v)}
      >
        <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
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

      <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
          순손익가치 계산 입력
        </p>

        {/* 최근 3년 가중평균 순손익 */}
        <CurrencyInput
          label="최근 3년 가중평균 순손익 (회사 전체)"
          value={data?.weightedNetIncome != null ? String(data.weightedNetIncome) : ""}
          onChange={(v) => setStock({ weightedNetIncome: parseAmount(v) })}
          hint="회사 전체 금액 (1주당 ✗) — (당해×3 + 전년×2 + 전전년×1) ÷ 6. 엔진이 발행주식수로 자동 1주당 환산."
          required
        />

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

        {/* 순자산가치 */}
        <CurrencyInput
          label="순자산가치 (회사 전체)"
          value={data?.netAssetValue != null ? String(data.netAssetValue) : ""}
          onChange={(v) => setStock({ netAssetValue: parseAmount(v) })}
          hint="회사 전체 금액 (1주당 ✗) — 총자산 − 총부채 (평가기준일 재무상태표). 0 이하면 0으로 처리 (시행령 §55①)."
          required
        />
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
       data.weightedNetIncome > 0 && preview.perShareIncomeValue === 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50/70 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          ⚠️ 입력한 회사 전체 가중평균 순손익({data.weightedNetIncome.toLocaleString()}원)이 발행주식 수에 비해 매우 작아 1주당 순손익가치가 0으로 절사됩니다. 단위 재확인 필요.
        </div>
      )}

      {/* 계산 미리보기 */}
      {preview && data && data.totalShares > 0 && data.ownedShares > 0 && (
        <UnlistedStockPreview
          preview={preview}
          ownedShares={data.ownedShares}
          isRealEstateHeavy={isRealEstateHeavy}
          isDeficit={data.weightedNetIncome <= 0}
          isMinValueApplied={preview.perShareFinalValue === preview.perShareMinValue}
        />
      )}

      {/* 영농상속 자산 분류 — 비상장주식 (corporate_stock만 가능) */}
      {mode === "inheritance" && (
        <FarmingCategorySection item={item} onUpdate={onUpdate} />
      )}

      {/* 가업상속 자산 분류 — 비상장주식 (corporate_stock만 가능) */}
      {mode === "inheritance" && (
        <FamilyBusinessCategorySection item={item} onUpdate={onUpdate} />
      )}

      {/* §22 금융재산공제 — 비상장주식 (§22② 최대주주 보유분은 사용자 override) */}
      {mode === "inheritance" && (
        <FinancialDeductionChip item={item} onUpdate={onUpdate} />
      )}

      {/* 상속인·수유자별 협의분할 (상속세 전용) */}
      {mode === "inheritance" && heirs && (
        <HeirAllocationToggleSection
          item={item}
          heirs={heirs}
          effectiveValuation={
            preview && data ? preview.perShareFinalValue * data.ownedShares : 0
          }
          onChange={(patch) => onUpdate({ ...item, ...patch })}
        />
      )}
    </div>
  );
}
