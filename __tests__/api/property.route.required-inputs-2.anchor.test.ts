/**
 * 재산세 — ⑧이 요구하는데 ⑫가 비워 두게 두던 값 2차분 (2026-09-30 Zod↔엔진 필수 점검 §4.2).
 *
 * - P3 도시지역 주택 + 본세 세부담상한(법률 제19230호 부칙 제15조 — 종전 「지방세법」 §122 단서) 적용 시
 *   직전 도시지역분. 종전 §122 본문 괄호는 산출세액을 「제112조제1항 각 호 및 같은 조 제2항에 따른
 *   **각각의** 세액」으로, 「지방세법 시행령」 §118 각 호 외의 부분은 직전 연도 세액 상당액을
 *   「제112조제1항제1호 … 산출세액과 같은 항 제2호 … 산출세액 **각각에 대하여** … 각각 산출한 세액」으로
 *   정한다 — 도시지역분(§112①2호)도 따로 상한을 받는다. 비우면 엔진이 도시지역분 상한을 건너뛰어
 *   도시지역분이 상한 없이 부과됐다(200 + 다른 세액).
 * - P5a 주택 건물·부속토지 소유자 분리(§107①2호) — 두 소유자·두 시가표준액. 비우면 엔진이 경고만 남기고
 *   공부상 소유자로 처리해 안분(houseSplitDistribution)이 사라졌다(세액 동일 · 납세의무자 표시 변경).
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
// .env.local의 NEXT_PUBLIC_SUPABASE_URL이 있어도 네트워크로 나가지 않는다 — 실패 시 내부 상수 경로.
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn().mockRejectedValue(new Error("offline")) };
});

import { POST } from "@/app/api/calc/property/route";
import {
  INITIAL_FORM,
  buildPropertyTaxRequestBody,
  validateStep,
  type FormState,
} from "@/components/calc/property/shared";

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/property", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}
async function expectRejected(body: Record<string, unknown>, key: string, message: string) {
  const r = await post(body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
  expect(Object.keys(r.json.error?.details ?? {})).toContain(key);
  expect(JSON.stringify(r.json.error.details[key])).toContain(message);
}
const without = (o: Record<string, unknown>, ...keys: string[]) => {
  const c = { ...o };
  for (const k of keys) delete c[k];
  return c;
};

// ─────────────────────────────────────────────────────────────────────────────
// P3 — 도시지역분 세부담상한
// ─────────────────────────────────────────────────────────────────────────────
const HOUSING = {
  objectType: "housing",
  publishedPrice: 518_000_000,
  isOneHousehold: true,
  isUrbanArea: true,
  targetDate: "2025-06-01",
  previousYearHousingBaseTax: 215_336,
  previousYearHousingUrbanTax: 277_846,
};

describe("P3 — 도시지역 주택 + 본세 세부담상한 → 직전 도시지역분 필수", () => {
  it("🟢 둘 다 입력 → 200 · 도시지역분 상한 적용", async () => {
    const r = await post(HOUSING);
    expect(r.status).toBe(200);
    expect(r.json.data.housingTransitionalCap.urbanApplied).toBe(true);
    expect(r.json.data.totalPayable).toBe(P3_WITH);
  });

  it("P3 🔴 직전 도시지역분 없음 → 400 (종전 200 · 603,330 — 도시지역분 상한 누락)", async () => {
    await expectRejected(without(HOUSING, "previousYearHousingUrbanTax"), "previousYearHousingUrbanTax", "도시지역분");
  });

  it("P3 🔴 직전 도시지역분 0 → 400 (⑧과 같이 0 초과를 요구 — 엔진은 0을 「미입력」으로 읽는다)", async () => {
    await expectRejected({ ...HOUSING, previousYearHousingUrbanTax: 0 }, "previousYearHousingUrbanTax", "도시지역분");
  });

  it("🟢 도시지역 아님 → 직전 도시지역분 없이 200 (도시지역분 자체가 없다)", async () => {
    const r = await post({ ...without(HOUSING, "previousYearHousingUrbanTax"), isUrbanArea: false });
    expect(r.status).toBe(200);
  });

  it("🟢 본세 상한 미적용(직전 본세 없음) → 도시지역분도 요구하지 않는다", async () => {
    const r = await post(without(HOUSING, "previousYearHousingUrbanTax", "previousYearHousingBaseTax"));
    expect(r.status).toBe(200);
  });

  it("⑧ 거울: 같은 조합을 화면도 막는다 · ④가 싣는 값은 ⑫를 통과한다", async () => {
    const form: FormState = {
      ...INITIAL_FORM,
      objectType: "housing",
      publishedPrice: "518,000,000",
      isOneHousehold: true,
      isUrbanArea: true,
      housingTaxCapEnabled: true,
      housingPreviousYearTax: "215,336",
      housingPreviousUrbanTax: "",
    };
    expect(validateStep(3, form)).toContain("직전연도 도시지역분");
    const ok = { ...form, housingPreviousUrbanTax: "277,846" };
    expect(validateStep(3, ok)).toBeNull();
    const r = await post({ ...buildPropertyTaxRequestBody(ok), targetDate: "2025-06-01" });
    expect(r.status).toBe(200);
    expect(r.json.data.totalPayable).toBe(P3_WITH);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P5a — 주택 건물·부속토지 소유자 분리(§107①2호)
// ─────────────────────────────────────────────────────────────────────────────
const SPLIT = {
  objectType: "housing",
  publishedPrice: 600_000_000,
  isUrbanArea: false,
  targetDate: "2025-06-01",
  housingBuildingValue: 200_000_000,
  taxpayerInfo: {
    registeredOwner: "B",
    isHouseSplit: true,
    buildingOwner: "B",
    landOwner: "C",
    landStdValue: 400_000_000,
  },
};
const splitWithout = (key: string) => ({
  ...SPLIT,
  taxpayerInfo: without(SPLIT.taxpayerInfo, key),
});

describe("P5a — 분리 소유 주택의 두 소유자·두 시가표준액", () => {
  it("🟢 모두 입력 → 200 · 부속토지 소유자가 대표 · 안분 있음", async () => {
    const r = await post(SPLIT);
    expect(r.status).toBe(200);
    expect(r.json.data.taxpayer.type).toBe("land_owner");
    expect(r.json.data.houseSplitDistribution).toBeDefined();
    expect(r.json.data.totalPayable).toBe(P5A_TOTAL);
  });

  it("P5a 🔴 부속토지 시가표준액 없음 → 400 (종전 200 · 공부상 소유자로 처리 · 안분 없음)", async () => {
    await expectRejected(splitWithout("landStdValue"), "taxpayerInfo", "부속토지 시가표준액");
  });

  it("P5a 🔴 건물 소유자 없음 → 400", async () => {
    await expectRejected(splitWithout("buildingOwner"), "taxpayerInfo", "건물 소유자");
  });

  it("P5a 🔴 부속토지 소유자 없음 → 400", async () => {
    await expectRejected(splitWithout("landOwner"), "taxpayerInfo", "부속토지 소유자");
  });

  it("P5a 🔴 건축물 시가표준액(housingBuildingValue) 없음 → 400 (종전 200 · 972,000 — 공부상 소유자 · 건물분 소방분 누락)", async () => {
    await expectRejected(without(SPLIT, "housingBuildingValue"), "housingBuildingValue", "건축물 시가표준액");
  });

  it("⑧ 거울: 화면도 같은 값을 요구 · ④ 본문은 ⑫를 통과한다", async () => {
    const form: FormState = {
      ...INITIAL_FORM,
      objectType: "housing",
      publishedPrice: "600,000,000",
      ownershipType: "house_split",
      buildingOwner: "B",
      landOwner: "C",
      housingBuildingValue: "200,000,000",
      landStdValue: "",
    };
    expect(validateStep(0, form)).toContain("부속토지 시가표준액");
    const ok = { ...form, landStdValue: "400,000,000" };
    expect(validateStep(0, ok)).toBeNull();
    const r = await post({ ...buildPropertyTaxRequestBody(ok), targetDate: "2025-06-01" });
    expect(r.status).toBe(200);
    expect(r.json.data.taxpayer.type).toBe("land_owner");
    expect(r.json.data.totalPayable).toBe(P5A_TOTAL);
  });
});

// 실측값 (base·fix 동일 — 값이 있을 때 세액은 바뀌지 않는다)
const P3_WITH = 589_872; // 생략 시 종전 603,330 (도시지역분 상한 누락)
const P5A_TOTAL = 1_088_300; // housingBuildingValue 생략 시 종전 972,000 (건물분 소방분 누락)
