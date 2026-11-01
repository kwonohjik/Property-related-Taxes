/**
 * 축 B(같은 주택 지분 분할) 컴패니언의 거주기간 — 주 자산 값을 승계하고 그 지분의 보유 기산일로 자른다
 * (계획서 `docs/02-design/features/axis-b-companion-residence.plan.md` Q-1 a · Q-2 a).
 *
 * 종전: 컴패니언은 거주 입력칸이 없는데 fallback이 0개월이라 둘째 지분 이후가 표1·과세로 떨어졌다.
 * 거주는 1세대·해당 주택 기준이다(「소득세법 시행령」 §154①·⑥ · §159의4).
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues, captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const HOUSE_PRIMARY = { assetKind: "housing", addressJibun: "서울 강남구 테스트동 1", residenceInputMode: "direct", residencePeriodMonthsAsset: "60", buildingFootprintArea: "100", appurtenantLandZone: "metropolitan_residential", isUrbanArea: true };
const ONE = { isOneHousehold: true, householdHousingCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "60" };
const REG = { ...ONE, isRegulatedArea: true, wasRegulatedAtAcquisition: true };
const PURCHASE = { acquisitionCause: "purchase", fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "500000000" };
const D2015 = "2015-03-03";
const D2018 = "2018-03-03";
const D2023 = "2023-03-03";
const D2025 = "2025-03-03";
const REDEV = { acquisitionCause: "purchase", acquisitionDate: "2010-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "400000000", redevApprovalDate: "2018-05-01", redevRightsValue: "600000000", redevSettlementDirection: "pay", redevSettlementAmount: "100000000", redevPreApprovalExpenses: "20000000", redevOriginalAssetType: "housing", capitalExpenditure: "30000000", transferExpense: "10000000", addressJibun: "서울 A 1" };
const MIXED = { assetKind: "housing", isMixedUseHouse: true, acquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "500000000", capitalExpenditure: "100000000", transferExpense: "20000000", residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50", mixedUseTotalLandArea: "300", mixedTransferHousingPrice: "1600000000", mixedTransferCommercialBuildingPrice: "200000000", mixedTransferLandPricePerSqm: "1000000", mixedAcqHousingPrice: "400000000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqLandPricePerSqm: "300000", addressJibun: "서울 A 1" };
const APT = { ...REDEV, assetKind: "redevelopment_apt", redevSubject: "apt" };

const PIN = { direct24: 24_557_500, bundled: 140_646_000, zero: 57_277_000, land: 402_831_000, appurtenant: 437_068_500 };

function house(pcts: string[], total: string, hh: L, acqs: string[], over: L = {}) {
  const f = createDefaultTransferFormData() as L;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: total, bundledSaleMode: "actual", assetSplitMode: "fractional" }, hh);
  f.assets = pcts.map((p, k) => ({ ...makeDefaultAsset(k + 1), ...(k === 0 ? HOUSE_PRIMARY : {}), ...PURCHASE, acquisitionDate: acqs[k], assetId: `A${k + 1}`, ownershipNumerator: p, ownershipDenominator: "100", ownershipRemainderThirdParty: "", ...over }));
  return f as never;
}

function redevOrMixed(kind: L, mixed: boolean) {
  let f = createDefaultTransferFormData() as L;
  Object.assign(f, { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "2000000000", bundledSaleMode: "actual", assetSplitMode: "fractional" }, ONE);
  f.assets = ["50", "50"].map((p, k) => ({ ...makeDefaultAsset(k + 1), ...kind, ...(k === 0 ? { residenceInputMode: "direct", residencePeriodMonthsAsset: "60", addressJibun: "서울 A 1", appurtenantLandZone: "metropolitan_residential", isUrbanArea: true, buildingFootprintArea: "100" } : {}), assetId: `A${k + 1}`, ownershipNumerator: p, ownershipDenominator: "100", ownershipRemainderThirdParty: "" }));
  if (mixed) f = withIdentityHousingBuildingStdOnForm(f as never) as L;
  return f as never;
}

async function calc(form: never, patch?: (b: L) => void) {
  const body = (await captureBody(form)) as L;
  patch?.(body);
  const r = await postTransfer(body);
  const data = r.json?.data as L | undefined;
  return { status: r.status, body, totalTax: data?.aggregated?.totalTax, props: (data?.aggregated?.properties ?? []) as L[], error: r.json?.error as L | undefined };
}

describe("같은 취득일 — 100% 단건과 같아진다", () => {
  it("조정 취득 10억 50/50 — 양쪽 비과세, 세액 0", async () => {
    const f = house(["50", "50"], "1000000000", REG, [D2018, D2018]);
    expect(allIssues(f)).toEqual([]);
    const t = await calc(f);
    expect(t.status).toBe(200);
    expect(t.totalTax).toBe(0);
    expect(t.props.map((p) => p.isExempt)).toEqual([true, true]);
  });

  it("비조정 15억 50/50 — 19,013,500, 지분별 장특 같음", async () => {
    const t = await calc(house(["50", "50"], "1500000000", ONE, [D2015, D2015]));
    expect(t.totalTax).toBe(19_013_500);
    expect(t.props.map((p) => p.longTermHoldingDeduction)).toEqual([72_000_000, 72_000_000]);
  });

  it("3지분도 전 지분 같은 장특", async () => {
    const t = await calc(house(["33.33", "33.33", "33.34"], "1500000000", ONE, [D2015, D2015, D2015]));
    const ltd = t.props.map((p) => p.longTermHoldingDeduction);
    expect(ltd[0]).toBeGreaterThan(0);
    expect(ltd[1]).toBe(ltd[0]);
  });

  it("재개발 APT 20억 50/50 — 89,914,440", async () => {
    const t = await calc(redevOrMixed(APT, false));
    expect(t.totalTax).toBe(89_914_440);
  });

  it("겸용 20억 50/50 — 96,640,214", async () => {
    const t = await calc(redevOrMixed({ ...MIXED, buildingFootprintArea: "100", appurtenantLandZone: "metropolitan_residential", isUrbanArea: true }, true));
    expect(t.totalTax).toBe(96_640_214);
  });
});

describe("취득일이 다른 지분 — 그 지분의 보유 기산일로 자른다", () => {
  it("조정 10억, 둘째 2023 취득(보유 35개월) — 비과세", async () => {
    const t = await calc(house(["50", "50"], "1000000000", REG, [D2018, D2023]));
    expect(t.status).toBe(200);
    expect(t.totalTax).toBe(0);
  });

  it("조정 10억, 둘째 2025 취득(보유 11개월) — 보유 미달 과세 267,575,000", async () => {
    const t = await calc(house(["50", "50"], "1000000000", REG, [D2018, D2025]));
    expect(t.totalTax).toBe(267_575_000);
  });

  it("비조정 15억, 둘째 2023 취득 — 47,245,000(보유 3년 미만 장특 0)", async () => {
    const t = await calc(house(["50", "50"], "1500000000", ONE, [D2015, D2023]));
    expect(t.totalTax).toBe(47_245_000);
    expect(t.props[1].longTermHoldingDeduction).toBe(0);
  });

  it("상한 경계 — 둘째 보유 36개월 이상이면 잘린 값이 곧 그 보유기간이다", async () => {
    const capped = await calc(house(["50", "50"], "1500000000", ONE, [D2015, "2021-02-16"]));
    const direct = await calc(house(["50", "50"], "1500000000", ONE, [D2015, "2021-02-16"]), (b) => {
      b.companionAssets[0].residencePeriodMonths = 60;
    });
    expect(capped.totalTax).toBe(direct.totalTax);
    const longer = await calc(house(["50", "50"], "1500000000", { ...ONE }, [D2015, "2022-02-16"]));
    const longerDirect = await calc(house(["50", "50"], "1500000000", ONE, [D2015, "2022-02-16"]), (b) => {
      b.companionAssets[0].residencePeriodMonths = 48;
    });
    expect(longer.totalTax).toBe(longerDirect.totalTax);
  });
});

describe("겸용 지분의 상한 기산일", () => {
  it("겸용은 토지·건물 취득일도 기산 후보다 — 카드 취득일이 늦어도 그 날로 자르지 않는다", async () => {
    const t = await calc(redevOrMixed({ ...MIXED, buildingFootprintArea: "100", appurtenantLandZone: "metropolitan_residential", isUrbanArea: true }, true), (b) => {
      b.companionAssets[0].acquisitionDate = "2022-06-01";
      b.companionAssets[0].mixedUse.landAcquisitionDate = "2009-03-01";
      b.companionAssets[0].mixedUse.buildingAcquisitionDate = "2009-03-01";
    });
    expect(t.status).toBe(200);
    expect(t.totalTax).toBe(96_640_214);
  });
});

describe("바뀌지 않아야 하는 경로", () => {
  it("컴패니언에 값을 직접 보낸 API 호출 — 그 값이 우선", async () => {
    const t = await calc(house(["50", "50"], "1500000000", ONE, [D2015, D2015]), (b) => {
      b.companionAssets[0].residencePeriodMonths = 24;
    });
    expect(t.totalTax).toBe(PIN.direct24);
  });

  it("함께 양도(별개 주택) — 컴패니언은 0개월 그대로", async () => {
    // 조정 취득이라 거주 0개월이면 둘째 주택이 과세된다 — 승계가 새면 세액이 바뀐다.
    const f = house(["100", "100"], "1500000000", REG, [D2018, D2018]) as unknown as L;
    f.assetSplitMode = "bundled";
    f.assets[0].actualSalePrice = "750000000";
    f.assets[1].actualSalePrice = "750000000";
    f.assets[1].assetKind = "housing";
    f.assets[1].addressJibun = "서울 강남구 테스트동 2";
    const t = await calc(f as never);
    expect(t.status).toBe(200);
    expect(t.body.companionAssets[0].residencePeriodMonths ?? null).toBeNull();
    expect(t.totalTax).toBe(PIN.bundled);
  });

  it("주 자산 거주 0 — 승계해도 표1", async () => {
    const f = house(["50", "50"], "1500000000", { ...ONE, residencePeriodMonths: "0" }, [D2015, D2015]) as unknown as L;
    f.assets[0].residencePeriodMonthsAsset = "0";
    const t = await calc(f as never);
    expect(t.totalTax).toBe(PIN.zero);
  });

  it("다주택 — 세액 불변", async () => {
    const t = await calc(house(["50", "50"], "1500000000", { ...ONE, householdHousingCount: "3", isOneHousehold: false }, [D2015, D2015]));
    expect(t.totalTax).toBe(402_831_000);
  });

  it("토지 지분 — 세액 불변", async () => {
    const f = house(["50", "50"], "1500000000", { householdHousingCount: "1" }, [D2015, D2015], { assetKind: "land", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 A 1" }) as unknown as L;
    f.assets[0].residenceInputMode = "direct";
    f.assets[0].residencePeriodMonthsAsset = "60";
    const t = await calc(f as never);
    expect(t.status).toBe(200);
    expect(t.totalTax).toBe(PIN.land);
  });

  it("주택 부수토지 지분 — 세액 불변", async () => {
    const f = house(["50", "50"], "1500000000", ONE, [D2015, "2022-02-16"], { assetKind: "land", landNature: "appurtenant_to_housing", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 A 1" }) as unknown as L;
    f.assets[0].residenceInputMode = "direct";
    f.assets[0].residencePeriodMonthsAsset = "60";
    const t = await calc(f as never);
    expect(t.status).toBe(200);
    expect(t.totalTax).toBe(PIN.appurtenant);
  });

  it("첫 지분이 더 늦게 취득되면 입력은 그대로 막힌다(Q-4 별건)", async () => {
    const t = await calc(house(["50", "50"], "1500000000", ONE, [D2023, D2015]));
    expect(t.status).toBe(400);
  });
});
