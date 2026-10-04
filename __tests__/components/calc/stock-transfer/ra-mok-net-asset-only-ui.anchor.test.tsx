/**
 * @vitest-environment jsdom
 *
 * ⑤ 영 §165⑧1호 후단 — 라목 주식등(양도일 2023-02-28 이후)은 순자산가치 단독. 화면이 엔진과 같은 leaf를 쓴다.
 *
 * 계획서 `docs/00-pm/stock-165-8-1-ra-net-asset-only.plan.md` §5 · Q-3
 *
 *   UI-RA-1  OtherAssetBlock — 라목 + 2024 양도 → 후단 안내 (엔진도 반전을 읽지 않는다)
 *   UI-RA-2  OtherAssetBlock — 라목 + 2023-02-27 양도 · 상장 → 안내 없음
 *            («반전» 토글은 S-1c-2에서 평가 입력 영역 `ReversalCorpToggle`로 옮겼다 — `reversal-corp-toggle-ui.anchor.test.tsx`)
 *   UI-RA-3  EstimatedUnlistedBlock(simple) — 라목 + 2024 → 순손익 칸 없음 · 근거 라벨 §165⑧1호 후단
 *   UI-RA-4  EstimatedUnlistedBlock(simple) — 라목 + 2023-02-27 / 라목 아님 → 순손익 칸 있음 (부정 짝)
 *   UI-RA-5  결산서(full) — 라목 + 2024 → 순손익 계산서 대신 후단 안내
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OtherAssetBlock } from "@/components/calc/stock-transfer/OtherAssetBlock";
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import { createInitialStockFormData, type StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

afterEach(cleanup);

function formOf(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "라목법인",
    marketType: "other_asset",
    isHeavyRealEstateForRate: true,
    transferDate: "2024-06-01",
    ...o,
  };
}
const toggle = () => screen.queryAllByText(/보충적 평가 가중치 반전/);
const niInputs = () => screen.queryAllByRole("textbox", { name: /1주당 순손익가치/ });

describe("UI-RA-1·2: OtherAssetBlock — 후단 안내 (반전 토글은 평가 영역으로 옮겼다 · S-1c-2)", () => {
  it("라목 + 2024 양도 → 후단 안내 · 라목 카드에 반전 토글 없음", () => {
    render(<OtherAssetBlock form={formOf() as never} onChange={vi.fn()} activeClientId={null as never} />);
    expect(toggle()).toHaveLength(0);
    expect(screen.getByTestId("ra-mok-net-asset-only-notice").textContent).toContain("순자산가치 단독");
  });
  it("라목 + 2023-02-28 양도(시행일 당일) → 후단 안내", () => {
    render(
      <OtherAssetBlock form={formOf({ transferDate: "2023-02-28" }) as never} onChange={vi.fn()} activeClientId={null as never} />,
    );
    expect(screen.getByTestId("ra-mok-net-asset-only-notice")).toBeInTheDocument();
  });
  it("코스닥 + 라목 + 2024 → 안내 없음 (후단은 §99①4 주식등만)", () => {
    render(
      <OtherAssetBlock form={formOf({ marketType: "kosdaq" }) as never} onChange={vi.fn()} activeClientId={null as never} />,
    );
    expect(screen.queryByTestId("ra-mok-net-asset-only-notice")).toBeNull();
    expect(toggle()).toHaveLength(0);
  });
  it("라목 + 2023-02-27 양도 → 안내 없음", () => {
    render(
      <OtherAssetBlock form={formOf({ transferDate: "2023-02-27" }) as never} onChange={vi.fn()} activeClientId={null as never} />,
    );
    expect(screen.queryByTestId("ra-mok-net-asset-only-notice")).toBeNull();
  });
});

describe("UI-RA-3·4: EstimatedUnlistedBlock(simple) — 순손익 칸", () => {
  it("라목 + 2024 → 순손익 칸 없음 · 근거 라벨 §165⑧1호 후단", () => {
    render(<EstimatedUnlistedBlock form={formOf()} onChange={vi.fn()} />);
    expect(niInputs()).toHaveLength(0);
    expect(screen.getByTestId("ra-mok-net-asset-only-label").textContent).toContain("§165⑧1호 후단");
  });
  it("양도기준시가 미리보기 라벨도 §165⑧1호 후단 (§165④3 아님)", () => {
    render(<EstimatedUnlistedBlock form={formOf({ transferYearNetAssetPerShare: "200000" })} onChange={vi.fn()} />);
    expect(screen.getByText(/\(순자산 단독 — §165⑧1호 후단\)/)).toBeInTheDocument();
    expect(screen.queryByText(/\(순자산 단독 — §165④3\)/)).toBeNull();
  });
  it("라목 + 2023-02-27 → 순손익 칸 있음 (양도·취득)", () => {
    render(<EstimatedUnlistedBlock form={formOf({ transferDate: "2023-02-27" })} onChange={vi.fn()} />);
    expect(niInputs().length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByTestId("ra-mok-net-asset-only-label")).toBeNull();
  });
  it("라목 아님 → 순손익 칸 있음", () => {
    render(<EstimatedUnlistedBlock form={formOf({ isHeavyRealEstateForRate: false })} onChange={vi.fn()} />);
    expect(niInputs().length).toBeGreaterThanOrEqual(2);
  });
});

describe("UI-RA-5: 결산서(full) — 순손익 계산서", () => {
  it("라목 + 2024 → 계산서 대신 후단 안내", () => {
    render(<EstimatedUnlistedBlock form={formOf({ unlistedValuationMode: "full" })} onChange={vi.fn()} />);
    expect(screen.getByTestId("eu-ni-hidden-notice").textContent).toContain(UNLISTED_MESSAGES.NET_ASSET_ONLY_HIDDEN_RA_MOK);
  });
});
