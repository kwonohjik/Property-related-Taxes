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
import { resolveAssetToggleVisibility } from "@/lib/calc/asset-toggle-visibility";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { EstateItemHeader } from "@/components/calc/inheritance/estate-card/EstateItemHeader";
import { EstateChipInlineExpand } from "@/components/calc/inheritance/estate-card/EstateChipInlineExpand";
import { EstateItemAdvancedPanel } from "@/components/calc/inheritance/estate-card/EstateItemAdvancedPanel";
import {
  countNonDefaultOptions,
  cycleSection22,
  resolveChips,
  type ChipKey,
  type ChipState,
} from "@/components/calc/inheritance/estate-card/chip-config";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import {
  resolveSigunguCode,
  isReverseGeocodeError,
} from "@/lib/calc/vworld-reverse-geocode";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { TotalEstimatedValue } from "@/components/calc/property-valuation-preview";
import { CorporateNonBusinessAssetsSection } from "@/components/calc/inheritance/CorporateNonBusinessAssetsSection";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { EstateItem, AssetCategory, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

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
  financial: "예금·펀드·채권·공제금",
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
  financial: "예금·펀드·채권·공제금 등 잔액 또는 평가기준일 시가 (상증법 §62·시행령 §19①) — §22 금융재산공제 적용",
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
  /** 평가기준일 (상속개시일·증여일) — 기준시가 공시연도 기본값 계산용 */
  valuationDate?: string;
}

function ItemEditor({ item, index, onUpdate, onRemove, mode, heirs, valuationDate }: ItemEditorProps) {
  const cat = item.category as SupportedCategory;

  // 토글 자동 노출 정책 (asset-toggle-visibility resolver)
  const visibility = useMemo(() => resolveAssetToggleVisibility(item), [item]);
  // (hiddenExpandableCount·showExpanded 폐지 — EstateItemAdvancedPanel 내부에서 자체 관리)
  // 카드 압축 v4: 인라인 펼침 칩 키 + ⚙️ 패널 펼침 (자산별 로컬, accordion 단일)
  const [inlineExpandedKey, setInlineExpandedKey] = useState<ChipKey | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // 헤더 칩 도출 (mode·heirs 의존)
  const chips: ChipState[] = useMemo(
    () => resolveChips({ item, mode, heirsCount: heirs?.length ?? 0 }),
    [item, mode, heirs],
  );
  const advancedBadgeCount = useMemo(
    () => countNonDefaultOptions(item, mode),
    [item, mode],
  );

  // cash·financial·deposit은 단순 금액 입력만 — 감정가·공시지가·저당권 불필요
  const showMarketValue = true;
  const showAppraisedValue = cat !== "financial" && cat !== "deposit" && cat !== "cash";
  const showStandardPrice = cat === "real_estate_land" || cat === "real_estate_building" || cat === "real_estate_apartment";
  const showLeaseDeposit = cat === "real_estate_apartment" || cat === "real_estate_building" || cat === "deposit";
  const showMortgage = cat === "real_estate_land" || cat === "real_estate_building" || cat === "real_estate_apartment";

  /**
   * 담보채무 §14 자동공제 토글 노출 조건 (설계 §3-1 U-1):
   *   real_estate_land·apartment·building·deposit 카테고리
   *   AND (mortgageAmount > 0 OR leaseDeposit > 0)
   * 담보채권액이 없으면 토글 무의미 — 숨김.
   */
  const securedClaimTotal =
    (item.mortgageAmount ?? 0) + (item.leaseDeposit ?? 0);
  const showCollateralDeductToggle =
    mode === "inheritance" &&
    (cat === "real_estate_land" ||
      cat === "real_estate_apartment" ||
      cat === "real_estate_building" ||
      cat === "deposit") &&
    securedClaimTotal > 0;

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

  // 칩 클릭 핸들러 — Plan §3.5·Design D-O1·D2-C2
  function handleChipClick(chip: ChipState) {
    if (chip.key === "estimated-value") return;
    if (chip.key === "section22") {
      // 3-state 순환: undef → true → false → undef
      set({ isFinancialAssetForDeduction: cycleSection22(item.isFinancialAssetForDeduction) });
      return;
    }
    if (chip.key === "secured-claim-14") {
      // ON 상태에서만 칩 노출 → 클릭=OFF
      set({
        deductSecuredClaimAsDebt: undefined,
        securedClaimIsFinancialDebt: undefined,
        securedClaimCreditorName: undefined,
      });
      return;
    }
    // Expandable: accordion (key 동일 시 닫힘)
    setInlineExpandedKey((prev) => (prev === chip.key ? null : chip.key));
  }

  return (
    <div
      data-testid={`estate-card-shell-${item.id}`}
      className="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900"
    >
      {/* 헤더 (v4 압축: 아이콘+라벨+칩+⚙️+삭제) */}
      <EstateItemHeader
        itemId={item.id}
        icon={CATEGORY_ICONS[cat]}
        categoryLabel={CATEGORY_LABELS[cat]}
        index={index}
        chips={chips}
        expandedKey={inlineExpandedKey}
        onChipClick={handleChipClick}
        advancedOpen={advancedOpen}
        onToggleAdvanced={() => setAdvancedOpen((v) => !v)}
        advancedBadgeCount={advancedBadgeCount}
        onRemove={onRemove}
      />

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
                onChange={async (v) => {
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

                  const isFishing =
                    item.farmingCategory === "fishing_vessel" ||
                    item.farmingCategory === "fishing_right";

                  const patch: Partial<EstateItem> = { estateAddress };
                  // farmingCategory 분기 (UI-E1): 어선·어업권은 fishingAnchorLatLng로
                  if (estateLatLng) {
                    if (isFishing) patch.fishingAnchorLatLng = estateLatLng;
                    else patch.estateLatLng = estateLatLng;
                  }
                  if (auto) patch.name = auto;
                  set(patch);

                  // PR-RD-5b: 시·군·구 코드 자동 추출 (PNU 우선 → Vworld API fallback)
                  // 비동기 — 실패 시 사용자 수동 입력으로 fallback (UX 차단 없음)
                  if (v.pnu || estateLatLng) {
                    try {
                      const outcome = await resolveSigunguCode(
                        v.pnu || undefined,
                        estateLatLng?.lat,
                        estateLatLng?.lng,
                      );
                      if (!isReverseGeocodeError(outcome)) {
                        const codePatch: Partial<EstateItem> = {};
                        if (isFishing) {
                          codePatch.fishingAnchorSigunguCode = outcome.sigunguCode;
                        } else {
                          codePatch.estateSigunguCode = outcome.sigunguCode;
                        }
                        set(codePatch);
                      }
                      // error 시 silent — 기존 패턴 유지 (수동 입력 fallback)
                    } catch {
                      /* 네트워크 실패 silent */
                    }
                  }
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
            referenceDate={valuationDate}
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
          label="저당권 등에 의해 담보된 채권액"
          value={item.mortgageAmount != null ? String(item.mortgageAmount) : ""}
          onChange={(v) => set({ mortgageAmount: parseAmount(v) || undefined })}
          placeholder="없으면 빈칸"
          hint="평가기준일 현재 실제 채무 잔액(설정액 아님). §66 — 평가액이 더 크면 평가액으로 평가(차감 아님). 피상속인 채무이면 아래 토글로 §14 자동공제 가능."
        />
      )}

      {/* 담보채무 §14 자동공제 토글 (설계 §3-1 B4) — 상속세 모드 + 담보채권액 >0 시만 노출 */}
      {showCollateralDeductToggle && (
        <ToggleCard
          tone="amber"
          title="이 담보채무를 §14 부채로 자동 공제"
          description={
            item.deductSecuredClaimAsDebt
              ? "재산평가 담보채권액(저당 + 임대보증금)이 §14 채무로 과세가액에서 공제됩니다. 채무 명세(Step 2)에 중복 입력하지 마세요."
              : "타인 채무를 담보한 물상보증은 OFF 유지 — §14 공제 대상이 아닙니다(§14①3호 '피상속인의 채무')."
          }
          checked={item.deductSecuredClaimAsDebt ?? false}
          onCheckedChange={(v) =>
            set({
              deductSecuredClaimAsDebt: v || undefined,
              // OFF 시 하위 필드도 초기화
              securedClaimIsFinancialDebt: v
                ? item.securedClaimIsFinancialDebt
                : undefined,
              securedClaimCreditorName: v
                ? item.securedClaimCreditorName
                : undefined,
            })
          }
        >
          {/* 금융회사 채무 여부 (§22 순금융 차감 — 저당만) */}
          <ToggleCard
            tone="rose"
            size="sm"
            title="저당채무가 금융회사 채무 (§22 순금융 차감)"
            description="은행 등 §10①1호 입증 금융회사 저당이면 ON. 임대보증금은 §22 대상 아님(자동 제외)."
            checked={item.securedClaimIsFinancialDebt ?? false}
            onCheckedChange={(v) =>
              set({ securedClaimIsFinancialDebt: v || undefined })
            }
            disabled={(item.mortgageAmount ?? 0) === 0}
            disabledReason="저당채권액이 없으면 §22 금융채무 차감 무관"
          />
          {/* 채권자명 */}
          <div className="pt-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              채권자명 (선택)
            </label>
            <input
              type="text"
              value={item.securedClaimCreditorName ?? ""}
              onChange={(e) =>
                set({
                  securedClaimCreditorName: e.target.value || undefined,
                })
              }
              placeholder="채권자·내용 (미입력 시 자산명 담보채무)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </ToggleCard>
      )}

      {/* 법인 사업무관자산 차감 (§15⑤2호 + §16⑤2호) — corporate_stock 자산만 (PropertyValuationForm은 주식 미처리이나 안전상 보존) */}
      {mode === "inheritance" && (
        <CorporateNonBusinessAssetsSection item={item} onUpdate={onUpdate} />
      )}

      {/* ─────────────────────────────────────────────────────────
       * 헤더 칩 인라인 펼침 (분류·분할·영농·가업)
       * — Plan §3.5 · Design D-O1 단일 인스턴스 정책
       * ───────────────────────────────────────────────────────── */}
      <EstateChipInlineExpand
        expandedKey={inlineExpandedKey}
        itemId={item.id}
        item={item}
        onUpdate={onUpdate}
        heirs={heirs}
        onClose={() => setInlineExpandedKey(null)}
      />

      {/* ─────────────────────────────────────────────────────────
       * ⚙️ 고급 옵션 패널
       * — Plan §3.4 · Design D-O1·D-O2
       * ───────────────────────────────────────────────────────── */}
      {advancedOpen && mode === "inheritance" && (
        <EstateItemAdvancedPanel
          itemId={item.id}
          item={item}
          onUpdate={onUpdate}
          showSecuredClaimSubFields={showCollateralDeductToggle}
        />
      )}
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
  /** 평가기준일 (상속개시일·증여일) — 기준시가 공시연도 기본값 계산용 */
  valuationDate?: string;
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
  valuationDate,
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
              valuationDate={valuationDate}
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
