"use client";

/**
 * 상업용건물 부수토지 초과분 — **비사업용 파트(토지분 양도차익 × 초과 면적 비율)** 산출근거 (NBL2611-V5-BX01).
 *
 * `result.commercialNblPart` echo를 그대로 읽는다(재계산 금지). 비사업용 토지는 «토지»뿐이므로(법 §104의3①)
 * 초과 비율은 건물분이 아니라 토지분 양도차익에만 곱하고, 건물분에는 +10%p가 붙지 않는다는 사실을 보인다.
 * 토지·건물 가액 구분은 법 §100② · 영 §166⑥(양도 당시·취득 당시 기준시가 비율)이다.
 */
import type { CommercialNblPartEcho } from "@/lib/tax-engine/types/commercial-appurtenant.types";
import { ToneCard } from "@/components/calc/shared/ToneCard";

const f = (n: number) => n.toLocaleString();

export function CommercialNblPartCard({ part }: { part: CommercialNblPartEcho }) {
  const excessPct = part.totalLandArea100 > 0 ? (part.excessArea100 / part.totalLandArea100) * 100 : 0;
  const share = part.injected.nonBusinessLandPartShare;
  const rows: { label: string; land: number; building: number }[] = [
    { label: "양도가액 (양도 당시 기준시가 비율)", land: part.transferPrice.land, building: part.transferPrice.building },
    { label: "취득가액 (취득 당시 기준시가 비율)", land: part.acquisitionCost.land, building: part.acquisitionCost.building },
    { label: "필요경비", land: part.expenses.land, building: part.expenses.building },
  ];
  return (
    <div data-testid="cb-nbl-part-card">
      <ToneCard tone="rose" title="부수토지 초과분 — 비사업용 파트는 토지분 양도차익에만 적용">
        <div className="text-xs grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1">
          <span className="text-muted-foreground font-medium">구분</span>
          <span className="text-right font-medium">토지분</span>
          <span className="text-right font-medium">건물분</span>
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-mono tabular-nums text-right">{f(r.land)}</span>
              <span className="font-mono tabular-nums text-right">{f(r.building)}</span>
            </div>
          ))}
          <span className="text-muted-foreground font-medium">양도차익</span>
          <span className="font-mono tabular-nums text-right font-semibold" data-testid="cb-nbl-part-land-gain">{f(part.landGain)}</span>
          <span className="font-mono tabular-nums text-right font-semibold" data-testid="cb-nbl-part-building-gain">{f(part.buildingGain)}</span>
        </div>
        <div className="mt-1.5 text-xs grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
          <span className="text-muted-foreground">초과 면적 비율 (초과 {(part.excessArea100 / 100).toLocaleString()}㎡를 집합건물 전체 대지 {(part.totalLandArea100 / 100).toLocaleString()}㎡로 나눈 값)</span>
          <span className="font-mono tabular-nums text-right">{excessPct.toFixed(2)}%</span>
          <span className="text-muted-foreground font-medium">비사업용 파트 양도차익 (토지분 양도차익 × 초과 면적 비율)</span>
          <span className="font-mono tabular-nums text-right font-semibold" data-testid="cb-nbl-part-nbl-gain">{f(part.nonBusinessGain)}</span>
          {share && (
            <>
              <span className="text-muted-foreground">자산 양도차익 {f(part.totalGain)} 중 비사업용 파트 몫 (§104①8호 +10%p 적용 범위)</span>
              <span className="font-mono tabular-nums text-right">{((share.numerator / share.denominator) * 100).toFixed(2)}%</span>
            </>
          )}
        </div>
        <p className="text-caption mt-1.5 leading-snug text-muted-foreground">
          {part.applied
            ? "건물분과 기준면적 이내 토지분은 비사업용 토지가 아니므로 +10%p가 붙지 않습니다 (소득세법 §104의3①, §104⑤ 후단 — 각각 별개의 자산으로 산출세액 계산)."
            : "비사업용 파트에 양도소득이 없어(토지분 양도차손 등) 중과하지 않았습니다."}
          {" "}장기보유특별공제는 아직 자산 단위로 산정합니다 — 2016.1.1. 전 양도분의 비사업용 장특 배제는 건물분·기준면적 이내 토지분에도 걸릴 수 있습니다.
        </p>
      </ToneCard>
    </div>
  );
}
