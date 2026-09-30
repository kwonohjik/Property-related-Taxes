/**
 * anchor (E-8 · ⑤④⑧ + ④→⑫→⑭→엔진) — 승계조합원 신축주택을 일반주택으로 양도할 때 §155② 괄호 판정.
 *
 * 엔진은 준공일(소득세법 시행령 §162①4호)을 일반주택 취득일로, 입주권 승계일 ≤ 상속개시일을
 * 「상속개시 당시 보유한 조합원입주권」으로 본다(`resolveInheritedHouseExclusionFromInput`). 새 입력은 없다 —
 * 기존 `redevCompletionDate`·`acquisitionDate`·명부 상속개시일이 경로를 이미 갖고 있다. 여기서 고정하는 것:
 *   · 폼에서 route까지 그 두 날짜가 엔진에 닿아 결론이 바뀐다(라이브러리 anchor ≠ 배선 증명)
 *   · 선언 칸(「상속개시 당시 보유 권리의 신축주택」)은 엔진이 읽지 않으므로 ⑤·④·⑧ 게이트가 닫힌다
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
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import {
  buildInheritanceGeneralHousePayload,
  generalHouseRightAtInheritanceVisible,
} from "@/lib/calc/inheritance-general-house-scope";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
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

/** 상속 2011-06-01 · 인가 approval · 입주권 승계 rightAcq · 준공 2015-06-01 · 양도 2018-06-01 8억 · 비조정 · 2주택 */
function form(p: { rightAcq: string; approval: string; successor?: boolean }, over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  const successor = p.successor ?? true;
  return {
    ...f,
    transferDate: "2018-06-01",
    filingDate: "2018-08-31",
    contractTotalPrice: "800000000",
    householdHousingCount: "2",
    isOneHousehold: true,
    isRegulatedArea: false,
    residencePeriodMonths: "0",
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "redevelopment_apt",
        acquisitionCause: "purchase",
        acquisitionDate: p.rightAcq,
        fixedAcquisitionPrice: "400000000",
        actualSalePrice: "800000000",
        redevSubject: "apt",
        redevApprovalDate: p.approval,
        redevApprovalLawBasis: "urban_renovation_art_74",
        redevOriginalAssetType: "housing",
        redevSettlementDirection: "pay",
        redevSettlementAmount: "0",
        redevRightsValue: "400000000",
        redevIsSuccessorMember: successor ? "yes" : "no",
        redevCompletionDate: successor ? "2015-06-01" : "",
      } as unknown as AssetForm,
    ],
    houses: [inheritedRow("2011-06-01")],
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
  return json.data.result as { isExempt: boolean; determinedTax: number };
}

describe("E-8 ④→⑫→⑭→엔진 — 승계조합원 신축주택", () => {
  it("🔴 상속 후 승계(2012-06-01)한 입주권의 신축주택(준공 2015) → 일반주택 아님 → 과세", async () => {
    const r = await postSingle(await captureCalcBody(form({ rightAcq: "2012-06-01", approval: "2011-12-01" })));
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBeGreaterThan(0);
  });

  it("긍정 짝 — 상속개시 전 승계(2011-03-01)한 입주권(상속개시 당시 보유)의 신축주택 → 비과세", async () => {
    const r = await postSingle(await captureCalcBody(form({ rightAcq: "2011-03-01", approval: "2010-12-01" })));
    expect(r.isExempt).toBe(true);
  });
});

describe("E-8 ⑤④⑧ 게이트 — 엔진이 읽지 않는 선언 칸은 닫는다", () => {
  it("🔴 승계조합원 + 준공일 → 닫힘 · stale 선언을 싣지 않는다 (입주권 승계일 기준 종전 게이트라면 열렸을 사례)", () => {
    // 승계 2014-01-10 ≥ 2013-02-15 · 상속 2011-06-01 뒤 — 종전 게이트(입주권 승계일을 취득일로)는 「no」 → 열림
    const f = form({ rightAcq: "2014-01-10", approval: "2013-12-01" }, { generalHouseRightAtInheritance: "redevelopment_right" });
    expect(generalHouseRightAtInheritanceVisible(f)).toBe(false);
    expect(buildInheritanceGeneralHousePayload(f)).toEqual({});
  });

  it("긍정 짝 — 원조합원(종전주택 2012-06-01 취득 · 상속 후 · 2013-02-15 전)은 부칙 제20조로 닫힘, 2014 취득이면 열림", () => {
    expect(generalHouseRightAtInheritanceVisible(form({ rightAcq: "2012-06-01", approval: "2013-12-01", successor: false }))).toBe(false);
    expect(generalHouseRightAtInheritanceVisible(form({ rightAcq: "2014-01-10", approval: "2014-12-01", successor: false }))).toBe(true);
  });

  it("긍정 짝 — 승계조합원이라도 준공일 미입력이면 종전 게이트(엔진도 종전 동작)", () => {
    const f = form({ rightAcq: "2014-01-10", approval: "2013-12-01" });
    (f.assets[0] as unknown as { redevCompletionDate: string }).redevCompletionDate = "";
    expect(generalHouseRightAtInheritanceVisible(f)).toBe(true);
  });
});
