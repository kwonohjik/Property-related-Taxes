"use client";

/**
 * 토지·건물 분리 카드의 **배율 초과 부수토지(비사업용 토지) 파트** 표시 — `splitDetail.nonBusinessLandPart` echo를 그대로 읽는다.
 *
 * 분리 카드의 열(토지·건물)은 「양도차익」만 초과분을 포함한 토지 전체 값이고 「과세 양도차익」·「장특공제액」은 기준면적 이내 토지분이다.
 * 초과분은 「소득세법」 제104조 제5항 본문 후단에 따라 별개 자산으로 보아 전액 과세하므로(§104조의3 ①5호) 그 값을 이 블록이 따로 보인다 —
 * 이 블록이 없으면 열 값을 모두 더해도 자산의 과세 양도차익·장기보유특별공제와 맞지 않는다. 값을 새로 계산하지 않는다(재계산 금지).
 */
import type { SplitNonBusinessLandPart } from "@/lib/tax-engine/types/transfer-split-gain.types";
import { NBL } from "@/lib/tax-engine/legal-codes";
import { ToneCard } from "@/components/calc/shared/ToneCard";

export function SplitNonBusinessLandBlock({ nb }: { nb: SplitNonBusinessLandPart }) {
  const f = (n: number) => n.toLocaleString();
  const taxable = nb.taxableGainAfterProration ?? nb.gain;
  return (
    // `ToneCard`는 `data-testid`를 DOM으로 흘리지 않는다 — 래퍼 div에 단다.
    <div data-testid="split-card-nb-part">
      <ToneCard tone="amber" title="배율 초과 부수토지 — 비사업용 토지로 분리해 전액 과세" className="mt-1">
        <div className="text-xs grid grid-cols-[1fr_auto] gap-x-2 gap-y-1">
          <span className="text-muted-foreground">인정 한도 면적 (정착면적 × {nb.appliedMultiplier}배)</span>
          <span className="font-mono tabular-nums text-right">{nb.limitArea}㎡</span>
          <span className="text-muted-foreground">초과 면적</span>
          <span className="font-mono tabular-nums text-right">{nb.excessArea}㎡</span>
          <span className="text-muted-foreground">과세 양도차익 (12억 안분 없음)</span>
          <span className="font-mono tabular-nums text-right" data-testid="split-card-nb-taxable">{f(taxable)}</span>
          <span className="text-muted-foreground">장기보유특별공제 (표1 · 토지 보유 {nb.holdingYears}년 · 공제율 {Math.round(nb.longTermRate * 100)}%)</span>
          <span className="font-mono tabular-nums text-right" data-testid="split-card-nb-lthd">{f(nb.longTermDeduction)}</span>
          <span className="text-muted-foreground font-medium">양도소득금액</span>
          <span className="font-mono tabular-nums text-right font-semibold" data-testid="split-card-nb-income">{f(taxable - nb.longTermDeduction)}</span>
        </div>
        <p className="text-caption mt-1.5 leading-snug text-muted-foreground">
          위 표의 「양도차익」 토지 열에는 이 초과분의 양도차익 {f(nb.gain)}이 들어 있고, 「과세 양도차익」·「장특공제액」 토지 열은 기준면적 이내 토지분입니다 ({NBL.MAIN} ①5호).
        </p>
      </ToneCard>
    </div>
  );
}
