/**
 * anchor — 겸용주택 **× 지분 분할 취득(축 B)** 개방 (2026-09-04).
 *
 * ## 차단 사유가 또 틀렸다
 *
 * ⑧은 「지분별 안분 UI 부재 또는 양도가액 모델 비양립」으로 막고 있었다. 실측하면 **배관은
 * 이미 통한다** — 파트 카드가 5장 × 지분 수로 나온다. 막고 있던 진짜 원인은
 * **절대금액 성분에 지분 스케일이 없다**는 것이었다: 취득가액·자본적지출·양도비가 카드마다
 * **100% 값 그대로** 실려 2배 계상됐다.
 *
 * ## 무엇을 스케일하고 무엇을 안 하는가
 *
 * `MixedUseAssetInput.ownershipRatio` 계약이 정본이다 — **기준시가·면적은 물건 전체(100%) 유지**
 * (환산 산식에서 분자·분모 약분 · §166⑥ 안분 비율이 100% 전제), `ownershipRatio`는
 * **개산공제 base 축소 전용**. ⇒ 그 밖의 **절대금액**은 ④가 지분분으로 만들어 넘긴다.
 *
 * 보상액 4종은 **스케일하지 않는다** — 기준시가 총액과 `min`으로 겨루는 값이라 같은 스케일이어야
 * 한다(§164⑨1호 환산 분모).
 *
 * 설계문서: `transfer-bundled-subengine-hosting.design.md` §12
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

/** 자본적지출·양도비를 **일부러 크게** 둔다 — 카드 이중계상을 이 픽스처가 드러낸다. */
const MIXED = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2009-03-01",
  useEstimatedAcquisition: false,
  fixedAcquisitionPrice: "500000000",
  capitalExpenditure: "100000000",
  transferExpense: "20000000",
  residentialFloorArea: "60",
  nonResidentialFloorArea: "40",
  buildingFootprintArea: "50",
  mixedUseTotalLandArea: "300",
  mixedTransferHousingPrice: "1600000000",
  mixedTransferCommercialBuildingPrice: "200000000",
  mixedTransferLandPricePerSqm: "1000000",
  mixedAcqHousingPrice: "400000000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqLandPricePerSqm: "300000",
};

function form(assets: Record<string, unknown>[]): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets,
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "2000000000",
    householdHousingCount: "1",
    isOneHousehold: true,
    residencePeriodMonths: "120",
  } as unknown as TransferFormData;
}
const A = (i: number, o: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(i),
  ...MIXED,
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
    body: captured as { mixedUse?: Record<string, unknown> },
    status: res.status,
    json: (await res.json()) as {
      data?: {
        mode?: string;
        result?: { total?: { transferTax?: number } };
        aggregated?: { totalTax?: number; properties?: { propertyId: string }[] };
      };
    },
  };
}

const SINGLE = () => form([A(1)]);
const AXIS_B = () =>
  form([
    A(1, { ownershipNumerator: "60", ownershipDenominator: "100" }),
    A(2, { ownershipNumerator: "40", ownershipDenominator: "100" }),
  ]);

describe("겸용주택 × 지분 분할 취득 (축 B)", () => {
  it("FB-1 ⑧ 차단이 걷혔다", () => {
    expect(
      collectStepIssues(0, AXIS_B())
        .map((i) => i.message)
        .filter((m) => /겸용주택/.test(m)),
    ).toEqual([]);
  });

  it("FB-2 🔑 **60% + 40% 합계 = 단건 100%**", async () => {
    const single = await run(SINGLE());
    const axisB = await run(AXIS_B());
    expect(single.json.data?.mode).toBe("mixed-use");
    expect(axisB.json.data?.mode).toBe("bundled");
    // aggregate의 `totalTax`는 산출세액 + 지방소득세(10%)라 단건과는 그 관계로 대응한다.
    expect(axisB.json.data?.aggregated?.totalTax).toBe(
      Math.floor((single.json.data?.result?.total?.transferTax ?? 0) * 1.1),
    );
    // 값이 0이면 위 단언이 공허해진다.
    expect(single.json.data?.result?.total?.transferTax).toBe(138_366_556);
  });

  it("FB-3 지분 카드가 각각 파트 5장으로 펼쳐진다", async () => {
    const r = await run(AXIS_B());
    const ids = (r.json.data?.aggregated?.properties ?? []).map(
      (p) => p.propertyId.split("#")[0],
    );
    expect(ids).toHaveLength(10);
    expect(ids.filter((x) => x === "mu-nbl")).toHaveLength(2);
  });

  it("FB-4 🔴 절대금액만 지분 스케일된다 — 기준시가·면적은 물건 전체", async () => {
    const r = await run(form([A(1, { ownershipNumerator: "60", ownershipDenominator: "100" })]));
    const mu = r.body.mixedUse!;
    // 절대금액 — 60%
    expect(mu.acquisitionActualTotalPrice).toBe(300_000_000);
    expect(mu.capitalExpenditure).toBe(60_000_000);
    expect(mu.transferExpense).toBe(12_000_000);
    // 기준시가·면적 — **물건 전체 그대로**(환산 산식에서 약분 · §166⑥ 안분이 100% 전제)
    expect((mu.transferStandardPrice as { housingPrice: number }).housingPrice).toBe(1_600_000_000);
    expect(mu.totalLandArea).toBe(300);
    expect(mu.residentialFloorArea).toBe(60);
  });
});
