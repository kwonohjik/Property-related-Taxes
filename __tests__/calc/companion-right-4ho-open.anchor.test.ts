/**
 * anchor — 함께 양도(다른 물건) 컴패니언 조합원입주권의 §89①4호 비과세 열기
 * (계획서 `docs/00-pm/companion-right-4ho-open.plan.md` · 사용자 결정 2026-11-09: Q-1 보유로 봄 · Q-2 입주권 몫 양도가액 · Q-3 묶음 입주권 수 합산).
 *
 * 열기 전: 컴패니언 엔진 input에 `householdRightCount`가 실리지 않아 입주권 컴패니언이 §89①4호 비과세에 **항상** 불성립이었다
 * (`regulated-rights-transfer-toggle.plan.md` §16-6). 주 자산 입주권 + 컴패니언 입주권 묶음은 세대 입주권 수가 1(자기 자신만)이라
 * 입주권 2개를 양도하는데도 주 자산이 «1개 보유» 비과세를 받았다.
 *
 * 규칙: 세대 조합원입주권 수 = 명부 입주권 수 + 묶음에서 양도하는 입주권 수(축 B는 물건 1개). 이 값이 1일 때만 4호 본문 성립.
 * 시료: 양도 2026-06-01 · 마포 · 입주권 취득 2018-03-01 · 인가 2019-06-01 · 원조합원(주택 출자) · 1세대 · 분양권 없음 확인.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { captureBody, postTransfer } from "./_helpers/redev-one-house-route";
import { BUNDLED_RIGHT_HIGH_VALUE_NOTICE, BUNDLED_RIGHT_HOLDING_NOTICE } from "@/app/api/calc/transfer/bundled-right-4ho-notices";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const actual = await io<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Elig = "yes" | "no";

const RIGHT_FIELDS = (elig: Elig, price: string): Record<string, unknown> => ({
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
});

function baseForm(hh: string, total: number): TransferFormData {
  const f = withTestAddress(createDefaultTransferFormData());
  f.transferDate = "2026-06-01";
  f.bundledSaleMode = "actual";
  f.householdHousingCount = hh;
  f.contractTotalPrice = String(total);
  (f as unknown as Record<string, unknown>).isOneHousehold = true;
  (f as unknown as Record<string, unknown>).householdNoOtherHousesConfirmed = hh === "0";
  f.householdNoPresaleRightsConfirmed = true as never;
  return f;
}

/** 주 자산 토지·주택 + 컴패니언 입주권. */
function mainPlusCompanionRight(opts: { main: "land" | "housing"; hh: string; elig: Elig; price: string }): TransferFormData {
  const mainPrice = opts.main === "land" ? 300_000_000 : 500_000_000;
  const f = baseForm(opts.hh, mainPrice + Number(opts.price));
  f.assets[0] = {
    ...f.assets[0],
    assetId: "primary-fixed",
    assetKind: opts.main,
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-05",
    fixedAcquisitionPrice: "100000000",
    actualSalePrice: String(mainPrice),
    standardPriceAtTransfer: "300000000",
  } as AssetForm;
  f.assets.push({ ...makeDefaultAsset(2), ...RIGHT_FIELDS(opts.elig, opts.price), assetId: "companion-fixed" } as unknown as AssetForm);
  return f;
}

/** 주 자산 입주권 + 컴패니언 입주권. */
function twoRights(elig: Elig, price = "500000000"): TransferFormData {
  const f = baseForm("0", Number(price) * 2);
  f.assets[0] = { ...f.assets[0], ...RIGHT_FIELDS(elig, price), assetId: "primary-fixed", fixedAcquisitionPrice: "" } as unknown as AssetForm;
  f.assets.push({ ...makeDefaultAsset(2), ...RIGHT_FIELDS(elig, price), assetId: "companion-fixed" } as unknown as AssetForm);
  return f;
}

/** 입주권 하나(단건). */
function singleRight(elig: Elig, price = "500000000"): TransferFormData {
  const f = baseForm("0", Number(price));
  f.assets[0] = { ...f.assets[0], ...RIGHT_FIELDS(elig, price), assetId: "primary-fixed", fixedAcquisitionPrice: "" } as unknown as AssetForm;
  return f;
}

async function run(f: TransferFormData) {
  const body = await captureBody(f);
  const r = await postTransfer(body);
  expect(r.status).toBe(200);
  const agg = r.json.data.aggregated ?? r.json.data.result;
  const card = (id: string) => agg.properties?.find((p: { propertyId: string }) => p.propertyId === id);
  return { body, agg, card, warnings: (agg.warnings ?? []) as string[] };
}

describe("[컴패니언 입주권 §89①4호] 열림 — 세대 주택 0채 + 선언 «예»", () => {
  it("CR-1 주 자산 토지 · 입주권 5억 · 선언 예 → 컴패니언 가목 비과세 0 (열기 전 과세 55,110,000)", async () => {
    const r = await run(mainPlusCompanionRight({ main: "land", hh: "0", elig: "yes", price: "500000000" }));
    expect(r.body.householdRightCount).toBe(1);
    expect(r.card("companion-fixed")).toMatchObject({ isExempt: true, determinedTax: 0 });
    expect(r.card("companion-fixed").redevelopmentDetail.oneRightExemptionClause).toBe("ga");
    expect(r.agg.determinedTax).toBe(32_685_000);
  });

  it("CR-2 대조군: 선언 «아니오» → 컴패니언 과세 55,110,000", async () => {
    const r = await run(mainPlusCompanionRight({ main: "land", hh: "0", elig: "no", price: "500000000" }));
    expect(r.card("companion-fixed")).toMatchObject({ isExempt: false, determinedTax: 55_110_000 });
    expect(r.card("companion-fixed").redevelopmentDetail.oneRightExemptionClause).toBeUndefined();
  });

  it("CR-3 입주권 15억(>12억) → 안분과세 70,310,000 (열기 전 472,935,000) — 12억은 입주권 몫 양도가액(Q-2)", async () => {
    const r = await run(mainPlusCompanionRight({ main: "land", hh: "0", elig: "yes", price: "1500000000" }));
    expect(r.card("companion-fixed")).toMatchObject({ isExempt: false, determinedTax: 70_310_000 });
    expect(r.card("companion-fixed").redevelopmentDetail.oneRightExemptionClause).toBe("ga");
    expect(r.agg.determinedTax).toBe(125_060_000);
  });

  it("CR-3b 같은 15억 입주권도 주 자산 가액을 더한 묶음 전체(18억)로 12억을 재지 않는다 — 5억 입주권 + 주 자산 15억이어도 입주권은 전액 비과세", async () => {
    const f = mainPlusCompanionRight({ main: "land", hh: "0", elig: "yes", price: "500000000" });
    f.assets[0] = { ...f.assets[0], actualSalePrice: "1500000000" } as AssetForm;
    f.contractTotalPrice = String(1_500_000_000 + 500_000_000);
    const r = await run(f);
    expect(r.card("companion-fixed")).toMatchObject({ isExempt: true, determinedTax: 0 });
  });

  it("CR-4 주 자산 주택 · 세대 주택 0 → 컴패니언 비과세, 주 자산 주택은 과세 그대로", async () => {
    const r = await run(mainPlusCompanionRight({ main: "housing", hh: "0", elig: "yes", price: "500000000" }));
    expect(r.card("companion-fixed")).toMatchObject({ isExempt: true, determinedTax: 0 });
    expect(r.card("primary").isExempt).toBe(false);
  });
});

describe("[컴패니언 입주권 §89①4호] 불변 — 요건 불성립 칸은 그대로", () => {
  it("CR-5 세대 주택 1채 이상(주 자산 토지) → 가목 불성립 · 컴패니언 과세 그대로", async () => {
    for (const hh of ["1", "2"]) {
      const r = await run(mainPlusCompanionRight({ main: "land", hh, elig: "yes", price: "500000000" }));
      expect(r.card("companion-fixed")).toMatchObject({ isExempt: false, determinedTax: 55_110_000 });
    }
  });

  it("CR-6 Q-1 보유로 봄: 주 자산 주택(세대 주택 1 = 양도 주택) → 컴패니언 입주권 가목 불성립, 주 자산은 1세대1주택 비과세 그대로", async () => {
    const r = await run(mainPlusCompanionRight({ main: "housing", hh: "1", elig: "yes", price: "500000000" }));
    expect(r.card("companion-fixed")).toMatchObject({ isExempt: false, determinedTax: 55_110_000 });
    expect(r.card("primary")).toMatchObject({ isExempt: true, determinedTax: 0 });
  });
});

describe("[Q-3] 묶음 안 입주권 수 = 세대 입주권 수", () => {
  it("CR-7 컴패니언 입주권만 있으면 세대 입주권 수 1 (열기 전 0)", async () => {
    const r = await run(mainPlusCompanionRight({ main: "land", hh: "0", elig: "yes", price: "500000000" }));
    expect(r.body.householdRightCount).toBe(1);
  });

  it("CR-8 주 자산 입주권 + 컴패니언 입주권 → 세대 입주권 수 2 · 두 카드 모두 가목 불성립 (열기 전: 주 자산이 비과세 0)", async () => {
    const r = await run(twoRights("yes"));
    expect(r.body.householdRightCount).toBe(2);
    expect(r.card("primary")).toMatchObject({ isExempt: false, determinedTax: 55_110_000 });
    expect(r.card("companion-fixed")).toMatchObject({ isExempt: false, determinedTax: 55_110_000 });
  });

  it("CR-8b 대조군: 입주권 하나만 양도하면(단건) 같은 사실로 가목 비과세 — 규칙이 입주권 2개일 때만 막는다", async () => {
    const r = await run(singleRight("yes"));
    expect(r.body.householdRightCount).toBe(1);
    expect(r.agg.properties?.[0]?.isExempt ?? r.agg.isExempt).toBe(true);
  });

  it("CR-9 명부(분양권·입주권 목록)의 입주권 1행 + 컴패니언 입주권 → 세대 입주권 수 2 · 불성립", async () => {
    const f = mainPlusCompanionRight({ main: "land", hh: "0", elig: "yes", price: "500000000" });
    f.presaleRights = [{ id: "r1", type: "redevelopment_right", acquisitionDate: "2018-03-01", region: "capital" } as never];
    const r = await run(f);
    expect(r.body.householdRightCount).toBe(2);
    expect(r.card("companion-fixed")).toMatchObject({ isExempt: false, determinedTax: 55_110_000 });
  });
});

describe("[축 B 불변] 같은 물건 지분 분할 입주권은 입주권 1개", () => {
  it("CR-10 50%+50% 10억 → 세대 입주권 수 1 · 두 카드 모두 비과세(기존 동작 그대로) · 함께 양도 고지 없음", async () => {
    const f = baseForm("0", 1_000_000_000);
    const fields = { ...RIGHT_FIELDS("yes", "500000000"), ownershipNumerator: "50", ownershipDenominator: "100", redevSubject: "right" };
    f.assets = [
      { ...makeDefaultAsset(1), ...fields, assetId: "a1" },
      { ...makeDefaultAsset(2), ...fields, assetId: "a2" },
    ] as unknown as AssetForm[];
    const r = await run(f);
    expect(r.body.householdRightCount).toBe(1);
    expect(r.agg.determinedTax).toBe(0);
    expect(r.warnings).not.toContain(BUNDLED_RIGHT_HOLDING_NOTICE);
    expect(r.warnings).not.toContain(BUNDLED_RIGHT_HIGH_VALUE_NOTICE);
  });
});

describe("[고지] Q-1 보유 해당 · Q-2 12억 기준 — 확인 필요", () => {
  it("CR-11 컴패니언 입주권만 있고 비과세 성립 → 12억 기준 고지만(다른 주택·입주권이 없어 보유 고지는 없음)", async () => {
    const r = await run(mainPlusCompanionRight({ main: "land", hh: "0", elig: "yes", price: "500000000" }));
    expect(r.warnings).toContain(BUNDLED_RIGHT_HIGH_VALUE_NOTICE);
    expect(r.warnings).not.toContain(BUNDLED_RIGHT_HOLDING_NOTICE);
  });

  it("CR-12 주 자산 주택 + 컴패니언 입주권(선언 예) → 보유 고지, 비과세 성립 시 12억 기준 고지도", async () => {
    const r0 = await run(mainPlusCompanionRight({ main: "housing", hh: "1", elig: "yes", price: "500000000" }));
    expect(r0.warnings).toContain(BUNDLED_RIGHT_HOLDING_NOTICE);
    expect(r0.warnings).not.toContain(BUNDLED_RIGHT_HIGH_VALUE_NOTICE);
    const r1 = await run(mainPlusCompanionRight({ main: "housing", hh: "0", elig: "yes", price: "500000000" }));
    expect(r1.warnings).toContain(BUNDLED_RIGHT_HOLDING_NOTICE);
    expect(r1.warnings).toContain(BUNDLED_RIGHT_HIGH_VALUE_NOTICE);
  });

  it("CR-13 선언 «아니오» → 고지 없음", async () => {
    const r = await run(mainPlusCompanionRight({ main: "housing", hh: "0", elig: "no", price: "500000000" }));
    expect(r.warnings).not.toContain(BUNDLED_RIGHT_HOLDING_NOTICE);
    expect(r.warnings).not.toContain(BUNDLED_RIGHT_HIGH_VALUE_NOTICE);
  });

  it("CR-14 입주권 2개 묶음(선언 예) → 보유 고지", async () => {
    const r = await run(twoRights("yes"));
    expect(r.warnings).toContain(BUNDLED_RIGHT_HOLDING_NOTICE);
  });
});

/**
 * [V-1] 컴패니언 입주권이 받는 세대 사실(`oneRightHouseholdFacts` 9키) 가운데 **결론을 가르는 것**은 `householdRightCount`·
 * `householdNoPresaleRightsConfirmed`(CR-1~)와 `transferorNonResidentAtTransfer`(CR-15)뿐이다. 나머지(`houses`·`sellingHouseId`·
 * `marriageMerge`·`parentalCareMerge`·`isFirstTransferredInMerge`·`contestedRightSaleParentalCareMergeApply`)는 뮤테이션으로 지워도
 * 결론이 같다 — ④는 세대 기준 자산이 토지일 때 `houses`를 본문에 싣지 않는 것을 실측했다(본문 `houses` 없음). 주택일 때는 양도 주택이
 * «다른 주택»으로 세어져 가목이 성립하지 않는 것(CR-6)까지만 측정했고, 합가 제외가 결론을 바꾸는 구성은 만들지 못했다(**확인 필요**).
 * 주 카드·축 B와 같은 사실을 보게 하려고 같은 객체를 싣는다(계획서 §4 · 관측 불가 키는 문서에 기록).
 */
describe("[V-1] 입주권 컴패니언이 받는 세대 사실", () => {
  it("CR-15 양도일 현재 비거주자(2020.1.1. 이후 양도) → 컴패니언 입주권 §89①4호 배제 (계산기 ④는 이 입력을 보내지 않아 본문 직접 주입)", async () => {
    const f = mainPlusCompanionRight({ main: "land", hh: "0", elig: "yes", price: "500000000" });
    const body = await captureBody(f);
    const base = await postTransfer(body);
    expect(base.json.data.aggregated.properties.find((p: { propertyId: string }) => p.propertyId === "companion-fixed").isExempt).toBe(true);
    const r = await postTransfer({ ...body, transferorNonResidentAtTransfer: true });
    expect(r.status).toBe(200);
    const comp = r.json.data.aggregated.properties.find((p: { propertyId: string }) => p.propertyId === "companion-fixed");
    expect(comp).toMatchObject({ isExempt: false, determinedTax: 55_110_000 });
  });
});

describe("[V-8] 나목 · [V-2] 분양권 없음 확인", () => {
  it("CR-17 나목: 세대 주택 1채(취득 2024-01-01, 양도일까지 3년 이내) + 선언 예 → 컴패니언 입주권 나목 성립 (취득일 미입력이면 불성립)", async () => {
    const make = (otherAcq?: string) => {
      const f = mainPlusCompanionRight({ main: "land", hh: "1", elig: "yes", price: "500000000" });
      if (otherAcq) f.assets[1] = { ...f.assets[1], redevOtherHouseAcquisitionDate: otherAcq } as unknown as AssetForm;
      return f;
    };
    const withDate = await run(make("2024-01-01"));
    expect(withDate.card("companion-fixed")).toMatchObject({ isExempt: true, determinedTax: 0 });
    expect(withDate.card("companion-fixed").redevelopmentDetail.oneRightExemptionClause).toBe("na");
    const without = await run(make());
    expect(without.card("companion-fixed")).toMatchObject({ isExempt: false, determinedTax: 55_110_000 });
  });

  it("CR-18 주 자산 토지 + 컴패니언 입주권에서 «분양권·입주권 없음» 확인이 없으면 4호 불성립(엔진) — 확인 칸·⑧ 차단은 PR-3에서 열렸다(`companion-right-4ho-open-pr3.*.test`)", async () => {
    const f = mainPlusCompanionRight({ main: "land", hh: "0", elig: "yes", price: "500000000" });
    f.householdNoPresaleRightsConfirmed = false as never;
    const r = await run(f);
    expect(r.card("companion-fixed")).toMatchObject({ isExempt: false, determinedTax: 55_110_000 });
  });
});
