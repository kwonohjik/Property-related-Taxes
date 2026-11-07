/**
 * 함께 양도 컴패니언 주택의 조정대상지역 — 자기 소재지·자기 날짜로 판정한다(주 자산 값을 복사하지 않는다).
 * 계획서 `docs/00-pm/regulated-companion-house-address.plan.md` (Q-1 b). ④(`companionRegulatedFlags`) → ⑫(companionAssetSchema) → ⑭(`bundled-split-helpers`) → 엔진.
 *
 * 마포 = 양도(2026-06-01)·취득(2018-06-01) 모두 지정 · 포항 북구 = 두 날 모두 미지정(주소 판정 실측).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, captureBody } from "./_helpers/redev-one-house-route";
import { companionRegulatedFlags } from "@/lib/calc/effective-regulated-at-acquisition";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const MAPO = "서울특별시 마포구 테스트동 1-1";
const POHANG = "경상북도 포항시 북구 테스트동 1";
const MAPO_CODE = "1144010100";

const house = (n: number, addr: string, acq = "2018-06-01", over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(n),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: acq,
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "900000000",
    standardPriceAtTransfer: "500000000",
    addressJibun: addr,
    regionCode: "",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "0",
    buildingFootprintArea: "100",
    appurtenantLandZone: "metropolitan_residential",
    isUrbanArea: true,
    ...over,
  }) as unknown as AssetForm;

function form(primary: AssetForm, companion: AssetForm, oneHousehold = false) {
  const f = createDefaultTransferFormData();
  return {
    ...f,
    transferDate: "2026-06-01",
    contractTotalPrice: "1800000000",
    isOneHousehold: oneHousehold,
    householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "0",
    assets: [primary, companion],
  } as never;
}

type Prop = { tax: number; rate: string };
async function props(f: never): Promise<{ props: Prop[]; issues: string[]; body: Record<string, unknown> }> {
  const r = await runCalc(f);
  const ps = (r.json?.data?.aggregated?.properties ?? []) as { determinedTax: number; rateClause: string }[];
  return { props: ps.map((p) => ({ tax: p.determinedTax, rate: p.rateClause })), issues: r.issues.map((i) => i.message), body: r.body };
}

/** 마포 한 채 · 포항 한 채를 각각 그 소재지로 계산한 값(같은 사실). */
const MAPO_TAX = 336_060_000; // 중과 §104⑦
const POHANG_TAX = 175_740_000; // 일반 누진 §104①1호

describe("B-1~B-3 — 컴패니언 주택은 자기 소재지로 계산된다 (주 자산·컴패니언 위치와 무관)", () => {
  it("B-1 ★ 비1세대 · 주 자산 포항 + 컴패니언 마포 — ⑧이 막지 못하던 경우: 컴패니언만 중과", async () => {
    const r = await props(form(house(1, POHANG), house(2, MAPO)));
    expect(r.issues).toEqual([]);
    expect(r.props.map((p) => p.tax)).toEqual([POHANG_TAX, MAPO_TAX]);
    expect(r.props.map((p) => p.rate)).toEqual(["104-1-1", "104-7-1"]);
  });

  it("B-2 맞바꿈 — 비1세대 · 주 자산 마포 + 컴패니언 포항 (⑧은 막는다 · API 직접은 소재지대로)", async () => {
    const r = await props(form(house(1, MAPO), house(2, POHANG)));
    expect(r.issues.length).toBeGreaterThan(0);
    expect(r.props.map((p) => p.tax)).toEqual([MAPO_TAX, POHANG_TAX]);
  });

  it("B-3 1세대 — 같은 값 (⑧ 차단은 그대로)", async () => {
    const r = await props(form(house(1, POHANG), house(2, MAPO), true));
    expect(r.issues.length).toBeGreaterThan(0);
    expect(r.props.map((p) => p.tax)).toEqual([POHANG_TAX, MAPO_TAX]);
  });
});

describe("B-4~B-7 — ④ 전송·폴백", () => {
  it("B-4 컴패니언 소재지가 없으면 두 값을 싣지 않는다 → 주 자산 값(종전 동작)", async () => {
    const f = form(house(1, MAPO), house(2, ""));
    const body = (await captureBody(f)) as { companionAssets: Record<string, unknown>[] };
    expect(body.companionAssets[0]).not.toHaveProperty("isRegulatedArea");
    expect(body.companionAssets[0]).not.toHaveProperty("wasRegulatedAtAcquisition");
  });

  it("B-5 소재지가 있으면 자기 값을 싣는다 (양도 당시·취득 당시)", async () => {
    const body = (await captureBody(form(house(1, POHANG), house(2, MAPO)))) as {
      isRegulatedArea: boolean;
      companionAssets: { isRegulatedArea: boolean; wasRegulatedAtAcquisition: boolean }[];
    };
    expect(body.isRegulatedArea).toBe(false);
    expect(body.companionAssets[0]).toMatchObject({ isRegulatedArea: true, wasRegulatedAtAcquisition: true });
  });

  it("B-6 취득 당시는 컴패니언 자기 취득일로 판정한다 (마포 2017-06-01 취득 = 지정 전)", async () => {
    const body = (await captureBody(form(house(1, POHANG), house(2, MAPO, "2017-06-01")))) as {
      companionAssets: { isRegulatedArea: boolean; wasRegulatedAtAcquisition: boolean }[];
    };
    expect(body.companionAssets[0]).toMatchObject({ isRegulatedArea: true, wasRegulatedAtAcquisition: false });
  });

  it("B-7 법정동코드로 고른 컴패니언도 같은 leaf — 주소 문자열과 같은 값", () => {
    const byAddress = companionRegulatedFlags(house(2, MAPO), "2026-06-01");
    const byCode = companionRegulatedFlags(house(2, MAPO, "2018-06-01", { regionCode: MAPO_CODE }), "2026-06-01");
    expect(byCode).toEqual(byAddress);
    expect(byAddress).toEqual({ isRegulatedArea: true, wasRegulatedAtAcquisition: true });
  });

  it("B-8 주택 계열이 아닌 컴패니언(토지)에는 싣지 않는다", () => {
    expect(companionRegulatedFlags(house(2, MAPO, "2018-06-01", { assetKind: "land" }), "2026-06-01")).toEqual({});
  });
});
