/**
 * ⑤④ 「30호 이상」 토글 표시·전송 술어 — 2025 과세연도부터(대통령령 제35352호 부칙 제2조①).
 * 엔진 경계는 __tests__/tax-engine/comprehensive-exclusion-thirty-plus-era.anchor.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { asksThirtyPlusUnits, callComprehensiveApi } from "@/lib/calc/comprehensive-api";
import { defaultFormData, makeProperty } from "@/lib/stores/comprehensive-wizard-store";
import type { ComprehensiveFormData } from "@/lib/stores/comprehensive-wizard-store";

describe("asksThirtyPlusUnits", () => {
  it("1·2·7·8호 유형 · 2025 이상만", () => {
    expect(asksThirtyPlusUnits("public_construction", "2025")).toBe(true);
    expect(asksThirtyPlusUnits("private_purchase_long", "2026")).toBe(true);
    expect(asksThirtyPlusUnits("public_construction", "2024")).toBe(false);
    expect(asksThirtyPlusUnits("existing_rental", "2025")).toBe(false);
    expect(asksThirtyPlusUnits("private_short_term_6y_construction", "2026")).toBe(false);
  });
});

async function rentalInfoOf(year: string): Promise<Record<string, unknown> | undefined> {
  let body: { properties?: { rentalInfo?: Record<string, unknown> }[] } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }),
  );
  const form = {
    ...defaultFormData,
    assessmentYear: year,
    properties: [
      {
        ...makeProperty(),
        assessedValue: "1,000,000,000",
        exclusionType: "public_construction_rental",
        rentalRegistrationType: "public_construction",
        rentalRegistrationDate: "2017-03-01",
        rentalStartDate: "2017-04-01",
        area: "84",
        currentRent: "1,000,000",
        isThirtyPlusUnits: true,
      },
    ],
  } as ComprehensiveFormData;
  try {
    await callComprehensiveApi(form).catch(() => undefined);
  } finally {
    vi.unstubAllGlobals();
  }
  return body.properties?.[0]?.rentalInfo;
}

describe("④ 전송 — 2024 이하는 토글 값을 보내지 않는다", () => {
  it("2025 → isThirtyPlusUnits true · 2024 → 없음", async () => {
    expect((await rentalInfoOf("2025"))?.isThirtyPlusUnits).toBe(true);
    expect((await rentalInfoOf("2024"))?.isThirtyPlusUnits).toBeUndefined();
  });
});
