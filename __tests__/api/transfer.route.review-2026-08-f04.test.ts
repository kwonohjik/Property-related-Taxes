/**
 * [F04] 다건 ⑬⑭ — §155④⑤ 합가 게이트 · §155⑦ 농어촌 · §155⑧ 부득이 · §155⑯⑱ 입력 소실 회귀 anchor
 *
 * 결함(2026-08 코드리뷰): 다건 StepB가 단건 마법사를 그대로 임베드하므로 Step4의
 *   TemporaryTwoHouseSection 토글이 전부 렌더된다. 그런데
 *   ⑬ `buildPropertyPayload`는 `marriageMerge`·`parentalCareMerge`만 싣고
 *      · §155④⑤의 필수 게이트 `isFirstTransferredInMerge`를 싣지 않았고
 *      · `ruralHouse`·`unavoidableOutsideCapitalHouse`를 아예 싣지 않았으며
 *      · `temporaryTwoHouse`는 두 날짜만 실어 §155⑯⑱ 4필드를 버렸다.
 *   ⑭ `multi/route.ts`에도 그 세 필드 매핑이 없었다.
 *   `validateMultiSupportedMode`도 이 조합을 차단하지 않아 **침묵 오산**이 됐다.
 *
 * ⇒ ⑬은 단건과 같은 `buildHouseholdSpecialPayload`를 spread하도록 통일했고,
 *   ⑭은 단건 정본(`app/api/calc/transfer/engine-input.ts`)과 동형으로 Date 변환을 붙였다.
 *
 * 기대값은 전부 **엔진을 실제 호출해 관측한 값**이다.
 */

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn().mockResolvedValue(new Map()) };
});

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({
    allowed: true,
    limit: 15,
    remaining: 14,
    resetAt: Date.now() + 60_000,
  }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/multi/route";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

function makeRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/calc/transfer/multi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function calc(payload: object) {
  const res = await POST(
    makeRequest({
      taxYear: 2026,
      properties: [{ propertyId: "p1", propertyLabel: "건1", ...payload }],
    }),
  );
  return { status: res.status, json: await res.json() };
}

/** 주택 2주택 · 1세대 · 양도 5억(2026-03-01) · 취득 3억(2018-01-01) · 비조정 */
function houseForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-03-01";
  form.contractTotalPrice = "500,000,000";
  form.householdHousingCount = "2";
  form.isOneHousehold = true;
  form.isRegulatedArea = false;
  form.residencePeriodMonths = "120";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "housing",
    acquisitionDate: "2018-01-01",
    fixedAcquisitionPrice: "300,000,000",
  };
  return form;
}

/** 특례가 하나도 안 붙었을 때의 세액 — 아래 전 케이스의 "미도달" 관측값 */
const TAX_WITHOUT_EXEMPTION = 47_245_000;

describe("[F04] §155④⑤ 합가 후 첫 양도 게이트", () => {
  it("F04-1: ⑬이 isFirstTransferredInMerge를 싣는다", () => {
    const form = houseForm();
    form.marriageDate = "2020-01-01";
    form.isFirstTransferredInMerge = true;
    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.marriageMerge).toEqual({ marriageDate: "2020-01-01" });
    expect(payload.isFirstTransferredInMerge).toBe(true);
  });

  it("F04-2: 플래그가 도달하면 혼인합가 특례로 비과세(세액 0)", async () => {
    const form = houseForm();
    form.marriageDate = "2020-01-01";
    form.isFirstTransferredInMerge = true;
    const r = await calc(buildPropertyPayload(form));
    expect(r.status).toBe(200);
    expect(r.json.data.properties[0].isExempt).toBe(true);
    expect(r.json.data.totalTax).toBe(0);
  });

  it("F04-3: 플래그 없이 혼인일만 있으면 특례 미발동 (엔진 게이트 `=== true`)", async () => {
    const form = houseForm();
    form.marriageDate = "2020-01-01";
    const r = await calc(buildPropertyPayload(form));
    expect(r.status).toBe(200);
    expect(r.json.data.properties[0].isExempt).toBe(false);
    expect(r.json.data.totalTax).toBe(TAX_WITHOUT_EXEMPTION);
  });
});

describe("[F04] §155⑦ 농어촌주택 · §155⑧ 수도권 밖 부득이", () => {
  it("F04-4: 농어촌주택(상속·읍면·피상속인 거주 10년)이 ⑬⑭를 통과해 비과세", async () => {
    const form = houseForm();
    form.ruralHouseSpecial = true;
    form.ruralHouseKind = "inherited";
    form.ruralHouseOutsideCapitalEupMyeon = true;
    form.ruralHouseDecedentResidenceYears = "10";

    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.ruralHouse).toEqual({
      kind: "inherited",
      isOutsideCapitalEupMyeon: true,
      decedentResidenceYears: 10,
    });

    const r = await calc(payload);
    expect(r.status).toBe(200);
    expect(r.json.data.totalTax).toBe(0);
  });

  it("F04-5: 수도권 밖 부득이(근무상 형편·해소일)가 ⑬⑭를 통과해 비과세", async () => {
    const form = houseForm();
    form.unavoidableOutsideCapitalSpecial = true;
    form.unavoidableOutsideCapitalReason = "work";
    form.unavoidableOutsideCapitalResolvedDate = "2025-06-01";

    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.unavoidableOutsideCapitalHouse).toEqual({
      reason: "work",
      resolvedDate: "2025-06-01",
    });

    const r = await calc(payload);
    expect(r.status).toBe(200);
    expect(r.json.data.totalTax).toBe(0);
  });

  it("F04-6: 두 토글 OFF면 종전대로 과세 — 신규 키가 새지 않는다", async () => {
    const payload = buildPropertyPayload(houseForm()) as Record<string, unknown>;
    expect(payload.ruralHouse).toBeUndefined();
    expect(payload.unavoidableOutsideCapitalHouse).toBeUndefined();
    const r = await calc(payload);
    expect(r.json.data.totalTax).toBe(TAX_WITHOUT_EXEMPTION);
  });
});

describe("[F04] §155⑯⑱ 일시적 2주택 4필드", () => {
  /** 종전 2018-01-01 취득 · 신규 2022-06-01 취득 · 2026-03-01 양도 (처분기한 3년 초과) */
  function t2hForm() {
    const form = houseForm();
    form.temporaryTwoHouseSpecial = true;
    form.newHouseAcquisitionDate = "2022-06-01";
    return form;
  }

  it("F04-7: ⑬이 §155⑯·⑱ 4필드를 함께 싣는다", () => {
    const form = t2hForm();
    form.publicInstitutionRelocation = true;
    form.relocatedSigunguCode = "11110";
    form.newHouseSigunguCode = "11140";
    form.disposalDelayReason = "auction";
    const payload = buildPropertyPayload(form) as Record<string, unknown>;
    expect(payload.temporaryTwoHouse).toEqual({
      previousAcquisitionDate: "2018-01-01",
      newAcquisitionDate: "2022-06-01",
      publicInstitutionRelocation: true,
      relocatedSigunguCode: "11110",
      newHouseSigunguCode: "11140",
      disposalDelayReason: "auction",
    });
  });

  it("F04-8: 공공기관 이전(§155⑯) 도달 시 처분기한이 늘어 비과세로 뒤집힌다", async () => {
    const plain = await calc(buildPropertyPayload(t2hForm()));
    expect(plain.status).toBe(200);
    expect(plain.json.data.properties[0].isExempt).toBe(false);
    expect(plain.json.data.totalTax).toBe(TAX_WITHOUT_EXEMPTION);

    const form = t2hForm();
    form.publicInstitutionRelocation = true;
    const relocated = await calc(buildPropertyPayload(form));
    expect(relocated.status).toBe(200);
    expect(relocated.json.data.properties[0].isExempt).toBe(true);
    expect(relocated.json.data.totalTax).toBe(0);
  });
});
