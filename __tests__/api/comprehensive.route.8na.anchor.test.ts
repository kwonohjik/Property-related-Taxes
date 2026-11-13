/**
 * anchor — 종부령 §3①8호 나목 1)~4)·7호 단서 화면 파이프라인(⑤⑧④⑫⑭ → 엔진).
 * ⑤·⑧·④는 같은 술어 `na8Asks`(lib/calc/comprehensive-rental-8na.ts)를 쓴다. 엔진 판정은
 * __tests__/tax-engine/comprehensive-exclusion-8ho-na.anchor.test.ts.
 *
 * 조정대상지역 자동 판정(Q-1 a): PNU 앞 10자리 → `governingDesignationStart` → 공고일 대조표.
 *  - 서울 광진구(11215): 2023.1.5. 해제 → 2025.10.16. 재지정(서면-2025-부동산-3811 사실관계와 같은 지역)
 *  - 서울 강남구(11680): 2017.8.3. 이후 해제 없음 → 공고일 2017.11.10.(주택법 부칙 제2조③ · ANNOUNCEMENT_DATES)
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
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn().mockRejectedValue(new Error("offline")) };
});

import { POST } from "@/app/api/calc/comprehensive/route";
import { callComprehensiveApi, validateRequiredExclusionAndLandInputs } from "@/lib/calc/comprehensive-api";
import { resolveRegulated8Na } from "@/lib/calc/comprehensive-rental-8na";
import { defaultFormData, makeProperty } from "@/lib/stores/comprehensive-wizard-store";
import type { ComprehensiveFormData, PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";

const GWANGJIN_PNU = "1121510500100010000";
const GANGNAM_PNU = "1168010100100010000";

type Excl = { excludedCount: number; propertyResults: { failReasons?: string[] }[] };

async function bodyOf(form: ComprehensiveFormData): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }),
  );
  try {
    await callComprehensiveApi(form).catch(() => undefined);
  } finally {
    vi.unstubAllGlobals();
  }
  return body;
}

/** 화면 경로 끝까지 — ⑧ 통과를 먼저 확인하고 ④ 본문을 route에 보낸다 */
async function run(form: ComprehensiveFormData): Promise<Excl> {
  expect(validateRequiredExclusionAndLandInputs(form)).toBeNull();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/comprehensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await bodyOf(form)),
    }),
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { aggregationExclusion: Excl } }).data.aggregationExclusion;
}

const form = (over: Partial<PropertyEntry>, top: Partial<ComprehensiveFormData> = {}): ComprehensiveFormData =>
  ({
    ...defaultFormData,
    assessmentYear: "2026",
    ...top,
    properties: [
      {
        ...makeProperty(),
        assessedValue: "300,000,000",
        exclusionType: "private_purchase_rental_long",
        rentalRegistrationType: "private_purchase_long",
        rentalRegistrationDate: "2020-01-10",
        rentalStartDate: "2021-04-01",
        area: "59",
        currentRent: "1,000,000",
        pnu: GWANGJIN_PNU,
        convertedFromShortTerm: "no",
        ...over,
      },
      { ...makeProperty(), assessedValue: "1,500,000,000" },
    ],
  }) as ComprehensiveFormData;

describe("⑧ 묻는 순서 — 앞 칸 답에 따라 다음 칸", () => {
  it("개인 8호: 취득일 → (2018.9.13. 뒤면) 보유 주택 → (보유면) 조정대상지역", () => {
    expect(validateRequiredExclusionAndLandInputs(form({}))).toMatch(/임대주택 취득일/);
    expect(validateRequiredExclusionAndLandInputs(form({ rentalAcquisitionDate: "2018-09-13" }))).toBeNull();
    expect(validateRequiredExclusionAndLandInputs(form({ rentalAcquisitionDate: "2021-03-01" }))).toMatch(/다른 주택을 보유/);
    expect(
      validateRequiredExclusionAndLandInputs(form({ rentalAcquisitionDate: "2021-03-01", householdOwnedAtAcquisition: "no" })),
    ).toBeNull();
  });
  it("주소(PNU)가 없으면 자동 판정이 안 돼 직접 입력을 요구한다", () => {
    const f = form({ rentalAcquisitionDate: "2021-03-01", householdOwnedAtAcquisition: "yes", pnu: "" });
    expect(validateRequiredExclusionAndLandInputs(f)).toMatch(/조정대상지역 여부/);
    const manual = form({
      rentalAcquisitionDate: "2021-03-01",
      householdOwnedAtAcquisition: "yes",
      pnu: "",
      regulated8NaMode: "manual",
      regulatedAtAssessment: "yes",
    });
    expect(validateRequiredExclusionAndLandInputs(manual)).toMatch(/공고일/);
  });
  it("단기 변경신고 여부를 비우면 막는다(4)) · 공공지원 건설 7호도 같다", () => {
    expect(validateRequiredExclusionAndLandInputs(form({ rentalAcquisitionDate: "2017-01-01", convertedFromShortTerm: "" }))).toMatch(
      /변경신고한 주택인지/,
    );
    expect(
      validateRequiredExclusionAndLandInputs(
        form({
          exclusionType: "public_support_construction_rental",
          rentalRegistrationType: "public_support_construction",
          convertedFromShortTerm: "yes",
        }),
      ),
    ).toMatch(/변경신고일/);
  });
  it("2020 과세연도(3)·4) 신설 전)에는 변경신고를 묻지 않는다", () => {
    expect(
      validateRequiredExclusionAndLandInputs(form({ rentalAcquisitionDate: "2017-01-01", convertedFromShortTerm: "" }, { assessmentYear: "2020" })),
    ).toBeNull();
  });
});

describe("④ 조정대상지역 자동 판정(PNU)", () => {
  it("광진구 2026 → 조정 · 공고일 2025-10-16(재지정) · 2024 → 아님", () => {
    const p = form({}).properties[0];
    expect(resolveRegulated8Na(p, "2026-06-01")).toMatchObject({ regulated: true, noticeDate: "2025-10-16" });
    expect(resolveRegulated8Na(p, "2024-06-01")).toMatchObject({ regulated: false });
  });
  it("강남구 → 공고일 2017-11-10(효력 2017-08-03 → 주택법 공고)", () => {
    expect(resolveRegulated8Na(form({ pnu: GANGNAM_PNU }).properties[0], "2026-06-01")).toMatchObject({
      regulated: true,
      noticeDate: "2017-11-10",
    });
  });
});

describe("⑫⑭ → 엔진 (화면 경로 끝까지)", () => {
  const NA1 = { rentalAcquisitionDate: "2021-03-01", householdOwnedAtAcquisition: "yes" as const };

  it("1) ★ 강남(공고 2017) 2021 취득 → 불성립 · 광진(재지정 공고 2025.10.16.) 2021 취득 → 괄호 예외로 성립", async () => {
    const gangnam = await run(form({ ...NA1, pnu: GANGNAM_PNU }));
    expect(gangnam.excludedCount).toBe(0);
    expect(gangnam.propertyResults[0].failReasons).toContain(E.EXCLUDED_8NA1_REGULATED_NEW_ACQ);
    expect((await run(form(NA1))).excludedCount).toBe(1);
  });

  it("1) 무주택 세대 취득이면 성립", async () => {
    expect((await run(form({ ...NA1, pnu: GANGNAM_PNU, householdOwnedAtAcquisition: "no" }))).excludedCount).toBe(1);
  });

  it("2) ★ 법인 강남 2021 신청 → 불성립 · 세무서 신청일을 묻는다", async () => {
    const corp = (over: Partial<PropertyEntry>) =>
      // 등록일이 2020.7.11. 뒤라 3) 아파트 여부도 묻는다 — 아파트 아님
      form({ pnu: GANGNAM_PNU, rentalRegistrationDate: "2021-03-10", rentalApplicationDate: "2021-03-01", isApartment: "no", ...over }, {
        taxpayerType: "corporate",
      });
    expect(validateRequiredExclusionAndLandInputs(corp({}))).toMatch(/세무서 사업자등록/);
    const r = await run(corp({ businessRegistrationApplicationDate: "2021-03-01" }));
    expect(r.excludedCount).toBe(0);
    expect(r.propertyResults[0].failReasons).toContain(E.EXCLUDED_8NA2_CORP_REGULATED_APP);
  });

  it("3) ★ 아파트 2020-07-20 신청 → 불성립 · 07-10 신청 → 성립", async () => {
    const apt = (app: string) =>
      form({ rentalAcquisitionDate: "2017-01-01", rentalRegistrationDate: "2020-07-30", isApartment: "yes", rentalApplicationDate: app });
    expect(validateRequiredExclusionAndLandInputs(apt(""))).toMatch(/등록 신청일/);
    expect((await run(apt("2020-07-20"))).excludedCount).toBe(0);
    expect((await run(apt("2020-07-10"))).excludedCount).toBe(1);
  });

  it("4) ★ 2020-07-20 단기→장기 변경신고 → 불성립", async () => {
    const r = await run(form({ rentalAcquisitionDate: "2017-01-01", convertedFromShortTerm: "yes", shortTermConversionDate: "2020-07-20" }));
    expect(r.excludedCount).toBe(0);
    expect(r.propertyResults[0].failReasons).toContain(E.EXCLUDED_SHORT_TO_LONG_AFTER_0711);
  });
});
