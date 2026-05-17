"use client";

/**
 * MajorShareholderBlock — 대주주 판정 (Step 1)
 *
 * 시행령 §157 2-step 판정:
 *   1. 본인 단독 지분율 or 시총으로 임계 초과 여부
 *   2. 본인이 최대주주그룹 → 합산 지분율·시총 추가 입력
 *
 * 시기별 임계 (priorYearEndDate 기준):
 *   - 2024.1.1. 이후 → 코스피·코스닥·코넥스 모두 시총 50억 통일
 *   - 2020.4.1.~ 2023.12.31. → 10억
 *   - 2018.4.1.~ 2020.3.31. → 15억
 *   - ~2018.3.31. → 코스피 25억 / 코스닥·코넥스 20억
 *
 * 지분율 임계:
 *   코스피 1% / 코스닥·코넥스 2% / 비상장 4%
 */

import { useMemo } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface MajorShareholderBlockProps {
  form: Pick<
    StockTransferFormData,
    | "isMajorShareholder"
    | "selfShareRatio"
    | "selfMarketCap"
    | "isLargestShareholderGroup"
    | "combinedShareRatio"
    | "combinedMarketCap"
    | "priorYearEndDate"
    | "marketType"
  >;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

// 시기별 임계 산출
function getMarketCapThreshold(priorYearEndDate: string, marketType: string): number {
  if (!priorYearEndDate) return 5_000_000_000; // default 50억 (2024.1.1.~)
  const date = new Date(priorYearEndDate);
  const d20240101 = new Date("2024-01-01");
  const d20200401 = new Date("2020-04-01");
  const d20180401 = new Date("2018-04-01");

  if (date >= d20240101) return 5_000_000_000;      // 50억 (전 시장 통일)
  if (date >= d20200401) return 1_000_000_000;       // 10억
  if (date >= d20180401) return 1_500_000_000;       // 15억
  // 2018.3.31. 이전
  if (marketType === "kospi") return 2_500_000_000;  // 25억
  return 2_000_000_000;                               // 20억 (코스닥·코넥스)
}

function getShareRatioThreshold(marketType: string): number {
  if (marketType === "kospi") return 0.01;   // 1%
  if (marketType === "kosdaq" || marketType === "konex") return 0.02; // 2%
  return 0.04;  // 비상장 4%
}

export function MajorShareholderBlock({ form, onChange }: MajorShareholderBlockProps) {
  const marketCapThreshold = useMemo(
    () => getMarketCapThreshold(form.priorYearEndDate, form.marketType),
    [form.priorYearEndDate, form.marketType]
  );
  const shareRatioThreshold = useMemo(
    () => getShareRatioThreshold(form.marketType),
    [form.marketType]
  );

  // 판정 미리보기 (useMemo — store 미러링 금지)
  const judgment = useMemo(() => {
    const selfRatio = parseDecimal(form.selfShareRatio);
    const selfCap = parseAmount(form.selfMarketCap);
    const combRatio = form.isLargestShareholderGroup ? parseDecimal(form.combinedShareRatio) : 0;
    const combCap = form.isLargestShareholderGroup ? parseAmount(form.combinedMarketCap) : 0;

    const selfMeetsRatio = selfRatio >= shareRatioThreshold;
    const selfMeetsCap = selfCap > 0 && selfCap >= marketCapThreshold;
    const combMeetsRatio = combRatio >= shareRatioThreshold;
    const combMeetsCap = combCap > 0 && combCap >= marketCapThreshold;

    const isMajor = selfMeetsRatio || selfMeetsCap || combMeetsRatio || combMeetsCap;
    return { isMajor, selfMeetsRatio, selfMeetsCap, combMeetsRatio, combMeetsCap };
  }, [
    form.selfShareRatio,
    form.selfMarketCap,
    form.isLargestShareholderGroup,
    form.combinedShareRatio,
    form.combinedMarketCap,
    shareRatioThreshold,
    marketCapThreshold,
  ]);

  const thresholdDate = form.priorYearEndDate
    ? new Date(form.priorYearEndDate) >= new Date("2024-01-01")
      ? "2024.1.1. 이후 (50억)"
      : new Date(form.priorYearEndDate) >= new Date("2020-04-01")
        ? "2020.4.1.~2023 (10억)"
        : new Date(form.priorYearEndDate) >= new Date("2018-04-01")
          ? "2018.4.1.~2020 (15억)"
          : "~2018.3.31. (코스피 25억 / 코스닥 20억)"
    : "-";

  return (
    <ToggleCard
      checked={form.isMajorShareholder}
      onCheckedChange={(v) => onChange({ isMajorShareholder: v })}
      title="대주주 여부 (시행령 §157)"
      description="직전 사업연도 말 기준 — 단독 또는 특수관계인 합산 지분율·시총 임계 초과 시 대주주"
      tone="violet"
    >
      {/* 직전 사업연도 종료일 */}
      <div className="mt-4 space-y-4">
        <FieldCard label="직전 사업연도 종료일" required hint="통상 전년 12월 31일. 사업연도가 다른 경우 해당 연도 종료일.">
          <DateInput
            value={form.priorYearEndDate}
            onChange={(v) => onChange({ priorYearEndDate: v })}
          />
        </FieldCard>

        {/* 시기별 임계 안내 카드 */}
        <div className="rounded-lg border border-violet-200/60 bg-violet-50/60 px-4 py-3 text-sm">
          <p className="font-medium text-violet-800 mb-1">시기별 시가총액 임계 (§157④ 2024.1.1. 개정)</p>
          <div className="text-violet-700 space-y-0.5">
            <p>· 2024.1.1. 이후 → 전 시장 <strong>50억</strong></p>
            <p>· 2020.4.1.~2023 → 10억</p>
            <p>· 2018.4.1.~2020.3.31. → 15억</p>
            <p>· ~2018.3.31. → 코스피 25억 / 코스닥·코넥스 20억</p>
          </div>
          <p className="mt-2 text-violet-600 text-xs">
            적용 시점: {thresholdDate} | 지분율 임계: 코스피 1% / 코스닥·코넥스 2% / 비상장 4%
          </p>
        </div>

        {/* 본인 단독 지분율 */}
        <FieldCard label="본인 단독 지분율" hint="소수점 입력 (예: 1.5% → 0.015)">
          <DecimalInput
            value={form.selfShareRatio}
            onChange={(v) => onChange({ selfShareRatio: v })}
            placeholder="0.0150"
          />
        </FieldCard>

        {/* 본인 단독 시총 */}
        <CurrencyInput
          label="본인 단독 시가총액"
          hint="직전 사업연도 말 기준 (원)"
          value={form.selfMarketCap}
          onChange={(v) => onChange({ selfMarketCap: v })}
        />

        {/* 최대주주그룹 합산 토글 */}
        <ToggleCard
          checked={form.isLargestShareholderGroup}
          onCheckedChange={(v) => onChange({ isLargestShareholderGroup: v })}
          title="본인+특수관계인 합산 최대주주그룹 여부"
          description="§157① 단서 — 본인 단독 미달 시 특수관계인과 합산하여 최대주주그룹을 형성하는지"
          tone="violet"
        >
          <div className="mt-3 space-y-3">
            <FieldCard label="합산 지분율" hint="특수관계인 합산 (소수점)">
              <DecimalInput
                value={form.combinedShareRatio}
                onChange={(v) => onChange({ combinedShareRatio: v })}
                placeholder="0.0300"
              />
            </FieldCard>
            <CurrencyInput
              label="합산 시가총액"
              hint="특수관계인 합산 (원)"
              value={form.combinedMarketCap}
              onChange={(v) => onChange({ combinedMarketCap: v })}
            />
          </div>
        </ToggleCard>

        {/* 판정 미리보기 */}
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          judgment.isMajor
            ? "border-violet-300 bg-violet-100/60 text-violet-900"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}>
          <p className="font-medium mb-1">
            대주주 자동 판정: {judgment.isMajor ? "✓ 대주주 해당" : "✗ 대주주 미해당"}
          </p>
          <p className="text-xs">
            시총 임계 {(marketCapThreshold / 100_000_000).toFixed(0)}억 / 지분율 임계{" "}
            {(shareRatioThreshold * 100).toFixed(0)}% (§157)
          </p>
        </div>
      </div>
    </ToggleCard>
  );
}
