/**
 * anchor (A3 · OH-12 · OH-12c) — 신규 입력 2개의 배관: ④ → ⑫ Zod → ⑭ route → 엔진 · ⑧ validation.
 *
 *   · `generalHouseGiftDate` — 소급 2년 내 피상속인 증여분의 증여일(2018-02-13 부칙 게이트)
 *   · `generalHouseRightAtInheritance` — 상속개시 후 취득 양도 주택이 상속개시 당시 보유 권리의 신축주택인가
 *
 * 경로 3개(계산기 단건 · 판정 메뉴 · 다건)를 모두 태운다 — 한 경로만 매핑이 빠지면 침묵 strip이다
 * (memory `feedback_api_zod_schema_sync`). 모든 부정 단언에 긍정 짝을 둔다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { POST as POST_SINGLE } from "@/app/api/calc/transfer/route";
import { POST as POST_JUDGE } from "@/app/api/calc/one-house-exemption/route";
import { POST as POST_MULTI } from "@/app/api/calc/transfer/multi/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import {
  buildInheritanceGeneralHousePayload,
  generalHouseRightAtInheritanceVisible,
} from "@/lib/calc/inheritance-general-house-scope";
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const inheritedRow = (inheritedDate: string): HouseEntry =>
  ({
    id: "h-inh",
    region: "capital",
    acquisitionDate: inheritedDate,
    officialPrice: "300000000",
    isInherited: true,
    inheritedDate,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
  }) as unknown as HouseEntry;

/** 계산기 폼 — 일반주택 2018-01-01 취득 · 상속주택(상속 inh) 1채 · 2023-06-01 8억 양도 */
function cForm(inh = "2015-01-01", over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  return {
    ...f,
    transferDate: "2023-06-01",
    filingDate: "2023-08-31",
    contractTotalPrice: "800000000",
    householdHousingCount: "2",
    isOneHousehold: true,
    isRegulatedArea: false,
    residencePeriodMonths: "60",
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2018-01-01",
        fixedAcquisitionPrice: "400000000",
        actualSalePrice: "800000000",
      } as AssetForm,
    ],
    houses: [inheritedRow(inh)],
    ...over,
  };
}

async function captureCalcBody(f: TransferFormData): Promise<Record<string, unknown>> {
  let captured: unknown = null;
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(f);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  return captured as Record<string, unknown>;
}

async function postSingle(body: Record<string, unknown>) {
  const res = await POST_SINGLE(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.result as { isExempt: boolean; totalTax: number };
}

describe("④ 게이트 — ⑤·⑧과 같은 술어", () => {
  it("상속 후 취득(2018 > 2015)이면 선택지가 열리고 선언이 실린다", () => {
    const f = cForm("2015-01-01", { generalHouseRightAtInheritance: "redevelopment_right" });
    expect(generalHouseRightAtInheritanceVisible(f)).toBe(true);
    expect(buildInheritanceGeneralHousePayload(f)).toEqual({
      generalHouseRightAtInheritance: "redevelopment_right",
    });
  });

  it("🔴 부정 짝 — 상속 전 취득(상속 2019)이면 닫히고 남은 stale 선언을 싣지 않는다", () => {
    const f = cForm("2019-01-01", { generalHouseRightAtInheritance: "none" });
    expect(generalHouseRightAtInheritanceVisible(f)).toBe(false);
    expect(buildInheritanceGeneralHousePayload(f)).toEqual({});
  });

  it("증여일은 증여 토글이 켜졌을 때만 싣는다", () => {
    expect(buildInheritanceGeneralHousePayload(cForm("2019-01-01", { generalHouseGiftDate: "2018-01-01" }))).toEqual({});
    expect(
      buildInheritanceGeneralHousePayload(
        cForm("2019-01-01", { generalHouseGiftedFromDecedentWithin2yr: true, generalHouseGiftDate: "2018-01-01" }),
      ),
    ).toEqual({ generalHouseGiftDate: "2018-01-01" });
  });

  it("🔴 stale 폼(신규 키 없음) — 크래시 없이 빈 payload", () => {
    const stale = cForm() as unknown as Record<string, unknown>;
    delete stale.generalHouseGiftDate;
    delete stale.generalHouseRightAtInheritance;
    expect(buildInheritanceGeneralHousePayload(stale as unknown as TransferFormData)).toEqual({});
  });
});

describe("⑧ — 게이트가 열리면 필수", () => {
  it("계산기 — 상속 후 취득인데 취득 경위 미선택 → 차단 / 선택하면 통과", () => {
    const msg = (f: TransferFormData) => validateStepDetailed(1, f)?.message ?? "";
    expect(msg(cForm())).toContain("상속개시 당시 보유한 조합원입주권·분양권");
    expect(msg(cForm("2015-01-01", { generalHouseRightAtInheritance: "none" }))).not.toContain(
      "상속개시 당시 보유한 조합원입주권·분양권",
    );
  });

  it("계산기 — 증여 선언 + 증여일 미입력 → 차단 / 입력하면 통과", () => {
    const base = { generalHouseRightAtInheritance: "none" as const, generalHouseGiftedFromDecedentWithin2yr: true };
    const msg = (f: TransferFormData) => validateStepDetailed(1, f)?.message ?? "";
    expect(msg(cForm("2015-01-01", base))).toContain("증여받은 날");
    expect(msg(cForm("2015-01-01", { ...base, generalHouseGiftDate: "2014-06-01" }))).not.toContain("증여받은 날");
  });

  it("판정 메뉴 — 같은 두 요구 + 상속개시일 필수(계산기 ⑧과 같은 규칙)", () => {
    const j = (over: Record<string, unknown>) =>
      ({ ...createInitialOneHouseJudgmentForm(), ...cForm(), ...over }) as unknown as OneHouseJudgmentFormData;
    const msgs = (f: OneHouseJudgmentFormData) => validateStep2(f).filter((e) => e.severity === "error").map((e) => e.message).join("|");
    expect(msgs(j({}))).toContain("상속개시 당시 보유한 조합원입주권·분양권");
    expect(msgs(j({ generalHouseRightAtInheritance: "none" }))).not.toContain("상속개시 당시 보유한");
    expect(msgs(j({ generalHouseRightAtInheritance: "none", generalHouseGiftedFromDecedentWithin2yr: true }))).toContain("증여받은 날");
    const noDate = j({ generalHouseRightAtInheritance: "none", houses: [{ ...inheritedRow("2015-01-01"), inheritedDate: undefined }] });
    expect(msgs(noDate)).toContain("상속개시일을 입력하세요");
  });
});

describe("④→⑫→⑭ — 계산기 단건 route", () => {
  it("🔴 상속 후 취득 + 「해당 없음」 → 상속주택 제외 없음 → 과세", async () => {
    const body = await captureCalcBody(cForm("2015-01-01", { generalHouseRightAtInheritance: "none" }));
    expect(body.generalHouseRightAtInheritance).toBe("none");
    const r = await postSingle(body);
    expect(r.isExempt).toBe(false);
  });

  it("긍정 짝 — 입주권 신축주택 선언 → 제외 → 비과세 (⑭ 매핑 도달)", async () => {
    const body = await captureCalcBody(cForm("2015-01-01", { generalHouseRightAtInheritance: "redevelopment_right" }));
    const r = await postSingle(body);
    expect(r.isExempt).toBe(true);
  });

  it("🔴 OH-12c ⑭ — 증여일 2018-02-12(부칙 전) → 특례 유지 / 2018-02-13 → 배제", async () => {
    const f = (d: string) =>
      cForm("2019-01-01", { generalHouseGiftedFromDecedentWithin2yr: true, generalHouseGiftDate: d });
    const before = await postSingle(await captureCalcBody(f("2018-02-12")));
    const after = await postSingle(await captureCalcBody(f("2018-02-13")));
    expect(before.isExempt).toBe(true);
    expect(after.isExempt).toBe(false);
  });
});

describe("④→⑫→⑭ — 판정 메뉴 route", () => {
  async function judge(over: Record<string, unknown>) {
    const f = { ...createInitialOneHouseJudgmentForm(), ...cForm(), ...over } as unknown as OneHouseJudgmentFormData;
    const res = await POST_JUDGE(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
        body: JSON.stringify(buildOneHouseExemptionApiBody(f)),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    return json.data.judgment as { isExempt: boolean };
  }

  it("🔴 「해당 없음」 → 과세 / 긍정 짝 입주권 신축 → 비과세", async () => {
    expect((await judge({ generalHouseRightAtInheritance: "none" })).isExempt).toBe(false);
    expect((await judge({ generalHouseRightAtInheritance: "redevelopment_right" })).isExempt).toBe(true);
  });

  it("🔴 OH-12c — 증여일 2018-02-12 → 비과세 / 2018-02-13 → 과세", async () => {
    const g = (d: string) =>
      judge({ houses: [inheritedRow("2019-01-01")], generalHouseGiftedFromDecedentWithin2yr: true, generalHouseGiftDate: d });
    expect((await g("2018-02-12")).isExempt).toBe(true);
    expect((await g("2018-02-13")).isExempt).toBe(false);
  });
});

describe("⑬→⑫→⑭ — 다건 route", () => {
  async function multi(f: TransferFormData) {
    const payload = buildPropertyPayload(f) as Record<string, unknown>;
    const res = await POST_MULTI(
      new NextRequest("http://localhost/api/calc/transfer/multi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taxYear: 2023, properties: [{ propertyId: "p1", propertyLabel: "건1", ...payload }] }),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    return { payload, total: json.data.result?.totalTax ?? json.data.totalTax ?? json.data.result?.totalTaxPayable };
  }

  it("🔴 다건도 두 키를 싣고 route가 엔진까지 보낸다 — 선언이 세액을 가른다", async () => {
    const none = await multi(cForm("2015-01-01", { generalHouseRightAtInheritance: "none" }));
    const redev = await multi(cForm("2015-01-01", { generalHouseRightAtInheritance: "redevelopment_right" }));
    expect(none.payload.generalHouseRightAtInheritance).toBe("none");
    expect(redev.payload.generalHouseRightAtInheritance).toBe("redevelopment_right");
    expect(none.total).toBeGreaterThan(0);
    expect(redev.total).toBe(0);
  });

  it("🔴 OH-12c 다건 ⑭ — 증여일이 route를 지나 엔진 게이트에 닿는다", async () => {
    const f = (d: string) =>
      cForm("2019-01-01", { generalHouseGiftedFromDecedentWithin2yr: true, generalHouseGiftDate: d });
    expect((await multi(f("2018-02-12"))).total).toBe(0);
    expect((await multi(f("2018-02-13"))).total).toBeGreaterThan(0);
  });
});
