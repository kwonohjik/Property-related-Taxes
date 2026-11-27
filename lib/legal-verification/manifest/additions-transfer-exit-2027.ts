/**
 * 검증 매니페스트 추가분 — 국외전출세 2027.1.1. 개정(소득세법 §118의9·§118의11, 시행령 §178의8·§178의9, 지방세법 §103의3)
 *
 * 상수: `STOCK_EXIT_TAX_2027.*` (`legal-codes/stock-exit-tax-2027.ts`).
 *
 * ── 왜 전 규칙이 `basis: "announced"`인가 ──────────────────────────────────
 * 아래 문언은 모두 **2027.1.1. 시행예정 개정문**이다(소득세법 부칙 제21221호 제1조 2호 · 시행령 제36129호 ·
 * 지방세법 제21308호). 현행 시행본에는 없어 enforced 기준으로 대조하면 반드시 실패하므로 공포본(MST 경로)으로
 * 대조한다(`verifier.ts` — announced만 MST 경로). 선례: `additions-transfer-decree.ts`의
 * `TRANSFER_DECREE.EXPATRIATE_MAJOR_SHAREHOLDER`. ⇒ **2027.1.1. 시행 후 enforced로 되돌릴 것(계획서 PR-8).**
 *
 * 키워드는 KoreanLaw MCP로 **2027.1.1. 시행본**을 조회한 본문(2026-11-27)에서 verbatim으로 뽑았다.
 *   · 소득세법: `get_law_text(lawId=001565, efYd=20270101)` — 본문에 `<개정 2025.12.23>` 표시 확인
 *   · 시행령: `lawId=003956, efYd=20270101` → MST 283631(공포 제36129호)로 폴백됨. MST 290841을 efYd 없이
 *     조회해도 같은 개정 문언이 나오지만, 종전/개정 판정은 `efYd`만 믿는다.
 *   · 지방세법: `lawId=001649, efYd=20270101`
 * 부칙(소득세법 제21221호 제1조 2호·제8조)은 조문 API 대상이 아니라 규칙이 없다 — `legal-codes` 상수만 둔다.
 *
 * 계획서: docs/02-design/features/stock-transfer-exit-tax-2027.engine.plan.md §6
 */

import type { VerificationRule } from "../verifier-types";

export const TRANSFER_EXIT_2027_ADDITIONS: VerificationRule[] = [
  {
    id: "TRANSFER.EXIT_TAX_2027_SCOPE",
    citation: "소득세법 §118의9",
    basis: "announced",
    keywords: [
      "제94조제1항제3호가목부터 다목까지",
      "국외전출자 주식등",
      "제94조제1항제3호다목에 해당하는 주식등은 제외한다",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.EXIT_TAX_2027_RATE",
    citation: "소득세법 §118의11",
    basis: "announced",
    keywords: [
      "다음 각 호의 세율을 적용",
      "제94조제1항제3호다목에 따른 주식등",
      "중소기업의 주식등",
      "양도소득과세표준의 100분의 10",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.EXIT_2027_FOREIGN_EXCLUSION",
    citation: "소득세법 시행령 §178의8 ②",
    basis: "announced",
    keywords: [
      "양도가액의 합계가 5억원 이하인 것",
      "100분의 80 이상의 기간 동안 국내에서 근로를 제공한 사람",
      "20세가 되는 날과 그 이전 기간을 말한다",
      "근로를 제공하기 시작한 날 전에 취득한 것",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.EXIT_2027_FOREIGN_VALUE",
    citation: "소득세법 시행령 §178의9 ②",
    basis: "announced",
    keywords: ["국외주식등: 제178조의3에 따라 산정한 시가"],
    keywordMode: "ALL",
  },
  {
    // PR-7a — §118의14① 비거주자 세액공제 대상 판정(종목 발행 법인). 현행(enforced) 조문이라 basis 없음.
    id: "TRANSFER.EXIT_TAX_2027_NONRESIDENT_SOURCE_119_11",
    citation: "소득세법 §119",
    keywords: [
      "국내원천 유가증권양도소득",
      "내국법인이 발행한 주식 또는 출자지분과 그 밖의 유가증권",
      "외국법인이 발행한 주식 또는 출자지분(증권시장에 상장된 것만 해당한다)",
    ],
    keywordMode: "ALL",
  },
  {
    // 종전 문언은 「국내주식 등」이라 아래 키워드(「주식 등」 앞에 「국내」 없음)가 개정본만 구분한다.
    id: "LOCAL.EXIT_TAX_2027_VALUATION_GAIN_RATE",
    citation: "지방세법 §103의3 ⑧",
    basis: "announced",
    keywords: ["양도소득으로 보는 주식 등의 평가이익"],
    keywordMode: "ALL",
  },
];
