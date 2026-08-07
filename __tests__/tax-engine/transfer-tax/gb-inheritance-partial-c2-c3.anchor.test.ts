/**
 * 일반건물 **부분 상속**(C2·C2′·C3) 취득가액 — §163⑨ 파트별 직접 산정.
 *
 * ## 종전 (Pre-Do 실측 2026-08-07 — validate V1을 우회해 payload로 직접 측정)
 *
 * | 케이스 | 종전 |
 * |---|---|
 * | C2 (토지 매매·환산 + 건물 상속) | **throw** 「건물 취득가액을 입력하세요」 |
 * | C2′ (둘 다 실가 + 건물 상속) | 취득가액 **0·0** · 산출세액 492,412,110 |
 * | C3 (토지 상속 + 건물 매매·실가) | 취득가액 **0·0** — 입력한 건물 2억까지 버려짐 |
 *
 * ⚠️ 계획서(및 Phase 1 계획서 §5)의 「현행 결함」 서술 3건 중 **2건이 틀렸다**. C2는
 *    「환산+개산공제 오적용」이 아니라 throw였고, C2′·C3는 「안분」이 아니라 **0**이었다.
 *    파트 축 재편(P3·P7·O-1·O-3) 이후 동작이 바뀌었는데 서술이 따라가지 않았다
 *    (`feedback_open_item_wording_is_also_unverified`).
 *
 * ## 원인 — 두 게이트가 AND였다
 *
 *   ① `general-building-route-actual.ts` 상속 분기가 `acquisitionByInheritance **&&**
 *      buildingAcquisitionByInheritance` → 부분 상속은 이 분기에 못 들어간다.
 *   ② 떨어진 곳의 `hasBothPartPrices`도 **AND** → 상속 파트는 파트 가격이 없으므로 false →
 *      `actualAcquisitionPrice`(분리 ON에서 0)로 떨어져 **취득가액 0**.
 *
 * ## 수정 — 상속 평가액을 **파트별 실지거래가액 슬롯**에 싣는다
 *
 * 「소득세법 시행령」 제163조 제9항이 상속개시일 평가액을 「취득당시의 실지거래가액으로
 * **본다**」고 하므로, 엔진에서도 파트별 실지거래가액 슬롯에 그대로 싣는 것이 법문과 1:1이다.
 * 그러면 이미 완성된 파트 축 배선이 세 케이스를 전부 처리한다 — **새 엔진 분기 0**.
 *
 * - 환산 경로: `applyPartAcqModes`가 비-환산 파트만 파트 가격으로 교체하고, 개산공제도
 *   `landDeductible = landMode !== "actual"`로 파트별 0 처리한다(§97②2호는 실지거래가액
 *   파트를 「그 밖의 경우」에서 제외한다).
 * - 실가 경로: 두 파트 가격이 다 차므로 `hasBothPartPrices`가 성립해 직접 배정된다.
 *
 * C1(둘 다 상속)은 전용 분기가 **먼저** 잡으므로 값이 변하지 않는다(회귀 0).
 *
 * 설계: `docs/02-design/features/transfer-gb-inheritance-partial-phase2.plan.md` §3·§4
 */
import { describe, it, expect } from "vitest";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { generalBuildingValuationSchema } from "@/lib/api/transfer-tax-building-schemas";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const TRANSFER_PRICE = 1_620_000_000;
const TRANSFER_DATE = new Date("2023-02-19");
const BUILDING_ACQ_DATE = new Date("2012-05-01");

const LAND_INHERITED = 600_000_000; // 상속개시일 토지 평가액
const BUILDING_INHERITED = 300_000_000; // 상속개시일 건물 신고가액
const LAND_PURCHASE = 500_000_000; // 토지 파트 실지거래가액
const BUILDING_PURCHASE = 200_000_000; // 건물 파트 실지거래가액

function asset(over: Partial<AssetForm>): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2010-03-01",
    acquisitionDate: "2012-05-01",
    decedentAcquisitionDate: "2000-01-01",
    gbLandArea: "205",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "135",
    gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "5514000",
    gbTransferBuildingValue: "259072400",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "150000000",
    transferPrice: String(TRANSFER_PRICE),
    actualSalePrice: String(TRANSFER_PRICE),
    transferDate: "2023-02-19",
    ...over,
  } as AssetForm;
}

function run(a: AssetForm) {
  const payload = buildGeneralBuildingValuation(a) as Record<string, unknown> | undefined;
  if (!payload) throw new Error("API 변환이 payload를 drop했다 (④ 침묵 strip)");
  const r = dispatchGeneralBuilding(
    payload,
    TRANSFER_PRICE,
    TRANSFER_DATE,
    BUILDING_ACQ_DATE,
    0,
    0,
    2023,
    0,
    [],
    makeMockRates(),
  );
  const ap = r.apportionment.apportioned;
  const cards = r.aggregated.generalBuildingValuationDetail?.assetCards ?? [];
  return {
    landAcq: ap.find((x) => x.assetKind === "land")?.allocatedAcquisitionPrice,
    buildingAcq: ap.find((x) => x.assetKind === "building")?.allocatedAcquisitionPrice,
    landDeduction: cards.find((c) => c.propertyType === "land")?.estimatedDeduction,
    buildingDeduction: cards.find((c) => c.propertyType === "general_building_unit")?.estimatedDeduction,
    calculatedTax: r.aggregated.calculatedTax,
    detail: r.aggregated.generalBuildingValuationDetail,
  };
}

const v = (a: AssetForm) => validateGeneralBuildingAsset(a, "자산1", "2026-02-16");

/**
 * describe 본문에서 즉시 실행하지 않는다 — 종전 C2는 **throw**라서 파일 전체가 죽고
 * 나머지 케이스의 실패 이유를 볼 수 없었다(Pre-Do에서 실측). 케이스별 1회만 계산한다.
 */
const memo = new Map<AssetForm, ReturnType<typeof run>>();
const lazy = (a: AssetForm) => {
  if (!memo.has(a)) memo.set(a, run(a));
  return memo.get(a)!;
};

// ── 케이스 정의 ────────────────────────────────────────────────────────
const C1 = asset({
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  publishedValueAtInheritance: String(LAND_INHERITED),
  gbBuildingInheritedValue: String(BUILDING_INHERITED),
});

/** C2 — 토지 매매(환산) + 건물 상속(실가). 「한 파트라도 환산이면 환산 경로」. */
const C2 = asset({
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "inheritance",
  landAcqMode: "estimated",
  buildingAcqMode: "actual",
  gbBuildingInheritedValue: String(BUILDING_INHERITED),
});

/** C2′ — 토지 매매(실가) + 건물 상속. 실가 경로. */
const C2_PRIME = asset({
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "inheritance",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: String(LAND_PURCHASE),
  gbBuildingInheritedValue: String(BUILDING_INHERITED),
});

/** C3 — 토지 상속 + 건물 매매(실가). 실가 경로. */
const C3 = asset({
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "purchase",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  buildingAcquisitionPrice: String(BUILDING_PURCHASE),
  publishedValueAtInheritance: String(LAND_INHERITED),
});

describe("PC-1 — C2 (토지 매매·환산 + 건물 상속)", () => {
  const r = () => lazy(C2);

  it("🔴 건물 취득가액 = 상속개시일 신고가액 300,000,000 (종전: throw)", () => {
    expect(r().buildingAcq).toBe(BUILDING_INHERITED);
  });

  it("건물 개산공제 = 0 — 실지거래가액 파트는 §97②2호 「그 밖의 경우」가 아니다", () => {
    expect(r().buildingDeduction).toBe(0);
  });

  it("토지는 환산 유지 — 취득가액 > 0 이고 개산공제도 살아 있다(§163⑥)", () => {
    expect(r().landAcq).toBeGreaterThan(0);
    expect(r().landDeduction).toBeGreaterThan(0);
  });

  it("결과 echo — 건물만 상속으로 표시된다 (파트별 라벨의 유일 소스)", () => {
    expect(r().detail?.buildingAcquisitionByInheritance).toBe(true);
    expect(r().detail?.acquisitionByInheritance).toBeFalsy();
  });
});

describe("PC-2 — C2′ (토지 매매·실가 + 건물 상속)", () => {
  const r = () => lazy(C2_PRIME);

  it("🔴 토지 = 파트 실거래가 · 건물 = 상속 평가액 (종전: 0·0)", () => {
    expect(r().landAcq).toBe(LAND_PURCHASE);
    expect(r().buildingAcq).toBe(BUILDING_INHERITED);
  });

  it("두 파트 모두 개산공제 0 (실지거래가액 파트)", () => {
    expect(r().landDeduction).toBe(0);
    expect(r().buildingDeduction).toBe(0);
  });

  /**
   * 🔑 **파트 슬롯 정규화의 검산**이다. 같은 취득가액(5억·3억)을 파트 칸에 **손으로**
   * 넣었을 때의 세액을 Pre-Do에서 실측해 두었다(224,788,636). 상속 평가액이 그 슬롯에
   * 실린다면 **세액이 한 원도 달라서는 안 된다** — 상속이라는 사실은 취득가액의
   * *출처*이지 *금액*이 아니기 때문이다.
   */
  it("🔑 세액이 「손으로 넣은 같은 금액」과 동일하다 — 224,788,636", () => {
    expect(r().calculatedTax).toBe(224_788_636);
  });
});

describe("PC-3 — C3 (토지 상속 + 건물 매매·실가)", () => {
  const r = () => lazy(C3);

  it("🔴 토지 = 상속 평가액 · 건물 = 파트 실거래가 (종전: 0·0 — 입력한 2억까지 버려졌다)", () => {
    expect(r().landAcq).toBe(LAND_INHERITED);
    expect(r().buildingAcq).toBe(BUILDING_PURCHASE);
  });

  it("결과 echo — 토지만 상속", () => {
    expect(r().detail?.acquisitionByInheritance).toBe(true);
    expect(r().detail?.buildingAcquisitionByInheritance).toBeFalsy();
  });
});

describe("PC-4 — C1 회귀 0 (전용 분기가 먼저 잡는다)", () => {
  const r = () => lazy(C1);

  it("취득가액 불변 — 600,000,000 · 300,000,000", () => {
    expect(r().landAcq).toBe(LAND_INHERITED);
    expect(r().buildingAcq).toBe(BUILDING_INHERITED);
  });

  it("산출세액 불변 — 192,868,636 (Pre-Do 실측값)", () => {
    expect(r().calculatedTax).toBe(192_868_636);
  });
});

describe("PC-5 — ⑧ validate 파트 축", () => {
  it("🔴 C2·C2′·C3 전부 통과한다 (종전: V1이 부분 상속을 전면 차단)", () => {
    expect(v(C2)).toBeNull();
    expect(v(C2_PRIME)).toBeNull();
    expect(v(C3)).toBeNull();
  });

  it("🔴 상속 파트의 평가액만 요구한다 — 건물 상속인데 토지 평가액을 묻지 않는다", () => {
    const a = asset({ ...C2_PRIME, gbBuildingInheritedValue: "" } as Partial<AssetForm>);
    expect(v(a)).toMatch(/상속개시일 건물 신고가액/);
    // 토지는 매매이므로 토지 평가액을 요구해서는 안 된다(거짓 차단 금지).
    expect(v(a)).not.toMatch(/상속개시일 토지 평가액/);
  });

  it("🔴 토지 상속인데 건물 평가액을 묻지 않는다 (C3)", () => {
    const a = asset({ ...C3, publishedValueAtInheritance: "" } as Partial<AssetForm>);
    expect(v(a)).toMatch(/상속개시일 토지 평가액/);
  });

  it("비상속 파트의 실거래가는 종전대로 요구한다 (회귀 0)", () => {
    const a = asset({ ...C3, buildingAcquisitionPrice: "" } as Partial<AssetForm>);
    expect(v(a)).toMatch(/건물 취득가액을 입력하세요/);
  });

  it("상속 파트는 파트 취득가액을 요구하지 않는다 — 평가액이 정본이다", () => {
    const a = asset({ ...C3, landAcquisitionPrice: "" } as Partial<AssetForm>);
    expect(v(a)).toBeNull();
  });

  it("상속 파트의 추계는 여전히 차단한다 (V2 — §97①1호 단서)", () => {
    const a = asset({ ...C3, landAcqMode: "estimated" } as Partial<AssetForm>);
    expect(v(a)).toMatch(/환산취득가·감정가액·매매사례가액으로 산정할 수 없습니다/);
  });

  it("🔴 분리 OFF + 부분 상속은 차단한다 (V-5 — 자산 단위 총액과 이중계상)", () => {
    const a = asset({
      ...C3,
      hasSeperateLandAcquisitionDate: false,
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(/「토지·건물 취득일 다름」을 켜고/);
  });

  it("분리 OFF + 전부 상속(C1)은 종전대로 통과 (회귀 0)", () => {
    const a = asset({
      ...C1,
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "2012-05-01",
    } as Partial<AssetForm>);
    expect(v(a)).toBeNull();
  });
});

describe("PC-6 — ⑫ Zod 라운드트립 (TypeScript 미감지 — 침묵 strip 방지)", () => {
  /**
   * anchor의 `run()`은 payload를 Zod에 통과시키지 않고 엔진에 직접 넣는다 —
   * 스키마에 필드가 없으면 **실서비스에서만** 조용히 사라진다(⑫). 여기서 따로 잠근다.
   */
  const roundTrip = (a: AssetForm) => {
    const payload = buildGeneralBuildingValuation(a) as Record<string, unknown>;
    const parsed = generalBuildingValuationSchema.parse(payload);
    return parsed as Record<string, unknown>;
  };

  it("C2 — 게이트 echo와 건물 파트 가격이 살아남는다", () => {
    const p = roundTrip(C2);
    expect(p.buildingAcquisitionByInheritance).toBe(true);
    expect(p.buildingAcquisitionPrice).toBe(BUILDING_INHERITED);
  });

  it("C3 — 토지 게이트 echo와 토지 파트 가격이 살아남는다", () => {
    const p = roundTrip(C3);
    expect(p.acquisitionByInheritance).toBe(true);
    expect(p.landAcquisitionPrice).toBe(LAND_INHERITED);
    expect(p.buildingAcquisitionPrice).toBe(BUILDING_PURCHASE);
  });

  it("C1 — 실가 경로 전용 평가액 필드도 살아남는다 (회귀 0)", () => {
    const p = roundTrip(C1);
    expect(p.inheritedLandValue).toBe(LAND_INHERITED);
    expect(p.inheritedBuildingValue).toBe(BUILDING_INHERITED);
  });
});
