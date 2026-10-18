/**
 * anchor: 상업용건물 부수토지 **기준면적 초과분**(자산 전체가 면적 비율로 비사업용 토지)에도 지정지역 선언이 닿는다
 * (양도 2009.3.16.~2015.12.31. 8호 중과 유예).
 *
 * 계획서: `docs/00-pm/transfer-nbl-deferral-derived-followups.plan.md` F-1
 *
 * [결함 — 실측 2026-10-18] 엔진(`runCommercialAppurtenantLandStep`)은 초과분이 있으면 `isNonBusinessLand`를 켜고 8호 유예 판정이
 * `isDesignatedArea`를 읽는다 — 본문에 직접 넣으면 존중했다. 그런데 ④ leaf `nblDesignatedAreaPayload`가 토지·주택만 실어 값이
 * 사라졌고 화면에도 질문이 없었다. 미선언이면 «선언하면 세액이 달라질 수 있습니다(확인 필요)» 고지가 뜨는데 선언할 길이 없었다(막다른 고지).
 *
 * [시료] 2000-01-01 취득 3억 · 2012-09-01 양도 10억 · 집합건물 전체 대지 1,000㎡ · 바닥 100㎡ · 일반주거(4배 → 한도 400㎡ · 초과 600㎡).
 * 세액은 mock 세율표 값(구조 증거)이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { runCalc } from "./_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { commercialAppurtenantNblAreaOfAsset } from "@/lib/calc/transfer-tax-api-commercial";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const NOTICE = "지정지역 여부를 선언하지 않아";
const commercial = (n: number, over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(n),
    assetKind: "commercial_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2000-01-01",
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "1000000000",
    standardPriceAtTransfer: "1000000000",
    addressJibun: `서울 테스트동 ${n}`,
    cbTotalLandArea: "1000",
    cbTotalBuildingFootprintArea: "100",
    cbZoneType: "general_residential",
    ...over,
  }) as unknown as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  ({ ...createDefaultTransferFormData(), transferDate: "2012-09-01", contractTotalPrice: "1000000000", assets, ...over }) as never;
type R = Awaited<ReturnType<typeof runCalc>>;
const notices = (list: string[] | undefined) => (list ?? []).filter((w) => w.includes(NOTICE)).length;

describe("노출 술어 — 엔진 판정 함수(`judgeAppurtenantLandExcess`)와 같은 초과 면적", () => {
  it("초과 600㎡ · 배율 이내 0 · 무허가(전량) 1,000 · 용도지역 미선택 0 · 면적 공란 0 · 다른 종류 0", () => {
    expect(commercialAppurtenantNblAreaOfAsset(commercial(1))).toBe(600);
    expect(commercialAppurtenantNblAreaOfAsset(commercial(1, { cbTotalLandArea: "400" }))).toBe(0);
    expect(commercialAppurtenantNblAreaOfAsset(commercial(1, { cbUnapprovedBuilding: true, cbZoneType: "" }))).toBe(1000);
    expect(commercialAppurtenantNblAreaOfAsset(commercial(1, { cbZoneType: "" }))).toBe(0);
    expect(commercialAppurtenantNblAreaOfAsset(commercial(1, { cbTotalLandArea: "" }))).toBe(0);
    expect(commercialAppurtenantNblAreaOfAsset(commercial(1, { assetKind: "general_building" }))).toBe(0);
  });
});

describe("단건 — 폼 → ④ → Zod → route → 엔진", () => {
  it("미선언 → 중과 유지 297,517,000 + «확인 필요» 고지 1건", async () => {
    const r = await runCalc(form([commercial(1)]));
    expect(r.issues).toEqual([]);
    expect(r.body.isDesignatedArea).toBeUndefined();
    expect(r.result.totalTax).toBe(297_517_000);
    expect(notices(r.result.warnings)).toBe(1);
  });
  it("🔑 «아님» → 값이 엔진에 닿아 유예 278,960,000 · 사유 transfer_deferral · 고지 없음 (수정 전: ④에서 사라져 297,517,000)", async () => {
    const r = await runCalc(form([commercial(1, { isDesignatedArea: false })]));
    expect(r.body.isDesignatedArea).toBe(false);
    expect(r.result.totalTax).toBe(278_960_000);
    expect(r.result.nblSurchargeExcludedBy).toBe("transfer_deferral");
    expect(notices(r.result.warnings)).toBe(0);
  });
  it("독립 도출 — 과세표준 697,500,000 · 미선언은 §104⑤ 2호(파트별 합) · «아님»은 가산이 빠져 1호(합산 누진)가 이긴다", async () => {
    // mock 표: 40% 구간 누진공제 25,400,000 · 38% 구간 19,400,000. 초과 비율 600/1,000 = 60%.
    //   비사업용 파트 418,500,000 × 50%(40% + 10%p) − 25,400,000 = 183,850,000 · 나머지 279,000,000 × 38% − 19,400,000 = 86,620,000
    //   미선언: 2호 270,470,000 ≥ 1호 697,500,000 × 40% − 25,400,000 = 253,600,000 → 270,470,000
    //   «아님»: 비사업용 파트도 40% → 2호 < 1호 → 253,600,000
    const und = await runCalc(form([commercial(1)]));
    const no = await runCalc(form([commercial(1, { isDesignatedArea: false })]));
    expect(und.result.taxBase).toBe(697_500_000);
    expect(und.result.calculatedTax).toBe(418_500_000 * 0.5 - 25_400_000 + (279_000_000 * 0.38 - 19_400_000));
    expect(no.result.calculatedTax).toBe(697_500_000 * 0.4 - 25_400_000);
  });
  it("«지정지역» → 중과 유지 · 미선언과 같은 세액 · 고지 없음", async () => {
    const r = await runCalc(form([commercial(1, { isDesignatedArea: true })]));
    expect(r.body.isDesignatedArea).toBe(true);
    expect(r.result.totalTax).toBe(297_517_000);
    expect(notices(r.result.warnings)).toBe(0);
  });
  it("🔑 무허가 단서(부속토지 전체 비사업용)도 «아님»이 닿는다", async () => {
    const und = await runCalc(form([commercial(1, { cbUnapprovedBuilding: true, cbZoneType: "" })]));
    const no = await runCalc(form([commercial(1, { cbUnapprovedBuilding: true, cbZoneType: "", isDesignatedArea: false })]));
    expect(und.issues).toEqual([]);
    expect(notices(und.result.warnings)).toBe(1);
    expect(no.result.nblSurchargeExcludedBy).toBe("transfer_deferral");
    expect(no.result.totalTax).toBeLessThan(und.result.totalTax);
  });
  it("대조 — 유예 기간 밖(2016-01-04)은 «아님»이어도 미선언과 같은 세액 · 고지 없음", async () => {
    const no = await runCalc(form([commercial(1, { isDesignatedArea: false })], { transferDate: "2016-01-04" }));
    const und = await runCalc(form([commercial(1)], { transferDate: "2016-01-04" }));
    expect(no.result.totalTax).toBe(und.result.totalTax);
    expect(notices(und.result.warnings)).toBe(0);
  });
  it("대조 — 배율 이내(대지 400㎡)는 비사업용이 아니라 선언이 세액에 닿지 않는다", async () => {
    const no = await runCalc(form([commercial(1, { cbTotalLandArea: "400", isDesignatedArea: false })]));
    const und = await runCalc(form([commercial(1, { cbTotalLandArea: "400" })]));
    expect(no.result.totalTax).toBe(und.result.totalTax);
    expect(no.result.nblSurchargeExcludedBy).toBeUndefined();
  });
});

describe("함께 양도 — 상업용건물이 컴패니언", () => {
  const land = (n: number) =>
    ({ ...makeDefaultAsset(n), assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2000-01-01", fixedAcquisitionPrice: "100000000",
      actualSalePrice: "300000000", standardPriceAtTransfer: "300000000", addressJibun: "서울 테스트동 9" }) as unknown as AssetForm;
  const run = (over: Record<string, unknown>) => runCalc(form([land(1), commercial(2, over)], { contractTotalPrice: "1300000000" }));
  const comp = (r: R) => (r.body.companionAssets as { isDesignatedArea?: boolean }[])[0];
  type Row = { nblSurchargeExcludedBy?: string };
  it("🔑 미선언 330,850,000 + 고지 1건 / «아님» → 314,400,000 · 사유 transfer_deferral (수정 전: 컴패니언 값이 사라져 330,850,000)", async () => {
    const und = await run({});
    expect(und.issues).toEqual([]);
    expect(und.json.data.aggregated.determinedTax).toBe(330_850_000);
    expect(notices(und.json.data.aggregated.warnings)).toBe(1);
    const no = await run({ isDesignatedArea: false });
    expect(comp(no).isDesignatedArea).toBe(false);
    expect(no.json.data.aggregated.determinedTax).toBe(314_400_000);
    expect((no.json.data.aggregated.properties as Row[])[1].nblSurchargeExcludedBy).toBe("transfer_deferral");
  });
});

describe("지분 분할(축 B) — 한 상가를 60:40 지분으로 나눠 입력 (지분 카드는 `mergePrimaryBasic`로 주 자산 값을 물려받아 같은 ④ leaf를 지난다)", () => {
  const tranche = (n: number, num: string, over: Record<string, unknown> = {}) =>
    ({ ...makeDefaultAsset(n), acquisitionCause: "purchase", acquisitionDate: "2000-01-01", fixedAcquisitionPrice: "300000000",
      useEstimatedAcquisition: false, ownershipNumerator: num, ownershipDenominator: "100", ...over }) as unknown as AssetForm;
  const run = (ida?: boolean) =>
    runCalc(form([commercial(1, { ownershipNumerator: "60", ownershipDenominator: "100", ...(ida !== undefined ? { isDesignatedArea: ida } : {}) }), tranche(2, "40")]));
  it("🔑 주 자산의 «아님»이 지분 카드에도 실려 두 지분 모두 유예된다 · 미선언은 고지 1건", async () => {
    const und = await run();
    const no = await run(false);
    expect(und.issues).toEqual([]);
    const comps = (r: R) => r.body.companionAssets as { isDesignatedArea?: boolean; commercialAppurtenantLand?: unknown }[];
    expect(comps(no)[0].commercialAppurtenantLand).toBeDefined();
    expect(no.body.isDesignatedArea).toBe(false);
    expect(comps(no)[0].isDesignatedArea).toBe(false);
    expect(comps(und)[0].isDesignatedArea).toBeUndefined();
    type Row = { nblSurchargeExcludedBy?: string };
    const rows = no.json.data.aggregated.properties as Row[];
    expect(rows.map((p) => p.nblSurchargeExcludedBy)).toEqual(["transfer_deferral", "transfer_deferral"]);
    expect(notices(und.json.data.aggregated.warnings)).toBe(1); // 실측 1건(지분 카드마다 중복되지 않는다)
    expect(no.json.data.aggregated.determinedTax).toBeLessThan(und.json.data.aggregated.determinedTax);
  });
});
