"use client";

/**
 * MajorShareholderBlock — 대주주 판정 (Step 1)
 *
 * 상장 3시장(코스피·코스닥·코넥스) + 비상장 4시장 2-step 판정:
 *   1. 본인 단독 지분율 or 시총으로 임계 초과 여부
 *   2. 본인이 최대주주그룹 → 합산 지분율·시총 추가 입력
 *
 * 시기별·시장별 임계는 `lib/tax-engine/stock-transfer/stock-rate-tables.ts` 의
 * `getMajorShareholderThreshold()` 단일 진실 사용. 동적 박스에서 현재 적용
 * 임계(지분율·시총·시장명·fromDate)를 실시간 표시.
 *
 * F-8 자동 동기화 (2026-05-17):
 *   자동 판정 지원 시장(kospi·kosdaq·konex·unlisted)에서는 각 입력 필드의
 *   onChange 시점에 isMajorShareholder를 자동 산출하여 함께 갱신.
 *   useEffect → store 미러링 금지(feedback_useeffect_store_mirror_forbidden).
 *   기타자산(other_asset)은 §94①4 별도 트랙 — 사용자 직접 입력.
 *
 * 상장 3시장 근거: §157④ / 비상장 근거: §167의8①2호
 */

import { useMemo } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import {
  getMajorShareholderThreshold,
  resolveThresholdFromDate,
} from "@/lib/tax-engine/stock-transfer/stock-rate-tables";
import { MARKET_LABEL } from "@/components/calc/stock-transfer/market-label";
import { MajorThresholdTimeline } from "@/components/calc/stock-transfer/MajorThresholdTimeline";
import { computeAutoIsMajor } from "@/components/calc/stock-transfer/major-sync";

type MajorShareholderFormSlice = Pick<
  StockTransferFormData,
  | "isMajorShareholder"
  | "selfShareRatio"
  | "selfMarketCap"
  | "isLargestShareholderGroup"
  | "combinedShareRatio"
  | "combinedMarketCap"
  | "priorYearEndDate"
  | "marketType"
  | "selfShareRatioMode"
  | "selfOwnedShares"
  | "combinedShareRatioMode"
  | "combinedOwnedShares"
  | "totalIssuedShares"
>;

/**
 * 주식수로부터 지분율(%) 산출.
 * 분모(total) 0 이하 또는 owned 음수면 null — 자동 0 fallback 금지 정책(no_silent_apportion_fallback) 준수.
 * 반환은 % 단위 문자열 (소수 4자리). selfShareRatio·combinedShareRatio가 % 단위로 사용되는 것과 일치.
 */
export function computeShareRatioFromShares(
  ownedRaw: string,
  totalRaw: string,
): string | null {
  // 빈문자(미입력) → null. parseDecimal("")는 0을 반환하므로 명시적 zero("0")와 구분.
  if (!ownedRaw || !ownedRaw.trim() || !totalRaw || !totalRaw.trim()) return null;
  const total = parseDecimal(totalRaw);
  const owned = parseDecimal(ownedRaw);
  if (!(total > 0) || !(owned >= 0)) return null;
  return ((owned / total) * 100).toFixed(4);
}

interface MajorShareholderBlockProps {
  form: MajorShareholderFormSlice;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function MajorShareholderBlock({ form, onChange }: MajorShareholderBlockProps) {
  // 엔진 함수로 시기별 임계 산출
  // 상장(kospi/kosdaq/konex) + 비상장(unlisted) 모두 자동 판정 지원
  // 기타자산(other_asset)은 §94①4 별도 트랙 — null 반환
  const threshold = useMemo(() => {
    if (!form.priorYearEndDate) return null;
    if (
      form.marketType !== "kospi" &&
      form.marketType !== "kosdaq" &&
      form.marketType !== "konex" &&
      form.marketType !== "unlisted"
    ) {
      return null;
    }
    return getMajorShareholderThreshold(
      form.marketType,
      new Date(form.priorYearEndDate),
    );
  }, [form.marketType, form.priorYearEndDate]);

  const shareRatioThreshold = threshold?.shareRatioThreshold ?? 0;
  const marketCapThreshold = threshold?.marketCapThreshold ?? Infinity;

  // 판정 미리보기 (useMemo — store 미러링 금지)
  // 폼 입력은 % 단위 (예: "3" = 3%). 비교 시 0.01을 곱해 decimal로 정규화.
  const judgment = useMemo(() => {
    // 기타자산은 자동 판정 미적용 — threshold null 가드 (fallback 0 false positive 차단)
    if (!threshold) {
      return { isMajor: false, selfMeetsRatio: false, selfMeetsCap: false, combMeetsRatio: false, combMeetsCap: false };
    }
    const selfRatio = parseDecimal(form.selfShareRatio) * 0.01;
    const selfCap = parseAmount(form.selfMarketCap);
    const combRatio = form.isLargestShareholderGroup ? parseDecimal(form.combinedShareRatio) * 0.01 : 0;
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
    threshold,
    shareRatioThreshold,
    marketCapThreshold,
  ]);

  /**
   * onChange wrapper — 입력 patch에 자동 산출 결과를 함께 전달.
   * 자동 산출 미지원(other_asset·priorYearEndDate 미입력) 시 patch만 전달.
   * useEffect 미러링 금지(feedback_useeffect_store_mirror_forbidden) 준수.
   */
  const handleAutoSyncChange = (patch: Partial<StockTransferFormData>) => {
    const autoIsMajor = computeAutoIsMajor(form, patch);
    if (autoIsMajor === undefined) {
      onChange(patch);
    } else {
      onChange({ ...patch, isMajorShareholder: autoIsMajor });
    }
  };

  /**
   * shares 모드: 주식수 입력 시 비율(%) 산출 후 selfShareRatio/combinedShareRatio에 즉시 반영.
   * 분모 0 또는 빈값이면 ratio 미변경 (자동 0 fallback 금지).
   * useEffect 미러링 금지 — onChange 시점에 직접 patch에 담아 호출.
   */
  const handleSharesChange = (
    scope: "self" | "combined",
    patch: Partial<StockTransferFormData>,
  ) => {
    const next = { ...form, ...patch };
    const ownedRaw = scope === "self" ? next.selfOwnedShares : next.combinedOwnedShares;
    const computed = computeShareRatioFromShares(ownedRaw, next.totalIssuedShares);
    const ratioPatch: Partial<StockTransferFormData> = { ...patch };
    if (computed !== null) {
      if (scope === "self") ratioPatch.selfShareRatio = computed;
      else ratioPatch.combinedShareRatio = computed;
    }
    handleAutoSyncChange(ratioPatch);
  };

  // shares 모드 산출 미리보기 (useMemo — store 미러링 금지)
  const selfRatioFromShares = useMemo(
    () =>
      form.selfShareRatioMode === "shares"
        ? computeShareRatioFromShares(form.selfOwnedShares, form.totalIssuedShares)
        : null,
    [form.selfShareRatioMode, form.selfOwnedShares, form.totalIssuedShares],
  );
  const combinedRatioFromShares = useMemo(
    () =>
      form.combinedShareRatioMode === "shares"
        ? computeShareRatioFromShares(form.combinedOwnedShares, form.totalIssuedShares)
        : null,
    [form.combinedShareRatioMode, form.combinedOwnedShares, form.totalIssuedShares],
  );

  // 자동 판정 활성 여부 — ToggleCard 분기에 사용
  const isAutoJudgmentActive = threshold !== null;

  return (
    <ToggleCard
      checked={form.isMajorShareholder}
      onCheckedChange={isAutoJudgmentActive
        // 자동 판정 활성 시 — 사용자 클릭 무효화 (자동 산출이 source of truth)
        ? () => {}
        // 기타자산 — 사용자 직접 입력
        : (v) => onChange({ isMajorShareholder: v })
      }
      title={isAutoJudgmentActive
        ? "대주주 여부 — 자동 판정 (§157 / §167의8①2호)"
        : "대주주 여부 (사용자 직접 선택)"
      }
      description={isAutoJudgmentActive
        ? "아래 입력값 변경 시 자동으로 동기화됩니다. 임계 조건 충족 여부는 판정 결과 박스에서 확인하세요."
        : "기타자산은 자동 판정 미적용 — §94①4 별도 트랙. 직접 선택하세요."
      }
      tone="violet"
    >
      {/* 직전 사업연도 종료일 */}
      <div className="mt-4 space-y-4">
        <FieldCard label="직전 사업연도 종료일" required hint="통상 전년 12월 31일. 사업연도가 다른 경우 해당 연도 종료일.">
          <DateInput
            value={form.priorYearEndDate}
            onChange={(v) => handleAutoSyncChange({ priorYearEndDate: v })}
          />
        </FieldCard>

        {/* 동적 임계 박스 — 직전 사업연도 종료일 + 시장 선택 후 자동 표시 */}
        {threshold && form.priorYearEndDate && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm">
            <p className="font-semibold text-violet-900 mb-1">
              현재 적용 임계 ({form.marketType === "unlisted" ? "§167의8①2호" : "§157④"})
            </p>
            <p className="text-violet-800">
              지분율 <strong>{(threshold.shareRatioThreshold * 100).toFixed(1)}%</strong> ·
              시총 <strong>{(threshold.marketCapThreshold / 100_000_000).toFixed(0)}억</strong>
            </p>
            <p className="text-xs text-violet-600 mt-1">
              {MARKET_LABEL[form.marketType as keyof typeof MARKET_LABEL]} ·{" "}
              {resolveThresholdFromDate(
                form.marketType as "kospi" | "kosdaq" | "konex" | "unlisted",
                new Date(form.priorYearEndDate),
              )}~ 적용
            </p>
            {form.marketType === "unlisted" && (
              <p className="text-xs text-violet-600 mt-1">
                ※ 벤처기업은 시총 임계 40억 (조특법 §16, 시행령 §167의8①2호 나목)
              </p>
            )}
          </div>
        )}

        {/* 시기별 임계 이력 펼침 — 상장 3시장 + 비상장에만 표시 */}
        {threshold && (
          <details className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
            <summary className="text-xs font-medium text-slate-700 cursor-pointer select-none">
              시기별 임계 이력 보기
            </summary>
            <div className="mt-3">
              <MajorThresholdTimeline
                marketType={form.marketType as "kospi" | "kosdaq" | "konex" | "unlisted"}
              />
            </div>
          </details>
        )}

        {/* 본인 단독 지분율 — 입력 방식 선택 */}
        <div className="space-y-3">
          <RadioCardGroup
            name="selfShareRatioMode"
            value={form.selfShareRatioMode}
            options={[
              { value: "direct", label: "지분율 직접 입력 (%)" },
              { value: "shares", label: "주식수로 계산 (본인보유 ÷ 총발행)" },
            ]}
            layout="inline"
            tone="violet"
            onChange={(v) => onChange({ selfShareRatioMode: v })}
          />
          {form.selfShareRatioMode === "direct" ? (
            <FieldCard label="본인 단독 지분율" hint="% 단위 입력 (예: 1.5 = 1.5%, 3 = 3%)" unit="%">
              <DecimalInput
                value={form.selfShareRatio}
                onChange={(v) => handleAutoSyncChange({ selfShareRatio: v })}
              />
            </FieldCard>
          ) : (
            <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
              <FieldCard label="총 발행주식수" hint="해당 법인의 발행주식 총수 (주). 다른 단계에서도 함께 사용됩니다.">
                <DecimalInput
                  value={form.totalIssuedShares}
                  onChange={(v) => handleSharesChange("self", { totalIssuedShares: v })}
                />
              </FieldCard>
              <FieldCard label="본인 보유 주식수" hint="본인 단독 명의 보유 주식수 (주)">
                <DecimalInput
                  value={form.selfOwnedShares}
                  onChange={(v) => handleSharesChange("self", { selfOwnedShares: v })}
                />
              </FieldCard>
              {selfRatioFromShares !== null ? (
                <div className="rounded-md bg-violet-100/60 px-3 py-2 text-sm text-violet-900">
                  산출 지분율: <strong>{selfRatioFromShares}%</strong>
                  <span className="ml-1 text-xs text-violet-700">
                    ({form.selfOwnedShares} ÷ {form.totalIssuedShares} × 100)
                  </span>
                </div>
              ) : (
                <p className="text-xs text-violet-600">
                  총 발행주식수와 본인 보유 주식수를 입력하면 지분율이 자동 산출됩니다.
                </p>
              )}
            </div>
          )}
        </div>

        {/* 본인 단독 시총 */}
        <CurrencyInput
          label="본인 단독 시가총액"
          hint="직전 사업연도 말 기준 (원)"
          value={form.selfMarketCap}
          onChange={(v) => handleAutoSyncChange({ selfMarketCap: v })}
        />

        {/* 최대주주그룹 합산 토글 */}
        <ToggleCard
          checked={form.isLargestShareholderGroup}
          onCheckedChange={(v) => handleAutoSyncChange({ isLargestShareholderGroup: v })}
          title="본인+특수관계인 합산 최대주주그룹 여부"
          description="§157① 단서 — 본인 단독 미달 시 특수관계인과 합산하여 최대주주그룹을 형성하는지"
          tone="violet"
        >
          <div className="mt-3 space-y-3">
            <RadioCardGroup
              name="combinedShareRatioMode"
              value={form.combinedShareRatioMode}
              options={[
                { value: "direct", label: "지분율 직접 입력 (%)" },
                { value: "shares", label: "주식수로 계산 (합산보유 ÷ 총발행)" },
              ]}
              layout="inline"
              tone="violet"
              onChange={(v) => onChange({ combinedShareRatioMode: v })}
            />
            {form.combinedShareRatioMode === "direct" ? (
              <FieldCard label="합산 지분율" hint="특수관계인 합산 (% 단위, 예: 3 = 3%)" unit="%">
                <DecimalInput
                  value={form.combinedShareRatio}
                  onChange={(v) => handleAutoSyncChange({ combinedShareRatio: v })}
                />
              </FieldCard>
            ) : (
              <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                <FieldCard label="총 발행주식수" hint="해당 법인의 발행주식 총수 (주). 본인 단독 입력과 동일 값.">
                  <DecimalInput
                    value={form.totalIssuedShares}
                    onChange={(v) => handleSharesChange("combined", { totalIssuedShares: v })}
                  />
                </FieldCard>
                <FieldCard label="본인+특수관계인 합산 보유 주식수" hint="최대주주그룹 합산 보유 주식수 (주)">
                  <DecimalInput
                    value={form.combinedOwnedShares}
                    onChange={(v) => handleSharesChange("combined", { combinedOwnedShares: v })}
                  />
                </FieldCard>
                {combinedRatioFromShares !== null ? (
                  <div className="rounded-md bg-violet-100/60 px-3 py-2 text-sm text-violet-900">
                    산출 합산 지분율: <strong>{combinedRatioFromShares}%</strong>
                    <span className="ml-1 text-xs text-violet-700">
                      ({form.combinedOwnedShares} ÷ {form.totalIssuedShares} × 100)
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-violet-600">
                    총 발행주식수와 합산 보유 주식수를 입력하면 지분율이 자동 산출됩니다.
                  </p>
                )}
              </div>
            )}
            <CurrencyInput
              label="합산 시가총액"
              hint="특수관계인 합산 (원)"
              value={form.combinedMarketCap}
              onChange={(v) => handleAutoSyncChange({ combinedMarketCap: v })}
            />
          </div>
        </ToggleCard>

        {/* 판정 결과 박스 — 자동 판정 활성(상장 3시장 + 비상장) */}
        {threshold ? (
          <div className={`rounded-lg border px-4 py-3 text-sm ${
            judgment.isMajor
              ? "border-violet-300 bg-violet-100/60 text-violet-900"
              : "border-slate-200 bg-slate-50 text-slate-600"
          }`}>
            <p className="font-medium mb-1">
              대주주 자동 판정: {judgment.isMajor ? "✓ 대주주 해당" : "✗ 대주주 미해당"}
            </p>
            <p className="text-xs">
              시총 임계 {(marketCapThreshold / 100_000_000).toFixed(0)}억 / 지분율 임계 {(shareRatioThreshold * 100).toFixed(1)}%
              {" "}({form.marketType === "unlisted" ? "§167의8①2호" : "§157"})
            </p>
          </div>
        ) : form.marketType === "other_asset" ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-medium mb-1">자동 판정 미적용 (기타자산은 §94①4 별도 트랙)</p>
            <p className="text-xs">상단의 &quot;대주주 여부&quot; 토글로 직접 선택하세요.</p>
          </div>
        ) : null}
      </div>
    </ToggleCard>
  );
}
