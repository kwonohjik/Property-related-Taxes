/**
 * anchor — 재개발APT·입주권 **× 지분 분할 취득(축 B)** (2026-09-04).
 *
 * ## 🔴 차단 사유가 stale이었다
 *
 * ⑧은 「§166 서브객체가 컴패니언에 없고, 청산금·권리가액이 **절대금액 성분**이라 지분 스케일이
 * 필요하다」로 재개발APT를 막고 있었다. **둘 다 이미 있었다** —
 * `buildRedevelopmentPayload`는 `rightsValue`·`preApprovalExpenses`·`postApprovalExpenses`
 * 스케일을 갖고 있었고(청산금은 「**납부한** 사실」이라 스케일 X — UI가 지분 납부분을 직접 받는다),
 * ⑫ `redevelopment` 서브객체도 2026-09-03에 등록됐다.
 *
 * 막고 있던 것은 **컴패니언 호출부가 `ownershipRatio`를 넘기지 않는 것** 하나였다.
 *
 * ## 🔴 입주권은 ⑧ 목록에 없어 **이미 열려 있었고, 그래서 틀려 있었다**
 *
 * 같은 미전달로 40% 카드의 권리가액·필요경비가 **100% 값**으로 남아 과대 계상됐다 —
 * 실측 **579,390,900 → 624,772,500 (45,381,600 과소)**.
 *
 * ⇒ 이 파일은 두 자산의 **축 B 불변식**(지분 합계 = 단건 100%)을 고정한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const actual = await io<typeof import("@/lib/db/tax-rates")>();
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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const BASE = {
  acquisitionCause: "purchase",
  acquisitionDate: "2010-03-01",
  useEstimatedAcquisition: false,
  fixedAcquisitionPrice: "400000000",
  redevActualAcquisitionPrice: "400000000",
  redevApprovalDate: "2018-05-01",
  redevRightsValue: "600000000",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "100000000",
  redevPreApprovalExpenses: "20000000",
  redevOriginalAssetType: "housing",
  capitalExpenditure: "30000000",
  transferExpense: "10000000",
};
const APT = { ...BASE, assetKind: "redevelopment_apt", redevSubject: "apt" };
const RIGHT = { ...BASE, assetKind: "right_to_move_in", redevSubject: "right" };

function form(assets: Record<string, unknown>[]): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets,
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "2000000000",
    householdHousingCount: "2",
  } as unknown as TransferFormData;
}
const A = (i: number, kind: Record<string, unknown>, o: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(i),
  ...kind,
  ...o,
});

async function run(f: TransferFormData) {
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
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      body: JSON.stringify(captured),
      headers: { "content-type": "application/json" },
    }),
  );
  return {
    body: captured as {
      companionAssets?: { redevelopment?: Record<string, unknown> }[];
    },
    status: res.status,
    json: (await res.json()) as {
      data?: {
        mode?: string;
        result?: { totalTax?: number };
        aggregated?: { totalTax?: number; properties?: unknown[] };
      };
    },
  };
}

/**
 * 축 B 두 카드. 🔑 **청산금은 지분 납부분을 직접 입력한다**(스케일 X — §166①1호 「납부한
 * 청산금」은 사실이고 UI 라벨이 지분 모드에서 「(지분 납부분)」으로 바뀐다).
 */
const axisB = (kind: Record<string, unknown>) =>
  form([
    A(1, kind, {
      ownershipNumerator: "60",
      ownershipDenominator: "100",
      redevSettlementAmount: "60000000",
    }),
    A(2, kind, {
      ownershipNumerator: "40",
      ownershipDenominator: "100",
      redevSettlementAmount: "40000000",
    }),
  ]);

describe("재개발APT·입주권 × 지분 분할 취득 (축 B)", () => {
  it("RF-1 재개발APT ⑧ 차단이 걷혔다", () => {
    expect(
      collectStepIssues(0, axisB(APT))
        .map((i) => i.message)
        .filter((m) => /지분 분할 취득 계산을 지원하지 않습니다/.test(m)),
    ).toEqual([]);
  });

  it("RF-2 🔑 재개발APT — 60% + 40% 합계 = 단건 100%", async () => {
    const single = await run(form([A(1, APT)]));
    const b = await run(axisB(APT));
    expect(single.json.data?.mode).toBe("single");
    expect(b.json.data?.mode).toBe("bundled");
    expect(b.json.data?.aggregated?.totalTax).toBe(single.json.data?.result?.totalTax);
    // 값이 0이면 위 단언이 공허해진다.
    expect(single.json.data?.result?.totalTax).toBe(453_700_500);
  });

  it("RF-3 🔴 입주권 — 이미 열려 있었고 **틀려 있었다**", async () => {
    const single = await run(form([A(1, RIGHT)]));
    const b = await run(axisB(RIGHT));
    expect(b.json.data?.aggregated?.totalTax).toBe(single.json.data?.result?.totalTax);
    /**
     * 🔑 **구별력** — 컴패니언에 `ownershipRatio`를 안 넘기던 종전에는 40% 카드의 권리가액·
     *    필요경비가 100% 값으로 남아 **579,390,900**(45,381,600 과소)이었다.
     */
    expect(single.json.data?.result?.totalTax).toBe(624_772_500);
  });

  it("RF-4 컴패니언 §166 서브객체가 **지분 스케일**돼 실린다", async () => {
    const r = await run(axisB(APT));
    const redev = r.body.companionAssets?.[0]?.redevelopment as Record<string, number>;
    // 스케일 O — §166④1호 평가액 · §97①2·3호 필요경비
    expect(redev.rightsValue).toBe(240_000_000); // 600,000,000 × 40%
    expect(redev.preApprovalExpenses).toBe(8_000_000); // 20,000,000 × 40%
    expect(redev.postApprovalExpenses).toBe(16_000_000); // (30,000,000 + 10,000,000) × 40%
    // 🔴 스케일 X — 「납부한 청산금」은 사실이라 사용자가 지분 납부분을 직접 넣는다.
    expect(redev.settlementAmount).toBe(40_000_000);
  });
});
