"use client";

/**
 * 가업상속공제 §97의2④ 의제·일반 비교 결과 카드
 *
 * Plan v3 §4-2 레이아웃: 4행 비교 표
 *   ① 일반 §97 결정세액 (피상속인 원취득가액 기준)
 *   ② 의제 §97의2④ 결정세액 (의제 취득가액 기준)
 *   ③ §18의2⑩ 상속세 상당액 공제액 = max(0, 의제세액 − 일반세액)
 *   ④ 적용 분기 (의제 세액이 더 낮으면 의제 적용, 높으면 의제 + §18의2⑩ 공제)
 *
 * 음수 가드: creditAmount=0 시 (의제 산식이 일반보다 유리) sky 안내 배지
 * rose 안내: §97의2④ 본문 강제 적용 (납세자 불리해도 의제 적용)
 *
 * 정책 준수:
 *   - 한국어 풀어쓰기 (변수 약어 금지)
 *   - 숫자 끝 "원" 표기 금지 (feedback_no_won_suffix)
 *   - print:block 자동 펼침
 */

import Link from "next/link";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { FamilyBusinessCgtDetail } from "@/lib/tax-engine/transfer-tax-family-business";

interface Props {
  detail: FamilyBusinessCgtDetail;
}

// ── 행 컴포넌트 ─────────────────────────────────────────────────

function Row({
  label,
  value,
  sub = false,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-muted/30" : ""}>
      <td className={`py-1.5 pl-3 pr-2 text-muted-foreground ${sub ? "pl-6 text-xs" : "text-sm"}`}>
        {label}
      </td>
      <td className={`py-1.5 pr-3 text-right font-mono ${highlight ? "font-semibold" : ""} ${sub ? "text-xs" : "text-sm"}`}>
        {value}
      </td>
    </tr>
  );
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────

export function FamilyBusinessImputedComparisonCard({ detail }: Props) {
  const {
    imputedAcquisitionPrice,
    cgtUnderSection97_2_4,
    cgtUnderSection97,
    creditAmount,
    appliedRate,
    decedentAcquisitionPrice,
    inheritanceMarketValue,
  } = detail;

  // 의제 산식이 일반보다 유리한 경우 (차액 공제 불필요)
  const imputedIsFavorable = creditAmount === 0 && cgtUnderSection97_2_4 <= cgtUnderSection97;

  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-3 print:block">

      {/* 헤더 */}
      <div>
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          가업상속공제 자산 양도세 특례 (소득세법 §97의2④)
        </p>
        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
          의제 취득가액 = 피상속인 원취득가액 × {(appliedRate * 100).toFixed(2)}% + 상속개시일 평가액 × {((1 - appliedRate) * 100).toFixed(2)}%
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <LawArticleModal legalBasis="소득세법 §97의2④" label="§97의2④ 가업상속 의제" />
          <LawArticleModal legalBasis="상속세및증여세법 §18의2⑩" label="§18의2⑩ 상속세 상당액 공제" />
        </div>
      </div>

      {/* 산식 표 */}
      <div className="rounded-md border border-border overflow-hidden bg-background">
        <table className="w-full text-sm border-collapse [&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-0">
          <tbody>

            {/* 의제 취득가액 산출 */}
            <Row
              label="피상속인 원취득가액"
              value={formatKRW(decedentAcquisitionPrice)}
              sub
            />
            <Row
              label="상속개시일 자산 평가액"
              value={formatKRW(inheritanceMarketValue)}
              sub
            />
            <Row
              label={`의제 취득가액 (원취득가 × ${(appliedRate * 100).toFixed(2)}% + 평가액 × ${((1 - appliedRate) * 100).toFixed(2)}%)`}
              value={formatKRW(imputedAcquisitionPrice)}
              highlight
            />

            {/* 구분선 역할 빈 행 */}
            <tr className="bg-muted/20">
              <td colSpan={2} className="py-1 pl-3 text-[11px] font-semibold text-muted-foreground">
                비교과세 (소법 §97의2④ 본문)
              </td>
            </tr>

            {/* 일반 §97 결정세액 */}
            <Row
              label="일반 §97 결정세액 (피상속인 원취득가액 기준)"
              value={formatKRW(cgtUnderSection97)}
            />

            {/* 의제 §97의2④ 결정세액 */}
            <Row
              label="의제 §97의2④ 결정세액 (의제 취득가액 기준)"
              value={formatKRW(cgtUnderSection97_2_4)}
            />

            {/* §18의2⑩ 공제액 */}
            <Row
              label="§18의2⑩ 공제액 = max(0, 의제 결정세액 − 일반 결정세액)"
              value={creditAmount > 0 ? `- ${formatKRW(creditAmount)}` : formatKRW(0)}
              highlight
            />

          </tbody>
        </table>
      </div>

      {/* 적용 분기 안내 */}
      {imputedIsFavorable ? (
        /* 의제 산식이 유리한 경우 → sky 안내 */
        <div className="rounded-md border border-sky-300 bg-sky-50/60 px-3 py-2 text-xs text-sky-800">
          <p className="font-semibold">의제 §97의2④ 산식 적용 (납세자에게 유리)</p>
          <p className="mt-0.5">
            의제 취득가액({formatKRW(imputedAcquisitionPrice)})이 피상속인 원취득가액({formatKRW(decedentAcquisitionPrice)})보다{" "}
            {cgtUnderSection97_2_4 < cgtUnderSection97 ? "낮아 세액이 감소합니다." : "와 동일한 세액입니다."}
            {" "}§18의2⑩ 추가 공제 없음.
          </p>
        </div>
      ) : (
        /* 의제 산식이 불리한 경우 → rose 강제 적용 안내 */
        <div className="rounded-md border border-rose-300 bg-rose-50/60 px-3 py-2 text-xs text-rose-800 space-y-1">
          <p className="font-semibold">소법 §97의2④ 본문 — 강제 적용 (납세자 불리 케이스)</p>
          <p>
            의제 결정세액({formatKRW(cgtUnderSection97_2_4)})이 일반 결정세액({formatKRW(cgtUnderSection97)})보다 높습니다.
          </p>
          <p>
            소법 §97의2④ 본문에 따라 의제 산식을 강제 적용하되,
            차액({formatKRW(creditAmount)})을 §18의2⑩ 상속세 상당액 공제로 차감합니다.
          </p>
        </div>
      )}

      {/* 사후관리 추징 연동 (§18의2⑩) — creditAmount를 시뮬레이터에 prefill (PR-5) */}
      {creditAmount > 0 && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800 space-y-1">
          <p className="font-semibold">가업상속 사후관리 추징과 연동 (§18의2⑩)</p>
          <p>
            이 양도세 상당액 {formatKRW(creditAmount)}은 가업상속공제 사후관리 추징세액에서
            양도세 환원 공제로 차감됩니다.
          </p>
          <Link
            href={`/calc/family-business-postmgmt?cgt=${creditAmount}`}
            className="inline-block font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
          >
            가업상속 사후관리 시뮬레이터에서 추징세액 계산 →
          </Link>
        </div>
      )}

    </div>
  );
}
