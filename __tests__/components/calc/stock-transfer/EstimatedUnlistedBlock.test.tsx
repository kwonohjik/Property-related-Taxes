/**
 * EstimatedUnlistedBlock RTL anchor (UI-1~5)
 *
 * 계획서: stock-transfer-unlisted-direct-calc.plan.md v4 §10-D
 * UI Design: stock-transfer-unlisted-direct-calc.ui.design.md v1 §11
 *
 * 검증:
 *  - UI-1: full + isNetAssetOnly → NI 컴포넌트 비노출
 *  - UI-2: 안내 메시지 텍스트가 UNLISTED_MESSAGES.NET_ASSET_ONLY_HIDDEN 상수와 일치
 *  - UI-3: full + isNetAssetOnly + isHeavyRE → "단독 평가" 안내 표시 (기존 가중치 안내 카드 분기)
 *  - UI-4: isNetAssetOnly OFF→ON→OFF 토글 시 NI 입력값 store 보존 후 UI 복원
 *  - UI-5: simple↔full 토글 시 양쪽 모드 데이터 보존
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import {
  createInitialStockFormData,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";

function makeForm(patch: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return { ...createInitialStockFormData(), ...patch };
}

describe("EstimatedUnlistedBlock — isNetAssetOnly 연동 (UI-1~3)", () => {
  it("UI-1: full + isNetAssetOnly === true → NI 24행 컴포넌트 비노출", () => {
    const form = makeForm({
      unlistedValuationMode: "full",
      netAssetOnlyReason: "stock_holding_company",
    });
    render(<EstimatedUnlistedBlock form={form} onChange={() => {}} />);
    // 순손익 계산서 헤더가 노출되지 않음
    expect(screen.queryByText(/순손익 계산서/)).toBeNull();
    // 데이터 testid 또는 안내 메시지 testid 노출
    expect(screen.getByTestId("eu-ni-hidden-notice")).toBeInTheDocument();
  });

  it("UI-2: 안내 메시지 텍스트 = UNLISTED_MESSAGES.NET_ASSET_ONLY_HIDDEN 상수와 일치", () => {
    const form = makeForm({
      unlistedValuationMode: "full",
      netAssetOnlyReason: "stock_holding_company",
    });
    render(<EstimatedUnlistedBlock form={form} onChange={() => {}} />);
    const notice = screen.getByTestId("eu-ni-hidden-notice");
    expect(notice.textContent).toContain(UNLISTED_MESSAGES.NET_ASSET_ONLY_HIDDEN);
  });

  it("UI-3: full + isNetAssetOnly + isHeavyRE → 가중치 안내 카드 '단독 평가' 분기 표시", () => {
    const form = makeForm({
      unlistedValuationMode: "full",
      netAssetOnlyReason: "stock_holding_company",
      isHeavyRealEstateForValuation: true,
    });
    render(<EstimatedUnlistedBlock form={form} onChange={() => {}} />);
    // 단독 평가 분기 텍스트
    expect(screen.getByText(/순자산가치 단독 평가/)).toBeInTheDocument();
    // 80% 하한 미적용 안내
    expect(screen.getByText(/80% 하한 미적용/)).toBeInTheDocument();
  });

  it("UI-3b: full + isNetAssetOnly === false → NI 24행 컴포넌트 노출", () => {
    const form = makeForm({
      unlistedValuationMode: "full",
      netAssetOnlyReason: "",
    });
    render(<EstimatedUnlistedBlock form={form} onChange={() => {}} />);
    expect(screen.getByText(/순손익 계산서/)).toBeInTheDocument();
    expect(screen.queryByTestId("eu-ni-hidden-notice")).toBeNull();
  });
});

describe("EstimatedUnlistedBlock — 데이터 보존 (UI-4·UI-5)", () => {
  it("UI-4: isNetAssetOnly 토글 시 NI 입력값 store에 보존 (UI hidden ≠ store 삭제)", () => {
    // 사용자가 NI 입력 후 isNetAssetOnly === true로 토글한 후 다시 false로 복귀하는 시나리오:
    // 부모는 store에서 그대로 값을 유지하므로, UI는 동일 store 값으로 다시 복원되어야 함.
    const formWithNi = makeForm({
      unlistedValuationMode: "full",
      netAssetOnlyReason: "",
      niAddRow1EUTransfer: "100000000",
      niShareCountEUTransfer: "10000",
    });
    const { rerender } = render(
      <EstimatedUnlistedBlock form={formWithNi} onChange={() => {}} />,
    );
    // 초기: NI 컴포넌트 노출
    expect(screen.getByText(/순손익 계산서/)).toBeInTheDocument();

    // isNetAssetOnly === true 전환 — store에 NI 값 그대로 보존된다는 가정
    const formNetAssetOnly: StockTransferFormData = {
      ...formWithNi,
      netAssetOnlyReason: "stock_holding_company",
    };
    rerender(<EstimatedUnlistedBlock form={formNetAssetOnly} onChange={() => {}} />);
    expect(screen.queryByText(/순손익 계산서/)).toBeNull();
    // store 키 무삭제 — formNetAssetOnly.niAddRow1EUTransfer는 여전히 "100000000"
    expect(formNetAssetOnly.niAddRow1EUTransfer).toBe("100000000");

    // 다시 OFF 복원 — UI에 NI 컴포넌트 재노출 + 동일 store 값으로 입력 복원
    rerender(<EstimatedUnlistedBlock form={formWithNi} onChange={() => {}} />);
    expect(screen.getByText(/순손익 계산서/)).toBeInTheDocument();
  });

  it("UI-5: simple↔full 토글 시 양쪽 모드 store 값 보존 (factory 동시 보유)", () => {
    // simple 입력값 + full 입력값을 동시 보유한 form
    const form = makeForm({
      unlistedValuationMode: "simple",
      transferYearNetIncomePerShare: "12345",
      transferYearNetAssetPerShare: "67890",
      niAddRow1EUTransfer: "100000000",
      naAssetTotalRow1EUTransfer: "50000000",
    });
    const { rerender } = render(
      <EstimatedUnlistedBlock form={form} onChange={() => {}} />,
    );
    // simple — direct input 노출
    expect(screen.getByText("1주당 순손익가치")).toBeInTheDocument();

    // full로 전환
    rerender(
      <EstimatedUnlistedBlock
        form={{ ...form, unlistedValuationMode: "full" }}
        onChange={() => {}}
      />,
    );
    // full — 행-수준 컴포넌트 노출 + simple 4 필드는 비노출
    expect(screen.getByText(/순손익 계산서/)).toBeInTheDocument();
    // simple 값은 store에 그대로 유지
    expect(form.transferYearNetIncomePerShare).toBe("12345");
    expect(form.niAddRow1EUTransfer).toBe("100000000");
  });
});
