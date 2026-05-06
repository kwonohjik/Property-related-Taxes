"use client";

/**
 * 장기임대주택 보유자 거주주택 비과세 특례 결과 상세 카드 (소령 §155⑳)
 *
 * ⑦ 결과 카드 산식 — 한국어 풀어쓰기, 변수 약어·floor()·"원" 끝 금지.
 *
 * 표기 원칙:
 * - 변수 약어 금지: r161_1 → "§161① 안분 비율"
 * - floor() 표기 금지 (묵시 처리)
 * - 숫자 끝 "원" 표기 금지
 * - 중간 산술 결과 미표시
 * - 각 숫자 옆 변수명 라벨 표시
 */

import type { RentalHousingExceptionResult } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

interface Props {
  detail: RentalHousingExceptionResult;
}

function formatN(n: number): string {
  return n.toLocaleString();
}

function ScenarioBadge({ id }: { id: RentalHousingExceptionResult["scenarioId"] }) {
  const labels: Record<string, string> = {
    "RH-A1": "거주주택 양도 (12억원 이하)",
    "RH-A2": "거주주택 양도 (고가주택 12억원 초과)",
    "RH-B1": "임대→거주 전환 주택 양도 (12억원 이하)",
    "RH-B2": "임대→거주 전환 주택 양도 (고가주택 12억원 초과)",
  };
  return (
    <span className="text-xs rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 px-2 py-0.5 font-medium">
      {labels[id] ?? id}
    </span>
  );
}

export function RentalHousingExceptionDetailCard({ detail }: Props) {
  const { scenarioId, taxableGain, exemptGain, appliedTable, formulaTrace } = detail;
  const isScenarioB = scenarioId === "RH-B1" || scenarioId === "RH-B2";

  // ── 미적용 분기 (요건 미충족) ───────────────────────────────────
  if (!detail.applied) {
    const residenceFails = detail.eligibility.residenceFailReasons;
    const unitFails = detail.eligibility.failReasons;
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50/80 dark:border-amber-700/50 dark:bg-amber-950/30 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            장기임대주택 거주주택 비과세 특례 — 적용 불가
          </p>
          <span className="text-[10px] text-amber-800 dark:text-amber-400">
            소득세법 시행령 제155조 제20항
          </span>
        </div>

        <div className="rounded border border-amber-200 bg-white/70 dark:border-amber-800/40 dark:bg-amber-950/40 p-2.5 space-y-1.5">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            미충족 사유
          </p>
          {residenceFails.length > 0 && (
            <ul className="text-xs text-amber-900 dark:text-amber-200 space-y-0.5 pl-4 list-disc">
              {residenceFails.map((r, i) => (
                <li key={`res-${i}`}>{r}</li>
              ))}
            </ul>
          )}
          {unitFails.length > 0 && (
            <ul className="text-xs text-amber-900 dark:text-amber-200 space-y-0.5 pl-4 list-disc">
              {unitFails.map((r, i) => (
                <li key={`unit-${i}`}>{r.message}</li>
              ))}
            </ul>
          )}
          {residenceFails.length === 0 && unitFails.length === 0 && (
            <p className="text-xs text-amber-900 dark:text-amber-200">
              특례 적용 요건이 충족되지 않았습니다.
            </p>
          )}
        </div>

        <p className="text-xs text-amber-800 dark:text-amber-300">
          특례가 적용되지 않아 일반 양도소득세 산식으로 계산되었습니다. 요건을 충족하려면 보유 상황 단계에서 거주주택의 거주기간(2년 이상)과 임대주택 정보를 정확히 입력해 주세요.
        </p>
      </div>
    );
  }

  // ── 적용 분기 (기존 로직) ───────────────────────────────────────
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/50 dark:border-violet-800/40 dark:bg-violet-950/20 p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">
          장기임대주택 보유자 거주주택 비과세 특례
        </p>
        <ScenarioBadge id={scenarioId} />
        <span className="text-[10px] text-muted-foreground">소득세법 시행령 §155⑳</span>
      </div>

      {/* 요건 판정 */}
      <div className="rounded border border-violet-200 bg-violet-50/80 dark:border-violet-800/30 dark:bg-violet-950/30 p-2.5 space-y-1">
        <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">요건 판정</p>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${detail.eligibility.passed ? "text-emerald-700" : "text-rose-700"}`}>
            {detail.eligibility.passed ? "✓ 요건 충족" : "✗ 요건 미충족"}
          </span>
        </div>
        {detail.eligibility.residenceFailReasons.length > 0 && (
          <ul className="text-xs text-muted-foreground space-y-0.5 pl-3 list-disc">
            {detail.eligibility.residenceFailReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
        {detail.eligibility.failReasons.length > 0 && (
          <ul className="text-xs text-muted-foreground space-y-0.5 pl-3 list-disc">
            {detail.eligibility.failReasons.map((r, i) => (
              <li key={i}>{typeof r === "string" ? r : `임대주택 요건 미충족`}</li>
            ))}
          </ul>
        )}
      </div>

      {/* B 시나리오 안분 산식 (소득세법 시행령 제161조 제1항) */}
      {isScenarioB && formulaTrace.ratio161_1 !== undefined && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">
            과세 안분 비율 (소득세법 시행령 제161조 제1항)
          </p>
          <div className="rounded bg-white/70 dark:bg-white/5 border border-violet-100 dark:border-violet-800/30 p-2.5 text-xs space-y-1.5">
            <p className="text-muted-foreground">
              안분 비율 = (직전 거주주택 양도 당시 기준시가 − 취득 당시 기준시가)
              ÷ (현 양도 당시 기준시가 − 취득 당시 기준시가)
            </p>
            <p className="font-mono font-semibold text-violet-900 dark:text-violet-200">
              = {(formulaTrace.ratio161_1 * 100).toFixed(4)}%
            </p>

            {/* 장기보유공제(일반표) 적용 후 양도소득금액 */}
            <div className="border-t border-violet-100 dark:border-violet-800/30 pt-1.5 mt-1.5">
              <p className="text-muted-foreground">
                장기보유특별공제(일반표) 적용 후 양도소득금액:
                {" "}<span className="font-mono text-foreground">{formatN(formulaTrace.gain95Table1)}</span>
              </p>
            </div>

            {/* 과세대상 양도소득금액 산식 */}
            <div className="border-t border-violet-100 dark:border-violet-800/30 pt-1.5 mt-1.5">
              <p className="text-muted-foreground">
                과세대상 양도소득금액
                {" "}= 장기보유공제 적용 후 양도소득금액{" "}
                <span className="font-mono text-foreground">{formatN(formulaTrace.gain95Table1)}</span>
                {" "}× 과세 안분 비율{" "}
                <span className="font-mono text-foreground">{(formulaTrace.ratio161_1 * 100).toFixed(4)}%</span>
              </p>
              <p className="font-mono font-semibold text-violet-900 dark:text-violet-200 mt-0.5">
                = {formatN(taxableGain)}
              </p>
            </div>

            {/* 상한 적용 (소득세법 시행령 제161조 제3항) */}
            {formulaTrace.capApplied && (
              <div className="rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-1.5 text-xs text-amber-800 dark:text-amber-300">
                상한 적용(시행령 제161조 제3항) — 과세대상 양도소득금액이 장기보유공제 적용 후 양도소득금액을 초과하여 그 금액으로 제한됨
              </div>
            )}
          </div>
        </div>
      )}

      {/* 고가주택 과세 비율 — 시나리오별 근거 분리 */}
      {(scenarioId === "RH-A2" || scenarioId === "RH-B2") &&
       formulaTrace.ratioHighValue !== undefined && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">
            고가주택 과세 비율
            {scenarioId === "RH-A2" && (
              <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                (소득세법 시행령 제159조의4 — 1세대 1주택 고가주택)
              </span>
            )}
            {scenarioId === "RH-B2" && (
              <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                (소득세법 시행령 제161조 제2항 제2호 적용)
              </span>
            )}
          </p>
          <div className="rounded bg-white/70 dark:bg-white/5 border border-violet-100 dark:border-violet-800/30 p-2.5 text-xs text-muted-foreground">
            <p>
              과세 비율 = (양도가액 − 12억원) ÷ 양도가액
              {" "}= <span className="font-mono text-foreground font-semibold">
                {(formulaTrace.ratioHighValue * 100).toFixed(4)}%
              </span>
            </p>
          </div>
        </div>
      )}

      {/* 고가주택 임대→거주 전환 주택 양도 — 1호·2호 합산 산식 */}
      {scenarioId === "RH-B2" &&
       formulaTrace.ratio161_2_2 !== undefined &&
       formulaTrace.part1 !== undefined &&
       formulaTrace.part2 !== undefined && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">
            과세대상 양도소득금액 산정
            <span className="ml-1 text-[10px] text-muted-foreground font-normal">
              (소득세법 시행령 제161조 제2항)
            </span>
          </p>
          <div className="rounded bg-white/70 dark:bg-white/5 border border-violet-100 dark:border-violet-800/30 p-2.5 text-xs space-y-2">
            {/* 1호 — 직전 거주주택 양도일 이전 보유분 (일반표) */}
            <div className="space-y-1">
              <p className="text-muted-foreground font-medium">
                직전 거주주택 양도일 이전 보유분 (장기보유특별공제 일반표 적용)
              </p>
              <p className="text-muted-foreground pl-2">
                = 장기보유공제(일반표) 적용 후 양도소득금액{" "}
                <span className="font-mono text-foreground">{formatN(formulaTrace.gain95Table1)}</span>
                {" "}× 안분 비율{" "}
                <span className="font-mono text-foreground">
                  {((formulaTrace.ratio161_1 ?? 0) * 100).toFixed(4)}%
                </span>
              </p>
              <p className="font-mono font-semibold text-violet-900 dark:text-violet-200 pl-2">
                = {formatN(formulaTrace.part1)} (1호 과세대상)
              </p>
            </div>

            {/* 2호 — 직전 거주주택 양도일 이후 보유분 (1세대1주택표 + 고가주택 비율) */}
            <div className="border-t border-violet-100 dark:border-violet-800/30 pt-2 space-y-1">
              <p className="text-muted-foreground font-medium">
                직전 거주주택 양도일 이후 보유분 (1세대1주택 장기보유특별공제표 + 고가주택 비율 적용)
              </p>
              <p className="text-muted-foreground pl-2">
                장기보유공제(1세대1주택표) 적용 후 양도소득금액{" "}
                <span className="font-mono text-foreground">{formatN(formulaTrace.gain95Table2)}</span>
              </p>
              <p className="text-muted-foreground pl-2">
                × 이후 보유분 안분 비율{" "}
                <span className="font-mono text-foreground">
                  {(formulaTrace.ratio161_2_2 * 100).toFixed(4)}%
                </span>
                {" "}× 고가주택 과세 비율{" "}
                <span className="font-mono text-foreground">
                  {((formulaTrace.ratioHighValue ?? 0) * 100).toFixed(4)}%
                </span>
              </p>
              <p className="font-mono font-semibold text-violet-900 dark:text-violet-200 pl-2">
                = {formatN(formulaTrace.part2)} (2호 과세대상)
              </p>
            </div>

            {/* 합산 */}
            <div className="border-t border-violet-100 dark:border-violet-800/30 pt-2">
              <p className="text-muted-foreground">
                과세대상 양도소득금액 = 1호{" "}
                <span className="font-mono text-foreground">{formatN(formulaTrace.part1)}</span>
                {" "}+ 2호{" "}
                <span className="font-mono text-foreground">{formatN(formulaTrace.part2)}</span>
              </p>
              <p className="font-mono font-semibold text-violet-900 dark:text-violet-200 mt-0.5">
                = {formatN(taxableGain)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 적용 법령 조문 */}
      {detail.eligibility.laws.length > 0 && (
        <div className="text-[10px] text-muted-foreground border-t border-violet-100 dark:border-violet-800/30 pt-2">
          적용 법령: {detail.eligibility.laws.join(" · ")}
        </div>
      )}

      {/* 적용 장기보유특별공제 표 */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>적용 장기보유특별공제:</span>
        <span className="font-medium text-foreground">
          {appliedTable === "table-1" && "일반 장기보유특별공제표 (소득세법 제95조 제2항)"}
          {appliedTable === "table-2" && "1세대 1주택 장기보유특별공제표 (소득세법 제95조 제2항)"}
          {appliedTable === "mixed" && "일반표·1세대 1주택표 혼합 적용 (시행령 제161조 제4항)"}
        </span>
      </div>

      {/* 과세 / 비과세 양도소득금액 요약 — 양도소득금액(§95①) 단계에서 분리 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-rose-200 bg-rose-50/60 dark:border-rose-800/30 dark:bg-rose-950/20 p-2.5 text-center">
          <p className="text-[10px] text-rose-700 dark:text-rose-400 font-medium">과세대상 양도소득금액</p>
          <p className="text-sm font-mono font-semibold text-rose-900 dark:text-rose-200 mt-0.5">
            {formatN(taxableGain)}
          </p>
        </div>
        <div className="rounded border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/30 dark:bg-emerald-950/20 p-2.5 text-center">
          <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">비과세 양도소득금액 (시행령 §161①)</p>
          <p className="text-sm font-mono font-semibold text-emerald-900 dark:text-emerald-200 mt-0.5">
            {formatN(exemptGain)}
          </p>
        </div>
      </div>
    </div>
  );
}
