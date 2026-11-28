/**
 * @vitest-environment jsdom
 *
 * 외국납부세액 처리 방법 라벨 = 법령 상수 조립 (계획서 이슈 4 · UI-0)
 *
 * 종전 `foreign-options.ts`는 «세액공제 (§118의6①1호)»·«필요경비 산입 (§118의6①2호)»를 문자열 리터럴로 들고 있었다
 * (CLAUDE.md «법령 조문 상수: 문자열 리터럴 금지»). 주식·부동산 두 화면이 이 선택지를 공유하므로
 * 상수(`TRANSFER_FOREIGN_RE.SECTION_118_6_1_1_CREDIT`·`…_1_2_EXPENSE`) 하나에서 조립한다.
 *
 * L-1 주식 화면(`ForeignStockExpenseBlock`) 라디오 라벨이 상수 값을 보인다
 * L-2 부동산 화면(`ForeignTaxSection`) 라디오 라벨이 같은 상수 값을 보인다
 * L-3 소스 가드 — `foreign-options.ts`에 «§118의6» 리터럴이 다시 생기지 않는다
 */
import "fake-indexeddb/auto";
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ForeignStockExpenseBlock } from "@/components/calc/stock-transfer/ForeignStockExpenseBlock";
import { ForeignTaxSection } from "@/components/calc/transfer/foreign/ForeignTaxSection";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { TRANSFER_FOREIGN_RE as RE } from "@/lib/tax-engine/legal-codes/transfer-foreign-realestate";

afterEach(cleanup);

const CREDIT = `세액공제 (${RE.SECTION_118_6_1_1_CREDIT})`;
const EXPENSE = `필요경비 산입 (${RE.SECTION_118_6_1_2_EXPENSE})`;

describe("외국납부세액 처리 방법 라벨 = 법령 상수", () => {
  it("상수 값 — 소득세법 §118의6 ①1호·①2호", () => {
    expect(RE.SECTION_118_6_1_1_CREDIT).toBe("소득세법 §118의6 ①1호");
    expect(RE.SECTION_118_6_1_2_EXPENSE).toBe("소득세법 §118의6 ①2호");
  });

  it("L-1 주식 화면 라디오 라벨", () => {
    const form = { ...createInitialStockFormData(), marketType: "foreign_stock" as const, hasForeignTax: true };
    const t = render(<ForeignStockExpenseBlock form={form} onChange={() => {}} />).container.textContent ?? "";
    expect(t).toContain(CREDIT);
    expect(t).toContain(EXPENSE);
  });

  it("L-2 부동산 화면 라디오 라벨", () => {
    const form = { ...createDefaultTransferFormData(), assetLocation: "foreign" as const, foreignTaxEnabled: true };
    const t = render(<ForeignTaxSection form={form} onChange={() => {}} />).container.textContent ?? "";
    expect(t).toContain(CREDIT);
    expect(t).toContain(EXPENSE);
  });

  it("L-3 소스 가드 — foreign-options.ts에 §118의6 리터럴 없음", () => {
    const src = readFileSync(join(process.cwd(), "components/calc/foreign/foreign-options.ts"), "utf8");
    const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/§118의6/);
  });
});
