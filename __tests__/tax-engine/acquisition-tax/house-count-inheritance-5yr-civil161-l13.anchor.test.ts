/**
 * anchor: 취득세 주택 수 산정 — 상속 5년 미경과(§28의4⑥3호) 말일에 민법 §161 적용 (L-13)
 *
 * 사용자 결정(2026-10-01): 「상속개시일부터 5년이 지나지 않은」(B 유형 기한)의 말일이 토요일·
 * 공휴일이면 그 익일을 말일로 본다 — 지방세기본법 §23(`PERIOD_CALCULATION_LOCAL_23`) → 민법
 * §161. 소득세법 쪽 쌍둥이 조문(「상속받은 날부터 5년이 경과하지 아니한」, `multi-house-surcharge-count.ts`
 * `isSurchargeExemptInherited`)은 이미 `isWithinDeadline`(§161 반영)을 쓰는데, 취득세 쪽
 * `isExcludedBy5YearRule`만 §161 없는 `isWithinPeriod`를 썼다 — 이 anchor가 그 차이를 고정한다.
 *
 * 부칙<대통령령 제30939호> 제3조의 말일 2025-08-11.은 **월요일**이라 §161이 적용될 여지가 없다 —
 * 그대로 둔다는 것도 사용자 결정이며, 이 파일의 [부칙 2025-08-11 경계] describe가 고정한다.
 *
 * 날짜 사실(research 단계 실측, 이 파일에서 재검증):
 *  - 2021-06-06 상속 → 역상 말일 2026-06-06(토·현충일) → §161 말일 2026-06-08(월)
 *  - 2020-10-05 상속 → 역상 말일 2025-10-05(일) → §161 말일 2025-10-10(금, 추석·한글날 연휴)
 *  - 2021-06-01 상속 → 역상 말일 2026-06-01(월, 평일) — §161 무관 대조군
 *  - 2023-03-04 상속 → 역상 말일 2028-03-04(토) — 공휴일 표의 예정 공휴일 해(2028~2035, 월력요항 미발표)
 *  - 2031-03-04 상속 → 역상 말일 2036-03-04(화) — 공휴일 표(2009~2035) 밖
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  assessInheritance5YearRule,
  isExcludedBy5YearRule,
} from "@/lib/tax-engine/house-count/inheritance";

describe("[leaf] assessInheritance5YearRule / isExcludedBy5YearRule — §161 반영", () => {
  describe("2021-06-06 상속 — 역상 말일 2026-06-06(토·현충일) → §161 말일 2026-06-08(월)", () => {
    it("06-07(일) — §161 연장 덕에 아직 5년 미경과 → 제외(RED on base: 산입으로 오판)", () => {
      const r = assessInheritance5YearRule("2021-06-06", "2026-06-07");
      expect(r.excluded).toBe(true);
      expect(r.note).toContain("지방세기본법 §23");
      expect(r.note).toContain("민법 §161");
    });

    it("06-08(월, 연장된 말일 당일) — 아직 5년 미경과 → 제외(RED on base)", () => {
      const r = assessInheritance5YearRule("2021-06-06", "2026-06-08");
      expect(r.excluded).toBe(true);
      expect(r.note).toBeDefined();
    });

    it("긍정 짝 — 06-09(화, 연장된 말일 다음날) → 5년 경과 → 산입(연장 여부와 무관 — 양쪽 동일)", () => {
      const r = assessInheritance5YearRule("2021-06-06", "2026-06-09");
      expect(r.excluded).toBe(false);
      expect(r.note).toBeUndefined();
    });

    it("boolean 래퍼(isExcludedBy5YearRule)도 같은 판정", () => {
      expect(isExcludedBy5YearRule("2021-06-06", "2026-06-08")).toBe(true);
      expect(isExcludedBy5YearRule("2021-06-06", "2026-06-09")).toBe(false);
    });

    it("mutation guard — 06-05(역상 말일 06-06 이전, 연장이 결과를 바꾸지 않음) → 제외하지만 안내 없음", () => {
      // dl.extended는 true(말일이 토요일)지만 이 target은 연장 없이도 이미 제외 대상이었다 —
      // 「연장이 제외를 만들었을 때만」 안내한다는 게이트가 `dl.extended`만 보도록 느슨해지면
      // 이 케이스에서 note가 잘못 붙는다.
      const r = assessInheritance5YearRule("2021-06-06", "2026-06-05");
      expect(r.excluded).toBe(true);
      expect(r.note).toBeUndefined();
    });
  });

  describe("2020-10-05 상속 — 역상 말일 2025-10-05(일) → §161 말일 2025-10-10(금, 추석·한글날 연휴)", () => {
    it("10-10(금, 연장된 말일) → 아직 5년 미경과 → 제외", () => {
      const r = assessInheritance5YearRule("2020-10-05", "2025-10-10");
      expect(r.excluded).toBe(true);
      expect(r.note).toBeDefined();
    });

    it("긍정 짝 — 10-11(토, 연장된 말일 다음날) → 5년 경과 → 산입", () => {
      const r = assessInheritance5YearRule("2020-10-05", "2025-10-11");
      expect(r.excluded).toBe(false);
    });
  });

  describe("2021-06-01 상속 — 역상 말일 2026-06-01(월, 평일) — §161 무관 대조군(연장 없음)", () => {
    it("06-01(응당일 당일, 평일) → 제외 — 연장 안내 없음(연장이 일어나지 않았다)", () => {
      const r = assessInheritance5YearRule("2021-06-01", "2026-06-01");
      expect(r.excluded).toBe(true);
      expect(r.note).toBeUndefined();
    });

    it("긍정 짝 — 06-02(응당일 다음날) → 산입", () => {
      const r = assessInheritance5YearRule("2021-06-01", "2026-06-02");
      expect(r.excluded).toBe(false);
    });
  });

  describe("2023-03-04 상속 — 역상 말일 2028-03-04(토) — 예정 공휴일 해(2028~2035)", () => {
    it("03-04(토) → 제외 + 예정 공휴일 경고(임시공휴일 미반영을 고지)", () => {
      const r = assessInheritance5YearRule("2023-03-04", "2028-03-04");
      expect(r.excluded).toBe(true);
      expect(r.note).toContain("예정 공휴일");
    });
  });

  describe("2031-03-04 상속 — 역상 말일 2036-03-04(화) — 공휴일 계산표(2009~2035) 밖", () => {
    it("03-04(화, 표 밖) → 제외 + 표 밖 경고(연장 여부 불확실 — 전부 반영 못 함을 고지)", () => {
      const r = assessInheritance5YearRule("2031-03-04", "2036-03-04");
      expect(r.excluded).toBe(true);
      expect(r.note).toContain("계산표에 없어");
    });
  });

  describe("[부칙 2025-08-11 경계] 대통령령 제30939호 부칙 제3조 — 말일이 월요일이라 §161 무관", () => {
    it("2020-08-11 상속(시행 전날) + 기준일 2025-08-11(월, 특례 말일 당일) → 제외 — 그대로 둔다", () => {
      expect(isExcludedBy5YearRule("2020-08-11", "2025-08-11")).toBe(true);
    });

    it("긍정 짝 — 기준일 2025-08-12(화, 특례 말일 다음날) → 산입 — 변경 없음(월요일이라 §161 적용 여지 없음)", () => {
      expect(isExcludedBy5YearRule("2020-08-11", "2025-08-12")).toBe(false);
    });
  });
});

// ============================================================
// [route] 취득세 다주택 중과 — 상속 5년 미경과 제외가 §161 연장을 반영한다
// ============================================================

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/acquisition/route";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import {
  INITIAL_FORM,
  createOwnedHouseInfo,
  type FormState,
  type OwnedHouseInfo,
} from "@/components/calc/acquisition/shared";

beforeEach(() => vi.clearAllMocks());

interface Res {
  appliedRate: number;
  acquisitionTax: number;
  houseCountDetail?: {
    effectiveCount: number;
    referenceDate: string;
    excludedDetails: { reason: string; assetId?: string; description?: string }[];
  };
}

async function postRaw(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/acquisition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as { data?: Res; error?: unknown } };
}

async function calc(form: FormState): Promise<Res> {
  const { status, json } = await postRaw(buildAcquisitionTaxBody(form));
  expect(status, JSON.stringify(json.error)).toBe(200);
  return json.data!;
}

/** 조정대상지역·수도권 5억 매매 — 1주택 1% / 2주택 8% */
function baseForm(over: Partial<FormState> = {}): FormState {
  return {
    ...INITIAL_FORM,
    propertyType: "housing",
    acquisitionCause: "purchase",
    acquiredBy: "individual",
    reportedPrice: "500000000",
    standardValue: "500000000",
    isRegulatedArea: true,
    isMetropolitanRegion: true,
    balancePaymentDate: "2024-06-01",
    houseCountAfter: "1",
    ...over,
  };
}

function row(id: string, over: Partial<OwnedHouseInfo>): OwnedHouseInfo {
  return { ...createOwnedHouseInfo(id), ...over };
}

const inheritedHouse = (inheritanceDate: string) =>
  row("h1", {
    standardValue: "500000000",
    acquisitionDate: "2015-01-01",
    isMetropolitanRegion: true,
    isInherited: true,
    inheritanceDate,
  });

describe("[route] 상속주택 1채 보유 + 산정일 2026-06-08 — §161 연장으로 아직 5년 미경과", () => {
  it("🔴 산정일 2026-06-08 → 상속주택 제외 · 1주택 1% 5,000,000 (RED on base: 2주택 8% 40,000,000)", async () => {
    const r = await calc(baseForm({ balancePaymentDate: "2026-06-08", ownedHouses: [inheritedHouse("2021-06-06")] }));
    expect(r.houseCountDetail?.excludedDetails.map((e) => e.reason)).toContain("inheritance_under_5yr");
    expect(r.houseCountDetail?.effectiveCount).toBe(1);
    expect(r.appliedRate).toBe(0.01);
    expect(r.acquisitionTax).toBe(5_000_000);
    // §161 연장 안내가 제외 사유 설명문에 붙는다
    const detail = r.houseCountDetail?.excludedDetails.find((e) => e.reason === "inheritance_under_5yr");
    expect(detail?.description).toContain("민법 §161");
  });

  it("긍정 짝 — 산정일 2026-06-09(연장된 말일 다음날) → 5년 경과 산입 · 2주택 8% 40,000,000", async () => {
    const r = await calc(baseForm({ balancePaymentDate: "2026-06-09", ownedHouses: [inheritedHouse("2021-06-06")] }));
    expect(r.houseCountDetail?.effectiveCount).toBe(2);
    expect(r.appliedRate).toBe(0.08);
    expect(r.acquisitionTax).toBe(40_000_000);
  });

  it("평일 대조군 — 상속 2021-06-01(말일 2026-06-01 월요일, 연장 없음) + 산정일 2026-06-01 → 제외 · 1%", async () => {
    const r = await calc(baseForm({ balancePaymentDate: "2026-06-01", ownedHouses: [inheritedHouse("2021-06-01")] }));
    expect(r.appliedRate).toBe(0.01);
    const detail = r.houseCountDetail?.excludedDetails.find((e) => e.reason === "inheritance_under_5yr");
    expect(detail?.description).not.toContain("민법 §161");
  });
});
