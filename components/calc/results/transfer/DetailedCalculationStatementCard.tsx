"use client";

/**
 * 계산결과 상세명세서 카드
 *
 * 신고서 양식 표(FilingFormTable)의 32 항목 각각이 어떻게 계산되었는지를
 * 산식·실제 변수값·법령 근거와 함께 노출. 사용자가 로직과 계산 과정을
 * 1:1로 검증할 수 있게 하는 것이 목표.
 *
 * - 단건 모드: 합계만 표시
 * - 다건 모드: 합계 + 자산별 disclosure 펼침 (토지·건물·증축건물 등)
 * - 엔진 변경 0 — 기존 result.steps[]·result 필드 재가공
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ExpandToggleButton, expandToggleClass, expandToggleLabel } from "@/components/calc/results/shared/ExpandToggleButton";
import { FormulaText } from "@/components/calc/results/shared/FormulaParts";
import type { AggregateMeta } from "./FilingFormTableHelpers";
import {
  STATEMENT_GROUPS,
  buildStatementItems,
  type StatementItem,
  type GroupDef,
  type PerAssetValue,
} from "./DetailedStatementHelpers";

// ── tone → Tailwind 매핑 ─────────────────────────────────────────

const TONE_CLASSES: Record<GroupDef["tone"], { border: string; bg: string; text: string; badge: string }> = {
  sky:     { border: "border-sky-200",     bg: "bg-sky-50/40",     text: "text-sky-800",     badge: "bg-sky-200 text-sky-800" },
  emerald: { border: "border-emerald-200", bg: "bg-emerald-50/40", text: "text-emerald-800", badge: "bg-emerald-200 text-emerald-800" },
  amber:   { border: "border-amber-200",   bg: "bg-amber-50/40",   text: "text-amber-800",   badge: "bg-amber-200 text-amber-800" },
  violet:  { border: "border-violet-200",  bg: "bg-violet-50/40",  text: "text-violet-800",  badge: "bg-violet-200 text-violet-800" },
  rose:    { border: "border-rose-200",    bg: "bg-rose-50/40",    text: "text-rose-800",    badge: "bg-rose-200 text-rose-800" },
  slate:   { border: "border-slate-200",   bg: "bg-slate-50/40",   text: "text-slate-800",   badge: "bg-slate-200 text-slate-800" },
};

// ── Props ──────────────────────────────────────────────────────────

interface Props {
  result: TransferTaxResult;
  formData?: TransferFormData;
  asset?: AssetForm;
  transferPriceOverride?: number;
  aggregate?: AggregateMeta;
  onPrint?: () => void;
  /** 취득일자 행 라벨 보조 (예: "(이월과세 적용 — 증여자 취득일 기산)") */
  acquisitionDateLabel?: string;
  /** 취득일자 표시값 override — carryover Scenario A에서 증여자 취득일 우선 표시 */
  acquisitionDateOverride?: string;
}

// ── 메인 ───────────────────────────────────────────────────────────

export function DetailedCalculationStatementCard({
  result,
  formData,
  asset,
  transferPriceOverride,
  aggregate,
  onPrint,
  acquisitionDateLabel,
  acquisitionDateOverride,
}: Props) {
  const items = buildStatementItems(
    result,
    formData,
    asset,
    aggregate,
    transferPriceOverride,
    acquisitionDateLabel,
    acquisitionDateOverride,
  );

  // 렌더 대상 그룹만 추출 (빈 그룹 제외).
  const visibleGroups = STATEMENT_GROUPS.map((group) => ({
    group,
    groupItems: group.itemKeys
      .map((key) => items.get(key))
      .filter((it): it is StatementItem => !!it),
  })).filter(({ groupItems }) => groupItems.length > 0);

  // 그룹별 펼침 상태 — 기본 전체 펼침(기존 동작 유지). 헤더의 전체 토글로 일괄 제어.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(STATEMENT_GROUPS.map((g) => [g.id, true])),
  );
  const allOpen = visibleGroups.every(({ group }) => openMap[group.id]);
  const setAllGroups = (value: boolean) =>
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const { group } of visibleGroups) next[group.id] = value;
      return next;
    });
  const toggleGroup = (id: string) =>
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div
      data-print-section="detailed-statement"
      className="rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 overflow-hidden"
    >
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-slate-300 bg-slate-100 dark:bg-slate-800">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              📋 계산결과 상세명세서
            </h3>
            <p className="text-caption text-slate-500 mt-0.5">
              신고서 양식 32 항목별 산식·변수값·법령 근거. 다건 모드는 자산별 펼침으로 검증.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {visibleGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setAllGroups(!allOpen)}
                aria-expanded={allOpen}
                className={expandToggleClass("slate")}
              >
                {allOpen ? "▲ 전체 접기" : "▼ 전체 펼치기"}
              </button>
            )}
            {onPrint && (
              <button
                type="button"
                onClick={onPrint}
                className="print:hidden rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-200 transition-colors text-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                🖨️ PDF
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 비과세 모드 안내 배지 — 32항목 값이 모두 0/N/A이지만 계산 산식·법령은 그대로 노출 */}
      {result.isExempt && (
        <div className="mx-4 mt-4 rounded-lg border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3">
          <div className="flex items-start gap-2">
            <span className="text-xl">🎉</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                전액 비과세 — 납부세액 0
              </p>
              {result.exemptReason && (
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                  사유: {result.exemptReason}
                </p>
              )}
              <p className="text-caption text-emerald-700/70 mt-1">
                아래 32 항목은 산식·법령 근거 검증용으로 표시됩니다 (대부분 0원).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 그룹 섹션 — 빈 그룹은 자동 미렌더 (단건 모드 다건 합산 그룹 등) */}
      <div className="p-4 space-y-3">
        {visibleGroups.map(({ group, groupItems }) => (
          <GroupSection
            key={group.id}
            group={group}
            items={groupItems}
            open={openMap[group.id]}
            onToggle={() => toggleGroup(group.id)}
          />
        ))}

        {/* 전체 엔진 계산 과정 — 서브 토글 (이전 'TransferTaxResultView 계산 과정 상세 보기' 통합) */}
        <EngineStepsSubToggle steps={result.steps} />
      </div>
    </div>
  );
}

// ── 엔진 step 서브 토글 ───────────────────────────────────────────────

/**
 * 명세서 카드 마지막에 마운트되는 "전체 엔진 계산 과정" 토글.
 * result.steps[]를 시간순으로 그대로 노출 — 명세서 32항목 외 중간 step (환산취득가 산정·NBL 판정·비교과세 등) 검증용.
 *
 * 이전: TransferTaxResultView·BundledAllocationCard·MultiTransferTaxResultView·MixedUseResultCard에 별도 토글
 * 통합: 명세서 카드 단일 위치로 정보 집중 (사용자 결정 2026-05-12)
 */
function EngineStepsSubToggle({ steps }: { steps: import("@/lib/tax-engine/transfer-tax").CalculationStep[] }) {
  const [open, setOpen] = useState(false);
  if (!steps || steps.length === 0) return null;

  return (
    <section className="rounded-lg border border-slate-300 bg-slate-50/40 dark:bg-slate-800/30 print:break-inside-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="print:hidden w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-expanded={open}
      >
        <span>전체 엔진 계산 과정 보기 ({steps.length}개 step)</span>
        <span className={expandToggleClass("slate")} aria-hidden>{expandToggleLabel(open)}</span>
      </button>
      {/* PDF 인쇄: 항상 표시 (헤더 텍스트도 화면 전용 → 인쇄용 별도 헤더 노출) */}
      <div className="hidden print:block px-3 py-2 text-sm font-semibold text-slate-700 border-b border-slate-200">
        전체 엔진 계산 과정 ({steps.length}개 step)
      </div>
      <div
        className={cn(
          "rounded-b-lg divide-y divide-slate-100 dark:divide-slate-800 text-sm",
          // 화면: open 상태일 때만. 인쇄: 항상 표시.
          open ? "block" : "hidden print:block",
        )}
      >
        {steps.map((step, i) => (
          <div
            key={i}
            className={cn(
              "py-2.5 flex justify-between gap-4 print:break-inside-avoid",
              step.sub ? "pl-8 pr-4 bg-slate-100/50 dark:bg-slate-800/40" : "px-4",
            )}
          >
            <div className="min-w-0">
              <p
                className={cn(
                  "font-medium",
                  step.sub && "text-muted-foreground text-xs",
                )}
              >
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 break-words leading-relaxed">
                <FormulaText value={step.formula} />
              </p>
              {step.legalBasis && !step.sub && (
                <LawArticleModal legalBasis={step.legalBasis} />
              )}
            </div>
            <p
              className={cn(
                "font-mono shrink-0 tabular-nums",
                step.sub ? "text-xs text-muted-foreground" : "font-medium",
              )}
            >
              {formatKRW(step.amount)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 그룹 섹션 ──────────────────────────────────────────────────────

function GroupSection({
  group,
  items,
  open,
  onToggle,
}: {
  group: GroupDef;
  items: StatementItem[];
  open: boolean;
  onToggle: () => void;
}) {
  const tone = TONE_CLASSES[group.tone];
  // 펼침 상태는 부모가 관리 (헤더의 전체 토글로 일괄 제어) — 인쇄 시 print-only-css-toggle로 항상 표시.
  return (
    <section
      className={cn(
        "rounded-lg border p-3 space-y-2",
        // PDF 인쇄: 그룹 자체가 페이지 사이에 잘리지 않도록 회피.
        "print:break-inside-avoid",
        tone.border,
        tone.bg,
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full text-micro font-bold select-none",
            tone.badge,
          )}
        >
          §
        </span>
        <h4 className={cn("text-sm font-semibold", tone.text)}>{group.title}</h4>
        <span className="ml-auto">
          <ExpandToggleButton open={open} onClick={onToggle} tone={group.tone} />
        </span>
      </div>
      <div
        className={cn(
          "rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800",
          // 화면: open일 때만. 인쇄: 항상 표시.
          open ? "block" : "hidden print:block",
        )}
      >
        {items.map((item, i) => (
          <ItemRow key={i} item={item} />
        ))}
      </div>
    </section>
  );
}

// ── 항목 행 ────────────────────────────────────────────────────────

function ItemRow({ item }: { item: StatementItem }) {
  const [open, setOpen] = useState(false);
  const hasPerAsset = !!item.perAsset && item.perAsset.length > 0;
  const isNumber = typeof item.value === "number";
  const valueDisplay =
    item.value === null || item.value === ""
      ? "-"
      : isNumber
        ? formatKRW(item.value as number)
        : String(item.value);

  return (
    // PDF 인쇄: 항목 행이 페이지 사이에 잘리지 않도록 회피.
    <div className="px-3 py-2.5 print:break-inside-avoid">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {hasPerAsset && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="print:hidden inline-flex h-4 w-4 items-center justify-center rounded text-micro text-muted-foreground hover:text-foreground"
                aria-label={open ? "자산별 닫기" : "자산별 펼치기"}
              >
                {open ? "▲" : "▼"}
              </button>
            )}
            <p className="font-medium text-sm">{item.label}</p>
          </div>
          {item.formula && (
            // 긴 산식(자산별 안분 등) 줄바꿈 처리: break-words로 단어 단위 줄바꿈,
            // PDF 인쇄에서도 가로 잘림 방지.
            <p className="text-xs text-muted-foreground mt-0.5 ml-6 leading-relaxed break-words">
              <FormulaText value={item.formula} />
            </p>
          )}
          {item.note && (
            <p className="text-caption text-amber-700 mt-0.5 ml-6 italic break-words">
              ※ {item.note}
            </p>
          )}
          {item.legalBasis && (
            <div className="ml-6 mt-0.5">
              <LawArticleModal legalBasis={item.legalBasis} />
            </div>
          )}
        </div>
        <p className="font-mono text-sm shrink-0 font-medium text-right tabular-nums">
          {valueDisplay}
        </p>
      </div>

      {/* 자산별 펼침 (disclosure) — PDF 인쇄 시 자동 노출(open 무관) */}
      {hasPerAsset && (
        <div
          className={cn(
            "mt-2 ml-6 rounded border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 divide-y divide-slate-100 dark:divide-slate-700",
            // 화면: open 상태일 때만 표시. 인쇄: 항상 표시(검증 가능성 우선).
            open ? "block" : "hidden print:block",
          )}
        >
          {item.perAsset!.map((row, i) => (
            <PerAssetRow key={i} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function PerAssetRow({ row }: { row: PerAssetValue }) {
  const isNumber = typeof row.value === "number";
  const valueDisplay = isNumber ? formatKRW(row.value as number) : String(row.value);
  return (
    // PDF 인쇄: 자산 행이 페이지 사이에 잘리지 않도록 회피.
    <div className="px-3 py-1.5 flex items-start justify-between text-xs print:break-inside-avoid">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-700 dark:text-slate-300">
          ├─ {row.label}
        </p>
        {row.formula && (
          // 자산별 산식(예: "330,000,000 × 339,492,000 / (...)") 줄바꿈 처리.
          <p className="text-micro text-muted-foreground mt-0.5 ml-3 break-words leading-relaxed">
            <FormulaText value={row.formula} />
          </p>
        )}
      </div>
      <p className="font-mono shrink-0 text-slate-700 dark:text-slate-300 tabular-nums">
        {valueDisplay}
      </p>
    </div>
  );
}
