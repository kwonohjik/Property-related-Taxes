/**
 * 겸용 × 부담부증여 — 정적 anchor (⑫ 침묵 strip · prepare 순수성).
 *
 * - ⑫: `burdenedGiftInfoSchema`는 비엄격 `z.object`라 키를 빼먹으면 **조용히 지운다**(TypeScript 미감지). 새 두 키가 살아남는지 파싱으로 고정한다.
 * - 스키마 키 ⊂ 엔진 타입 키: 스키마에만 있는 키는 엔진이 읽지 않는 입력이다(컴파일 타임).
 * - prepare 순수성: 클라이언트(⑧)도 부르는 leaf라 서버 전용 모듈(tax-errors·gift-tax)을 직접 import하면 번들이 끌려온다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { z } from "zod";
import { burdenedGiftInfoSchema } from "@/lib/api/transfer-tax-burdened-gift-schema";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

type SchemaKeys = keyof z.input<typeof burdenedGiftInfoSchema>;
// 스키마 키 ⊂ 엔진 타입 키 — 위반하면 tsc가 `never`에 true를 대입하지 못한다.
export const schemaKeysSubsetOfEngineKeys: Exclude<SchemaKeys, keyof BurdenedGiftInfo> extends never ? true : never = true;

const BASE = {
  valuationMode: "sangjeungbeop_market" as const,
  lendingDepositTotal: 0,
  mortgageDebtAmount: 600_000_000,
  annualRentTotal: 0,
  landStdPriceAtTransfer: 0,
  buildingStdPriceAtTransfer: 1,
  landStdPriceAtAcquisition: 0,
  buildingStdPriceAtAcquisition: 1,
};

describe("겸용 × 부담부증여 — 정적 anchor", () => {
  it("⑫ debtAttribution은 파싱 후에도 살아 있다 (침묵 strip 금지)", () => {
    const out = burdenedGiftInfoSchema.parse({ ...BASE, debtAttribution: { housing: 1, commercial: 2, unallocated: 3 } });
    expect(out.debtAttribution).toEqual({ housing: 1, commercial: 2, unallocated: 3 });
  });
  it("⑫ housingAppraisal은 파싱 후에도 살아 있다 (침묵 strip 금지)", () => {
    const out = burdenedGiftInfoSchema.parse({ ...BASE, housingAppraisal: { exists: true, housingValue: 7 } });
    expect(out.housingAppraisal).toEqual({ exists: true, housingValue: 7 });
  });
  it("⑫ 귀속은 정수·음수 불가", () => {
    expect(burdenedGiftInfoSchema.safeParse({ ...BASE, debtAttribution: { housing: -1, commercial: 0, unallocated: 0 } }).success).toBe(false);
    expect(burdenedGiftInfoSchema.safeParse({ ...BASE, debtAttribution: { housing: 0.5, commercial: 0, unallocated: 0 } }).success).toBe(false);
  });
  it("prepare leaf는 서버 전용 모듈(tax-errors·gift-tax)을 import하지 않는다", () => {
    const src = readFileSync(resolve(__dirname, "../../../lib/tax-engine/mixed-use-burdened-gift-prepare.ts"), "utf8");
    const imports = src.split("\n").filter((l) => /^\s*(import|export)\b.*\bfrom\b/.test(l) || /^\s*\}\s*from\s/.test(l));
    expect(imports.join("\n")).not.toMatch(/tax-errors|gift-tax|burdened-gift-gift-tax/);
  });
});
