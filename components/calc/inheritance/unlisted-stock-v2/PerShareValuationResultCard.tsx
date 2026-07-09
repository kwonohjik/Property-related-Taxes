"use client";

/**
 * PerShareValuationResultCard — 별지 부표3 1쪽 3.1주당 가액 평가 결과 ③~⑨
 *
 * 결과는 useMemo로 evaluateUnlistedStockV2를 실시간 호출하여 표시.
 * 입력 미완성 시 안전한 placeholder.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 * UI Design: docs/02-design/features/inheritance-unlisted-stock-valuation.ui.design.md §7
 */

import { useMemo, useState } from "react";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { parseLawRefsForModal } from "@/lib/utils/law-url";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import type { MergerNetIncomeResult } from "@/lib/tax-engine/types/merger-net-income.types";
import type { AgencyType, EstimatedProfitResult } from "@/lib/tax-engine/property-valuation/estimated-profit-section-56-2";

/** §17의3③ 기관 유형 라벨 (상증규 §17의3③) */
const AGENCY_TYPE_LABEL: Record<AgencyType, string> = {
  credit_rating: "신용평가전문기관",
  accounting: "회계법인",
  tax: "세무법인",
};

/**
 * ⑤ 1주당 순손익가치 hint 빌더 — §56② 추정이익 적용 시 기관 메타 포함
 * capRate는 최상위 UnlistedStockValuationResult.capitalizationRate 주입
 */
function buildEstimatedProfitHint(r: EstimatedProfitResult, capRate: number): string {
  const base = `§56② 추정이익 평균가액 ${r.estimatedProfitAverage.toLocaleString()}원 (기관 ${r.agencyCount}개 평균) ÷ 환원율 ${(capRate * 100).toFixed(0)}%`;
  if (r.agencyMeta && r.agencyMeta.length > 0) {
    const agencyList = r.agencyMeta
      .map((a) => (a.name ? `${AGENCY_TYPE_LABEL[a.type]} ${a.name}` : AGENCY_TYPE_LABEL[a.type]))
      .join(" / ");
    return `${base} — ${agencyList}`;
  }
  return base;
}

export interface PerShareValuationResultCardProps {
  input: UnlistedStockValuationInput;
  /** 섹션 번호 (부모 UnlistedStockV2Card 단일 출처 — 다-섹션 카드 패턴) */
  sectionNum?: number;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

export function PerShareValuationResultCard({ input, sectionNum = 11 }: PerShareValuationResultCardProps) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const result = useMemo(() => {
    try {
      // 최소 입력 검증
      if (!input.totalShares || input.totalShares <= 0) return null;
      if (!input.ownedShares || input.ownedShares <= 0) return null;
      return evaluateUnlistedStockV2(input);
    } catch {
      return null;
    }
  }, [input]);

  if (!result) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-xs text-gray-500">
        입력값을 채우면 평가 결과가 자동 계산됩니다.
      </div>
    );
  }

  // PR-L2: §63② 인용 라벨 — preparationType별 분기 (§63②1호+§57① / §63②2호+§57②, D-1)
  const preIpoIsAssoc = result.preIpoListingResult?.preparationType === "association_registration";
  const preIpoClause = preIpoIsAssoc ? "§63②2호" : "§63②1호";
  const preIpoLaw = preIpoIsAssoc ? "상증법 §63②2호 + 상증령 §57②" : "상증법 §63②1호 + 상증령 §57①";
  const preIpoLabel = preIpoIsAssoc ? "거래소 상장신청·협회 등록 준비" : "기업공개 준비";

  return (
    <div className="rounded-lg border border-indigo-300 bg-indigo-50/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-200 text-caption font-bold text-indigo-800 select-none">{sectionNum}</span>
        <p className="text-sm font-semibold text-indigo-800">1주당 가액의 평가 (별지 1쪽 ③~⑨)</p>
      </div>

      {/* ③·④·⑤·⑥-㉠·㉡·⑥ */}
      <div className="space-y-2 text-xs">
        <ResultRow
          cellNum="③"
          label="순자산가액"
          value={`${fmt(result.netAssetTotal)}원`}
          hint={`영업권 포함 전: ${fmt(result.goodwillCalculation.selfCapital)}원 + 영업권: ${fmt(result.goodwillCalculation.goodwillFinal)}원`}
          law="상증령 §55 ① + §59 ②"
        />
        {/* PR-G2: §59③ 영업권 가중평균 추정이익 준용 안내 (적용 + 영업권>0 시) */}
        {result.estimatedProfitResult?.applied && result.goodwillCalculation.goodwillFinal > 0 && (
          <p
            className="rounded border border-violet-300 bg-violet-50/60 px-3 py-1.5 text-caption text-violet-900"
            data-testid="result-goodwill-section59-3"
          >
            영업권 가중평균 순손익액: §59③ 추정이익 기준 — 추정이익 평균가액{" "}
            {fmt(result.estimatedProfitResult.estimatedProfitAverage)}원 × 발행주식총수{" "}
            {fmt(input.totalShares)}주
          </p>
        )}
        <ResultRow
          cellNum="④"
          label="1주당 순자산가치"
          value={`${fmt(result.netAssetPerShare)}원`}
          hint={
            result.treasuryStockApplied?.purpose === "temporary_holding"
              ? `자기주식을 1주당 평가액으로 재평가한 순자산가치 (자기주식 일시보유)`
              : result.treasuryStockApplied?.purpose === "cancellation"
                ? `= ${fmt(result.netAssetTotal)}원 ÷ ${fmt(result.treasuryStockApplied.effectiveTotalShares)}주 (발행주식총수 − 자기주식)`
                : `= ${fmt(result.netAssetTotal)}원 ÷ ${fmt(input.totalShares)}주 (발행주식총수)`
          }
          law="상증령 §54 ②"
        />
        <ResultRow
          cellNum="⑤"
          label="1주당 순손익가치"
          value={`${fmt(result.netIncomePerShare)}원`}
          hint={
            result.estimatedProfitResult?.applied
              ? buildEstimatedProfitHint(result.estimatedProfitResult, result.capitalizationRate)
              : `최근 3년 가중평균 ${fmt(result.weightedNetIncomePerShare)}원 ÷ 환원율 ${(result.capitalizationRate * 100).toFixed(0)}%`
          }
          law={
            result.estimatedProfitResult?.applied
              ? "상증령 §56 ② + 상증규 §17의3 ①④ (추정이익 갈음)"
              : "상증령 §56 ① + 상증규 §17 (10%)"
          }
        />
        {/* §56② 추정이익 갈음 — 적용/미적용/§59③ 안내 */}
        {input.estimatedProfit && result.estimatedProfitResult && (
          <div
            className={`rounded border px-3 py-2 text-caption ${
              result.estimatedProfitResult.applied
                ? "border-violet-300 bg-violet-50/60 text-violet-900"
                : "border-amber-300 bg-amber-50/60 text-amber-800"
            }`}
            data-testid="result-estimated-profit-notice"
          >
            {result.estimatedProfitResult.applied ? (
              <p className="font-semibold">§56② 추정이익 평균가액으로 순손익가치를 갈음했습니다.</p>
            ) : (
              <p className="font-semibold">
                추정이익 갈음 요건 미충족 — 가중평균 순손익가치를 적용했습니다.
              </p>
            )}
            {result.estimatedProfitResult.warnings.map((w, i) => (
              <p key={i} className="mt-0.5 text-micro leading-snug">
                · {w}
              </p>
            ))}
            {/* 영역 D — evaluationMethod 배지 (차단 아님, 시점 안내) */}
            {result.estimatedProfitResult.evaluationMethod && (
              <div
                className={`mt-1 flex items-center gap-1.5 text-micro ${
                  result.estimatedProfitResult.evaluationMethod === "legacy"
                    ? "text-amber-700"
                    : "text-violet-600"
                }`}
                data-testid="result-evaluation-method-badge"
              >
                <span
                  className={`rounded-sm px-1.5 py-0.5 font-medium border ${
                    result.estimatedProfitResult.evaluationMethod === "legacy"
                      ? "bg-amber-100 border-amber-300 text-amber-700"
                      : "bg-violet-100 border-violet-300 text-violet-700"
                  }`}
                >
                  {result.estimatedProfitResult.evaluationMethod === "legacy" ? "구법 안내" : "현행"}
                </span>
                <span>{result.estimatedProfitResult.evaluationMethodNote}</span>
              </div>
            )}
            {/* 영역 E — agencyMeta 기관 목록 echo (빈 행 필터: 기본값 type + name 빈 제외) */}
            {result.estimatedProfitResult.applied && (() => {
              const shown = (result.estimatedProfitResult.agencyMeta ?? []).filter(
                (a) => a.name.trim() !== "" || a.type !== "credit_rating",
              );
              return shown.length > 0 ? (
                <div className="mt-1 space-y-0.5" data-testid="result-agency-meta-list">
                  {shown.map((a, i) => (
                    <p key={i} className="text-micro leading-snug">
                      · 기관 {i + 1}: {AGENCY_TYPE_LABEL[a.type]} — {a.name || "(기관명 미입력)"}
                    </p>
                  ))}
                </div>
              ) : null;
            })()}
          </div>
        )}
        {/* §17의3② 연환산 echo — 1년 미만 사업연도 있을 때만 표시. 합병 적용 시 대신 합병 명세 카드 표시 (상호 배타) */}
        {!result.mergerApplied && result.annualizationApplied?.some((a) => a) && result.annualizedPerShareNetIncome && (
          <div className="rounded border border-amber-300 bg-amber-50/60 px-3 py-2 space-y-1 text-caption">
            <p className="font-semibold text-amber-800">§17의3② 1년 미만 사업연도 연환산 내역</p>
            {result.annualizationApplied.map((applied, i) => {
              if (!applied) return null;
              const label = i === 0 ? "1년전(×3)" : i === 1 ? "2년전(×2)" : "3년전(×1)";
              const before = result.fiscalYearBreakdowns[i]?.perShareNetIncome ?? 0;
              const after = result.annualizedPerShareNetIncome![i];
              return (
                <div key={i} className="flex items-baseline gap-1 text-amber-900">
                  <span className="font-mono text-micro w-16">{label}</span>
                  <span>1주당 순손익액</span>
                  <span className="font-mono">{fmt(before)}</span>
                  <span>→ ×12/N개월 →</span>
                  <span className="font-mono font-semibold">{fmt(after)}</span>
                  <span className="text-micro text-amber-600">(연환산)</span>
                </div>
              );
            })}
          </div>
        )}

        {/* §56③ 합병 후 3년 미경과 순손익 합산 명세 카드 — mergerApplied=true 시만 표시 */}
        {result.mergerApplied && result.mergerResult && (
          <MergerBreakdownCard mergerResult={result.mergerResult} />
        )}
        <ResultRow
          cellNum="⑥-㉠"
          label="가중평균"
          value={`${fmt(result.weightedAvgPerShare)}원`}
          hint="(⑤ × 3 + ④ × 2) ÷ 5 (일반) 또는 (⑤ × 2 + ④ × 3) ÷ 5 (부동산과다보유)"
          law="상증령 §54 ① 본문"
        />
        <ResultRow
          cellNum="⑥-㉡"
          label="80% 하한"
          value={`${fmt(result.netAssetFloor80)}원`}
          hint={`④ × 80%${result.netAssetFloorApplied ? " (★ 발동)" : ""}`}
          law="상증령 §54 ① 단서"
        />
        <ResultRow
          cellNum="⑥"
          label="1주당 평가액"
          value={`${fmt(result.finalPerShareValue)}원`}
          hint={
            result.preIpoListingResult?.applied
              ? `${preIpoClause} ${preIpoLabel} — MAX(공모가격 ${fmt(result.preIpoListingResult.publicOfferingPrice)}원, 보충적평가 ${fmt(result.preIpoListingResult.supplementaryValue)}원)`
              : `MAX(⑥-㉠, ⑥-㉡)${result.netAssetFloorApplied ? " — 80% 하한 우선" : " — 가중평균 우선"}`
          }
          law={result.preIpoListingResult?.applied ? preIpoLaw : "상증령 §54 ①"}
          emphasized
        />

        {/* 자기주식 보유 — 목적별 평가 내역 (result 필드만 표시, 재계산 금지) */}
        {result.treasuryStockApplied && (
          <div
            className="rounded border border-emerald-300 bg-emerald-50/60 px-3 py-2 text-caption text-emerald-900 space-y-1"
            data-testid="result-treasury-block"
          >
            {result.treasuryStockApplied.purpose === "temporary_holding" ? (
              <>
                <p className="font-semibold">
                  자기주식 일시보유 — 자기참조 평가 (상증령 §54②·§55①)
                </p>
                <p className="leading-snug">
                  자기주식 {fmt(result.treasuryStockApplied.shares)}주를 1주당 평가액으로 재평가해
                  순자산에 가산했습니다 (발행주식총수 {fmt(result.treasuryStockApplied.effectiveTotalShares)}주 유지).
                </p>
                {result.treasuryStockApplied.floor80SelfReferentialApplied && (
                  <p className="leading-snug">
                    손익가치가 낮아 1주당 순자산가치의 80%로 평가 — 순자산가치를 80%로 재계산해
                    {" "}{fmt(result.treasuryStockApplied.floor80NetAssetValue ?? 0)}원의 80%를 1주당 평가액으로 적용 (재재산-616).
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="font-semibold">
                  자기주식 소각·감자 목적 — 발행주식총수 차감 (재산-240)
                </p>
                <p className="leading-snug">
                  발행주식총수에서 자기주식 {fmt(result.treasuryStockApplied.shares)}주를 차감한
                  {" "}{fmt(result.treasuryStockApplied.effectiveTotalShares)}주를 기준으로 1주당 순자산가치·순손익가치를 평가했습니다.
                </p>
              </>
            )}
          </div>
        )}

        {/* PR-L/L2: §63② 기업공개·상장신청 준비 중 평가 — 적용/미적용/§54⑥ 범위 안내 */}
        {input.preIpoListing && result.preIpoListingResult && (
          <div
            className={`rounded border px-3 py-2 text-caption ${
              result.preIpoListingResult.applied
                ? "border-emerald-300 bg-emerald-50/60 text-emerald-900"
                : "border-amber-300 bg-amber-50/60 text-amber-800"
            }`}
            data-testid="result-pre-ipo-notice"
          >
            {result.preIpoListingResult.applied ? (
              <>
                <p className="font-semibold">
                  {preIpoClause} {preIpoLabel} 중 평가 적용 — MAX(공모가격, 보충적평가)
                </p>
                <p className="mt-0.5 text-micro leading-snug">
                  공모가격 {fmt(result.preIpoListingResult.publicOfferingPrice)}원
                  {result.preIpoListingResult.appliedValue ===
                  result.preIpoListingResult.supplementaryValue
                    ? ` ≤ 보충적평가 ${fmt(result.preIpoListingResult.supplementaryValue)}원 → 보충적평가 적용`
                    : ` > 보충적평가 ${fmt(result.preIpoListingResult.supplementaryValue)}원 → 공모가격 적용`}
                </p>
                {input.evaluationCommittee && (
                  <p className="mt-0.5 text-micro leading-snug">
                    ※ §54⑥ 평가심의위 70~130% 범위는 보충적평가({fmt(result.preIpoListingResult.supplementaryValue)}원)
                    기준입니다 (§63② override와 무관).
                  </p>
                )}
              </>
            ) : (
              <p className="font-semibold">
                {preIpoClause} 미적용 — {result.preIpoListingResult.warnings.join(" / ")}
              </p>
            )}
          </div>
        )}

        {/* ⑦·⑧·⑨ 할증평가 */}
        {result.premiumRate > 0 ? (
          <>
            <ResultRow
              cellNum="⑧"
              label="최대주주 할증평가"
              value={`${fmt(result.premiumPerShare)}원`}
              hint={`⑥ × (1 + ${(result.premiumRate * 100).toFixed(0)}%) = ${fmt(result.finalPerShareValue)} × 1.${(result.premiumRate * 100).toFixed(0)}`}
              law="상증법 §63 ③"
            />
          </>
        ) : (
          <>
            <ResultRow
              cellNum="⑦"
              label="비최대주주 1주당 평가액"
              value={`${fmt(result.perShareValueNonMaxShareholder)}원`}
              hint={result.premiumExclusionReason ? `최대주주 할증 배제 사유: ${result.premiumExclusionReason}` : "비최대주주"}
              law="상증법 §63 ③ 본문 + 상증령 §53"
            />
          </>
        )}

        <div className="border-t-2 border-indigo-300 pt-2 mt-2">
          <ResultRow
            cellNum="⑨"
            label="보충적 평가가액"
            value={`${fmt(result.finalPerShareForReporting)}원`}
            hint={result.premiumRate > 0 ? "최대주주 할증 후 ⑧" : "할증 미적용 ⑦"}
            law="상증법 §63 ① 나목 + ③"
            emphasized
          />
          <ResultRow
            cellNum="총"
            label="비상장주식 평가액"
            value={`${fmt(result.totalValuation)}원`}
            hint={`⑨ × 보유 주식수`}
            law=""
            emphasized
          />
        </div>
      </div>

      {/* 영업권 평가 상세 */}
      {result.goodwillCalculation.goodwillFinal > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2 space-y-1 text-caption">
          <p className="font-semibold text-amber-800">영업권 평가 (상증령 §59 ②)</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span>가. 3년 가중평균 순손익액</span>
            <span className="font-mono text-right">{fmt(result.goodwillCalculation.weightedAvg3y)}원</span>
            <span>나. 가 × 50%</span>
            <span className="font-mono text-right">{fmt(result.goodwillCalculation.weightedAvgHalf)}원</span>
            <span>다. 자기자본</span>
            <span className="font-mono text-right">{fmt(result.goodwillCalculation.selfCapital)}원</span>
            <span>마. 다 × {(result.goodwillCalculation.rate * 100).toFixed(0)}% (§19①)</span>
            <span className="font-mono text-right">{fmt(result.goodwillCalculation.selfCapitalRate)}원</span>
            <span>초과이익 (나 − 마)</span>
            <span className="font-mono text-right">{fmt(result.goodwillCalculation.annualExcessProfit)}원</span>
            <span className="font-bold">자. 영업권 평가액</span>
            <span className="font-mono text-right font-bold">{fmt(result.goodwillCalculation.goodwillFinal)}원</span>
          </div>
        </div>
      )}

      {/* §55③ 영업권 배제 안내 */}
      {result.goodwillCalculation.excludedByLaw && (
        <div className="rounded border border-amber-300 bg-amber-100/60 p-2 text-caption text-amber-800">
          ⚠️ 영업권 자동 배제 (상증령 §55 ③) — 사유: {result.goodwillCalculation.excludedByLaw}
        </div>
      )}

      {/* 할증 배제 안내 */}
      {result.premiumExclusionReason && (
        <div className="rounded border border-violet-300 bg-violet-100/60 p-2 text-caption text-violet-800">
          ℹ️ 최대주주 할증평가 배제 — 사유: {result.premiumExclusionReason} (상증령 §53 ⑧)
        </div>
      )}

      {/* 적용 규칙 */}
      {result.appliedRules.length > 0 && (
        <div className="text-micro text-gray-600">
          <button
            type="button"
            onClick={() => setRulesOpen((o) => !o)}
            aria-expanded={rulesOpen}
            className={expandToggleClass("slate")}
          >
            {expandToggleLabel(rulesOpen)} · 적용 규칙 ({result.appliedRules.length}건)
          </button>
          <ul
            className={
              rulesOpen
                ? "list-disc ml-4 mt-1 space-y-0.5"
                : "hidden print:block list-disc ml-4 mt-1 space-y-0.5"
            }
          >
            {result.appliedRules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* PR-E·F (UI 통합 v3) — 자동 판정 결과 echo 라인 */}
      <AutoJudgmentEchoLines input={input} />

      {/* 경고 */}
      {result.warnings.length > 0 && (
        <div className="rounded border border-rose-200 bg-rose-50 p-2 text-caption text-rose-700 space-y-1">
          {result.warnings.map((w, i) => (
            <div key={i}>⚠️ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * §22② 최대주주(금융재산공제 배제) 현황 + §54① 부동산과다 적용 현황 echo
 */
function AutoJudgmentEchoLines({ input }: { input: UnlistedStockValuationInput }) {
  const section22Applied = input.isSection22MajorShareholder === true;

  return (
    <div className="rounded border border-violet-200 bg-violet-50/60 p-2 text-caption space-y-1">
      <p className="font-semibold text-violet-800">판정 결과</p>
      <div className="flex items-baseline gap-2">
        <span className="text-violet-700">§22② 금융재산공제 배제 최대주주:</span>
        <span
          className={
            section22Applied
              ? "rounded bg-violet-600 text-white px-1.5"
              : "rounded bg-slate-300 text-slate-800 px-1.5"
          }
        >
          {section22Applied ? "해당 (금융재산공제 제외)" : "미해당 (포함)"}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-violet-700">§54① 부동산과다보유법인:</span>
        <span
          className={
            input.isRealEstateHeavy
              ? "rounded bg-rose-600 text-white px-1.5"
              : "rounded bg-slate-300 text-slate-800 px-1.5"
          }
        >
          {input.isRealEstateHeavy ? "부동산과다 (가중치 2·3/5)" : "일반법인 (가중치 3·2/5)"}
        </span>
      </div>
    </div>
  );
}

/**
 * §56③ 합병 후 3년 미경과 순손익 합산 명세 카드
 * - amber tone (연환산 카드와 동일 색상 — 상호 배타)
 * - ExpandToggleButton 펼치기/접기
 * - print:block (인쇄 시 항상 노출)
 */
function MergerBreakdownCard({ mergerResult }: { mergerResult: MergerNetIncomeResult }) {
  const [open, setOpen] = useState(false);
  const YEAR_LABELS = ["전1년 (×3)", "전2년 (×2)", "전3년 (×1)"];

  return (
    <div
      className="rounded border border-amber-400 bg-amber-50/70 px-3 py-2 space-y-1 text-caption"
      data-testid="merger-breakdown-card"
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold text-amber-800">§56③ 합병법인 순손익 합산 내역</p>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={expandToggleClass("amber")}
        >
          {expandToggleLabel(open)}
        </button>
      </div>
      <p className="text-micro text-amber-700">
        합병 후 3년 미경과 — 합병법인+피합병법인 순손익 합산 후 합병후 발행주식총수로 나눈 1주당 순손익액 적용
      </p>
      <div
        className={open ? "space-y-2 print:block" : "hidden print:block space-y-2"}
      >
        {mergerResult.breakdown.map((row, i) => (
          <div
            key={i}
            className="rounded border border-amber-200 bg-white/60 p-2 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono tabular-nums"
            data-testid={`merger-breakdown-row-${i}`}
          >
            <span className="col-span-2 font-semibold text-amber-800 not-font-mono text-caption">
              {YEAR_LABELS[i]}
            </span>
            <span className="text-gray-600">합병법인 순손익액</span>
            <span className="text-right">{fmt(row.acquirerNetIncome)}원</span>
            <span className="text-gray-600">피합병 안분 합산액</span>
            <span className="text-right">{fmt(row.targetApportioned)}원</span>
            <span className="text-gray-600">합산 순손익액</span>
            <span className="text-right">{fmt(row.combinedNetIncome)}원</span>
            <span className="text-gray-600">적용 주식수</span>
            <span className="text-right">{fmt(row.sharesUsed)}주</span>
            <span className="font-semibold text-amber-900">1주당 순손익액</span>
            <span className="text-right font-semibold text-amber-900">{fmt(row.perShare)}원</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ResultRowProps {
  cellNum: string;
  label: string;
  value: string;
  hint?: string;
  law: string;
  emphasized?: boolean;
}

function ResultRow({ cellNum, label, value, hint, law, emphasized }: ResultRowProps) {
  return (
    <div className={`grid grid-cols-[3rem_1fr_auto] gap-2 items-baseline py-1 ${emphasized ? "bg-indigo-100/60 rounded px-2" : ""}`}>
      <span className={`font-mono text-caption ${emphasized ? "text-indigo-900 font-bold" : "text-indigo-700"}`}>{cellNum}</span>
      <div>
        <div className={`${emphasized ? "font-bold text-indigo-900" : ""}`}>{label}</div>
        {hint && <div className="text-micro text-gray-500">{hint}</div>}
        {law && (
          <div className="text-micro text-indigo-600 italic flex flex-wrap items-center gap-1">
            <span>{law}</span>
            {parseLawRefsForModal(law).map((r, i) => (
              <LawArticleModal
                key={i}
                legalBasis={`${r.lawName} §${r.articleNum}`}
                label={`§${r.articleNum}`}
              />
            ))}
          </div>
        )}
      </div>
      <span className={`font-mono ${emphasized ? "text-indigo-900 font-bold text-sm" : "text-indigo-800"}`}>
        {value}
      </span>
    </div>
  );
}
