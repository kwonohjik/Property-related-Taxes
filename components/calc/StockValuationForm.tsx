"use client";

/**
 * StockValuationForm — 상장·비상장주식 평가 입력 폼
 * 상속세·증여세 계산 마법사에서 주식 EstateItem[] 입력에 사용
 *
 * 상장주식: 평가기준일 전후 2개월 종가 단순평균 × 주식 수 (상증법 §63①1가)
 * 비상장주식: (순손익가치×3 + 순자산가치×2) ÷ 5
 *             부동산과다보유법인: 순손익가치×2 + 순자산가치×3 ÷ 5 (시행령 §54)
 */

import { useState } from "react";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  evaluateListedStockValue,
  calcUnlistedStockPerShareValue,
} from "@/lib/tax-engine/property-valuation-stock";
import type { EstateItem, UnlistedStockData, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";
import { KiwoomValuationAutoFetchButton } from "./KiwoomValuationAutoFetchButton";
import { HeirAllocationToggleSection } from "@/components/calc/inheritance/HeirAllocationToggleSection";

/**
 * 주식 자산 효과 평가액 — 상장: 평균가×주식수, 비상장: 순자산 OR 가중평균 결과값.
 */
export function computeStockValuation(item: EstateItem): number {
  if (item.category === "listed_stock") {
    const avg = item.listedStockAvgPrice ?? 0;
    const shares = item.listedStockShares ?? 0;
    if (avg > 0 && shares > 0) return evaluateListedStockValue(avg, shares);
    return 0;
  }
  if (item.category === "unlisted_stock" && item.unlistedStockData) {
    const d = item.unlistedStockData;
    if (d.totalShares > 0 && d.ownedShares > 0) {
      // 보충적 평가 1주당 가액 × 보유주식 수 (부동산과다보유 분기는 별도)
      const result = calcUnlistedStockPerShareValue(d, false);
      return result.perShareFinalValue * d.ownedShares;
    }
  }
  return 0;
}

// ============================================================
// 상장주식 항목 편집기
// ============================================================

interface ListedStockEditorProps {
  item: EstateItem;
  index: number;
  onUpdate: (updated: EstateItem) => void;
  onRemove: () => void;
  /** 평가기준일 (상속개시일·증여일) — F-01 키움 자동조회 트리거 */
  valuationDate?: string;
  mode: "inheritance" | "gift";
  heirs?: Heir[];
}

function ListedStockEditor({
  item,
  index,
  onUpdate,
  onRemove,
  valuationDate,
  mode,
  heirs,
}: ListedStockEditorProps) {
  const set = (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });

  const avgPrice = item.listedStockAvgPrice ?? 0;
  const shares = item.listedStockShares ?? 0;
  const totalValue = avgPrice > 0 && shares > 0
    ? evaluateListedStockValue(avgPrice, shares)
    : 0;

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📈</span>
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
            상장주식 {index + 1}
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
        ℹ️ 평가기준일 전후 2개월 최종 시세 단순평균 × 주식 수 (상증법 §63①1호 가목)
      </p>

      {/* 종목명 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          종목명 <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={item.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="예: 삼성전자"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* 종목코드 (F-01 키움 자동조회 트리거) */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          종목코드 (선택)
        </label>
        <input
          type="text"
          value={item.listedStockCode ?? ""}
          onChange={(e) => {
            const v = e.target.value
              .toUpperCase()
              .replace(/[^0-9A-Z]/g, "")
              .slice(0, 6);
            set({ listedStockCode: v });
          }}
          placeholder="6자리 종목코드 (예: 005930)"
          inputMode="text"
          maxLength={6}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* F-01 키움 자동조회 — 평가기준일 + 종목코드 충족 시 활성화 */}
      {valuationDate && item.listedStockCode && (
        <KiwoomValuationAutoFetchButton
          stockCode={item.listedStockCode}
          valuationDate={valuationDate}
          syncName
          onFill={(patch) => {
            set({
              listedStockAvgPrice: patch.listedStockAvgPrice,
              ...(patch.stockName ? { name: patch.stockName } : {}),
            });
          }}
        />
      )}

      {/* 전후 2개월 종가 평균 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          전후 2개월 종가 단순평균 (원/주) <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={avgPrice > 0 ? avgPrice.toLocaleString() : ""}
          onChange={(e) => {
            const v = parseInt(e.target.value.replace(/,/g, "") || "0", 10);
            set({ listedStockAvgPrice: v || undefined });
          }}
          placeholder="주당 순손익 입력 (원)"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-gray-400">평가기준일 기준 전 2개월 + 후 2개월(총 4개월) 종가 평균</p>
      </div>

      {/* 보유 주식 수 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          보유 주식 수 (주) <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={shares > 0 ? shares.toLocaleString() : ""}
          onChange={(e) => {
            const v = parseInt(e.target.value.replace(/,/g, "") || "0", 10);
            set({ listedStockShares: v || undefined });
          }}
          placeholder="주식 수 입력"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* 평가액 미리보기 */}
      {totalValue > 0 && (
        <div className="rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs space-y-1">
          <div className="flex justify-between text-gray-500 dark:text-gray-400">
            <span>평가 산식</span>
            <span>{avgPrice.toLocaleString()} × {shares.toLocaleString()}주</span>
          </div>
          <div className="flex justify-between font-semibold border-t border-gray-200 dark:border-gray-700 pt-1">
            <span>상장주식 평가액</span>
            <span className="text-indigo-700 dark:text-indigo-300">{formatKRW(totalValue)}</span>
          </div>
        </div>
      )}

      {/* 상속인·수유자별 협의분할 (상속세 전용) */}
      {mode === "inheritance" && heirs && (
        <HeirAllocationToggleSection
          item={item}
          heirs={heirs}
          effectiveValuation={totalValue}
          onChange={(patch) => onUpdate({ ...item, ...patch })}
        />
      )}
    </div>
  );
}

// ============================================================
// 비상장주식 항목 편집기
// ============================================================

interface UnlistedStockEditorProps {
  item: EstateItem;
  index: number;
  isRealEstateHeavy: boolean;
  onUpdate: (updated: EstateItem) => void;
  onUpdateHeavy: (v: boolean) => void;
  onRemove: () => void;
  mode: "inheritance" | "gift";
  heirs?: Heir[];
}

function UnlistedStockEditor({
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
  const totalValue = preview && data ? preview.perShareFinalValue * data.ownedShares : 0;

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
        description="총자산 중 부동산 비율 80% 이상 — 순자산가치 비중 증가 (시행령 §54④)"
        checked={isRealEstateHeavy}
        onCheckedChange={(v) => onUpdateHeavy(v)}
      >
        <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
          적용 가중치: 순손익가치×2 + 순자산가치×3 ÷ 5
        </p>
      </ToggleCard>

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
          placeholder="주당 순자산 입력 (원)"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
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
          hint="(당해 연도 순손익×3 + 전년도×2 + 전전년도×1) ÷ 6"
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
          hint="총자산 - 총부채 (평가기준일 기준 재무상태표)"
          required
        />
      </div>

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

      {/* 상속인·수유자별 협의분할 (상속세 전용) */}
      {mode === "inheritance" && heirs && (
        <HeirAllocationToggleSection
          item={item}
          heirs={heirs}
          effectiveValuation={computeStockValuation(item)}
          onChange={(patch) => onUpdate({ ...item, ...patch })}
        />
      )}
    </div>
  );
}

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

function UnlistedStockPreview({
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
// 유틸
// ============================================================

function defaultStockData(existing?: UnlistedStockData): UnlistedStockData {
  return {
    totalShares: 0,
    ownedShares: 0,
    weightedNetIncome: 0,
    netAssetValue: 0,
    capitalizationRate: 0.1,
    ...existing,
  };
}

// ============================================================
// 총 주식 평가액 합산
// ============================================================

interface StockTotal {
  items: EstateItem[];
  heavyMap: Record<string, boolean>;
}

function TotalStockValue({ items, heavyMap }: StockTotal) {
  let total = 0;
  for (const item of items) {
    if (item.category === "listed_stock") {
      const avg = item.listedStockAvgPrice ?? 0;
      const shares = item.listedStockShares ?? 0;
      if (avg > 0 && shares > 0) total += evaluateListedStockValue(avg, shares);
    } else if (item.category === "unlisted_stock" && item.unlistedStockData) {
      try {
        const preview = calcUnlistedStockPerShareValue(
          item.unlistedStockData,
          heavyMap[item.id] ?? false,
        );
        total += preview.perShareFinalValue * item.unlistedStockData.ownedShares;
      } catch {
        // 입력 미완성 — 무시
      }
    }
  }

  if (total === 0 || items.length === 0) return null;

  return (
    <div className="rounded-md border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 flex justify-between items-center">
      <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
        주식 합계 (예상)
      </span>
      <span className="text-base font-bold text-indigo-800 dark:text-indigo-200">
        {formatKRW(total)}
      </span>
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export interface StockValuationFormProps {
  /** 주식 자산 목록 (listed_stock | unlisted_stock 만) */
  items: EstateItem[];
  onChange: (items: EstateItem[]) => void;
  /** "상속" 또는 "증여" */
  mode?: "inheritance" | "gift";
  /** 평가기준일 (상속개시일 또는 증여일) — F-01 키움 자동조회 트리거 */
  valuationDate?: string;
  /** 협의분할 분배 후보 — inheritance 모드에서 필수 */
  heirs?: Heir[];
}

let _nextStockId = 1;
function generateStockId() {
  return `stock-${Date.now()}-${_nextStockId++}`;
}

export function StockValuationForm({
  items,
  onChange,
  mode = "inheritance",
  valuationDate,
  heirs,
}: StockValuationFormProps) {
  // 비상장주식별 부동산과다보유법인 여부
  const [heavyMap, setHeavyMap] = useState<Record<string, boolean>>({});
  const [showAddPanel, setShowAddPanel] = useState(false);

  const handleAdd = (category: "listed_stock" | "unlisted_stock") => {
    const newItem: EstateItem = {
      id: generateStockId(),
      category,
      name: "",
      ...(category === "unlisted_stock"
        ? {
            unlistedStockData: {
              totalShares: 0,
              ownedShares: 0,
              weightedNetIncome: 0,
              netAssetValue: 0,
              capitalizationRate: 0.1,
            },
          }
        : {}),
    };
    onChange([...items, newItem]);
    setShowAddPanel(false);
  };

  const handleUpdate = (index: number, updated: EstateItem) => {
    const next = [...items];
    next[index] = updated;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleHeavy = (id: string, v: boolean) =>
    setHeavyMap((prev) => ({ ...prev, [id]: v }));

  const listedItems = items.filter((i) => i.category === "listed_stock");
  const unlistedItems = items.filter((i) => i.category === "unlisted_stock");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            주식·지분 목록
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            상장주식과 비상장주식을 구분하여 입력하세요
          </p>
        </div>
        {items.length > 0 && (
          <span className="text-xs text-gray-400">{items.length}개 입력됨</span>
        )}
      </div>

      {/* 상장주식 목록 */}
      {listedItems.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <span>📈</span> 상장주식
          </p>
          {items.map((item, i) =>
            item.category === "listed_stock" ? (
              <ListedStockEditor
                key={item.id}
                item={item}
                index={listedItems.indexOf(item)}
                onUpdate={(updated) => handleUpdate(i, updated)}
                onRemove={() => handleRemove(i)}
                valuationDate={valuationDate}
                mode={mode}
                heirs={heirs}
              />
            ) : null,
          )}
        </div>
      )}

      {/* 비상장주식 목록 */}
      {unlistedItems.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <span>📋</span> 비상장주식
          </p>
          {items.map((item, i) =>
            item.category === "unlisted_stock" ? (
              <UnlistedStockEditor
                key={item.id}
                item={item}
                index={unlistedItems.indexOf(item)}
                isRealEstateHeavy={heavyMap[item.id] ?? false}
                onUpdate={(updated) => handleUpdate(i, updated)}
                onUpdateHeavy={(v) => handleHeavy(item.id, v)}
                onRemove={() => handleRemove(i)}
                mode={mode}
                heirs={heirs}
              />
            ) : null,
          )}
        </div>
      )}

      {/* 추가 패널 */}
      {showAddPanel ? (
        <div className="border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
            추가할 주식 종류 선택
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleAdd("listed_stock")}
              className="flex flex-col items-center gap-1 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            >
              <span className="text-2xl">📈</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                상장주식
              </span>
              <span className="text-xs text-gray-400 text-center">
                코스피·코스닥 등 거래소 상장
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleAdd("unlisted_stock")}
              className="flex flex-col items-center gap-1 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            >
              <span className="text-2xl">📋</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                비상장주식
              </span>
              <span className="text-xs text-gray-400 text-center">
                장외 거래 법인 주식·지분
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowAddPanel(false)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddPanel(true)}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
        >
          <span className="text-lg">+</span>
          주식·지분 추가
        </button>
      )}

      {/* 합계 */}
      <TotalStockValue items={items} heavyMap={heavyMap} />
    </div>
  );
}
