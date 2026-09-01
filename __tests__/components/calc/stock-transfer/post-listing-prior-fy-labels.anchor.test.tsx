/**
 * @vitest-environment jsdom
 *
 * §165⑤ 비상장 보충적 평가 입력 라벨 — **「직전 사업연도」임을 라벨이 말한다**.
 *
 * 제보(2026-09-01): 라벨이 「상장연도 1주당 순손익가치」·「취득연도 1주당 순손익가치」라
 * 사용자가 **상장연도·취득연도 자체**의 값을 넣을 수 있었다. 실제로 넣어야 하는 값은
 * 그 **직전 사업연도**의 것이다.
 *
 * 근거 — 소득세법 시행령 §165④1 (§165⑤가 상장일 축에 준용):
 *   가. 양도일 또는 취득일이 속하는 사업연도의 **직전 사업연도**의 1주당 순손익액 ÷ 이자율
 *   나. 양도일 또는 취득일이 속하는 사업연도의 **직전 사업연도 종료일** 현재 장부가액 ÷ 발행주식총수
 *
 * hint 줄은 이미 「직전 사업연도」라고 맞게 적고 있었다 — **라벨만 어긋나 있었다**.
 * 같은 카드의 상세 재현 모드(`PostListingNetIncomeStatement`·`PostListingNetAssetStatement`)도
 * 이미 「상장연도 직전」·「취득연도 직전」으로 맞게 쓰고 있어, simple 모드만 예외였다.
 *
 * ⚠️ 이 라벨은 **E2E 셀렉터**이기도 하다(`getByRole("textbox", { name, exact: true })`).
 *    바꿀 때 `e2e/stock-transfer-165-5-floor80.spec.ts`·`stock-transfer-monthly-accrual.spec.ts`를
 *    함께 갱신할 것.
 *
 * Plan: 제보 대응 (docs/00-pm/one-month-window-boundary-and-avg-tip.plan.md 계열)
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

describe("PFY — 비상장 보충적 평가 입력은 «직전 사업연도» 기준임이 라벨에 드러난다", () => {
  // ⚠️ `getByRole("textbox", { name })`을 쓰지 말 것 — 이 카드의 `<label>`은 `for`로 input과
  //    연결돼 있지 않아 RTL이 접근성 이름을 만들지 못한다(실측: aria-label·id 모두 null).
  //    Playwright는 관대해 E2E에서는 동작하므로 **두 층의 셀렉터가 다르다**.
  //    여기서는 라벨 텍스트와 placeholder를 직접 본다.
  const LABELS = [
    "상장일 직전 사업연도 1주당 순손익가치",
    "상장일 직전 사업연도 1주당 순자산가치",
    "취득일 직전 사업연도 1주당 순손익가치",
    "취득일 직전 사업연도 1주당 순자산가치",
  ];

  it.each(LABELS)("PFY-1 simple 모드 — 「%s」 입력이 있다", (label) => {
    renderCard({ unlistedDetailMode: "simple" });
    expect(screen.getByPlaceholderText(label)).toBeTruthy();
    // 라벨 텍스트에는 required 표시(*)가 붙는다 — 부분 일치로 본다.
    expect(screen.getByText((_, el) => el?.tagName === "LABEL" && (el.textContent ?? "").startsWith(label))).toBeTruthy();
  });

  it.each([
    "상장연도 1주당 순손익가치",
    "상장연도 1주당 순자산가치",
    "취득연도 1주당 순손익가치",
    "취득연도 1주당 순자산가치",
  ])("PFY-2 종전의 모호한 라벨 「%s」는 더 이상 쓰지 않는다", (stale) => {
    renderCard({ unlistedDetailMode: "simple" });
    // 🔑 구별력 확보 — 대조군이 같은 렌더에서 실제로 잡히는지 먼저 확인한다.
    //    (부정 단언은 «대상이 애초에 없을 때»도 통과한다)
    expect(screen.getByPlaceholderText(LABELS[0])).toBeTruthy();
    expect(screen.queryByPlaceholderText(stale)).toBeNull();
    // 라벨 노드에도 종전 문구가 «단독으로» 남아 있지 않아야 한다.
    // ("상장일 직전 사업연도 1주당 순손익가치"는 "상장연도…"를 부분문자열로 갖지 않는다)
    const labelTexts = Array.from(document.querySelectorAll("label")).map((l) => l.textContent ?? "");
    expect(labelTexts.some((t) => t.startsWith(stale))).toBe(false);
  });

  it("PFY-3 listing_only 모드의 취득일 축 직접 입력도 같은 라벨을 쓴다", () => {
    renderCard({ unlistedDetailMode: "listing_only" });
    expect(screen.getByPlaceholderText("취득일 직전 사업연도 1주당 순손익가치")).toBeTruthy();
    expect(screen.getByPlaceholderText("취득일 직전 사업연도 1주당 순자산가치")).toBeTruthy();
  });
});
