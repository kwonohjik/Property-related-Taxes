"use client";

import { cn } from "@/lib/utils";

/**
 * 간단한 페이지 색인 컴포넌트.
 *
 * 현재 페이지 주변 ±2개 + 처음/마지막 + 생략부호(…) 패턴.
 * 예: [1] [..] [4] [5] [6] [7] [8] [..] [120]
 */

interface PaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({ page, pageSize, totalCount, onChange, disabled }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  const pages = buildPageList(page, totalPages);

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 py-2" aria-label="페이지 이동">
      <p className="text-xs text-muted-foreground">
        총 <span className="font-medium">{totalCount.toLocaleString()}</span>건 · {page} / {totalPages} 페이지
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <PageButton
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="이전 페이지"
        >
          ←
        </PageButton>
        {pages.map((p, idx) =>
          p === "ellipsis" ? (
            <span key={`e-${idx}`} className="px-2 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <PageButton
              key={p}
              disabled={disabled}
              active={p === page}
              onClick={() => onChange(p)}
              aria-label={`${p} 페이지`}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </PageButton>
          )
        )}
        <PageButton
          disabled={disabled || page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="다음 페이지"
        >
          →
        </PageButton>
      </div>
    </nav>
  );
}

function PageButton({
  children,
  active,
  disabled,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-w-8 rounded-md border px-2 py-1 text-sm transition-colors",
        "hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40",
        active && "border-primary bg-primary text-primary-foreground hover:bg-primary"
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * 현재 페이지 기준 ±2개 + 처음/마지막 + 생략부호 리스트 생성.
 */
function buildPageList(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: Array<number | "ellipsis"> = [];
  const add = (n: number | "ellipsis") => pages.push(n);
  const start = Math.max(2, current - 2);
  const end = Math.min(total - 1, current + 2);
  add(1);
  if (start > 2) add("ellipsis");
  for (let i = start; i <= end; i++) add(i);
  if (end < total - 1) add("ellipsis");
  add(total);
  return pages;
}
