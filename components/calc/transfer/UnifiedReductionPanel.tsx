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
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReductionPhdInput, type ReductionPhdValue } from "@/components/calc/transfer/ReductionPhdInput";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";
import { Rental97MainInputForm } from "@/components/calc/transfer/rental/Rental97MainInputForm";
import { Rental972InputForm } from "@/components/calc/transfer/rental/Rental972InputForm";
import { Rental974InputForm } from "@/components/calc/transfer/rental/Rental974InputForm";
import {
  REDUCTION_METADATA,
  ALL_REDUCTION_IDS,
  CATEGORY_UI_SCHEMA,
  countActiveReductionsByCategory,
  evaluateAllPeriods,
  type TransferReductionId,
  type ReductionCategory,
  type PeriodCheckContext,
} from "@/lib/tax-engine/transfer-reductions";

// ============================================================================
// Props
// ============================================================================

interface UnifiedReductionPanelProps {
  asset: AssetForm;
  /** 양도일 (form-level) */
  transferDate: string;
  onChange: (patch: Partial<AssetForm>) => void;
}

// ============================================================================
// 헬퍼: standalone 카테고리(자경·공익) 처리는 Step5 기존 서브패널에 위임
// 본 패널은 카테고리 헤더의 체크박스만 처리 (선택 상태 토글)
// ============================================================================

const STANDALONE_LABELS: Record<"self_farming" | "public_expropriation", { label: string; desc: string }> = {
  self_farming: { label: "자경농지 감면 (§69)", desc: "8년 이상 자경 (한도 1억)" },
  public_expropriation: { label: "공익사업 수용 감면 (§77)", desc: "현금 10% / 채권 15~40% (연간 2억)" },
};

function getStandaloneDefault(type: "self_farming" | "public_expropriation"): AssetReductionForm {
  if (type === "self_farming") {
    return { type: "self_farming", farmingYears: "0" };
  }
  return {
    type: "public_expropriation",
    expropriationCash: "0",
    expropriationBond: "0",
    expropriationBondHoldingYears: "none",
    expropriationApprovalDate: "",
  };
}

// ============================================================================
// 헬퍼: 그룹 카테고리 라디오 토글 — 같은 항목 재클릭 시 해제
// ============================================================================

/**
 * Legacy ID(자동변환 마이그레이션 전 또는 1개월 alias 기간) → 카테고리 매핑.
 * REDUCTION_METADATA에 등록되지 않은 legacy ID도 같은 카테고리 라디오 동작 시 제거되도록.
 * 사용자 결정사항 #4 (legacy 1개월 alias) 정책 준수.
 */
const LEGACY_TO_CATEGORY: Record<string, ReductionCategory> = {
  long_term_rental: "rental",
  new_housing: "new_housing",
  unsold_housing: "unsold_housing",
};

function toggleGroupRadio(
  reductions: AssetReductionForm[],
  category: ReductionCategory,
  newId: TransferReductionId,
  alreadySelected: boolean,
): AssetReductionForm[] {
  // 1. 같은 카테고리 기존 선택 제거 (라디오 동작) — legacy ID도 포함
  const others = reductions.filter((r) => {
    const meta = REDUCTION_METADATA[r.type as TransferReductionId];
    const cat = meta?.category ?? LEGACY_TO_CATEGORY[r.type];
    return cat !== category;
  });

  // 2. 같은 항목 재클릭 시 해제 (사용자 결정사항 #5)
  if (alreadySelected) return others;

  // 3. 신규 선택 추가
  return [...others, getReductionDefault(newId)];
}

/** §97 시리즈 공통 기본값 (3-state 초기값 준수: rentIncreaseViolationMode="" / hasVacancyOver6Months=null) */
const RENTAL_COMMON_DEFAULTS = {
  registrationDate: "",
  isTaxRegistered: false,
  rentalStartDate: "",
  rentIncreaseViolationMode: "" as const,
  rentHistory: [],
  hasVacancyOver6Months: null,
  vacancyPeriods: [],
};

function getReductionDefault(id: TransferReductionId): AssetReductionForm {
  if (id === "new_99_3") {
    return {
      type: "new_99_3",
      contractDate993: "",
      usageApprovalDate993: "",
      standardPriceAt5Years: "",
      standardPriceAtAcquisition993: "",
      standardPriceAtTransfer993: "",
      region993: "outside_speculation",
      acquisitionType993: "from_builder",
      hasOccupancyAtContract: false,
      isResident993: true,
      isHousingConstructionBusiness993: false,
    };
  }
  // ── §97 시리즈 기본값 (Phase 2, 2026-06-11) ──
  if (id === "rental_97_3") {
    return {
      type: "rental_97_3",
      ...RENTAL_COMMON_DEFAULTS,
      rentalHousingType: "long_term_private",
      propertyType: "non_apartment",
      region: "capital",
      officialPriceAtStart: "",
      isNationalHousingScale: false,
      isConvertedFromShortTerm: false,
    };
  }
  if (id === "rental_97_4") {
    return {
      type: "rental_97_4",
      ...RENTAL_COMMON_DEFAULTS,
      region: "capital",
    };
  }
  if (id === "rental_97_5") {
    return {
      type: "rental_97_5",
      ...RENTAL_COMMON_DEFAULTS,
      officialPriceAtStart: "",
      region: "capital",
    };
  }
  if (id === "rental_97_main") {
    return {
      type: "rental_97_main",
      ...RENTAL_COMMON_DEFAULTS,
      constructionYear: "",
      isNationalHousing: false,
    };
  }
  if (id === "rental_97_proviso") {
    return {
      type: "rental_97_proviso",
      ...RENTAL_COMMON_DEFAULTS,
      constructionYear: "",
      isNationalHousing: false,
      provisoCase: undefined,
    };
  }
  if (id === "rental_97_2") {
    return {
      type: "rental_97_2",
      ...RENTAL_COMMON_DEFAULTS,
      rental972Type: "",
      isNationalHousing: false,
    };
  }
  // Phase 1 stub: type만 (실제로 활성 클릭 불가하므로 도달하지 않음)
  return { type: id } as AssetReductionForm;
}

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
  function toggleStandalone(type: "self_farming" | "public_expropriation") {
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
          periodResults={periodResults}
          reductions={reductions}
          onSelectId={(id) => toggleGroup(cat, id)}
          new993={new993 && new993.type === "new_99_3" ? new993 : undefined}
          onUpdate993={update993}
          onUpdateRentalVariant={updateRentalVariant}
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
  type: "self_farming" | "public_expropriation";
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
  periodResults,
  reductions,
  onSelectId,
  new993,
  onUpdate993,
  onUpdateRentalVariant,
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
          <span className="text-sm font-semibold">
            {isOpen ? "▼" : "▶"} {schema.title}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">{schema.subtitle}</span>
        </div>
        <span className="text-xs">
          <span className={counter.active > 0 ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
            활성 {counter.active}
          </span>
          <span className="mx-1 text-muted-foreground">/</span>
          <span className="text-muted-foreground">전체 {counter.total}</span>
        </span>
      </button>
      {isOpen && (
        <div className="border-t border-border px-4 py-3 space-y-2">
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
            <p className="mt-1.5 text-[10px] text-muted-foreground leading-relaxed">
              ※ 분양·매매계약 + 계약금 납부 시점. <strong>신축·미분양·임대 감면 시한 판정의 1차 기준</strong>.
              미입력 시 자산의 취득일을 사용합니다 (조문 단서 &ldquo;매매계약 + 계약금 = 취득&rdquo;).
            </p>
          </div>

          {items.map((id) => {
            const itemMeta = REDUCTION_METADATA[id];
            const period = periodResults[id];
            const isFullyImplemented = itemMeta.isFullyImplemented === true;
            const isDisabled = !period.inPeriod || !isFullyImplemented;
            const isSelected = reductions.some((r) => r.type === id);

            // 비활성 사유 (시한 외 / 미구현)
            const disabledReason = !period.inPeriod
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
                </ToggleCard>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 서브 컴포넌트: §99의3 본격 입력 폼
// ============================================================================

function New993InputForm({
  value,
  onUpdate,
  acquisitionDate,
  assetPhdSnapshot,
}: {
  value: Extract<AssetReductionForm, { type: "new_99_3" }>;
  onUpdate: <K extends keyof Extract<AssetReductionForm, { type: "new_99_3" }>>(
    key: K,
    v: Extract<AssetReductionForm, { type: "new_99_3" }>[K],
  ) => void;
  /** 자산의 취득일 — PHD 자동 활성화 권장 판정용 */
  acquisitionDate?: string;
  /** 자산-수준 PHD 데이터 스냅샷 — "자산 카드 PHD 데이터 가져오기" 버튼용 */
  assetPhdSnapshot?: ReductionPhdValue;
}) {
  return (
    <div className="mt-2 ml-7 rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
      <p className="text-xs font-semibold text-primary">조특법 §99의3 신축주택 과세특례 입력</p>

      {/* Round 9 정정 (2026-05-06): 1호(주건업) 시한 기준은 상단 "매매계약일"을 재사용. 본 폼에서는 입력 X. */}
      {value.acquisitionType993 === "from_builder" && (
        <div className="rounded-md border border-dashed border-primary/40 bg-primary/10 px-2.5 py-1.5">
          <p className="text-[10px] text-primary leading-relaxed">
            ℹ️ 1호 매매계약일은 <strong>상단 펼침 영역의 &ldquo;매매계약일 (분양/매매)&rdquo;</strong>을 사용합니다.
            §99의3 시한 판정 + 고가주택 적용기준일이 동일하게 처리됩니다.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">취득 유형</label>
          <Select
            value={value.acquisitionType993}
            onValueChange={(v) => v && onUpdate("acquisitionType993", v as "from_builder" | "self_built")}
          >
            <SelectTrigger>
              <SelectValue>
                {value.acquisitionType993 === "self_built"
                  ? "2호 — 자기건설 신축"
                  : "1호 — 주택건설사업자로부터 취득"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="from_builder">1호 — 주택건설사업자로부터 취득</SelectItem>
              <SelectItem value="self_built">2호 — 자기건설 신축</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">소재지</label>
          <Select
            value={value.region993}
            onValueChange={(v) => v && onUpdate("region993", v as "outside_speculation" | "speculation")}
          >
            <SelectTrigger>
              <SelectValue>
                {value.region993 === "speculation"
                  ? "가격 급등 지역(서울·과천·5대 신도시) — 적용 배제"
                  : "가격 급등 지역 외"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="outside_speculation">가격 급등 지역 외</SelectItem>
              <SelectItem value="speculation">가격 급등 지역(서울·과천·5대 신도시) — 적용 배제</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {value.acquisitionType993 === "self_built" && (
          <div>
            <label className="mb-1 block text-xs font-medium">사용승인일</label>
            <DateInput value={value.usageApprovalDate993 ?? ""} onChange={(v) => onUpdate("usageApprovalDate993", v)} />
            <p className="mt-1 text-[10px] text-muted-foreground">2001.5.23~2003.6.30 시한</p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium">취득시 기준시가 (원)</label>
          <CurrencyInput label="" value={value.standardPriceAtAcquisition993} onChange={(v) => onUpdate("standardPriceAtAcquisition993", v)} />
          <p className="mt-1 text-[10px] text-muted-foreground">최초고시 전 취득 시 아래 PHD 환산 자동 적용 가능</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">5년 시점 기준시가 (원)</label>
          <CurrencyInput label="" value={value.standardPriceAt5Years} onChange={(v) => onUpdate("standardPriceAt5Years", v)} />
          <p className="mt-1 text-[10px] text-muted-foreground">취득일 + 5년 시점 인접 고시일 가격</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">양도시 기준시가 (원, 선택)</label>
          <CurrencyInput label="" value={value.standardPriceAtTransfer993 ?? ""} onChange={(v) => onUpdate("standardPriceAtTransfer993", v)} />
          <p className="mt-1 text-[10px] text-muted-foreground">미입력 시 자산의 양도시 기준시가 사용</p>
        </div>
      </div>

      {/* Round 10 (2026-05-06): PHD 환산 위젯 — 신축주택 취득 당시 공시가격 미공시 케이스 */}
      <ReductionPhdInput
        acquisitionDate={acquisitionDate}
        value={{
          phdMode: value.phdMode993,
          firstDisclosureDate: value.phdFirstDisclosureDate993,
          firstDisclosurePrice: value.phdFirstDisclosurePrice993,
          landAreaSqm: value.phdLandAreaSqm993,
          landPricePerSqmAtAcq: value.phdLandPricePerSqmAtAcq993,
          landPricePerSqmAtFirst: value.phdLandPricePerSqmAtFirst993,
          buildingStdAtAcq: value.phdBuildingStdAtAcq993,
          buildingStdAtFirst: value.phdBuildingStdAtFirst993,
        }}
        onChange={(patch) => {
          if (patch.phdMode !== undefined) onUpdate("phdMode993", patch.phdMode);
          if (patch.firstDisclosureDate !== undefined) onUpdate("phdFirstDisclosureDate993", patch.firstDisclosureDate);
          if (patch.firstDisclosurePrice !== undefined) onUpdate("phdFirstDisclosurePrice993", patch.firstDisclosurePrice);
          if (patch.landAreaSqm !== undefined) onUpdate("phdLandAreaSqm993", patch.landAreaSqm);
          if (patch.landPricePerSqmAtAcq !== undefined) onUpdate("phdLandPricePerSqmAtAcq993", patch.landPricePerSqmAtAcq);
          if (patch.landPricePerSqmAtFirst !== undefined) onUpdate("phdLandPricePerSqmAtFirst993", patch.landPricePerSqmAtFirst);
          if (patch.buildingStdAtAcq !== undefined) onUpdate("phdBuildingStdAtAcq993", patch.buildingStdAtAcq);
          if (patch.buildingStdAtFirst !== undefined) onUpdate("phdBuildingStdAtFirst993", patch.buildingStdAtFirst);
        }}
        onApplyResult={(estimated) => onUpdate("standardPriceAtAcquisition993", String(estimated))}
        assetHasPhdData={!!assetPhdSnapshot}
        onCopyFromAsset={
          assetPhdSnapshot
            ? () => {
                if (assetPhdSnapshot.firstDisclosureDate !== undefined) onUpdate("phdFirstDisclosureDate993", assetPhdSnapshot.firstDisclosureDate);
                if (assetPhdSnapshot.firstDisclosurePrice !== undefined) onUpdate("phdFirstDisclosurePrice993", assetPhdSnapshot.firstDisclosurePrice);
                if (assetPhdSnapshot.landAreaSqm !== undefined) onUpdate("phdLandAreaSqm993", assetPhdSnapshot.landAreaSqm);
                if (assetPhdSnapshot.landPricePerSqmAtAcq !== undefined) onUpdate("phdLandPricePerSqmAtAcq993", assetPhdSnapshot.landPricePerSqmAtAcq);
                if (assetPhdSnapshot.landPricePerSqmAtFirst !== undefined) onUpdate("phdLandPricePerSqmAtFirst993", assetPhdSnapshot.landPricePerSqmAtFirst);
                if (assetPhdSnapshot.buildingStdAtAcq !== undefined) onUpdate("phdBuildingStdAtAcq993", assetPhdSnapshot.buildingStdAtAcq);
                if (assetPhdSnapshot.buildingStdAtFirst !== undefined) onUpdate("phdBuildingStdAtFirst993", assetPhdSnapshot.buildingStdAtFirst);
              }
            : undefined
        }
      />

      {value.acquisitionType993 === "from_builder" && (
        <ToggleCard
          variant="chip"
          checked={value.hasOccupancyAtContract ?? false}
          onCheckedChange={(v) => onUpdate("hasOccupancyAtContract", v)}
          title="매매계약일 현재 다른 자가 입주한 사실 있음"
          description="1호 단서 — 적용 배제"
          tone="rose"
        />
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <ToggleCard
          variant="chip"
          checked={value.isResident993}
          onCheckedChange={(v) => onUpdate("isResident993", v)}
          title="거주자"
          description="체크 해제 시 적용 배제"
          tone="violet"
        />
        <ToggleCard
          variant="chip"
          checked={value.isHousingConstructionBusiness993}
          onCheckedChange={(v) => onUpdate("isHousingConstructionBusiness993", v)}
          title="본인이 주택건설사업자"
          description="체크 시 적용 배제"
          tone="rose"
        />
      </div>

      <p className="text-[10px] text-muted-foreground">
        ※ 5년 내 양도 = 양도소득금액 전액 차감 / 5년 후 양도 = 5년 안분 산식 적용
      </p>
    </div>
  );
}
