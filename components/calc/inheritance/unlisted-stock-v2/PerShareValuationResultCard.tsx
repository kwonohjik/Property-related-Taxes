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

import { useMemo } from "react";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

export interface PerShareValuationResultCardProps {
  input: UnlistedStockValuationInput;
  /** 섹션 번호 (부모 UnlistedStockV2Card 단일 출처 — 다-섹션 카드 패턴) */
  sectionNum?: number;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

export function PerShareValuationResultCard({ input, sectionNum = 9 }: PerShareValuationResultCardProps) {
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
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-[12px] text-gray-500">
        입력값을 채우면 평가 결과가 자동 계산됩니다.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-300 bg-indigo-50/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-200 text-[11px] font-bold text-indigo-800 select-none">{sectionNum}</span>
        <p className="text-sm font-semibold text-indigo-800">1주당 가액의 평가 (별지 1쪽 ③~⑨)</p>
      </div>

      {/* ③·④·⑤·⑥-㉠·㉡·⑥ */}
      <div className="space-y-2 text-[12px]">
        <ResultRow
          cellNum="③"
          label="순자산가액"
          value={`${fmt(result.netAssetTotal)}원`}
          hint={`영업권 포함 전: ${fmt(result.goodwillCalculation.selfCapital)}원 + 영업권: ${fmt(result.goodwillCalculation.goodwillFinal)}원`}
          law="상증령 §55 ① + §59 ②"
        />
        <ResultRow
          cellNum="④"
          label="1주당 순자산가치"
          value={`${fmt(result.netAssetPerShare)}원`}
          hint={`= ${fmt(result.netAssetTotal)}원 ÷ ${fmt(result.netAssetTotal > 0 ? Math.round(result.netAssetTotal / result.netAssetPerShare) : 0)}주 (발행주식총수)`}
          law="상증령 §54 ②"
        />
        <ResultRow
          cellNum="⑤"
          label="1주당 순손익가치"
          value={`${fmt(result.netIncomePerShare)}원`}
          hint={
            result.estimatedProfitResult?.applied
              ? `§56② 추정이익 평균가액 ${fmt(result.estimatedProfitResult.estimatedProfitAverage)}원 (기관 ${result.estimatedProfitResult.agencyCount}개 평균) ÷ 환원율 ${(result.capitalizationRate * 100).toFixed(0)}%`
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
            className={`rounded border px-3 py-2 text-[11px] ${
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
              <p key={i} className="mt-0.5 text-[10px] leading-snug">
                · {w}
              </p>
            ))}
          </div>
        )}
        {/* §17의3② 연환산 echo — 1년 미만 사업연도 있을 때만 표시 */}
        {result.annualizationApplied?.some((a) => a) && result.annualizedPerShareNetIncome && (
          <div className="rounded border border-amber-300 bg-amber-50/60 px-3 py-2 space-y-1 text-[11px]">
            <p className="font-semibold text-amber-800">§17의3② 1년 미만 사업연도 연환산 내역</p>
            {result.annualizationApplied.map((applied, i) => {
              if (!applied) return null;
              const label = i === 0 ? "1년전(×3)" : i === 1 ? "2년전(×2)" : "3년전(×1)";
              const before = result.fiscalYearBreakdowns[i]?.perShareNetIncome ?? 0;
              const after = result.annualizedPerShareNetIncome![i];
              return (
                <div key={i} className="flex items-baseline gap-1 text-amber-900">
                  <span className="font-mono text-[10px] w-16">{label}</span>
                  <span>1주당 순손익액</span>
                  <span className="font-mono">{fmt(before)}</span>
                  <span>→ ×12/N개월 →</span>
                  <span className="font-mono font-semibold">{fmt(after)}</span>
                  <span className="text-[10px] text-amber-600">(연환산)</span>
                </div>
              );
            })}
          </div>
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
          hint={`MAX(⑥-㉠, ⑥-㉡)${result.netAssetFloorApplied ? " — 80% 하한 우선" : " — 가중평균 우선"}`}
          law="상증령 §54 ①"
          emphasized
        />

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
        <div className="rounded border border-amber-200 bg-amber-50 p-2 space-y-1 text-[11px]">
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
        <div className="rounded border border-amber-300 bg-amber-100/60 p-2 text-[11px] text-amber-800">
          ⚠️ 영업권 자동 배제 (상증령 §55 ③) — 사유: {result.goodwillCalculation.excludedByLaw}
        </div>
      )}

      {/* 할증 배제 안내 */}
      {result.premiumExclusionReason && (
        <div className="rounded border border-violet-300 bg-violet-100/60 p-2 text-[11px] text-violet-800">
          ℹ️ 최대주주 할증평가 배제 — 사유: {result.premiumExclusionReason} (상증령 §53 ⑧)
        </div>
      )}

      {/* 적용 규칙 */}
      {result.appliedRules.length > 0 && (
        <details className="text-[10px] text-gray-600">
          <summary className="cursor-pointer hover:text-gray-800">적용 규칙 ({result.appliedRules.length}건)</summary>
          <ul className="list-disc ml-4 mt-1 space-y-0.5">
            {result.appliedRules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </details>
      )}

      {/* PR-E·F (UI 통합 v3) — 자동 판정 결과 echo 라인 */}
      <AutoJudgmentEchoLines input={input} />

      {/* 경고 */}
      {result.warnings.length > 0 && (
        <div className="rounded border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700 space-y-1">
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
    <div className="rounded border border-violet-200 bg-violet-50/60 p-2 text-[11px] space-y-1">
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
      <span className={`font-mono text-[11px] ${emphasized ? "text-indigo-900 font-bold" : "text-indigo-700"}`}>{cellNum}</span>
      <div>
        <div className={`${emphasized ? "font-bold text-indigo-900" : ""}`}>{label}</div>
        {hint && <div className="text-[10px] text-gray-500">{hint}</div>}
        {law && <div className="text-[10px] text-indigo-600 italic">{law}</div>}
      </div>
      <span className={`font-mono ${emphasized ? "text-indigo-900 font-bold text-sm" : "text-indigo-800"}`}>
        {value}
      </span>
    </div>
  );
}
