/**
 * @vitest-environment jsdom
 *
 * 주식 «예정신고 + 다반기 합산» 안내 — Step3 배선 anchor (V-10 · Q-1 a)
 *
 * 계획서: docs/00-pm/stock-prelim-multihalf-v10.plan.md
 * 판정 순수 함수는 `__tests__/calc/stock-prelim-multi-period.anchor.test.ts`가 본다. 여기서는 **Step3에 실제로 배선됐는지**와
 * 노출 조건(예정 + 확정 종목 있음 + 서로 다른 반기)을 렌더로 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "unlisted",
    transferDate: "2025-09-01",
    filingType: "preliminary",
    ...o,
  };
}

const NOTICE = "stock-prelim-multi-period-notice";

describe("PS-1 예정 + 확정 종목이 다른 반기 — 안내가 뜬다", () => {
  it("PS-1-1 상반기 종목을 확정하고 하반기 종목을 편집 중이면 두 반기를 말한다", () => {
    render(
      <Step3
        form={form({ transferDate: "2025-09-01" })}
        savedItems={[form({ transferDate: "2025-03-01" })]}
        onChange={() => {}}
      />,
    );
    const box = screen.getByTestId(NOTICE);
    expect(box.textContent).toContain("2025년 상반기");
    expect(box.textContent).toContain("2025년 하반기");
    expect(box.textContent).toContain("과세기간 전체를 합산한 누계");
    expect(box.textContent).toContain("§107②");
  });

  it("PS-1-2 분할 매도 종목은 가장 이른 매도 lot 일자로 반기를 잰다", () => {
    render(
      <Step3
        form={form({
          lotsMode: "split",
          transferLots: [
            { id: "t1", transferDate: "2025-09-15", shareCount: "1", perShareTransferPrice: "1" },
          ],
        } as Partial<StockTransferFormData>)}
        savedItems={[form({ transferDate: "2025-03-01" })]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId(NOTICE).textContent).toContain("2025년 하반기");
  });
});

describe("PS-2 안내가 뜨면 안 되는 입력", () => {
  it("PS-2-1 같은 반기 다종목", () => {
    render(
      <Step3 form={form({ transferDate: "2025-05-10" })} savedItems={[form({ transferDate: "2025-03-01" })]} onChange={() => {}} />,
    );
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it("PS-2-2 확정신고를 골랐으면 해당 없다(과세기간 전체를 합산하는 유형)", () => {
    render(
      <Step3
        form={form({ filingType: "final", transferDate: "2025-09-01" })}
        savedItems={[form({ filingType: "final", transferDate: "2025-03-01" })]}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it("PS-2-3 확정된 종목이 없으면(단건) 합산이 아니다", () => {
    render(<Step3 form={form({ transferDate: "2025-09-01" })} onChange={() => {}} />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });
});
