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

import { useMemo, useState } from "react";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
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
import { KiwoomMarketCapHelper } from "./KiwoomMarketCapHelper";
// F-06 (2026-05-19) — 직전사업연도 종료일 비거래일 → 직전거래일 적용 안내
import { isKrxTradingDay, nonTradingLabel } from "@/lib/kiwoom/calendar";
// Phase C + F-08/12/13 (2026-05-19) — 교재 Check Point UI hint 그룹
import {
  MarketCapHintsCard,
  IssuedSharesHintsCard,
  CombinedShareHintsCard,
  SpecialEntityHintsCard,
} from "./MajorShareholderCheckpointHints";

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
  | "isKOTCTrading"
  | "isOnMarketTransaction"
  | "selfShareRatioMode"
  | "selfOwnedShares"
  | "combinedShareRatioMode"
  | "combinedOwnedShares"
  | "totalIssuedShares"
  // F-04 키움 시가총액 자동 산정 — Step1 종목코드 + 자동조회 메타
  | "securityCode"
  | "kiwoomTradingHalt"
  // Phase B (2026-05-19) — 비상장 벤처기업 시총 임계 40억 분기
  | "isVentureCompany"
  // F-15·F-16 (2026-05-19) — 대차주식·사모펀드 간접소유 자동 가산
  | "lentSharesCount"
  | "pefIndirectSharesCount"
  | "transferDate"
  // F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override
  | "judgmentDateOverride"
  | "judgmentBasis"
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
  const [thresholdHistoryOpen, setThresholdHistoryOpen] = useState(false);
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
      // 엔진(`stock-classification.ts`)과 **같은 인자 집합**으로 부른다 — 여기만 안 넘기면
      // 임계는 10억으로 판정되는데 화면은 계속 40억을 보여준다(리뷰 #14 세팅 지점 2곳).
      { isVentureCompany: form.isVentureCompany, isKOTCTrading: form.isKOTCTrading },
    );
  }, [form.marketType, form.priorYearEndDate, form.isVentureCompany, form.isKOTCTrading]);

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

  // 자동 판정 활성 여부 — 자동 모드는 ToggleCard 대신 항상 펼침 카드 + 판정 배지로 렌더.
  // (잠긴 토글이 닫혀 입력 자체에 접근 불가하던 닭-달걀 문제 차단)
  const isAutoJudgmentActive = threshold !== null;

  // F-06 (2026-05-19) — 직전사업연도 종료일 거래일 여부 검증
  // 시행령 §157①·교재 §3장 이미지 49 (3) ① 단서:
  // "직전사업연도 종료일 현재의 최종시세가액이 없는 경우에는 직전거래일의 최종시세가액"
  const priorYearEndTradingStatus = useMemo(() => {
    if (!form.priorYearEndDate || !/^\d{4}-\d{2}-\d{2}$/.test(form.priorYearEndDate)) {
      return null;
    }
    // 상장 시장(kospi/kosdaq/konex)에만 적용 — 비상장은 §165④ 보충적 평가 별도
    if (
      form.marketType !== "kospi" &&
      form.marketType !== "kosdaq" &&
      form.marketType !== "konex"
    ) {
      return null;
    }
    const isTrading = isKrxTradingDay(form.priorYearEndDate);
    if (isTrading) return { isTrading: true as const };
    return {
      isTrading: false as const,
      reason: nonTradingLabel(form.priorYearEndDate),
    };
  }, [form.priorYearEndDate, form.marketType]);

  // F-15·F-16 (2026-05-19) — 양도일 2013.2.15. 이후 자동 가산 게이트
  const f15f16Eligible = useMemo(() => {
    if (!form.transferDate || !/^\d{4}-\d{2}-\d{2}$/.test(form.transferDate)) return false;
    return form.transferDate >= "2013-02-15";
  }, [form.transferDate]);

  const innerContent = (
    <div className={isAutoJudgmentActive ? "space-y-4" : "mt-4 space-y-4"}>
        <FieldCard label="직전 사업연도 종료일" required hint="통상 전년 12월 31일. 사업연도가 다른 경우 해당 연도 종료일.">
          <DateInput
            value={form.priorYearEndDate}
            onChange={(v) => handleAutoSyncChange({ priorYearEndDate: v })}
          />
        </FieldCard>

        {/* F-06 (2026-05-19) — 직전사업연도 종료일 비거래일 안내
            시행령 §157① · 교재 §3장 이미지 49 (3) ①: 종료일 종가 없으면 직전거래일 종가 적용 */}
        {priorYearEndTradingStatus && !priorYearEndTradingStatus.isTrading && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-semibold">
              ⚠️ 비거래일 입력 — 직전거래일 종가 적용 필요 (<LawArticleModal legalBasis="소득세법 시행령 §157 ①" label="§157①" />, 교재 49 (3) ①)
            </p>
            <p className="mt-1 text-amber-800">
              <strong>{form.priorYearEndDate}</strong>은 {priorYearEndTradingStatus.reason}입니다.
              해당 일자 종가가 없는 경우 <strong>직전거래일 최종시세가액</strong>을 사용해야 합니다.
            </p>
            <p className="mt-1 text-micro text-amber-700">
              💡 키움증권 자동조회는 비거래일 입력 시 직전거래일 종가를 자동 적용합니다.
              수동 입력 시 사용자가 직전거래일 시세로 시가총액을 산정한 뒤 입력해 주세요.
            </p>
          </div>
        )}

        {/* F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override (합병·분할·신설법인 특수) */}
        <ToggleCard
          checked={form.judgmentBasis !== "default"}
          onCheckedChange={(v) =>
            onChange({
              judgmentBasis: v ? "merger" : "default",
              judgmentDateOverride: v ? form.judgmentDateOverride : "",
            })
          }
          title="특수 판정 기준일 (합병·분할·신설법인)"
          description="합병등기일·분할등기일·설립등기일 등 특수분기 시 priorYearEndDate 대신 별도 기준일 사용 (시행령 §157④·소령 157⑧)"
          tone="rose"
        >
          <div className="mt-3 space-y-3">
            <RadioCardGroup
              name="judgmentBasis"
              value={form.judgmentBasis === "default" ? "merger" : form.judgmentBasis}
              options={[
                { value: "merger", label: "합병 — 피합병법인 합병등기일 기준" },
                { value: "split", label: "분할 — 분할 전 법인 분할등기일 기준" },
                { value: "split_new_entity", label: "분할신설법인 — 분할 전 직전사업연도 종료일" },
                { value: "incorporation", label: "신설법인 — 설립등기일 기준" },
              ]}
              layout="stack"
              tone="rose"
              onChange={(v) => onChange({ judgmentBasis: v as "merger" | "split" | "split_new_entity" | "incorporation" })}
            />
            <FieldCard label="특수 판정 기준일자" required hint="해당 사유의 등기일·종료일 (ISO YYYY-MM-DD)">
              <DateInput
                value={form.judgmentDateOverride}
                onChange={(v) => onChange({ judgmentDateOverride: v })}
              />
            </FieldCard>
            <p className="text-micro text-rose-700 bg-rose-100/70 px-2 py-1 rounded">
              ✓ 입력된 기준일로 대주주 기준 매트릭스가 조회됩니다 (시기별 1%/2%/4% 등). priorYearEndDate는 표시용으로만 사용.
            </p>
          </div>
        </ToggleCard>

        {/* F-08·F-12·F-13 (2026-05-19) — Group D 합병·분할·간접투자 추가 hint */}
        <SpecialEntityHintsCard />

        {/* 동적 임계 박스 — 직전 사업연도 종료일 + 시장 선택 후 자동 표시 */}
        {threshold && form.priorYearEndDate && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm">
            <p className="font-semibold text-violet-900 mb-1 flex items-center gap-1">
              현재 적용 기준 (
              {form.marketType === "unlisted"
                ? <LawArticleModal legalBasis="소득세법 시행령 §167의8 ①" label="§167의8①2호" />
                : <LawArticleModal legalBasis="소득세법 시행령 §157" label="§157④" />}
              )
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
            {form.marketType === "unlisted" && threshold.isVentureRule && (
              <p className="text-xs text-violet-700 mt-1 font-semibold flex items-center gap-1 flex-wrap">
                ✓ 자동 적용 중 — 비상장 벤처기업 시총 기준 <strong>40억</strong>{" "}
                (<LawArticleModal legalBasis="소득세법 시행령 §167의8 ①" label="§167의8①2호 나목" />)
              </p>
            )}
            {form.marketType === "unlisted" && !threshold.isVentureRule && (
              <p className="text-xs text-slate-500 mt-1">
                벤처기업 해당 시 회사 분류 토글에서 &quot;벤처기업&quot; 선택 → 시총 기준 40억 적용 (현재: 10억)
              </p>
            )}
          </div>
        )}

        {/* 시기별 임계 이력 펼침 — 상장 3시장 + 비상장에만 표시 */}
        {threshold && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
            <button
              type="button"
              onClick={() => setThresholdHistoryOpen((o) => !o)}
              aria-expanded={thresholdHistoryOpen}
              className={expandToggleClass("slate")}
            >
              {expandToggleLabel(thresholdHistoryOpen)} · 시기별 기준 이력 보기
            </button>
            {thresholdHistoryOpen && (
              <div className="mt-3">
                <MajorThresholdTimeline
                  marketType={form.marketType as "kospi" | "kosdaq" | "konex" | "unlisted"}
                />
              </div>
            )}
          </div>
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
            <ToneCard tone="violet" bodyClassName="space-y-3" noDark>
              <FieldCard label="총 발행주식수" hint="해당 법인의 발행주식 총수 (주). 다른 단계에서도 함께 사용됩니다.">
                <DecimalInput
                  value={form.totalIssuedShares}
                  onChange={(v) => handleSharesChange("self", { totalIssuedShares: v })}
                  thousandSeparator
                />
              </FieldCard>
              <FieldCard label="본인 보유 주식수" hint="본인 단독 명의 보유 주식수 (주)">
                <DecimalInput
                  value={form.selfOwnedShares}
                  onChange={(v) => handleSharesChange("self", { selfOwnedShares: v })}
                  thousandSeparator
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
            </ToneCard>
          )}
        </div>

        {/* 키움 시가총액 자동 산정 — 본인 보유 주식수 입력 이후 노출.
            의존 순서(종목코드 + 직전 사업연도말 + 보유 주식수)와 UI 입력 순서를 일치시킴. */}
        <KiwoomMarketCapHelper
          securityCode={form.securityCode}
          priorYearEndDate={form.priorYearEndDate}
          marketType={form.marketType}
          tradingHalt={form.kiwoomTradingHalt}
          selfOwnedShares={form.selfOwnedShares}
          combinedOwnedShares={form.combinedOwnedShares}
          isLargestShareholderGroup={form.isLargestShareholderGroup}
          onFill={onChange}
        />

        {/* 본인 단독 시총 — 자동 산정 결과가 이 필드에 채워짐 */}
        <CurrencyInput
          label="본인 단독 시가총액"
          hint="직전 사업연도 말 기준 (원)"
          value={form.selfMarketCap}
          onChange={(v) => handleAutoSyncChange({ selfMarketCap: v })}
        />

        {/* Phase C (2026-05-19) — Group A: 시가총액 산정 hint 4건 */}
        <MarketCapHintsCard />

        {/* Phase C (2026-05-19) — Group B: 발행주식총수 산정 hint 2건 */}
        <IssuedSharesHintsCard />

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
              <ToneCard tone="violet" bodyClassName="space-y-3" noDark>
                <FieldCard label="총 발행주식수" hint="해당 법인의 발행주식 총수 (주). 본인 단독 입력과 동일 값.">
                  <DecimalInput
                    value={form.totalIssuedShares}
                    onChange={(v) => handleSharesChange("combined", { totalIssuedShares: v })}
                    thousandSeparator
                  />
                </FieldCard>
                <FieldCard label="합산 보유 주식수" hint="본인+특수관계인 — 최대주주그룹 합산 보유 주식수 (주)">
                  <DecimalInput
                    value={form.combinedOwnedShares}
                    onChange={(v) => handleSharesChange("combined", { combinedOwnedShares: v })}
                    thousandSeparator
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
              </ToneCard>
            )}
            <CurrencyInput
              label="합산 시가총액"
              hint="특수관계인 합산 (원)"
              value={form.combinedMarketCap}
              onChange={(v) => handleAutoSyncChange({ combinedMarketCap: v })}
            />

            {/* F-15·F-16 (2026-05-19) — 대차/사모펀드 자동 가산 입력 */}
            <div className={`rounded-lg border p-3 space-y-3 ${
              f15f16Eligible ? "border-amber-300 bg-amber-50/60" : "border-slate-200 bg-slate-50/40"
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-amber-900">
                  대차·사모펀드 자동 가산 (시행령 §157 2013.2.15.~)
                </span>
                {!f15f16Eligible && (
                  <span className="text-micro text-slate-500">
                    {form.transferDate ? `양도일 ${form.transferDate}은 2013.2.15. 이전 → 미적용` : "양도일 입력 시 활성화"}
                  </span>
                )}
              </div>
              <FieldCard
                label="대차주식 수"
                hint="본인이 대여 중인 주식 수. 양도일 2013.2.15. 이후 자동 합산 (지분율 가산)"
                unit="주"
              >
                <DecimalInput
                  value={form.lentSharesCount}
                  onChange={(v) => onChange({ lentSharesCount: v })}
                  thousandSeparator
                  disabled={!f15f16Eligible}
                />
              </FieldCard>
              <FieldCard
                label="사모펀드 간접소유 주식 수"
                hint="본인·기타주주가 사모펀드 통해 간접소유. 양도일 2013.2.15. 이후 자동 합산"
                unit="주"
              >
                <DecimalInput
                  value={form.pefIndirectSharesCount}
                  onChange={(v) => onChange({ pefIndirectSharesCount: v })}
                  thousandSeparator
                  disabled={!f15f16Eligible}
                />
              </FieldCard>
              {f15f16Eligible && (parseDecimal(form.lentSharesCount) > 0 || parseDecimal(form.pefIndirectSharesCount) > 0) && (
                <p className="text-micro text-amber-700 bg-amber-100/70 px-2 py-1 rounded">
                  ✓ 양도일 2013.2.15. 이후 — 엔진이 지분율에 자동 가산합니다.
                  시가총액 가산은 사용자 입력 책임 (가격 외부 의존).
                </p>
              )}
            </div>

            {/* Phase C (2026-05-19) — Group C: 특수관계인 합산 hint 3건 */}
            <CombinedShareHintsCard />
          </div>
        </ToggleCard>

        {/* 판정 결과 박스 — 자동 판정 활성(상장 3시장 + 비상장) */}
        {threshold ? (
          (() => {
            // 어떤 항목이 기준을 충족했는지 사유 문자열 구성 (본인·합산 / 지분율·시총)
            const reasonParts: string[] = [];
            if (judgment.selfMeetsRatio) {
              reasonParts.push(`지분율 ${parseDecimal(form.selfShareRatio).toFixed(2)}%`);
            }
            if (judgment.combMeetsRatio && !judgment.selfMeetsRatio) {
              reasonParts.push(`합산 지분율 ${parseDecimal(form.combinedShareRatio).toFixed(2)}%`);
            }
            if (judgment.selfMeetsCap) {
              reasonParts.push(
                `시총 ${(parseAmount(form.selfMarketCap) / 100_000_000).toFixed(1)}억`,
              );
            }
            if (judgment.combMeetsCap && !judgment.selfMeetsCap) {
              reasonParts.push(
                `합산 시총 ${(parseAmount(form.combinedMarketCap) / 100_000_000).toFixed(1)}억`,
              );
            }
            const reason = reasonParts.join(" 또는 ");
            return (
              <div className={`rounded-lg border px-4 py-3 text-sm ${
                judgment.isMajor
                  ? "border-violet-300 bg-violet-100/60 text-violet-900"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}>
                <p className="font-medium mb-1">
                  대주주 자동 판정:{" "}
                  {judgment.isMajor
                    ? `✓ ${reason} → 대주주 해당`
                    : "✗ 대주주 미해당"}
                </p>
                <p className="text-xs flex items-center gap-1 flex-wrap">
                  시총 기준 {(marketCapThreshold / 100_000_000).toFixed(0)}억 / 지분율 기준 {(shareRatioThreshold * 100).toFixed(1)}%
                  {" "}(
                  {form.marketType === "unlisted"
                    ? <LawArticleModal legalBasis="소득세법 시행령 §167의8 ①" label="§167의8①2호" />
                    : <LawArticleModal legalBasis="소득세법 시행령 §157" label="§157" />}
                  )
                </p>
              </div>
            );
          })()
        ) : form.marketType === "other_asset" ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-medium mb-1">자동 판정 미적용 (기타자산은 §94①4 별도 트랙)</p>
            <p className="text-xs">상단의 &quot;대주주 여부&quot; 토글로 직접 선택하세요.</p>
          </div>
        ) : null}

        {/*
          장내/장외 거래 구분 — **축이 둘이다**.

          ① 소득세법 §94①3 가목1) 단서 — 상장 **비대주주**의 장내 양도는 과세대상 밖.
          ② 증권거래세법 §8②·시행령 §5 — 탄력세율은 「**증권시장에서 거래되는 주권에 한정**」.
             농특세도 「**증권시장에서 거래된** 증권의 양도가액」이 과세표준이다(농특세법 §5①5호).

          🔑 종전에는 게이트가 `!judgment.isMajor`라 **대주주의 상장 장외 양도**(가장 흔한
             장외 케이스)에 입력 경로가 없어 값이 default `true`로 고정됐다. ①은 대주주에게
             의미가 없지만 ②는 **대주주에게도 그대로 걸린다** — 그래서 상장 3종 + 非K-OTC면
             대주주 여부와 무관하게 연다.
        */}
        {(form.marketType === "kospi" ||
          form.marketType === "kosdaq" ||
          form.marketType === "konex") &&
          !form.isKOTCTrading && (
            <ToggleCard
              checked={form.isOnMarketTransaction}
              onCheckedChange={(v) => onChange({ isOnMarketTransaction: v })}
              title="거래소 장내 거래 (§94①3 가목1) 단서 · 증권거래세법 §8②)"
              description={
                form.isOnMarketTransaction
                  ? judgment.isMajor
                    ? "✓ 장내 거래 — 증권거래세 탄력세율(시행령 §5) + 농어촌특별세 적용. 대주주는 장내여도 양도소득세 과세대상입니다."
                    : "✓ 장내 거래 — 비대주주 비과세 적용. 산출세액까지 정보용으로 표시되며 최종 납부세액은 0."
                  : judgment.isMajor
                    ? "증권시장 밖 양도(블록딜·개인 간 양도 등) — 증권거래세는 법 §8① 본칙 1만분의 35, 농어촌특별세 없음."
                    : "증권시장 밖 양도(블록딜·개인 간 양도 등) — 비대주주여도 양도소득세 과세(§104①11 가목 일반세율)이고, 증권거래세도 법 §8① 본칙입니다."
              }
              tone="emerald"
            />
          )}
      </div>
  );

  /**
   * 대주주 여부는 **입력값에서 자동 산출**된다 — 사용자가 켜고 끄는 스위치가 아니다.
   *
   * 종전에는 ToggleCard였는데, 판정에 필요한 「직전 사업연도 종료일」 입력이 그 카드 **안**에
   * 있었다(ToggleCard는 `{checked && children}`이라 닫히면 렌더조차 되지 않는다).
   * 자동 판정을 켜려면 종료일이 필요한데 그 입력에 닿으려면 토글을 켜야 했고, 토글을 켜려면
   * 대주주 여부를 스스로 판단해야 했다 — 판정 도구가 판정 결과를 먼저 요구하는 구조였다.
   *
   * ⚠️ 외곽 JSX 타입을 **조건부로 바꾸지 말 것**. threshold가 null↔non-null로 전환될 때
   * 트리가 갈리면 DateInput이 언마운트→재마운트되어 입력 도중 포커스를 잃는다
   * (예: "2024-12-3"까지 입력한 순간 day 패딩으로 valid 일자가 되며 커서가 빠짐).
   * 항상 ToneCard 하나로 고정해 전환 자체를 없앤다.
   */
  const judgmentBadge = isAutoJudgmentActive ? (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
        judgment.isMajor ? "bg-violet-600 text-white" : "bg-slate-200 text-slate-700"
      }`}
    >
      {judgment.isMajor ? "\u2713 대주주" : "\u2717 비대주주"}
    </span>
  ) : (
    // 기준일이 없으면 판정값을 지어내지 않는다 — 무엇이 필요한지만 알린다
    <span className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold bg-amber-100 text-amber-800">
      판정 기준일 입력 필요
    </span>
  );

  return (
    <ToneCard
      tone="violet"
      title="대주주 여부 — 자동 판정 (§157 / §167의8①2호)"
      titleExtra={judgmentBadge}
      bodyClassName=""
    >
      <p className="text-xs text-muted-foreground mb-3">
        아래 입력값에서 자동으로 판정됩니다. 기준 조건 충족 여부는 판정 결과 박스에서 확인하세요.
      </p>
      {innerContent}
    </ToneCard>
  );
}
