/**
 * anchor A-4 — 일반건물 **파트별 취득 방식**(혼합 모드) (P3)
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md` §3.3 · §4 C-4·C-5
 *
 * 확정된 라우팅(2026-08-05): **한 파트라도 환산이면 환산 경로**로 보낸다. 그 경로만 파트별
 * 취득시 기준시가·개산공제(§163⑥) 구조를 갖기 때문이다.
 *
 * 고정 계약:
 *   · 환산 파트  → 환산취득가(§176의2②) + 개산공제 3%
 *   · 비-환산 파트 → 그 파트의 **실지거래가액**(§97①1호) + **개산공제 0**
 *     (§163⑥은 추계 취득가액의 필요경비 의제라 실지거래가액 파트에는 근거가 없다)
 *   · 두 파트가 모두 환산이면 종전 값 그대로 (회귀 0)
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates } from "../_helpers/mock-rates";

const RATES = makeMockRates();

const TRANSFER_DATE = new Date("2026-02-16");
const ACQ_DATE = new Date("1999-05-24");

/** 양도 20억 · 토지 85㎡ × 10,830,000원/㎡ · 건물 20,629,440원 */
const BASE = {
  totalTransferPrice: 2_000_000_000,
  transferDate: TRANSFER_DATE,
  acquisitionDate: ACQ_DATE,
  landArea: 85,
  buildingArea: 180.96,
  buildingFootprintArea: 180.96,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 2_800_000,
  acquisitionBuildingStdPrice: 2_814_470,
  estimatedDeductionRate: 0.03,
  buildingAcquisitionCause: "purchase" as const,
  zoneType: "commercial",
};

function run(over: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return buildGeneralBuildingAssetCards({ ...BASE, ...over } as any);
}

function card(out: ReturnType<typeof run>, id: string) {
  const c = out.assetCards.find((x) => x.propertyId === id);
  if (!c) throw new Error(`카드 없음: ${id} (있는 것: ${out.assetCards.map((x) => x.propertyId).join(",")})`);
  return c;
}

describe("A-4 — 파트별 취득 방식", () => {
  it("둘 다 환산(기본) — 종전 산식 그대로", () => {
    const out = run();
    const land = card(out, "land");
    const building = card(out, "building");
    expect(land.usedEstimatedAcquisition).toBe(true);
    expect(building.usedEstimatedAcquisition).toBe(true);
    expect(land.estimatedDeduction).toBeGreaterThan(0);
    expect(building.estimatedDeduction).toBeGreaterThan(0);
  });

  it("C-4 토지 실거래가 + 건물 환산 — 토지는 입력값·개산공제 0, 건물은 환산 유지", () => {
    const both = run();
    const mixed = run({
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: 300_000_000,
    });

    const land = card(mixed, "land");
    expect(land.acquisitionPrice).toBe(300_000_000); // 실지거래가액 그대로
    expect(land.estimatedDeduction).toBe(0); // §163⑥ 미적용
    expect(land.usedEstimatedAcquisition).toBe(false);
    expect(land.estimatedBase).toBe(0);

    // 건물 파트는 손대지 않는다 — 둘 다 환산일 때와 같은 값
    const building = card(mixed, "building");
    expect(building.acquisitionPrice).toBe(card(both, "building").acquisitionPrice);
    expect(building.estimatedDeduction).toBe(card(both, "building").estimatedDeduction);
    expect(building.usedEstimatedAcquisition).toBe(true);
  });

  it("C-5 토지 환산 + 건물 실거래가 — 대칭", () => {
    const both = run();
    const mixed = run({
      landAcqMode: "estimated",
      buildingAcqMode: "actual",
      buildingAcquisitionPrice: 120_000_000,
    });

    const building = card(mixed, "building");
    expect(building.acquisitionPrice).toBe(120_000_000);
    expect(building.estimatedDeduction).toBe(0);
    expect(building.usedEstimatedAcquisition).toBe(false);

    const land = card(mixed, "land");
    expect(land.acquisitionPrice).toBe(card(both, "land").acquisitionPrice);
    expect(land.estimatedDeduction).toBe(card(both, "land").estimatedDeduction);
    expect(land.usedEstimatedAcquisition).toBe(true);
  });

  it("🔴 비-환산 파트의 실지거래가액 미입력은 **차단**한다 — 0으로 메우지 않는다", () => {
    expect(() =>
      run({ landAcqMode: "actual", buildingAcqMode: "estimated" }),
    ).toThrowError(/토지 취득가액을 입력하세요/);
  });
});

/**
 * A-5b — 파트별 자본적지출 (P5)
 *
 * 「소득세법」 제100조 제2항 후문: "이 경우 **공통되는** 취득가액과 양도비용은 해당 자산의
 * 가액에 비례하여 안분계산한다." ⇒ **귀속이 분명하면 안분하지 않는다**.
 *
 * 실가 경로(두 파트 모두 실가)에서만 파트 값을 소비한다 — 환산 파트가 있으면 자본적지출은
 * §97②2호 단서의 택일 대상이고 그 판정이 자산 단위라 파트 값이 죽는다(계획서 §9 O-1).
 */
describe("A-5b — 파트별 자본적지출 직접 귀속", () => {
  const ACTUAL_BASE = {
    totalTransferPrice: 2_000_000_000,
    transferDate: TRANSFER_DATE,
    acquisitionDate: ACQ_DATE,
    landArea: 85,
    buildingFootprintArea: 180.96,
    transferLandPricePerSqm: 10_830_000,
    transferBuildingStdPrice: 20_629_440,
    zoneType: "commercial",
    actualAcquisitionPrice: 600_000_000,
    actualExpenses: 10_000_000,
  };

  function runActual(over: Record<string, unknown> = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return calculateGeneralBuildingActualTransfer({ ...ACTUAL_BASE, ...over } as any, 2026, undefined, [], RATES);
  }

  function expenses(r: ReturnType<typeof runActual>) {
    const cards = (r.aggregated.generalBuildingValuationDetail as unknown as {
      assetCards: Array<{ propertyId: string; expenses: number }>;
    }).assetCards;
    return Object.fromEntries(cards.map((c) => [c.propertyId, c.expenses]));
  }

  it("미입력 — 종전대로 §166⑥ 비율 안분 (회귀 0)", () => {
    const e = expenses(runActual());
    expect(e.land + e.building).toBe(10_000_000);
    expect(e.land).toBeGreaterThan(0);
    expect(e.building).toBeGreaterThan(0);
  });

  it("파트 입력 — 그 파트는 전액 직접 귀속, 안분하지 않는다", () => {
    const e = expenses(runActual({ landDirectExpenses: 7_000_000, buildingDirectExpenses: 3_000_000 }));
    expect(e.land).toBe(7_000_000);
    expect(e.building).toBe(3_000_000);
  });

  it("한쪽만 입력 — 입력한 파트만 직접 귀속, 반대편은 안분분 유지", () => {
    const base = expenses(runActual());
    const e = expenses(runActual({ landDirectExpenses: 9_000_000 }));
    expect(e.land).toBe(9_000_000);
    expect(e.building).toBe(base.building); // 잔액 도출로 깎지 않는다
  });
});

/**
 * A-11 — 취득가액 리뷰(2026-08-05) FAIL 4건 회귀 가드
 *
 * 리뷰가 잡은 결함은 전부 **기존 anchor의 픽스처가 그 조합을 구성하지 않아** GREEN인 채
 * 통과했다. 각 결함을 정확히 재현하는 픽스처를 여기 고정한다.
 */
describe("A-11 — 리뷰 FAIL 회귀 가드", () => {
  it("R-1 혼합 모드에서 실가 파트 기준시가를 비워도 payload가 살아 있다 (침묵 drop 금지)", async () => {
    const { buildGeneralBuildingValuation } = await import("@/lib/calc/transfer-tax-api-gb");
    const { makeDefaultAsset } = await import("@/lib/stores/calc-wizard-asset");
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "general_building",
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "1999-05-24",
      acquisitionDate: "2015-03-01",
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: "300000000",
      gbLandArea: "85",
      gbBuildingArea: "180.96",
      gbBuildingFootprintArea: "180.96",
      gbTransferLandPricePerSqm: "10830000",
      gbTransferBuildingValue: "20629440",
      gbAcqLandPricePerSqm: "", // 실가 파트 — validate가 요구하지 않는다
      gbAcqBuildingValue: "2814470",
      gbZoneType: "commercial",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(buildGeneralBuildingValuation(asset)).toBeDefined();
  });

  it("R-2 감정가액 파트도 개산공제 대상이다 (§97②2호 「그 밖의 경우」)", () => {
    const out = run({
      landAcqMode: "appraisal",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: 300_000_000,
    });
    // 감정 파트는 실지거래가액이 아니므로 §163⑥ 개산공제가 살아 있어야 한다
    expect(card(out, "land").estimatedDeduction).toBeGreaterThan(0);
  });

  it("R-2b 실가 파트만 개산공제 0", () => {
    const out = run({
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: 300_000_000,
    });
    expect(card(out, "land").estimatedDeduction).toBe(0);
    expect(card(out, "building").estimatedDeduction).toBeGreaterThan(0);
  });
});
