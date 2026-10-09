/**
 * route anchor — OH-38 삭제 전 §154①4호(임대사업자 등록) 입력이 **세 route 전부**에 도달한다.
 *
 * 폼 → 실제 클라이언트 변환(④⑬: `callTransferTaxAPI` · `callMultiTransferTaxAPI` ·
 * `buildOneHouseExemptionApiBody`) → Zod(⑫) → route 매핑(⑭ `toEngineRental4ho`) → 엔진.
 * 「본문에 키가 있다」는 도달을 증명하지 않는다 — route 결과로 관측한다(`feedback_leaf_anchor_skips_zod_layer`).
 * 긍정·부정 짝: 같은 폼에서 사유를 비우면 세 route 모두 과세(거주 2년 미충족).
 *
 * 시나리오: 리뷰 OH-38 — 서울(조정) 1주택 2018-03-01 취득 · 2018-06-01 두 등록 신청 · 거주 0 ·
 * 임대의무 준수 · 5% 이내 · 2026-07-01 양도 · 9억.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { POST as JUDGE } from "@/app/api/calc/one-house-exemption/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { buildResidenceReqInput } from "@/lib/calc/transfer-tax-api-residence";
import { meetsOneHouseResidenceRequirement } from "@/lib/tax-engine/transfer-tax-exemption";
import { ONE_HOUSE_RESIDENCE } from "@/lib/tax-engine/legal-codes";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

type Obj = Record<string, unknown>;

const FACTS: Partial<TransferFormData> = {
  provisoReason: "rental_registration_4ho",
  proviso4hoBusinessRegDate: "2018-06-01",
  proviso4hoRentalRegDate: "2018-06-01",
  proviso4hoRegulatedOneHouse: "yes",
  proviso4hoStatus: "maintained",
  proviso4hoDuringMandatory: "no",
  proviso4hoRentOver5: "no",
};

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-07-01";
  f.householdHousingCount = "1";
  f.isOneHousehold = true;
  f.isRegulatedArea = true;
  f.wasRegulatedAtAcquisition = true;
  f.residencePeriodMonths = "0";
  f.contractTotalPrice = "900,000,000";
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-03-01",
    actualSalePrice: "900,000,000",
    fixedAcquisitionPrice: "400,000,000",
    useEstimatedAcquisition: false,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "0",
  });
  return { ...f, ...over };
}

async function bodyOf(send: () => Promise<unknown>): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as Obj;
}
const post = (handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) =>
  handler(
    new NextRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

async function single(f: TransferFormData) {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: { isExempt: boolean; exemptReason?: string } } };
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.result;
}
async function multi(f: TransferFormData) {
  const mf = {
    taxYear: 2026,
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "EARLIEST_TRANSFER",
  } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]),
  );
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  const json = (await res.json()) as { data: { properties: { isExempt: boolean }[] } };
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.properties[0];
}
async function judge(f: TransferFormData) {
  const jf = { ...createInitialOneHouseJudgmentForm(), ...f };
  const res = await post(JUDGE, "http://l/api/calc/one-house-exemption", buildOneHouseExemptionApiBody(jf));
  const json = (await res.json()) as {
    data: { judgment: { isExempt: boolean; appliedExceptions: { id: string; legalBasis: string }[] } };
  };
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.judgment;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

describe("OH-38 ⑫⑬⑭ — 세 route 도달", () => {
  it("★ 단건 계산기 — 4호 사실 입력 → 비과세 · 근거 문구에 부칙 제38조②", async () => {
    const r = await single(form(FACTS));
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toContain("대통령령 제30395호 부칙 제38조 ②");
  });
  it("★ 다건 합산 — 같은 폼 → 비과세", async () => {
    expect((await multi(form(FACTS))).isExempt).toBe(true);
  });
  it("★ 판정 메뉴 — 같은 사실 → 비과세 + 적용 특례 근거", async () => {
    const j = await judge(form(FACTS));
    expect(j.isExempt).toBe(true);
    expect(j.appliedExceptions.map((e) => e.id)).toContain("154-1-proviso:rental_registration_4ho");
  });
  it("부정 짝 — 사유를 비우면 세 route 모두 과세", async () => {
    const f = form({ ...FACTS, provisoReason: "" });
    expect((await single(f)).isExempt).toBe(false);
    expect((await multi(f)).isExempt).toBe(false);
    expect((await judge(f)).isExempt).toBe(false);
  });
  it("⑭ 날짜 변환 — 신청일 2019-12-17(기한 뒤)이면 세 route 모두 과세(문자열 비교 함정이면 통과해 버린다)", async () => {
    const f = form({ ...FACTS, proviso4hoRentalRegDate: "2019-12-17" });
    expect((await single(f)).isExempt).toBe(false);
    expect((await multi(f)).isExempt).toBe(false);
    expect((await judge(f)).isExempt).toBe(false);
  });
  it("③ 숨은 칸(등록 말소)의 stale 「임대의무기간 중 양도」는 보내지 않는다 → 비과세", async () => {
    const f = form({ ...FACTS, proviso4hoStatus: "auto_cancelled", proviso4hoDuringMandatory: "yes" });
    const body = await bodyOf(() => callTransferTaxAPI(f));
    const proviso = body.oneHouseExemptionProviso as { rentalRegistration4ho: Obj };
    expect(proviso.rentalRegistration4ho).not.toHaveProperty("transferredDuringMandatoryPeriod");
    expect((await single(f)).isExempt).toBe(true);
  });
});

describe("Step4 거주요건 안내 — ④·⑭와 같은 조립(단일 진실)", () => {
  it("4호 사실이 있으면 안내도 「충족(면제)」, 없으면 「미충족」", () => {
    expect(meetsOneHouseResidenceRequirement(buildResidenceReqInput(form(FACTS)), ONE_HOUSE_RESIDENCE)).toBe(true);
    expect(
      meetsOneHouseResidenceRequirement(buildResidenceReqInput(form({ ...FACTS, provisoReason: "" })), ONE_HOUSE_RESIDENCE),
    ).toBe(false);
  });
});
