/**
 * 상세명세서 — 함께 양도(일괄) 컴패니언 조합원입주권의 §89①4호 비과세·12억 안분 근거.
 *
 * 종전: 화면 자산 카드(`CompanionRightExemptionNote`)는 «왜 줄었는지»를 밝혔지만 상세명세서의 「과세대상 양도차익」 자산별 행은
 * «양도차익 1,200,000,000과 (양도소득금액 240,000,000 + 장특공제 0) 중 작은 금액 = 240,000,000»만 찍어 12억 안분 때문임을 알 수 없었다.
 * 시료(마포 입주권 취득 2018-03-01 · 인가 2019-06-01 · 양도 2026-06-01 · 취득가 3억 / 주 자산 토지): 15억 → 비과세 960,000,000 · 과세 240,000,000 · 비율 20%.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "./_helpers/redev-one-house-route";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const actual = await io<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

function form(elig: "yes" | "no", price: string): TransferFormData {
  const f = withTestAddress(createDefaultTransferFormData());
  f.transferDate = "2026-06-01";
  f.bundledSaleMode = "actual";
  f.householdHousingCount = "0";
  f.contractTotalPrice = String(300_000_000 + Number(price));
  (f as unknown as Record<string, unknown>).isOneHousehold = true;
  (f as unknown as Record<string, unknown>).householdNoOtherHousesConfirmed = true;
  f.householdNoPresaleRightsConfirmed = true as never;
  f.assets[0] = {
    ...f.assets[0],
    assetId: "primary-fixed",
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-05",
    fixedAcquisitionPrice: "100000000",
    actualSalePrice: "300000000",
    standardPriceAtTransfer: "300000000",
  } as AssetForm;
  f.assets.push({
    ...makeDefaultAsset(2),
    assetKind: "right_to_move_in",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-03-01",
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: price,
    useEstimatedAcquisition: false,
    redevApprovalDate: "2019-06-01",
    redevRightsValue: "700000000",
    redevSettlementAmount: "0",
    redevPreApprovalExpenses: "0",
    redevActualAcquisitionPrice: "300000000",
    redevOriginalAssetType: "housing",
    redevExemptionEligibleAtApproval: elig,
    addressJibun: "서울특별시 마포구 테스트동 1-1",
    assetId: "companion-fixed",
  } as unknown as AssetForm);
  return f;
}

/** 상세명세서 항목의 자산별 행 산식 문자열들. */
async function perAssetRows(key: string, elig: "yes" | "no", price: string) {
  const f = form(elig, price);
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  const agg = r.json.data.aggregated;
  const items = buildStatementItems(
    aggregateToFilingResult(agg) as never,
    f,
    f.assets[0],
    { properties: agg.properties, aggregated: agg },
    undefined,
  );
  const rows = items.get(key)?.perAsset ?? [];
  return rows.map((row) => String(row.formula));
}

const taxableGainRows = (elig: "yes" | "no", price: string) => perAssetRows("taxableGain", elig, price);

describe("상세명세서 — 컴패니언 입주권 §89①4호 근거", () => {
  it("🔑 15억(>12억) → 입주권 행에 12억 초과 안분 근거(몫 양도가액·20.00%·비과세/과세 차익·확인 필요)가 붙는다", async () => {
    const rows = await taxableGainRows("yes", "1500000000");
    const right = rows.find((x) => x.includes("§89①4호")) ?? "";
    expect(right).toContain("§89①4호 가목 — 12억 초과 안분");
    expect(right).toContain((1_500_000_000).toLocaleString());
    expect(right).toContain("20.00%");
    expect(right).toContain((960_000_000).toLocaleString());
    expect(right).toContain((240_000_000).toLocaleString());
    expect(right).toContain("확인 필요");
    // 토지 행에는 붙지 않는다
    expect(rows.filter((x) => x.includes("§89①4호")).length).toBe(1);
  });

  it("5억 비과세 → 입주권 행에 «1세대1입주권 비과세» 근거가 붙는다", async () => {
    const rows = await taxableGainRows("yes", "500000000");
    const right = rows.find((x) => x.includes("§89①4호")) ?? "";
    expect(right).toContain("§89①4호 가목 — 1세대1입주권 비과세");
    expect(right).toContain("유일한 조합원입주권");
  });

  it("짝 — 선언 «아니오»(과세) 입주권은 근거 문구가 없다", async () => {
    const rows = await taxableGainRows("no", "500000000");
    expect(rows.some((x) => x.includes("§89①4호"))).toBe(false);
  });

  it("🔑 5억 비과세 입주권의 장기보유특별공제 행은 «비과세 자산»이다 («차손 자산» 아님)", async () => {
    const rows = await perAssetRows("ltDeduction", "yes", "500000000");
    expect(rows.some((x) => x.includes("비과세 자산 — 장특공제 미적용"))).toBe(true);
    expect(rows.some((x) => x.includes("차손"))).toBe(false);
  });
});
