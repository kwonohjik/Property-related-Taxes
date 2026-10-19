"use client";

/**
 * 주택 split **파트 이월과세**(소득세법 §97의2①) 판정·비교 카드 (P2 C).
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §6
 *
 * 토지·건물 각각에 대해 ① 적용 여부 ② 장기보유특별공제·세율 기산일 ③ 취득가액·필요경비 분해 ④ 증여세 상당액 안분 ⑤ ②3호 적용·미적용 결정세액 비교와 채택을 보인다.
 * 값은 전부 엔진 echo(`splitCarryoverView`)이고 이 카드는 계산하지 않는다. `SplitGainDetailSection` 안에서 렌더하므로 단건·일괄 카드가 같은 화면을 낸다.
 * 산식은 한국어 풀어쓰기 + 숫자 옆 변수명 라벨(약어·`floor()` 금지).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Frac, FLine } from "@/components/calc/results/shared/FormulaParts";
import { InfoRow, ScenarioCol } from "./CarryoverComparisonCard";
import {
  splitCarryoverNotices,
  splitCarryoverView,
  type SplitCarryoverPartView,
  type SplitCarryoverView,
} from "@/lib/tax-engine/transfer-tax-split-carryover-display";
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer-split-gain.types";

const fmt = (n: number) => n.toLocaleString();

function PartBlock({ v, p }: { v: SplitCarryoverView; p: SplitCarryoverPartView }) {
  const tid = `split-carryover-${p.key}`;
  return (
    <div className="space-y-2 rounded-md border border-border p-3" data-testid={tid} data-judgment={p.applied ? "applied" : "excluded"}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">{p.label}</p>
        <span
          className={
            p.applied
              ? "rounded-full bg-emerald-100 px-2 py-0.5 text-caption font-bold text-emerald-700"
              : "rounded-full bg-muted px-2 py-0.5 text-caption font-bold text-muted-foreground"
          }
          data-testid={`${tid}-verdict`}
        >
          {p.verdictLabel}
        </span>
      </div>
      {p.exclusionLabel && (
        <p className="text-caption text-muted-foreground" data-testid={`${tid}-exclusion`}>
          미적용 사유: {p.exclusionLabel}
        </p>
      )}

      <div className="space-y-1">
        {/* «장특 기산일» — 위 분리 양도차익 표의 보유연수·장특공제율이 이 날부터 센 값이다(testid는 `split-card-lthd-start-*`). */}
        <div data-testid={`split-card-lthd-start-${p.key}`}>
          <InfoRow label={`장기보유특별공제 기산일 [${p.lthdStartLabel}]`} value={p.lthdStartDate} />
        </div>
        {/* «세율 기산일» — 엔진이 파트별 기산일로 세율을 판정했을 때만. 주택 토지 파트는 장특 기산일과 다를 수 있다(주택부수토지로서의 보유기간). */}
        {p.rateBasisDate && (
          <div data-testid={`split-card-rate-basis-${p.key}`}>
            <InfoRow label="세율 기산일 [소득세법 §104②]" value={p.rateBasisDate} />
            {p.rateBasisNote && <p className="pl-2 text-micro text-muted-foreground">* {p.rateBasisNote}</p>}
          </div>
        )}
        <InfoRow label={p.applied ? "취득가액 [증여자 취득가액]" : "취득가액 [증여 신고가액]"} value={fmt(p.acquisitionValue)} />
        {p.applied && p.donorCapexAdded > 0 && <InfoRow label="필요경비 가산 [증여자 자본적지출 — §97의2①2호]" value={`+${fmt(p.donorCapexAdded)}`} sub />}
        {p.applied && p.giftTaxAdded > 0 && (
          <InfoRow label={`필요경비 가산 [증여세 상당액 — §97의2①3호]${p.giftTaxLimitApplied ? " (한도 적용)" : ""}`} value={`+${fmt(p.giftTaxAdded)}`} sub />
        )}
        {p.donorCapexGuardApplied && (
          <p className="pl-2 text-micro text-amber-700">* 양도일이 2024.1.1. 전이라 증여자 자본적지출은 0으로 처리했습니다 (§97의2①2호 시행일)</p>
        )}
      </div>

      {/* 증여세 상당액 안분(영 §163의2②) — 산출세액 × 해당 자산가액 ÷ 증여세 과세가액. 숫자 옆에 변수명. */}
      <div className="space-y-0.5 text-caption text-muted-foreground" data-testid={`${tid}-apportion`}>
        <span className="block font-medium text-foreground/80">증여세 상당액 안분 (시행령 §163의2②)</span>
        <FLine>
          증여세 상당액 = 증여세 산출세액 {fmt(v.giftTaxCalculated)} ×{" "}
          <Frac top={`${p.label} 증여 신고가액 ${fmt(p.giftDateValuation)}`} bottom={`증여세 과세가액 ${fmt(v.giftTaxBase)}`} /> ={" "}
          <span className="font-mono tabular-nums" data-testid={`${tid}-apportioned`}>{fmt(p.giftTaxApportioned)}</span>
        </FLine>
        {p.applied && p.giftTaxLimitApplied && (
          <FLine>
            한도 = {p.label} 양도차익(증여세 가산 전) <span className="font-mono tabular-nums">{fmt(p.giftTaxLimitCap)}</span> → 필요경비 가산{" "}
            <span className="font-mono tabular-nums">{fmt(p.giftTaxAdded)}</span> (한도 적용)
          </FLine>
        )}
        {!p.applied && <FLine>이월과세를 적용하지 않아 필요경비에 가산하지 않았습니다.</FLine>}
      </div>

      {p.comparison && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid={`${tid}-comparison`}>
          <ScenarioCol label="[A] 이월과세 적용" adopted={p.applied} determinedTax={p.comparison.withCarryover} filingUnit compared>
            <p className="text-micro text-muted-foreground">신고 전체 결정세액 (이 파트만 적용)</p>
          </ScenarioCol>
          <ScenarioCol label="[B] 이월과세 미적용" adopted={!p.applied} determinedTax={p.comparison.without} filingUnit compared>
            <p className="text-micro text-muted-foreground">신고 전체 결정세액 (이 파트만 미적용)</p>
          </ScenarioCol>
        </div>
      )}
    </div>
  );
}

export function SplitCarryoverComparisonCard({ splitDetail }: { splitDetail: SplitGainResult }) {
  const v = splitCarryoverView(splitDetail);
  if (!v) return null;
  const notices = splitCarryoverNotices(v);
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/30 p-4 dark:border-amber-800 dark:bg-amber-900/10" data-testid="split-carryover-card">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">이월과세(증여) — 토지·건물 파트별 판정</p>
        <span className="text-caption text-muted-foreground">소득세법 §97의2①·②3호</span>
      </div>
      <p className="text-caption text-muted-foreground" data-testid="split-carryover-event">
        증여 등기접수일 {v.giftRegistryDate} · 적용기간 {v.periodYears}년 · 증여세 산출세액 {fmt(v.giftTaxCalculated)} · 증여세 과세가액 {fmt(v.giftTaxBase)}
      </p>
      <div className="grid grid-cols-1 gap-3">
        {v.parts.map((p) => (
          <PartBlock key={p.key} v={v} p={p} />
        ))}
      </div>
      <ToneCard tone="amber" bodyClassName="space-y-1">
        <p className="text-caption font-semibold text-amber-900">확인 필요</p>
        {notices.map((n, i) => (
          <p key={i} className="text-caption text-amber-900" data-testid={`split-carryover-notice-${i}`}>
            {n}
          </p>
        ))}
      </ToneCard>
    </div>
  );
}
