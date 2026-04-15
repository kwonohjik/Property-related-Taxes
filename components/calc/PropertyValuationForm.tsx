"use client";

/**
 * PropertyValuationForm — 부동산·금융·보증금 자산 평가 입력 폼
 * 상속세·증여세 계산 마법사에서 EstateItem[] 입력에 사용
 *
 * 지원 카테고리: real_estate_land, real_estate_building,
 *   real_estate_apartment, financial, deposit, other
 * 주식(listed_stock, unlisted_stock)은 StockValuationForm을 사용
 */

import { useState } from "react";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { EstateItem, AssetCategory, ValuationMethod } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 카테고리 메타
// ============================================================

type SupportedCategory = Exclude<AssetCategory, "listed_stock" | "unlisted_stock">;

const CATEGORY_LABELS: Record<SupportedCategory, string> = {
  real_estate_land: "토지",
  real_estate_building: "건물 (단독주택·상업용)",
  real_estate_apartment: "아파트·공동주택",
  cash: "현금",
  financial: "예금·펀드·채권",
  deposit: "전세보증금 반환채권",
  other: "기타 재산",
};

const CATEGORY_ICONS: Record<SupportedCategory, string> = {
  real_estate_land: "🏔",
  real_estate_building: "🏠",
  real_estate_apartment: "🏢",
  cash: "💵",
  financial: "🏦",
  deposit: "🔑",
  other: "📦",
};

const VALUATION_PRIORITY_HINT: Record<SupportedCategory, string> = {
  real_estate_land: "시가 → 감정가 → 개별공시지가 순으로 적용 (상증법 §61①)",
  real_estate_building: "시가 → 감정가 → 개별주택가격·기준시가 순 (상증법 §61①)",
  real_estate_apartment: "시가 → 감정가 → 공동주택 기준시가 순 (상증법 §61①)",
  cash: "현금 액면가 = 시가 (상증법 §60) — §22 금융재산공제 대상 아님",
  financial: "잔액 또는 평가기준일 시가 (상증법 §62) — §22 금융재산공제 적용",
  deposit: "임차인이 임대인에게 맡긴 전세보증금 — 반환받을 채권 액면가 (상속세 전용)",
  other: "시가 우선 원칙 (상증법 §60)",
};

/** 증여세 폼에서 노출할 카테고리 (deposit 제외) */
const GIFT_CATEGORIES: SupportedCategory[] = [
  "real_estate_apartment",
  "real_estate_building",
  "real_estate_land",
  "cash",
  "financial",
  "other",
];

/** 상속세 폼에서 노출할 카테고리 (deposit 포함) */
const INHERITANCE_CATEGORIES: SupportedCategory[] = [
  "real_estate_apartment",
  "real_estate_building",
  "real_estate_land",
  "cash",
  "financial",
  "deposit",
  "other",
];

// ============================================================
// 개별 자산 항목 Form
// ============================================================

interface ItemEditorProps {
  item: EstateItem;
  index: number;
  onUpdate: (updated: EstateItem) => void;
  onRemove: () => void;
}

function ItemEditor({ item, index, onUpdate, onRemove }: ItemEditorProps) {
  const cat = item.category as SupportedCategory;
  // cash·financial·deposit은 단순 금액 입력만 — 감정가·공시지가·저당권 불필요
  const showMarketValue = true;
  const showAppraisedValue = cat !== "financial" && cat !== "deposit" && cat !== "cash";
  const showStandardPrice = cat === "real_estate_land" || cat === "real_estate_building" || cat === "real_estate_apartment";
  const showLeaseDeposit = cat === "real_estate_apartment" || cat === "real_estate_building" || cat === "deposit";
  const showMortgage = cat === "real_estate_land" || cat === "real_estate_building" || cat === "real_estate_apartment";

  const set = (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{CATEGORY_ICONS[cat]}</span>
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
            {CATEGORY_LABELS[cat]} {index + 1}
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

      {/* 자산명 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          자산 명칭 <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={item.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={cat === "real_estate_apartment" ? "예: ○○아파트 101동 201호" : "예: ○○시 ○○동 ○○번지"}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* 평가 우선순위 안내 */}
      <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded px-3 py-2">
        ℹ️ {VALUATION_PRIORITY_HINT[cat]}
      </p>

      {/* 임대보증금 전용 입력 */}
      {cat === "deposit" && (
        <CurrencyInput
          label="임대보증금"
          value={item.leaseDeposit != null ? String(item.leaseDeposit) : ""}
          onChange={(v) => set({ leaseDeposit: parseAmount(v) })}
          hint="환산가액 = 보증금 ÷ 12%"
          required
        />
      )}

      {/* 시가 */}
      {showMarketValue && cat !== "deposit" && (
        <CurrencyInput
          label={
            cat === "cash" ? "현금 금액" :
            cat === "financial" ? "잔액 또는 시가" :
            "시가 (매매·수용·경매가액)"
          }
          value={item.marketValue != null ? String(item.marketValue) : ""}
          onChange={(v) => set({ marketValue: parseAmount(v) || undefined })}
          placeholder="없으면 빈칸"
          hint={
            cat === "cash" ? "지폐·동전 실제 보유액 (§22 금융재산공제 미적용)" :
            cat === "financial" ? "평가기준일 현재 잔액" :
            "평가기간(±6개월) 내 실거래가"
          }
        />
      )}

      {/* 감정평가액 */}
      {showAppraisedValue && (
        <CurrencyInput
          label="감정평가액"
          value={item.appraisedValue != null ? String(item.appraisedValue) : ""}
          onChange={(v) => set({ appraisedValue: parseAmount(v) || undefined })}
          placeholder="없으면 빈칸"
          hint="감정평가법인 감정가 (시가 없을 때 2순위)"
        />
      )}

      {/* 보충적 평가 (공시지가·기준시가) */}
      {showStandardPrice && (
        <CurrencyInput
          label={cat === "real_estate_land" ? "개별공시지가 (면적 포함 합산)" : "기준시가"}
          value={item.standardPrice != null ? String(item.standardPrice) : ""}
          onChange={(v) => set({ standardPrice: parseAmount(v) || undefined })}
          placeholder="없으면 빈칸"
          hint="시가·감정가 모두 없을 때 최종 적용"
        />
      )}

      {/* 임대보증금 차감 (아파트·건물) */}
      {showLeaseDeposit && cat !== "deposit" && (
        <CurrencyInput
          label="임대보증금 (세입자 있는 경우)"
          value={item.leaseDeposit != null ? String(item.leaseDeposit) : ""}
          onChange={(v) => set({ leaseDeposit: parseAmount(v) || undefined })}
          placeholder="없으면 빈칸"
          hint="평가액에서 차감됨"
        />
      )}

      {/* 저당권 */}
      {showMortgage && (
        <CurrencyInput
          label="저당권 설정액"
          value={item.mortgageAmount != null ? String(item.mortgageAmount) : ""}
          onChange={(v) => set({ mortgageAmount: parseAmount(v) || undefined })}
          placeholder="없으면 빈칸"
          hint="평가액에서 차감됨 (상증법 §61 특례)"
        />
      )}

      {/* 예상 순 평가액 미리보기 */}
      <EstimatedValuePreview item={item} />
    </div>
  );
}

// ============================================================
// 예상 평가액 미리보기
// ============================================================

function EstimatedValuePreview({ item }: { item: EstateItem }) {
  let base = 0;
  let method: ValuationMethod = "standard_price";

  if (item.category === "deposit") {
    base = item.leaseDeposit ?? 0;
    method = "market_value";
  } else if (item.marketValue && item.marketValue > 0) {
    base = item.marketValue;
    method = "market_value";
  } else if (item.appraisedValue && item.appraisedValue > 0) {
    base = item.appraisedValue;
    method = "appraisal";
  } else if (item.standardPrice && item.standardPrice > 0) {
    base = item.standardPrice;
    method = "standard_price";
  }

  const deductions = (item.leaseDeposit ?? 0) + (item.mortgageAmount ?? 0);
  const net = Math.max(0, base - (item.category !== "deposit" ? deductions : 0));

  if (base === 0) return null;

  const methodLabel: Record<ValuationMethod, string> = {
    market_value: "시가",
    appraisal: "감정가",
    standard_price: "보충적 평가",
    similar_sales: "유사매매사례",
    acquisition_cost: "취득가액",
    book_value: "장부가액",
  };

  return (
    <div className="rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs space-y-1">
      <div className="flex justify-between text-gray-500 dark:text-gray-400">
        <span>적용 방법</span>
        <span className="font-medium text-indigo-600 dark:text-indigo-400">
          {methodLabel[method]}
        </span>
      </div>
      {deductions > 0 && item.category !== "deposit" && (
        <div className="flex justify-between text-gray-500 dark:text-gray-400">
          <span>차감 (보증금+저당)</span>
          <span>- {formatKRW(deductions)}</span>
        </div>
      )}
      <div className="flex justify-between font-semibold border-t border-gray-200 dark:border-gray-700 pt-1">
        <span>예상 순 평가액</span>
        <span className="text-indigo-700 dark:text-indigo-300">{formatKRW(net)}</span>
      </div>
    </div>
  );
}

// ============================================================
// 카테고리 선택 버튼
// ============================================================

interface CategoryButtonProps {
  category: SupportedCategory;
  onAdd: (cat: SupportedCategory) => void;
}

function CategoryButton({ category, onAdd }: CategoryButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onAdd(category)}
      className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-xs"
    >
      <span className="text-xl">{CATEGORY_ICONS[category]}</span>
      <span className="text-gray-600 dark:text-gray-300 text-center leading-tight">
        {CATEGORY_LABELS[category]}
      </span>
    </button>
  );
}

// ============================================================
// 총 예상 평가액 합산
// ============================================================

function TotalEstimatedValue({ items }: { items: EstateItem[] }) {
  let total = 0;
  for (const item of items) {
    let base = 0;
    if (item.category === "deposit") {
      base = item.leaseDeposit ?? 0;
    } else if (item.marketValue && item.marketValue > 0) {
      base = item.marketValue;
    } else if (item.appraisedValue && item.appraisedValue > 0) {
      base = item.appraisedValue;
    } else if (item.standardPrice && item.standardPrice > 0) {
      base = item.standardPrice;
    }
    const deductions = (item.category !== "deposit")
      ? (item.leaseDeposit ?? 0) + (item.mortgageAmount ?? 0)
      : 0;
    total += Math.max(0, base - deductions);
  }

  if (total === 0 || items.length === 0) return null;

  return (
    <div className="rounded-md border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 flex justify-between items-center">
      <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
        재산 합계 (예상)
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

export interface PropertyValuationFormProps {
  /** 현재 자산 목록 (주식 제외) */
  items: EstateItem[];
  onChange: (items: EstateItem[]) => void;
  /** "상속" 또는 "증여" — 안내 문구 조정 */
  mode?: "inheritance" | "gift";
}

let _nextId = 1;
function generateId() {
  return `prop-${Date.now()}-${_nextId++}`;
}


export function PropertyValuationForm({
  items,
  onChange,
  mode = "inheritance",
}: PropertyValuationFormProps) {
  const [showAddPanel, setShowAddPanel] = useState(false);

  const handleAdd = (category: SupportedCategory) => {
    const newItem: EstateItem = {
      id: generateId(),
      category,
      name: "",
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

  const modeLabel = mode === "inheritance" ? "상속" : "증여";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {modeLabel}재산 목록
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            주식·지분은 아래 <span className="text-indigo-600 dark:text-indigo-400">주식평가</span> 섹션에 별도 입력
          </p>
        </div>
        {items.length > 0 && (
          <span className="text-xs text-gray-400">{items.length}개 입력됨</span>
        )}
      </div>

      {/* 자산 목록 */}
      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((item, i) => (
            <ItemEditor
              key={item.id}
              item={item}
              index={i}
              onUpdate={(updated) => handleUpdate(i, updated)}
              onRemove={() => handleRemove(i)}
            />
          ))}
        </div>
      )}

      {/* 자산 추가 패널 */}
      {showAddPanel ? (
        <div className="border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
            추가할 재산 종류 선택
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(mode === "gift" ? GIFT_CATEGORIES : INHERITANCE_CATEGORIES).map((cat) => (
              <CategoryButton key={cat} category={cat} onAdd={handleAdd} />
            ))}
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
          {modeLabel}재산 추가
        </button>
      )}

      {/* 합계 */}
      <TotalEstimatedValue items={items} />
    </div>
  );
}
