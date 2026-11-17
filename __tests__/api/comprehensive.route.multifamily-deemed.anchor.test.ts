/**
 * anchor — 종부령 §3①1호·2호 다가구, 2020.2.11. 전 세무서 사업자등록만 한 경우(T-14 · PR-2 배관) — 화면 경로(⑤술어 → ⑧ → ④ → ⑫⑭ → 엔진).
 * 술어·⑧·④는 lib/calc/comprehensive-rental-multifamily.ts 한 곳 · 엔진 판정은 __tests__/tax-engine/comprehensive/comprehensive-exclusion-multifamily-deemed.anchor.test.ts.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-multifamily-deemed.plan.md §3.2 · §4(M1·M3·M4·M7~M12) · §7(⑧↔⑫ 격자)
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
import {
  asksDeemedMultiFamilyToggle,
  deemedMultiFamilyApplies,
  suggestsMultiFamilyInputFirst,
} from "@/lib/calc/comprehensive-rental-multifamily";
import { defaultFormData, makeProperty } from "@/lib/stores/comprehensive-wizard-store";
import type { ComprehensiveFormData, PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";

type Excl = { excludedCount: number; propertyResults: { failReasons?: string[]; warnings?: string[] }[] };
type Body = { properties: { rentalInfo: Record<string, unknown> }[] };

async function bodyOf(f: ComprehensiveFormData): Promise<Body> {
  let body = { properties: [] } as Body;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }),
  );
  try {
    await callComprehensiveApi(f).catch(() => undefined);
  } finally {
    vi.unstubAllGlobals();
  }
  return body;
}

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/calc/comprehensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

async function run(f: ComprehensiveFormData): Promise<Excl> {
  expect(validateRequiredExclusionAndLandInputs(f)).toBeNull();
  const res = await post(await bodyOf(f));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { aggregationExclusion: Excl } }).data.aggregationExclusion;
}

const U3 = (value = "250,000,000") =>
  ["1층", "2층", "3층"].map((label) => ({ label, area: "40", officialValue: value }));

/** 2호 민간매입 · 지방 · 건물 7.5억(3구 각 2.5억) · 세무서 2015 · 지자체 등록일 없음 · 다가구 입력 ON + 토글 ON · 전환 없음 · 2025 과세 */
const entry = (over: Partial<PropertyEntry> = {}): PropertyEntry =>
  ({
    ...makeProperty(),
    assessedValue: "750,000,000",
    exclusionType: "private_purchase_rental_short",
    rentalRegistrationType: "private_purchase_short",
    rentalRegistrationDate: "",
    businessRegistrationDate: "2015-03-01",
    rentalStartDate: "2015-07-01",
    area: "150",
    location: "non_metro",
    currentRent: "1,000,000",
    multiFamilyEnabled: true,
    floorUnits: U3(),
    deemedMultiFamily: true,
    deemedNoConversionAfterCutoff: "yes",
    ...over,
  }) as PropertyEntry;

const form = (over: Partial<PropertyEntry> = {}, year = "2025"): ComprehensiveFormData =>
  ({
    ...defaultFormData,
    assessmentYear: year,
    properties: [entry(over), { ...makeProperty(), assessedValue: "1,500,000,000" }],
  }) as ComprehensiveFormData;

const rentalInfoOf = async (f: ComprehensiveFormData) => (await bodyOf(f)).properties[0].rentalInfo;

describe("술어 — 토글 노출 · 적용 · 안내", () => {
  const p = (over: Partial<PropertyEntry>) => entry(over);
  it("DM-P1 토글 노출 = 유형 1·2호 ∧ 다가구 입력 ON · 적용 = 거기에 토글 ON", () => {
    for (const t of ["private_construction", "private_purchase_short"]) {
      expect(asksDeemedMultiFamilyToggle(t, p({}))).toBe(true);
      expect(asksDeemedMultiFamilyToggle(t, p({ multiFamilyEnabled: false }))).toBe(false);
      expect(deemedMultiFamilyApplies(t, p({}))).toBe(true);
      expect(deemedMultiFamilyApplies(t, p({ deemedMultiFamily: false }))).toBe(false);
      expect(deemedMultiFamilyApplies(t, p({ multiFamilyEnabled: false }))).toBe(false);
      expect(suggestsMultiFamilyInputFirst(t, p({ multiFamilyEnabled: false }))).toBe(true);
      expect(suggestsMultiFamilyInputFirst(t, p({}))).toBe(false);
    }
    for (const t of ["private_purchase_long", "public_support_construction", "public_purchase", "existing_rental"]) {
      expect(asksDeemedMultiFamilyToggle(t, p({}))).toBe(false);
      expect(deemedMultiFamilyApplies(t, p({}))).toBe(false);
      expect(suggestsMultiFamilyInputFirst(t, p({ multiFamilyEnabled: false }))).toBe(false);
    }
  });
});

describe("DM-1 화면 경로 — 성립", () => {
  it("★ M1 2호·지방·세무서 2015·3구 각 2.5억·전환 없음·지자체 등록일 없음 → 성립 + 근거 경고", async () => {
    const r = await run(form());
    expect(r.excludedCount).toBe(1);
    expect(r.propertyResults[0].failReasons).toBeUndefined();
    expect(r.propertyResults[0].warnings).toContain(E.DEEMED_MULTIFAMILY_BASIS);
  });

  it("DM-1b 구별 3.5억 한 구 → 불성립 + 일부 배제 미지원 확인 필요(M2) · 구 이름 표시", async () => {
    const units = U3();
    units[1] = { ...units[1], officialValue: "350,000,000" };
    const r = await run(form({ floorUnits: units }));
    expect(r.excludedCount).toBe(0);
    expect(r.propertyResults[0].failReasons).toEqual(
      expect.arrayContaining([E.DEEMED_MULTIFAMILY_PARTIAL_UNSUPPORTED, `${E.DEEMED_MULTIFAMILY_FAILED_UNITS_PREFIX}: 2층`]),
    );
  });

  it("DM-1c M3 세무서 2019-05-01 → 불성립(2018.3.31. 단서) + 확인 필요", async () => {
    const r = await run(form({ businessRegistrationDate: "2019-05-01" }));
    expect(r.excludedCount).toBe(0);
    expect(r.propertyResults[0].failReasons).toEqual(
      expect.arrayContaining([E.REGISTERED_AFTER_2018_03_31, E.DEEMED_MULTIFAMILY_REG_CAP_2018_CONFIRM]),
    );
  });

  it("DM-1d M7 전환 질문 「아니오」 → 불성립 + 확인 필요", async () => {
    const r = await run(form({ deemedNoConversionAfterCutoff: "no" }));
    expect(r.excludedCount).toBe(0);
    expect(r.propertyResults[0].failReasons).toContain(E.DEEMED_MULTIFAMILY_UNIT_CONVERTED_AFTER_CUTOFF);
  });

  it("DM-1e M5 1호 · 4구 각 5억(6억 이하) · 호수 4 · 2021 과세 → 성립", async () => {
    const units = [1, 2, 3, 4].map((i) => ({ label: `${i}층`, area: "80", officialValue: "500,000,000" }));
    const r = await run(
      form(
        {
          exclusionType: "private_construction_rental",
          rentalRegistrationType: "private_construction",
          location: "metro",
          assessedValue: "2,000,000,000",
          area: "320",
          qualifyingUnitCount: 4,
          floorUnits: units,
        },
        "2021",
      ),
    );
    expect(r.excludedCount).toBe(1);
  });
});

describe("DM-2 ④ 전송", () => {
  it("★ 적용이면 지자체 등록일·신청일·말소일을 보내지 않고 구별 값을 숫자로 보낸다(M12 — 화면에 남은 지자체 값도 무시)", async () => {
    const info = await rentalInfoOf(
      form({
        rentalRegistrationDate: "2019-03-01",
        rentalApplicationDate: "2019-02-01",
        registrationRevokedDate: "2019-04-01",
      }),
    );
    expect(info).not.toHaveProperty("rentalRegistrationDate");
    expect(info).not.toHaveProperty("rentalApplicationDate");
    expect(info).not.toHaveProperty("registrationRevokedDate");
    expect(info.businessRegistrationDate).toBe("2015-03-01");
    expect(info.deemedMultiFamily).toEqual({
      units: [
        { label: "1층", area: 40, assessedValue: 250_000_000 },
        { label: "2층", area: 40, assessedValue: 250_000_000 },
        { label: "3층", area: 40, assessedValue: 250_000_000 },
      ],
      noConversionAfterCutoff: true,
    });
  });

  it("★ 토글 OFF면 본문 불변 — 구별 공시가격·전환 질문이 남아 있어도 보내지 않고 지자체 날짜를 그대로 보낸다", async () => {
    const off = { deemedMultiFamily: false, rentalRegistrationDate: "2019-03-01", registrationRevokedDate: "2019-04-01" };
    const withJunk = await rentalInfoOf(form(off));
    const clean = await rentalInfoOf(form({ ...off, deemedNoConversionAfterCutoff: "", floorUnits: U3("") }));
    expect(withJunk).toEqual(clean);
    expect(withJunk).not.toHaveProperty("deemedMultiFamily");
    expect(withJunk.rentalRegistrationDate).toBe("2019-03-01");
    expect(withJunk.registrationRevokedDate).toBe("2019-04-01");
  });

  it("★ 다가구 입력이 꺼져 있으면 토글 값이 남아 있어도 적용 안 됨(3중 패턴 — 술어가 막는다)", async () => {
    const info = await rentalInfoOf(form({ multiFamilyEnabled: false, floorUnits: [], rentalRegistrationDate: "2019-03-01" }));
    expect(info).not.toHaveProperty("deemedMultiFamily");
    expect(info.rentalRegistrationDate).toBe("2019-03-01");
  });

  it("8호(private_purchase_long)에서는 토글 값이 있어도 적용 안 됨", async () => {
    const info = await rentalInfoOf(
      form({
        exclusionType: "private_purchase_rental_long",
        rentalRegistrationType: "private_purchase_long",
        rentalRegistrationDate: "2025-02-20",
      }),
    );
    expect(info).not.toHaveProperty("deemedMultiFamily");
    expect(info.rentalRegistrationDate).toBe("2025-02-20");
  });
});

describe("DM-3 ⑧ 차단 문구", () => {
  const msg = (over: Partial<PropertyEntry>) => validateRequiredExclusionAndLandInputs(form(over)) ?? "";
  it("세무서 등록일 빈칸", () => {
    expect(msg({ businessRegistrationDate: "" })).toMatch(/^주택 1: 세무서 주택임대업 사업자등록일을 입력하세요/);
  });
  it("★ M4 세무서 2020-02-11 이후 → 「이 경로를 쓸 수 없습니다」 · 2020-02-10은 통과", () => {
    expect(msg({ businessRegistrationDate: "2020-03-01" })).toContain("2020.2.11. 이후 등록은 이 경로를 쓸 수 없습니다");
    expect(msg({ businessRegistrationDate: "2020-02-11" })).toContain("2020.2.11. 이후 등록은 이 경로를 쓸 수 없습니다");
    expect(msg({ businessRegistrationDate: "2020-02-10" })).toBe("");
  });
  it("구별 공시가격 빈칸·0 / 구 0행 / 전환 질문 빈칸", () => {
    const units = U3();
    expect(msg({ floorUnits: [units[0], { ...units[1], officialValue: "" }, units[2]] })).toMatch(/2층 구의 공시가격을 입력하세요/);
    expect(msg({ floorUnits: [{ ...units[0], officialValue: "0" }, units[1], units[2]] })).toMatch(/1층 구의 공시가격을 입력하세요/);
    expect(msg({ floorUnits: [] })).toMatch(/구별\(층별\) 행이 없습니다/);
    expect(msg({ deemedNoConversionAfterCutoff: "" })).toMatch(/2020\.2\.11\. 이후 임대로 바꾼 호실이 없는지 고르세요/);
  });
  it("토글 OFF + 지자체 등록일 빈칸 → 종전 차단 문구 + 1·2호는 토글 안내 / 다가구 OFF는 입력 안내", () => {
    expect(msg({ deemedMultiFamily: false })).toMatch(/^주택 1: 지자체 임대사업자 등록일이 없으면 합산배제를 계산할 수 없습니다/);
    expect(msg({ deemedMultiFamily: false })).toContain("'2020.2.11. 전 세무서에만 등록한 다가구' 토글을 켜세요");
    expect(msg({ deemedMultiFamily: false, multiFamilyEnabled: false })).toContain("층별(구별) 면적 입력을 먼저 켜세요");
    expect(msg({ deemedMultiFamily: false })).toContain("합산배제 유형을 '없음'으로 바꾸세요");
  });
});

describe("DM-4 ⑫⑭ 직접 API — 화면 우회 방어", () => {
  const direct = async (rentalInfoPatch: Record<string, unknown>, dropKeys: string[] = []) => {
    const body = await bodyOf(form());
    const info = { ...body.properties[0].rentalInfo, ...rentalInfoPatch };
    for (const k of dropKeys) delete info[k];
    body.properties[0].rentalInfo = info;
    return post(body);
  };

  it("★ M12 지자체 등록일·말소일을 동봉해도 성립(무시) — 200 · excludedCount 1", async () => {
    const res = await direct({ rentalRegistrationDate: "2019-03-01", registrationRevokedDate: "2019-04-01", rentalApplicationDate: "2019-02-01" });
    expect(res.status).toBe(200);
    const d = ((await res.json()) as { data: { aggregationExclusion: Excl } }).data.aggregationExclusion;
    expect(d.excludedCount).toBe(1);
  });

  it("★ M4 세무서 2020-03-01 → 400", async () => {
    expect((await direct({ businessRegistrationDate: "2020-03-01" })).status).toBe(400);
    expect((await direct({ businessRegistrationDate: "2020-02-11" })).status).toBe(400);
    expect((await direct({ businessRegistrationDate: "2020-02-10" })).status).toBe(200);
  });

  it("★ M8 8호(private_purchase_long) + deemedMultiFamily → 400", async () => {
    expect((await direct({ registrationType: "private_purchase_long" })).status).toBe(400);
  });

  it("★ M9 세무서 등록일 빈칸 · 구별 공시가격 빈칸·0 · units 0행 · 전환 질문 누락 → 400", async () => {
    expect((await direct({}, ["businessRegistrationDate"])).status).toBe(400);
    const dm = (units: unknown) => ({ deemedMultiFamily: { units, noConversionAfterCutoff: true } });
    const u = { label: "1층", area: 40, assessedValue: 250_000_000 };
    expect((await direct(dm([{ ...u, assessedValue: 0 }]))).status).toBe(400);
    expect((await direct(dm([{ label: "1층", area: 40 }]))).status).toBe(400);
    expect((await direct(dm([]))).status).toBe(400);
    expect((await direct({ deemedMultiFamily: { units: [u] } })).status).toBe(400);
    expect((await direct(dm([u]))).status).toBe(200);
  });

  it("deemed가 없는 기존 요청은 불변 — 지자체 등록일 필수(400) · 있으면 200", async () => {
    const f = form({ deemedMultiFamily: false, rentalRegistrationDate: "2019-03-01" });
    const body = await bodyOf(f);
    expect((await post(body)).status).toBe(200);
    delete body.properties[0].rentalInfo.rentalRegistrationDate;
    expect((await post(body)).status).toBe(400);
  });
});

describe("DM-5 ⑧↔⑫ 격자 — 토글 × 유형 × 세무서 날짜 × 구별 가격 빈칸: ⑧ 통과 ⇔ route 200", () => {
  const types: [string, string, Partial<PropertyEntry>][] = [
    ["1호", "private_construction", { exclusionType: "private_construction_rental", qualifyingUnitCount: 4 }],
    ["2호", "private_purchase_short", { exclusionType: "private_purchase_rental_short" }],
    [
      "8호",
      "private_purchase_long",
      { exclusionType: "private_purchase_rental_long", rentalApplicationDate: "2019-03-01", rentalAcquisitionDate: "2016-01-01", isApartment: "no", convertedFromShortTerm: "no" },
    ],
  ];
  const dates = ["2018-04-02", "2018-04-03", "2020-02-10", "2020-02-11"];
  for (const [name, regType, typeOver] of types) {
    for (const toggle of [true, false]) {
      for (const bizDate of dates) {
        for (const priceBlank of [false, true]) {
          it(`${name} · 토글 ${toggle ? "ON" : "OFF"} · 세무서 ${bizDate} · 구별 가격 ${priceBlank ? "빈칸" : "입력"}`, async () => {
            const f = form({
              ...typeOver,
              rentalRegistrationType: regType,
              deemedMultiFamily: toggle,
              businessRegistrationDate: bizDate,
              // 토글 OFF·8호는 지자체 등록일이 필수 — 의제 경로에서는 비워 둔다(보내지 않음)
              rentalRegistrationDate: toggle && regType !== "private_purchase_long" ? "" : "2019-03-01",
              floorUnits: U3(priceBlank ? "" : "250,000,000"),
            });
            const gate = validateRequiredExclusionAndLandInputs(f);
            const res = await post(await bodyOf(f));
            expect(res.status === 200).toBe(gate === null);
            const applies = toggle && regType !== "private_purchase_long";
            if (applies && (priceBlank || bizDate >= "2020-02-11")) expect(gate).not.toBeNull();
            if (!applies) expect(gate).toBeNull(); // 토글 OFF·8호는 구별 가격을 보지 않는다
          });
        }
      }
    }
  }
});
