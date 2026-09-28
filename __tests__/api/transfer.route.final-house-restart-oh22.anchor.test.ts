/**
 * route anchor — OH-22(I-1) §154⑤ 단서 최종 1주택 재기산 처분 이력이 **세 route 전부**에 도달한다.
 *
 * 폼 → 실제 클라이언트 변환(④⑬: `callTransferTaxAPI` · `callMultiTransferTaxAPI` ·
 * `buildOneHouseExemptionApiBody`) → Zod(⑫) → route 매핑(⑭ `toEngineFinalHouseRestart`) → 엔진.
 * 「본문에 키가 있다」는 도달을 증명하지 않는다 — route 결과로 관측한다(`feedback_leaf_anchor_skips_zod_layer`).
 *
 * 시나리오: 비조정 1주택 2015-03-01 취득 · 5억 · 2022-03-01 양도. 다른 주택 양도 2021-06-01(일시적 2주택 아님)
 * → 보유기간 2021-06-01부터 재기산 → 보유 2년 미달 과세. 긍정·부정 짝: 「처분 없음」이면 비과세.
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
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { meetsOneHouseResidenceRequirement } from "@/lib/tax-engine/transfer-tax-exemption";
import { ONE_HOUSE_RESIDENCE } from "@/lib/tax-engine/legal-codes";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

type Obj = Record<string, unknown>;
type Row = TransferFormData["finalHouseRestartDisposals"][number];
const row = (kind: Row["kind"], date: string, temporaryTwoHouse: Row["temporaryTwoHouse"] = "no"): Row => ({
  id: `${kind}-${date}`,
  kind,
  date,
  temporaryTwoHouse,
});

const SOLD: Partial<TransferFormData> = {
  finalHouseRestartHistory: "yes",
  finalHouseRestartDisposals: [row("transfer", "2021-06-01")],
};

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2022-03-01";
  f.householdHousingCount = "1";
  f.isOneHousehold = true;
  f.isRegulatedArea = false;
  f.wasRegulatedAtAcquisition = false;
  f.residencePeriodMonths = "0";
  f.contractTotalPrice = "500,000,000";
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    actualSalePrice: "500,000,000",
    fixedAcquisitionPrice: "300,000,000",
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
      headers: { "Content-Type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify(body),
    }),
  );

async function single(f: TransferFormData) {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: { isExempt: boolean; warnings?: string[] } } };
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.result;
}
async function multi(f: TransferFormData) {
  const mf = {
    taxYear: 2022,
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
    data: {
      judgment: {
        isExempt: boolean;
        undetermined: { id: string }[];
        finalOneHouseRestart?: { applied: boolean; restartDate?: string; description: string };
      };
    };
  };
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.judgment;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

describe("OH-22 ⑫⑬⑭ — 세 route 도달", () => {
  it("★ 단건 계산기 — 2021-06-01 양도 → 재기산 과세 + 안내 문장", async () => {
    const r = await single(form(SOLD));
    expect(r.isExempt).toBe(false);
    expect((r.warnings ?? []).join("\n")).toContain("2021-06-01부터 다시 셉니다");
  });
  it("★ 다건 합산 — 같은 폼 → 과세", async () => {
    expect((await multi(form(SOLD))).isExempt).toBe(false);
  });
  it("★ 판정 메뉴 — 같은 사실 → 과세 + 재기산 echo(재기산일)", async () => {
    const j = await judge(form(SOLD));
    expect(j.isExempt).toBe(false);
    expect(j.finalOneHouseRestart?.applied).toBe(true);
    expect(String(j.finalOneHouseRestart?.restartDate).slice(0, 10)).toBe("2021-06-01");
  });
  it("부정 짝 — 「처분 없음」이면 세 route 모두 비과세 · 판정 보류 없음", async () => {
    const f = form({ finalHouseRestartHistory: "no" });
    expect((await single(f)).isExempt).toBe(true);
    expect((await multi(f)).isExempt).toBe(true);
    const j = await judge(f);
    expect(j.isExempt).toBe(true);
    expect(j.undetermined.map((u) => u.id)).not.toContain("154-5-final-one-house-restart-unverified");
  });
  it("미답 — 비과세 + 판정 보류(종전 동작 유지)", async () => {
    const j = await judge(form());
    expect(j.isExempt).toBe(true);
    expect(j.undetermined.map((u) => u.id)).toContain("154-5-final-one-house-restart-unverified");
    expect(j.finalOneHouseRestart).toBeUndefined();
  });
  it("⑭ 날짜 변환 — 증여 2021-02-16은 처분 아님(비과세), 2021-02-17은 재기산(과세) — 세 route 모두", async () => {
    const before = form({ finalHouseRestartHistory: "yes", finalHouseRestartDisposals: [row("gift", "2021-02-16")] });
    const after = form({ finalHouseRestartHistory: "yes", finalHouseRestartDisposals: [row("gift", "2021-02-17")] });
    expect((await single(before)).isExempt).toBe(true);
    expect((await multi(before)).isExempt).toBe(true);
    expect((await judge(before)).isExempt).toBe(true);
    expect((await single(after)).isExempt).toBe(false);
    expect((await multi(after)).isExempt).toBe(false);
    expect((await judge(after)).isExempt).toBe(false);
  });
  it("③ 범위 밖(양도 2022-05-10)의 stale 이력은 보내지 않는다 → 비과세", async () => {
    const f = form({ ...SOLD, transferDate: "2022-05-10" });
    const body = await bodyOf(() => callTransferTaxAPI(f));
    expect(body).not.toHaveProperty("finalOneHouseRestart");
    expect((await single(f)).isExempt).toBe(true);
    expect((await judge(f)).isExempt).toBe(true);
  });
});

describe("⑧ 검증 — 「있음」만 막는다, 범위 밖 stale 이력은 막지 않는다", () => {
  // 계산기 Step4 화면 = validate step 1(보유 상황)
  const step4 = (f: TransferFormData) => validateStep(1, f);
  it("처분일 미입력 → 계산기 Step4·판정 메뉴 ③ 모두 차단", () => {
    const f = form({ finalHouseRestartHistory: "yes", finalHouseRestartDisposals: [row("transfer", "")] });
    expect(step4(f)).toContain("처분일을 입력");
    const j = { ...createInitialOneHouseJudgmentForm(), ...f };
    expect(validateStep2(j).map((e) => e.message).join("\n")).toContain("처분일을 입력");
  });
  it("양도일 뒤 처분일 → 차단", () => {
    expect(step4(form({ finalHouseRestartHistory: "yes", finalHouseRestartDisposals: [row("transfer", "2022-03-02")] }))).toContain(
      "양도일 이전",
    );
  });
  it("미답·범위 밖은 차단하지 않는다", () => {
    expect(step4(form()) ?? "").not.toContain("§154⑤");
    const stale = form({ transferDate: "2022-05-10", finalHouseRestartHistory: "yes", finalHouseRestartDisposals: [row("transfer", "")] });
    expect(step4(stale) ?? "").not.toContain("§154⑤");
  });
});

describe("Step4 거주요건 안내 — ④·⑭와 같은 조립(단일 진실)", () => {
  it("조정 취득 · 거주 40개월 — 재기산이면 안내도 「미충족」, 처분 없음이면 「충족」", () => {
    const reg = (over: Partial<TransferFormData>) =>
      form({ wasRegulatedAtAcquisition: true, residencePeriodMonths: "40", ...over });
    const f = reg({ ...SOLD });
    f.assets[0] = { ...f.assets[0], acquisitionDate: "2018-01-01", residencePeriodMonthsAsset: "40" };
    const g = reg({ finalHouseRestartHistory: "no" });
    g.assets[0] = { ...g.assets[0], acquisitionDate: "2018-01-01", residencePeriodMonthsAsset: "40" };
    expect(meetsOneHouseResidenceRequirement(buildResidenceReqInput(g), ONE_HOUSE_RESIDENCE)).toBe(true);
    expect(meetsOneHouseResidenceRequirement(buildResidenceReqInput(f), ONE_HOUSE_RESIDENCE)).toBe(false);
  });
});
