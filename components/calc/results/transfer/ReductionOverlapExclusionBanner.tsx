"use client";

/**
 * 조특법 §127⑦ **중복배제로 적용되지 않은** 감면 후보에 붙는 고지 — 공용 leaf.
 *
 * ## 왜 필요한가
 *
 * 감면 라우터는 후보 중 **가장 큰 것 하나만** 채택하지만(`transfer-tax-reductions-calc.ts`
 * — `candidates.reduce(max)`), 반환하는 detail은 **적격 후보 전부**다. 결과탭은 detail의
 * 존재만 보고 카드를 그렸으므로, 채택되지 않은 감면이 자기 감면세액을 그대로 인쇄했다.
 *
 * 실측(농지 · 자경 §69 + 공익수용 §77 동시 선택): 채택은 자경 100,000,000인데
 * §77 카드가 「⑤ 감면세액 = 65,540,250」을 찍었다. 요약의 감면세액은 100,000,000 한 줄뿐이라
 * 사용자는 §77 65,540,250이 어디로 갔는지 알 수 없고 **두 감면이 합산된 것으로 오독**한다.
 * §127⑦ 배제 사실을 알리는 문구는 카드·요약·경고 어디에도 없었다(결과탭 코드리뷰 #045).
 *
 * 입력 UI가 라디오가 아니라 **독립 체크박스**라(`UnifiedReductionPanel`) 여러 후보를 동시에
 * 고르는 것이 정상 경로다 — 그래서 이 상태는 예외가 아니라 일상이다.
 */

import { reductionTypeLabelOf } from "@/lib/tax-engine/transfer-reduction-type-labels";

export function ReductionOverlapExclusionBanner({ appliedType }: { appliedType: string }) {
  return (
    <div className="mx-2 mt-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
      ⚠ 조세특례제한법 §127⑦ 중복배제 — 아래 감면은 <b>적용되지 않았습니다</b>. 채택된 감면은{" "}
      <b>{reductionTypeLabelOf(appliedType)}</b>입니다.
    </div>
  );
}
