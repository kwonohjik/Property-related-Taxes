/**
 * @vitest-environment jsdom
 *
 * 가산세 기준금액 블록 머리글 — 무신고는 §47조의2①, 과소신고는 §47조의3① (V-16)
 *
 * 국세기본법 §47조의2① — 무신고가산세의 기준은 «그 신고로 납부하여야 할 세액(이 법 및 세법에 따른 가산세와 세법에 따라 가산하여 납부하여야 할
 * 이자 상당 가산액이 있는 경우 그 금액은 제외하며, 이하 "무신고납부세액"이라 한다)» (KoreanLaw 조회 2026-11-11, 시행 2026-10-02본).
 * 블록은 신고 위반을 선언하면 무신고·과소신고 모두에서 뜨는데 머리글이 §47조의3①·«과소신고납부세액등»으로 고정돼 있어 무신고 사용자에게 틀린 조문·용어를
 * 보였다. 계산은 건드리지 않는다(엔진은 두 경우 같은 base 산식을 쓴다 — V-15).
 *
 * 🔑 Step3 을 렌더한다(`stock-penalty-prior-paid-hint.anchor.test.tsx` 와 같은 규약).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kospi",
    transferDate: "2024-06-01",
    ...o,
  };
}
const head = (v: "non_report" | "under_report") => {
  render(<Step3 form={form({ filingViolation: v })} onChange={() => {}} />);
  return document.body.textContent ?? "";
};

describe("BH-1 무신고 — 머리글이 §47조의2①·무신고납부세액을 말한다", () => {
  it("BH-1-1 제목이 «무신고납부세액»이고 «과소신고납부세액등»이 아니다", () => {
    const t = head("non_report");
    expect(t).toContain("가산세 기준금액 (무신고납부세액)");
    expect(t).not.toContain("가산세 기준금액 (과소신고납부세액등)");
  });
  it("BH-1-2 설명이 §47조의2①과 «그 신고로 납부하여야 할 세액»(가산세·이자상당가산액 제외)을 말한다", () => {
    const t = head("non_report");
    expect(t).toContain("국세기본법 §47조의2① — ");
    expect(t).toContain("그 신고로 납부하여야 할 세액");
    expect(t).toContain("가산세·이자상당가산액");
  });
  it("BH-1-3 이자상당가산액 칸 근거에 §47조의2①이 함께 인용된다", () => {
    render(<Step3 form={form({ filingViolation: "non_report" })} onChange={() => {}} />);
    // 고급 설정은 접혀 있으므로 펼친 뒤 확인한다
    fireEvent.click(screen.getByText(/고급 설정 \(이자상당가산액\)/));
    // 기납부 안내문에도 같은 병기가 있으므로 이자상당가산액 힌트의 문장 전체로 가린다
    expect(document.body.textContent).toContain("가산세 기준금액에서 제외 (국세기본법 §47조의2①·§47조의3①)");
  });
});

describe("BH-2 과소신고 — 종전 머리글 유지(대조군)", () => {
  it("BH-2-1 제목 «과소신고납부세액등» · 설명 §47조의3①", () => {
    const t = head("under_report");
    expect(t).toContain("가산세 기준금액 (과소신고납부세액등)");
    expect(t).toContain("국세기본법 §47조의3① — 산출세액 전액이 아니라 여기서 뺀 금액에 세율을 곱합니다");
    expect(t).not.toContain("가산세 기준금액 (무신고납부세액)");
  });
});

describe("BH-3 신고 위반 미선언 — 블록 자체가 없다", () => {
  it("BH-3-1", () => {
    render(<Step3 form={form({ filingViolation: "none" })} onChange={() => {}} />);
    const t = document.body.textContent ?? "";
    expect(t).not.toContain("가산세 기준금액 (무신고납부세액)");
    expect(t).not.toContain("가산세 기준금액 (과소신고납부세액등)");
  });
});
