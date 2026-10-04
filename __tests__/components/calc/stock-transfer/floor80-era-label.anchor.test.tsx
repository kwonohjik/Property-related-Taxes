/**
 * @vitest-environment jsdom
 *
 * ⑤ 80% 하한 안내 문구도 양도일 연혁을 따른다 (S-1c-3) — 2018.4.1. 이후 양도분부터
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import { createInitialStockFormData, type StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

afterEach(cleanup);

const formOf = (transferDate: string): StockTransferFormData => ({
  ...createInitialStockFormData(),
  marketType: "unlisted",
  transferDate,
});

describe("UI-FE: 산식 안내의 «+ 80% 하한»", () => {
  it("2018-04-01 양도 → 「+ 80% 하한」", () => {
    const { container } = render(<EstimatedUnlistedBlock form={formOf("2018-04-01")} onChange={vi.fn()} />);
    expect(container.textContent).toContain("+ 80% 하한");
  });
  it("2018-03-31 양도 → 「80% 하한 없음」", () => {
    const { container } = render(<EstimatedUnlistedBlock form={formOf("2018-03-31")} onChange={vi.fn()} />);
    expect(container.textContent).toContain("80% 하한 없음");
    expect(container.textContent).not.toContain("+ 80% 하한");
  });
});
