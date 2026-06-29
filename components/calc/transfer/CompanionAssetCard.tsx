"use client";

/**
 * CompanionAssetCard — 자산 1건 입력 카드 (오케스트레이터).
 *
 * 점진적 노출(progressive disclosure): 진입 시 전부 접힘 + 5개 접기 섹션
 * (① 기본 / ② 양도 / ③ 취득 / ④ 필요경비 / ⑤ 기타특례). 섹션 본문은 asset-sections/*.
 * 계획: docs/00-pm/transfer-asset-input-progressive-disclosure.plan.md
 *
 * 보존 contract:
 *  - 루트 div `data-asset-card-index`(C1 — TransferTaxCalculator.scrollToAssetCard 타깃)·`scroll-mt-24`·조건부 tone.
 *  - errorMessage·dateOrderWarning 배너는 아코디언 위 항상 노출.
 *  - 검증 오류 시 5개 전부 forceOpen(H2 — ValidationIssue에 section 키 없음).
 *  - assetKind 특수종류·겸용 토글 ON 시 ③ 자동 펼침(G7 — onChange 핸들러 로컬 setState, useEffect 아님).
 */
import { useMemo, useRef, useState } from "react";

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUnifiedRateBadge } from "./CompanionAssetCardNewConstruction";
import { getAssetDateOrderError } from "@/lib/calc/transfer-tax-validate-asset";
import type { BundledSaleMode } from "./CompanionSaleModeBlock";
import { ASSET_KIND_LABELS } from "./asset-labels";
import { summarizeAssetSections } from "./asset-section-summary";
import { AssetSection } from "./AssetSection";
import { AssetSectionBasic } from "./asset-sections/AssetSectionBasic";
import { AssetSectionTransfer } from "./asset-sections/AssetSectionTransfer";
import { AssetSectionAcquisition } from "./asset-sections/AssetSectionAcquisition";
import { AssetSectionExpense } from "./asset-sections/AssetSectionExpense";
import { AssetSectionExtras } from "./asset-sections/AssetSectionExtras";

/** ③ 취득정보를 자동으로 펼치게 하는 assetKind (전용 블록이 ③에 나타나는 종류) */
const ACQUISITION_AUTO_OPEN_KINDS = new Set<AssetForm["assetKind"]>([
  "commercial_building",
  "general_building",
  "redevelopment_apt",
]);

interface Props {
  index: number;
  asset: AssetForm;
  bundledSaleMode: BundledSaleMode;
  onChange: (patch: Partial<AssetForm>) => void;
  /** undefined이면 삭제 버튼을 숨김 (1건일 때) */
  onRemove?: () => void;
  /** 단일 자산 모드: 양도가액 레이블·힌트를 §166⑥ 없이 단순화 */
  singleMode?: boolean;
  /** 양도일 (공시가격 기준연도 자동 계산용) */
  transferDate?: string;
  /** 증환지 증가분 등 자산 자동 추가 콜백 */
  onAddAsset?: (patch: Partial<AssetForm>) => void;
  /** 폼-수준 총 양도가액 — 지분 모드 시 ratio×total 자동 계산용 */
  contractTotalPrice?: string;
  /** 폼-수준 총 양도비 — 자산별 자동 안분 표시용 */
  totalTransferExpense?: string;
  /** 사례 28 — 주된 자산 정보 (부수토지 일체과세 자동 분기 배지 표시용). */
  primaryAsset?: AssetForm;
  /** 1세대1주택 + householdHousingCount === 1 충족 여부 (form-전역, 사례 45). */
  isOneHouseSingle?: boolean;
  /** 검증 실패 메시지 — 이 자산 카드에 해당하는 오류. 상단 인라인 배너 + 테두리 강조 + 전체 펼침. */
  errorMessage?: string;
}

const SECTION_CHIPS = [
  { num: 1 as const, name: "기본" },
  { num: 2 as const, name: "양도" },
  { num: 3 as const, name: "취득" },
  { num: 4 as const, name: "경비" },
  { num: 5 as const, name: "특례" },
];

export function CompanionAssetCard({
  index,
  asset,
  bundledSaleMode,
  onChange,
  onRemove,
  singleMode,
  transferDate,
  onAddAsset,
  contractTotalPrice,
  totalTransferExpense,
  primaryAsset,
  isOneHouseSingle,
  errorMessage,
}: Props) {
  const isMultiBundled = !singleMode && bundledSaleMode !== undefined;
  const isPrimary = asset.isPrimaryForHouseholdFlags;
  const kindLabel = ASSET_KIND_LABELS[asset.assetKind] ?? asset.assetKind;
  const isNewConstruction = asset.acquisitionCause === "newConstruction";

  // 부수토지 일체과세 자동 분기 배지 (useEffect 금지 — useMemo 훅) / 날짜 순서 실시간 경고
  const showUnifiedBadge = useUnifiedRateBadge(asset, primaryAsset, transferDate);
  const dateOrderWarning = getAssetDateOrderError(asset, transferDate);

  // 섹션 요약(라벨 전용·금액 없음) — store 미러링 없음, useMemo
  const summary = useMemo(
    () => summarizeAssetSections(asset, { totalTransferExpense }),
    [asset, totalTransferExpense],
  );

  // 접기 상태 — 전부 접힘 기본. 로컬 state (useEffect→store 미러링 없음)
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const forceOpenAll = !!errorMessage; // 검증 오류 시 5개 전부 펼침 (H2)
  const cardRef = useRef<HTMLDivElement>(null);

  function toggleSection(num: number) {
    setOpen((o) => ({ ...o, [num]: !o[num] }));
  }

  // 칩 클릭 — 해당 섹션 펼침 + 스크롤 + 헤더 포커스(a11y)
  function jumpToSection(num: number) {
    setOpen((o) => ({ ...o, [num]: true }));
    requestAnimationFrame(() => {
      const header = cardRef.current?.querySelector<HTMLElement>(
        `[data-asset-section="${num}"] > button`,
      );
      header?.scrollIntoView({ behavior: "smooth", block: "start" });
      header?.focus();
    });
  }

  // 자동 노출(G7) — assetKind 특수종류·겸용 토글 ON 시 ③ 자동 펼침. onChange 래퍼(useEffect 아님).
  function handleBasicChange(patch: Partial<AssetForm>) {
    if (
      (patch.assetKind && ACQUISITION_AUTO_OPEN_KINDS.has(patch.assetKind)) ||
      patch.isMixedUseHouse === true
    ) {
      setOpen((o) => ({ ...o, 3: true }));
    }
    onChange(patch);
  }

  const status = (filled: boolean): "filled" | "empty" => (filled ? "filled" : "empty");

  // 칩 status lookup (섹션 번호 → 요약). ⑤는 미적용 시 null → 칩 미표시.
  const summaryByNum: Record<number, { filled: boolean } | null> = {
    1: summary.basic,
    2: summary.transfer,
    3: summary.acquisition,
    4: summary.expense,
    5: summary.extras,
  };

  return (
    <div
      ref={cardRef}
      data-asset-card-index={index}
      className={cn(
        "border rounded-lg p-4 space-y-3 scroll-mt-24",
        errorMessage
          ? "border-destructive ring-1 ring-destructive/30 bg-destructive/[0.03]"
          : isPrimary ? "bg-background border-primary/30" : "bg-muted/30",
      )}
    >
      {errorMessage && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {errorMessage}
        </p>
      )}
      {/* 실시간 날짜 순서 경고 — 차단 배너(errorMessage)와 중복 시 차단 배너 우선 */}
      {dateOrderWarning && !errorMessage && (
        <p className="rounded-md border border-amber-300 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
          {dateOrderWarning} 날짜를 확인해 주세요.
        </p>
      )}

      {/* 헤더 — 자산 번호·종류·배지·삭제 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">
            자산 {index + 1} — {kindLabel}
          </span>
          {isPrimary && (
            <span className="inline-flex rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-medium">
              주 자산
            </span>
          )}
          {bundledSaleMode === "actual" && (
            <span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
              계약서 가액
            </span>
          )}
          {showUnifiedBadge && (
            <span className="inline-flex rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] text-amber-800">
              주택·부수토지 일체과세 자동 적용 중 (§89·영 §154⑦, 재산-53·재산-1354)
            </span>
          )}
        </div>
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onRemove}
          >
            삭제
          </Button>
        )}
      </div>

      {/* 점프 인덱스 칩바 (비-sticky, flex-wrap — 모바일 줄바꿈) */}
      <div className="flex flex-wrap gap-1.5">
        {SECTION_CHIPS.map((chip) => {
          const sec = summaryByNum[chip.num];
          if (chip.num === 5 && !sec) return null;
          const filled = !!sec?.filled;
          return (
            <button
              key={chip.num}
              type="button"
              onClick={() => jumpToSection(chip.num)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
            >
              <span className="font-semibold text-foreground">{chip.num}</span>
              {chip.name}
              <span className={filled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40"} aria-hidden>
                {filled ? "✓" : "○"}
              </span>
            </button>
          );
        })}
      </div>

      {/* ① 기본정보 */}
      <AssetSection
        num={1}
        title="기본정보"
        tone="sky"
        summary={summary.basic.label}
        status={status(summary.basic.filled)}
        open={!!open[1]}
        onToggle={() => toggleSection(1)}
        forceOpen={forceOpenAll}
      >
        <AssetSectionBasic
          asset={asset}
          onChange={handleBasicChange}
          isMultiBundled={isMultiBundled}
          onAddAsset={onAddAsset}
        />
      </AssetSection>

      {/* ② 양도정보 */}
      <AssetSection
        num={2}
        title="양도정보"
        tone="emerald"
        summary={summary.transfer.label}
        status={status(summary.transfer.filled)}
        open={!!open[2]}
        onToggle={() => toggleSection(2)}
        forceOpen={forceOpenAll}
      >
        <AssetSectionTransfer
          asset={asset}
          onChange={onChange}
          singleMode={singleMode}
          bundledSaleMode={bundledSaleMode}
          transferDate={transferDate}
          contractTotalPrice={contractTotalPrice}
        />
      </AssetSection>

      {/* ③ 취득정보 */}
      <AssetSection
        num={3}
        title="취득정보"
        tone="amber"
        summary={summary.acquisition.label}
        status={status(summary.acquisition.filled)}
        open={!!open[3]}
        onToggle={() => toggleSection(3)}
        forceOpen={forceOpenAll}
      >
        <AssetSectionAcquisition
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
          isNewConstruction={isNewConstruction}
          isPrimary={isPrimary}
          isOneHouseSingle={isOneHouseSingle}
        />
      </AssetSection>

      {/* ④ 필요경비 */}
      <AssetSection
        num={4}
        title="필요경비"
        tone="slate"
        summary={summary.expense.label}
        status={status(summary.expense.filled)}
        open={!!open[4]}
        onToggle={() => toggleSection(4)}
        forceOpen={forceOpenAll}
      >
        <AssetSectionExpense
          asset={asset}
          onChange={onChange}
          totalTransferExpense={totalTransferExpense}
        />
      </AssetSection>

      {/* ⑤ 기타 특례 — 적용 자산일 때만 노출 */}
      {summary.extras && (
        <AssetSection
          num={5}
          title="기타 특례"
          tone="violet"
          summary={summary.extras.label}
          status={status(summary.extras.filled)}
          open={!!open[5]}
          onToggle={() => toggleSection(5)}
          forceOpen={forceOpenAll}
        >
          <AssetSectionExtras asset={asset} onChange={onChange} transferDate={transferDate} />
        </AssetSection>
      )}

      {/* 감면은 Step 5(감면·공제)에서 자산별로 선택합니다 */}
    </div>
  );
}
