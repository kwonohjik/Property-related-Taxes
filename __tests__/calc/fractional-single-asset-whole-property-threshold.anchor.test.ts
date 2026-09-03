/**
 * anchor — 축 A(단건 공유지분)에서 **물건 전체 기준 판정**이 유지된다 (R4 §3).
 *
 * 계획서: `docs/02-design/features/transfer-fractional-single-asset-declaration.plan.md`
 *
 * ## 이 anchor가 지키는 것
 *
 * Gate-A가 막고 있던 동안 사용자에게 남은 유일한 우회로는 「지분율 100/100 + 지분분 금액
 * 직접 입력」이었다. 그러면 **12억 고가주택 판정 분모가 지분분으로 내려간다**:
 *
 * | 24억 물건의 40% 지분 · 1세대1주택 | 결정세액 |
 * |---|---|
 * | 지분율 40% + 물건 전체 24억 (정답) | 9,900,000 |
 * | 100/100 + 지분분 9.6억 (우회로)    | **0** ← 전액 비과세 오판 |
 *
 * 정답 경로가 성립하는 근거는 `transfer-tax-api.ts`의
 * `totalPropertyTransferPrice: primaryFractional ? totalContractPrice : undefined`이고,
 * 엔진은 `transfer-tax-exemption.ts`에서
 * `burdenedGiftDenominator ?? totalPropertyTransferPrice ?? transferPrice` 순으로 분모를 고른다.
 *
 * ⚠️ 아래 수치는 **mock 세율표(`makeMockRates`) 기준 실측값**이지 「정본 세액」이 아니다.
 *    값이 바뀌면 값을 고치기 전에 **원인**을 먼저 본다.
 *
 * ⚠️ 이 anchor는 **route를 태운다**. leaf 직접 호출은 ⑫ Zod·⑭ 매핑을 건너뛰므로
 *    같은 결함을 놓친다(memory `feedback_leaf_anchor_skips_zod_layer`).
 */
import { describe, it, expect, vi } from "vitest";
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
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 지분율·계약총액·취득가·기준시가를 받아 단건 폼을 만든다. 금액은 호출부가 준 그대로. */
function mkForm(
  num: string,
  den: string,
  total: number,
  acq: number,
  stdT: number,
  stdA: number,
): TransferFormData {
  const a = {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2009-01-01",
    ownershipNumerator: num,
    ownershipDenominator: den,
    ownershipRemainderThirdParty: num === den ? "" : "yes",
    fixedAcquisitionPrice: String(acq),
    standardPriceAtTransfer: String(stdT),
    standardPriceAtAcq: String(stdA),
  } as AssetForm;
  return {
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    assets: [a],
    houses: [],
    presaleRights: [],
    contractTotalPrice: String(total),
    totalTransferExpense: "0",
  } as unknown as TransferFormData;
}

/** ④가 실제로 fetch에 실은 body를 그대로 route에 넣는다 — 재구성하지 않는다. */
async function run(form: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        isNonBusinessLand: false,
        annualBasicDeductionUsed: 0,
        ...cap.body,
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: 120,
      }),
    }),
  );
  const json = (await res.json()) as Record<string, Record<string, Record<string, number>>>;
  return { status: res.status, body: cap.body!, result: json?.data?.result ?? {} };
}

/** 24억 물건 · 40% 지분 → 지분분 9.6억 (12억 문턱을 가로지른다) */
const WHOLE = () => mkForm("40", "100", 2_400_000_000, 800_000_000, 1_800_000_000, 600_000_000);
const BYPASS = () => mkForm("100", "100", 960_000_000, 320_000_000, 720_000_000, 240_000_000);

describe("R4 H — 축 A 물건 전체 기준 판정", () => {
  it("H1 지분율 경로: 12억 분모가 물건 전체(24억)로 유지된다", async () => {
    const { status, body, result } = await run(WHOLE());
    expect(status).toBe(200);
    // ⑬ 배선 — 지분율과 물건 전체 양도가액이 함께 실린다
    expect(body.ownershipRatio).toBe(0.4);
    expect(body.totalPropertyTransferPrice).toBe(2_400_000_000);
    // 양도가액·취득가액은 지분분으로 축소된다
    expect(body.transferPrice).toBe(960_000_000);
    expect(body.acquisitionPrice).toBe(320_000_000);
    expect(result.totalTax).toBe(9_900_000);
  });

  it("H2 🔴 우회로(100/100 + 지분분)는 전액 비과세로 오판한다 — 판별력", async () => {
    const { status, body, result } = await run(BYPASS());
    expect(status).toBe(200);
    expect(body.ownershipRatio).toBeUndefined();
    expect(body.totalPropertyTransferPrice).toBeUndefined();
    // 양도가액·취득가액은 H1과 **같은데** 판정 분모만 다르다 — 차이의 원인을 못 박는다
    expect(body.transferPrice).toBe(960_000_000);
    expect(body.acquisitionPrice).toBe(320_000_000);
    expect(result.totalTax).toBe(0);
  });

  it("H3 12억 미만 물건에서는 두 경로가 같다 (문턱 축임을 고정)", async () => {
    const a = await run(mkForm("40", "100", 1_000_000_000, 400_000_000, 800_000_000, 300_000_000));
    const b = await run(mkForm("100", "100", 400_000_000, 160_000_000, 320_000_000, 120_000_000));
    expect(a.result.totalTax).toBe(b.result.totalTax);
    expect(a.result.totalTax).toBe(0);
  });
});
