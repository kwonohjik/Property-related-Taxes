"use client";

/**
 * 재산세 토지 — «과세 구분별 세액» 결과 카드 (PSA-E4 echo `PropertyTaxResult.landSplit` 소비).
 *
 * 별도합산 선택 필지는 별도합산분과 종합합산 이관분으로 갈라지고, 각 분류는 «같은 지방자치단체 관할구역» 토지를 합산한
 * 과세표준에 세율을 한 번 적용한 뒤 이 필지 몫만 낸다(「지방세법」 §113①). 그래서 과세표준 섹션의 «이 필지 과세표준 × 세율»은
 * 산출세액과 같지 않다 — 이 카드가 분류별 4단계 산식을 풀어 보여 준다.
 */
import type { ReactNode } from "react";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { PROPERTY_SEPARATE } from "@/lib/tax-engine/legal-codes";
import { propertyDemolishedVerdictLines } from "@/lib/calc/property-demolished-verdict-text";
import {
  PROPERTY_LAND_SPLIT_COMBINED_NOTICE,
  PROPERTY_LAND_SPLIT_DIRECT_CAP_NOTICE,
  PROPERTY_LAND_SPLIT_NO_OTHER_NOTICE,
  PROPERTY_LAND_SPLIT_RECOMPUTE_NOTICE,
  PROPERTY_LAND_SPLIT_TRANSFER_REASON_LABEL,
} from "@/lib/tax-engine/property-land-split-tax";
import type { PropertyLandSplitClass, PropertyTaxResult } from "@/lib/tax-engine/types/property.types";

/** 이 카드가 직접 보여 주는 엔진 고지 — 결과 화면의 «경고» 목록에서는 중복을 피해 뺀다. */
export const LAND_SPLIT_CARD_NOTICES: readonly string[] = [
  PROPERTY_LAND_SPLIT_NO_OTHER_NOTICE,
  PROPERTY_LAND_SPLIT_COMBINED_NOTICE,
  PROPERTY_LAND_SPLIT_DIRECT_CAP_NOTICE,
  PROPERTY_LAND_SPLIT_RECOMPUTE_NOTICE,
];

const AMT = "text-right font-mono tabular-nums whitespace-nowrap";

function won(n: number): string {
  return n.toLocaleString("ko-KR");
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(4).replace(/\.?0+$/, "")}%`;
}

function Line({
  label,
  amount,
  strong = false,
  testId,
}: {
  label: ReactNode;
  amount: string;
  strong?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`flex items-start justify-between gap-3 py-1.5 text-sm ${strong ? "font-semibold" : ""}`}
    >
      <span className="min-w-0">{label}</span>
      <span className={AMT}>{amount}</span>
    </div>
  );
}

/** 한 분류의 4단계 산식 — 합산 가액 → 합산 과세표준 → 합산 산출세액 → 이 필지 몫 */
function ClassFormula({
  testId,
  title,
  c,
  fairMarketRatio,
}: {
  testId: string;
  title: string;
  c: PropertyLandSplitClass;
  fairMarketRatio: number;
}) {
  const ratio = c.combinedValue > 0 ? c.ownValue / c.combinedValue : 0;
  const rateText =
    c.progressiveDeduction > 0
      ? `합산 과세표준 × 세율(${pct(c.appliedRate)}) − 누진공제액(${won(c.progressiveDeduction)})`
      : `합산 과세표준 × 세율(${pct(c.appliedRate)})`;
  return (
    <div data-testid={testId} className="rounded-md border bg-white/60 dark:bg-white/5 px-3 divide-y">
      <p className="py-1.5 text-xs font-semibold">{title}</p>
      <Line label="이 필지 공시가액" amount={won(c.ownValue)} />
      <Line label="+ 같은 관할구역 다른 토지 공시가액 합계 (입력값)" amount={won(c.otherValue)} />
      <Line label="= 합산 공시가액" amount={won(c.combinedValue)} />
      <Line label={`합산 공시가액 × 공정시장가액비율(${pct(fairMarketRatio)}) = 합산 과세표준`} amount={won(c.combinedTaxBase)} />
      <Line label={`${rateText} = 합산 산출세액`} amount={won(c.combinedGrossTax)} />
      <Line
        label={
          <>
            합산 산출세액 ×
            <Frac top="이 필지 공시가액" bottom="합산 공시가액" />
            <span className="whitespace-nowrap">(= {pct(ratio)})</span> = 이 필지 몫
          </>
        }
        amount={won(c.share)}
        strong
      />
    </div>
  );
}

export function PropertyLandSplitCard({ result }: { result: PropertyTaxResult }) {
  const split = result.landSplit;
  if (!split) return null;
  const { separate, comprehensive, cap } = split;
  const fmr = result.fairMarketRatio;
  const isDirect = comprehensive?.transferReasons.includes("direct_type") ?? false;
  const compLabel = isDirect ? "종합합산분 (과세 유형을 종합합산으로 선택)" : "종합합산 이관분";
  const reasons = (comprehensive?.transferReasons ?? []).filter((r) => r !== "direct_type");
  const notices = result.warnings.filter((w) => LAND_SPLIT_CARD_NOTICES.includes(w));
  const bothClasses = Boolean(separate && comprehensive);
  const ownSum = (separate?.ownValue ?? 0) + (comprehensive?.ownValue ?? 0);
  const capAmount = cap ? Math.floor(cap.basisTax * cap.capRate) : undefined;

  return (
    <div data-testid="property-land-split-card">
      <ToneCard
        tone="sky"
        title={`토지 과세 구분별 세액 — ${split.jurisdictionBasis} (지방세법 §113①)`}
        bodyClassName="space-y-3"
      >
        <p className="text-xs text-muted-foreground">
          종합합산·별도합산 토지는 같은 관할구역의 토지 가액을 합한 과세표준에 세율을 한 번 적용하므로, 이 필지 하나의 과세표준에 세율을 곱한 값과
          산출세액이 다릅니다. 이 필지의 세액은 분류별 합산 세액 중 이 필지 몫이며, 이 몫의 합계가 산출세액입니다.
        </p>

        {ownSum !== result.publishedPrice && (
          <p data-testid="land-split-own-value-note" className="text-xs text-muted-foreground">
            이 필지 공시가액은 입력한 공시가격을 면적으로 나눈 ㎡당 단가(원 미만 절사)에 면적을 곱해 분류별로 나눈 값이라, 입력한 공시가격과 원 단위로 다를 수 있습니다.
          </p>
        )}
        {split.demolishedVerdict && (
          <div data-testid="land-split-demolished-verdict" className="rounded-md border bg-white/60 dark:bg-white/5 px-3 divide-y">
            <p className="py-1.5 text-xs font-semibold">철거ㆍ멸실 특례 판정 ({PROPERTY_SEPARATE.DEMOLISHED_GRACE})</p>
            {propertyDemolishedVerdictLines(split.demolishedVerdict).map((l) => (
              <div key={l.key} data-testid={`land-split-demolished-${l.key}`} className="flex items-start justify-between gap-3 py-1.5 text-sm">
                <span className="shrink-0 text-xs text-muted-foreground">{l.label}</span>
                {/* 한글은 글자 단위로 끊기면 «이\n관»처럼 단어가 갈라진다 — 단어(공백) 단위로만 줄바꿈 */}
                <span className="min-w-0 text-right break-keep">{l.text}</span>
              </div>
            ))}
          </div>
        )}
        {separate && (
          <ClassFormula testId="land-split-separate" title="별도합산과세대상분" c={separate} fairMarketRatio={fmr} />
        )}
        {comprehensive && (
          <ClassFormula testId="land-split-comprehensive" title={compLabel} c={comprehensive} fairMarketRatio={fmr} />
        )}

        {reasons.length > 0 && (
          <p data-testid="land-split-reasons" className="text-xs">
            종합합산으로 넘어간 사유: {reasons.map((r) => PROPERTY_LAND_SPLIT_TRANSFER_REASON_LABEL[r]).join(" · ")}
          </p>
        )}

        <div className="rounded-md border bg-white/60 dark:bg-white/5 px-3 divide-y">
          {separate && <Line testId="land-split-row-separate" label="별도합산분 이 필지 몫" amount={won(separate.share)} />}
          {comprehensive && (
            <Line testId="land-split-row-comprehensive" label={`${compLabel} 이 필지 몫`} amount={won(comprehensive.share)} />
          )}
          <Line
            testId="land-split-row-total"
            label={cap ? "합계 (세부담상한 적용 전)" : "합계 = 산출세액"}
            amount={won(split.taxBeforeCap)}
            strong
          />
        </div>

        {cap && capAmount !== undefined && (
          <div data-testid="land-split-cap" className="rounded-md border bg-white/60 dark:bg-white/5 px-3 divide-y">
            <p className="py-1.5 text-xs font-semibold">세부담상한 (지방세법 §122 · 시행령 §118)</p>
            {bothClasses && cap.basisTaxSeparate !== undefined && cap.basisTaxComprehensive !== undefined ? (
              <>
                <Line label="직전연도 별도합산분 세액상당액 (분류별 직전 세율로 재산정)" amount={won(cap.basisTaxSeparate)} />
                <Line label="+ 직전연도 종합합산분 세액상당액 (분류별 직전 세율로 재산정)" amount={won(cap.basisTaxComprehensive)} />
                <Line label="= 직전연도 세액상당액" amount={won(cap.basisTax)} />
              </>
            ) : (
              <Line
                label={
                  result.taxCapMode === "recompute"
                    ? "직전연도 세액상당액 (직전 과세표준 × 직전연도 누진세율)"
                    : "직전연도 부과세액 (직접 입력)"
                }
                amount={won(cap.basisTax)}
              />
            )}
            <Line label={`직전연도 세액상당액 × 상한율(${pct(cap.capRate)}) = 상한액`} amount={won(capAmount)} />
            <Line
              label={cap.applied ? "상한액이 합계보다 작아 상한액을 확정 본세로 함" : "합계가 상한액 이내라 합계를 확정 본세로 함"}
              amount={won(result.determinedTax)}
              strong
              testId="land-split-cap-result"
            />
          </div>
        )}

        {notices.length > 0 && (
          <div data-testid="land-split-notices" className="space-y-1">
            {notices.map((n) => (
              <p key={n} className="text-xs text-amber-800 dark:text-amber-200">
                ⚠ {n}
              </p>
            ))}
          </div>
        )}
      </ToneCard>
    </div>
  );
}
