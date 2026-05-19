/**
 * EstimatedUnlistedBlock 사례 49 RTL anchor (UI-C49-10~17)
 *
 * 계획서: stock-transfer-case-49-acq-face-value-only.plan.md v3
 * UI Design: .ui.design.md v2
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import {
  createInitialStockFormData,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";

afterEach(() => cleanup());

function makeForm(patch: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return { ...createInitialStockFormData(), ...patch };
}

describe("EstimatedUnlistedBlock — 사례 49 acqFaceValueOnly UI 분기 (UI-C49-10~14)", () => {
  it("UI-C49-10: acqFaceValueOnly=true + full → EUAcq YearColumn 비노출", () => {
    const form = makeForm({
      unlistedValuationMode: "full",
      acqFaceValueOnly: true,
      acqFaceValuePerShare: "5000",
    });
    render(<EstimatedUnlistedBlock form={form} onChange={() => {}} />);
    // EUAcq 컬럼 안내 메시지 노출 (NI/NA 둘 다)
    expect(screen.getByTestId("eu-ni-acq-hidden-notice")).toBeInTheDocument();
    expect(screen.getByTestId("eu-na-acq-hidden-notice")).toBeInTheDocument();
  });

  it("UI-C49-11: simple + acqFaceValueOnly=true → 취득연도 4 필드 비노출 + 안내 배너", () => {
    const form = makeForm({
      unlistedValuationMode: "simple",
      acqFaceValueOnly: true,
      acqFaceValuePerShare: "5000",
    });
    render(<EstimatedUnlistedBlock form={form} onChange={() => {}} />);
    expect(screen.getByTestId("eu-simple-acq-hidden-notice")).toBeInTheDocument();
    // "취득시점" label은 ToggleCard에서 사용되므로 hidden notice의 안내 메시지 확인
    expect(screen.getByTestId("eu-simple-acq-hidden-notice").textContent).toContain(
      UNLISTED_MESSAGES.ACQ_FACE_VALUE_NOTICE,
    );
  });

  it("UI-C49-13: acqFaceValueOnly=true + full → EUTransfer 노출, EUAcq 비노출 (NetIncome)", () => {
    const form = makeForm({
      unlistedValuationMode: "full",
      acqFaceValueOnly: true,
      acqFaceValuePerShare: "5000",
    });
    render(<EstimatedUnlistedBlock form={form} onChange={() => {}} />);
    // EUTransfer 컬럼 노출 — "양도연도 직전 (비상장 §165④)" NI + NA 각 1개씩 = 2개
    expect(screen.getAllByText(/양도연도 직전 \(비상장 §165④\)/)).toHaveLength(2);
    // EUAcq 컬럼 비노출 — "취득연도 직전 (비상장 §165④)"이 없어야 함
    expect(screen.queryByText(/취득연도 직전 \(비상장 §165④\)/)).toBeNull();
  });

  it("UI-C49-14: 액면가 입력 + 양도 NI/NA 입력 → 환산취득가 미리보기 노출", () => {
    const form = makeForm({
      unlistedValuationMode: "simple",
      acqFaceValueOnly: true,
      acqFaceValuePerShare: "5000",
      shareCount: "2000",
      transferYearNetIncomePerShare: "30000",
      transferYearNetAssetPerShare: "80000",
      transferActualInputMode: "total",
      transferTotalPrice: "100000000",
    });
    render(<EstimatedUnlistedBlock form={form} onChange={() => {}} />);
    const conversionPreview = screen.queryByTestId("eu-conversion-preview");
    expect(conversionPreview).toBeInTheDocument();
    // 환산취득가 = 100M × (5000 / 64000) = 7,812,500
    expect(conversionPreview?.textContent).toContain("7,812,500");
  });
});

describe("EstimatedUnlistedBlock — DM-2 우선순위 (UI-C49-17)", () => {
  it("UI-C49-17: shouldSkipNetIncome=true + acqFaceValueOnly=true 동시 → NA 단독이 우선 (전체 비노출)", () => {
    const form = makeForm({
      unlistedValuationMode: "full",
      acqFaceValueOnly: true,
      netAssetOnlyReason: "stock_holding_company",
    });
    render(<EstimatedUnlistedBlock form={form} onChange={() => {}} />);
    // eu-ni-hidden-notice (NA 단독 전체 비노출 안내)가 우선
    expect(screen.getByTestId("eu-ni-hidden-notice")).toBeInTheDocument();
    // eu-ni-acq-hidden-notice (사례 49 EUAcq만 비노출 안내)는 노출 안 됨
    expect(screen.queryByTestId("eu-ni-acq-hidden-notice")).toBeNull();
  });
});
