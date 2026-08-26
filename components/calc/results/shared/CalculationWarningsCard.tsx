/**
 * 「확인이 필요한 사항」 카드 — 엔진 `warnings`의 공용 표시 leaf.
 *
 * ## 🔴 왜 뽑았나 (2026-08-26 · R-5 실측)
 *
 * 단건 결과뷰(`TransferTaxResultView`)에는 이 카드가 있는데 **집계 결과뷰 둘에는 없었다** —
 * `MultiTransferTaxResultView`(다건)·`BundledAllocationCard`(일괄양도). 게다가 집계 엔진
 * (`transfer-tax-aggregate.ts`)이 `warnings` 배열을 만들고 **한 번도 채우지 않아**
 * (`warnings.push` 0건) §89② 판정 불가 안내·§155⑦3호 귀농 사후관리·§156의2⑬ 추징 등
 * **모든 단건 경고**가 다건·일괄에서 사라졌다.
 *
 * ⇒ 엔진과 표시를 **함께** 고쳐야 한다. 한쪽만 고치면 no-op이다
 *   (memory `feedback_api_trigger_without_input_path_is_noop`).
 *
 * 문구·색은 단건 카드와 같아야 사용자가 같은 것으로 읽는다 ⇒ 여기가 단일 소스다.
 */

type Props = {
  warnings?: string[];
  /** 인쇄 레이아웃에서 외곽 여백을 조정할 때만 */
  className?: string;
};

export function CalculationWarningsCard({ warnings, className }: Props) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div
      className={
        "rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm space-y-1 dark:border-amber-900/60 dark:bg-amber-950/20" +
        (className ? ` ${className}` : "")
      }
    >
      <p className="font-semibold text-amber-900 dark:text-amber-300">확인이 필요한 사항</p>
      <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800 dark:text-amber-400">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
