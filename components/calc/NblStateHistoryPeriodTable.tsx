"use client";

/**
 * NBL-STATE-HISTORY-U2 — ⑦ 결과 카드: 소유기간 중 건축물 유무 이력(일 단위 구간)과 영 §168조의6 기간기준.
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.ui.plan.md §7
 *
 * 입력은 엔진 echo(`periodEvaluation.stateHistory`)뿐이다 — 카드가 소유기간 버킷·창 길이·기준 일수를 추정하지 않는다.
 * 고지 문구는 엔진 `warnings`가 이미 카드의 「주의사항」에 싣는다(여기서 다시 그리지 않는다).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { toDate } from "@/lib/api/date-coerce";
import { NBL } from "@/lib/tax-engine/legal-codes";
import type { StateHistoryEcho } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { StateHistoryIntervalEcho } from "@/lib/tax-engine/non-business-land/land-usage.types";
import { PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/property-tax-type-label";
import { addDays } from "@/lib/tax-engine/utc-date";

interface Props {
  stateHistory: StateHistoryEcho;
  /** 소유기간 일수(Σ 구간 일수) */
  totalOwnershipDays: number;
  /** 사업용으로 본 일수(유예 가산 포함) */
  effectiveBusinessDays: number;
  /** 유예기간 가산(합집합 증가분) */
  gracePeriodDays: number;
  /** 최종 판정 — 기준 충족 여부를 판정이 말한다(echo 수치와 같은 결론이다) */
  isNonBusiness: boolean;
}

const BUCKET_LABEL = {
  1: "5년 이상 — 제1호",
  2: "3년 이상 5년 미만 — 제2호",
  3: "3년 미만 — 제3호",
} as const;

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** 재산세 구분 라벨 — 「모름」(`unknown`)은 종합합산으로 보되 확인 필요임을 밝힌다. */
function taxTypeText(iv: StateHistoryIntervalEcho): string {
  return iv.propertyTaxType === "unknown" ? `${PROPERTY_TAX_TYPE_LABEL.comprehensive}(모름 — 확인 필요)` : PROPERTY_TAX_TYPE_LABEL[iv.propertyTaxType];
}

function businessText(iv: StateHistoryIntervalEcho): string {
  if (iv.days > 0 && iv.businessDays === iv.days) return "사업용";
  return iv.businessDays > 0 ? "일부 사업용" : "비사업용";
}

/** 다목(3호는 나목)의 «100분의 N» — 엔진이 `floor(소유일수 × N ÷ 100)`로 낸 `limitDa`에서 N을 되짚는다(현행 40, 2015.2.3. 전 양도분 20). 가릴 수 없으면 null. */
function nonBizPercentOf(total: number, limitDa: number): 40 | 20 | null {
  if (limitDa === Math.floor((total * 40) / 100)) return 40;
  if (limitDa === Math.floor((total * 20) / 100)) return 20;
  return null;
}

interface CriterionRow {
  key: string;
  clause: string;
  text: string;
  met: boolean;
}

function criterionRows(h: StateHistoryEcho, total: number): CriterionRow[] {
  const c = h.criteria;
  const rows: CriterionRow[] = [];
  const day = (n: number) => `${n.toLocaleString()}일`;
  if (c.limitGa !== null) {
    const bucket1 = c.ownershipBucket === 1;
    const value = bucket1 ? c.nonBizInWindow5 : c.nonBizTotal;
    rows.push({
      key: "ga",
      clause: "가목",
      text: bucket1
        ? `양도일 직전 5년(${day(c.window5Days)}) 중 비사업용 기간 ${day(value)} — 기준 ${day(c.limitGa)} 초과`
        : `소유기간 ${day(total)} 중 비사업용 기간 ${day(value)} — 소유기간에서 ${c.ownershipBucket === 2 ? "3년" : "2년"}을 뺀 기간 ${day(c.limitGa)} 초과`,
      met: value > c.limitGa,
    });
  }
  if (c.limitNa !== null) {
    rows.push({
      key: "na",
      clause: "나목",
      text: `양도일 직전 3년(${day(c.window3Days)}) 중 비사업용 기간 ${day(c.nonBizInWindow3)} — 기준 ${day(c.limitNa)} 초과`,
      met: c.nonBizInWindow3 > c.limitNa,
    });
  }
  const pct = nonBizPercentOf(total, c.limitDa);
  rows.push({
    key: "da",
    clause: c.ownershipBucket === 3 ? "나목" : "다목",
    text: `소유기간 ${day(total)} 중 비사업용 기간 ${day(c.nonBizTotal)} — 소유기간의 ${pct ? `100분의 ${pct}(${day(c.limitDa)})` : day(c.limitDa)} 초과`,
    met: c.nonBizTotal > c.limitDa,
  });
  return rows;
}

export function NblStateHistoryPeriodTable({ stateHistory, totalOwnershipDays, effectiveBusinessDays, gracePeriodDays, isNonBusiness }: Props) {
  const { intervals, criteria } = stateHistory;
  const rows = criterionRows(stateHistory, totalOwnershipDays);
  const businessOnlyDays = effectiveBusinessDays - gracePeriodDays;

  return (
    <div className="px-4 py-3 border-b border-border" data-testid="nbl-state-history-period">
      <ToneCard tone="sky" title="기간 분석 — 소유기간 중 건축물 유무 이력 반영">
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[34rem] text-xs" data-testid="nbl-state-history-intervals">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">구간(시작일 포함 ~ 종료일 전날)</th>
                <th className="py-1 pr-2 text-right font-medium">일수</th>
                <th className="py-1 pr-2 font-medium">건축물</th>
                <th className="py-1 pr-2 font-medium">재산세 구분</th>
                <th className="py-1 pr-2 text-right font-medium">사업용 일수</th>
                <th className="py-1 font-medium">사업용 여부</th>
              </tr>
            </thead>
            <tbody>
              {intervals.map((iv, i) => {
                const start = toDate(iv.start, "start");
                return (
                  <tr key={i} data-testid={`nbl-state-history-interval-${i}`} className="border-t border-sky-200/60 dark:border-sky-800/60 align-top">
                    <td className="py-1 pr-2 font-mono tabular-nums whitespace-nowrap">
                      {iso(start)} ~ {iso(addDays(start, iv.days - 1))}
                    </td>
                    <td className="py-1 pr-2 text-right font-mono tabular-nums">{iv.days.toLocaleString()}일</td>
                    <td className="py-1 pr-2">{iv.hasBuilding ? "있음" : "없음"}</td>
                    <td className="py-1 pr-2">{taxTypeText(iv)}</td>
                    <td className="py-1 pr-2 text-right font-mono tabular-nums">{iv.businessDays.toLocaleString()}일</td>
                    <td className="py-1 whitespace-nowrap">{businessText(iv)}</td>
                  </tr>
                );
              })}
              {gracePeriodDays > 0 && (
                <tr data-testid="nbl-state-history-grace-row" className="border-t border-sky-200/60 dark:border-sky-800/60 align-top">
                  <td className="py-1 pr-2" colSpan={4}>
                    유예기간 가산 ({NBL.UNAVOIDABLE_PERIOD})
                  </td>
                  <td className="py-1 pr-2 text-right font-mono tabular-nums">{gracePeriodDays.toLocaleString()}일</td>
                  <td className="py-1" />
                </tr>
              )}
              <tr data-testid="nbl-state-history-total-row" className="border-t border-sky-300 dark:border-sky-700 font-medium">
                <td className="py-1 pr-2">소유기간</td>
                <td className="py-1 pr-2 text-right font-mono tabular-nums">{totalOwnershipDays.toLocaleString()}일</td>
                <td className="py-1 pr-2" colSpan={2} />
                <td className="py-1 pr-2 text-right font-mono tabular-nums">{effectiveBusinessDays.toLocaleString()}일</td>
                <td className="py-1" />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-caption text-muted-foreground leading-snug">
          «사업용 여부»는 그 구간의 토지가 사업용 토지에 해당하는지이고, 소유기간 전체의 비사업용 여부는 아래 기준으로 판정합니다.
        </p>

        <div className="space-y-1" data-testid="nbl-state-history-criteria">
          <p className="text-xs font-medium">
            소유기간 {totalOwnershipDays.toLocaleString()}일({BUCKET_LABEL[criteria.ownershipBucket]} — {NBL.CRITERIA})에서 사업용으로 본 기간{" "}
            {effectiveBusinessDays.toLocaleString()}일
            {gracePeriodDays > 0 && `(사업용 구간 ${businessOnlyDays.toLocaleString()}일 + 유예기간 가산 ${gracePeriodDays.toLocaleString()}일)`}, 비사업용으로 본 기간{" "}
            {criteria.nonBizTotal.toLocaleString()}일
          </p>
          <ul className="space-y-0.5">
            {rows.map((r) => (
              <li key={r.key} data-testid={`nbl-state-history-criterion-${r.key}`} className="text-xs flex flex-wrap gap-x-1.5">
                <span className="text-muted-foreground">· {r.clause}</span>
                <span className="flex-1 min-w-0">{r.text}</span>
                <span className="font-medium whitespace-nowrap">→ {r.met ? "충족" : "미충족"}</span>
              </li>
            ))}
          </ul>
          <p className="text-caption text-muted-foreground leading-snug" data-testid="nbl-state-history-criteria-verdict">
            위 기준을 모두 충족해야 비사업용입니다 — {isNonBusiness ? "모두 충족해 비사업용으로 봅니다." : "미충족인 기준이 있어 사업용으로 봅니다."}
          </p>
        </div>
      </ToneCard>
    </div>
  );
}
