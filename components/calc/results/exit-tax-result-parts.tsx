/**
 * 국외전출세 결과 카드 공용 조각 (⑦) — `ExitTaxResultCard`와 2027 호별 카드(`ExitTaxBucketCard`)가 함께 쓴다.
 * 원래 `ExitTaxResultCard.tsx` 안의 로컬 정의였고 마크업은 그대로다(추출만).
 */

export function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

// ── 항목 행 ──
export function Row({
  label,
  value,
  sub,
  highlight,
  indent,
  warn,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
  indent?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-start justify-between py-1.5",
        indent ? "pl-4" : "",
        highlight ? "font-semibold text-sky-800 dark:text-sky-200" : warn ? "text-rose-700 dark:text-rose-300" : "text-slate-700 dark:text-slate-300",
      ].join(" ")}
    >
      <span className="text-sm leading-relaxed">{label}</span>
      <div className="text-right ml-4 min-w-0">
        <span className="text-sm tabular-nums">
          {typeof value === "number" ? fmt(value) : value}
        </span>
        {sub && <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function Divider() {
  return <div className="border-t border-slate-200 my-1" />;
}

