/**
 * 지분 규약 `applyRatio` 부동소수 1원 과소 — 경로별 anchor (2026-10-21)
 *
 * 계획: docs/00-pm/share-ratio-apply-float-precision.plan.md §4(범위 표 S · S′) · §5
 *
 * 지분 70% 단건 토지에서 「물건 전체(100%) 입력 × 지분율」이 지나는 곳을 한 지점씩 고정한다.
 *   · ④ API 변환 — 양도가·취득가·필요경비(`transfer-tax-api.ts` `shareOf`·`applyRatio`)
 *   · ⑥ 사이드바 — `computeTransferPerAssetSummary` · `computeTransferSummary` (S′ 5곳 + 1곳)
 *   · ⑦ 신고서 — `buildRows` (S′ 3곳)
 *   · 결정세액 — 양도가 1원 과소가 산출세액까지 가는 쌍대 사례
 *   · 일반건물 지분 — `applyShareScale` · route의 `general-building-fractional.ts` 지분 양도가액
 *
 * 핵심 불변: **사이드바·신고서가 엔진(④)과 같은 값**을 보인다 — `applyRatio`만 고치고 거울을 두면 1원씩 어긋난다.
 *
 * 금액은 70%에서 옛 식이 1원 과소인 값만 골랐다(`PREMISE`가 고정). 기대값은 리터럴이다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { computeTransferSummary, createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const TD = "2026-02-16";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(new Date(TD)) as never);
});
afterEach(() => vi.unstubAllGlobals());

/** 옛 식이 70%에서 1원 과소인 금액 (물건 전체 100%) */
const PRICE = 340_000_000; // → 238,000,000 (옛 …999)
const ACQ = 180_000_000; // → 126,000,000 (옛 …999)
const EXP = 21_000_000; // → 14,700,000 (옛 …999)
const PRICE_S = 238_000_000;
const ACQ_S = 126_000_000;
const EXP_S = 14_700_000;

describe("PREMISE — 옛 식이 1원 과소인 입력이다", () => {
  it("70%: 340,000,000 · 180,000,000 · 21,000,000 · 170,000,000", () => {
    for (const x of [PRICE, ACQ, EXP, 170_000_000]) {
      expect(Math.floor(x * (parseFloat("70") / parseFloat("100")))).toBe((x * 7) / 10 - 1);
    }
  });
});

function landForm(over: Partial<AssetForm> = {}, formOver: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: TD,
    contractTotalPrice: String(PRICE),
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "land",
        acquisitionCause: "purchase",
        acquisitionDate: "2024-06-01",
        fixedAcquisitionPrice: String(ACQ),
        directExpenses: String(EXP),
        transferArea: "300",
        acquisitionArea: "300",
        ownershipNumerator: "70",
        ownershipDenominator: "100",
        ownershipRemainderThirdParty: "yes",
        ...over,
      } as AssetForm,
    ],
    ...formOver,
  } as TransferFormData;
}

/** fetch를 route POST로 연결하고 보낸 body를 잡는다 */
function routeStub() {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return POST(
        new NextRequest("http://localhost/api/calc/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: String(init?.body),
        }),
      );
    }),
  );
  return bodies;
}

describe("④ API 변환 — 양도가·취득가·필요경비 (transfer-tax-api.ts)", () => {
  it("🔴 70% 단건: transferPrice 238,000,000 · acquisitionPrice 126,000,000 · expenses 14,700,000", async () => {
    const bodies = routeStub();
    await callTransferTaxAPI(landForm());
    expect(bodies[0].transferPrice).toBe(PRICE_S);
    expect(bodies[0].acquisitionPrice).toBe(ACQ_S);
    expect(bodies[0].expenses).toBe(EXP_S);
    expect(bodies[0].totalPropertyTransferPrice, "물건 전체 100%는 그대로").toBe(PRICE);
  });

  it("대조군: 지분 50%는 옛 식과 같은 값 (회귀 가드)", async () => {
    const bodies = routeStub();
    await callTransferTaxAPI(landForm({ ownershipNumerator: "50" }));
    expect(bodies[0].transferPrice).toBe(170_000_000);
    expect(bodies[0].acquisitionPrice).toBe(90_000_000);
    expect(bodies[0].expenses).toBe(10_500_000);
  });
});

describe("④ 다필지 모드 — 필지 금액 지분 스케일 (transfer-tax-api-parcels.ts)", () => {
  it("🔴 70%: 필지 취득가액 170,000,000 → 119,000,000 · 필요경비 21,000,000 → 14,700,000", async () => {
    const bodies = routeStub();
    const f = landForm({
      parcelMode: true,
      actualSalePrice: String(PRICE),
      parcels: [
        {
          id: "p1", acquisitionDate: "2024-06-01", acquisitionMethod: "actual", acquisitionArea: "300", transferArea: "300",
          acquisitionPrice: "170000000", expenses: "21000000", capitalExpenditure: "", transferExpense: "",
        },
      ],
    } as Partial<AssetForm>);
    await callTransferTaxAPI(f);
    const [p1] = (bodies[0].parcels ?? []) as Record<string, unknown>[];
    expect(p1.acquisitionPrice).toBe(119_000_000);
    expect(p1.expenses).toBe(14_700_000);
  });
});

describe("결정세액 — 양도가 1원 과소가 산출세액까지 간다", () => {
  it("🔴 70% · 양도가 170,000,000 · 취득가 100,000,000 (1년 8개월 보유): 양도차익 49,000,000 → 결정세액 18,600,000 (옛 18,599,999)", async () => {
    routeStub();
    const r = await callTransferTaxAPI(
      landForm({ fixedAcquisitionPrice: "100000000", directExpenses: "0" }, { contractTotalPrice: "170000000" }),
    );
    expect(r.mode).toBe("single");
    if (r.mode !== "single") return;
    expect(r.result.transferGain).toBe(49_000_000); // 옛 48,999,999
    expect(r.result.taxBase).toBe(46_500_000); // 옛 46,499,999
    expect(r.result.determinedTax).toBe(18_600_000); // 옛 18,599,999
    expect(r.result.localIncomeTax).toBe(1_860_000); // 옛 1,859,999
    expect(r.result.totalTax).toBe(20_460_000); // 옛 20,459,998
  });
});

describe("⑥ 사이드바 — 엔진(④)과 같은 값", () => {
  it("🔴 자산별 행: 양도가 238,000,000 · 취득가 126,000,000 · 필요경비 14,700,000 (S′ 400·429·564)", () => {
    const row = computeTransferPerAssetSummary(landForm(), null).rows[0];
    expect(row.salePrice).toBe(PRICE_S);
    expect(row.acqPrice).toBe(ACQ_S);
    expect(row.expense).toBe(EXP_S);
  });

  it("🔴 감가상각비 차감 후 취득가 (S′ 558): 취득가 100,000,000 × 70% − 감가 21,000,000 × 70% = 55,300,000 (옛 55,300,001)", () => {
    // 취득가 쪽은 옛 식이 정확한 값(70,000,000)을 골라 감가 쪽 오차가 상쇄되지 않게 한다.
    const row = computeTransferPerAssetSummary(
      landForm({ assetKind: "housing", fixedAcquisitionPrice: "100000000", depreciationAmount: "21000000" } as Partial<AssetForm>),
      null,
    ).rows[0];
    expect(row.acqPrice).toBe(55_300_000);
  });

  it("🔴 사이드바 행 = ④ body — 양도가·취득가·필요경비가 1원도 다르지 않다", async () => {
    const bodies = routeStub();
    const f = landForm();
    await callTransferTaxAPI(f);
    const row = computeTransferPerAssetSummary(f, null).rows[0];
    expect(row.salePrice).toBe(bodies[0].transferPrice);
    expect(row.acqPrice).toBe(bodies[0].acquisitionPrice);
    expect(row.expense).toBe(bodies[0].expenses);
  });

  it("🔴 축 B(같은 물건 지분 분할) 70% + 30%: 지분 양도가 119,000,000 · 마지막 지분이 잔액 51,000,000 (S′ 202)", () => {
    const share = (n: number, pct: string): AssetForm =>
      ({
        ...makeDefaultAsset(n), assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2024-06-01",
        fixedAcquisitionPrice: "100000000", transferArea: "300", acquisitionArea: "300",
        ownershipNumerator: pct, ownershipDenominator: "100",
      }) as AssetForm;
    const f = {
      ...createDefaultTransferFormData(), transferDate: TD, contractTotalPrice: "170000000", bundledSaleMode: "actual",
      assetSplitMode: "fractional", assets: [share(1, "70"), share(2, "30")],
    } as TransferFormData;
    expect(computeTransferPerAssetSummary(f, null).rows.map((r) => r.salePrice)).toEqual([119_000_000, 51_000_000]);
  });

  it("🔴 사이드바 합계 취득가액 (calc-wizard-store.ts S′ 405)", () => {
    const s = computeTransferSummary(landForm(), null);
    expect(s.totalAcqPrice).toBe(ACQ_S);
  });
});

describe("⑦ 신고서 — buildRows (FilingFormTableHelpers.ts S′ 224·233·498)", () => {
  const baseResult = async () => {
    routeStub();
    const r = await callTransferTaxAPI(landForm());
    if (r.mode !== "single") throw new Error("single 기대");
    return r.result;
  };
  const cell = (rows: ReturnType<typeof buildRows>, label: string) => rows.find((x) => x.label === label)?.values.total;

  it("🔴 양도가액 칸 238,000,000 (S′ 224)", async () => {
    const result = await baseResult();
    const f = landForm();
    expect(cell(buildRows(result, "single", f, f.assets[0]), "양도가액")).toBe(PRICE_S);
  });

  it("🔴 필요경비 칸 14,700,000 (S′ 233) — 엔진 합산 경비가 없을 때 폼 경비를 지분 적용해 표시", async () => {
    const result = await baseResult();
    const f = landForm();
    const rows = buildRows({ ...result, expenses: 0 }, "single", f, f.assets[0]);
    expect(cell(rows, "필요경비")).toBe(EXP_S);
  });

  it("🔴 환산 모드 「미차감」 고지 금액 (S′ 498): (자본적지출 + 양도비) 30,000,000 → 지분 21,000,000", async () => {
    const result = await baseResult();
    // 자본적지출 11,000,000 + 양도비 10,000,000 = 21,000,000 (70%에서 옛 식 …999)
    const f = landForm({ capitalExpenditure: "11000000", transferExpense: "10000000", directExpenses: "0" });
    const est = { ...result, usedEstimatedAcquisition: true, estimatedBase: 100_000_000, estimatedDeduction: 3_000_000, expenses: 0, capitalExpenditureForDisplay: 0 };
    const rows = buildRows(est, "single", f, f.assets[0]);
    const note = rows.find((x) => x.label === "필요경비")?.roseNotes?.total ?? "";
    expect(note).toContain("14,700,000");
  });

  it("🔴 신고서 양도가·경비 = 사이드바 = ④ body (같은 값)", async () => {
    const bodies = routeStub();
    const f = landForm();
    const r = await callTransferTaxAPI(f);
    if (r.mode !== "single") throw new Error("single 기대");
    const rows = buildRows({ ...r.result, expenses: 0 }, "single", f, f.assets[0]);
    expect(cell(rows, "양도가액")).toBe(bodies[0].transferPrice);
    expect(cell(rows, "필요경비")).toBe(bodies[0].expenses);
  });
});
