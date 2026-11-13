/**
 * 종부세 결과 화면 공통 행·헤더 — ComprehensiveTaxResultView에서 분리(800줄 정책, 내용 불변).
 */
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
// ============================================================
// 포맷 헬퍼
// ============================================================

export function formatRate(rate: number, digits = 2): string {
  return (rate * 100).toFixed(digits).replace(/\.?0+$/, "") + "%";
}

// ============================================================
// 공통 행 컴포넌트
// ============================================================

/** 금액 대신 라벨 문자열을 표시하는 행 (기본공제 "적용 없음" 등) */
export function TaxLabelRow({
  label,
  valueLabel,
  sub = false,
  badge,
  legalBasis,
}: {
  label: string;
  valueLabel: string;
  sub?: boolean;
  badge?: string;
  /** 있으면 badge 옆에 LawArticleModal(조문 클릭 팝업) 렌더. badge 텍스트는 그대로 보존. */
  legalBasis?: string;
}) {
  return (
    <div
      className={`flex items-start justify-between py-2 gap-2 ${
        sub ? "pl-4 text-sm text-muted-foreground" : "text-sm"
      }`}
    >
      <span className="flex items-center gap-1.5 flex-wrap">
        {label}
        {badge && (
          <span className="inline-flex items-center gap-1">
            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              {badge}
            </span>
            {legalBasis && <LawArticleModal legalBasis={legalBasis} label={badge} />}
          </span>
        )}
      </span>
      <span className="shrink-0 text-muted-foreground italic">{valueLabel}</span>
    </div>
  );
}

export function TaxRow({
  label,
  amount,
  highlight = false,
  sub = false,
  note,
  badge,
  legalBasis,
}: {
  label: string;
  amount: number;
  highlight?: boolean;
  sub?: boolean;
  note?: string;
  badge?: string;
  /** 있으면 badge 옆에 LawArticleModal(조문 클릭 팝업) 렌더. badge 텍스트는 그대로 보존. */
  legalBasis?: string;
}) {
  return (
    <div
      className={`flex items-start justify-between py-2 gap-2 ${
        highlight
          ? "border-t-2 border-foreground font-bold text-base"
          : sub
          ? "pl-4 text-sm text-muted-foreground"
          : "text-sm"
      }`}
    >
      <span className="flex items-center gap-1.5 flex-wrap">
        {label}
        {note && (
          <span className="text-xs text-muted-foreground">({note})</span>
        )}
        {badge && (
          <span className="inline-flex items-center gap-1">
            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              {badge}
            </span>
            {legalBasis && <LawArticleModal legalBasis={legalBasis} label={badge} />}
          </span>
        )}
      </span>
      <span className={`shrink-0 tabular-nums ${highlight ? "text-primary" : ""}`}>
        {formatKRW(amount)}
      </span>
    </div>
  );
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
      {children}
    </h3>
  );
}
