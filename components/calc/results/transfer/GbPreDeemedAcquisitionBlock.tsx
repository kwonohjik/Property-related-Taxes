"use client";

/**
 * 일반건물 — 의제취득일(1985.1.1.) 전 상속·증여 파트의 취득가액 ①②③ 비교 (PR-4).
 *
 * 엔진 echo `generalBuildingValuationDetail.preDeemedAcquisition`(`general-building-pre-deemed.ts`)이 유일한 소스다.
 * ①② = 소득세법 시행령 §163⑨(본문·단서 §164④·⑤) · ③ = 같은 영 §163⑫ → §176조의2④ → ②2호(환산취득가액).
 * ③이 적용된 파트는 추계라 개산공제(영 §163⑥)가 붙는다 — 그 파트의 산식은 위 안분 표가 환산으로 보여 준다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { PreDeemedCandidateRow } from "./InheritedAcquisitionDetailCard";
import type { GbPreDeemedEcho, GbPreDeemedPartEcho } from "@/lib/tax-engine/types/general-building.types";

const PARTS = [
  { key: "land", label: "토지분", sec164: "② 영 §164④ 가액" },
  { key: "building", label: "건물분", sec164: "② 영 §164⑤ 가액" },
] as const;

export function GbPreDeemedAcquisitionBlock({
  echo,
  share,
}: {
  echo: GbPreDeemedEcho;
  /** 지분 분할(축 B)만 — 지분마다 블록을 하나씩 그리고 제목에 지분 이름을 단다(`gb-fractional-result-blocks.plan.md` Q-3 a). */
  share?: { key: string; name: string };
}) {
  const rows = PARTS.flatMap((p) => {
    const e: GbPreDeemedPartEcho | undefined = echo[p.key];
    return e ? [{ ...p, e }] : [];
  });
  if (rows.length === 0) return null;
  const title = "의제취득일(1985.1.1.) 전 상속·증여 — 취득가액 ①②③ 중 큰 금액";
  return (
    <div data-testid={share ? `gb-pre-deemed-acquisition-${share.key}` : "gb-pre-deemed-acquisition"}>
      <ToneCard tone="emerald" title={share ? `${share.name} — ${title}` : title} bodyClassName="space-y-2">
        <p className="text-xs text-muted-foreground">
          ① 상증법 평가액·② 영 §164 가액 중 큰 금액과 ③ 환산취득가액(양도가액에 의제취득일 기준시가와 양도시 기준시가의 비율을 곱한 금액)을
          비교해 큰 금액을 취득가액으로 봅니다. ③이 적용된 파트는 추계라 개산공제를 더합니다
          (소득세법 시행령 §163⑨·§176조의2④·§163⑥).
        </p>
        {rows.map(({ key, label, sec164, e }) => (
          <div key={key} data-testid={`gb-pre-deemed-${key}`} className="space-y-1 text-xs">
            <p className="font-semibold">{label}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <PreDeemedCandidateRow label="① 상증법 평가액" amount={e.reported} selected={e.adopted === "reported"} />
              <PreDeemedCandidateRow label={sec164} amount={e.sec164} selected={e.adopted === "sec164"} />
              <PreDeemedCandidateRow label="③ 환산취득가액" amount={e.converted} selected={e.adopted === "converted"} />
            </div>
          </div>
        ))}
      </ToneCard>
    </div>
  );
}
