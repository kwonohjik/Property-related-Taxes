/**
 * 취득세 — ⑫가 비워 두게 두던 값 2차분 (2026-09-30 Zod↔엔진 필수 점검 §4.2 A3 · §4.3 A7).
 *
 * - A3 일시적 2주택(「지방세법 시행령」 §28의5) 종전·신규 주택 지역 — 처분기한이 두 지역의 조합으로 정해진다.
 *   비우면 엔진이 둘 다 「비조정」으로 읽어 2022.5.9. 이전 조정+조정의 1년 기한이 3년으로 바뀌었다.
 *   ⑧(`lib/calc/acquisition-tax-validate.ts` step 3)은 이미 요구한다.
 * - A7 수도권 소재(「지방세법 시행령」 §28의2 1호 가목 1억 / 나목 2억) — 엔진은 미입력을 비수도권(2억)으로 읽었다.
 *   조문은 「수도권정비계획법」 §2 1호 수도권에 **소재하는 경우**와 **수도권 외의 지역에 소재하는 경우**로
 *   나눌 뿐 소재지를 추정하는 규정이 없다 — 미입력을 한쪽으로 읽을 법적 근거가 없다. ④는 주택이면
 *   토글 값을 항상 싣는다(false 포함) — 화면 경로는 영향 없다.
 */
import { describe, it, expect, vi } from "vitest";
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
import { validateAcquisitionCrossFields } from "@/lib/calc/acquisition-tax-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/acquisition/shared";

type Json = {
  data?: { totalTax: number; warnings: string[] };
  error?: { details?: Record<string, string[]> };
};
async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/acquisition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}
async function expectRejected(body: unknown, key: string) {
  const r = await post(body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
  expect(Object.keys(r.json.error?.details ?? {})).toContain(key);
}
const without = (o: Record<string, unknown>, ...keys: string[]) => {
  const c = { ...o };
  for (const k of keys) delete c[k];
  return c;
};

// ─────────────────────────────────────────────────────────────────────────────
// A3 — 일시적 2주택 지역
// ─────────────────────────────────────────────────────────────────────────────
const TEMP = {
  propertyType: "housing",
  acquisitionCause: "purchase",
  acquiredBy: "individual",
  reportedPrice: 500_000_000,
  houseCountAfter: 2,
  isRegulatedArea: true,
  isMetropolitanRegion: true,
  balancePaymentDate: "2022-03-01",
  isTemporaryTwoHouse: true,
  previousHouseRegion: "regulated",
  newHouseRegion: "regulated",
};
const deadlineWarning = (w: string[] | undefined) => (w ?? []).find((s) => s.includes("일시적 2주택")) ?? "";

describe("A3 — 일시적 2주택 종전·신규 주택 지역", () => {
  it("🟢 조정+조정(2022.3.1. 잔금) → 200 · 처분기한 1년", async () => {
    const r = await post(TEMP);
    expect(r.status).toBe(200);
    expect(deadlineWarning(r.json.data?.warnings)).toContain("1년 이내");
  });

  it("A3 🔴 종전 주택 지역 없음 → 400 (종전 200 · 처분기한 3년)", async () => {
    await expectRejected(without(TEMP, "previousHouseRegion"), "previousHouseRegion");
  });

  it("A3 🔴 신규 주택 지역 없음 → 400", async () => {
    await expectRejected(without(TEMP, "newHouseRegion"), "newHouseRegion");
  });

  it("🟢 일시적 2주택이 아니면 지역을 요구하지 않는다", async () => {
    const r = await post({
      ...without(TEMP, "previousHouseRegion", "newHouseRegion"),
      isTemporaryTwoHouse: false,
    });
    expect(r.status).toBe(200);
  });

  it("⑧ 거울: 화면도 같은 조합을 막고 · ④ 본문은 ⑫를 통과한다", async () => {
    const form: FormState = {
      ...INITIAL_FORM,
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquiredBy: "individual",
      reportedPrice: "500,000,000",
      houseCountAfter: "2",
      isRegulatedArea: true,
      isMetropolitanRegion: true,
      balancePaymentDate: "2022-03-01",
      isTemporaryTwoHouse: true,
      previousHouseRegion: "",
      newHouseRegion: "regulated",
    };
    expect(validateAcquisitionCrossFields(3, form)).toContain("종전 주택");
    const ok = { ...form, previousHouseRegion: "regulated" };
    expect(validateAcquisitionCrossFields(3, ok)).toBeNull();
    const r = await post(buildAcquisitionTaxBody(ok));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(deadlineWarning(r.json.data?.warnings)).toContain("1년 이내");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A7 — 수도권 소재 (저가주택 중과 배제 한도)
// ─────────────────────────────────────────────────────────────────────────────
const LOW = {
  propertyType: "housing",
  acquisitionCause: "purchase",
  acquiredBy: "individual",
  reportedPrice: 150_000_000,
  houseCountAfter: 3,
  isRegulatedArea: true,
  balancePaymentDate: "2025-03-01",
  wholeHouseStandardValue: 150_000_000,
};

describe("A7 — 저가주택 중과 배제(§28의2 1호)는 수도권 소재 여부가 필요", () => {
  it("🟢 수도권(1억 한도) → 중과 20,100,000 · 🟢 비수도권(2억 한도) → 배제 1,950,000", async () => {
    const metro = await post({ ...LOW, isMetropolitanRegion: true });
    expect(metro.status).toBe(200);
    expect(metro.json.data!.totalTax).toBe(20_100_000);
    const non = await post({ ...LOW, isMetropolitanRegion: false });
    expect(non.status).toBe(200);
    expect(non.json.data!.totalTax).toBe(1_950_000);
  });

  it("A7 🔴 수도권 여부 없음 → 400 (종전 200 · 비수도권으로 읽어 1,950,000)", async () => {
    await expectRejected(LOW, "isMetropolitanRegion");
  });

  it("🟢 전체 주택 시가표준액이 없으면(배제 판정 안 함) 요구하지 않는다", async () => {
    const r = await post(without(LOW, "wholeHouseStandardValue"));
    expect(r.status).toBe(200);
  });

  it("④는 토글 값을 항상 싣는다 — 기본 폼(OFF=비수도권)도 ⑫를 통과한다", async () => {
    const form: FormState = {
      ...INITIAL_FORM,
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquiredBy: "individual",
      reportedPrice: "150,000,000",
      houseCountAfter: "3",
      isRegulatedArea: true,
      balancePaymentDate: "2025-03-01",
      wholeHouseStandardValue: "150,000,000",
    };
    const body = buildAcquisitionTaxBody(form);
    expect(body.isMetropolitanRegion).toBe(false);
    const r = await post(body);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(r.json.data!.totalTax).toBe(1_950_000);
  });
});
