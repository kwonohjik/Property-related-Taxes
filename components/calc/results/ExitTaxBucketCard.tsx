"use client";

/**
 * 국외전출세 2027.1.1. 이후 출국분 — 결과 카드의 호별(세율 구분) 조각 (⑦)
 *
 * 계획서: `docs/02-design/features/stock-transfer-exit-tax-2027.ui.plan.md` §5.1
 * 화면은 **엔진 echo만 읽는다**(D-5) — 5억 합계·세율·배분 판정·구분별 세액을 다시 계산하지 않는다.
 *   · `bucketDetails[]`        세율 구분별 양도소득금액·기본공제 배분·과세표준·적용 세율·산출세액
 *   · `foreignExclusion`       영 §178의8② 판정(합계·기준·제외 여부)
 *   · `holdingDetails[].scope` 종목별 과세/제외 + 사유(`excludedReason`)
 *   · `holdingDetails[].fx`    외화 환산 echo
 * echo가 없는 옛 이력 `resultData`는 이 조각을 렌더하지 않는다(`ExitTaxResultCard`가 echo 유무로 게이트) — 현행 카드 그대로다.
 *
 * 결과 산식은 한국어 풀어쓰기(변수 약어·floor() 금지), 숫자 끝 「원」 표기 없음, 금액 칸은 고정폭·우측정렬.
 * 중립 표현만 쓴다 — «제외»·«적용»이며 유리/불리·절감 표현을 쓰지 않는다.
 */

import type {
  ExitTaxBucketDetail,
  ExitTaxExcludedReason,
  ExitTaxHoldingResult,
  ExitTaxRateBucket,
  ExitTaxResult,
} from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import { fmt } from "./exit-tax-result-parts";

export const BUCKET_LABEL: Record<ExitTaxRateBucket, string> = {
  clause1: "§118의11 1호 — 국내 상장·비상장 주식",
  clause2a: "§118의11 2호 가목 — 국외주식 중 중소기업",
  clause2b: "§118의11 2호 나목 — 국외주식 그 밖",
};

/** 종목 카드 뱃지용 짧은 호 이름 */
export const BUCKET_SHORT: Record<ExitTaxRateBucket, string> = {
  clause1: "1호",
  clause2a: "2호 가목",
  clause2b: "2호 나목",
};

export const EXCLUDED_REASON_LABEL: Record<ExitTaxExcludedReason, string> = {
  foreign_total_le_500m: "국외주식등 양도가액 합계가 5억 이하 (시행령 §178의8②1호)",
  foreign_worker_owned: "외국인근로자 소유 (시행령 §178의8②2호)",
  foreign_worker_family_pre_work:
    "외국인근로자의 배우자·20세 이하 직계비속이 근로 개시일 전에 취득 (시행령 §178의8②3호)",
  pre2027_foreign_not_covered:
    "2026.12.31. 이전 출국분은 국외주식등이 과세 대상이 아님 (소득세법 부칙 제8조 — 기준은 출국일)",
};

/** 결과 `bucketDetails`로 호별 카드를 보여야 하는가 — 2호가 있거나 구분이 둘 이상일 때(국내 1호 단독은 현행 문구 그대로) */
export function shouldShowBucketBreakdown(result: ExitTaxResult): boolean {
  if (result.exitTaxRegime !== "from2027") return false;
  const d = result.bucketDetails;
  if (!d || d.length === 0) return false;
  return d.length >= 2 || d.some((x) => x.bucket !== "clause1");
}

/** 구분이 둘 이상인가 */
export function isMultiBucketResult(result: ExitTaxResult): boolean {
  return (result.bucketDetails?.length ?? 0) >= 2;
}

/** 0.2 → "20%", 0.1 → "10%" — 부동소수 잔여(10.000000000000002)가 보이지 않게 소수 2자리에서 정리한다(표시 전용) */
function pct(rate: number): string {
  return `${Math.round(rate * 10000) / 100}%`;
}

/**
 * 「USD 1,000 × 1,400」 — 외화 1주당 금액 × 기준환율(환산 근거 표시). 곱셈 결과는 엔진 echo(총액, 종목당 1회 절사)가 정본이라
 * 여기서는 만들지 않는다. 환율은 소수 4자리까지 보인다.
 */
export function fxPerShareText(foreign: number, currency: string | undefined, rate: number): string {
  const cur = currency && currency !== "OTHER" ? `${currency} ` : "";
  const f = { maximumFractionDigits: 4 } as const;
  return `${cur}${foreign.toLocaleString("ko-KR", f)} × ${rate.toLocaleString("ko-KR", f)}`;
}

/** 금액 한 줄 — 라벨 좌 · 값 우(고정폭 · tabular-nums · 줄바꿈 없음) */
export function AmountLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: string | number;
  strong?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-start justify-between gap-3 py-1 text-xs",
        strong ? "font-semibold text-sky-800 dark:text-sky-200" : "text-slate-700 dark:text-slate-300",
      ].join(" ")}
    >
      <span className="leading-relaxed">{label}</span>
      <span className="font-mono tabular-nums text-right whitespace-nowrap">
        {typeof value === "number" ? fmt(value) : value}
      </span>
    </div>
  );
}

function BucketBlock({ d, multi }: { d: ExitTaxBucketDetail; multi: boolean }) {
  const isClause1 = d.bucket === "clause1";
  return (
    <div
      className="rounded-md border border-sky-200 bg-sky-50/40 px-3 py-2 dark:border-sky-800/60 dark:bg-sky-950/30"
      data-testid={`exit-bucket-${d.bucket}`}
    >
      <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">{BUCKET_LABEL[d.bucket]}</p>
      <AmountLine label="양도소득금액 (이 구분 안 종목 양도차익 합산)" value={d.transferGain} />
      <AmountLine
        label={multi ? "기본공제 배분 (입력값 — §118의10④)" : "기본공제 (§118의10④)"}
        value={d.basicDeductionAllocated}
      />
      <AmountLine label="과세표준 = 양도소득금액 − 기본공제 배분" value={d.taxBase} />
      <AmountLine
        label="적용 세율"
        value={
          isClause1
            ? d.progressiveDeduction > 0
              ? `${pct(d.appliedRate)} · 누진공제 ${fmt(d.progressiveDeduction)}`
              : pct(d.appliedRate)
            : pct(d.appliedRate)
        }
      />
      <AmountLine
        label={isClause1 ? "산출세액 = 과세표준 × 세율 − 누진공제" : "산출세액 = 과세표준 × 세율"}
        value={d.calculatedTax}
        strong
      />
    </div>
  );
}

/** 호별(세율 구분별) 계산 — 메인 산식 카드의 «세율 안내 문단» 자리에 들어간다 */
export function ExitTaxBucketBreakdown({ result }: { result: ExitTaxResult }) {
  const details = result.bucketDetails ?? [];
  const multi = details.length >= 2;
  return (
    <div className="space-y-2 pt-1" data-testid="exit-bucket-breakdown">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
        세율 구분별 계산 (§118의11 — 2027.1.1. 이후 출국분)
      </p>
      {details.map((d) => (
        <BucketBlock key={d.bucket} d={d} multi={multi} />
      ))}
      {result.basicDeductionBasis === "user_allocation" && (
        <p
          className="text-xs leading-relaxed text-amber-700 dark:text-amber-300"
          data-testid="exit-alloc-basis"
        >
          법령에 구분별 배분 규정이 없습니다 — 기본공제 250만원은 입력한 배분값 기준으로 계산했으며, 배분에 따라 산출세액이 달라집니다 (확인 필요).
        </p>
      )}
    </div>
  );
}

/** 영 §178의8② 판정 — 국외 종목이 있을 때만(`foreignExclusion` echo) */
export function ExitTaxExclusionNotice({ result }: { result: ExitTaxResult }) {
  const fe = result.foreignExclusion;
  if (!fe) return null;
  const excluded = result.holdingDetails.filter((h) => h.scope === "excluded");
  const hasWorkerReason = excluded.some(
    (h) => h.excludedReason === "foreign_worker_owned" || h.excludedReason === "foreign_worker_family_pre_work",
  );
  return (
    <div
      className="rounded-md border border-violet-200 bg-violet-50/50 p-3 space-y-1 dark:border-violet-800/60 dark:bg-violet-950/30"
      data-testid="exit-exclusion-notice"
    >
      <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
        국외주식등 제외 판정 (시행령 §178의8②)
      </p>
      <AmountLine label="출국 당시 소유한 국외주식등의 간주양도가액 합계" value={fe.foreignDepartureValueTotal} />
      <AmountLine label="제외 기준 금액 (이 금액 이하이면 제외 — 시행령 §178의8②1호)" value={fe.threshold} />
      <AmountLine label="제외 여부" value={fe.applied ? "제외됨" : "제외 없음 (과세 대상)"} strong />
      {excluded.map((h) => (
        <p key={h.id} className="text-xs leading-relaxed text-violet-700 dark:text-violet-300">
          • {h.stockName} — {h.excludedReason ? EXCLUDED_REASON_LABEL[h.excludedReason] : "제외"}
        </p>
      ))}
      {hasWorkerReason && (
        <p className="text-xs leading-relaxed text-violet-700 dark:text-violet-300">
          외국인근로자 제외는 입력한 선언 기준으로 판정했습니다 — 근로 기간 100분의 80·6개월·20세 이하 판정은 확인 필요
        </p>
      )}
    </div>
  );
}

/** 뱃지를 보일 종목인가 — 제외 종목, 또는 2027 결과의 과세 종목(호 echo 있음) */
export function hasHoldingBadge(h: ExitTaxHoldingResult, from2027: boolean): boolean {
  return h.scope === "excluded" || (from2027 && h.rateBucket !== undefined);
}

/** 종목 카드의 호·제외 뱃지 — 2027 결과(`scope`가 있는 결과)에서만 */
export function HoldingBucketBadge({ h, from2027 }: { h: ExitTaxHoldingResult; from2027: boolean }) {
  if (h.scope === "excluded") {
    return (
      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-micro font-medium text-violet-800">
        제외 — {h.excludedReason ? EXCLUDED_REASON_LABEL[h.excludedReason] : "사유 미상"}
      </span>
    );
  }
  if (from2027 && h.rateBucket) {
    return (
      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-micro font-medium text-sky-800">
        §118의11 {BUCKET_SHORT[h.rateBucket]}
      </span>
    );
  }
  return null;
}
