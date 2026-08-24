/**
 * anchor: §77 농특세 비과세 플래그의 **입력 경로 배관** (④⑫⑭)
 *
 * 「농어촌특별세법 시행령」 §4①1호는 §77 감면의 농특세 비과세를 「**직접 경작한 토지**로 한정」한다.
 * 엔진이 그 사실을 알아야 비과세가 되는데, **입력 경로가 없으면 자경 농민은 예외를 주장할 방법이
 * 없다**(감면세액 × 20%가 그대로 붙는다).
 *
 * 이 anchor는 **UI 체크 → 엔진 도달**의 세 이음매를 잇는지 확인한다:
 * - ④ `lib/calc/transfer-tax-api.ts` — 감면 항목의 `expropriationSelfCultivated`를 **자산 수준**
 *   `isSelfCultivatedExpropriatedLand`로 올린다
 * - ⑫ `lib/api/transfer-tax-schema.ts` — Zod 입력 객체에 필드가 **있어야** 통과 후에도 살아남는다
 *   (없으면 조용히 strip되어 세액이 안 바뀐다 — TypeScript가 못 잡는 층)
 * - ⑭ `app/api/calc/transfer/engine-input.ts` — 엔진 input 매핑
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const BASE = {
  propertyType: "land" as const,
  transferDate: "2026-03-01",
  acquisitionDate: "2012-01-01",
  transferPrice: 2_000_000_000,
  acquisitionPrice: 400_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  transferCause: "public_expropriation",
  reductions: [
    {
      type: "public_expropriation",
      cashCompensation: 2_000_000_000,
      bondCompensation: 0,
      bondHoldingYears: null,
      businessApprovalDate: "2024-01-01",
    },
  ],
};

async function call(over: object = {}) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...BASE, ...over }),
    }),
  );
  const json = await res.json();
  return { status: res.status, data: json.data?.result, error: json.error };
}

/** 농특세 = 총부담세액 − (결정세액 + 지방소득세) */
function surtaxOf(d: { totalTax: number; determinedTax: number; localIncomeTax: number }) {
  return d.totalTax - (d.determinedTax + d.localIncomeTax);
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("§77 농특세 자경 플래그 — ④⑫⑭ 배관", () => {
  it("PL-01: 미전달이면 농특세가 부과된다 (비과세는 예외 — 입증 필요)", async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.data.reductionAmount).toBe(67_700_250);
    expect(surtaxOf(r.data)).toBe(13_540_050);
  });

  it("PL-02: 🔴 플래그가 **Zod를 통과해 엔진까지** 도달한다 (⑫에서 strip되면 이 값이 안 바뀐다)", async () => {
    const r = await call({ isSelfCultivatedExpropriatedLand: true });
    expect(r.status).toBe(200);
    expect(r.data.reductionAmount).toBe(67_700_250); // 감면 자체는 불변
    expect(surtaxOf(r.data)).toBe(0);
  });

  it("PL-03: false를 명시해도 과세다 (미입력과 같은 취급)", async () => {
    const r = await call({ isSelfCultivatedExpropriatedLand: false });
    expect(surtaxOf(r.data)).toBe(13_540_050);
  });
});
