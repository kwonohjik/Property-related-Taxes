import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Article89ExceptionBasisLine } from "@/components/calc/results/shared/Article89ExceptionBasisLine";

/**
 * 부분 비과세(고가주택) 근거 — 어느 특례로 1세대1주택 의제가 성립했는지 남기지 않으면 기준금액 초과분만 과세된 이유를
 * 납세자가 확인할 수 없다. 양도세 결과뷰(`TransferTaxResultView`)와 부담부증여 결과 카드(`BurdenedTransferTaxResultCard`)가
 * 같은 문구를 쓴다(1h-G1-8 — 부담부증여 카드에는 이 근거가 없었다).
 *
 * 🔑 `isPartialExempt`로 가른다(OH-43) — 일반 경로 결과는 `isExempt:false`에 판정의 `exemptReason`을 그대로 싣는다.
 *    §155⑳ 요건 미충족·부수토지 비과세 제외(G-2·G-3)처럼 안분 없이 과세된 결과에서 「초과분에 대해서만 과세」라고 적으면
 *    결과와 모순된다.
 * 기준금액은 엔진 STEP 라벨(`과세 양도차익 (9억 초과분)` 등)에서 읽고, 없으면 `fallbackThresholdLabel`을 쓴다.
 */
export function PartialExemptBasisCard({
  result,
  fallbackThresholdLabel,
  priceLabel = "양도가액",
  className,
}: {
  result: Pick<TransferTaxResult, "isExempt" | "isPartialExempt" | "exemptReason" | "steps" | "article89ExceptionApplied">;
  /** 엔진 STEP 라벨에 기준금액이 없을 때 쓰는 문구(예: 「12억」) */
  fallbackThresholdLabel: string;
  /** 12억 판정에 쓰인 가액의 이름 — 부담부증여는 「증여가액」(소령 §159 해석 B 분모 C) */
  priceLabel?: string;
  className?: string;
}) {
  if (result.isExempt || !result.isPartialExempt || !result.exemptReason) return null;
  // R-c03-03 — 톤은 `ToneCard`(tones.ts 단일 소스)에서 가져온다(인라인 emerald 하드코딩 금지).
  return (
    <ToneCard tone="emerald" title={`1세대1주택 특례 적용 — ${result.exemptReason}`} bodyClassName="space-y-0.5" className={className}>
      <p className="text-xs text-emerald-800 dark:text-emerald-400">
        {priceLabel}{" "}
        {result.steps
          ?.map((st) => st.label?.match(/과세 양도차익 \((\d+억) 초과분\)/)?.[1])
          .find(Boolean) ?? fallbackThresholdLabel}
        원 초과분에 대해서만 과세됩니다 (소득세법 §89①3호·시행령 §160).
      </p>
      {/* §89② 예외(§156의2·§156의3) 근거 — 제목의 사유 문구는 본체 특례만 말한다. */}
      <Article89ExceptionBasisLine applied={result.article89ExceptionApplied} className="text-xs text-emerald-800 dark:text-emerald-400" />
    </ToneCard>
  );
}
