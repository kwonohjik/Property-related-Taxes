import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

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
  result: Pick<TransferTaxResult, "isExempt" | "isPartialExempt" | "exemptReason" | "steps">;
  /** 엔진 STEP 라벨에 기준금액이 없을 때 쓰는 문구(예: 「12억」) */
  fallbackThresholdLabel: string;
  /** 12억 판정에 쓰인 가액의 이름 — 부담부증여는 「증여가액」(소령 §159 해석 B 분모 C) */
  priceLabel?: string;
  className?: string;
}) {
  if (result.isExempt || !result.isPartialExempt || !result.exemptReason) return null;
  return (
    <div
      className={
        "rounded-lg border border-emerald-300 bg-emerald-50/60 p-3 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/20" +
        (className ? ` ${className}` : "")
      }
    >
      <p className="font-semibold text-emerald-900 dark:text-emerald-300">
        1세대1주택 특례 적용 — {result.exemptReason}
      </p>
      <p className="text-xs text-emerald-800 dark:text-emerald-400 mt-0.5">
        {priceLabel}{" "}
        {result.steps
          ?.map((st) => st.label?.match(/과세 양도차익 \((\d+억) 초과분\)/)?.[1])
          .find(Boolean) ?? fallbackThresholdLabel}
        원 초과분에 대해서만 과세됩니다 (소득세법 §89①3호·시행령 §160).
      </p>
    </div>
  );
}
