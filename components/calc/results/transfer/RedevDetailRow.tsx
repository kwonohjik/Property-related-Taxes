/** 재개발 결과 카드 공용 행·서식 — `RedevelopmentDetailCard`·`RedevRightReceiveBlocks`가 함께 쓴다. */
export const fmt = (n: number) => n.toLocaleString("ko-KR");
export const fmtPct = (r: number) => `${(r * 100).toFixed(1)}%`;

export function Row({ label, value, highlight }: { label: React.ReactNode; value: number | string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-caption">
      <span className="text-violet-700 dark:text-violet-300">{label}</span>
      <span
        className={`font-mono tabular-nums whitespace-nowrap ${highlight ? "font-semibold text-violet-900 dark:text-violet-200" : "text-violet-800 dark:text-violet-200"}`}
      >
        {typeof value === "number" ? fmt(value) : value}
      </span>
    </div>
  );
}
