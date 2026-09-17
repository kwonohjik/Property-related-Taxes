/**
 * @vitest-environment jsdom
 *
 * 해외주식 마법사 — **입력이 그 단계의 주제에 있는가** anchor
 *
 * 계획서: `docs/00-pm/foreign-stock-wizard-step-realign.plan.md`
 *
 * ## 왜
 *
 * 제보 — 「해외 주식은 왜 양도가액·취득가액을 2중으로 입력하는가」.
 * 국외는 금액을 **1단계에서 외화로** 다 넣는데 2·3단계가 **국내 전용 칸을 또** 내밀었다.
 * 그 칸들은 국외 body 에 실리지 않아(실측) **계산에 1원도 가지 않는** 유령 입력이었다.
 *
 * 🔑 검증은 **이미** `validateStep2Foreign`·`validateStep3Foreign` 으로 나뉘어 있었다 —
 *   화면만 1단계에 몰려 있었다. 이 파일은 화면을 그 분할에 맞춰 고정한다.
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step1 } from "@/app/calc/stock-transfer-tax/steps/Step1";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { validateStep2 } from "@/lib/calc/stock-transfer-tax-validate";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "Corp",
    acquisitionDate: "2021-01-02",
    transferDate: "2025-03-01",
    shareCount: "10",
    ...o,
  } as StockTransferFormData;
}

const foreign = (o: Partial<StockTransferFormData> = {}) =>
  form({ marketType: "foreign_stock", yearsResidentInKorea: "10", fgCountryCode: "US", ...o });

const domestic = (o: Partial<StockTransferFormData> = {}) => form({ marketType: "unlisted", ...o });

/** 화면 전체 텍스트 — 라벨은 `<label>`·안내문 어디에 있든 잡는다 */
const text = () => document.body.textContent ?? "";

// ============================================================
// FW-1 — Step2: 국외는 외화 금액, 국내 칸은 없다
// ============================================================

describe("FW-1 해외주식 Step2 = 양도·취득가액(원화 환산)", () => {
  it("FW-1 🔴 외화 양도·취득 입력이 2단계에 있다", () => {
    render(<Step2 form={foreign()} onChange={() => {}} />);
    expect(text()).toContain("양도가액 — 원화 환산");
    expect(text()).toContain("취득가액 — 원화 환산");
    expect(screen.getByText("1주당 양도가액 (외화)")).toBeTruthy();
    expect(screen.getByText("1주당 취득가액 (외화)")).toBeTruthy();
  });

  it("FW-1b 🔴 국내 전용 금액칸이 **사라졌다** (유령 입력 제거)", () => {
    render(<Step2 form={foreign()} onChange={() => {}} />);
    expect(screen.queryByText("양도가액 합계")).toBeNull();
    expect(screen.queryByText("취득가액 합계")).toBeNull();
    expect(screen.queryByText("환산취득가")).toBeNull();
  });
});

// ============================================================
// FW-2 — Step3: 외화 필요경비 + 외국납부세액
// ============================================================

describe("FW-2 해외주식 Step3 = 필요경비·외국납부세액", () => {
  it("FW-2 🔴 외화 필요경비와 외국납부세액이 3단계에 있다", () => {
    render(<Step3 form={foreign()} onChange={() => {}} />);
    expect(screen.getByText("자본적지출액 (외화)")).toBeTruthy();
    expect(screen.getByText("양도비 (외화)")).toBeTruthy();
    expect(text()).toContain("외국납부세액");
  });

  it("FW-2b 🔴 국내 필요경비 칸이 없다", () => {
    render(<Step3 form={foreign()} onChange={() => {}} />);
    expect(screen.queryByText("실제 필요경비")).toBeNull();
  });

  it("FW-2c 공용 섹션은 남는다 — 기본공제·신고·가산세는 국외도 쓴다", () => {
    render(<Step3 form={foreign()} onChange={() => {}} />);
    expect(text()).toContain("기본공제");
    expect(text()).toContain("가산세");
  });
});

// ============================================================
// FW-3 — Step1: 금액 섹션이 없다
// ============================================================

describe("FW-3 해외주식 Step1 = 납세의무·기본 정보만", () => {
  it("FW-3 🔴 1단계에 금액 섹션이 없다", () => {
    render(<Step1 form={foreign()} onChange={() => {}} />);
    expect(text()).not.toContain("양도가액 — 원화 환산");
    expect(text()).not.toContain("취득가액 — 원화 환산");
    expect(screen.queryByText("자본적지출액 (외화)")).toBeNull();
  });

  it("FW-3b 1단계가 비지 않았다 (양성 짝) — 거주기간·주식수는 남는다", () => {
    render(<Step1 form={foreign()} onChange={() => {}} />);
    expect(text()).toContain("국내 거주 연수");
    expect(text()).toContain("양도 주식수");
  });
});

// ============================================================
// FW-4 — 국내 흐름은 현행 그대로 (게이트가 국내를 삼키지 않았는가)
// ============================================================

describe("FW-4 국내주식은 무변경", () => {
  it("FW-4 Step2 국내 금액칸이 그대로다", () => {
    render(<Step2 form={domestic()} onChange={() => {}} />);
    expect(screen.getByText("양도가액 합계")).toBeTruthy();
    expect(text()).not.toContain("양도가액 — 원화 환산");
  });

  it("FW-4b Step3 국내 필요경비 섹션이 그대로다", () => {
    render(<Step3 form={domestic()} onChange={() => {}} />);
    expect(text()).toContain("필요경비");
    expect(screen.queryByText("자본적지출액 (외화)")).toBeNull();
  });
});

// ============================================================
// FW-5 — validate 가 가리키는 필드가 **그 단계 화면에** 있다
//
// §2.4 의 어긋남(2단계 오류가 1단계 필드를 가리킴)이 해소됐음을 «필드 이름»으로 고정한다.
// ⚠️ 이 anchor 는 구현 «후» 추가했다 — Pre-Do 🔴 가 아니다. 구별력은 P-1·P-2 mutation 으로 확인한다.
// ============================================================

describe("FW-5 검증 ↔ 화면 단계 정렬", () => {
  /** validateStep2Foreign 이 검증하는 필드 ↔ 그 필드의 화면 라벨 */
  const STEP2_PAIRS: [field: string, label: string][] = [
    ["transferCurrencyCode", "양도 통화"],
    ["transferExchangeRate", "양도일 기준환율"],
    ["perShareTransferPriceForeign", "1주당 양도가액 (외화)"],
    ["acquisitionCurrencyCode", "취득 통화"],
    ["acquisitionExchangeRate", "취득일 기준환율"],
    ["perShareAcquisitionPriceForeign", "1주당 취득가액 (외화)"],
  ];

  it("FW-5 2단계가 검증하는 필드는 2단계 화면에 있다", () => {
    const empty = foreign({
      transferCurrencyCode: "",
      transferExchangeRate: "",
      perShareTransferPriceForeign: "",
      acquisitionCurrencyCode: "",
      acquisitionExchangeRate: "",
      perShareAcquisitionPriceForeign: "",
    });
    const errFields = new Set(validateStep2(empty).map((e) => e.field));
    // 빈 폼이면 위 필드가 모두 오류로 잡힌다 — 그 전제 자체를 먼저 고정한다
    for (const [field] of STEP2_PAIRS) expect(errFields).toContain(field);

    render(<Step2 form={empty} onChange={() => {}} />);
    for (const [, label] of STEP2_PAIRS) expect(screen.getByText(label)).toBeTruthy();
  });

  it("FW-5b 그 필드들은 1단계 화면에 **없다** (중복 입력 제거)", () => {
    render(<Step1 form={foreign()} onChange={() => {}} />);
    for (const [, label] of STEP2_PAIRS) expect(screen.queryByText(label)).toBeNull();
  });

  it("FW-5c 3단계가 검증하는 외국납부세액 필드는 3단계 화면에 있다", () => {
    render(<Step3 form={foreign({ hasForeignTax: true })} onChange={() => {}} />);
    expect(screen.getByText("외국납부세액 (외화)")).toBeTruthy();
    expect(screen.getByText("납부세액 통화")).toBeTruthy();
    expect(screen.getByText("납세일 기준환율")).toBeTruthy();
  });
});
