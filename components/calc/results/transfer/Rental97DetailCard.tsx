"use client";

/**
 * §97 시리즈 — 장기임대주택 양도세 감면/특례 결과 상세 카드
 *
 * 대상:
 *   - rental97LthdDetail: §97의3 (장기보유특별공제 특례율 70%)
 *   - rental97TaxDetail:  §97·§97의2·§97의5 (산출세액 감면)
 *
 * ⑦ 결과 카드 산식 — 한국어 풀어쓰기, 변수 약어·floor()·"원" 끝 금지.
 */

import type { Rental97Result } from "@/lib/tax-engine/types/transfer.types";

interface Props {
  detail: Rental97Result;
  /** 표시 레이블 구분 ("장기보유특별공제 특례" | "세액감면") */
  effectLabel?: string;
  /**
   * 산출세액 — 세액감면형(§97·§97의2·§97의5) 산식 「산출세액 × 임대기간 분 비율 × 감면율」의 기준값.
   *
   * ⚠️ `detail`에서 읽지 않고 **명시 prop**으로 받는다 — 일괄·다건에서는 자산별 값이 달라
   * 이름이 같으면 의미가 뭉개진다(`ReductionDetailCards`의 §77 계열과 동일 규약).
   */
  calculatedTax: number;
}

function formatN(n: number): string {
  return n.toLocaleString();
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

/** 소수 이하가 있으면 살려서 표기 (일반 공제율 24% · 안분비율 85.3% 등) */
function formatRateFine(rate: number): string {
  const pct = rate * 100;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

const ARTICLE_LABELS: Record<string, string> = {
  rental_97_main: "§97 본문 — 장기임대 50% 감면",
  rental_97_proviso: "§97 단서 — 장기임대 100% 감면",
  rental_97_2: "§97의2 — 국민주택 임대 100% 감면",
  rental_97_3: "§97의3 — 장기보유특별공제 특례 (70%/50%)",
  rental_97_4: "§97의4 — 장기보유특별공제 추가 공제",
  rental_97_5: "§97의5 — 장기일반민간임대 100% 감면",
};

export function Rental97DetailCard({ detail, effectLabel, calculatedTax }: Props) {
  if (!detail.isEligible) {
    return (
      <div className="rounded-lg border border-rose-300 bg-rose-50/80 dark:border-rose-700/50 dark:bg-rose-950/30 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
            {ARTICLE_LABELS[detail.id] ?? detail.id} — 적용 불가
          </p>
        </div>
        {detail.ineligibleReasons.length > 0 && (
          <div className="rounded border border-rose-200 bg-white/70 dark:border-rose-800/40 dark:bg-rose-950/40 p-2.5 space-y-1">
            <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">적용 불가 사유</p>
            <ul className="text-xs text-rose-900 dark:text-rose-200 space-y-0.5 pl-4 list-disc">
              {detail.ineligibleReasons.map((r, i) => (
                <li key={i}>{r.message}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-micro text-rose-700 dark:text-rose-400">
          근거 조문: {detail.legalBasis}
        </p>
      </div>
    );
  }

  // ── isEligible: true ──
  const effect = detail as typeof detail & { isEligible: true };

  // LTHD 특례 (§97의3·§97의4)
  if (effect.effectCategory === "long_term_holding_special" || effect.effectCategory === "long_term_holding_additional") {
    const lthdEffect = effect as typeof effect & {
      overrideRate?: number;
      additionalRate?: number;
      rentalGainRatio: number;
      eligibleRentalYears: number;
      // [echo] transfer-tax-lthd.ts가 공제액 산출 직후 실어 보낸다 (표시 전용)
      baseLthdRate?: number;
      gainApplied?: number;
      rentalGainApplied?: number;
      nonRentalGainApplied?: number;
      deductionApplied?: number;
    };
    // 산식은 echo가 모두 있을 때만 — 구 저장 이력에는 없다(graceful fallback)
    const hasLthdEcho =
      lthdEffect.gainApplied !== undefined &&
      lthdEffect.deductionApplied !== undefined &&
      lthdEffect.baseLthdRate !== undefined;
    const isPartialRental =
      lthdEffect.rentalGainRatio < 1 &&
      lthdEffect.rentalGainApplied !== undefined &&
      lthdEffect.nonRentalGainApplied !== undefined;
    return (
      <div className="rounded-lg border border-violet-200 bg-violet-50/50 dark:border-violet-800/40 dark:bg-violet-950/20 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">
            {effectLabel ?? "장기보유특별공제 특례"}
          </p>
          <span className="text-xs rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 px-2 py-0.5 font-medium">
            {ARTICLE_LABELS[detail.id] ?? detail.id}
          </span>
        </div>

        <div className="rounded bg-white/70 dark:bg-white/5 border border-violet-100 dark:border-violet-800/30 p-2.5 text-xs space-y-1.5">
          {lthdEffect.overrideRate !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">특례 장기보유특별공제율</span>
              <span className="font-mono font-semibold text-violet-900 dark:text-violet-200">
                {formatRate(lthdEffect.overrideRate)}
              </span>
            </div>
          )}
          {lthdEffect.additionalRate !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">추가 공제율</span>
              <span className="font-mono font-semibold text-violet-900 dark:text-violet-200">
                {formatRate(lthdEffect.additionalRate)}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">유효 임대기간</span>
            <span className="font-mono">{lthdEffect.eligibleRentalYears}년</span>
          </div>
          {lthdEffect.rentalGainRatio < 1 && (
            <div className="flex justify-between border-t border-violet-100 dark:border-violet-800/30 pt-1.5 mt-0.5">
              <span className="text-muted-foreground">임대기간 분 양도차익 안분 비율</span>
              <span className="font-mono text-violet-900 dark:text-violet-200">
                {(lthdEffect.rentalGainRatio * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        {/* 산출근거 — 라벨 산식 + 값 대입 (§77의2 카드와 동일 규약) */}
        {hasLthdEcho && (
          <div className="rounded bg-white/70 dark:bg-white/5 border border-violet-100 dark:border-violet-800/30 p-2.5 text-xs space-y-1.5">
            <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">
              장기보유특별공제 산출근거
            </p>
            {lthdEffect.overrideRate !== undefined ? (
              isPartialRental ? (
                <>
                  <p className="text-muted-foreground">
                    장기보유특별공제 = 임대기간 분 양도차익 × 특례 공제율 + 비임대 분 양도차익 × 일반 공제율
                  </p>
                  <p className="text-muted-foreground">
                    임대기간 분 양도차익 = 양도차익{" "}
                    <span className="font-mono text-foreground">{formatN(lthdEffect.gainApplied!)}</span> × 안분비율{" "}
                    <span className="font-mono text-foreground">{formatRateFine(lthdEffect.rentalGainRatio)}</span> ={" "}
                    <span className="font-mono text-foreground">{formatN(lthdEffect.rentalGainApplied!)}</span>
                  </p>
                  <p className="font-mono font-semibold text-violet-900 dark:text-violet-200">
                    {formatN(lthdEffect.rentalGainApplied!)} × {formatRate(lthdEffect.overrideRate)} +{" "}
                    {formatN(lthdEffect.nonRentalGainApplied!)} × {formatRateFine(lthdEffect.baseLthdRate!)} ={" "}
                    {formatN(lthdEffect.deductionApplied!)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">장기보유특별공제 = 양도차익 × 특례 공제율</p>
                  <p className="font-mono font-semibold text-violet-900 dark:text-violet-200">
                    {formatN(lthdEffect.gainApplied!)} × {formatRate(lthdEffect.overrideRate)} ={" "}
                    {formatN(lthdEffect.deductionApplied!)}
                  </p>
                </>
              )
            ) : (
              <>
                <p className="text-muted-foreground">
                  장기보유특별공제 = 양도차익 × (일반 공제율 + 추가 공제율)
                </p>
                <p className="font-mono font-semibold text-violet-900 dark:text-violet-200">
                  {formatN(lthdEffect.gainApplied!)} × ({formatRateFine(lthdEffect.baseLthdRate!)} +{" "}
                  {formatRateFine(lthdEffect.additionalRate ?? 0)}) = {formatN(lthdEffect.deductionApplied!)}
                </p>
              </>
            )}
          </div>
        )}

        {lthdEffect.rentalGainRatio < 1 && (
          <p className="text-micro text-violet-700 dark:text-violet-400">
            ※ 임대기간 분 양도차익 한정 적용 — 조특령 §97의3⑤ 기준시가 안분
          </p>
        )}

        <p className="text-micro text-muted-foreground">근거 조문: {detail.legalBasis}</p>
      </div>
    );
  }

  // 산출세액 감면 (§97·§97의2·§97의5)
  if (effect.effectCategory === "tax_amount") {
    const taxEffect = effect as typeof effect & {
      reductionRate: number;
      reductionAmount: number;
      rentalGainRatio: number;
      isFullExemption: boolean;
    };
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            {effectLabel ?? "장기임대주택 세액감면"}
          </p>
          <span className="text-xs rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 font-medium">
            {ARTICLE_LABELS[detail.id] ?? detail.id}
          </span>
          {taxEffect.isFullExemption && (
            <span className="text-micro rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300 px-2 py-0.5">
              전액 감면
            </span>
          )}
        </div>

        {/* 산식 표시 — 한국어 풀어쓰기 */}
        <div className="rounded bg-white/70 dark:bg-white/5 border border-emerald-100 dark:border-emerald-800/30 p-2.5 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">적용 감면율</span>
            <span className="font-mono font-semibold text-emerald-900 dark:text-emerald-200">
              {formatRate(taxEffect.reductionRate)}
            </span>
          </div>
          <div className="flex justify-between border-t border-emerald-100 dark:border-emerald-800/30 pt-1.5 mt-0.5">
            <span className="text-muted-foreground">감면세액</span>
            <span className="font-mono font-semibold text-emerald-900 dark:text-emerald-200">
              {formatN(taxEffect.reductionAmount)}
            </span>
          </div>
          {taxEffect.rentalGainRatio < 1 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">임대기간 분 비율</span>
              <span className="font-mono">{(taxEffect.rentalGainRatio * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>

        {/* 산출근거 — 라벨 산식 + 값 대입 (§77의2 카드와 동일 규약) */}
        <div className="rounded bg-white/70 dark:bg-white/5 border border-emerald-100 dark:border-emerald-800/30 p-2.5 text-xs space-y-1.5">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">감면세액 산출근거</p>
          {taxEffect.rentalGainRatio < 1 ? (
            <>
              <p className="text-muted-foreground">
                감면세액 = 산출세액 × 임대기간 분 비율 × 감면율
              </p>
              <p className="font-mono font-semibold text-emerald-900 dark:text-emerald-200">
                {formatN(calculatedTax)} × {formatRateFine(taxEffect.rentalGainRatio)} ×{" "}
                {formatRate(taxEffect.reductionRate)} = {formatN(taxEffect.reductionAmount)}
              </p>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">감면세액 = 산출세액 × 감면율</p>
              <p className="font-mono font-semibold text-emerald-900 dark:text-emerald-200">
                {formatN(calculatedTax)} × {formatRate(taxEffect.reductionRate)} ={" "}
                {formatN(taxEffect.reductionAmount)}
              </p>
            </>
          )}
        </div>

        <p className="text-micro text-muted-foreground">근거 조문: {detail.legalBasis}</p>
      </div>
    );
  }

  return null;
}
