/**
 * anchor: 소득세법 §95② — 「본문 괄호」와 「단서」를 가르는 축.
 *
 * ## 법문 (KoreanLaw MCP 실측 · 소득세법 mst=280405 · 시행 2026-01-01 · 조회 2026-09-08)
 *
 * **② 본문**
 *   「제1항에서 "장기보유 특별공제액"이란 **제94조제1항제1호에 따른 자산**
 *    (제104조제3항에 따른 미등기양도자산과 같은 조 제7항 각 호에 따른 자산은 제외한다)로서
 *    보유기간이 3년 이상인 것 **및 제94조제1항제2호가목에 따른 자산 중 조합원입주권**
 *    (**조합원으로부터 취득한 것은 제외한다**)에 대하여 그 자산의 양도차익
 *    (**조합원입주권을 양도하는 경우에는 …관리처분계획 인가 및 …사업시행계획인가 전
 *      토지분 또는 건물분의 양도차익으로 한정한다**)에 다음 **표 1**에 따른 …」
 *
 * **② 단서**
 *   「**다만, 대통령령으로 정하는 1세대 1주택**(이에 딸린 토지를 포함한다)에 해당하는
 *    자산의 경우에는 … 다음 **표 2** …」
 *
 * ⇒ 갈래는 하나다:
 *   - **본문 괄호** = ① 미등기·§104⑦ 자산 제외 · ② 승계조합원 제외 · ③ 인가 전 한정
 *   - **단서**      = 1세대1주택 → 표2
 *   - **분양권**(§94①2호 **나**목)은 본문 대상 열거에 **아예 없다** — 단서와 무관하다.
 *
 * ## 계기
 *
 * 2026-09-08, 인용이 **전역 복제**돼 있었다 — 인가 전 한정·승계조합원 배제·미등기 배제를
 * 「§95② 단서」로 인용한 곳이 19곳이었다(사용자 노출 배지·라벨 9곳 포함).
 * `RedevelopmentDetailCard.tsx`는 **자기 자신과 모순**이었다: 배지는 「§95② 단서」,
 * 바로 아래 산문은 「§95② 본문 괄호」. [[feedback_citation_drift_replicates_across_repo]]
 *
 * 기존 감사 규칙 L1-09(`redev-citation-literal-audit`)가 이것을 놓친 이유는 **줄 단위**라서다 —
 * 배지와 산문이 다른 줄에 있었다. 그 규칙은 이 커밋에서 용어 하나로 넓혔고, 이 앵커는
 * **정본이 실제로 쓰이는지**를 반대 방향에서 고정한다(부정형 규칙의 긍정 짝).
 * [[feedback_negative_anchor_needs_positive_twin]]
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** 인가 전 한정·승계조합원·미등기 배제를 화면에 말하는 지점 — 전부 「본문 괄호」여야 한다. */
const PARENTHESIS_SITES: { file: string; needle: string }[] = [
  // 입주권 결과 카드 — 제목·근거 배지·안내 카드·청산금 행 배지
  { file: "components/calc/results/transfer/RedevelopmentDetailCard.tsx", needle: "조합원입주권 양도 (§95② 본문 괄호 + §166①)" },
  { file: "components/calc/results/transfer/RedevelopmentDetailCard.tsx", needle: 'label="§95② 본문 괄호"' },
  { file: "components/calc/results/transfer/RedevelopmentDetailCard.tsx", needle: ">소득세법 §95② 본문 괄호<" },
  // 입주권 비과세 섹션 — 근거 조문 배지
  { file: "components/calc/transfer/RedevelopmentRightExemptionSection.tsx", needle: 'label="§95② 본문 괄호"' },
  // 계산명세서 legalBasis
  { file: "components/calc/results/transfer/DetailedStatementRedevOverrides.ts", needle: '"소득세법 §95② 본문 괄호 · §94①2호 · 시행령 §166⑤1호 · §166①2호 가목"' },
  // 신고서 표 rose 주석
  { file: "components/calc/results/transfer/FilingFormTableRedevRows.ts", needle: '"§95② 본문 괄호·§94①2호 — 장기보유특별공제 대상 외"' },
  { file: "components/calc/results/transfer/FilingFormTableRedevRows.ts", needle: '"§95② 본문 괄호 배제"' },
];

/**
 * 1세대1주택 표2 = **단서**가 정본이다. 일괄 치환으로 이것까지 「본문 괄호」로 바꾸면
 * 반대 방향으로 틀린다 — 정정이 과잉이 아니었음을 고정한다.
 */
const PROVISO_SITES: { file: string; needle: string }[] = [
  { file: "components/calc/transfer/rental/Rental974InputForm.tsx", needle: "1세대1주택 장기보유특별공제 표2(소득세법 §95② 단서)" },
  { file: "lib/tax-engine/transfer-tax-lthd.ts", needle: '"조특법 §97의4① 단서 · 소득세법 §95② 단서"' },
  { file: "components/calc/transfer/RedevelopmentBlockCards.tsx", needle: "장특공제 표2 (§95② 단서·시행령 §159의4)" },
];

describe("소득세법 §95② — 본문 괄호 / 단서 인용 축", () => {
  it.each(PARENTHESIS_SITES)(
    "🔑 인가전 한정·승계조합원 배제는 「본문 괄호」로 인용한다 — $file",
    ({ file, needle }) => {
      expect(readFileSync(file, "utf-8"), `${file} 에 「${needle}」 가 없다`).toContain(needle);
    },
  );

  it.each(PROVISO_SITES)(
    "🔑 1세대1주택 표2는 「단서」가 정본이다 (과잉 치환 방지) — $file",
    ({ file, needle }) => {
      expect(readFileSync(file, "utf-8"), `${file} 에 「${needle}」 가 없다`).toContain(needle);
    },
  );

  it("입주권 결과 카드가 «자기 자신과 모순»되지 않는다", () => {
    // 배지는 「단서」, 산문은 「본문 괄호」였다. 같은 파일에서 배제 맥락의 «단서» 인용이
    // 하나도 남지 않아야 한다 — 표2 맥락이 이 파일엔 없으므로 0이 정답이다.
    const src = readFileSync("components/calc/results/transfer/RedevelopmentDetailCard.tsx", "utf-8");
    const provisoLines = src
      .split("\n")
      .map((l, i) => ({ n: i + 1, l }))
      .filter(({ l }) => /§\s*95\s*②\s*단서/.test(l));
    expect(provisoLines.map((x) => `${x.n}: ${x.l.trim()}`)).toEqual([]);
  });
});
