/**
 * anchor — 부담부증여 × 건물·일반건물 × 기준시가 평가: 증여일 건물 기준시가(상속·증여용) 필수 (⑤ 필수 표시·⑧·⑫ 공용 술어
 * `lib/calc/bg-gift-building-std-required.ts`).
 *
 * 증여가액 C는 「상속세 및 증여세법」 제61조 제1항 제2호 가액이고, 「국세청 건물 기준시가 계산방법 고시」상 상증법 건물 기준시가에는
 * 양도세용에 없는 조정률(제5조 제2항·제11조)과 별도 잔가율 표(제10조 제2항)가 붙는다. 비우면 엔진이 양도세용 값으로 대신 계산했다.
 *
 *  · A — 건물·일반건물 기준시가 평가에서 비우면 ⑧이 그 칸(`bgGiftBuildingStdPriceAtTransfer`)을 짚고 route는 400(`burdenedGiftInfo.giftBuildingStdPriceAtTransfer`).
 *  · B — 범위 밖(주택·상가 일괄고시·시가 평가·토지만 증여)은 새 요구가 없다.
 *  · C — 값을 넣으면 200. 양도시 기준시가와 같은 값이면 종전 대체 계산과 같은 세액, 다르면 세액이 달라진다(실측 고정).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { asset, land, run } from "./_bg-owner-split-fixtures";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const fieldsOf = (r: Awaited<ReturnType<typeof run>>) => r.issues.map((i) => i.field);
const GIFT_PATH = "burdenedGiftInfo.giftBuildingStdPriceAtTransfer";

/** 건물(소유자 같음) · 기준시가 평가 · 양도시 2억 · 취득시 8천만 · 채무 1억. */
const BLDG = { selfOwns: "both", hasSeperateLandAcquisitionDate: false, standardPriceAtTransfer: "200,000,000", standardPriceAtAcq: "80,000,000" };
/** 일반건물 · 기준시가 평가 · 토지 3,000,000 × 100㎡ = 3억 + 건물 231,900,000 · 취득시 토지 1,500,000 × 100㎡ + 건물 1.2억 · 채무 1억. */
const GB = {
  assetKind: "general_building", selfOwns: "both", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2015-01-01",
  gbLandArea: "100", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential", gbBuildingAcquisitionCause: "purchase",
  gbTransferLandPricePerSqm: "3,000,000", gbTransferBuildingValue: "231,900,000", gbAcqLandPricePerSqm: "1,500,000", gbAcqBuildingValue: "120,000,000",
  actualSalePrice: "1,000,000,000", useEstimatedAcquisition: false,
};

describe("A — 건물·일반건물 기준시가 평가: 비우면 ⑧ 그 칸 · ⑫ 400", () => {
  for (const [name, o] of [["건물", BLDG], ["일반건물", GB]] as const) {
    it(`${name} — ⑧ bgGiftBuildingStdPriceAtTransfer · route 400 ${GIFT_PATH}`, async () => {
      const r = await run([asset(1, o)]);
      expect(fieldsOf(r)).toEqual(["bgGiftBuildingStdPriceAtTransfer"]);
      expect(r.status).toBe(400);
      expect(Object.keys(r.json?.error?.fieldErrors ?? {})).toEqual([GIFT_PATH]);
    });
  }
});

describe("B — 범위 밖은 새 요구 없음", () => {
  it("주택(고시주택가격 — 두 법 같음) · 상가 일괄고시 · 건물 시가 평가 · 토지만 증여 → ⑧에 이 칸 없음 · 200", async () => {
    const cases: Record<string, unknown>[] = [
      { ...BLDG, assetKind: "housing" },
      { ...BLDG, assetKind: "commercial_building" },
      { ...BLDG, bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "200,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "80,000,000" },
      land("1,000,000", "200", "400,000", "200"),
    ];
    for (const o of cases) {
      const r = await run([asset(1, o)]);
      expect(fieldsOf(r), JSON.stringify(o)).not.toContain("bgGiftBuildingStdPriceAtTransfer");
      expect(r.status, JSON.stringify(o) + r.text.slice(0, 200)).toBe(200);
    }
  });
});

describe("C — 값을 넣으면 200 · 양도시 기준시가와 같으면 종전 대체 계산과 같고, 다르면 세액이 달라진다", () => {
  it("건물 — 2억(= 양도시 기준시가) vs 1.8억(조정률 0.9 상당)", async () => {
    const same = await run([asset(1, { ...BLDG, bgGiftBuildingStdPriceAtTransfer: "200,000,000" })]);
    const lower = await run([asset(1, { ...BLDG, bgGiftBuildingStdPriceAtTransfer: "180,000,000" })]);
    expect([fieldsOf(same), same.status, fieldsOf(lower), lower.status]).toEqual([[], 200, [], 200]);
    expect(same.body.burdenedGiftInfo).toMatchObject({ giftBuildingStdPriceAtTransfer: 200_000_000 });
    expect(same.result.determinedTax).toBe(BLDG_SAME_TAX);
    expect(lower.result.determinedTax).toBe(BLDG_LOWER_TAX);
    expect(lower.result.determinedTax).not.toBe(same.result.determinedTax);
  });

  it("일반건물 — 건물분 231,900,000(= 양도세용) vs 208,500,000(상증법 · 비주거 300㎡ 조정률 0.9)", async () => {
    const same = await run([asset(1, { ...GB, bgGiftBuildingStdPriceAtTransfer: "231,900,000" })]);
    const lower = await run([asset(1, { ...GB, bgGiftBuildingStdPriceAtTransfer: "208,500,000" })]);
    expect([fieldsOf(same), same.status, fieldsOf(lower), lower.status]).toEqual([[], 200, [], 200]);
    // 일반건물은 토지·건물 묶음 응답(`mode: "bundled"`)이다 — 세액은 합계(`aggregated`)에서 읽는다.
    const tax = (r: typeof same) => r.json?.data?.aggregated?.determinedTax as number;
    expect(tax(same)).toBe(GB_SAME_TAX);
    expect(tax(lower)).toBe(GB_LOWER_TAX);
  });
});

// 실측 고정값(2026-11-13 · mock 세율). «같은 값»은 종전 엔진 대체 계산(이 칸 미입력 = 양도세용 값)과 같다 —
// 건물 5,244,600 = 소유자 분리 A2(`bg-owner-split-159.anchor.test.ts`) · 일반건물 3,947,741 = 엔진 직접 probe의 «미입력» 값.
const BLDG_SAME_TAX = 5_244_600;
const BLDG_LOWER_TAX = 4_709_000;
const GB_SAME_TAX = 3_947_741;
const GB_LOWER_TAX = 3_666_239;
