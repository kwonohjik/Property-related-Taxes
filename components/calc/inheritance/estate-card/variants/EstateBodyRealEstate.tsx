"use client";

/**
 * EstateBodyRealEstate — real_estate_land·building·apartment 본체 입력
 *
 * Plan estate-card-followup-phase2 §1.2·Visual §1.2
 *
 * 본체 구성 [Plan AN-FU1-2·UV2-1]:
 *   - 소재지 (AddressSearch — fishing 분기 시 "선적지·어장 연안 검색" 라벨)
 *   - 시가 · 감정평가액
 *   - 보충적 평가 (StandardPriceInput — 자동조회 + 단가 local state)
 *   - 임대보증금 (apartment·building만 노출, land 미노출)
 *   - 저당권 채권액
 *   - §14 자동공제 ToggleCard (조건부)
 */

import { useState } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { EstateBodySection } from "./EstateBodySection";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import {
  resolveSigunguCode,
  isReverseGeocodeError,
} from "@/lib/calc/vworld-reverse-geocode";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  isFishingAsset,
  makePatcher,
  resolvePropertyKind,
} from "./EstateBodyHelpers";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { VariantBodyProps } from "./types";

const PRIORITY_HINT: Record<
  "real_estate_land" | "real_estate_building" | "real_estate_apartment",
  string
> = {
  real_estate_land: "시가 → 감정가 → 개별공시지가 순으로 적용 (상증법 §61①)",
  real_estate_building: "시가 → 감정가 → 개별주택가격·기준시가 순 (상증법 §61①)",
  real_estate_apartment: "시가 → 감정가 → 공동주택 기준시가 순 (상증법 §61①)",
};

const SUBTITLE: Record<
  "real_estate_land" | "real_estate_building" | "real_estate_apartment",
  string
> = {
  real_estate_land: "소재지 · 시가 · 감정가 · 개별공시지가 — 상증법 §60~66",
  real_estate_building: "소재지 · 시가 · 감정가 · 기준시가 — 상증법 §60~66",
  real_estate_apartment: "소재지 · 시가 · 감정가 · 공동주택 기준시가 — 상증법 §60~66",
};

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function EstateBodyRealEstate({
  item,
  onUpdate,
  valuationDate,
  showCollateralDeductToggle,
  hasCohabitantChild = false,
}: VariantBodyProps) {
  const cat = item.category as
    | "real_estate_land"
    | "real_estate_building"
    | "real_estate_apartment";
  const set = makePatcher(item, onUpdate);
  const propertyKind = resolvePropertyKind(cat);

  // 부동산 본체 local state — variant 내부 유지 (Shell collapse는 외곽 hidden, unmount 0)
  const [addrValue, setAddrValue] = useState<AddressValue>(() => {
    const fishing = isFishingAsset(item);
    const latLng = fishing ? item.fishingAnchorLatLng : item.estateLatLng;
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
  const [standardPricePerSqm, setStandardPricePerSqm] = useState("");

  const showLeaseDeposit =
    cat === "real_estate_apartment" || cat === "real_estate_building";

  return (
    <div
      data-testid={`estate-body-variant-realestate-${item.id}`}
      className="space-y-3"
    >
      <EstateBodySection title="평가액 입력" subtitle={SUBTITLE[cat]}>
      {/* 소재지 (AddressSearch + 별칭 + Vworld 좌표 자동) */}
      <FieldCard
        label={`자산 명칭 (${isFishingAsset(item) ? "선적지·어장 연안 검색" : "소재지 검색"})`}
        required
        hint={
          isFishingAsset(item)
            ? "선적지·어장 연안 주소를 검색하면 자산명·좌표가 자동 입력됩니다 (§16②1호나 거주지 30km 자동 검증용)"
            : "소재지를 검색하면 자산명이 자동 입력됩니다. 필요 시 아래 별칭으로 덮어쓸 수 있습니다."
        }
      >
        <AddressSearch
          value={addrValue}
          onChange={async (v) => {
            setAddrValue(v);
            const parts = [v.road || v.jibun, v.building, v.detail].filter(Boolean);
            const auto = parts.join(" ").trim();
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
            const fishing = isFishingAsset(item);

            const patch: Partial<EstateItem> = { estateAddress };
            if (estateLatLng) {
              if (fishing) patch.fishingAnchorLatLng = estateLatLng;
              else patch.estateLatLng = estateLatLng;
            }
            if (auto) patch.name = auto;
            set(patch);

            // 시·군·구 코드 자동 추출 (PNU 우선 → Vworld API fallback)
            if (v.pnu || estateLatLng) {
              try {
                const outcome = await resolveSigunguCode(
                  v.pnu || undefined,
                  estateLatLng?.lat,
                  estateLatLng?.lng,
                );
                if (!isReverseGeocodeError(outcome)) {
                  const codePatch: Partial<EstateItem> = {};
                  if (fishing) {
                    codePatch.fishingAnchorSigunguCode = outcome.sigunguCode;
                  } else {
                    codePatch.estateSigunguCode = outcome.sigunguCode;
                  }
                  set(codePatch);
                }
              } catch {
                /* 네트워크 실패 silent */
              }
            }
          }}
        />
      </FieldCard>

      {/* 별칭 */}
      <FieldCard label="별칭" hint="선택 — 자산을 구분할 이름 (소재지 검색 시 자동 입력된 자산명을 덮어씀)">
        <input
          type="text"
          value={item.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="예: 강남 아파트, 본가 토지"
          className={TEXT_INPUT_CLASS}
        />
      </FieldCard>

      {/* 평가 우선순위 안내 */}
      <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded px-3 py-2">
        ℹ️ {PRIORITY_HINT[cat]}
      </p>

      {/* [UX3-Issue3] 시가·감정가는 RealEstateAdvancedFields(advanced 토글)로 이동.
          기준시가는 대표 평가액으로 항상 노출 유지. */}

      {/* 보충적 평가 (StandardPriceInput) — 복합 위젯이라 children으로 직접 배치 */}
      <FieldCard
        label={cat === "real_estate_land" ? "개별공시지가 (면적 포함 합산)" : "기준시가"}
        hint="시가·감정가 모두 없을 때 최종 적용"
      >
        <div className="space-y-2">
          {!addrValue.jibun && (
            <p className="text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
              ⚠️ 공시가격 자동 조회는 상단 <strong>자산 명칭(소재지 검색)</strong>에서
              지번 주소를 선택해야 활성화됩니다.
            </p>
          )}
          <StandardPriceInput
            propertyKind={propertyKind}
            referenceDate={valuationDate}
            totalPrice={item.standardPrice != null ? String(item.standardPrice) : ""}
            onTotalPriceChange={(v) =>
              set({ standardPrice: parseAmount(v) || undefined })
            }
            pricePerSqm={standardPricePerSqm}
            onPricePerSqmChange={setStandardPricePerSqm}
            jibun={addrValue.jibun}
            label=""
            enableLookup={true}
          />
        </div>
      </FieldCard>

      </EstateBodySection>

      {/* [UX3-Issue3] 시가·감정가·임대보증금·저당권 advanced 토글
          기본 노출은 기준시가만, 시가/감정가/임대보증금/저당권은 토글 ON 시 펼침.
          기존 데이터 있으면 자동 ON (비파괴). §14 자동공제 토글도 children 안쪽으로 이동. */}
      <RealEstateAdvancedFields
        item={item}
        set={set}
        showLeaseDeposit={showLeaseDeposit}
        showCollateralDeductToggle={showCollateralDeductToggle}
        showCohabitToggle={showLeaseDeposit}
        hasCohabitantChild={hasCohabitantChild}
      />
    </div>
  );
}

// ============================================================
// RealEstateAdvancedFields — Issue 3 advanced 토글 묶음
// ============================================================

interface RealEstateAdvancedFieldsProps {
  item: EstateItem;
  set: (patch: Partial<EstateItem>) => void;
  showLeaseDeposit: boolean;
  showCollateralDeductToggle: boolean;
  /** §23의2 동거주택 체크 노출 (주택 카테고리: apartment·building) */
  showCohabitToggle: boolean;
  /** 동거 자녀 존재 여부 — 미존재 시 체크 disabled */
  hasCohabitantChild: boolean;
}

function RealEstateAdvancedFields({
  item,
  set,
  showLeaseDeposit,
  showCollateralDeductToggle,
  showCohabitToggle,
  hasCohabitantChild,
}: RealEstateAdvancedFieldsProps) {
  // [UX3-AC13] mount 1회만 평가 — Shell collapse는 outer hidden이라 EstateBody는 unmount 안 됨.
  // 사용자가 OFF로 닫아도 store 값은 보존(비파괴) — 재 ON 시 그대로 노출.
  const hasAdvancedValue =
    (item.marketValue ?? 0) > 0 ||
    (item.appraisedValue ?? 0) > 0 ||
    (item.leaseDeposit ?? 0) > 0 ||
    (item.mortgageAmount ?? 0) > 0;
  const [advancedOpen, setAdvancedOpen] = useState(hasAdvancedValue);

  return (
    <ToggleCard
      tone="amber"
      title="시가·감정가·임대보증금·저당권 입력"
      description="해당 사항이 있는 경우에만 ON — 시가·감정가가 있으면 기준시가보다 우선 적용됩니다 (상증법 §60①)"
      checked={advancedOpen}
      onCheckedChange={setAdvancedOpen}
    >
      {/* 시가 */}
      <FieldCard
        label="시가 (매매·수용·경매가액)"
        unit="원"
        hint="평가기간(±6개월) 내 실거래가"
      >
        <CurrencyInput
          label="시가 (매매·수용·경매가액)"
          value={item.marketValue != null ? String(item.marketValue) : ""}
          onChange={(v) => set({ marketValue: parseAmount(v) || undefined })}
          placeholder="없으면 빈칸"
          hideLabel
          hideUnit
        />
      </FieldCard>

      {/* 감정평가액 */}
      <FieldCard
        label="감정평가액"
        unit="원"
        hint="감정평가법인 감정가 (시가 없을 때 2순위)"
      >
        <CurrencyInput
          label="감정평가액"
          value={item.appraisedValue != null ? String(item.appraisedValue) : ""}
          onChange={(v) => set({ appraisedValue: parseAmount(v) || undefined })}
          placeholder="없으면 빈칸"
          hideLabel
          hideUnit
        />
      </FieldCard>

      {/* 임대보증금 (apartment·building만 — land 미노출 [UV2-1]) */}
      {showLeaseDeposit && (
        <FieldCard
          label="임대보증금 (세입자 있는 경우)"
          unit="원"
          hint="평가액에서 차감됨"
        >
          <CurrencyInput
            label="임대보증금 (세입자 있는 경우)"
            value={item.leaseDeposit != null ? String(item.leaseDeposit) : ""}
            onChange={(v) => set({ leaseDeposit: parseAmount(v) || undefined })}
            placeholder="없으면 빈칸"
            hideLabel
            hideUnit
          />
        </FieldCard>
      )}

      {/* 저당권 */}
      <FieldCard
        label="저당권 등에 의해 담보된 채권액"
        unit="원"
        hint="평가기준일 현재 실제 채무 잔액(설정액 아님). §66 — 평가액이 더 크면 평가액으로 평가(차감 아님). 피상속인 채무이면 아래 토글로 §14 자동공제 가능."
      >
        <CurrencyInput
          label="저당권 등에 의해 담보된 채권액"
          value={item.mortgageAmount != null ? String(item.mortgageAmount) : ""}
          onChange={(v) => set({ mortgageAmount: parseAmount(v) || undefined })}
          placeholder="없으면 빈칸"
          hideLabel
          hideUnit
        />
      </FieldCard>

      {/* §14 자동공제 토글 — [UX3-AC15·16] advanced children 안쪽으로 이동.
          OFF 시 함께 숨김으로 사용자 혼란(외곽 표시) 차단. */}
      {showCollateralDeductToggle && (
        <ToggleCard
          tone="amber"
          size="sm"
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
              securedClaimIsFinancialDebt: v ? item.securedClaimIsFinancialDebt : undefined,
              securedClaimCreditorName: v ? item.securedClaimCreditorName : undefined,
            })
          }
        >
          {/* 금융회사 채무 여부 (§22 순금융 차감) */}
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

      {/* §23의2 동거주택 공제 대상 — 체크 시 본 자산의 기준시가가 동거주택 공제로 자동 도출(gross, 담보채무는 엔진 차감) */}
      {showCohabitToggle && (
        <div data-testid={`cohabit-house-toggle-${item.id}`}>
          <ToggleCard
            tone="violet"
            size="sm"
            title="동거주택 공제 대상 (§23의2)"
            description="10년 이상 동거·무주택 자녀가 상속받는 주택 — 위 기준시가가 §23의2 공제에 자동 사용됩니다 (담보채무 차감 후 100%, 최대 6억)."
            checked={item.isCohabitantHouse ?? false}
            onCheckedChange={(v) => set({ isCohabitantHouse: v || undefined })}
            disabled={!hasCohabitantChild}
            disabledReason="상속인 구성(Step 0)에서 자녀의 동거(isCohabitant) 여부를 먼저 설정하세요."
          />
        </div>
      )}
    </ToggleCard>
  );
}
