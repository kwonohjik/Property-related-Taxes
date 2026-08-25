"use client";

/**
 * 장기임대주택 양도소득세 감면 결과 상세 카드 (조특법 §97·§97의3·§97의4·§97의5)
 *
 * ⑦ 결과 카드 산식 — 한국어 풀어쓰기, 변수 약어·floor()·"원" 끝 금지.
 * 주의: result.rentalHousingExceptionDetail(임대주택 비과세 특례 §155⑳)과 별개 필드.
 */

import type { RentalReductionResult } from "@/lib/tax-engine/rental-housing-reduction";

interface Props {
  detail: RentalReductionResult;
  /**
   * 산출세액 — 「감면세액 = 산출세액 × 감면율」 산식의 기준값.
   * ⚠️ `detail`에서 읽지 않고 명시 prop (§77 계열·§97 시리즈 카드와 동일 규약).
   */
  calculatedTax: number;
}

function formatN(n: number): string {
  return n.toLocaleString();
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

const HOUSING_TYPE_LABELS: Record<string, string> = {
  public_construction: "공공건설임대 (§97)",
  long_term_private: "장기일반민간임대 (§97의3)",
  public_support_private: "공공지원민간임대 (§97의4)",
  public_purchase: "공공매입임대 (§97의5)",
};

const LAW_VERSION_LABELS: Record<string, string> = {
  pre_2018_09_14: "구법 (2018.9.14 이전 등록)",
  post_2018_09_14: "1차 개정 (2018.9.14 ~ 2020.7.10)",
  post_2020_07_11: "2차 개정 (2020.7.11 ~ 2020.8.17)",
  post_2020_08_18: "3차 개정 (2020.8.18 이후)",
};

export function RentalReductionDetailCard({ detail, calculatedTax }: Props) {
  const {
    isEligible,
    ineligibleReasons,
    reductionType,
    applicableLawVersion,
    mandatoryPeriodYears,
    effectiveRentalYears,
    reductionRate,
    reductionAmount,
    specialLongTermDeductionRate,
    annualLimit,
    isLimitApplied,
    rentIncreaseValidation,
    warnings,
  } = detail;

  if (!isEligible) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50/80 dark:border-amber-700/50 dark:bg-amber-950/30 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            장기임대주택 양도소득세 감면 — 감면 불가
          </p>
          <span className="text-micro text-amber-800 dark:text-amber-400">
            {HOUSING_TYPE_LABELS[reductionType] ?? reductionType}
          </span>
        </div>
        {ineligibleReasons.length > 0 && (
          <div className="rounded border border-amber-200 bg-white/70 dark:border-amber-800/40 dark:bg-amber-950/40 p-2.5 space-y-1">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">감면 불가 사유</p>
            <ul className="text-xs text-amber-900 dark:text-amber-200 space-y-0.5 pl-4 list-disc">
              {ineligibleReasons.map((r, i) => (
                <li key={i}>{r.message}</li>
              ))}
            </ul>
          </div>
        )}
        {!rentIncreaseValidation.isAllValid && (
          <div className="rounded border border-rose-200 bg-rose-50/70 dark:border-rose-800/40 dark:bg-rose-950/30 p-2.5 space-y-1">
            <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">임대료 증가율 위반</p>
            <ul className="text-xs text-rose-900 dark:text-rose-200 pl-3 list-disc space-y-0.5">
              {rentIncreaseValidation.violations.map((v, i) => (
                <li key={i}>
                  {v.contractDate instanceof Date
                    ? v.contractDate.toLocaleDateString("ko-KR")
                    : String(v.contractDate)}{" "}
                  계약: 증가율 {(v.increaseRate * 100).toFixed(2)}% (상한 {(v.maxAllowed * 100).toFixed(2)}% 초과)
                </li>
              ))}
            </ul>
          </div>
        )}
        {warnings.length > 0 && (
          <ul className="text-xs text-amber-800 dark:text-amber-300 pl-3 list-disc space-y-0.5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20 p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          장기임대주택 양도소득세 감면
        </p>
        <span className="text-xs rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 font-medium">
          {HOUSING_TYPE_LABELS[reductionType] ?? reductionType}
        </span>
        {isLimitApplied && (
          <span className="text-micro rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-0.5">
            연간 한도 적용
          </span>
        )}
      </div>

      {/* 핵심 수치 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-emerald-200 bg-emerald-50/80 dark:border-emerald-800/30 dark:bg-emerald-950/30 p-2.5 text-center">
          <p className="text-micro text-emerald-700 dark:text-emerald-400 font-medium">감면세액</p>
          <p className="text-sm font-mono font-semibold text-emerald-900 dark:text-emerald-200 mt-0.5">
            {formatN(reductionAmount)}
          </p>
        </div>
        <div className="rounded border border-sky-200 bg-sky-50/60 dark:border-sky-800/30 dark:bg-sky-950/20 p-2.5 text-center">
          <p className="text-micro text-sky-700 dark:text-sky-400 font-medium">적용 감면율</p>
          <p className="text-sm font-mono font-semibold text-sky-900 dark:text-sky-200 mt-0.5">
            {formatRate(reductionRate)}
          </p>
        </div>
      </div>

      {/* 임대 기간 및 법령 정보 */}
      <div className="rounded bg-white/70 dark:bg-white/5 border border-emerald-100 dark:border-emerald-800/30 p-2.5 text-xs space-y-1.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">적용 법령 버전</span>
          <span className="font-medium">{LAW_VERSION_LABELS[applicableLawVersion] ?? applicableLawVersion}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">의무임대기간</span>
          <span className="font-mono">{mandatoryPeriodYears}년</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">실제 임대기간</span>
          <span className="font-mono">{effectiveRentalYears}년</span>
        </div>
        {specialLongTermDeductionRate > 0 && (
          <div className="flex justify-between border-t border-emerald-100 dark:border-emerald-800/30 pt-1.5 mt-0.5">
            <span className="text-muted-foreground">장기보유특별공제 특례율</span>
            <span className="font-mono font-semibold text-emerald-900 dark:text-emerald-200">
              {formatRate(specialLongTermDeductionRate)}
            </span>
          </div>
        )}
      </div>

      {/* 산출근거 — 라벨 산식 + 값 대입 (§77의2 카드와 동일 규약) */}
      <div className="rounded bg-white/70 dark:bg-white/5 border border-emerald-100 dark:border-emerald-800/30 p-2.5 text-xs space-y-1.5">
        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">감면세액 산출근거</p>
        <p className="text-muted-foreground">감면세액 = 산출세액 × 감면율</p>
        <p className="font-mono font-semibold text-emerald-900 dark:text-emerald-200">
          {formatN(calculatedTax)} × {formatRate(reductionRate)} = {formatN(reductionAmount)}
        </p>
      </div>

      {/* 연간 한도 */}
      {isLimitApplied && (
        <div className="rounded border border-amber-200 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/20 p-2.5 text-xs space-y-1">
          <p className="text-amber-800 dark:text-amber-300 font-semibold">연간 감면 한도 적용</p>
          <p className="text-muted-foreground">
            연간 감면 한도:{" "}
            <span className="font-mono text-foreground">{formatN(annualLimit)}</span>
            {" "}— 감면세액이 한도를 초과하여 한도액으로 제한됨 (조세특례제한법 §133)
          </p>
        </div>
      )}

      {/* 임대료 증가율 검증 */}
      {!rentIncreaseValidation.isAllValid && (
        <div className="rounded border border-rose-200 bg-rose-50/60 dark:border-rose-800/30 dark:bg-rose-950/20 p-2.5 space-y-1">
          <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">임대료 증가율 위반 이력</p>
          <ul className="text-xs text-rose-900 dark:text-rose-200 pl-3 list-disc space-y-0.5">
            {rentIncreaseValidation.violations.map((v, i) => (
              <li key={i}>
                {v.contractDate instanceof Date
                  ? v.contractDate.toLocaleDateString("ko-KR")
                  : String(v.contractDate)}{" "}
                계약: 증가율 {(v.increaseRate * 100).toFixed(2)}% (상한 {(v.maxAllowed * 100).toFixed(2)}% 초과)
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 경고 */}
      {warnings.length > 0 && (
        <ul className="text-xs text-amber-800 dark:text-amber-300 pl-3 list-disc space-y-0.5">
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}
