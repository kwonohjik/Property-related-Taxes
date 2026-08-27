/**
 * @vitest-environment jsdom
 *
 * ⑤ 「증권시장 밖 거래」 토글이 **시장에 따라 갈린다** — K-OTC(비상장) ↔ ATS(상장)
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Phase G · B-1)
 *
 * ## 실측이 범위를 줄였다 (2026-08-27)
 *
 * 잔여 R-1 은 「상장 벤처의 §78/§178① 방법 축이 없다」였다. 그래서 신규 필드를 만들려 했는데
 * 조문을 끝까지 읽으니 **두 갈래가 시장 축과 1:1 이었다**:
 *
 * · 자본시장법 **§8조의2⑤** — 다자간매매체결회사(ATS)의 매매체결대상상품은
 *   「**증권시장에 상장된 주권**, 그 밖에 대통령령으로 정하는 증권」 ⇒ **상장 전용**
 * · 자본시장법 **§286①5호** — 협회(K-OTC) 업무는
 *   「**증권시장에 상장되지 아니한 주권**의 장외매매거래」 ⇒ **비상장 전용**
 * · 증권거래세법 시행령 **§1조의2①** — 조특법 §14①7호가 가리키는 「방법」은
 *   「자본시장법 시행령 **제78조 또는 제178조제1항**에 따른 기준」 ⇒ 두 갈래
 *
 * ⇒ 필드를 새로 만들 필요가 없다. `isKOTCTrading`(= 그 방법으로 거래했다는 자기선언)은
 *   그대로 두고 **라벨·안내만 시장에 따라 갈면** 축이 정확해진다.
 *
 * ## 왜 라벨이 문제였나
 *
 * 상장 벤처 사용자에게 「K-OTC 거래」라고 물으면 **사실과 다르므로 켜지 않는다** — 그러면
 * 조특법 §14①7호 비과세를 못 받는다(납세자에게 불리). 종전 안내는 **켠 뒤에만** 떴다.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanyTypeBlock } from "@/components/calc/stock-transfer/CompanyTypeBlock";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return { ...createInitialStockFormData(), marketType: "unlisted", ...o };
}

describe("OV-1 비상장 — K-OTC", () => {
  it("OV-1-1: 토글 제목이 K-OTC 다", () => {
    render(<CompanyTypeBlock form={form({ marketType: "unlisted" })} onChange={() => {}} />);
    expect(screen.getByText("K-OTC 거래")).toBeTruthy();
  });
});

describe("OV-2 상장 — ATS", () => {
  it("OV-2-1: 토글 제목이 ATS 다 — 상장주식에 「K-OTC 거래」를 물으면 안 켠다", () => {
    render(<CompanyTypeBlock form={form({ marketType: "kospi" })} onChange={() => {}} />);
    expect(screen.getByText("ATS(다자간매매체결회사) 거래")).toBeTruthy();
    expect(screen.queryByText("K-OTC 거래")).toBeNull();
  });

  it("OV-2-2: **켜기 전에도** 벤처 비과세 안내가 보인다 (종전에는 켠 뒤에만)", () => {
    render(<CompanyTypeBlock form={form({ marketType: "kospi", isKOTCTrading: false })} onChange={() => {}} />);
    expect(screen.getByText(/조특법 §14①7호\s*\n?\s*비과세 대상이므로 이 토글을 켜세요|비과세 대상이므로 이 토글을 켜세요/)).toBeTruthy();
  });

  it("OV-2-3: 켠 상태에서는 나목 단서 미적용 경고가 유지된다", () => {
    render(<CompanyTypeBlock form={form({ marketType: "kospi", isKOTCTrading: true })} onChange={() => {}} />);
    expect(screen.getByText(/나목 단서/)).toBeTruthy();
  });
});
