import type { ReactNode } from "react";
import {
  resolvePrintVisibilityClass,
  type PrintSectionId,
} from "@/lib/print/inheritance-print-sections";

/**
 * 선택 출력 래퍼 — 결과뷰의 선택 가능 섹션을 감싼다.
 *
 * 선택됨 → 클래스 없음(기존 표시·인쇄 동작 유지)
 * 미선택 → print:hidden (화면엔 그대로 보이고 인쇄에서만 제외)
 *
 * 설계: docs/02-design/features/selective-print.design.md §4
 */
export function PrintSection({
  id,
  selectedIds,
  children,
  className,
}: {
  id: PrintSectionId;
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
