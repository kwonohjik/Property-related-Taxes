"use client";

import { useEffect, useMemo, useRef } from "react";
import { Printer, FileDown } from "lucide-react";
import {
  selectPdfSections,
  type PrintSectionGroup,
} from "@/lib/print/print-sections.types";

/**
 * 계산 결과 선택 출력 — 출력 항목 선택 패널 (세목 무관, PR-A 제네릭화)
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §1.3
 * - `allGroups` props로 세목별 레지스트리 주입 (상속세 하드코딩 제거)
 * - 계층형 체크박스 트리(그룹=부모 indeterminate, leaf=자식)
 * - 기본 전체 미선택, "전체 선택"/"전체 해제" 단축, 선택 0건이면 인쇄 버튼 disabled
 * - 가용 노드(availableIds)만 표시 — 데이터 없는 서식 선택 방지
 * - 패널 자체 print:hidden
 */

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  id,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  id?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel}
      className="h-4 w-4 shrink-0 rounded border-border accent-sky-600 cursor-pointer"
    />
  );
}

export function PrintSelectionPanel({
  allGroups,
  selectedIds,
  availableIds,
  onChange,
  onPrintPdf,
  pdfReady = false,
  pdfBusy = false,
}: {
  /** 세목별 출력 항목 레지스트리 (예: INHERITANCE_PRINT_SECTIONS) */
  allGroups: PrintSectionGroup[];
  selectedIds: Set<string>;
  /** 현재 결과뷰에 실제 렌더되는 leaf id (가용성) */
  availableIds: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** 선택 항목 서버 PDF 다운로드 (PR-2). 미지정 시 PDF 버튼 숨김 */
  onPrintPdf?: (pdfSections: string[]) => void;
  /** 로그인+저장 완료 — PDF 다운로드 가능 여부 */
  pdfReady?: boolean;
  pdfBusy?: boolean;
}) {
  // 그룹 해제 — 가용 leaf만 평면 나열 (그룹 헤더·라벨 제거)
  const leaves = useMemo(
    () => allGroups.flatMap((g) => g.children.filter((c) => availableIds.has(c.id))),
    [allGroups, availableIds]
  );

  const allAvailable = useMemo(() => leaves.map((c) => c.id), [leaves]);
  const selectedCount = allAvailable.filter((id) => selectedIds.has(id)).length;

  // 서버 PDF에 실제 포함될 항목 (선택 ∩ pdf 채널 ∩ 가용) — shared 단일 헬퍼 (groups 명시)
  const pdfSelected = useMemo(
    () => selectPdfSections(allGroups, selectedIds, availableIds),
    [allGroups, selectedIds, availableIds]
  );

  const toggleLeaf = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(allAvailable));
  const clearAll = () => onChange(new Set());

  return (
    <div
      data-testid="print-selection-panel"
      className="rounded-xl border border-sky-200 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/20 p-4 print:hidden"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">
            ✓
          </span>
          <h3 className="text-sm font-semibold text-sky-900 dark:text-sky-100">
            출력 항목 선택
          </h3>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={selectAll}
            className="rounded-md border border-sky-300 dark:border-sky-700 px-2.5 py-1 text-xs font-medium hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
          >
            전체 선택
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md border border-sky-300 dark:border-sky-700 px-2.5 py-1 text-xs font-medium hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
          >
            전체 해제
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-white/60 dark:bg-black/20 p-3 space-y-1">
        {leaves.map((leaf) => (
          <label
            key={leaf.id}
            className="flex items-center gap-2 cursor-pointer text-sm text-foreground/90"
          >
            <IndeterminateCheckbox
              checked={selectedIds.has(leaf.id)}
              onChange={() => toggleLeaf(leaf.id)}
              aria-label={leaf.label}
            />
            <span>{leaf.label}</span>
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-sky-700 dark:text-sky-300">
          {selectedCount > 0
            ? `${selectedCount}개 항목 선택됨`
            : "출력할 항목을 선택하세요"}
        </span>
        <div className="flex items-center gap-2">
          {onPrintPdf && (
            <button
              type="button"
              onClick={() => onPrintPdf(pdfSelected)}
              disabled={!pdfReady || pdfBusy || pdfSelected.length === 0}
              title={
                !pdfReady
                  ? "로그인 후 또는 화면 인쇄(PDF 저장)로 이용하세요"
                  : pdfSelected.length === 0
                    ? "PDF로 출력할 수 있는 항목을 선택하세요"
                    : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-sky-600 px-3.5 py-2 text-sm font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileDown className="h-4 w-4" />
              {pdfBusy ? "생성 중..." : "선택 항목 PDF"}
            </button>
          )}
          <button
            type="button"
            data-testid="print-selected-button"
            onClick={() => window.print()}
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="h-4 w-4" />
            선택 항목 인쇄
          </button>
        </div>
      </div>
      {onPrintPdf && !pdfReady && (
        <p className="mt-2 text-caption text-sky-600 dark:text-sky-400">
          ※ 서버 PDF는 로그인·저장 후 이용할 수 있습니다. 비로그인 시 “선택 항목 인쇄”의 PDF 저장을 이용하세요.
        </p>
      )}
    </div>
  );
}
