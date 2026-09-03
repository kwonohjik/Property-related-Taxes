/**
 * anchor — 상가(commercial_building) × 축 B(지분 분할) · 컴패니언(다른 물건).
 *
 * 계획서: `docs/02-design/features/transfer-companion-commercial.plan.md`
 *
 * ## 막고 있던 것은 「전용 경로 부재」가 아니었다
 *
 * 종전 주석은 「상가·재개발은 그 경로(`general-building-fractional.ts`)가 없어 계속 차단」이었다.
 * 실제 장벽은 **⑩ 컴패니언 Zod enum 3종**(`housing|land|building`)이었고, 그래서
 * **⑧이 막지 않는 함께양도 상가도 route가 400으로 죽고 있었다**(실측 — 안내 없는 dead-end).
 *
 * ## 왜 지분 스케일이 필요 없나
 *
 * 상가 서브객체는 둘 다 **비율 성분**이다:
 * - `commercialAppurtenantLand`: 대지·바닥 **면적**(§101① 배율)은 물건 단위 사실이다.
 *   지분으로 줄이면 초과분 **판정 자체**가 달라진다.
 * - `commercialBuildingValuation`: 환산 기준시가는 분자·분모로 함께 나타나 **약분**된다.
 *
 * (재개발 권리가액·청산금은 취득가액에 직접 더해지는 **절대금액 성분**이라 반대다.)
 *
 * ## ⚠️ 「일치」가 「양쪽 다 미발동」이 아님을 함께 단언한다
 *
 * A-4가 판별력 대조군이다 — 부수토지 미입력본과 **819,500원** 차이가 난다.
 * 그 차가 0이면 A-2의 일치는 아무것도 증명하지 못한다.
 *
 * ⚠️ 수치는 mock 세율표 실측값이지 「정본 세액」이 아니다.
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 상업지역 3배 · 대지 1,200㎡ · 바닥 200㎡ → 기준면적 600㎡ · 초과 600㎡(50%). */
const CB = {
  assetKind: "commercial_building",
  fixedAcquisitionPrice: "600000000",
  useEstimatedAcquisition: false,
  cbTotalLandArea: "1200",
  cbTotalBuildingFootprintArea: "200",
  cbZoneType: "commercial",
} as const;

/** 부수토지 3필드를 뺀 대조군 — §101① 축의 판별력 측정용. */
const CB_NO_APPURTENANT = {
  assetKind: "commercial_building",
  fixedAcquisitionPrice: "600000000",
  useEstimatedAcquisition: false,
} as const;

const asset = (id: number, over: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(id),
    acquisitionCause: "purchase",
    acquisitionDate: "2014-06-01",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
    ...over,
  }) as AssetForm;

const form = (assets: AssetForm[]): TransferFormData =>
  ({
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    assets,
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1200000000",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
  }) as unknown as TransferFormData;

interface RouteData {
  mode?: string;
  aggregated?: {
    totalTax?: number;
    properties?: { transferGain: number; steps?: { label: string }[] }[];
  };
  result?: { transferGain?: number; totalTax?: number };
}

async function run(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f);
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
        isOneHousehold: false,
        householdHousingCount: 0,
        residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as { data?: RouteData };
  return { status: res.status, body: cap.body!, data: json.data };
}

/**
 * 축 B 폼 상태 — **컴패니언 카드는 ① 기본정보가 비어 있다**.
 *
 * 🔑 `CompanionAssetCard`가 `splitMode === "fractional" && index > 0`에서 ① 섹션을
 *    숨기므로 `assetKind`·`cb*`가 primary에만 존재한다. 컴패니언에도 같은 값을 손으로
 *    넣은 픽스처는 `mergePrimaryBasic`을 **우회**해 그 층의 뮤테이션이 통과한다
 *    (실측: 구별력 0 — 메모리 `feedback_mutation_zero_discrimination_is_not_proof`).
 */
const AXIS_B: AssetForm[] = [
  asset(1, { ...CB, ownershipNumerator: "60" }),
  asset(2, {
    ownershipNumerator: "40",
    fixedAcquisitionPrice: "600000000",
    useEstimatedAcquisition: false,
  }),
];

/** §101① 부수토지 초과 판정이 그 카드에서 **실제로 발동**했는가. */
const appurtenantFired = (p?: { steps?: { label: string }[] }): boolean =>
  !!p?.steps?.some((s) => /부수토지 기준면적 초과분/.test(s.label));

describe("상가 × 축 B(지분 분할)", () => {
  it("A-1 ⑧ 게이트가 열렸다", () => {
    const msgs = collectStepIssues(0, form(AXIS_B) as never).map((i) => i.message);
    expect(msgs.some((m) => m.includes("해당 자산 종류는 지분 분할 취득"))).toBe(false);
  });

  it("A-2 합계 세액 = 단건 100%와 **완전 일치**, 차익은 지분율에 정비례", async () => {
    const single = await run(form([asset(1, CB)]));
    expect(single.status).toBe(200);
    expect(single.data?.result?.transferGain).toBe(600_000_000);
    expect(single.data?.result?.totalTax).toBe(187_665_500);

    const axisB = await run(form(AXIS_B));
    expect(axisB.status).toBe(200);
    expect(axisB.data?.mode).toBe("bundled");
    // 선형성 — 화면 규약이 「100% 기준 입력 + 지분율 자동 적용」이므로 차익은 정비례해야 한다.
    expect(axisB.data?.aggregated?.properties?.map((p) => p.transferGain)).toEqual([
      360_000_000, 240_000_000,
    ]);
    expect(axisB.data?.aggregated?.totalTax).toBe(187_665_500);
  });

  it("A-3 🔑 §101① 부수토지 초과 판정이 **두 카드 모두에서** 발동한다", async () => {
    const axisB = await run(form(AXIS_B));
    const props = axisB.data?.aggregated?.properties ?? [];
    expect(props).toHaveLength(2);
    expect(props.map(appurtenantFired)).toEqual([true, true]);
  });

  it("A-4 🔑 판별력 — 부수토지 미입력본과 세액이 다르다", async () => {
    // 이 차이가 0이면 A-2의 「일치」는 양쪽 다 미발동이어도 성립한다.
    const withAppurtenant = await run(form([asset(1, CB)]));
    const without = await run(form([asset(1, CB_NO_APPURTENANT)]));
    expect(without.data?.result?.totalTax).toBe(186_846_000);
    expect(
      (withAppurtenant.data?.result?.totalTax ?? 0) - (without.data?.result?.totalTax ?? 0),
    ).toBe(819_500);
  });

  it("A-5 ⑬ 컴패니언 payload에 상가 서브객체가 실린다 (지분 스케일 없이)", async () => {
    const axisB = await run(form(AXIS_B));
    const comp = (axisB.body.companionAssets as Record<string, unknown>[])[0];
    expect(comp.assetKind).toBe("commercial_building");
    // 면적은 **물건 전체 그대로** — 40%로 줄이면 초과분 판정이 달라진다.
    expect(comp.commercialAppurtenantLand).toEqual({
      totalLandArea: 1200,
      totalBuildingFootprintArea: 200,
      zoneType: "commercial",
    });
  });
});

describe("상가 × 컴패니언(다른 물건)", () => {
  const HOUSING = {
    assetKind: "housing",
    fixedAcquisitionPrice: "300000000",
    useEstimatedAcquisition: false,
    standardPriceAtTransfer: "400000000",
    actualSalePrice: "500000000",
  };
  const CB_COMPANION = {
    ...CB,
    standardPriceAtTransfer: "800000000",
    actualSalePrice: "700000000",
  };

  it("A-6 🔴 종전에는 ⑧을 통과하고 route가 400이었다 — 이제 계산된다", async () => {
    const f = form([asset(1, HOUSING), asset(2, CB_COMPANION)]);
    // ⑧ `SINGLE_ONLY`에 상가가 없다는 사실 자체는 종전과 같다. 바뀐 것은 route다.
    const msgs = collectStepIssues(0, f as never)
      .map((i) => i.message)
      .filter((m) => /함께 양도와 같이 계산할 수 없습니다/.test(m));
    expect(msgs).toEqual([]);

    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.data?.aggregated?.properties?.map((p) => p.transferGain)).toEqual([
      100_000_000, 200_000_000,
    ]);
    expect(r.data?.aggregated?.totalTax).toBe(79_849_000);
  });

  it("A-7 ⑭ 컴패니언 상가가 `land`로 접히지 않는다 — §101①이 발동한다", async () => {
    // 종전 ⑭ 삼항식은 상가를 land로 접었다. enum만 넓히면 그 fold가 침묵 오산이 된다.
    const r = await run(form([asset(1, HOUSING), asset(2, CB_COMPANION)]));
    const props = r.data?.aggregated?.properties ?? [];
    expect(appurtenantFired(props[0])).toBe(false); // 주택 — 대상 아님
    expect(appurtenantFired(props[1])).toBe(true); // 상가
  });
});
