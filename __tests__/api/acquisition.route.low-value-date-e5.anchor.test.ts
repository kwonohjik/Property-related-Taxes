/**
 * E-5 (취득세) — 주택 수 산정 경로의 판정일이 중과 배제 경로와 **같은 §20 취득일**이다.
 * 계획서: docs/00-pm/one-house-exemption-fix.plan.md §9.3 E-5.
 *
 * 법령(KoreanLaw MCP 실독 2026-09-27):
 *  - 지방세법 시행령 §28의4①(MST 288831): 「세율 적용의 기준이 되는 1세대의 주택 수는 **주택 취득일
 *    현재** 취득하는 주택을 포함하여 …」. ⑥1호가목: 「제28조의2제1호에 해당하는 주택으로서 **주택 수
 *    산정일 현재** 같은 호 각 목에 따른 해당 주택의 시가표준액 기준을 충족하는 주택」.
 *  - 지방세법 시행령 부칙(대통령령 제35477호, 2025.4.29.) 제2조: 「제28조의2제1호 및 제28조의4제6항
 *    제1호가목의 개정규정은 **2025년 1월 2일 이후 취득하는 주택부터** 적용한다.」 — 두 경로가 **한 부칙
 *    조항**을 공유한다.
 *  - 지방세법 시행령 §20②·⑭: 유상승계취득은 사실상의 잔금지급일에 취득한 것으로 보되, 그 **취득일
 *    전에 등기**한 경우에는 그 등기일에 취득한 것으로 본다.
 *  ⇒ 주택 수 산정일·저가 한도 연혁의 기준일 모두 = 취득하는 주택의 §20 취득일.
 *
 * 수정 전: 중과 배제(§28의2 1호)는 §20 확정 취득일(`determineAcquisitionTiming`)을 썼는데(F1-27f),
 * 주택 수 경로는 ④가 만든 `houseCountInput.referenceDate`(잔금일 → 계약일)를 썼다 — 등기가 잔금보다
 * 앞서면 같은 신고서 안에서 두 경로가 **다른 날**로 한도 연혁을 골랐다.
 *
 * 🔑 ±1일 짝을 2025-01-01/02 경계에 둔다. 등기일 < 잔금일인 시료만이 두 날짜를 가른다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/acquisition/route";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { INITIAL_FORM, createOwnedHouseInfo, type FormState } from "@/components/calc/acquisition/shared";

beforeEach(() => vi.clearAllMocks());

interface Res {
  appliedRate: number;
  acquisitionTax: number;
  houseCountDetail?: { effectiveCount: number; referenceDate: string };
}

async function calc(form: FormState): Promise<Res> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/acquisition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildAcquisitionTaxBody(form)),
    }),
  );
  const json = (await res.json()) as { data?: Res; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!;
}

/** 조정·수도권 5억 매매 + 수도권 외 1.5억 보유주택 1채. 산입이면 2주택 8%, 제외면 1주택 1%. */
const heldNonMetro = (balance: string, registration?: string): FormState => ({
  ...INITIAL_FORM,
  propertyType: "housing",
  acquisitionCause: "purchase",
  acquiredBy: "individual",
  reportedPrice: "500000000",
  standardValue: "500000000",
  isRegulatedArea: true,
  isMetropolitanRegion: true,
  houseCountAfter: "1",
  balancePaymentDate: balance,
  ...(registration ? { registrationDate: registration } : {}),
  ownedHouses: [
    {
      ...createOwnedHouseInfo("h1"),
      standardValue: "150000000",
      acquisitionDate: "2015-01-01",
      isMetropolitanRegion: false,
    },
  ],
});

describe("E-5 — 주택 수 경로의 저가 한도 연혁 = §20 취득일 (등기일 < 잔금일)", () => {
  it("E5-1 🔴 등기 2025-01-01 · 잔금 2025-01-02 → 취득일 2025-01-01 → 전국 1억 → 1.5억 보유주택 산입 · 2주택 8%", async () => {
    const r = await calc(heldNonMetro("2025-01-02", "2025-01-01"));
    expect(r.houseCountDetail?.referenceDate).toBe("2025-01-01");
    expect(r.houseCountDetail?.effectiveCount).toBe(2);
    expect(r.appliedRate).toBe(0.08);
    expect(r.acquisitionTax).toBe(40_000_000);
  });

  it("E5-2 긍정 짝(+1일) — 등기 2025-01-02 · 잔금 2025-01-03 → 취득일 2025-01-02 → 수도권 외 2억 → 제외 · 1%", async () => {
    const r = await calc(heldNonMetro("2025-01-03", "2025-01-02"));
    expect(r.houseCountDetail?.referenceDate).toBe("2025-01-02");
    expect(r.houseCountDetail?.effectiveCount).toBe(1);
    expect(r.appliedRate).toBe(0.01);
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("E5-3 대조군 — 등기가 잔금보다 늦으면 잔금일이 취득일 (종전과 같은 답)", async () => {
    const r = await calc(heldNonMetro("2025-01-02", "2025-01-10"));
    expect(r.houseCountDetail?.referenceDate).toBe("2025-01-02");
    expect(r.houseCountDetail?.effectiveCount).toBe(1);
    expect(r.appliedRate).toBe(0.01);
  });

  it("E5-4 대조군 — 등기일 미입력이면 잔금일 (F1-27a·b와 같은 답)", async () => {
    expect((await calc(heldNonMetro("2025-01-01"))).houseCountDetail?.effectiveCount).toBe(2);
    expect((await calc(heldNonMetro("2025-01-02"))).houseCountDetail?.effectiveCount).toBe(1);
  });
});
