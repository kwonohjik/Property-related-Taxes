import type { ReactNode } from "react";
import { resolvePrintVisibilityClass } from "@/lib/print/print-sections.types";

/**
 * 선택 출력 래퍼 — 결과뷰의 선택 가능 섹션을 감싼다. (세목 무관 — id:string)
 *
 * 선택됨 → 클래스 없음(기존 표시·인쇄 동작 유지)
 * 미선택 → print:hidden (화면엔 그대로 보이고 인쇄에서만 제외)
 *
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §1.2
 */
export function PrintSection({
  id,
  selectedIds,
  children,
  className,
}: {
  id: string;
  selectedIds: ReadonlySet<string>;
  children: ReactNode;
  className?: string;
}) {
  const visibility = resolvePrintVisibilityClass(id, selectedIds);
  const cls = [className, visibility].filter(Boolean).join(" ");
  return (
    <div data-print-id={id} className={cls || undefined}>
      {children}
    </div>
  );
}
