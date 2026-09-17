/**
 * @vitest-environment jsdom
 *
 * 국외전출세 마법사 — **입력이 그 단계의 주제에 있는가** anchor
 *
 * 계획서: `docs/00-pm/exit-tax-wizard-step-realign.plan.md` (해외주식 계획서 V-3)
 *
 * ## 왜
 *
 * 해외주식과 **같은 구조의 결함**이었다 — 입력이 전부 1단계에 있고 2·3단계가 국내 전용 칸을
 * 다시 내밀었다. 그 칸들은 exit body 에 실리지 않아 **계산에 1원도 가지 않는** 유령 입력이었다.
 *
 * 🔴 **착수 시점 안전망 0** — 국외전출세 E2E 0건 · `ExitTaxBlock` 렌더 테스트 0건(grep 실측).
 *   이 파일이 이 트랙의 **첫 컴포넌트 anchor**다.
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step1 } from "@/app/calc/stock-transfer-tax/steps/Step1";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

const exitForm = (o: Partial<StockTransferFormData> = {}): StockTransferFormData =>
  ({
    ...createInitialStockFormData(),
    marketType: "exit_tax",
    etYearsResidentLast10: "10",
    etDepartureDate: "2025-06-01",
    etIsMajorShareholder: true,
    ...o,
  }) as StockTransferFormData;

const domestic = (): StockTransferFormData =>
  ({ ...createInitialStockFormData(), marketType: "unlisted" }) as StockTransferFormData;

const text = () => document.body.textContent ?? "";

// ============================================================
// EX-1 — Step2 = 보유 종목(간주양도)
// ============================================================

describe("EX-1 국외전출세 Step2 = 보유 종목", () => {
  it("EX-1 🔴 보유 종목 섹션이 2단계에 있다", () => {
    render(<Step2 form={exitForm()} onChange={() => {}} />);
    expect(text()).toContain("보유 종목 — 간주양도 대상 (§178의9)");
  });

  it("EX-1b 🔴 국내 전용 금액칸이 없다 (유령 입력 제거)", () => {
    render(<Step2 form={exitForm()} onChange={() => {}} />);
    expect(screen.queryByText("양도가액 합계")).toBeNull();
    expect(screen.queryByText("취득가액 합계")).toBeNull();
  });
});

// ============================================================
// EX-2 — Step3 = 실양도·납부유예·외국납부세액·보유현황
// ============================================================

describe("EX-2 국외전출세 Step3 = 정산·신고", () => {
  it("EX-2 🔴 실양도·외국납부세액·보유현황 신고가 3단계에 있다", () => {
    render(<Step3 form={exitForm()} onChange={() => {}} />);
    expect(text()).toContain("실양도 정보 — 경정청구용");
    expect(text()).toContain("외국납부세액 있음 (§118의13)");
    expect(text()).toContain("보유현황 신고 (§118의15)");
  });

  it("EX-2b 🔴 국내 필요경비 섹션이 없다", () => {
    render(<Step3 form={exitForm()} onChange={() => {}} />);
    // 국내 Step3 ①「필요경비」 섹션의 고유 라벨 — 제목만 보면 다른 문구에 걸려 구별력이 없다
    expect(screen.queryByText("필요경비 합계")).toBeNull();
    expect(text()).not.toContain("개산공제 자동 적용");
  });
});

// ============================================================
// EX-3 — Step1 = 인적·시점 요건만
// ============================================================

describe("EX-3 국외전출세 Step1", () => {
  it("EX-3 🔴 1단계에 보유 종목·실양도 섹션이 없다", () => {
    render(<Step1 form={exitForm()} onChange={() => {}} />);
    expect(text()).not.toContain("보유 종목 — 간주양도 대상");
    expect(text()).not.toContain("실양도 정보 — 경정청구용");
  });

  it("EX-3b 1단계가 비지 않았다 (양성 짝)", () => {
    render(<Step1 form={exitForm()} onChange={() => {}} />);
    expect(text()).toContain("거주자 요건 (§118의9①1호)");
    expect(text()).toContain("출국일");
    expect(text()).toContain("대주주 요건");
  });
});

// ============================================================
// EX-4 — 기본공제 안내 조문 (§118의10④ · §103①2호 아님)
// ============================================================

describe("EX-4 기본공제 안내는 §118의10④다", () => {
  it("EX-4 🔴 국외전출세 화면은 §118의10④를 인용한다", () => {
    render(<Step3 form={exitForm()} onChange={() => {}} />);
    expect(text()).toContain("§118의10④");
    // §118의10⑤ — 「제92조제2항에 따른 양도소득과세표준과 구분하여 계산한다」
    expect(text()).not.toContain("§103①2호");
  });

  it("EX-4b 국내주식 화면은 그대로 §103①2호다 (양성 짝)", () => {
    render(<Step3 form={domestic()} onChange={() => {}} />);
    expect(text()).toContain("§103①2호");
    expect(text()).not.toContain("§118의10④");
  });
});

// ============================================================
// EX-6 — 다른 트랙 무변경
// ============================================================

describe("EX-6 국내주식은 무변경", () => {
  it("EX-6 Step2 국내 금액칸이 그대로다", () => {
    render(<Step2 form={domestic()} onChange={() => {}} />);
    expect(screen.getByText("양도가액 합계")).toBeTruthy();
    expect(text()).not.toContain("보유 종목 — 간주양도");
  });
});
