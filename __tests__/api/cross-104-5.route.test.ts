/**
 * POST /api/calc/cross-104-5 — §104⑤ 크로스 합산 라우트 (C-3c)
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * ⭐ **세율을 서버가 연도별로 로드한다는 것**이 이 라우트의 존재 이유다.
 *   §55① 누진표는 `effective_date`가 **1990·2018·2021·현행** 넷이라(계획서 C-3c 헤더)
 *   클라이언트 정적 상수를 쓰면 **과거 연도가 조용히 틀린다**. R-2가 그 차이를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/cross-104-5/route";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/calc/cross-104-5", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
    body: JSON.stringify(body),
  });

/** 부동산 1호 2억 + 8호 2.435억 · 기타자산 1호 2억 + 9호 3억 (어댑터 테스트 B-4와 동일) */
const payload = (taxYear: number) => ({
  taxYear,
  realEstate: {
    taxBase: 443_500_000,
    clause1TaxBase: 200_000_000,
    clause1Tax: 56_060_000,
    nblClauseTaxBase: 243_500_000,
    nblClauseTax: 96_940_000,
    clause2Tax: 153_000_000,
  },
  otherAsset: {
    taxBase: 500_000_000,
    clause1TaxBase: 200_000_000,
    clause1Tax: 56_060_000,
    nblClauseTaxBase: 300_000_000,
    nblClauseTax: 124_060_000,
    clause2Tax: 180_120_000,
  },
});

describe("POST /api/calc/cross-104-5", () => {
  it("R-1: 2024년 — 어댑터 테스트 B-4와 **같은 도출값**", async () => {
    const res = await POST(req(payload(2024)));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.merged1Tax).toBe(134_060_000);
    expect(data.merged89Tax).toBe(246_680_000);
    expect(data.clause2Tax).toBe(380_740_000);
    expect(data.clause1Tax).toBe(360_330_000);
    expect(data.applied).toBe("clause2");
    expect(data.calculatedTax).toBe(380_740_000);
    // 두 계산기 단순합 대비 차이
    expect(data.currentSum).toBe(333_120_000);
    expect(data.difference).toBe(47_620_000);
  });

  it("R-2: ⭐ **과세연도가 세율을 바꾼다** — 2020년은 구 §55① 표(1,200만·4,600만 구간)", async () => {
    const now = await POST(req(payload(2024)));
    const past = await POST(req(payload(2020)));
    const a = (await now.json()).data;
    const b = (await past.json()).data;
    // 같은 과세표준인데 세액이 다르다 = 서버가 연도별 표를 실제로 쓰고 있다.
    expect(b.calculatedTax).not.toBe(a.calculatedTax);
  });

  it("R-3: 잘못된 입력은 400", async () => {
    const res = await POST(req({ taxYear: 2024, realEstate: {}, otherAsset: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("R-4: 파싱 불가 본문은 400", async () => {
    const bad = new NextRequest("http://localhost/api/calc/cross-104-5", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
      body: "{",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
  });

  it("R-5: 호별 값이 모두 0이면 1호·2호가 같아진다(합산할 것이 없다)", async () => {
    const res = await POST(
      req({
        taxYear: 2024,
        realEstate: {
          taxBase: 100_000_000, clause1TaxBase: 0, clause1Tax: 0,
          nblClauseTaxBase: 0, nblClauseTax: 0, clause2Tax: 0,
        },
        otherAsset: {
          taxBase: 0, clause1TaxBase: 0, clause1Tax: 0,
          nblClauseTaxBase: 0, nblClauseTax: 0, clause2Tax: 0,
        },
      }),
    );
    const { data } = await res.json();
    expect(data.merged1Tax).toBe(0);
    expect(data.merged89Tax).toBe(0);
    expect(data.clause2Tax).toBe(0);
    // 1호는 과세표준 합계로 계산되므로 값이 있다 → 1호가 이긴다.
    expect(data.clause1Tax).toBeGreaterThan(0);
    expect(data.applied).toBe("clause1");
  });
});
