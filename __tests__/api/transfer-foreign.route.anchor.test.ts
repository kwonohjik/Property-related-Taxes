/**
 * 국외 부동산 양도소득세 route anchor (PR-4 · ⑨⑩⑫⑭)
 *
 * · K-1 교재 사례를 HTTP로: 과세표준 434,500,000 · 산출세액 147,860,000 · 지방소득세 14,786,000
 * · PR-3 2건 합산 188,550,000 (K-14)
 * · W-1 문자열 날짜(JSON 경유)가 ⑭에서 Date로 바뀌어 엔진에 도달한다
 * · 400: 각 refine이 route에서 fieldErrors 키·code와 함께 응답된다 (전수 격자는 `transfer-foreign.parity.test.ts`)
 * · ⑫ 엔진에 칸이 없는 입력(취득원인·외화 차입)은 조용히 strip되지 않고 막힌다
 */
import { describe, it, expect, vi } from "vitest";

const rateLimitMock = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  shouldBypassRateLimit: vi.fn(),
}));
vi.mock("@/lib/api/rate-limit", () => rateLimitMock);
rateLimitMock.checkRateLimit.mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 });
rateLimitMock.getClientIp.mockReturnValue("127.0.0.1");
rateLimitMock.shouldBypassRateLimit.mockReturnValue(false);

import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/foreign/route";
import { aAsset, bAsset, ftax, k1Input, usd } from "../tax-engine/foreign-realestate/_fixtures";
import type { ForeignRealEstateInput } from "@/lib/tax-engine/foreign-realestate/types";

/** 클라이언트 fetch와 같은 직렬화 — Date는 ISO 문자열이 된다 */
const wire = (input: ForeignRealEstateInput): Record<string, unknown> => JSON.parse(JSON.stringify(input));

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer/foreign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}

describe("K-1 교재 사례 — HTTP 200", () => {
  it("과세표준 434,500,000 · 산출세액 147,860,000 · 지방소득세 14,786,000 · 합계 162,646,000", async () => {
    const { status, json } = await post(wire(k1Input()));
    expect(status).toBe(200);
    const r = json.data;
    expect(r.taxCategory).toBe("foreign_realestate");
    expect(r.rows[0].capitalGain).toBe(437_000_000);
    expect(r.longTermDeduction).toBe(0); // §118의8 단서 — 장특 배제
    expect(r.basicDeduction).toBe(2_500_000); // §118의7① — 미등기 배제 단서 없음
    expect(r.taxBase).toBe(434_500_000);
    expect(r.calculatedTax).toBe(147_860_000);
    expect(r.localIncomeTax).toBe(14_786_000);
    expect(r.totalTax).toBe(162_646_000);
    expect(r.appliedLawDate).toBe("2026-07-10");
  });

  it("W-1: 날짜가 문자열로 도달해도 ⑭가 Date로 바꾼다 — 2022-12-31 양도는 구표(§55① 3~5억 공제 25,400,000)라 148,400,000", async () => {
    const input = k1Input({
      assets: [
        aAsset({
          id: "a1",
          transferDate: new Date("2022-12-31T00:00:00Z"),
          transfer: usd(900_000, "2022-12-31", 1_100),
          transferCosts: [usd(30_000, "2022-12-31", 1_100)],
        }),
      ],
    });
    const { status, json } = await post(wire(input));
    expect(status).toBe(200);
    expect(json.data.taxBase).toBe(434_500_000);
    expect(json.data.calculatedTax).toBe(148_400_000); // 현표 147,860,000이면 양도일 시점 세율 로드가 깨진 것
    expect(json.data.appliedLawDate).toBe("2022-12-31");
  });
});

describe("PR-3 2건 합산 (K-14) — HTTP 200", () => {
  it("합계 과세표준 534,500,000 · 산출세액 188,550,000 · 지방소득세 18,855,000 · 기본공제는 먼저 양도한 b에서", async () => {
    const { status, json } = await post(wire(k1Input({ assets: [aAsset(), bAsset()] })));
    expect(status).toBe(200);
    const r = json.data;
    expect(r.taxBase).toBe(534_500_000);
    expect(r.calculatedTax).toBe(188_550_000);
    expect(r.localIncomeTax).toBe(18_855_000);
    const b = r.rows.find((x: { id: string }) => x.id === "b");
    expect(b.basicDeductionAllocated).toBe(2_500_000);
  });
});

describe("외국납부세액 — HTTP", () => {
  it("K-10 세액공제방법: 외국세 40,000,000원(납부일 환율 1,000 × 40,000달러) → 결정세액 107,860,000", async () => {
    const { status, json } = await post(
      wire(k1Input({ foreignTax: { method: "credit", items: [ftax("a1", 40_000, "2026-07-10", 1_000)] } })),
    );
    expect(status).toBe(200);
    expect(json.data.foreignTaxCreditApplied).toBe(40_000_000);
    expect(json.data.determinedTax).toBe(107_860_000);
    expect(json.data.confirmationNeeded).not.toContain("FOREIGN_TAX_CREDIT_FX_DATE_NOT_STATUTORY");
    expect(json.data.appliedRules).toContain("소득세법 시행규칙 §60 ②");
  });

  it("K-12 필요경비 산입방법: 같은 외국세 → 과세표준 394,500,000 · 산출세액 131,860,000", async () => {
    const { json } = await post(
      wire(k1Input({ foreignTax: { method: "expense", items: [ftax("a1", 40_000, "2026-07-10", 1_000)] } })),
    );
    expect(json.data.taxBase).toBe(394_500_000);
    expect(json.data.calculatedTax).toBe(131_860_000);
  });

  it("K-13 외국납부세액 환율 미입력 → 400, 양도일 환율로 대체하지 않는다", async () => {
    const body = wire(k1Input({ foreignTax: { method: "credit", items: [ftax("a1", 40_000, "2026-07-10", 1_000)] } }));
    delete (body.foreignTax as { items: Record<string, unknown>[] }).items[0].exchangeRate;
    const { status, json } = await post(body);
    expect(status).toBe(400);
    expect(Object.keys(json.error.fieldErrors)).toContain("foreignTax.items.0.exchangeRate");
  });
});

describe("거주 5년 미만 — 오류가 아니라 과세대상 아님", () => {
  it("domesticResidenceYears 4 → 200 · not_liable · 세액 0 (K-9)", async () => {
    const { status, json } = await post(wire(k1Input({ domesticResidenceYears: 4 })));
    expect(status).toBe(200);
    expect(json.data.taxCategory).toBe("not_liable");
    expect(json.data.totalTax).toBe(0);
  });
});

describe("400 — route 응답 형태", () => {
  it("환율 0 → 400 INVALID_INPUT · fieldErrors 키는 점 표기", async () => {
    const body = wire(k1Input());
    (body.assets as { transfer: { exchangeRate: number } }[])[0].transfer.exchangeRate = 0;
    const { status, json } = await post(body);
    expect(status).toBe(400);
    expect(json.error.code).toBe("INVALID_INPUT");
    expect(json.error.fieldErrors["assets.0.transfer.exchangeRate"]).toHaveLength(1);
  });

  it("양도차손 + 양도차익 혼재(K-15) → 400 FOREIGN_LOSS_NETTING_UNRESOLVED · 키 assets", async () => {
    const loss = bAsset({}, 100_000, 1_100); // 양도 110,000,000 − 취득 260,000,000
    const { status, json } = await post(wire(k1Input({ assets: [aAsset(), loss] })));
    expect(status).toBe(400);
    expect(json.error.code).toBe("FOREIGN_LOSS_NETTING_UNRESOLVED");
    expect(json.error.fieldErrors.assets[0]).toContain("확인 필요");
  });

  it("전부 양도차손이면 통산할 대상이 없어 200 · 세액 0 (K-7)", async () => {
    const { status, json } = await post(wire(k1Input({ assets: [aAsset({ transfer: usd(300_000, "2026-07-10", 1_100) })] })));
    expect(status).toBe(200);
    expect(json.data.calculatedTax).toBe(0);
    expect(json.data.rows[0].lossAmount).toBe(223_000_000);
  });

  it("과세기간이 다른 2건 → 400 (K-16)", async () => {
    const b2025 = bAsset({ transferDate: new Date("2025-03-05T00:00:00Z"), transfer: usd(300_000, "2025-03-05", 1_200) });
    const { status, json } = await post(wire(k1Input({ assets: [aAsset(), b2025] })));
    expect(status).toBe(400);
    expect(Object.keys(json.error.fieldErrors)).toEqual(["assets.1.transferDate"]);
  });

  it("2020-01-01 전 양도 → 400 (K-25)", async () => {
    const old = aAsset({
      id: "a1",
      acquisitionDate: new Date("2015-01-01T00:00:00Z"),
      transferDate: new Date("2019-12-31T00:00:00Z"),
    });
    const { status, json } = await post(wire(k1Input({ assets: [old] })));
    expect(status).toBe(400);
    expect(Object.keys(json.error.fieldErrors)).toEqual(["assets.0.transferDate"]);
  });

  it("잘못된 날짜 문자열 → 500이 아니라 400 (route의 toDate가 던지기 전에 막는다)", async () => {
    const body = wire(k1Input());
    (body.assets as Record<string, unknown>[])[0].transferDate = "not-a-date";
    const { status, json } = await post(body);
    expect(status).toBe(400);
    expect(Object.keys(json.error.fieldErrors)).toContain("assets.0.transferDate");
  });

  it("JSON이 아닌 본문 → 400 INVALID_JSON", async () => {
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer/foreign", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
  });
});

describe("⑫ 엔진에 칸이 없는 입력 — 조용한 strip 금지", () => {
  it("취득원인 상속 → 400 (매매만 계산)", async () => {
    const body = wire(k1Input());
    (body.assets as Record<string, unknown>[])[0].acquisitionCause = "inheritance";
    const { status, json } = await post(body);
    expect(status).toBe(400);
    expect(Object.keys(json.error.fieldErrors)).toContain("assets.0.acquisitionCause");
  });

  it("외화 차입 취득 true → 400 (환차익 제외 계산식 없음)", async () => {
    const body = wire(k1Input());
    (body.assets as Record<string, unknown>[])[0].foreignBorrowAcquired = true;
    const { status, json } = await post(body);
    expect(status).toBe(400);
    expect(Object.keys(json.error.fieldErrors)).toContain("assets.0.foreignBorrowAcquired");
  });

  it("매매·false 명시는 통과", async () => {
    const body = wire(k1Input());
    Object.assign((body.assets as Record<string, unknown>[])[0], { acquisitionCause: "purchase", foreignBorrowAcquired: false });
    expect((await post(body)).status).toBe(200);
  });

  it("엔진 내부 필드 주입(예: longTermDeduction)은 strip — 장특 0 유지", async () => {
    const body = { ...wire(k1Input()), longTermDeduction: 99_999_999, basicDeduction: 0 };
    const { json } = await post(body);
    expect(json.data.longTermDeduction).toBe(0);
    expect(json.data.basicDeduction).toBe(2_500_000);
  });
});

describe("rate limit", () => {
  it("한도 초과 → 429 + Retry-After, 키는 transfer-foreign:IP", async () => {
    rateLimitMock.checkRateLimit.mockReturnValueOnce({ allowed: false, limit: 30, remaining: 0, resetAt: Date.now() + 30_000 });
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer/foreign", { method: "POST", body: "{}" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(rateLimitMock.checkRateLimit).toHaveBeenLastCalledWith("transfer-foreign:127.0.0.1", expect.objectContaining({ limit: 30 }));
  });
});
