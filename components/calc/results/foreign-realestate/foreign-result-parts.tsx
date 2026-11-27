/**
 * 국외자산 부동산 결과 카드 공용 조각 — 금액 행·환산 행·표기 헬퍼.
 *
 * 표기 규약(`components/calc/CLAUDE.md`): 한국어 풀어쓰기 · 숫자 옆 변수명 라벨 · 변수 약어·floor() 금지 · 중간 산술 결과 미표시 · 숫자 끝 「원」 금지.
 * 금액 칸은 `font-mono tabular-nums whitespace-nowrap text-right`(콤마 세로 정렬 — skill `amount-column-align`).
 */
import type { ReactNode } from "react";
import { FormulaText } from "@/components/calc/results/shared/FormulaParts";
import type { ForeignRealEstateConvertedItem } from "@/lib/tax-engine/foreign-realestate";

export const fmt = (n: number): string => n.toLocaleString("ko-KR");

/** 외화 금액 — 센트·소수 4자리까지 */
export const fmtForeign = (n: number): string => n.toLocaleString("ko-KR", { maximumFractionDigits: 4 });

/** 세율(소수) → 「40%」 — 부동소수 잔여를 지운다 */
export const pctText = (rate: number): string => `${Number((rate * 100).toFixed(4))}%`;

export function AmountRow({
  label,
  formula,
  amount,
  strong,
  indent,
  testId,
  tone = "default",
}: {
  label: ReactNode;
  /** 산식 보조 줄 — 각 숫자 옆에 변수명 라벨을 붙인 문자열 */
  formula?: ReactNode;
  amount: number;
  strong?: boolean;
  indent?: boolean;
  testId?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 border-b border-border/40 py-1.5 last:border-b-0 ${indent ? "pl-4" : ""}`}
      data-testid={testId}
    >
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${strong ? "font-semibold" : ""} ${tone === "warn" ? "text-amber-700 dark:text-amber-300" : ""}`}>{label}</p>
        {formula && (
          <p className="text-caption leading-relaxed text-muted-foreground break-words">
            <FormulaText value={formula} />
          </p>
        )}
      </div>
      <span
        className={`shrink-0 text-right font-mono text-sm tabular-nums whitespace-nowrap ${strong ? "font-semibold" : ""} ${tone === "warn" ? "text-amber-700 dark:text-amber-300" : ""}`}
        data-amount
      >
        {fmt(amount)}
      </span>
    </div>
  );
}

/** 텍스트만 있는 행(금액 없음) — 예: 장기보유특별공제 «적용 배제» */
export function NoteRow({ label, children, testId }: { label: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <div className="border-b border-border/40 py-1.5 last:border-b-0" data-testid={testId}>
      <p className="text-sm">{label}</p>
      <p className="text-caption leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * 환산 1단계 «외화 × 기준환율(일자) = 원» — 영 §178의5① 수령·지출일 현재 기준환율.
 * 산식은 보조 줄, 원화는 금액 칸.
 */
export function FxRow({ label, item, indent, testId }: { label: ReactNode; item: ForeignRealEstateConvertedItem; indent?: boolean; testId?: string }) {
  return (
    <AmountRow
      label={label}
      formula={`${item.currency} ${fmtForeign(item.amountForeign)} × 기준환율(${item.date}) ${fmtForeign(item.exchangeRate)} =`}
      amount={item.amountKrw}
      indent={indent}
      testId={testId}
    />
  );
}

/** 결과 카드 섹션 틀 */
export function SectionBox({ title, children, testId }: { title: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4" data-testid={testId}>
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}
