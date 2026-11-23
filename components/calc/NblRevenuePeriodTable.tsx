"use client";

/**
 * NBL-STATE-HISTORY-E3-② — ⑦ 결과 카드: 업종 영위 기간(개시·폐업)과 과세기간별 수입금액비율 판정표 (UI 계획서 §6 · UQ-8).
 * 입력은 엔진 echo(`periodEvaluation.revenueHistory`)뿐이다 — 영위 기간 토글이 켜져 과세기간별로 판정했을 때만 있고(꺼짐 = 키 부재 = 이 표 없음), 카드가 비율·일수를 새로 계산하지 않는다.
 * 기존 구간표(`NblStateHistoryPeriodTable` — 건축물·재산세 구분)는 건드리지 않는다. 고지(모름 연도·과거 연도 간주임대료·10호 유예 제외 등)는 엔진 `warnings`가 이미 「주의사항」에 싣는다 — 여기서 다시 그리지 않는다.
 *
 * 표시 주의: 연도별 «충족»은 수입금액비율(영 §168의11②)만 본 것이다 — 호별 면적한도·건축물·유예는 계산 결과에서 확정한다. «영위일수»(연환산에 쓰는 초일산입 일수)와
 * «사업용 일수»(통과한 해의 영위 구간 ∩ 소유기간 — 양도일 제외)는 세는 방법이 달라 같은 해에 1일 어긋날 수 있다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { toDate } from "@/lib/api/date-coerce";
import { NBL } from "@/lib/tax-engine/legal-codes";
import type { RevenueHistoryEcho } from "@/lib/tax-engine/non-business-land/revenue-test.types";
import { addDays } from "@/lib/tax-engine/utc-date";

interface Props {
  history: RevenueHistoryEcho;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const pct = (r: number | undefined): string => (r === undefined ? "—" : `${(r * 100).toFixed(2)}%`);
const NUM = "py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap";

/** 반열린 구간 `[start, end)` → «시작일 ~ 마지막 날». */
function rangeText(iv: { start: Date | string; end: Date | string }, key: string): string {
  const start = toDate(iv.start, `${key}.start`);
  return `${iso(start)} ~ ${iso(addDays(toDate(iv.end, `${key}.end`), -1))}`;
}

export function NblRevenuePeriodTable({ history }: Props) {
  const { years, operatingInterval, operatingDays, businessIntervals, businessDays, unknownYears, meets, excludedGrace10 } = history;

  return (
    <div className="px-4 py-3 border-b border-border" data-testid="nbl-revenue-period-result">
      <ToneCard tone="violet" title="기간 분석 — 업종 영위 기간·과세기간별 수입금액비율">
        <p className="text-xs" data-testid="nbl-revenue-period-result-operating">
          {operatingInterval
            ? `소유기간 중 영위 기간 ${rangeText(operatingInterval, "operatingInterval")} (${operatingDays.toLocaleString()}일)`
            : "소유기간 중 영위한 날이 없습니다."}
        </p>
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[40rem] text-xs" data-testid="nbl-revenue-period-result-years">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">과세기간</th>
                <th className="py-1 pr-2 text-right font-medium">영위일수</th>
                <th className="py-1 pr-2 text-right font-medium">연간수입금액(연환산 후)</th>
                <th className="py-1 pr-2 text-right font-medium">당해 비율</th>
                <th className="py-1 pr-2 text-right font-medium">합산 비율(당해+직전)</th>
                <th className="py-1 pr-2 text-right font-medium">기준 비율</th>
                <th className="py-1 pr-2 font-medium">수입금액비율</th>
                <th className="py-1 text-right font-medium">사업용 일수</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.taxYear} data-testid={`nbl-revenue-period-result-year-${y.taxYear}`} className="border-t border-violet-200/60 dark:border-violet-800/60 align-top">
                  <td className="py-1 pr-2 whitespace-nowrap">{y.taxYear}년</td>
                  <td className={NUM}>
                    {y.operatingDays.toLocaleString()}일 / {y.yearDays.toLocaleString()}일
                  </td>
                  <td className={NUM}>{y.annualizedRevenue === undefined ? "—" : y.annualizedRevenue.toLocaleString()}</td>
                  <td className={NUM}>{pct(y.ratioCurrent)}</td>
                  <td className={NUM}>{pct(y.ratioCombined)}</td>
                  <td className={NUM}>{(y.threshold * 100).toFixed(0)}%</td>
                  <td className="py-1 pr-2 whitespace-nowrap" data-testid={`nbl-revenue-period-result-year-${y.taxYear}-verdict`}>
                    {!y.known ? "모름 — 불통과" : y.pass ? "충족" : "미충족"}
                  </td>
                  <td className={`${NUM} pr-0`}>{y.businessDays.toLocaleString()}일</td>
                </tr>
              ))}
              <tr className="border-t border-violet-300 dark:border-violet-700 font-medium" data-testid="nbl-revenue-period-result-total">
                <td className="py-1 pr-2">사업용으로 센 기간</td>
                <td className={NUM}>{operatingDays.toLocaleString()}일</td>
                <td colSpan={5} />
                <td className={`${NUM} pr-0`}>{businessDays.toLocaleString()}일</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-caption text-muted-foreground leading-snug">
          «영위일수»는 연환산에 쓴 일수(양도연도는 양도일 포함)이고 «사업용 일수»는 기간기준({NBL.CRITERIA})에 넣은 일수(수입금액비율을 충족한 해의 영위 기간 ∩ 소유기간, 양도일 제외)입니다 — 같은 해에 1일 차이가 날 수 있습니다.
          «충족»은 수입금액비율만 본 것이고 호별 면적·건축물·유예는 아래 판정 과정에서 확정합니다.
        </p>
        {businessIntervals.length > 0 && (
          <p className="text-xs" data-testid="nbl-revenue-period-result-intervals">
            사업용 구간: {businessIntervals.map((iv, i) => rangeText(iv, `businessIntervals.${i}`)).join(", ")}
          </p>
        )}
        {unknownYears.length > 0 && (
          <p className="text-xs" data-testid="nbl-revenue-period-result-unknown">
            수입금액·토지가액이 입력되지 않아 «모름»으로 불통과 처리한 해: {unknownYears.map((y) => `${y}년`).join(", ")} — 확인 필요.
          </p>
        )}
        {excludedGrace10 && excludedGrace10.length > 0 && (
          <div className="space-y-0.5" data-testid="nbl-revenue-period-result-grace10">
            {excludedGrace10.map((g, i) => (
              <p key={i} className="text-xs">
                「휴·폐업·이전」(10호) 유예(기산일 {iso(toDate(g.anchorDate, `excludedGrace10.${i}.anchorDate`))}) 제외 — 기산일 이전 영위 통산 {g.operatingDaysBefore.toLocaleString()}일이 요구 일수 {g.requiredDays.toLocaleString()}일에 못 미칩니다.
              </p>
            ))}
          </div>
        )}
        <p className="text-xs font-medium" data-testid="nbl-revenue-period-result-verdict">
          사업용 구간 {businessDays.toLocaleString()}일(입력한 유예기간이 있으면 함께 센 것)만으로 본 기간기준({NBL.CRITERIA}): {meets ? "충족" : "미충족"}
        </p>
      </ToneCard>
    </div>
  );
}
