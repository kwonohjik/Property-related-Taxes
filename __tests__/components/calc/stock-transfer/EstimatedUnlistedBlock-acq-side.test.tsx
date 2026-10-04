/**
 * EstimatedUnlistedBlock — 취득측 전용(acquisitionSideOnly) 「평가액 계산」 anchor (UI-AS-1~6)
 *
 * 계획서: docs/00-pm/stock-transfer-acq-side-unlisted-full-mode.plan.md §4.3
 * 착수 전 mutation probe P-B: 이 블록의 「취득측은 simple 강제」를 지워도 **0건** 실패했다 — 안전망이 없던 축이다.
 *
 *  - UI-AS-1: 취득측 전용에서도 입력 방식 토글(계산결과 입력 / 평가액 계산)이 보인다
 *  - UI-AS-2: 사례 49 액면가 토글은 계속 숨는다 (환산 전용)
 *  - UI-AS-3: full이면 결산서가 취득 열만 렌더 — 양도 열 없음, simple 1주당 칸 없음
 *  - UI-AS-4: stale acqFaceValueOnly가 남아도 취득 열이 숨지 않는다 (막다른 길 방지)
 *  - UI-AS-5: 취득기준시가 미리보기가 결산서 값(260,000)을 쓴다
 *  - UI-AS-6: simple이면 종전 화면 그대로 (1주당 칸 · 결산서 없음)
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import {
  createInitialStockFormData,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";

afterEach(() => cleanup());

function makeForm(patch: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "unlisted",
    acquisitionMode: "sale_case",
    transferDate: "2025-06-01",
    shareCount: "100",
    ...patch,
  } as StockTransferFormData;
}

const ACQ_STATEMENT = {
  niAddRow1EUAcq: "300000000",
  niShareCountEUAcq: "10000",
  naAssetTotalRow1EUAcq: "5000000000",
  naLiabTotalRow8EUAcq: "3000000000",
  naShareCountEUAcq: "10000",
} as Partial<StockTransferFormData>;

const EU_ACQ_HEADER = /취득연도 직전 \(비상장 §165④\) 사업연도/;
const EU_TRANSFER_HEADER = /양도연도 직전 \(비상장 §165④\) 사업연도/;

describe("EstimatedUnlistedBlock acquisitionSideOnly — 「평가액 계산」 개방", () => {
  it("UI-AS-1: 입력 방식 토글이 보인다", () => {
    render(<EstimatedUnlistedBlock form={makeForm()} onChange={() => {}} acquisitionSideOnly />);
    expect(screen.getByText("계산결과 입력")).toBeInTheDocument();
    expect(screen.getByText("평가액 계산")).toBeInTheDocument();
  });

  it("UI-AS-2: 사례 49 액면가 토글은 숨는다", () => {
    render(
      <EstimatedUnlistedBlock form={makeForm({ unlistedValuationMode: "full" })} onChange={() => {}} acquisitionSideOnly />,
    );
    expect(screen.queryByText(/장부분실 — 액면가 적용/)).toBeNull();
  });

  it("UI-AS-3: full → 결산서는 취득 열만, 양도 열·1주당 직접 입력 칸 없음", () => {
    render(
      <EstimatedUnlistedBlock
        form={makeForm({ unlistedValuationMode: "full", ...ACQ_STATEMENT })}
        onChange={() => {}}
        acquisitionSideOnly
      />,
    );
    expect(screen.getByText(/순손익 계산서 .*취득연도\)/)).toBeInTheDocument();
    expect(screen.getByText(/순자산가액 계산서 .*취득연도\)/)).toBeInTheDocument();
    expect(screen.getAllByText(EU_ACQ_HEADER).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryAllByText(EU_TRANSFER_HEADER)).toHaveLength(0);
    expect(screen.queryByText("1주당 순손익가치 (취득시점)")).toBeNull();
    expect(screen.queryByText("1주당 순자산가치 (취득시점)")).toBeNull();
  });

  it("UI-AS-4: stale acqFaceValueOnly가 남아도 취득 열이 보인다", () => {
    render(
      <EstimatedUnlistedBlock
        form={makeForm({ unlistedValuationMode: "full", acqFaceValueOnly: true, acqFaceValuePerShare: "5000", ...ACQ_STATEMENT })}
        onChange={() => {}}
        acquisitionSideOnly
      />,
    );
    expect(screen.getAllByText(EU_ACQ_HEADER).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByTestId("eu-ni-acq-hidden-notice")).toBeNull();
    expect(screen.queryByTestId("eu-na-acq-hidden-notice")).toBeNull();
  });

  it("UI-AS-5: 취득기준시가 미리보기 = 결산서 산출 260,000 (300,000×3 + 200,000×2)÷5", () => {
    render(
      <EstimatedUnlistedBlock
        form={makeForm({ unlistedValuationMode: "full", ...ACQ_STATEMENT })}
        onChange={() => {}}
        acquisitionSideOnly
      />,
    );
    const preview = screen.getByText(/취득기준시가 \(1주당\)/);
    expect(preview.textContent).toContain("260,000");
  });

  it("UI-AS-6: simple → 1주당 직접 입력 칸 · 결산서 없음 (종전 화면)", () => {
    render(<EstimatedUnlistedBlock form={makeForm()} onChange={() => {}} acquisitionSideOnly />);
    expect(screen.getByText("1주당 순자산가치 (취득시점)")).toBeInTheDocument();
    expect(screen.queryByText(/순자산가액 계산서/)).toBeNull();
  });
});
