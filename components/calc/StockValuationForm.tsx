"use client";

/**
 * StockValuationForm — 상장·비상장주식 평가 입력 폼
 * 상속세·증여세 계산 마법사에서 주식 EstateItem[] 입력에 사용
 *
 * 상장주식: 평가기준일 전후 2개월 종가 단순평균 × 주식 수 (상증법 §63①1가)
 * 비상장주식: (순손익가치×3 + 순자산가치×2) ÷ 5
 *             부동산과다보유법인: 순손익가치×2 + 순자산가치×3 ÷ 5 (시행령 §54)
 */

import { useMemo, useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import {
  evaluateListedStockValue,
  calcUnlistedStockPerShareValue,
} from "@/lib/tax-engine/property-valuation-stock";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { EstateItem, UnlistedStockData, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";
import { KiwoomValuationAutoFetchButton } from "./KiwoomValuationAutoFetchButton";
import { EstateCommonAttributesSection } from "@/components/calc/inheritance/EstateCommonAttributesSection";
import { UnlistedStockSimpleFields } from "@/components/calc/UnlistedStockSimpleFields";
import {
  UnlistedStockV2Card,
  createDefaultUnlistedStockV2,
} from "@/components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card";

/**
 * 주식 자산 효과 평가액 — 상장: 평균가×주식수, 비상장: 선택 모드에 따라 간편/정식 평가.
 * PR-3: 모드 선택기 도입으로 V2 정식평가 결과도 반영.
 */
export function computeStockValuation(item: EstateItem): number {
  if (item.category === "listed_stock") {
    const avg = item.listedStockAvgPrice ?? 0;
    const shares = item.listedStockShares ?? 0;
    if (avg > 0 && shares > 0) return evaluateListedStockValue(avg, shares);
    return 0;
  }
  if (item.category === "unlisted_stock") {
    // 모드 판정 (레거시 fallback 포함)
    const activeMode: "simple" | "formal" =
      item.unlistedValuationMode ?? (item.unlistedStockValuationV2 ? "formal" : "simple");
    if (activeMode === "formal" && item.unlistedStockValuationV2) {
      const v2 = item.unlistedStockValuationV2;
      if (v2.totalShares > 0 && v2.ownedShares > 0) {
        try {
          const result = evaluateUnlistedStockV2(v2);
          return result.totalValuation > 0 ? result.totalValuation : 0;
        } catch {
          return 0;
        }
      }
    }
    if (item.unlistedStockData) {
      const d = item.unlistedStockData;
      if (d.totalShares > 0 && d.ownedShares > 0) {
        // 보충적 평가 1주당 가액 × 보유주식 수 (부동산과다보유 분기는 별도)
        const result = calcUnlistedStockPerShareValue(d, false);
        return result.perShareFinalValue * d.ownedShares;
      }
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

      {/* 공통속성 4블록 (EstateCommonAttributesSection) — PR-4: 상장·비상장 공용 */}
      <EstateCommonAttributesSection
        item={item}
        onUpdate={onUpdate}
        mode={mode}
        heirs={heirs}
        effectiveValuation={totalValue}
      />
    </div>
  );
}

// ============================================================
// 비상장주식 카드 — 모드 선택기 + 조건부 렌더 + 공통속성 (PR-3)
// ============================================================

/** 모드 판정 — 폼 state에서 현재 선택 모드를 도출 (레거시 fallback 포함) */
function resolveDisplayMode(item: EstateItem): "simple" | "formal" {
  return item.unlistedValuationMode ?? (item.unlistedStockValuationV2 ? "formal" : "simple");
}

// RadioCardGroup용 정적 tone 매핑 (feedback_tailwind_static_tone_mapping)
const VALUATION_MODE_OPTIONS = [
  {
    value: "simple" as const,
    label: "간편평가",
    description: "순손익·순자산 2개 수치 — 빠른 추산",
  },
  {
    value: "formal" as const,
    label: "정식평가",
    description: "별지 부표3 완전 재현 — 신고서용",
  },
];

interface UnlistedStockCardProps {
  item: EstateItem;
  index: number;
  isRealEstateHeavy: boolean;
  onUpdate: (updated: EstateItem) => void;
  onUpdateHeavy: (v: boolean) => void;
  onRemove: () => void;
  mode: "inheritance" | "gift";
  heirs?: Heir[];
}

function UnlistedStockCard({
  item,
  index,
  isRealEstateHeavy,
  onUpdate,
  onUpdateHeavy,
  onRemove,
  mode,
  heirs,
}: UnlistedStockCardProps) {
  const currentMode = resolveDisplayMode(item);

  // 협의분할 effectiveValuation 계산 — 선택 모드에 따라 다른 평가 함수 사용
  const effectiveValuation = useMemo(() => {
    if (currentMode === "formal" && item.unlistedStockValuationV2) {
      const v2 = item.unlistedStockValuationV2;
      if (v2.totalShares > 0 && v2.ownedShares > 0) {
        try {
          const result = evaluateUnlistedStockV2(v2);
          return result.totalValuation > 0 ? result.totalValuation : 0;
        } catch {
          return 0;
        }
      }
    }
    const data = item.unlistedStockData;
    if (data && data.totalShares > 0 && data.ownedShares > 0) {
      try {
        const preview = calcUnlistedStockPerShareValue(data, isRealEstateHeavy);
        return preview.perShareFinalValue * data.ownedShares;
      } catch {
        return 0;
      }
    }
    return 0;
  }, [currentMode, item, isRealEstateHeavy]);

  const handleModeChange = (newMode: "simple" | "formal") => {
    if (newMode === "formal" && !item.unlistedStockValuationV2) {
      // 정식 모드 최초 선택 → V2 초기값 생성 (C-3)
      onUpdate({
        ...item,
        unlistedValuationMode: "formal",
        unlistedStockValuationV2: createDefaultUnlistedStockV2(),
      });
    } else {
      // 간편 복귀 or 재진입 — V2 보존, mode만 변경 (C-2/C-5)
      onUpdate({ ...item, unlistedValuationMode: newMode });
    }
  };

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

      {/* ⚖️ 평가 방식 선택 — RadioCardGroup (PR-3, 계획서 §3) */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">⚖️ 평가 방식</p>
        <RadioCardGroup
          name={`unlisted-mode-${item.id}`}
          options={VALUATION_MODE_OPTIONS}
          value={currentMode}
          onChange={handleModeChange}
          tone="violet"
          layout="inline"
        />
      </div>

      {/* 선택 모드 입력 — simple: 간편 필드, formal: V2 카드 */}
      {currentMode === "simple" && (
        <UnlistedStockSimpleFields
          item={item}
          isRealEstateHeavy={isRealEstateHeavy}
          onUpdate={onUpdate}
          onUpdateHeavy={onUpdateHeavy}
        />
      )}
      {currentMode === "formal" && item.unlistedStockValuationV2 && (
        <UnlistedStockV2Card
          input={item.unlistedStockValuationV2}
          onChange={(next) => onUpdate({ ...item, unlistedStockValuationV2: next })}
        />
      )}

      {/* 공통속성 4블록 (EstateCommonAttributesSection) — PR-4: 모드 밖, 카드 하단 배치 */}
      <EstateCommonAttributesSection
        item={item}
        onUpdate={onUpdate}
        mode={mode}
        heirs={heirs}
        effectiveValuation={effectiveValuation}
      />
    </div>
  );
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
    } else if (item.category === "unlisted_stock") {
      // 모드 판정 — 정식 모드 우선 (PR-3)
      const activeMode: "simple" | "formal" =
        item.unlistedValuationMode ?? (item.unlistedStockValuationV2 ? "formal" : "simple");
      if (activeMode === "formal" && item.unlistedStockValuationV2) {
        try {
          const result = evaluateUnlistedStockV2(item.unlistedStockValuationV2);
          if (result.totalValuation > 0) total += result.totalValuation;
        } catch {
          // 입력 미완성 — 무시
        }
      } else if (item.unlistedStockData) {
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
            unlistedValuationMode: "simple" as const,
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
              <UnlistedStockCard
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
