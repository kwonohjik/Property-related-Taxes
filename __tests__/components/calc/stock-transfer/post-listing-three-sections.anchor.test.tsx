/**
 * @vitest-environment jsdom
 *
 * 「취득 후 상장 — 환산취득가」 카드 — **산식의 항 = 화면의 섹션**.
 *
 * 제보(2026-09-02): 「환산 입력 방식 이후로는 그 옵션 버튼이 뭐하는 것인지 많이 헷갈려」.
 * 원인은 화면이 평평했던 것이다. 산식이 요구하는 값은 셋뿐인데:
 *
 *   1주당 취득기준시가 = ②상장일 이후 1개월 종가평균 × (③취득연도 평가 ÷ ③상장연도 평가)
 *   환산취득가        = 양도가 × (1주당 취득기준시가 ÷ ①양도 당시 기준시가)
 *
 * 그 셋과 성격이 다른 스위치 둘이 같은 높이에 섞여 있었다.
 *
 *   「환산 입력 방식」  = 카드 전체 스위치 (②·③을 동시에 바꾼다)  → 최상단으로
 *   「값 입력 방식」    = ③ 안의 하위 토글 (simple 전용)          → ③ 안으로
 *
 * ⇒ ①②③ 번호 섹션 + 스위치 최상단. 산식 박스의 각 항에도 같은 번호를 달아 1:1로 잇는다.
 *
 * ⚠️ 자본조정(PostListingCapitalEventSection)은 **②**다 — 평가기간을 절단해 종가평균을
 *    바꾼다(상증령 §52의2②2호 준용 해석). ③(평가액)으로 옮기면 안 된다.
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PostListingValuationCard } from "@/components/calc/stock-transfer/PostListingValuationCard";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function renderCard(patch: Partial<StockTransferFormData> = {}) {
  const form = {
    ...createInitialStockFormData(),
    marketType: "kosdaq",
    acquiredBeforeListing: true,
    ...patch,
  } as StockTransferFormData;
  render(<PostListingValuationCard form={form} onChange={vi.fn()} />);
}

/** 제목으로 섹션 카드를 집는다 */
function section(title: string): HTMLElement {
  const el = screen.getByText(title).closest("div.rounded-lg");
  expect(el).toBeTruthy();
  return el as HTMLElement;
}

const T1 = "양도 당시 기준시가";
const T2 = "상장 당시 시세";
const T3 = "상장연도·취득연도 평가액";

describe("SEC — 산식의 항 = 화면의 섹션", () => {
  it("SEC-1 세 섹션이 ①②③ 번호 배지를 달고 이 순서로 놓인다", () => {
    renderCard();
    for (const [t, n] of [[T1, "1"], [T2, "2"], [T3, "3"]] as const) {
      const header = screen.getByText(t).parentElement!;
      expect(header.textContent).toContain(n);
    }
    const order = [T1, T2, T3].map((t) => screen.getByText(t));
    // DOM 순서 = ① → ② → ③
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("SEC-2 산식 박스가 같은 번호로 각 항을 가리킨다 (화면↔산식 1:1)", () => {
    renderCard();
    expect(screen.getByText(/②상장일 이후 1개월 종가평균/)).toBeTruthy();
    expect(screen.getByText(/③취득연도 평가 ÷ ③상장연도 평가/)).toBeTruthy();
    expect(screen.getByText(/①양도 당시 기준시가/)).toBeTruthy();
  });

  it("SEC-3 「환산 입력 방식」은 세 섹션보다 **위**에 있다 (카드 전체 스위치)", () => {
    renderCard();
    const sw = document.querySelector('input[name="unlistedDetailMode"]')!;
    const first = screen.getByText(T1);
    expect(sw.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 어느 섹션에도 속하지 않는다
    expect(section(T1).contains(sw)).toBe(false);
    expect(section(T2).contains(sw)).toBe(false);
    expect(section(T3).contains(sw)).toBe(false);
  });

  it("SEC-4 「값 입력 방식」은 ③ 안에 있다 (하위 토글임이 드러난다)", () => {
    renderCard({ unlistedDetailMode: "simple" });
    const sub = document.querySelector('input[name="simpleValueInputMode"]')!;
    expect(section(T3).contains(sub)).toBe(true);
    expect(section(T2).contains(sub)).toBe(false);
  });

  it("SEC-5 simple — 상장일과 상장일 이후 1개월 종가평균이 ② 안에 있다", () => {
    renderCard({ unlistedDetailMode: "simple" });
    const s2 = section(T2);
    const labels = Array.from(s2.querySelectorAll("label")).map((l) =>
      (l.textContent ?? "").replace("*", "").trim()
    );
    expect(labels).toContain("상장일");
    expect(labels.some((t) => t.includes("상장일 이후 1개월 종가평균"))).toBe(true);
  });

  it("SEC-6 simple — 상장연도·취득연도 평가 입력이 ③ 안에 있다", () => {
    renderCard({ unlistedDetailMode: "simple", simpleValueInputMode: "direct" });
    const s3 = section(T3);
    expect(s3.textContent).toContain("상장연도 비상장 보충적 평가");
    expect(s3.textContent).toContain("취득연도 비상장 보충적 평가");
    expect(section(T2).textContent).not.toContain("취득연도 비상장 보충적 평가");
  });

  it("SEC-7 full — 종가 표와 자본조정은 ②, 결산서는 ③ (경계가 갈린다)", () => {
    renderCard({ unlistedDetailMode: "full" });
    const s2 = section(T2);
    const s3 = section(T3);
    // 증자·합병 기간절단 토글은 ② — 평가기간을 잘라 **종가평균**을 바꾼다(상증령 §52의2②2호 준용).
    expect(s2.textContent).toContain("평가기간 중 증자·합병 발생");
    expect(s3.textContent).not.toContain("평가기간 중 증자·합병 발생");
    // 두 계산서는 ③ — 평가액을 만든다
    expect(s3.textContent).toContain("순손익 계산서");
    expect(s3.textContent).toContain("순자산가액 계산서");
    expect(s2.textContent).not.toContain("순손익 계산서");
    expect(s2.textContent).not.toContain("순자산가액 계산서");
  });
});
