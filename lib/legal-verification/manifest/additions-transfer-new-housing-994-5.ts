/**
 * 검증 매니페스트 추가분 — 조특법 §99의4⑤(삭제된 2019~2020 양도분 특례) · ⑥ 사후관리 (리뷰 NH-51 · NH-80).
 *
 * `additions-transfer-new-housing.ts`는 다른 레인이 같은 시기에 편집하므로 따로 둔다. 상수는
 * `legal-codes/transfer-new-housing-994-para5.ts`(`NEW_99_4_PARA5`).
 *
 * ⑤는 2025.12.23. 개정(법률 제21223호 · 2026.1.1. 시행)으로 삭제돼 현행 본문에 문언이 없다. 구현은 양도일 시행본
 * (2019.04.30. 시행본 MST 208557)의 문언을 따르므로, 여기서는 현행 본문이 «⑤ 삭제»를 유지하는지 감시한다 — 삭제가 되살아나거나
 * 항 번호가 바뀌면 이 규칙이 먼저 깨진다. 키워드는 KoreanLaw MCP로 실독한 현행 본문(조특법 MST 284389 · 조특령 MST 288915,
 * 2026-11-06)의 verbatim 표현이다.
 */

import type { VerificationRule } from "../verifier-types";

export const TRANSFER_NEW_HOUSING_994_5_ADDITIONS: VerificationRule[] = [
  {
    // ⑤ 삭제(2025.12.23.) 유지 + ⑥ 사후관리(3년 미보유 시 납부)
    id: "SPECIAL.NEW_99_4_PARA5_REPEALED_AND_AFTERCARE",
    citation: "조특법 §99의4",
    keywords: [
      "⑤ 삭제 <2025.12.23>",
      "농어촌주택등을 3년 이상 보유하지 아니하게 된 경우에는 과세특례를 적용받은 자가 과세특례를 적용받지 아니하였을 경우 납부하였을 세액에 상당하는 세액",
      "그 보유하지 아니하게 된 날이 속하는 달의 말일부터 2개월 이내에 양도소득세로 납부하여야 한다",
    ],
    keywordMode: "ALL",
  },
  {
    // ⑥ 본문 «대통령령으로 정하는 바에 따라 계산한 세액»(령⑧) · ⑥ 단서 «부득이한 사유»(령⑨)
    id: "TRANSFER_DECREE.NEW_99_4_AFTERCARE_TAX_AND_EXCEPTION",
    citation: "조특령 §99의4",
    keywords: [
      "일반주택을 양도한 시점에서의 당해 일반주택에 대한 「소득세법」 제104조의 규정에 의하여 계산한 세액을 말한다",
      "수용(협의매수를 포함한다), 사망으로 인한 상속 또는 멸실의 사유로 인하여 당해 농어촌주택 또는 고향주택",
    ],
    keywordMode: "ALL",
  },
];
