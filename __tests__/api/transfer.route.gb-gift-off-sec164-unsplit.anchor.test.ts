/**
 * anchor — 분리 OFF 증여 × 고시 전(단서 구간): ⑧ 이 막는 입력을 ⑫ 도 400 으로 막는다
 * (계획서 `docs/00-pm/gb-gift-off-sec164-unsplit.plan.md` Q-1 a·Q-2 a — `refineGbPropertyRequired` 의 증여 단서 파트 가액 규칙)
 *
 * §163⑨ 단서 1호·2호는 「증여받은 토지(1990.8.30. 전)·건물(기준시가 고시 전)」의 취득가액을 **신고가액과 §164 가액 중 많은 금액**으로 정한다. 비교는 **파트별**이라
 * 분리 OFF 의 일괄 신고가액으로는 성립하지 않는다 — ⑧ 이 막는다(`transfer-tax-validate-gb.ts:308-318`).
 * 수정 전에는 ⑫ 가 이 조건이 없어 ④ 가 비운 파트 슬롯(#2725 `compareSec164`) 대신 최상위 일괄 신고가액이 §166⑥ 으로 안분되어 200 이었다 —
 * 일괄 신고가액 P 가 §164 합계 S(토지 205,000,000 + 건물 150,000,000 = 355,000,000)보다 작으면 **두 파트 모두 §164 가액이 채택돼야 하는데 일괄 신고가액이 쓰여 세액이 과대**했다(수정 전 Δ).
 *   · 1988: P=284,000,000 Δ +22,365,000(컴패니언·주 자산)/+20,874,000(단건) · P=213,000,000 +44,730,000/+41,748,000 · P=1,000,000 +111,510,000/+107,580,000
 *   · 1995(건물만 단서): P=284,000,000 +9,450,000/+8,820,000 · P=213,000,000 +18,900,000/+17,640,000 · 1980(의제취득일 전)은 ③ 환산 경로라 Δ 0
 * 수정 후: ⑧ 차단 셀은 전부 400, ⑧ 통과 셀과 오라클(같은 일괄 신고가액을 기준시가 비율 205:150 으로 나눈 분리 ON · 파트별 §164 비교)은 200 · 세액 불변.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const BASE: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: "1600000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false,
  acquisitionDate: "2010-05-01", useEstimatedAcquisition: false,
};
const gbAsset = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, BASE, ...over) as AssetForm;
const landAsset = (id: number) =>
  ({
    ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 2-2", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2012-01-01",
    acquisitionArea: "100", transferArea: "100", landNature: "standalone", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "200000000",
    actualSalePrice: "400000000", fixedAcquisitionPrice: "100000000",
  }) as unknown as AssetForm;
const bundle = (assets: AssetForm[]): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", assets, assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" });
  return f as unknown as TransferFormData;
};
type Role = "컴패니언" | "주 자산";
const form = (role: Role, over: Partial<AssetForm>, bg = false) => {
  const gb = gbAsset(role === "컴패니언" ? 2 : 1, over);
  const other = bg ? gbAsset(role === "컴패니언" ? 1 : 2, over) : landAsset(role === "컴패니언" ? 1 : 2);
  return bundle(role === "컴패니언" ? [other, gb] : [gb, other]);
};
const post = async (b: unknown) => {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(b) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  return { status: res.status, tax: res.status === 200 ? (j.data.aggregated.calculatedTax as number) : undefined };
};


const single = (over: Partial<AssetForm>) => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", contractTotalPrice: "1600000000", assets: [gbAsset(1, over)] });
  return f as unknown as TransferFormData;
};
const ROLES3 = ["컴패니언", "주 자산", "단건"] as const;
type R3 = (typeof ROLES3)[number];
async function go(role: R3, over: Partial<AssetForm>) {
  const f = role === "단건" ? single(over) : form(role, over);
  const r = await post(await captureBody(f));
  return { blocked8: allIssues(f).length > 0, ...r };
}
type Cause = "gift" | "purchase";
const OFF = (d: string, land: Cause, bld: Cause, price: string): Partial<AssetForm> => ({
  acquisitionCause: land, gbBuildingAcquisitionCause: bld, landAcquisitionDate: d, acquisitionDate: d, hasSeperateLandAcquisitionDate: false, fixedAcquisitionPrice: price,
} as Partial<AssetForm>);
/** 오라클: 같은 일괄 신고가액을 파트별로 나눈 분리 ON. */
const ON = (d: string, land: Cause, bld: Cause, landPrice: string, bldPrice: string): Partial<AssetForm> => ({
  acquisitionCause: land, gbBuildingAcquisitionCause: bld, landAcquisitionDate: d, acquisitionDate: d, hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
  landAcquisitionPrice: landPrice, buildingAcquisitionPrice: bldPrice,
} as Partial<AssetForm>);
const DATES = ["1980-05-01", "1988-05-01", "1995-05-01", "2005-05-01"];
const COMBOS: [string, Cause, Cause][] = [["토지·건물 증여", "gift", "gift"], ["토지 증여+건물 매매", "gift", "purchase"], ["토지 매매+건물 증여", "purchase", "gift"]];

describe("VA-1 분리 OFF 증여 × 증여일 4 × 구성 3 × 일괄 신고가액 입력·비움 × 위치 3 (72셀)", () => {
  it("⑧ 차단 60셀은 전부 ⑫ 400 · ⑧ 통과 12셀은 200 (수정 전: ⑧ 차단·⑫ 200 이 18셀 · 차단·400 42셀)", async () => {
    const tally: Record<string, number> = {}; const blocked200: string[] = [];
    for (const d of DATES) for (const [cn, land, bld] of COMBOS) for (const price of ["400000000", ""]) for (const role of ROLES3) {
      const r = await go(role, OFF(d, land, bld, price));
      const k = `${r.blocked8 ? "차단" : "통과"}|${r.status}`;
      tally[k] = (tally[k] ?? 0) + 1;
      if (r.blocked8 && r.status === 200) blocked200.push(`${d}|${cn}|${role}`);
    }
    expect(tally).toEqual({ "차단|400": 60, "통과|200": 12 });
    // 수정 전 막히지 않던 18셀 — 1980 토지·건물 증여 · 1988 세 구성 · 1995 토지·건물 증여와 토지 매매+건물 증여 (일괄 신고가액을 입력한 셀)
    expect(blocked200).toEqual([]);
  }, 120_000);
  it("고시 후(2005)·건물 매매의 1995 토지 증여는 ⑧ 이 통과시키고 ⑫ 도 200 — 단서 밖이라 거짓 차단이 아니다", async () => {
    for (const [d, land, bld] of [["2005-05-01", "gift", "gift"], ["1995-05-01", "gift", "purchase"]] as const) for (const role of ROLES3) {
      const r = await go(role, OFF(d, land, bld, "400000000"));
      expect([r.blocked8, r.status]).toEqual([false, 200]);
    }
  });
});

describe("VA-2 판별 시료 — 일괄 신고가액 P 가 §164 합계 S(355,000,000)보다 작아도 분리 OFF 는 400, 오라클(분리 ON · 파트별 §164 비교)은 200 · 세액 불변", () => {
  /** [증여일, P, 토지/건물 파트 가액(P 를 205:150 으로 안분), 오라클 세액 컴패니언·주 자산, 오라클 단건, 수정 전 Δ 컴패니언·주 자산, 수정 전 Δ 단건] */
  const CASES: [string, string, [string, string], number, number, number, number][] = [
    ["1988-05-01", "355000000", ["205000000", "150000000"], 422_310_000, 329_040_000, 0, 0],
    ["1988-05-01", "284000000", ["164000000", "120000000"], 422_310_000, 329_040_000, 22_365_000, 20_874_000],
    ["1988-05-01", "213000000", ["123000000", "90000000"], 422_310_000, 329_040_000, 44_730_000, 41_748_000],
    ["1988-05-01", "1000000", ["577464", "422536"], 422_310_000, 329_040_000, 111_510_000, 107_580_000],
    ["1995-05-01", "355000000", ["205000000", "150000000"], 422_310_000, 329_040_000, 0, 0],
    ["1995-05-01", "284000000", ["164000000", "120000000"], 435_225_000, 341_094_000, 9_450_000, 8_820_000],
    ["1995-05-01", "213000000", ["123000000", "90000000"], 448_140_000, 353_148_000, 18_900_000, 17_640_000],
    ["1980-05-01", "284000000", ["164000000", "120000000"], 402_009_169, 310_092_558, 0, 0],
    ["1980-05-01", "1000000", ["577464", "422536"], 402_009_169, 310_092_558, 0, 0],
  ];
  it.each(CASES)("%s P=%s", async (d, P, [l, b], onMain, onSingle) => {
    for (const role of ROLES3) {
      const off = await go(role, OFF(d, "gift", "gift", P));
      const on = await go(role, ON(d, "gift", "gift", l, b));
      expect([role, off.blocked8, off.status, off.tax]).toEqual([role, true, 400, undefined]);
      expect([role, on.blocked8, on.status, on.tax]).toEqual([role, false, 200, role === "단건" ? onSingle : onMain]);
    }
  });
  it("수정 전 침묵 세액 기록 — 1988 P=284,000,000: 분리 OFF 444,675,000 (= 오라클 422,310,000 + 22,365,000) · 단건 349,914,000 (= 329,040,000 + 20,874,000)", () => {
    expect([422_310_000 + 22_365_000, 329_040_000 + 20_874_000]).toEqual([444_675_000, 349_914_000]);
  });
});
