/**
 * PR-24 anchor (2026-11 리뷰 D-57 · D-58) — 법정동코드 없이 주소 문자열만 있을 때의 조정대상지역 판정.
 *
 * - D-57: 일반구가 있는 시를 구 없이(「경기도 성남시 정자동」) 또는 붙여(「성남시분당구」) 쓰면 「미지정(high)」 — 고지 없이 거주요건이 빠져 비과세.
 *   화성(시 엔트리 2022-11-13 해제 · 동탄구 2026-07-01 재지정)·옛 이름 「인천광역시 남구」(2018.7.1. 미추홀구)도 같았다.
 * - D-58: 한 어절 주소(「분당구」·「강남구역삼동123」)는 파싱 실패로 「아님(low)」 — 결정 #60(모르면 조정대상지역으로 보고 확인 필요)과 반대.
 *
 * 고친 뒤: 그날 지정된 구가 있으면 지정 + 「구를 확인하세요」(medium — 결과 고지 대상), 없으면 미지정(high). 한 어절은 아는 시·도면 그 시·도 안
 * 지정 유무, 데이터 미수록 시·도면 직접 확인(low · 아님 — P-B), 모르는 어절이면 그날 지정된 곳이 있을 때 조정대상지역(low).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { checkRegulatedArea } from "@/lib/regulated-area";
import { regulatedAddressAssumptions } from "@/lib/calc/effective-regulated-at-acquisition";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const j = (a: string, d: string) => checkRegulatedArea(a, d);

describe("D-57 일반구 생략·붙여쓰기·화성·옛 이름", () => {
  it.each([
    ["경기도 성남시 정자동 1", "2021-06-01"],
    ["경기도 고양시 행신동 123", "2021-06-01"],
    ["경기도 수원시 장안동 1", "2021-06-01"],
    ["경기도 화성시 동탄동 1", "2026-08-01"],
  ])("%s (%s) → 지정 · medium(구 확인)", (a, d) => {
    expect(j(a, d)).toMatchObject({ isRegulated: true, confidence: "medium" });
    expect(j(a, d).basis).toContain("구를 확인하세요");
  });
  it("붙여 쓴 「성남시분당구」·옛 「인천광역시 남구」는 그 구로 판정(high)", () => {
    expect(j("경기도 성남시분당구 정자동", "2021-06-01")).toMatchObject({ isRegulated: true, confidence: "high" });
    expect(j("인천광역시 남구 학익동 1", "2021-06-01")).toMatchObject({ isRegulated: true, confidence: "high" });
  });
  it("대조 — 모든 구가 해제된 날은 미지정(high) · 띄어 쓴 구는 종전 그대로", () => {
    expect(j("경기도 성남시 정자동 1", "2024-06-01")).toMatchObject({ isRegulated: false, confidence: "high" });
    expect(j("경기도 화성시 동탄동 1", "2024-06-01")).toMatchObject({ isRegulated: false, confidence: "high" });
    expect(j("경기도 성남시 분당구 정자동 1", "2021-06-01")).toMatchObject({ isRegulated: true, confidence: "high" });
    expect(j("인천광역시 미추홀구 학익동 1", "2021-06-01")).toMatchObject({ isRegulated: true, confidence: "high" });
  });
});

describe("D-58 한 어절 주소", () => {
  it.each(["분당구", "강남구역삼동123", "강남구"])("%s → 지정 · low(확인 필요)", (a) => {
    expect(j(a, "2021-06-01")).toMatchObject({ isRegulated: true, confidence: "low" });
  });
  it("아는 시·도 한 어절 — 시·도 전역 엔트리(서울)는 그 판정 · 미수록 시·도(제주)는 아님 + 직접 확인(P-B)", () => {
    expect(j("서울특별시", "2021-06-01")).toMatchObject({ isRegulated: true, confidence: "high" });
    expect(j("제주특별자치도", "2021-06-01")).toMatchObject({ isRegulated: false, confidence: "low" });
  });
  it("수록 시·도인데 시군구가 없으면 그 시·도 안 지정 유무 — 경기도 2021 지정 있음 / 2024-06-01 경기도 지정 없음", () => {
    expect(j("경기도", "2021-06-01")).toMatchObject({ isRegulated: true, confidence: "low" });
    expect(j("경기도", "2024-06-01")).toMatchObject({ isRegulated: false, confidence: "high" });
  });
  it("모르는 어절이어도 그날 지정된 곳이 하나도 없으면 아님이 확실하다(high)", () => {
    expect(j("분당구", "2010-01-01")).toMatchObject({ isRegulated: false, confidence: "high" });
  });
});

describe("계산기 route — 코드 경로와 주소 문자열 경로가 같은 결론", () => {
  // 1주택 · 취득 2021-06-01(분당 지정 중) · 양도 2024-06-01 · 거주 0 · 9억 — 취득 당시 조정이면 2년 거주요건 미충족으로 과세
  const form = (loc: { regionCode?: string; addressJibun: string }) => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2024-06-01";
    f.isOneHousehold = true;
    f.contractTotalPrice = "900000000";
    f.householdNoPresaleRightsConfirmed = true;
    f.householdNoOtherHousesConfirmed = true;
    f.householdHousingCount = "1";
    Object.assign(f.assets[0], {
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2021-06-01",
      actualSalePrice: "900000000",
      fixedAcquisitionPrice: "600000000",
      regionCode: loc.regionCode ?? "",
      addressJibun: loc.addressJibun,
      residenceInputMode: "direct",
      residencePeriods: [],
      residencePeriodMonthsAsset: "0",
    });
    return f;
  };
  const run = async (f: ReturnType<typeof form>) => {
    let body: Record<string, unknown> = {};
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }) as never;
    try {
      await callTransferTaxAPI(f);
    } catch {
      /* 본문만 */
    } finally {
      globalThis.fetch = real;
    }
    const res = await SINGLE(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    const json = (await res.json()) as { data: { result: { isExempt: boolean; totalTax: number } } };
    return json.data.result;
  };
  it("코드(분당 정자동) = 「경기도 성남시 정자동」 = 「분당구」 — 같은 세액 · 주소 경로는 확인 필요 고지", async () => {
    const code = await run(form({ regionCode: "4113510300", addressJibun: "경기도 성남시 분당구 정자동 1" }));
    expect(code.isExempt).toBe(false);
    for (const a of ["경기도 성남시 정자동 1", "성남시분당구 정자동 1", "분당구"]) {
      const f = form({ addressJibun: a });
      expect((await run(f)).totalTax, a).toBe(code.totalTax);
      expect(regulatedAddressAssumptions(f).some((r) => r.which === "acquisition" && r.isRegulated), a).toBe(true);
    }
  });
});
