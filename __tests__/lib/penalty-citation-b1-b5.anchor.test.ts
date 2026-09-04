/**
 * anchor: 가산세 코드리뷰 **B1+B5** — 인용·문구·미포함 고지 13건 (2026-09)
 *
 * ## 왜 리터럴을 검사하는가
 *
 * 이 배치는 **세액을 바꾸지 않는다**. 값 anchor로는 하나도 잡히지 않는다 —
 * 근거가 틀려도 금액은 맞고, 배너가 없어도 계산은 돈다. 사용자만 본다.
 * 그래서 저장소의 선례(`redev-citation-literal-audit.anchor.test.ts`)대로
 * **렌더되는 리터럴 자체**를 검사 대상으로 삼는다.
 *
 * ⚠️ 이 파일이 지키는 것은 「어느 조문을 가리키는가」이지 문장 스타일이 아니다.
 *    문구를 다듬는 것은 자유지만, **조문 번호를 되돌리면 RED**가 되어야 한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

/** 「이 조문이 있어야 한다 / 이 조문은 없어야 한다」 한 쌍 */
function expectCitations(rel: string, must: string[], mustNot: string[] = []) {
  const src = read(rel);
  for (const m of must) expect(src, `${rel} — 「${m}」가 없다`).toContain(m);
  for (const m of mustNot) expect(src, `${rel} — 「${m}」가 남아 있다`).not.toContain(m);
}

describe("G-21 · G-42 종부세 합산배제 사후관리 — 추징 근거는 §17⑤, 붙는 것은 이자상당가산액", () => {
  const F = "lib/tax-engine/legal-codes/comprehensive.ts";

  it("B1-21-1: 추징 근거가 §17⑤다 (종전 §8③은 9/16~9/30 보유현황 신고의무 조항)", () => {
    expectCitations(
      F,
      ["종합부동산세법 §17⑤ — 합산배제 사후관리 위반 추징"],
      ['"종합부동산세법 §8③ — 합산배제 사후관리 위반 추징"'],
    );
  });

  it("B1-21-2: 이자상당가산액의 근거가 시행령 §10②2호다 (국세기본법 §47의4가 아니다)", () => {
    expectCitations(
      F,
      ["종합부동산세법 시행령 §10②2호 — 이자상당가산액"],
      ['"국세기본법 §47의4 — 납부지연가산세"'],
    );
  });

  it("B1-21-3: 엔진 주석·result 타입도 「가산세」가 아니라 「이자상당가산액」이라 적는다", () => {
    expectCitations(
      "lib/tax-engine/comprehensive-tax-helpers.ts",
      ["종합부동산세법 §17⑤"],
      ["사후관리 위반 추징 (종합부동산세법 §8③)"],
    );
    expectCitations(
      "lib/tax-engine/types/comprehensive.types.ts",
      ["이자상당가산액"],
      ["// 납부불성실 가산세"],
    );
  });

  it("B1-42-1: 합산배제 신고의무 근거가 §8③이다 (§16②는 납부고지서 발급기한)", () => {
    expectCitations(
      F,
      ["종합부동산세법 §8②·§8③ — 합산배제 대상 및 보유현황 신고"],
      ["종합부동산세법 §8②, §16② — 합산배제 신고"],
    );
  });
});

describe("G-29 지방소득세 — §103의3은 세율 조항이고 §114조의2분의 근거는 §103의9②", () => {
  it("B1-29-1: 단일 소스가 「§103의3의 과세표준 = 결정세액 + 가산세」를 더는 말하지 않는다", () => {
    expectCitations(
      "components/calc/results/transfer/local-income-tax-display.ts",
      ["지방세법 §103의9②", "§103②", "§103의2"],
      ["지방세법 §103의3의 과세표준은"],
    );
  });

  it("B1-29-2: 복제 지점 6곳이 같은 축으로 정정됐다", () => {
    expectCitations("lib/tax-engine/types/transfer-result.types.ts", ["§103의9②"]);
    expectCitations("lib/tax-engine/types/transfer-aggregate.types.ts", ["§103의9②"]);
    expectCitations("lib/tax-engine/transfer-tax-aggregate.ts", ["§103의9②"]);
    expectCitations("components/calc/results/MultiTransferPropertyBreakdown.tsx", ["§103의9②"]);
    expectCitations("lib/tax-engine/transfer-tax-mixed-use-totals.ts", ["§103의2 3호"]);
    expectCitations("components/calc/results/mixed-use/MixedUseResultCardAdapter.ts", ["§103의2 3호"]);
  });

  it("B1-29-3: 결과탭 「지방소득세 산출세액」 행의 legalBasis가 세 조문을 함께 가리킨다", () => {
    expectCitations(
      "components/calc/results/transfer/DetailedStatementFormulaBuilders.ts",
      ['legalBasis: "지방세법 §103② · §103의3 · §103의9②"'],
      ['legalBasis: "지방세법 §103의3",'],
    );
  });
});

describe("G-16 · G-38 표시 문자열 — 법령명 병기 · 지방소득세 base 축 명시", () => {
  it("B1-16-1: 일괄양도 카드 지방세 라벨이 §114조의2분만 base에 든다고 말한다", () => {
    /**
     * 🔄 **파일이 옮겨졌다 (2026-09-04, 800줄 분리)** — 합산 세액 요약(`AggregatedTaxSummary`)이
     * `BundledAllocationSubCards.tsx`로 나갔다. 인용은 그 문자열을 **렌더하는 곳**에 있어야 하므로
     * 검사 대상도 함께 옮긴다(무동작 리팩터 — 문구 자체는 그대로다).
     */
    expectCitations(
      "components/calc/results/BundledAllocationSubCards.tsx",
      ["소득세법 §114조의2 가산세) × 10%", "국세기본법 §47의2~§47의4 가산세는 대상 아님"],
      ["지방세 납부세액 (지방소득세, 결정세액+가산세 × 10%)"],
    );
  });

  it("B1-38-1: 자산별 가산세 산식에 법령명이 붙는다 (「§114의2」 단독 표기 금지)", () => {
    expectCitations(
      "components/calc/results/transfer/DetailedStatementFormulaBuilders.ts",
      ["소득세법 §114조의2 ${fmt(p.penaltyTax)}"],
      ["`§114의2 ${fmt(p.penaltyTax)}`"],
    );
  });

  it("B1-38-2: 수정신고 카드 감면 라벨에 법령명이 붙는다", () => {
    expectCitations(
      "components/calc/results/transfer/AmendmentResultCard.tsx",
      ["국세기본법 §48②"],
      ["` (§48② ${"],
    );
  });
});

describe("G-31 수정신고·경정청구 UI — 상증법과 문자열이 겹치지 않게 법령명을 붙인다", () => {
  const F = "components/calc/transfer/AmendmentBlock.tsx";

  /**
   * 상증법에도 §48②1호·§45의2가 실재하고 내용이 전혀 다르다(공익법인 출연재산 추징 ·
   * 명의신탁 증여의제). 법령명 없는 「§48②」·「§45의2①」은 같은 제품 안에서 충돌한다.
   */
  it("B1-31-1: 렌더되는 §45의2·§48 인용에 「국세기본법」이 붙어 있다", () => {
    expectCitations(F, [
      "법정신고기한 후 5년 이내 (국세기본법 §45의2①)",
      "판결·수용재결 등 안 날부터 3개월 (국세기본법 §45의2②)",
      "정당한 사유 면제 (국세기본법 §48①2호)",
      "국세기본법 §48② 자진수정 감면",
      "국세기본법 §47의4①1호",
    ]);
  });

  it("B1-31-2: 법령명 없는 단독 인용이 렌더 문자열에 남아 있지 않다", () => {
    const src = read(F);
    for (const bare of ['"§48② 자진수정 감면"', "(§45의2①)", "(§45의2②)", "(§48①2호)"]) {
      const idx = src.indexOf(bare);
      if (idx < 0) continue;
      // 「국세기본법 」이 바로 앞에 붙어 있어야 한다
      expect(src.slice(Math.max(0, idx - 6), idx), `${F} — 「${bare}」에 법령명이 없다`).toContain(
        "국세기본법",
      );
    }
  });
});

describe("G-17 · G-37 주식 축 — 조문 제목·구현 상태 드리프트", () => {
  it("B1-17-1: 신고서 26·27번 행이 §47조의3을 포함하고 「납부불성실」을 쓰지 않는다", () => {
    expectCitations(
      "components/calc/stock-transfer/StockFilingFormTableHelpers.ts",
      [
        "26. 신고불성실 가산세 (국세기본법 §47조의2·§47조의3)",
        "27. 납부지연 가산세 (국세기본법 §47조의4)",
      ],
      ["납부불성실"],
    );
  });

  it("B1-17-2: 결과 카드 행도 「납부지연」이다", () => {
    expectCitations(
      "components/calc/results/StockTransferPenaltySection.tsx",
      ["납부지연 가산세 (국세기본법 §47조의4)"],
      ["납부불성실"],
    );
  });

  it("B1-37-1: legal-codes가 §47조의4를 「미구현」이라 말하지 않는다", () => {
    expectCitations(
      "lib/tax-engine/legal-codes/stock.ts",
      ["computeStockLatePaymentPenalty"],
      ["(본 엔진 미구현)"],
    );
  });
});

describe("G-40 이자상당액 제외 근거 — §47의2③이 아니라 §47의2①·§47의3① 괄호", () => {
  it("B1-40-1: Step6 hint가 정정됐다", () => {
    expectCitations(
      "app/calc/transfer-tax/steps/Step6.tsx",
      ["국세기본법 §47의2① · §47의3① 각 괄호"],
      ["(국세기본법 §47의2③)"],
    );
  });
});

describe("G-20 면책 배너 — 가산세를 계산하지 않는 세 세목 결과뷰에 배선한다", () => {
  /**
   * 배너가 **있는** 세목은 가산세를 계산하는 세목뿐이었다(양도·상속·증여). 취득·재산·종부는
   * 가산세 축이 아예 없는데 배너도 없어, 배너 부재가 오히려 「더 확정적인 값」으로 읽혔다.
   */
  it.each([
    "components/calc/results/AcquisitionTaxResultView.tsx",
    "components/calc/results/PropertyTaxResultView.tsx",
    "components/calc/results/ComprehensiveTaxResultView.tsx",
  ])("B5-20-1: %s 가 DisclaimerBanner를 import하고 렌더한다", (rel) => {
    const src = read(rel);
    expect(src, `${rel} — import 누락`).toContain(
      'import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner"',
    );
    expect(src, `${rel} — 렌더 누락`).toContain("<DisclaimerBanner />");
  });
});

describe("G-09 · G-23 취득세 가산세 미포함 고지", () => {
  it("B5-09-1: 결과뷰 총액 블록이 가산세 미포함을 상시 고지한다", () => {
    expectCitations("components/calc/results/AcquisitionTaxResultView.tsx", [
      "가산세가 포함되어 있지 않습니다",
      "지방세법 §21①·②",
      "지방세기본법 §53~§55",
    ]);
  });

  it("B5-23-1: 도움말이 §21② 미신고 매각 80% 중가산과 §53② 부정행위 40%를 담는다", () => {
    expectCitations(
      "app/help/acquisition-tax/sections/FilingDeadlineSection.tsx",
      ["지방세법 §21②", "지방세기본법 §53②", "지방세기본법 §55①1호", "지방세기본법 §57②"],
      ["납부불성실가산세"],
    );
  });

  it("B5-23-2: 감면 요건이 「법정신고기한이 지난 후」다 (「신고기한 내」는 성립하지 않는다)", () => {
    expectCitations(
      "app/help/acquisition-tax/sections/FilingDeadlineSection.tsx",
      ["법정신고기한이 지난 후"],
      ["신고기한 내 자진수정신고 시 가산세 감면"],
    );
  });
});
