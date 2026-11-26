/**
 * @vitest-environment jsdom
 *
 * §101② 판정 화면 결과 카드 — applied · not_applied · out_of_scope 각 1건
 * 배지 · 납세의무자 · 최종부담세액 · 사유 문구 · 확인 필요.
 */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { GiftResaleResultCard, type GiftResaleAmounts } from "@/components/calc/gift-resale/GiftResaleResultCard";
import type { GiftResaleResponse } from "@/lib/calc/gift-resale-101-2-api";

afterEach(cleanup);

/** 교재 사례(계획서 K-2) — 증여세 6,500,000 − 195,000, 수증자 36,250,000, 증여자 13,704,000 */
const TEXTBOOK_AMOUNTS: GiftResaleAmounts = {
  giftTaxCalculated: 6_500_000,
  giftTaxCreditsAndReductions: 195_000,
  doneeTransferDeterminedTax: 36_250_000,
  donorTransferDeterminedTax: 13_704_000,
};

const BASE: GiftResaleResponse = {
  outcome: "not_applied",
  reasonCode: "clause1_not_less",
  clause1Tax: 42_555_000,
  clause2Tax: 13_704_000,
  periodYears: 10,
  deadline: "2036-02-01T00:00:00.000Z",
  taxpayer: "donee",
  finalBurden: 42_555_000,
  needsConfirmation: [],
};

describe("GiftResaleResultCard", () => {
  it("applied — 부인 적용 배지 · 납세의무자 증여자 · 최종부담 = 2호 · 환급 확인 줄", () => {
    const applied: GiftResaleResponse = {
      ...BASE,
      outcome: "applied",
      reasonCode: "applied",
      clause1Tax: 9_000_000,
      clause2Tax: 13_704_000,
      taxpayer: "donor",
      finalBurden: 13_704_000,
    };
    render(<GiftResaleResultCard result={applied} amounts={{ ...TEXTBOOK_AMOUNTS, doneeTransferDeterminedTax: 2_695_000 }} />);
    expect(screen.getByTestId("gr-badge").textContent).toBe("부인 적용");
    expect(screen.getByTestId("gr-taxpayer").textContent).toContain("증여자");
    expect(screen.getByTestId("gr-taxpayer").textContent).toContain("연대납세의무");
    expect(screen.getByTestId("gr-final-burden").textContent).toBe("13,704,000");
    expect(screen.getByTestId("gr-clause1").textContent).toBe("9,000,000");
    expect(screen.getByTestId("gr-clause2").textContent).toBe("13,704,000");
    expect(screen.getByTestId("gr-reason").textContent).toContain("증여자가 그 자산을 직접 양도한 것으로 봅니다(§101②)");
    expect(screen.getByTestId("gr-applied-extra").textContent).toBe("이미 낸 증여세의 환급 절차는 확인이 필요합니다.");
    expect(screen.getByTestId("gr-summary").textContent).toContain("지방소득세 별도");
    expect(screen.getByTestId("gr-period").textContent).toBe("10년 · 2036.2.1.까지");
    // V-2 — 2호 열의 증여자 감면 고지
    expect(screen.getByTestId("gr-clause2-reduction-note").textContent).toBe(
      "증여자 기준 계산에 감면을 넣었다면, 그 감면을 2호에 반영할지는 해석례가 엇갈려 확인이 필요합니다.",
    );
  });

  it("not_applied — 미적용 배지 · 납세의무자 수증자 · 최종부담 = 1호 · 환급 줄 없음", () => {
    render(<GiftResaleResultCard result={BASE} amounts={TEXTBOOK_AMOUNTS} />);
    expect(screen.getByTestId("gr-badge").textContent).toBe("미적용");
    expect(screen.getByTestId("gr-taxpayer").textContent).toBe("수증자");
    expect(screen.getByTestId("gr-final-burden").textContent).toBe("42,555,000");
    expect(screen.getByTestId("gr-clause1").textContent).toBe("42,555,000");
    expect(screen.getByTestId("gr-clause2").textContent).toBe("13,704,000");
    expect(screen.queryByTestId("gr-applied-extra")).toBeNull();
    // 1호 풀어쓰기 — 증여세(산출 − 공제·감면) 6,305,000 + 수증자 양도소득세 36,250,000
    expect(screen.getByTestId("gr-result").textContent).toContain("증여세(산출세액 − 공제·감면세액) 6,305,000 + 수증자 양도소득세 36,250,000 = 1호 세액");
  });

  it("not_applied — 확인 필요 목록은 코드별 문구로 나온다", () => {
    render(
      <GiftResaleResultCard
        result={{ ...BASE, needsConfirmation: ["other_transfers_same_year", "gift_tax_includes_other_assets"] }}
        amounts={TEXTBOOK_AMOUNTS}
      />,
    );
    const items = screen.getByTestId("gr-confirmations").querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute("data-confirmation")).toBe("other_transfers_same_year");
    expect(items[1].textContent).toContain("§101②에 명문이 없습니다");
  });

  it("not_applied(기간 경과) — 사유에 연수와 기한이 들어간다", () => {
    render(
      <GiftResaleResultCard result={{ ...BASE, reasonCode: "period_exceeded", deadline: "2033-03-01T00:00:00.000Z" }} amounts={TEXTBOOK_AMOUNTS} />,
    );
    expect(screen.getByTestId("gr-reason").textContent).toBe("미적용 — 증여 등기접수일부터 10년(2033.3.1.)이 지난 뒤 양도했습니다.");
  });

  it("out_of_scope — 사유만 낸다(금액 비교·납세의무자·최종부담·확인 필요 없음)", () => {
    const oos: GiftResaleResponse = {
      ...BASE,
      outcome: "out_of_scope",
      reasonCode: "burdened_gift",
      taxpayer: null,
      finalBurden: null,
      needsConfirmation: ["other_transfers_same_year"],
    };
    render(<GiftResaleResultCard result={oos} amounts={TEXTBOOK_AMOUNTS} />);
    expect(screen.getByTestId("gr-badge").textContent).toBe("판정하지 않음");
    expect(screen.getByTestId("gr-reason").textContent).toContain("부담부증여는 지원하지 않습니다");
    expect(screen.queryByTestId("gr-taxpayer")).toBeNull();
    expect(screen.queryByTestId("gr-final-burden")).toBeNull();
    expect(screen.queryByTestId("gr-clause1")).toBeNull();
    expect(screen.queryByTestId("gr-confirmations")).toBeNull();
    expect(screen.queryByTestId("gr-clause2-reduction-note")).toBeNull();
  });
});
