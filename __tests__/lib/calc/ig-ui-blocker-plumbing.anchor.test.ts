/**
 * 상속·증여 UI 리뷰 BLOCKER — ⑫Zod·⑬body 침묵 stripping anchor.
 *
 * 이 3건은 **TypeScript가 잡지 못한다**(루트 CLAUDE.md 「⑫⑬⑭는 tsc 미감지」).
 * 값이 조용히 사라져 엔진이 legacy 기본값으로 떨어지므로, 스키마 왕복(parse)으로 고정한다.
 *
 * - IG(c07-1·c14-1): 가업상속 `openingDate`·`heirOfficerAppointDate`가 Zod에서 strip → 자동판정 사망
 * - IG(c17-1): 비상장 V2 상호출자 `bookValue`·`counterparty`가 strip → 연립방정식 미발동
 * - IG(c08-1): ⑬ body에 `filingPenalty` 누락 → 상속 가산세가 조용히 0
 */
import { describe, it, expect } from "vitest";
import { familyBusinessInheritanceInputSchema } from "@/lib/validators/family-business-inheritance-schema";

describe("⑫ 가업상속 Zod — 자동판정 날짜 2종 보존", () => {
  const BASE = {
    businessType: "corporate" as const,
    operatingYears: 15,
    enterpriseSize: "sme" as const,
    isEligibleIndustry: true,
    decedentCEORequirementMet: false,
    heirIsAdult: true,
    heirTwoYearEngagement: true,
    heirOfficerByFilingDeadline: true,
    heirCEOWithinTwoYears: true,
    unrelatedAssetsAcknowledged: true,
    postManagementAcknowledged: true,
  };

  it("P-1 · openingDate가 parse 후에도 살아남는다 (피상속인 나목 자동판정 기준일)", () => {
    const parsed = familyBusinessInheritanceInputSchema.parse({
      ...BASE,
      openingDate: "2005-01-01",
      decedentCEOPeriods: [{ startDate: "2005-01-01", endDate: "2020-12-31" }],
    });
    expect("openingDate" in parsed).toBe(true);
    expect(parsed.openingDate).toBe("2005-01-01");
    // 짝이 되는 재직구간은 종전에도 살아 있었다 — 기준일만 사라지는 «비대칭»이 결함이었다
    expect(parsed.decedentCEOPeriods).toHaveLength(1);
  });

  it("P-2 · heirOfficerAppointDate가 parse 후에도 살아남는다 (상속인 다목 임원취임)", () => {
    const parsed = familyBusinessInheritanceInputSchema.parse({
      ...BASE,
      heirOfficerAppointDate: "2019-03-02",
    });
    expect("heirOfficerAppointDate" in parsed).toBe(true);
    expect(parsed.heirOfficerAppointDate).toBe("2019-03-02");
  });

  it("P-3 · 서식 표시 전용 필드는 strip돼도 무방 — 계산에 쓰이지 않는다", () => {
    // UI가 폼 상태에서 직접 렌더하므로 서버 왕복이 필요 없다.
    // 이 단언은 「전부 추가」로 과잉 대응하지 않았음을 고정한다.
    const parsed = familyBusinessInheritanceInputSchema.parse({
      ...BASE,
      businessRegistrationNumber: "123-45-67890",
      representativeName: "홍길동",
    }) as Record<string, unknown>;
    expect("businessRegistrationNumber" in parsed).toBe(false);
    expect("representativeName" in parsed).toBe(false);
  });
});

describe("⑫ 비상장 V2 Zod — 상호출자 counterparty 보존", () => {
  const HOLDING = {
    rowId: "r1",
    issuerCorpName: "상대법인",
    holdingShares: 3_000,
    totalShares: 10_000,
    // 10% 초과 경로 — 종전에는 이 둘이 통째로 strip됐다
    bookValue: 500_000_000,
    counterparty: {
      netAssetExStock: 8_000_000_000,
      totalLiabilities: 3_000_000_000,
      issuedShares: 10_000,
      netIncomePerShare: 12_000,
      isRealEstateHeavy: false,
      netAssetOnly: false,
      crossHeldOfTarget: 1_500,
    },
  };

  /**
   * 전체 V2 스키마는 필수 필드가 많아(fiscalYears 4기 등) 픽스처가 비대해진다.
   * 검증 대상은 `otherUnlistedHoldings` 배열 요소이므로 그 서브스키마만 꺼내 왕복시킨다.
   */
  async function holdingSchema() {
    const { unlistedStockValuationV2Schema: S } = await import(
      "@/lib/validators/unlisted-stock-valuation-v2.schema"
    );
    const s = S as unknown as {
      shape?: Record<string, unknown>;
      _def?: { schema?: { shape?: Record<string, unknown> } };
    };
    const shape = s._def?.schema?.shape ?? s.shape;
    const oh = shape?.otherUnlistedHoldings as {
      unwrap?: () => unknown;
    };
    const inner = (oh?.unwrap ? oh.unwrap() : oh) as {
      element?: { safeParse: (v: unknown) => { success: boolean; data?: Record<string, unknown> } };
    };
    const el = inner.element;
    expect(el, "otherUnlistedHoldings element 스키마를 찾지 못했다").toBeDefined();
    return el!;
  }

  it("P-4 · bookValue·counterparty 7필드가 parse 후에도 살아남는다", async () => {
    const el = await holdingSchema();
    const r = el.safeParse(HOLDING);

    expect(r.success).toBe(true);
    expect(r.data?.bookValue).toBe(500_000_000);
    expect(r.data?.counterparty).toEqual(HOLDING.counterparty);
    // 7필드가 하나도 빠지지 않았는지 — 부분 보존을 통과시키지 않는다
    expect(Object.keys(r.data?.counterparty as object)).toHaveLength(7);
  });

  it("P-5 · 결손 법인의 음수 1주당 순손익가치를 거부하지 않는다", async () => {
    const el = await holdingSchema();
    const r = el.safeParse({
      ...HOLDING,
      counterparty: { ...HOLDING.counterparty, netIncomePerShare: -4_000 },
    });

    expect(r.success).toBe(true);
    expect((r.data?.counterparty as Record<string, unknown>).netIncomePerShare).toBe(-4_000);
  });
});

describe("⑬ 상속 API body — filingPenalty 누락 회귀", () => {
  it("P-6 · callInheritanceTaxAPI가 filingPenalty를 body에 싣는다", async () => {
    const captured: { body?: Record<string, unknown> } = {};
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: null }),
      } as unknown as Response;
    }) as typeof fetch;

    try {
      const { callInheritanceTaxAPI } = await import("@/lib/calc/inheritance-api");
      await callInheritanceTaxAPI({
        decedentType: "resident",
        deathDate: new Date("2026-01-01"),
        estateItems: [],
        heirs: [],
        filingPenalty: {
          filingType: "late",
          unpaidAmount: 10_000_000,
          statutoryDueDate: new Date("2026-07-31"),
        },
      } as never);
    } finally {
      globalThis.fetch = origFetch;
    }

    // 🔴 종전에는 body 키 목록에 filingPenalty가 없어 가산세가 조용히 0이었다.
    expect(captured.body).toBeDefined();
    expect("filingPenalty" in (captured.body ?? {})).toBe(true);
    expect(captured.body?.filingPenalty).toMatchObject({ unpaidAmount: 10_000_000 });
  });
});
