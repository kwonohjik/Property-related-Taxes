/**
 * anchor (I-8 · ⑧ · ⑫) — 승계조합원 완공APT 거주를 **개월 수**로 입력하면 준공 전 거주를 가려낼 수 없다.
 *
 * 근거:
 *   · 소득세법 시행령 §162①4호(MST 286211 실독) — 「자기가 건설한 건축물에 있어서는 … 사용승인서 교부일.
 *     다만, 사용승인서 교부일 전에 사실상 사용하거나 … 임시사용승인을 받은 경우에는 그 사실상의 사용일 또는
 *     임시사용승인을 받은 날 중 빠른 날」
 *   · 시행령 §154①·§159의4 「그 보유기간 중 거주기간」 + 서면-2019-부동산-4508 「보유기간은 해당 주택의
 *     취득일(준공인가증 교부일)부터 계산하는 것으로 멸실 전 거주기간을 통산하지 아니함」
 *
 * ⇒ 준공 전 거주는 산입되지 않는다. 날짜 없는 개월 수로는 「어느 달」인지 알 수 없지만, **준공일~양도일보다
 *   긴 거주**는 불가능한 값이다. 구간 입력([준공일, 양도일] 한 구간 = `completedMonthsInclusive`)이 만들 수 있는
 *   최댓값을 상한으로 ⑧(재개발 카드 개월 칸 · Step4 개월 직접 입력)과 ⑫(route)가 같은 leaf로 막는다.
 *   구간 입력은 OH-50이 이미 준공일과 비교한다.
 *
 * 시료: 입주권 승계 2017-03-01 · 인가 2016-05-01 · 준공 2020-06-30 · 양도 2023-03-01 ⇒ 상한 32개월.
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

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { POST as POST_SINGLE } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { successorAptMaxResidenceMonths } from "@/lib/tax-engine/redevelopment-lthd";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

type Asset = ReturnType<typeof makeDefaultAsset>;

function successorAsset(over: Partial<Asset> = {}): Asset {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    acquisitionCause: "purchase",
    acquisitionDate: "2017-03-01",
    actualSalePrice: "1,100,000,000",
    fixedAcquisitionPrice: "500,000,000",
    redevApprovalDate: "2016-05-01",
    redevApprovalLawBasis: "urban_renovation_art_74",
    redevOriginalAssetType: "housing",
    redevSettlementDirection: "pay",
    redevSettlementAmount: "0",
    redevIsSuccessorMember: "yes",
    redevCompletionDate: "2020-06-30",
    addressJibun: "경기도 성남시 중원구 중앙동 1",
    ...over,
  } as Asset;
}

function makeForm(asset: Asset, over: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2023-03-01",
    filingDate: "2023-05-31",
    contractTotalPrice: "1100000000",
    assets: [asset],
    houses: [],
    presaleRights: [],
    isOneHousehold: true,
    householdHousingCount: "1",
    residencePeriodMonths: "0",
    ...over,
  } as unknown as TransferFormData;
}

const direct = (months: string): Partial<Asset> => ({ residenceInputMode: "direct", residencePeriodMonthsAsset: months });
const overflow = (issues: { message: string }[]) => issues.filter((i) => i.message.includes("준공 전 거주는"));

it("상한 — 준공 2020-06-30 ~ 양도 2023-03-01 = 32개월", () => {
  expect(successorAptMaxResidenceMonths(new Date("2020-06-30"), new Date("2023-03-01"))).toBe(32);
});

describe("I-8 ⑧ 재개발 카드 「신축주택 거주기간(개월)」", () => {
  it("🔴 33개월 → 차단", () => {
    expect(overflow(collectStepIssues(0, makeForm(successorAsset({ redevNewHouseResidenceMonths: "33" }))))).toHaveLength(1);
  });
  it("긍정 짝 — 32개월(상한) 통과", () => {
    // 다른 오류에 가려 통과한 것이 아님을 보이려고 전체 목록을 본다
    expect(collectStepIssues(0, makeForm(successorAsset({ redevNewHouseResidenceMonths: "32" })))).toEqual([]);
  });
  it("원조합원은 준공일 축이 아니다 — 승계 모드를 끈 뒤 남은 준공일이 있어도 막지 않는다", () => {
    const a = successorAsset({
      redevIsSuccessorMember: "no",
      acquisitionDate: "2015-01-01",
      redevRightsValue: "400,000,000",
      redevActualAcquisitionPrice: "300,000,000",
      redevNewHouseResidenceMonths: "40",
    } as Partial<Asset>);
    // 다른 오류에 가려진 통과가 아님을 보이려고 전체 목록을 본다
    expect(collectStepIssues(0, makeForm(a))).toEqual([]);
  });
});

describe("I-8 ⑧ Step4 거주기간 개월 직접 입력", () => {
  it("🔴 33개월 → 차단", () => {
    expect(overflow(collectStepIssues(1, makeForm(successorAsset(direct("33")))))).toHaveLength(1);
  });
  it("긍정 짝 — 32개월 통과", () => {
    expect(overflow(collectStepIssues(1, makeForm(successorAsset(direct("32")))))).toHaveLength(0);
  });
  it("⑤와 같은 게이트 — 1세대가 아니면(입력이 숨는다) 막지 않는다", () => {
    expect(overflow(collectStepIssues(1, makeForm(successorAsset(direct("33")), { isOneHousehold: false })))).toHaveLength(0);
  });
  it("⑤와 같은 게이트 — 신축 거주 칸이 Step4를 대신하면 Step4 값은 보지 않는다", () => {
    const a = successorAsset({ ...direct("33"), redevNewHouseResidenceMonths: "12" });
    expect(overflow(collectStepIssues(1, makeForm(a)))).toHaveLength(0);
  });
});

async function postForm(f: TransferFormData) {
  let body: unknown = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ success: true, data: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f).catch(() => undefined);
  vi.unstubAllGlobals();
  const res = await POST_SINGLE(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}

describe("I-8 ⑫ route — 같은 상한", () => {
  it("🔴 신축 거주 33개월 → 400", async () => {
    const r = await postForm(makeForm(successorAsset({ redevNewHouseResidenceMonths: "33" })));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("준공 전 거주는");
  });
  it("긍정 짝 — 32개월 → 200", async () => {
    const r = await postForm(makeForm(successorAsset({ redevNewHouseResidenceMonths: "32" })));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  });
  it("🔴 Step4 개월 33 (신축 칸 없음) → 400 · 32 → 200", async () => {
    expect((await postForm(makeForm(successorAsset(direct("33"))))).status).toBe(400);
    expect((await postForm(makeForm(successorAsset(direct("32"))))).status).toBe(200);
  });
  it("⑧과 같은 게이트 — 1세대가 아니면 Step4 개월 33도 200", async () => {
    expect((await postForm(makeForm(successorAsset(direct("33")), { isOneHousehold: false }))).status).toBe(200);
  });
});
