"use client";
/**
 * 양도세 감면 통합 패널 (Round 8, 2026-05-06)
 *
 * 5개 카테고리(자경/장기임대/신축/미분양/공익) + 세부 조문 23개 통합 UI.
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
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
import type { ReductionPhdValue } from "@/components/calc/transfer/ReductionPhdInput";
import { New993InputForm } from "@/components/calc/transfer/New993InputForm";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";
import { Rental97MainInputForm } from "@/components/calc/transfer/rental/Rental97MainInputForm";
import { Rental972InputForm } from "@/components/calc/transfer/rental/Rental972InputForm";
import { Rental974InputForm } from "@/components/calc/transfer/rental/Rental974InputForm";
import { New994InputForm } from "@/components/calc/transfer/New994InputForm";
import { Unsold989InputForm } from "@/components/calc/transfer/Unsold989InputForm";
import { New99InputForm } from "@/components/calc/transfer/New99InputForm";
import { Unsold988InputForm } from "@/components/calc/transfer/Unsold988InputForm";
import { Unsold987InputForm } from "@/components/calc/transfer/Unsold987InputForm";
import { Unsold992InputForm } from "@/components/calc/transfer/Unsold992InputForm";
import { Unsold983InputForm } from "@/components/calc/transfer/Unsold983InputForm";
import { Unsold985InputForm } from "@/components/calc/transfer/Unsold985InputForm";
import { Unsold986InputForm } from "@/components/calc/transfer/Unsold986InputForm";
import { Unsold982InputForm } from "@/components/calc/transfer/Unsold982InputForm";
import { Unsold984InputForm } from "@/components/calc/transfer/Unsold984InputForm";
import { Unsold98InputForm } from "@/components/calc/transfer/Unsold98InputForm";
import {
  REDUCTION_METADATA,
  ALL_REDUCTION_IDS,
  CATEGORY_UI_SCHEMA,
  countActiveReductionsByCategory,
  evaluateAllPeriods,
  isReductionCategoryAllowedForAssetKind,
  type TransferReductionId,
  type ReductionCategory,
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

interface UnifiedReductionPanelProps {
  asset: AssetForm;
  /** 양도일 (form-level) */
  transferDate: string;
  onChange: (patch: Partial<AssetForm>) => void;
}

// 순수 기본값·토글 헬퍼는 UnifiedReductionPanel-defaults.ts로 분리 (800줄 정책, 2026-06-11)

// 카테고리별 검증 통과 조문 배지 (펼침 children 상단 — 헤더 button 내부는 링크 불가)
const CATEGORY_LAW_BADGES: Record<
  ReductionCategory,
  { legalBasis: string; label: string }[]
> = {
  rental: [
    { legalBasis: "조세특례제한법 §97", label: "§97 장기임대주택" },
    { legalBasis: "조세특례제한법 §97의3", label: "§97의3" },
    { legalBasis: "조세특례제한법 §97의4", label: "§97의4" },
    { legalBasis: "조세특례제한법 §97의5", label: "§97의5" },
  ],
  new_housing: [{ legalBasis: "조세특례제한법 §99", label: "§99 시리즈 신축주택" }],
  unsold_housing: [{ legalBasis: "조세특례제한법 §98", label: "§98 시리즈 미분양주택" }],
  standalone: [],
};

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

function buildPeriodContext(asset: AssetForm, transferDate: string): PeriodCheckContext {
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
  };
}

// ============================================================================
// 컴포넌트
// ============================================================================

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

  return (
    <div className="space-y-3">
      {/* ── 자경농지 (standalone) ── */}
      <StandaloneCheckbox
        type="self_farming"
        checked={reductions.some((r) => r.type === "self_farming")}
        onToggle={() => toggleStandalone("self_farming")}
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
          assetKindLabel={ASSET_KIND_LABEL[asset.assetKind]}
          periodResults={periodResults}
          reductions={reductions}
          onSelectId={(id) => toggleGroup(cat, id)}
          new993={new993 && new993.type === "new_99_3" ? new993 : undefined}
          onUpdate993={update993}
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
          acquisitionDate={asset.acquisitionDate}
          transferDate={transferDate}
          assetPhdSnapshot={undefined /* 자산-수준 PHD 데이터는 향후 통합 시 매핑 (현재 자산 카드 PHD UI와 별개) */}
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
}: {
  type: "self_farming" | "public_expropriation" | "gb_designated_land" | "replacement_land_comp";
  checked: boolean;
  onToggle: () => void;
}) {
  const { label, desc } = STANDALONE_LABELS[type];
  return (
    <ToggleCard
      checked={checked}
      onCheckedChange={onToggle}
      title={label}
      description={desc}
      tone="emerald"
      size="sm"
    />
  );
}

// ============================================================================
// 서브 컴포넌트: 그룹 카테고리 (펼침 헤더 + 라디오)
// ============================================================================

function GroupCategorySection({
  category,
  isOpen,
  onToggleOpen,
  counter,
  housingAllowed,
  assetKindLabel,
  periodResults,
  reductions,
  onSelectId,
  new993,
  onUpdate993,
  onUpdateRentalVariant,
  onUpdate994,
  onUpdate989,
  onUpdate99,
  onUpdate988,
  onUpdate987,
  onUpdate992,
  onUpdate983,
  onUpdate985,
  onUpdate986,
  onUpdate982,
  onUpdate984Hybrid,
  onUpdate98,
  assetContractDate,
  onAssetContractDateChange,
  acquisitionDate,
  transferDate,
  assetPhdSnapshot,
}: {
  category: ReductionCategory;
  isOpen: boolean;
  onToggleOpen: () => void;
  counter: { active: number; total: number };
  /** 자산 종류 게이트 — 주택 감면이 이 자산에 적용 가능한지 (false면 카테고리 전체 비활성) */
  housingAllowed: boolean;
  /** 비활성 사유 표시용 현재 자산 종류 한글 라벨 */
  assetKindLabel: string;
  periodResults: Record<TransferReductionId, { inPeriod: boolean; failReason?: string; periodLabel?: string }>;
  reductions: AssetReductionForm[];
  onSelectId: (id: TransferReductionId) => void;
  new993: Extract<AssetReductionForm, { type: "new_99_3" }> | undefined;
  onUpdate993: <K extends keyof Extract<AssetReductionForm, { type: "new_99_3" }>>(
    key: K,
    value: Extract<AssetReductionForm, { type: "new_99_3" }>[K],
  ) => void;
  onUpdateRentalVariant: (
    id: RentalReductionFormVariant["type"],
    patch: Partial<RentalReductionFormVariant>,
  ) => void;
  onUpdate994: (
    id: "new_99_4_rural" | "new_99_4_hometown",
    patch: Partial<Extract<AssetReductionForm, { type: "new_99_4_hometown" }>>,
  ) => void;
  onUpdate989: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_9" }>>) => void;
  onUpdate99: (patch: Partial<Extract<AssetReductionForm, { type: "new_99" }>>) => void;
  onUpdate988: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_8" }>>) => void;
  onUpdate987: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_7" }>>) => void;
  onUpdate992: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_99_2" }>>) => void;
  onUpdate983: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_3" }>>) => void;
  onUpdate985: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_5" }>>) => void;
  onUpdate986: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_6" }>>) => void;
  onUpdate982: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_2" }>>) => void;
  onUpdate984Hybrid: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_4" }>>) => void;
  onUpdate98: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98" }>>) => void;
  /** Round 9 (2026-05-06): 매매계약일 (자산-수준, 펼침 시 활성화) */
  assetContractDate: string;
  onAssetContractDateChange: (v: string) => void;
  /** Round 10 (2026-05-06): 자산 취득일 — PHD 자동 활성화 권장 판정 */
  acquisitionDate?: string;
  /** 양도일 — 임대 기간 미리보기용 */
  transferDate?: string;
  /** Round 10 (2026-05-06): 자산-수준 PHD 데이터 스냅샷 — "자산 카드 PHD 가져오기" 버튼 */
  assetPhdSnapshot?: ReductionPhdValue;
}) {
  const schema = CATEGORY_UI_SCHEMA[category];
  const items = ALL_REDUCTION_IDS.filter((id) => REDUCTION_METADATA[id].category === category);

  return (
    <div className="rounded-lg border border-border bg-muted/5">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/20"
      >
        <div>
          <span className="text-sm font-semibold">{schema.title}</span>
          <span className="ml-2 text-xs text-muted-foreground">{schema.subtitle}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs">
            <span className={housingAllowed && counter.active > 0 ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
              활성 {housingAllowed ? counter.active : 0}
            </span>
            <span className="mx-1 text-muted-foreground">/</span>
            <span className="text-muted-foreground">전체 {counter.total}</span>
          </span>
          <span className={expandToggleClass("slate")}>{expandToggleLabel(isOpen)}</span>
        </div>
      </button>
      {isOpen && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {CATEGORY_LAW_BADGES[category].length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_LAW_BADGES[category].map((b) => (
                <LawArticleModal key={b.legalBasis} legalBasis={b.legalBasis} label={b.label} />
              ))}
            </div>
          )}
          {/* Round 9 (2026-05-06): 매매계약일 입력 — 펼침 활성화 시에만 노출.
              3개 그룹(장기임대·신축·미분양) 펼침 영역 상단에 표시되며, 자산-수준 단일 필드를 공유.
              어느 그룹에서 입력하든 즉시 동기화. */}
          <div className="rounded-md border border-border bg-muted/30 dark:bg-muted/10 px-3 py-2 mb-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold whitespace-nowrap">매매계약일 (분양/매매)</span>
              <div className="flex-1 min-w-[180px]">
                <DateInput value={assetContractDate} onChange={onAssetContractDateChange} />
              </div>
            </div>
            <p className="mt-1.5 text-micro text-muted-foreground leading-relaxed">
              ※ 분양·매매계약 + 계약금 납부 시점. <strong>신축·미분양·임대 감면 시한 판정의 1차 기준</strong>.
              미입력 시 자산의 취득일을 사용합니다 (조문 단서 &ldquo;매매계약 + 계약금 = 취득&rdquo;).
            </p>
          </div>

          {items.map((id) => {
            const itemMeta = REDUCTION_METADATA[id];
            const period = periodResults[id];
            const isFullyImplemented = itemMeta.isFullyImplemented === true;
            const isDisabled = !housingAllowed || !period.inPeriod || !isFullyImplemented;
            const isSelected = reductions.some((r) => r.type === id);

            // 비활성 사유 (주택 게이트 > 시한 외 > 미구현 — 가장 근본 차단 사유 우선)
            const disabledReason = !housingAllowed
              ? `🏠 주택 양도에만 적용되는 감면입니다 (현재 자산: ${assetKindLabel})`
              : !period.inPeriod
                ? `⚠ ${period.failReason ?? "시한 외"}`
                : !isFullyImplemented
                  ? "📋 시한 통과 — Phase 2~ 본격 구현 예정"
                  : undefined;

            // §97 시리즈 현재 선택된 variant 찾기
            const rentalVariantTypes = [
              "rental_97_3", "rental_97_4", "rental_97_5",
              "rental_97_main", "rental_97_proviso", "rental_97_2",
            ] as const;
            const isRentalId = (rentalVariantTypes as readonly string[]).includes(id);
            const rentalForm = isRentalId
              ? reductions.find((r) => r.type === id) as RentalReductionFormVariant | undefined
              : undefined;

            return (
              <div key={id}>
                {/* ToggleCard 그룹 — 카테고리 내 1개 강제는 parent의 toggleGroupRadio가 처리 */}
                {/* 같은 항목 재클릭 시 해제: ToggleCard onCheckedChange가 false→true, true→false 자연 동작 */}
                <ToggleCard
                  checked={isSelected}
                  onCheckedChange={() => {
                    if (!isDisabled) onSelectId(id);
                  }}
                  title={itemMeta.uiLabel}
                  description={itemMeta.effectLabel}
                  tone={schema.tone}
                  size="sm"
                  disabled={isDisabled}
                  disabledReason={disabledReason}
                >
                  {/* §99의3 본격 입력 폼 — ToggleCard children 펼침 영역 */}
                  {id === "new_99_3" && new993 && (
                    <New993InputForm
                      value={new993}
                      onUpdate={onUpdate993}
                      acquisitionDate={acquisitionDate}
                      assetPhdSnapshot={assetPhdSnapshot}
                    />
                  )}
                  {/* §97의3 입력 폼 */}
                  {id === "rental_97_3" && rentalForm && rentalForm.type === "rental_97_3" && (
                    <Rental973InputForm
                      value={rentalForm}
                      onChange={(patch) => onUpdateRentalVariant("rental_97_3", patch as Partial<RentalReductionFormVariant>)}
                      transferDate={transferDate}
                    />
                  )}
                  {/* §97의5 입력 폼 */}
                  {id === "rental_97_5" && rentalForm && rentalForm.type === "rental_97_5" && (
                    <Rental975InputForm
                      value={rentalForm}
                      onChange={(patch) => onUpdateRentalVariant("rental_97_5", patch as Partial<RentalReductionFormVariant>)}
                      acquisitionDate={acquisitionDate}
                      transferDate={transferDate}
                    />
                  )}
                  {/* §97 본문 입력 폼 */}
                  {id === "rental_97_main" && rentalForm && rentalForm.type === "rental_97_main" && (
                    <Rental97MainInputForm
                      value={rentalForm}
                      onChange={(patch) => onUpdateRentalVariant("rental_97_main", patch as Partial<RentalReductionFormVariant>)}
                    />
                  )}
                  {/* §97 단서 입력 폼 */}
                  {id === "rental_97_proviso" && rentalForm && rentalForm.type === "rental_97_proviso" && (
                    <Rental97MainInputForm
                      value={rentalForm}
                      onChange={(patch) => onUpdateRentalVariant("rental_97_proviso", patch as Partial<RentalReductionFormVariant>)}
                    />
                  )}
                  {/* §97의2 입력 폼 */}
                  {id === "rental_97_2" && rentalForm && rentalForm.type === "rental_97_2" && (
                    <Rental972InputForm
                      value={rentalForm}
                      onChange={(patch) => onUpdateRentalVariant("rental_97_2", patch as Partial<RentalReductionFormVariant>)}
                    />
                  )}
                  {/* §97의4 입력 폼 */}
                  {id === "rental_97_4" && rentalForm && rentalForm.type === "rental_97_4" && (
                    <Rental974InputForm
                      value={rentalForm}
                      onChange={(patch) => onUpdateRentalVariant("rental_97_4", patch as Partial<RentalReductionFormVariant>)}
                      transferDate={transferDate}
                    />
                  )}
                  {/* §99의4 농어촌·고향주택 입력 폼 (2026-06-11) */}
                  {(id === "new_99_4_rural" || id === "new_99_4_hometown") &&
                    (() => {
                      const form994 = reductions.find((r) => r.type === id);
                      return form994 && (form994.type === "new_99_4_rural" || form994.type === "new_99_4_hometown") ? (
                        <New994InputForm
                          value={form994}
                          onChange={(patch) => onUpdate994(id as "new_99_4_rural" | "new_99_4_hometown", patch)}
                          transferDate={transferDate}
                        />
                      ) : null;
                    })()}
                  {/* §98의9 준공후미분양 입력 폼 (2026-06-11) */}
                  {id === "unsold_98_9" &&
                    (() => {
                      const form989 = reductions.find((r) => r.type === "unsold_98_9");
                      return form989 && form989.type === "unsold_98_9" ? (
                        <Unsold989InputForm value={form989} onChange={onUpdate989} />
                      ) : null;
                    })()}
                  {/* P1 (2026-06-11): §99 신축주택 IMF 1차 입력 폼 */}
                  {id === "new_99" &&
                    (() => {
                      const form99 = reductions.find((r) => r.type === "new_99");
                      return form99 && form99.type === "new_99" ? (
                        <New99InputForm value={form99} onChange={onUpdate99} />
                      ) : null;
                    })()}
                  {/* P1 (2026-06-11): §98의8 준공후미분양 50% 입력 폼 */}
                  {id === "unsold_98_8" &&
                    (() => {
                      const form988 = reductions.find((r) => r.type === "unsold_98_8");
                      return form988 && form988.type === "unsold_98_8" ? (
                        <Unsold988InputForm value={form988} onChange={onUpdate988} />
                      ) : null;
                    })()}
                  {/* P2 (2026-06-11): §98의7 9억↓ 미분양 입력 폼 */}
                  {id === "unsold_98_7" &&
                    (() => {
                      const form987 = reductions.find((r) => r.type === "unsold_98_7");
                      return form987 && form987.type === "unsold_98_7" ? (
                        <Unsold987InputForm value={form987} onChange={onUpdate987} />
                      ) : null;
                    })()}
                  {/* P2 (2026-06-11): §99의2 신축·미분양·1세대1주택 입력 폼 */}
                  {id === "unsold_99_2" &&
                    (() => {
                      const form992 = reductions.find((r) => r.type === "unsold_99_2");
                      return form992 && form992.type === "unsold_99_2" ? (
                        <Unsold992InputForm value={form992} onChange={onUpdate992} />
                      ) : null;
                    })()}
                  {/* P3 (2026-06-12): §98의3 / §98의5 / §98의6 입력 폼 */}
                  {id === "unsold_98_3" &&
                    (() => {
                      const form983 = reductions.find((r) => r.type === "unsold_98_3");
                      return form983 && form983.type === "unsold_98_3" ? (
                        <Unsold983InputForm value={form983} onChange={onUpdate983} />
                      ) : null;
                    })()}
                  {id === "unsold_98_5" &&
                    (() => {
                      const form985 = reductions.find((r) => r.type === "unsold_98_5");
                      return form985 && form985.type === "unsold_98_5" ? (
                        <Unsold985InputForm value={form985} onChange={onUpdate985} />
                      ) : null;
                    })()}
                  {id === "unsold_98_6" &&
                    (() => {
                      const form986 = reductions.find((r) => r.type === "unsold_98_6");
                      return form986 && form986.type === "unsold_98_6" ? (
                        <Unsold986InputForm value={form986} onChange={onUpdate986} />
                      ) : null;
                    })()}
                  {/* P5 (2026-06-12): §98 입력 폼 */}
                  {id === "unsold_98" &&
                    (() => {
                      const form98 = reductions.find((r) => r.type === "unsold_98");
                      return form98 && form98.type === "unsold_98" ? (
                        <Unsold98InputForm value={form98} onChange={onUpdate98} />
                      ) : null;
                    })()}
                  {/* P4 (2026-06-12): §98의2 / §98의4 입력 폼 */}
                  {id === "unsold_98_2" &&
                    (() => {
                      const form982 = reductions.find((r) => r.type === "unsold_98_2");
                      return form982 && form982.type === "unsold_98_2" ? (
                        <Unsold982InputForm value={form982} onChange={onUpdate982} />
                      ) : null;
                    })()}
                  {id === "unsold_98_4" &&
                    (() => {
                      const form984 = reductions.find((r) => r.type === "unsold_98_4");
                      return form984 && form984.type === "unsold_98_4" ? (
                        <Unsold984InputForm value={form984} onChange={onUpdate984Hybrid} />
                      ) : null;
                    })()}
                </ToggleCard>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

