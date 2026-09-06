"use client";
/**
 * 양도세 감면 통합 패널 (Round 8, 2026-05-06)
 *
 * 5개 카테고리(자경/장기임대/신축/미분양/공익) + 세부 조문 24개 통합 UI.
 * - standalone(자경·공익): 단일 체크박스 (펼침 X) — 본격 입력은 Step5 서브패널에 위임
 * - 그룹(장기임대·신축·미분양): 펼침 헤더 + 활성/전체 카운터 + 라디오 그룹
 * - 라디오 같은 항목 재클릭 시 해제 (사용자 결정사항 #5 (b))
 * - 시한 외 / 미구현 항목 disabled + tooltip (#2 (a), #3 (a))
 *
 * 기존 ReductionExpansion.tsx 폐지 + Step5의 평면 5개 체크박스 제거.
 *
 * 정책 준수:
 *   - useEffect → store 미러링 금지 (직접 onChange 호출)
 *   - 자동 안분 fallback 금지 (§99의3 본 요건 필드는 사용자 직접 입력)
 *   - native checkbox/radio 신규 작성 금지 (RadioCardGroup 정책)
 */

import { useMemo, useState } from "react";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";
import type { RentalReductionFormVariant } from "@/lib/stores/calc-wizard-asset-reduction";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { isWithin5YearsCheck } from "@/lib/tax-engine/transfer-reductions/new-99-3";
import {
  isIncomeDeductionTrack,
  isTaxAmountTrack,
} from "@/lib/tax-engine/transfer-reductions/income-deduction-router";
import {
} from "@/components/calc/results/shared/ExpandToggleButton";
import type { ReductionPhdValue } from "@/components/calc/transfer/ReductionPhdInput";
import {
  REDUCTION_METADATA,
  countActiveReductionsByCategory,
  evaluateAllPeriods,
  isReductionCategoryAllowedForAssetKind,
  isReductionAllowedForAssetKind,
  type TransferReductionId,
  type ReductionCategory,
  type ReductionAssetKind,
  type PeriodCheckContext,
} from "@/lib/tax-engine/transfer-reductions";
import {
  STANDALONE_LABELS,
  getStandaloneDefault,
  toggleGroupRadio,
} from "./UnifiedReductionPanel-defaults";

// ============================================================================
// Props
// ============================================================================

import { GroupCategorySection } from "./UnifiedReductionGroupSection";

interface UnifiedReductionPanelProps {
  asset: AssetForm;
  /** 양도일 (form-level) */
  transferDate: string;
  onChange: (patch: Partial<AssetForm>) => void;
}

// 순수 기본값·토글 헬퍼는 UnifiedReductionPanel-defaults.ts로 분리 (800줄 정책, 2026-06-11)

// 카테고리별 검증 통과 조문 배지 (펼침 children 상단 — 헤더 button 내부는 링크 불가)
// `CATEGORY_LAW_BADGES`는 그룹 섹션 전용이라 그쪽으로 옮겼다(800줄 분리).

// 자산 종류 한글 라벨 — 주택 게이트 비활성 사유 표시용
const ASSET_KIND_LABEL: Record<AssetForm["assetKind"], string> = {
  housing: "주택",
  land: "토지",
  building: "건물",
  right_to_move_in: "조합원입주권",
  presale_right: "분양권",
  commercial_building: "상가건물",
  general_building: "일반건물",
  redevelopment_apt: "재개발·재건축",
};

// ============================================================================
// 시한 검증 컨텍스트
// ============================================================================

/**
 * 시한 검증 ctx 조립. **export는 anchor가 키 누락을 값으로 고정하기 위한 것**이다 —
 * `rental972Type` 같은 optional 키는 빠져도 tsc가 잡지 못하고(⑫⑬⑭와 같은 층위),
 * 실제로 그 키가 빠져 §97의2 1호 나목이 영구 비활성이었다.
 */
export function buildPeriodContext(asset: AssetForm, transferDate: string): PeriodCheckContext {
  const acqDate = asset.acquisitionDate ? new Date(asset.acquisitionDate) : undefined;
  const transDate = transferDate ? new Date(transferDate) : new Date();
  // Round 9 (2026-05-06): 자산-수준 매매계약일 주입.
  // 신축·미분양·임대 감면 13개 조문은 매매계약일 + 계약금 납부 기준으로 시한 판정.
  // 미입력 시 acquisitionDate fallback (조문 단서 "매매계약 + 계약금 = 취득" 정책 준수).
  const assetContract = asset.assetContractDate ? new Date(asset.assetContractDate) : undefined;
  // Phase 2 (2026-06-11): 장기임대 §97 시리즈 — 선택된 rental 항목의 등록일·임대개시일 주입.
  // 미입력 시 acquisitionDate 낙관 fallback (period-check의 before(undefined)=false 가 라디오를
  // 영구 disabled로 만드는 것을 방지 — 표시용 낙관. 본 요건 검증은 엔진 evaluator·validate 담당).
  const rentalRed = (asset.reductions ?? []).find(
    (r): r is Extract<AssetReductionForm, { registrationDate: string }> =>
      typeof r.type === "string" && r.type.startsWith("rental_97"),
  );
  const rentalReg = rentalRed?.registrationDate ? new Date(rentalRed.registrationDate) : undefined;
  const rentalStart = rentalRed?.rentalStartDate ? new Date(rentalRed.rentalStartDate) : undefined;
  return {
    transferDate: transDate,
    acquisitionDate: acqDate,
    contractDate: assetContract,
    // 등록일 미입력 = "모름" → 양도일까지 낙관 fallback (§97의3 등록 ~2027.12.31 — 빈 폼에서
    // disabled로 단정하지 않음). 임대개시일은 acqDate까지만 — 구법(§97 ~2000.12.31)은 취득일
    // 입력 전 비활성이 합리적 (양도일 fallback 시 항상 시한 외 오탐).
    registrationDate: rentalReg ?? acqDate ?? transDate,
    rentalStartDate: rentalStart ?? acqDate,
    usageApprovalDate: undefined,
    /**
     * 🔴 §97의2 판정 축 (2026-09-06 UI 리뷰).
     *
     * `period-check.ts`의 §97의2는 **호마다 축이 다르다** — 1호(건설임대)는 신축일,
     * 2호(매입임대)는 매매계약일. 그 갈림은 `rental972Type` 하나가 정하는데 이 ctx에
     * 키가 아예 없어 **항상 2호 분기**로 판정됐다. 그래서 1호 **나목**(1999.8.19 이전
     * 신축 공동주택)은 어떤 입력으로도 시한을 통과하지 못했고, `GroupCategorySection`이
     * 항목을 disabled로 만들어 **100% 면제를 선택할 방법 자체가 없었다** — 유형 라디오는
     * 그 항목을 켜야 열리는 폼 안에 있어(`Rental972InputForm:51`) 우회 경로도 없었다.
     *
     * 미선택("")은 `undefined`로 보낸다 — period-check가 그때 두 축을 모두 열어 항목을
     * 켤 수 있게 한다(등록일 낙관 fallback과 같은 방침). 정확한 요건 판정은 엔진
     * `evaluateRental972`가 한다.
     */
    rental972Type:
      rentalRed && rentalRed.type === "rental_97_2" && rentalRed.rental972Type
        ? rentalRed.rental972Type
        : undefined,
  };
}

// ============================================================================
// 컴포넌트
// ============================================================================

/**
 * §99의3 감면 PHD 위젯 ↔ 자산-수준 PHD(§164⑤) dual-truth 완화 스냅샷.
 * 자산 PHD 활성(usePreHousingDisclosure) 시 동일 자산의 같은 최초공시·토지단가·건물기준시가를
 * New993InputForm "자산 카드 PHD 가져오기" 버튼 소스로 노출 → §99의3 감면 PHD 7필드 재입력 footgun 제거.
 * OFF이거나 값이 하나도 없으면 undefined(버튼 비활성).
 */
export function buildAssetPhdSnapshot(asset: AssetForm): ReductionPhdValue | undefined {
  if (!asset.usePreHousingDisclosure) return undefined;
  const snap: ReductionPhdValue = {
    firstDisclosureDate: asset.phdFirstDisclosureDate || undefined,
    firstDisclosurePrice: asset.phdFirstDisclosureHousingPrice || undefined,
    landAreaSqm: asset.phdResidentialLandArea || asset.acquisitionArea || undefined,
    landPricePerSqmAtAcq: asset.phdLandPricePerSqmAtAcq || undefined,
    landPricePerSqmAtFirst: asset.phdLandPricePerSqmAtFirst || undefined,
    buildingStdAtAcq: asset.phdBuildingStdPriceAtAcq || undefined,
    buildingStdAtFirst: asset.phdBuildingStdPriceAtFirst || undefined,
  };
  return Object.values(snap).some((v) => v) ? snap : undefined;
}

export function UnifiedReductionPanel({ asset, transferDate, onChange }: UnifiedReductionPanelProps) {
  const reductions = asset.reductions ?? [];
  const [openCategories, setOpenCategories] = useState<Record<ReductionCategory, boolean>>({
    rental: false,
    new_housing: false,
    unsold_housing: false,
    standalone: false,
  });

  const periodCtx = useMemo(() => buildPeriodContext(asset, transferDate), [asset, transferDate]);
  const counters = useMemo(() => countActiveReductionsByCategory(periodCtx), [periodCtx]);
  const periodResults = useMemo(() => evaluateAllPeriods(periodCtx), [periodCtx]);

  // §99의3 감면 PHD 위젯 ↔ 자산-수준 PHD dual-truth 완화 (아래 buildAssetPhdSnapshot).
  const assetPhdSnapshot = useMemo(() => buildAssetPhdSnapshot(asset), [asset]);

  // ── standalone 토글(자경·공익) ──
  function toggleStandalone(type: "self_farming" | "public_expropriation" | "gb_designated_land" | "replacement_land_comp") {
    const has = reductions.some((r) => r.type === type);
    if (has) {
      onChange({ reductions: reductions.filter((r) => r.type !== type) });
    } else {
      onChange({ reductions: [...reductions, getStandaloneDefault(type)] });
    }
  }

  // ── 그룹 라디오 토글 ──
  function toggleGroup(category: ReductionCategory, id: TransferReductionId) {
    const alreadySelected = reductions.some((r) => r.type === id);
    onChange({ reductions: toggleGroupRadio(reductions, category, id, alreadySelected) });
  }

  // ── §99의3 본 요건 필드 업데이트 ──
  function update993<K extends keyof Extract<AssetReductionForm, { type: "new_99_3" }>>(
    key: K,
    value: Extract<AssetReductionForm, { type: "new_99_3" }>[K],
  ) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === "new_99_3" ? ({ ...r, [key]: value } as AssetReductionForm) : r,
      ),
    });
  }

  // 여러 필드 동시 갱신(단일 onChange) — 건물 기준시가 "취득·최초고시 모두 적용"처럼 한 이벤트에서
  // 2개 이상 필드를 바꿀 때 개별 update993 연속 호출은 stale reductions spread로 서로를 덮어씀. 배치 필수.
  function update993Many(patch: Partial<Extract<AssetReductionForm, { type: "new_99_3" }>>) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === "new_99_3" ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }

  // ── §97 시리즈 폼 필드 업데이트 ──
  function updateRentalVariant(
    id: RentalReductionFormVariant["type"],
    patch: Partial<RentalReductionFormVariant>,
  ) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === id ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }

  // ── §99의4 농어촌·고향주택 폼 필드 업데이트 (2026-06-11) ──
  function update994(
    id: "new_99_4_rural" | "new_99_4_hometown",
    patch: Partial<Extract<AssetReductionForm, { type: "new_99_4_hometown" }>>,
  ) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === id ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }

  // ── §98의9 준공후미분양 폼 필드 업데이트 (2026-06-11) ──
  function update989(patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_9" }>>) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === "unsold_98_9" ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }

  // ── P1 (2026-06-11): §99 신축주택 IMF 1차 / §98의8 준공후미분양 50% ──
  function update99(patch: Partial<Extract<AssetReductionForm, { type: "new_99" }>>) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === "new_99" ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }
  function update988(patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_8" }>>) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === "unsold_98_8" ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }
  // ── P2 (2026-06-11): §98의7 9억↓ 미분양 / §99의2 신축·미분양·1세대1주택 ──
  function update987(patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_7" }>>) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === "unsold_98_7" ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }
  function update992(patch: Partial<Extract<AssetReductionForm, { type: "unsold_99_2" }>>) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === "unsold_99_2" ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }
  // ── P3 (2026-06-12): §98의3 / §98의5 / §98의6 ──
  function update983(patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_3" }>>) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === "unsold_98_3" ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }
  function update985(patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_5" }>>) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === "unsold_98_5" ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }
  function update986(patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_6" }>>) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === "unsold_98_6" ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }
  // ── P5 (2026-06-12): §98 ──
  function update98(patch: Partial<Extract<AssetReductionForm, { type: "unsold_98" }>>) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === "unsold_98" ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }
  // ── P4 (2026-06-12): §98의2 / §98의4 ──
  function update982(patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_2" }>>) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === "unsold_98_2" ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }
  function update984(patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_4" }>>) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === "unsold_98_4" ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }

  const new993 = reductions.find((r) => r.type === "new_99_3");

  /**
   * §127⑦ 트랙 교차 안내 — ⑧ validate가 차단하는 것과 **같은 판정**을 미리 보여준다.
   *
   * 소득차감형(§90② 양도소득금액 차감)과 세액감면형(산출세액 감면)은 §127⑦상 택일인데,
   * 엔진의 §127⑦ max는 세액감면형 후보 안에서만 돌아 두 트랙을 동시에 켜면 이중 혜택이
   * 된다(코드리뷰 D10-01). 조문이 「그 거주자가 **선택하는** 하나」라고 정하므로 자동으로
   * 고르지 않고 사용자가 택하게 한다 — 여기서 사유와 비교 방법을 안내한다.
   *
   * 판정은 엔진 단일 소스(`isIncomeDeductionTrack`/`isTaxAmountTrack`)를 재사용한다.
   */
  const trackConflict = useMemo(() => {
    if (!asset.acquisitionDate || !transferDate) return null;
    const within5 = isWithin5YearsCheck(new Date(asset.acquisitionDate), new Date(transferDate));
    const types = reductions.map((r) => r.type);
    const ded = types.find((t) => isIncomeDeductionTrack(t, within5));
    const tax = types.find((t) => isTaxAmountTrack(t, within5));
    if (!ded || !tax) return null;
    const label = (t: string) =>
      REDUCTION_METADATA[t as keyof typeof REDUCTION_METADATA]?.uiLabel ?? t;
    return { ded: label(ded), tax: label(tax) };
  }, [asset.acquisitionDate, transferDate, reductions]);

  return (
    <div className="space-y-3">
      {trackConflict && (
        <ToneCard tone="rose" title="조특법 §127⑦ — 두 감면은 택일입니다">
          <p className="text-xs">
            「{trackConflict.ded}」는 <b>양도소득금액을 차감</b>하고,{" "}
            「{trackConflict.tax}」는 <b>산출세액을 감면</b>합니다. 조특법 §127⑦은 둘 이상의
            감면규정을 동시에 적용받는 경우 <b>거주자가 선택하는 하나만</b> 적용하도록 정하므로,
            둘 중 하나를 해제해야 계산을 진행할 수 있습니다.
          </p>
          <p className="text-caption text-muted-foreground mt-1">
            어느 쪽이 유리한지는 각각 선택해 계산한 뒤 <b>총 납부세액</b>을 비교하면 됩니다.
          </p>
        </ToneCard>
      )}
      {/* ── 자경농지 (standalone) ── */}
      <StandaloneCheckbox
        type="self_farming"
        checked={reductions.some((r) => r.type === "self_farming")}
        onToggle={() => toggleStandalone("self_farming")}
        allowed={isReductionAllowedForAssetKind("self_farming", asset.assetKind)}
        disabledReason={`🌾 토지 양도에만 적용되는 감면입니다 (현재 자산: ${ASSET_KIND_LABEL[asset.assetKind]})`}
      />

      {/* ── 그룹 카테고리 3개 ── */}
      {(["rental", "new_housing", "unsold_housing"] as ReductionCategory[]).map((cat) => (
        <GroupCategorySection
          key={cat}
          category={cat}
          isOpen={openCategories[cat]}
          onToggleOpen={() => setOpenCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))}
          counter={counters[cat]}
          housingAllowed={isReductionCategoryAllowedForAssetKind(cat, asset.assetKind)}
          assetKind={asset.assetKind}
          assetKindLabel={ASSET_KIND_LABEL[asset.assetKind]}
          periodResults={periodResults}
          reductions={reductions}
          onSelectId={(id) => toggleGroup(cat, id)}
          new993={new993 && new993.type === "new_99_3" ? new993 : undefined}
          onUpdate993={update993}
          onUpdate993Many={update993Many}
          onUpdateRentalVariant={updateRentalVariant}
          onUpdate994={update994}
          onUpdate989={update989}
          onUpdate99={update99}
          onUpdate988={update988}
          onUpdate987={update987}
          onUpdate992={update992}
          onUpdate983={update983}
          onUpdate985={update985}
          onUpdate986={update986}
          onUpdate982={update982}
          onUpdate984Hybrid={update984}
          onUpdate98={update98}
          assetContractDate={asset.assetContractDate ?? ""}
          onAssetContractDateChange={(v) => onChange({ assetContractDate: v })}
          assetId={asset.assetId}
          acquisitionDate={asset.acquisitionDate}
          transferDate={transferDate}
          assetJibun={asset.addressJibun || undefined}
          assetDong={asset.addressDong || undefined}
          assetHo={asset.addressHo || undefined}
          assetPhdSnapshot={assetPhdSnapshot}
        />
      ))}

      {/* ── 공익사업 수용 (standalone) ── */}
      <StandaloneCheckbox
        type="public_expropriation"
        checked={reductions.some((r) => r.type === "public_expropriation")}
        onToggle={() => toggleStandalone("public_expropriation")}
      />

      {/* ── 개발제한구역 매수 토지 §77의3 (standalone) ── */}
      <StandaloneCheckbox
        type="gb_designated_land"
        checked={reductions.some((r) => r.type === "gb_designated_land")}
        onToggle={() => toggleStandalone("gb_designated_land")}
      />

      {/* ── 대토보상 과세특례 §77의2 (standalone) ── */}
      <StandaloneCheckbox
        type="replacement_land_comp"
        checked={reductions.some((r) => r.type === "replacement_land_comp")}
        onToggle={() => toggleStandalone("replacement_land_comp")}
      />
    </div>
  );
}

// ============================================================================
// 서브 컴포넌트: standalone 체크박스 (자경·공익)
// ============================================================================

function StandaloneCheckbox({
  type,
  checked,
  onToggle,
  allowed = true,
  disabledReason,
}: {
  type: "self_farming" | "public_expropriation" | "gb_designated_land" | "replacement_land_comp";
  checked: boolean;
  onToggle: () => void;
  /** 자산 종류 게이트 — false면 신규 선택을 막는다 */
  allowed?: boolean;
  disabledReason?: string;
}) {
  const { label, desc } = STANDALONE_LABELS[type];
  // ⚠ **이미 선택된 것은 항상 해제할 수 있어야 한다.** 자산 종류를 바꿔 stale 선택이 남은 경우
  //   disabled로 잠그면 ⑧이 "감면 선택을 해제하세요"라고 안내하면서 해제 수단이 없는 dead-end가 된다.
  const disabled = !allowed && !checked;
  return (
    <ToggleCard
      checked={checked}
      onCheckedChange={onToggle}
      title={label}
      description={!allowed && disabledReason ? disabledReason : desc}
      tone="emerald"
      size="sm"
      disabled={disabled}
    />
  );
}
