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
import { ReferenceSiteLinks, REFERENCE_SITES } from "@/components/calc/inputs/ReferenceSiteLink";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { EstateBodySection } from "./EstateBodySection";
import { RealEstateBurdenedGiftField } from "./RealEstateBurdenedGiftField";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import {
  resolveSigunguCode,
  isReverseGeocodeError,
} from "@/lib/calc/vworld-reverse-geocode";
import { EstateBodySupplementaryValuation } from "./EstateBodySupplementaryValuation";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  RadioCardGroup,
  type RadioCardOption,
} from "@/components/calc/inputs/RadioCardGroup";
import {
  buildAddressPatch,
  isFishingAsset,
  makePatcher,
  resolvePropertyKind,
} from "./EstateBodyHelpers";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { VariantBodyProps } from "./types";
import { ValuationAccordionFields } from "./EstateValuationAccordionFields";
import { BurdenedGiftTransferSection } from "./BurdenedGiftTransferSection";
import { giftBurdenedDistrictResetPatch } from "@/lib/calc/gift-burdened-one-house";
import { Frac } from "@/components/calc/results/shared/FormulaParts";

// ============================================================
// §23의2 자산 유형 옵션 — 정적 정의 (Tailwind JIT purge 안전)
// ============================================================

type CohabitHouseRightType = "house" | "single_redev_right" | "one_plus_one_right" | "sale_right";

const COHABIT_RIGHT_OPTIONS: RadioCardOption<CohabitHouseRightType>[] = [
  {
    value: "house",
    label: "일반주택 (공제 적용)",
  },
  {
    value: "single_redev_right",
    label: "1세대1주택 단일 조합원입주권 (적용 가능 — 확인 필요)",
    hint: (
      <span className="text-amber-700 dark:text-amber-400">
        멸실 후 입주권 외 다른 주택 없는 경우 적용 가능성 있음 (재산세제과-237).
        사례별 세무사 확인 권장.
      </span>
    ),
  },
  {
    value: "one_plus_one_right",
    label: "1+1 조합원입주권 (미적용)",
    hint: (
      <span className="text-rose-700 dark:text-rose-400">
        1+1 입주권은 §23의2 동거주택 상속공제 미적용 (조심 2021중6665 등). 공제 0 처리.
      </span>
    ),
  },
  {
    value: "sale_right",
    label: "분양권 (미적용)",
    hint: (
      <span className="text-rose-700 dark:text-rose-400">
        분양권은 §23의2① 주택에 해당하지 않아 미적용. 공제 0 처리.
      </span>
    ),
  },
];

const PRIORITY_HINT: Record<
  "real_estate_land" | "real_estate_building" | "real_estate_apartment",
  string
> = {
  real_estate_land: "시가 → 감정가 → 매매사례가 → 개별공시지가 순 (상증법 §60·시행령 §49②④)",
  real_estate_building: "시가 → 감정가 → 매매사례가 → 건물 기준시가 순 (상증법 §60·시행령 §49②④)",
  real_estate_apartment:
    "시가 → 감정가 → 매매사례가 → 주택 기준시가(공동·개별주택가격) 순 (상증법 §60·시행령 §49②④)",
};

// 보충적 평가방법 라벨 (D-2) — 물건별 법정 용어 병기
const SUPPLEMENTARY_LABEL: Record<
  "real_estate_land" | "real_estate_building" | "real_estate_apartment",
  string
> = {
  real_estate_land: "보충적 평가방법 (토지: 개별공시지가, 면적 포함 합산)",
  real_estate_building: "보충적 평가방법 (건물: 기준시가)",
  real_estate_apartment: "보충적 평가방법 (주택: 공동·개별주택가격)",
};

const SUBTITLE: Record<
  "real_estate_land" | "real_estate_building" | "real_estate_apartment",
  string
> = {
  real_estate_land: "소재지 · 시가 · 감정가 · 개별공시지가 — 상증법 §60~66",
  real_estate_building: "상업용 건물 · 시가 · 감정가 · 건물 기준시가 — 상증법 §60~66",
  real_estate_apartment:
    "주택(아파트·공동·단독) · 시가 · 감정가 · 주택 기준시가 — 상증법 §60~66",
};

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function EstateBodyRealEstate({
  item,
  onUpdate,
  valuationDate,
  showCollateralDeductToggle,
  hasCohabitantChild = false,
  hasOtherBurdenedGiftTransfer = false,
  mode = "inheritance",
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
      dong: item.estateAddress?.dong ?? "",
      ho: item.estateAddress?.ho ?? "",
      lng: latLng ? String(latLng.lng) : "",
      lat: latLng ? String(latLng.lat) : "",
    };
  });
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
            const fishing = isFishingAsset(item);

            // 시·군·구 코드를 먼저 확정(await)한 뒤 전체 패치를 단일 set 으로 적용.
            // (기존 2차 set 은 진입 시점 stale item 을 merge 해 estateAddress 를 덮어쓰는
            //  race 버그가 있었음 — buildAddressPatch + 단일 set 으로 차단)
            const latNum = v.lat ? parseFloat(v.lat) : NaN;
            const lngNum = v.lng ? parseFloat(v.lng) : NaN;
            const hasCoord = Number.isFinite(latNum) && Number.isFinite(lngNum);

            let sigunguCode: string | undefined;
            if (v.pnu || hasCoord) {
              try {
                const outcome = await resolveSigunguCode(
                  v.pnu || undefined,
                  hasCoord ? latNum : undefined,
                  hasCoord ? lngNum : undefined,
                );
                if (!isReverseGeocodeError(outcome)) {
                  sigunguCode = outcome.sigunguCode;
                }
              } catch {
                /* 네트워크 실패 silent */
              }
            }

            // 부담부 양도 「지정 지구 안인가」 답은 그 소재지에 붙는다 — 법정동이 바뀌면 지운다(#2055 후속).
            set({ ...buildAddressPatch(v, { fishing, sigunguCode }), ...giftBurdenedDistrictResetPatch(item, v.pnu) });
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
      <p className="text-xs text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded px-3 py-2">
        ℹ️ {PRIORITY_HINT[cat]}
      </p>

      {/* 평가액 입력 — 시가·감정가액·매매사례가액 아코디언 (D-6 안 가: 보충평가 위, 우선순위 순) */}
      <ValuationAccordionFields
        item={item}
        set={set}
        cat={cat}
        valuationDate={valuationDate}
        mode={mode}
        estateSigunguCode={item.estateSigunguCode}
      />

      {/* 보충적 평가 (§61①) — 토지·아파트·상업용 건물 공통 + 상업용 건물 §61 경로 분리. 800줄 정책 분리 */}
      <EstateBodySupplementaryValuation
        item={item}
        set={set}
        cat={cat}
        propertyKind={propertyKind}
        valuationDate={valuationDate}
        addrValue={addrValue}
        supplementaryLabel={SUPPLEMENTARY_LABEL[cat]}
      />

      </EstateBodySection>

      {/* 담보·임대 (§66 하한·§14 공제·§23의2·§47①) — 평가방식과 직교, 상시 노출 (D-3) */}
      <CollateralLeaseFields
        item={item}
        set={set}
        showLeaseDeposit={showLeaseDeposit}
        showCollateralDeductToggle={showCollateralDeductToggle}
        // §23의2는 «주택»을 요구한다 — 임대보증금 노출축(apartment||building, 실질은
        // 「land가 아님」)을 재사용하면 상업용 건물 카드에도 토글이 열린다. 하류에는
        // 카테고리 필터가 전혀 없어(inheritance-deduction-suggest·validate) 그대로 최대
        // 6억 공제가 도출된다. 저장소 카테고리 정의상 「주택」은 apartment뿐이다. (IG-043)
        showCohabitToggle={cat === "real_estate_apartment" && mode === "inheritance"}
        hasCohabitantChild={hasCohabitantChild}
        mode={mode}
      />

      {/* 양도소득세 함께 계산 — 부담부증여 채무인수분 (소득세법 §88·소령 §159) */}
      {mode === "gift" && (
        <BurdenedGiftTransferSection
          item={item}
          onChange={(patch) => onUpdate({ ...item, ...patch })}
          hasOtherBurdenedGiftTransfer={hasOtherBurdenedGiftTransfer}
          jibun={addrValue.jibun}
          transferDate={valuationDate}
        />
      )}
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
  /** §23의2 동거주택 체크 노출 — «주택»(apartment)에만. 상업용 건물(building)은 대상이 아니다. */
  showCohabitToggle: boolean;
  /** 동거 자녀 존재 여부 — 미존재 시 체크 disabled */
  hasCohabitantChild: boolean;
  /** 증여 모드 여부 — §47① 부담부증여 채무인수 입력·§47③ 안내 노출 분기 */
  mode: "inheritance" | "gift";
}


// ============================================================
// CollateralLeaseFields — 담보·임대 (§66 평가 하한 · §14 채무공제 · §23의2) 상시 노출 (D-3)
//   평가방식과 직교 — 평가액이 무엇이든 §66 비교·§14 공제는 별개 축.
// ============================================================

function CollateralLeaseFields({
  item,
  set,
  showLeaseDeposit,
  showCollateralDeductToggle,
  showCohabitToggle,
  hasCohabitantChild,
  mode,
}: RealEstateAdvancedFieldsProps) {
  // 담보·임대 토글 — 관련 값/설정이 하나라도 있으면 초기 ON(비파괴). mount 1회.
  // isCohabitantHouse·deductSecuredClaimAsDebt·assumedDebtForGift 포함: 설정 켜진 채 접혀 숨겨지는 사고 방지(R-1).
  const [open, setOpen] = useState(
    () =>
      (item.leaseDeposit ?? 0) > 0 ||
      (item.monthlyRent ?? 0) > 0 ||
      (item.mortgageAmount ?? 0) > 0 ||
      (item.creditGuaranteeAmount ?? 0) > 0 ||
      (item.assumedDebtForGift ?? 0) > 0 ||
      item.deductSecuredClaimAsDebt === true ||
      item.burdenedGiftDebtConfirmed === true ||
      item.isCohabitantHouse === true,
  );
  return (
    <ToggleCard
      lawLinks="상증법"
      tone="amber"
      size="sm"
      title={
        mode === "gift"
          ? "담보·임대 (§66 평가 하한 · §47① 채무인수)"
          : "담보·임대 (§66 평가 하한 · §14 채무공제)"
      }
      description={
        mode === "gift"
          ? "임대보증금·저당권·§47① 수증자 채무인수 — 해당 시 펼쳐 입력"
          : "임대보증금·저당권·신용보증·§14 자동공제·§23의2 — 해당 시 펼쳐 입력"
      }
      checked={open}
      onCheckedChange={setOpen}
    >
      {/* 임대보증금 (apartment·building만 — land 미노출 [UV2-1]) */}
      {showLeaseDeposit && (
        <FieldCard
          label="임대보증금 (세입자 있는 경우)"
          unit="원"
          hint={
            mode === "gift"
              ? "§66 임대료환산 평가 하한에 사용됩니다. §47① 수증자 채무인수 차감은 아래 별도 입력란에 입력하세요."
              : "평가액에서 차감됨"
          }
        >
          <CurrencyInput
            label="임대보증금 (세입자 있는 경우)"
            value={item.leaseDeposit != null ? String(item.leaseDeposit) : ""}
            onChange={(v) => set({ leaseDeposit: parseAmount(v) || undefined })}
            hideLabel
            hideUnit
          />
        </FieldCard>
      )}

      {/* 월 임대료 (§61⑤ 임대료환산 — 주택만, D-UI1) */}
      {showLeaseDeposit && (
        <FieldCard
          label="월 임대료 (원)"
          unit="원"
          badge={<LawArticleModal legalBasis="상증법 §61" label="§61⑤" />}
          hint={
            <>
              임대 부동산 §61⑤ — <Frac top="월세 × 12" bottom="12%" /> + 임대보증금이
              보충평가(공시지가)보다 크면 평가액으로 채택
            </>
          }
        >
          <CurrencyInput
            label="월 임대료 (원)"
            value={item.monthlyRent != null ? String(item.monthlyRent) : ""}
            onChange={(v) => set({ monthlyRent: parseAmount(v) || undefined })}
            hideLabel
            hideUnit
          />
        </FieldCard>
      )}

      {/* 저당권 */}
      <FieldCard
        label="저당권 등에 의해 담보된 채권액"
        unit="원"
        hint={
          mode === "gift"
            ? "평가기준일 현재 실제 채무 잔액(설정액 아님). §66 MAX 평가 하한에 사용됩니다 (차감 아님). §47① 수증자 채무인수 차감은 아래 별도 입력란에 입력하세요."
            : "평가기준일 현재 실제 채무 잔액(설정액 아님). §66 — 평가액이 더 크면 평가액으로 평가(차감 아님). 피상속인 채무이면 아래 토글로 §14 자동공제 가능."
        }
      >
        <div className="space-y-1.5">
          <CurrencyInput
            label="저당권 등에 의해 담보된 채권액"
            value={item.mortgageAmount != null ? String(item.mortgageAmount) : ""}
            onChange={(v) => set({ mortgageAmount: parseAmount(v) || undefined })}
            hideLabel
            hideUnit
          />
          <ReferenceSiteLinks sites={[REFERENCE_SITES.realEstateRegister]} />
        </div>
      </FieldCard>

      {/* 신용보증기관 보증액 (상증령 §63② 차감 — 저당0 시 disabled, D-UI2) */}
      <FieldCard
        label="신용보증기관 보증액 (원)"
        unit="원"
        badge={
          <span className="flex gap-1">
            <LawArticleModal legalBasis="상증령 §63" label="상증령 §63②" />
            <LawArticleModal legalBasis="상증법 §66" label="§66" />
          </span>
        }
        hint="신용보증기금 등이 보증한 금액 — 저당 담보채권액에서 차감 (상증령 §63②, §66 1호 저당분 한정). 저당권 입력 시에만 적용."
      >
        <CurrencyInput
          label="신용보증기관 보증액 (원)"
          value={item.creditGuaranteeAmount != null ? String(item.creditGuaranteeAmount) : ""}
          onChange={(v) => set({ creditGuaranteeAmount: parseAmount(v) || undefined })}
          hideLabel
          hideUnit
          disabled={(item.mortgageAmount ?? 0) === 0}
        />
      </FieldCard>

      {/* §47① 부담부증여 수증자 인수 채무액 — 증여 모드 전용 (RealEstateBurdenedGiftField로 분리) */}
      {mode === "gift" && (
        <RealEstateBurdenedGiftField
          value={item.assumedDebtForGift}
          onChange={(v) => set({ assumedDebtForGift: v })}
        />
      )}

      {/* §47③ 객관적 입증 토글 — 증여 모드 + 채무 입력 시 노출 */}
      {mode === "gift" && (item.assumedDebtForGift ?? 0) > 0 && (
        <ToggleCard
          lawLinks="상증법"
          tone="amber"
          size="sm"
          title="채무 인수 사실 객관적 입증 가능 (§47③)"
          description="배우자·직계존비속 간 부담부증여는 채무 인수를 원칙적으로 증여로 추정하지 않습니다. 금융기관 확인서 등 객관적 증빙이 있는 경우 ON으로 표시하세요."
          checked={item.burdenedGiftDebtConfirmed ?? false}
          onCheckedChange={(v) => set({ burdenedGiftDebtConfirmed: v || undefined })}
        />
      )}

      {/* §47③ amber 안내 — 증여 모드 + 채무>0 시 항상 표시 (관계 불문) */}
      {mode === "gift" && (item.assumedDebtForGift ?? 0) > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <strong>§47③ 주의</strong> — 배우자·직계존비속 간 부담부증여의 채무 인수는 원칙적으로
          증여로 추정하지 않습니다. 채무 이전이 객관적으로 입증된 경우에만 과세가액에서 차감됩니다.
          (상증법 §47③, 금융기관 확인서류 등 입증 서류 보관 필요)
        </div>
      )}

      {/* §14 자동공제 토글 */}
      {showCollateralDeductToggle && (
        <ToggleCard
          lawLinks="상증법"
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
            lawLinks="상증법"
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
            lawLinks="상증법"
            tone="violet"
            size="sm"
            title="동거주택 공제 대상 (§23의2)"
            description="10년 이상 동거·무주택 자녀가 상속받는 주택 — 위 기준시가가 §23의2 공제에 자동 사용됩니다 (담보채무 차감 후 100%, 최대 6억)."
            checked={item.isCohabitantHouse ?? false}
            onCheckedChange={(v) =>
              set({
                isCohabitantHouse: v || undefined,
                // OFF 시 자산 유형 초기화
                cohabitHouseRightType: v ? item.cohabitHouseRightType : undefined,
              })
            }
            disabled={!hasCohabitantChild}
            disabledReason="상속인 구성(Step 0)에서 자녀의 동거(isCohabitant) 여부를 먼저 설정하세요."
          >
            {/* §23의2 자산 유형 선택 — 1+1·분양권 미적용 게이트 (CV-1: 미선택 경고) */}
            <div className="pt-1" data-testid={`cohabit-right-type-${item.id}`}>
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-2">
                자산 유형 선택 (§23의2 적용 여부)
              </p>
              <RadioCardGroup<CohabitHouseRightType>
                name={`cohabitHouseRightType-${item.id}`}
                options={COHABIT_RIGHT_OPTIONS}
                value={item.cohabitHouseRightType ?? ""}
                onChange={(v) => set({ cohabitHouseRightType: v })}
                tone="violet"
                layout="stack"
              />
              {/* 미적용 유형 선택 시 rose 안내 */}
              {(item.cohabitHouseRightType === "one_plus_one_right" ||
                item.cohabitHouseRightType === "sale_right") && (
                <div
                  className="mt-2 rounded-md border border-rose-200 bg-rose-50/70 dark:border-rose-700 dark:bg-rose-900/20 px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
                  data-testid={`cohabit-excluded-notice-${item.id}`}
                >
                  선택 자산 종류는 §23의2 동거주택 상속공제 미적용입니다. 공제 0 처리됩니다.
                </div>
              )}
            </div>
          </ToggleCard>
        </div>
      )}
    </ToggleCard>
  );
}
