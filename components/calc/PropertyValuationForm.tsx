"use client";

/**
 * PropertyValuationForm — 부동산·금융·보증금 자산 평가 입력 폼
 * 상속세·증여세 계산 마법사에서 EstateItem[] 입력에 사용
 *
 * 지원 카테고리: real_estate_land, real_estate_building,
 *   real_estate_apartment, financial, deposit, other
 * 주식(listed_stock, unlisted_stock)은 StockValuationForm을 사용
 */

import { useMemo, useState } from "react";
import {
  countHiddenExpandable,
  resolveAssetToggleVisibility,
} from "@/lib/calc/asset-toggle-visibility";
import {
  HintBadge,
  getFamilyBusinessHint,
  getFinancialDeductionHint,
} from "@/components/calc/inheritance/AssetToggleHints";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { DeemedCategorySection } from "@/components/calc/inheritance/DeemedCategorySection";
import { FarmingCategorySection } from "@/components/calc/inheritance/FarmingCategorySection";
import { FamilyBusinessCategorySection } from "@/components/calc/inheritance/FamilyBusinessCategorySection";
import { CorporateNonBusinessAssetsSection } from "@/components/calc/inheritance/CorporateNonBusinessAssetsSection";
import { FinancialDeductionChip } from "@/components/calc/inheritance/FinancialDeductionChip";
import { HeirAllocationToggleSection } from "@/components/calc/inheritance/HeirAllocationToggleSection";
import type { EstateItem, AssetCategory, ValuationMethod, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 자산 카드별 "효과 평가액" 우선순위 — 시가 > 감정가 > 기준시가 > 보증금(deposit).
 * TotalEstimatedValue·HeirAllocationToggleSection 공통 사용.
 */
export function computeEffectiveValuation(item: EstateItem): number {
  if (item.category === "deposit") {
    return item.leaseDeposit ?? 0;
  }
  return (
    item.marketValue ??
    item.appraisedValue ??
    item.standardPrice ??
    0
  );
}

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

/**
 * 간주상속재산 분류별 허용 카테고리 (상속세 전용).
 *   - insurance (§8 보험금)  : 본질적으로 금전 → 현금·예금·기타만
 *   - trust     (§9 신탁재산) : 부동산·증권·금전신탁 다양 → 전체 허용
 *   - retirement(§10 퇴직금)  : 본질적으로 금전 → 현금·예금만
 */
const DEEMED_ALLOWED_CATEGORIES: Record<
  "none" | "insurance" | "trust" | "retirement",
  SupportedCategory[]
> = {
  none: INHERITANCE_CATEGORIES,
  insurance: ["cash", "financial", "other"],
  trust: INHERITANCE_CATEGORIES,
  retirement: ["cash", "financial"],
};

const DEEMED_FILTER_NOTE: Record<"insurance" | "trust" | "retirement", string> = {
  insurance: "§8 보험금은 본질적으로 금전 수령권 — 현금·예금·기타만 추가 가능합니다.",
  trust: "§9 신탁재산은 금전·부동산·증권 모두 가능 — 신탁 유형은 자산 추가 후 선택합니다.",
  retirement: "§10 퇴직금·연금 등은 금전 수령권 — 현금·예금만 추가 가능합니다.",
};

// ============================================================
// 개별 자산 항목 Form
// ============================================================

interface ItemEditorProps {
  item: EstateItem;
  index: number;
  onUpdate: (updated: EstateItem) => void;
  onRemove: () => void;
  /** 상속세 모드에서 협의분할 토글 노출 — gift 모드는 미렌더 */
  mode: "inheritance" | "gift";
  /** 협의분할 분배 후보 — inheritance 모드에서만 의미 */
  heirs?: Heir[];
}

function ItemEditor({ item, index, onUpdate, onRemove, mode, heirs }: ItemEditorProps) {
  const cat = item.category as SupportedCategory;

  // 토글 자동 노출 정책 (asset-toggle-visibility resolver)
  const visibility = useMemo(() => resolveAssetToggleVisibility(item), [item]);
  const hiddenExpandableCount = countHiddenExpandable(visibility);
  // 펼침 state — 자산별 로컬, 새로고침 시 OFF 리셋 (sessionStorage persist는 후속 PR)
  const [showExpanded, setShowExpanded] = useState(false);

  // cash·financial·deposit은 단순 금액 입력만 — 감정가·공시지가·저당권 불필요
  const showMarketValue = true;
  const showAppraisedValue = cat !== "financial" && cat !== "deposit" && cat !== "cash";
  const showStandardPrice = cat === "real_estate_land" || cat === "real_estate_building" || cat === "real_estate_apartment";
  const showLeaseDeposit = cat === "real_estate_apartment" || cat === "real_estate_building" || cat === "deposit";
  const showMortgage = cat === "real_estate_land" || cat === "real_estate_building" || cat === "real_estate_apartment";

  const set = (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });

  const propertyKind: "land" | "building_non_residential" | "house_individual" | "house_apart" =
    cat === "real_estate_apartment" ? "house_apart" :
    cat === "real_estate_building" ? "building_non_residential" :
    "land"; // real_estate_land

  // ── 공시가격 조회용 주소 상태 (C2 좌표 휘발 버그 수정: EstateItem.estateAddress + estateLatLng·fishingAnchorLatLng 영속화) ──
  // local state는 lat·lng 표시 동기화용 (string). 영속화는 onChange 시 item에 저장.
  const [addrValue, setAddrValue] = useState<AddressValue>(() => {
    // 어선·어업권은 fishingAnchorLatLng 우선, 그 외는 estateLatLng
    const isFishingInit =
      item.farmingCategory === "fishing_vessel" ||
      item.farmingCategory === "fishing_right";
    const latLng = isFishingInit ? item.fishingAnchorLatLng : item.estateLatLng;
    return {
      road: item.estateAddress?.road ?? "",
      jibun: item.estateAddress?.jibun ?? "",
      building: item.estateAddress?.building ?? "",
      detail: item.estateAddress?.detail ?? "",
      pnu: item.estateAddress?.pnu ?? "",
      lng: latLng ? String(latLng.lng) : "",
      lat: latLng ? String(latLng.lat) : "",
    };
  });
  /** 토지·건물용 단가 (원/㎡) — StandardPriceInput 내부 상태 유지용 */
  const [standardPricePerSqm, setStandardPricePerSqm] = useState("");

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

      {/* 자산명 — 부동산은 소재지 검색이 진입점, 어선·어업권은 선적지 검색, 그 외는 자유 입력 */}
      {(() => {
        const isRealEstate = cat === "real_estate_apartment" || cat === "real_estate_building" || cat === "real_estate_land";
        const isFishing =
          item.farmingCategory === "fishing_vessel" ||
          item.farmingCategory === "fishing_right";
        if (isRealEstate || isFishing) {
          return (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                자산 명칭 <span className="text-destructive">*</span>{" "}
                <span className="text-gray-400 font-normal">
                  ({isFishing && !isRealEstate ? "선적지·어장 연안 검색" : "소재지 검색"})
                </span>
              </label>
              <AddressSearch
                value={addrValue}
                onChange={(v) => {
                  setAddrValue(v);
                  // 도로명(우선)·지번 + 건물명·상세주소를 결합하여 자산명에 동기화
                  const parts = [v.road || v.jibun, v.building, v.detail].filter(Boolean);
                  const auto = parts.join(" ").trim();

                  // C2 좌표 휘발 버그 수정: EstateItem에 주소·좌표 영속화
                  const hasAddress = v.road || v.jibun || v.building || v.detail || v.pnu;
                  const estateAddress = hasAddress
                    ? {
                        road: v.road || undefined,
                        jibun: v.jibun || undefined,
                        building: v.building || undefined,
                        detail: v.detail || undefined,
                        pnu: v.pnu || undefined,
                      }
                    : undefined;
                  const latNum = v.lat ? parseFloat(v.lat) : NaN;
                  const lngNum = v.lng ? parseFloat(v.lng) : NaN;
                  const estateLatLng =
                    Number.isFinite(latNum) && Number.isFinite(lngNum)
                      ? { lat: latNum, lng: lngNum }
                      : undefined;

                  const patch: Partial<EstateItem> = { estateAddress };
                  // farmingCategory 분기 (UI-E1): 어선·어업권은 fishingAnchorLatLng로
                  if (estateLatLng) {
                    const isFishing =
                      item.farmingCategory === "fishing_vessel" ||
                      item.farmingCategory === "fishing_right";
                    if (isFishing) patch.fishingAnchorLatLng = estateLatLng;
                    else patch.estateLatLng = estateLatLng;
                  }
                  if (auto) patch.name = auto;
                  set(patch);
                }}
              />
              <input
                type="text"
                value={item.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="별칭 (선택 — 예: 강남 아파트, 본가 토지)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                ※ {isFishing && !isRealEstate
                  ? "선적지·어장 연안 주소를 검색하면 자산명·좌표가 자동 입력됩니다 (§16②1호나 거주지 30km 자동 검증용)"
                  : "소재지를 검색하면 자산명이 자동 입력됩니다. 필요 시 별칭으로 덮어쓸 수 있습니다."}
              </p>
            </div>
          );
        }
        // cash·financial·deposit·other — 자유 입력
        return (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              자산 명칭
            </label>
            <input
              type="text"
              value={item.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder={
                cat === "cash" ? "선택 입력 (예: 현금 보유)"
                : cat === "financial" ? "선택 입력 (예: ○○은행 보통예금)"
                : cat === "deposit" ? "선택 입력 (예: ○○시 ○○동 전세보증금)"
                : "선택 입력"
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        );
      })()}

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

      {/* 보충적 평가 (공시지가·기준시가) + 자동 조회 — 소재지는 상단 자산 명칭과 단일화 */}
      {showStandardPrice && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            {cat === "real_estate_land" ? "개별공시지가 (면적 포함 합산)" : "기준시가"}
          </label>
          {!addrValue.jibun && (
            <p className="text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
              ⚠️ 공시가격 자동 조회는 상단 <strong>자산 명칭(소재지 검색)</strong>에서 지번 주소를 선택해야 활성화됩니다.
            </p>
          )}
          <StandardPriceInput
            propertyKind={propertyKind}
            totalPrice={item.standardPrice != null ? String(item.standardPrice) : ""}
            onTotalPriceChange={(v) => set({ standardPrice: parseAmount(v) || undefined })}
            pricePerSqm={standardPricePerSqm}
            onPricePerSqmChange={setStandardPricePerSqm}
            jibun={addrValue.jibun}
            label=""
            hint="시가·감정가 모두 없을 때 최종 적용"
            enableLookup={true}
          />
        </div>
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

      {/* 간주상속재산 분류 (보험금·신탁·퇴직금) — 상속세 전용. 부동산은 §10 퇴직금 옵션 자동 숨김 */}
      {mode === "inheritance" && (
        <DeemedCategorySection
          item={item}
          onUpdate={onUpdate}
          retirementOptionVisibility={visibility.deemedRetirementOption}
        />
      )}

      {/* 영농상속 자산 분류 (§18의3 + 시행령 §16⑤) — 카테고리별 자동 노출 */}
      {mode === "inheritance" && visibility.farming === "default" && (
        <FarmingCategorySection item={item} onUpdate={onUpdate} />
      )}

      {/* 가업상속 자산 분류 (§18의2 + 상증령 §15⑤) — 카테고리별 자동 노출 */}
      {mode === "inheritance" && visibility.familyBusiness === "default" && (
        <FamilyBusinessCategorySection item={item} onUpdate={onUpdate} />
      )}

      {/* 법인 사업무관자산 차감 (§15⑤2호 + §16⑤2호) — corporate_stock 자산만 노출 */}
      {mode === "inheritance" && (
        <CorporateNonBusinessAssetsSection item={item} onUpdate={onUpdate} />
      )}

      {/* §22 금융재산공제 체크박스 — 카테고리별 자동 노출 */}
      {mode === "inheritance" && visibility.financialDeduction === "default" && (
        <FinancialDeductionChip item={item} onUpdate={onUpdate} />
      )}

      {/* 펼침 영역 — hidden_expandable 토글 모음 (계획서 §2 UI 패턴) */}
      {mode === "inheritance" && hiddenExpandableCount > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowExpanded((v) => !v)}
            aria-expanded={showExpanded}
            aria-controls={`expandable-toggles-${item.id}`}
            className="text-xs text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300 py-1"
          >
            {showExpanded
              ? "▲ 적용 옵션 접기"
              : `▼ 더 많은 적용 옵션 보기 (${hiddenExpandableCount}개)`}
          </button>
          {showExpanded && (
            <div id={`expandable-toggles-${item.id}`} className="space-y-2">
              {visibility.familyBusiness === "hidden_expandable" && (
                <div>
                  <HintBadge tone="amber">{getFamilyBusinessHint(cat)}</HintBadge>
                  <FamilyBusinessCategorySection item={item} onUpdate={onUpdate} />
                </div>
              )}
              {visibility.financialDeduction === "hidden_expandable" && (
                <div>
                  <HintBadge tone="emerald">{getFinancialDeductionHint(cat)}</HintBadge>
                  <FinancialDeductionChip item={item} onUpdate={onUpdate} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 상속인·수유자별 협의분할 (메인 PR 2 — 상속세 전용) */}
      {mode === "inheritance" && heirs && (
        <HeirAllocationToggleSection
          item={item}
          heirs={heirs}
          effectiveValuation={computeEffectiveValuation(item)}
          onChange={(patch) => onUpdate({ ...item, ...patch })}
        />
      )}
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
  /** "상속" 또는 "증여" — 안내 문구 조정 + 협의분할 노출 분기 */
  mode?: "inheritance" | "gift";
  /** 협의분할 분배 후보 — inheritance 모드에서 필수 */
  heirs?: Heir[];
}

let _nextId = 1;
function generateId() {
  return `prop-${Date.now()}-${_nextId++}`;
}


export function PropertyValuationForm({
  items,
  onChange,
  mode = "inheritance",
  heirs,
}: PropertyValuationFormProps) {
  const [showAddPanel, setShowAddPanel] = useState(false);
  // 자산 추가 시 미리 선택할 간주상속재산 분류 (상속세 모드 전용)
  const [pendingDeemed, setPendingDeemed] = useState<
    "none" | "insurance" | "trust" | "retirement"
  >("none");

  const handleAdd = (category: SupportedCategory) => {
    const newItem: EstateItem = {
      id: generateId(),
      category,
      name: "",
      // 상속세 모드에서 간주상속재산 분류가 선택되어 있으면 prefilled
      ...(mode === "inheritance" && pendingDeemed !== "none"
        ? { deemedCategory: pendingDeemed }
        : {}),
    };
    onChange([...items, newItem]);
    setShowAddPanel(false);
    setPendingDeemed("none");
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
              mode={mode}
              heirs={heirs}
            />
          ))}
        </div>
      )}

      {/* 자산 추가 패널 */}
      {showAddPanel ? (
        <div className="border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg p-4 space-y-3">
          {/* 상속세 모드 전용: 간주상속재산 분류 사전 선택 → 카드 필터링 */}
          {mode === "inheritance" && (
            <div className="rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/20 p-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold text-violet-800 dark:text-violet-200">
                간주상속재산 분류 (§8·§9·§10) — 선택하면 해당 분류에 맞는 재산 종류만 표시됩니다
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {([
                  { v: "none", label: "일반 상속재산" },
                  { v: "insurance", label: "보험금 (§8)" },
                  { v: "trust", label: "신탁재산 (§9)" },
                  { v: "retirement", label: "퇴직금 등 (§10)" },
                ] as const).map((opt) => {
                  const active = pendingDeemed === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setPendingDeemed(opt.v)}
                      className={
                        "px-2.5 py-1 rounded border transition-colors " +
                        (active
                          ? "border-violet-400 bg-violet-200/70 dark:bg-violet-800/40 text-violet-900 dark:text-violet-100 font-medium"
                          : "border-violet-200/70 dark:border-violet-800/70 bg-white/40 dark:bg-violet-950/10 text-violet-700 dark:text-violet-300 hover:bg-violet-100/60")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {pendingDeemed !== "none" && (
                <p className="text-[11px] text-violet-700 dark:text-violet-300 pt-0.5">
                  ⓘ {DEEMED_FILTER_NOTE[pendingDeemed]}
                </p>
              )}
            </div>
          )}

          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
            추가할 재산 종류 선택
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(mode === "gift"
              ? GIFT_CATEGORIES
              : DEEMED_ALLOWED_CATEGORIES[pendingDeemed]
            ).map((cat) => (
              <CategoryButton key={cat} category={cat} onAdd={handleAdd} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowAddPanel(false);
              setPendingDeemed("none");
            }}
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
