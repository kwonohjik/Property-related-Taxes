"use client";

/**
 * 가업상속공제 자산 — 부분별 장기보유특별공제 표 (소득세법 §95④ 후단)
 *
 * 계획서: docs/02-design/features/transfer-fb-lthd-portion-gain.ui.plan.md §3.1 (사용자 결정 UQ-1~6 = 전부 ★A)
 *
 * 엔진이 낸 `result.fbLthdDetail`을 **그대로 읽어** 보여 준다 — 신고서·표가 합계를 다시 쪼개 틀린 선례가 있어
 * 이 컴포넌트는 값을 만들지 않는다(차손 부분의 공제 0·12억 초과 안분 후 기준액도 엔진 echo다).
 *
 * 열: 가업상속공제 적용분 / 비적용분 (머리글 비율 = 입력칸·비교 카드와 같은 정수 분수)
 * 행(= 계산 순서): 양도가액 − 필요경비 몫 → 취득가액 항 → (감가상각비) → 양도차익 → (공제 기준액) → 보유기간 → 공제율 → 공제액
 * 합계 행: 양도차익 합계 · (거주기간 공제분) · 장기보유특별공제 합계
 *
 * 엔진 echo는 부분별 양도가액과 필요경비를 따로 싣지 않는다(`netTransferShare` = 둘의 차의 몫) — 한 행으로 보인다.
 * `basis !== "slice_gain"`이면 부분별 양도차익이 없어 그리지 않는다.
 */

import type { ReactNode } from "react";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { formatFractionPercent } from "@/lib/calc/format-fraction-percent";
import type { FbLthdSlice, FbLthdSliceDetail } from "@/lib/tax-engine/types/fb-lthd.types";

interface Props {
  detail: FbLthdSliceDetail;
  /** 엔진이 확정한 장기보유특별공제 총액(`result.longTermHoldingDeduction`) — 열을 더하지 않고 그대로 읽는다 */
  totalDeduction: number;
}

type SliceKey = "applied" | "rest";

const won = (v: number): string => v.toLocaleString("ko-KR");
/** 공제율(소수) → 정수 %. 엔진 문구(`pct`)와 같이 소수 첫째 자리까지만 남긴다. */
const pctText = (rate: number): string => `${+(rate * 100).toFixed(1)}%`;

const NUM = "py-1.5 pr-2 text-right font-mono tabular-nums whitespace-nowrap";
const LABEL = "py-1.5 pl-2 pr-1 text-muted-foreground break-words align-top";

function Cell({ id, slice, children, strong = false, off = false }: { id: string; slice: SliceKey; children: ReactNode; strong?: boolean; off?: boolean }) {
  return (
    <td data-testid={`fb-lthd-${slice}-${id}`} className={`${NUM} ${strong ? "font-semibold" : ""} ${off ? "text-muted-foreground" : ""}`}>
      {off ? "—" : children}
    </td>
  );
}

export function FamilyBusinessLthdPortionTable({ detail, totalDeduction }: Props) {
  if (detail.basis !== "slice_gain") return null;
  const { appliedRateFraction: f, decedentSlice: ds, heirSlice: hs } = detail;
  const pair: Array<[SliceKey, FbLthdSlice]> = [["applied", ds], ["rest", hs]];

  const appliedPct = formatFractionPercent(f.numerator, f.denominator);
  const restPct = formatFractionPercent(f.denominator - f.numerator, f.denominator);

  // 적용률 0%·100%면 한쪽 부분이 없다 — 숨기지 않고 «—»로 둔다(두 열이 항상 있어야 합계가 검증된다).
  const off: Record<SliceKey, boolean> = { applied: f.numerator === 0, rest: f.numerator === f.denominator };
  const isLoss = (s: FbLthdSlice) => s.gain < 0;
  // 감가상각비(§97③)가 있으면 양도차익 = 몫 − (취득가액 항 − 감가상각비 상당)이라 두 행만으로는 안 맞는다 — 항등식으로 그 차이만 보인다.
  const depreciationOf = (s: FbLthdSlice): number => (s.acquisitionTerm ?? 0) + s.gain - (s.netTransferShare ?? 0);
  const showDepreciation = depreciationOf(ds) > 0 || depreciationOf(hs) > 0;
  const showBase = pair.some(([, s]) => s.taxableGain !== Math.max(s.gain, 0));
  const gainSum = ds.gain + hs.gain;
  const lossLabel = detail.lossSlice === "decedent" ? "적용분" : detail.lossSlice === "heir" ? "비적용분" : null;

  return (
    <div className="space-y-2 print:break-inside-avoid" data-testid="fb-lthd-portion-table">
      <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
        장기보유특별공제 — 가업상속공제 적용분·비적용분 (소득세법 §95④ 후단)
      </p>

      <div className="rounded-md border border-border bg-background overflow-hidden">
        <table className="w-full table-fixed border-collapse text-xs [&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-0">
          <colgroup>
            <col style={{ width: "32%" }} />
            <col style={{ width: "34%" }} />
            <col style={{ width: "34%" }} />
          </colgroup>
          <thead>
            <tr className="bg-muted/30">
              <th scope="col" className="py-1.5 pl-2 pr-1 text-left font-semibold text-muted-foreground" />
              <th scope="col" data-testid="fb-lthd-applied-head" className={`py-1.5 pr-2 text-right font-semibold ${off.applied ? "text-muted-foreground" : ""}`}>
                가업상속공제 적용분
                <span className="block font-mono tabular-nums font-normal text-muted-foreground">{appliedPct}%</span>
              </th>
              <th scope="col" data-testid="fb-lthd-rest-head" className={`py-1.5 pr-2 text-right font-semibold ${off.rest ? "text-muted-foreground" : ""}`}>
                비적용분
                <span className="block font-mono tabular-nums font-normal text-muted-foreground">{restPct}%</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={LABEL}>양도가액 − 필요경비 (적용률로 나눈 몫)</td>
              {pair.map(([k, s]) => <Cell key={k} id="net" slice={k} off={off[k]}>{won(s.netTransferShare ?? 0)}</Cell>)}
            </tr>
            <tr>
              <td className={LABEL}>취득가액</td>
              {pair.map(([k, s]) => <Cell key={k} id="term" slice={k} off={off[k]}>{won(s.acquisitionTerm ?? 0)}</Cell>)}
            </tr>
            <tr>
              <td colSpan={3} className="pl-4 pr-2 pb-1 text-caption text-muted-foreground">
                적용분 = 피상속인 취득가액 × 적용률 · 비적용분 = 상속개시일 평가액 × (1 − 적용률)
              </td>
            </tr>
            {showDepreciation && (
              <tr>
                <td className={LABEL}>감가상각비 (취득가액 항에서 차감)</td>
                {pair.map(([k, s]) => <Cell key={k} id="depreciation" slice={k} off={off[k]}>{won(depreciationOf(s))}</Cell>)}
              </tr>
            )}
            <tr className="bg-muted/30">
              <td className={`${LABEL} font-semibold text-foreground`}>양도차익 (음수는 양도차손)</td>
              {pair.map(([k, s]) => <Cell key={k} id="gain" slice={k} strong off={off[k]}>{won(s.gain)}</Cell>)}
            </tr>
            {showBase && (
              <tr>
                <td className={LABEL}>공제 기준액 (12억 초과분 제외 · 차손 부분은 0)</td>
                {pair.map(([k, s]) => <Cell key={k} id="base" slice={k} off={off[k]}>{won(s.taxableGain)}</Cell>)}
              </tr>
            )}
            <tr>
              <td className={LABEL}>보유기간 기산</td>
              <td className={`py-1.5 pr-2 text-right ${off.applied ? "text-muted-foreground" : ""}`}>{off.applied ? "—" : "피상속인 취득일부터"}</td>
              <td className={`py-1.5 pr-2 text-right ${off.rest ? "text-muted-foreground" : ""}`}>{off.rest ? "—" : "상속개시일부터"}</td>
            </tr>
            <tr>
              <td className={LABEL}>보유기간</td>
              {pair.map(([k, s]) => <Cell key={k} id="years" slice={k} off={off[k]}>{s.holdingYears}년</Cell>)}
            </tr>
            <tr>
              <td className={LABEL}>보유기간별 공제율</td>
              {pair.map(([k, s]) => <Cell key={k} id="rate" slice={k} off={off[k]}>{isLoss(s) ? "0%" : pctText(s.holdingRate)}</Cell>)}
            </tr>
            <tr className="bg-muted/30">
              <td className={`${LABEL} font-semibold text-foreground`}>장기보유특별공제액</td>
              {pair.map(([k, s]) => <Cell key={k} id="deduction" slice={k} strong off={off[k]}>{won(s.deduction)}</Cell>)}
            </tr>

            {/* 합계 — 열을 다시 더하지 않고 엔진 값 그대로 */}
            <tr>
              <td className={LABEL}>양도차익 합계</td>
              <td colSpan={2} data-testid="fb-lthd-gain-total" className={NUM}>{won(gainSum)}</td>
            </tr>
            {detail.residenceDeduction > 0 && (
              <tr>
                <td className={LABEL}>거주기간 공제분 (전체 과세 양도차익 기준)</td>
                <td colSpan={2} data-testid="fb-lthd-residence" className={NUM}>{won(detail.residenceDeduction)}</td>
              </tr>
            )}
            <tr className="bg-muted/30">
              <td className={`${LABEL} font-semibold text-foreground`}>장기보유특별공제 합계</td>
              <td colSpan={2} data-testid="fb-lthd-total" className={`${NUM} font-semibold`}>{won(totalDeduction)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {lossLabel && (
        <ToneCard tone="amber" bodyClassName="space-y-1">
          <p data-testid="fb-lthd-loss-note" className="text-xs text-amber-900 dark:text-amber-200">
            {lossLabel}은 양도차손이라 장기보유특별공제를 적용하지 않았습니다(공제 0). 이 처리는 해석례가 확인되지 않아 확인 필요입니다.
          </p>
        </ToneCard>
      )}

      <p className="text-caption text-muted-foreground">
        부분별 양도차익에 그 부분의 보유기간 공제율을 곱한 합계입니다. 공제율을 하나로 합쳐 전체 양도차익에 곱하지 않습니다.
      </p>
    </div>
  );
}
