/**
 * 계산 결과 선택 출력 — 세목 무관 공통 타입·헬퍼 (단일 출처)
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §1.1
 * 각 세목 레지스트리(`{tax}-print-sections.ts`)는 여기서 타입·헬퍼를 import한다.
 *
 * 화면 표시 불변 원칙: 선택은 "인쇄 대상"만 제어한다. 미선택이어도 화면엔 그대로 보이고
 * 인쇄(print)에서만 print:hidden으로 제거 → 기존 화면 동작 회귀 0.
 */

export type PrintChannel = "screen" | "pdf";

export interface PrintSectionNode<Id extends string = string> {
  id: Id;
  label: string;
  /** ["screen"] 기본, 서버 PDF 대상은 ["screen","pdf"] */
  channel: PrintChannel[];
}

export interface PrintSectionGroup<Id extends string = string> {
  id: `group:${string}`;
  label: string;
  children: PrintSectionNode<Id>[];
}

export type GroupCheckState = "all" | "partial" | "none";

/** 모든 leaf id (선언 순서) */
export function flattenPrintSectionIds<Id extends string>(
  groups: PrintSectionGroup<Id>[]
): Id[] {
  return groups.flatMap((g) => g.children.map((c) => c.id));
}

/** channel에 "pdf" 포함 leaf만 */
export function pdfEligibleIds<Id extends string>(
  groups: PrintSectionGroup<Id>[]
): Id[] {
  return groups.flatMap((g) =>
    g.children.filter((c) => c.channel.includes("pdf")).map((c) => c.id)
  );
}

/**
 * 화면 인쇄 가시성 클래스. (groups 무관 — id·selectedIds만)
 * 선택됨 → "" (기존 표시 유지) / 미선택 → "print:hidden" (인쇄에서 제외)
 */
export function resolvePrintVisibilityClass(
  id: string,
  selectedIds: ReadonlySet<string>
): "" | "print:hidden" {
  return selectedIds.has(id) ? "" : "print:hidden";
}

/**
 * 서버 PDF에 포함할 섹션 — pdf 채널 ∩ 선택 ∩ (가용).
 * Panel·route 공용 단일 헬퍼 (이중 정의 금지).
 */
export function selectPdfSections<Id extends string>(
  groups: PrintSectionGroup<Id>[],
  selectedIds: ReadonlySet<string>,
  availableIds?: ReadonlySet<string>
): Id[] {
  return pdfEligibleIds(groups).filter(
    (id) => selectedIds.has(id) && (!availableIds || availableIds.has(id))
  );
}

/** 그룹 체크 상태 (부모 체크박스 indeterminate 판정) */
export function resolveGroupCheckState<Id extends string>(
  group: PrintSectionGroup<Id>,
  selectedIds: ReadonlySet<string>
): GroupCheckState {
  const total = group.children.length;
  const selected = group.children.filter((c) => selectedIds.has(c.id)).length;
  if (selected === 0) return "none";
  if (selected === total) return "all";
  return "partial";
}
