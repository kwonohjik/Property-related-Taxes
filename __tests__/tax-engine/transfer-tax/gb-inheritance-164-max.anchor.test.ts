/**
 * 일반건물 상속 — **미공시 시기 §164 max**(「소득세법 시행령」 제163조 제9항 제1호·제2호).
 *
 * ## 법령 (원문 확인 — MST 286211, 시행 20260701)
 *
 * - **1호**: 「1990년 8월 30일 개별공시지가가 고시되기 전에」 상속·증여받은 **토지** →
 *   상증법 §60~66 평가액과 **제164조제4항**의 가액 중 **많은 금액**
 * - **2호**: 상증법 §61①**2호~4호** 「건물의 기준시가가 고시되기 전에」 상속·증여받은 **건물** →
 *   평가액과 **제164조제5항 내지 제7항**의 가액 중 **많은 금액**
 *
 * 일반건물의 건물분은 법 §99①1호 **나목**이므로 **§164⑤**가 정본이다
 * (⑥=오피스텔·상업용건물·공동주택, ⑦=주택).
 *
 * ## 종전 (Pre-Do 실측 2026-08-07)
 *
 * 상속개시일 1988-05-01 · 양도가 16.2억 · 평가액(5천만·2천만) < §164 가액(2.05억·1.5억):
 *
 * | | 취득가액 | 산출세액 |
 * |---|---|---|
 * | 종전 — 평가액만 사용 | 70,000,000 | **421,185,000** |
 * | max 적용 | 355,000,000 | **334,920,000** |
 * | | | **86,265,000원 과대** |
 *
 * 추가 실측: 취득시 기준시가를 **비워도 validate가 통과**했다 — ② 비교값이 수집되지 않았다.
 *
 * 설계: `docs/02-design/features/transfer-gb-inheritance-164-max-phase3.plan.md`
 */
import { describe, it, expect } from "vitest";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const TRANSFER_PRICE = 1_620_000_000;
const LAND_AREA = 205;

/** ② §164④ — 취득시 토지 기준시가 총액 = 1,000,000 × 205㎡ */
const SEC164_LAND_TOTAL = 205_000_000;
/** ② §164⑤ — 취득시 건물 기준시가 */
const SEC164_BUILDING = 150_000_000;

/** 상속개시일 1988 — 토지 <1990-08-30 · 건물 취득연도 ≤2000 둘 다 게이트 안 */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "inheritance",
    gbBuildingAcquisitionCause: "inheritance",
    hasSeperateLandAcquisitionDate: false,
    landAcquisitionDate: "1988-05-01",
    acquisitionDate: "1988-05-01",
    decedentAcquisitionDate: "1970-01-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    // ① 상증법 §60~66 평가액
    publishedValueAtInheritance: "50000000",
    gbBuildingInheritedValue: "20000000",
    // ② 취득시 기준시가 (§164④ 등급환산·§164⑤ 산정기준율 산출값)
    gbAcqLandPricePerSqm: "1000000",
    gbAcqBuildingValue: String(SEC164_BUILDING),
    gbLandArea: String(LAND_AREA),
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "135",
    gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "5514000",
    gbTransferBuildingValue: "259072400",
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
    new Date("2023-02-19"),
    new Date("1988-05-01"),
    0,
    0,
    2023,
    0,
    [],
    makeMockRates(),
  );
  const ap = r.apportionment.apportioned;
  return {
    landAcq: ap.find((x) => x.assetKind === "land")?.allocatedAcquisitionPrice,
    buildingAcq: ap.find((x) => x.assetKind === "building")?.allocatedAcquisitionPrice,
    calculatedTax: r.aggregated.calculatedTax,
  };
}

const v = (a: AssetForm) => validateGeneralBuildingAsset(a, "자산1", "2026-02-16");

describe("M-1 — 토지 §163⑨1호: max(평가액, §164④)", () => {
  it("🔴 평가액 < §164④ → §164④ 가액을 취득가액으로 한다", () => {
    expect(run(asset()).landAcq).toBe(SEC164_LAND_TOTAL);
  });

  it("평가액 > §164④ → 평가액을 유지한다 (max이지 대체가 아니다)", () => {
    const r = run(asset({ publishedValueAtInheritance: "900000000" }));
    expect(r.landAcq).toBe(900_000_000);
  });

  it("동점이면 평가액(①)이다 — 금액은 같고 근거만 갈린다", () => {
    const r = run(asset({ publishedValueAtInheritance: String(SEC164_LAND_TOTAL) }));
    expect(r.landAcq).toBe(SEC164_LAND_TOTAL);
  });
});

describe("M-2 — 건물 §163⑨2호: max(평가액, §164⑤)", () => {
  it("🔴 평가액 < §164⑤ → §164⑤ 가액", () => {
    expect(run(asset()).buildingAcq).toBe(SEC164_BUILDING);
  });

  it("평가액 > §164⑤ → 평가액 유지", () => {
    const r = run(asset({ gbBuildingInheritedValue: "400000000" }));
    expect(r.buildingAcq).toBe(400_000_000);
  });
});

describe("M-3 — 게이트 밖은 max를 적용하지 않는다 (회귀 0)", () => {
  it("토지: 1990-08-30 이후 상속이면 평가액 그대로", () => {
    const r = run(
      asset({
        landAcquisitionDate: "1995-05-01",
        acquisitionDate: "1995-05-01",
      }),
    );
    expect(r.landAcq).toBe(50_000_000);
  });

  it("건물: 취득연도 ≥2001이면 평가액 그대로", () => {
    const r = run(
      asset({
        landAcquisitionDate: "2005-05-01",
        acquisitionDate: "2005-05-01",
      }),
    );
    expect(r.buildingAcq).toBe(20_000_000);
  });

  /**
   * 🔑 **경계는 파트마다 다르다** — 토지는 1990-08-30, 건물은 취득연도 2000/2001.
   * 1995년 상속이면 **건물만** 게이트 안이다. 한 게이트로 뭉뚱그리면 여기서 틀린다.
   */
  it("🔑 1995년 상속 — 토지는 밖(평가액) · 건물은 안(§164⑤)", () => {
    const r = run(
      asset({
        landAcquisitionDate: "1995-05-01",
        acquisitionDate: "1995-05-01",
      }),
    );
    expect(r.landAcq).toBe(50_000_000);
    expect(r.buildingAcq).toBe(SEC164_BUILDING);
  });
});

describe("M-4 — 세액까지 (§2 실측)", () => {
  it("🔴 421,185,000 → 334,920,000 (86,265,000원 과대 해소)", () => {
    expect(run(asset()).calculatedTax).toBe(334_920_000);
  });
});

describe("M-5 — ⑧ 게이트가 켜지면 ② 비교값을 요구한다", () => {
  it("🔴 취득시 토지 기준시가 미입력 차단 (종전: 통과)", () => {
    expect(v(asset({ gbAcqLandPricePerSqm: "" }))).toMatch(/취득시 토지 공시지가/);
  });

  it("🔴 취득시 건물기준시가 미입력 차단", () => {
    expect(v(asset({ gbAcqBuildingValue: "" }))).toMatch(/취득시 건물기준시가/);
  });

  it("게이트 밖에서는 요구하지 않는다 (거짓 차단 금지)", () => {
    const a = asset({
      landAcquisitionDate: "2005-05-01",
      acquisitionDate: "2005-05-01",
      gbAcqLandPricePerSqm: "",
      gbAcqBuildingValue: "",
    });
    expect(v(a)).toBeNull();
  });

  it("둘 다 채우면 통과", () => {
    expect(v(asset())).toBeNull();
  });
});

/**
 * M-6 — §164④ **등급환산 파생**이 ② 비교값으로 도달하는가.
 *
 * 1990.8.30. 이전 개별공시지가는 **존재하지 않으므로** 사용자가 직접 적을 수 없다.
 * `Pre1990LandValuationInput`이 등급으로 환산하고, 그 파생값을 UI display·④ API·⑧ validate가
 * **같은 함수**(`effectiveGbLandPriceAtAcq`)로 본다(3중 fallback · `mirror-pattern`).
 */
describe("M-6 — §164④ 등급환산 파생 (3중 fallback)", () => {
  /** 취득시 공시지가 칸은 **비우고** 등급만 채운다 — 실제 사용자 상황. */
  const graded = asset({
    gbAcqLandPricePerSqm: "",
    pre1990Enabled: true,
    pre1990GradeMode: "number",
    pre1990Grade_current: "100",
    pre1990Grade_prev: "98",
    pre1990Grade_atAcq: "80",
    pre1990PricePerSqm_1990: "1000000",
  } as Partial<AssetForm>);

  it("파생값이 있으면 ⑧이 차단하지 않는다 (거짓 차단 금지)", () => {
    expect(v(graded)).toBeNull();
  });

  it("🔴 파생값이 ② 비교값으로 쓰여 취득가액이 평가액보다 커진다", () => {
    const payload = buildGeneralBuildingValuation(graded, "2026-02-16") as Record<string, unknown>;
    const r = dispatchGeneralBuilding(
      payload, TRANSFER_PRICE, new Date("2023-02-19"), new Date("1988-05-01"),
      0, 0, 2023, 0, [], makeMockRates(),
    );
    const landAcq = r.apportionment.apportioned.find((x) => x.assetKind === "land")
      ?.allocatedAcquisitionPrice;
    // 평가액 50,000,000을 넘어야 한다 — 넘지 못하면 파생이 도달하지 않은 것이다.
    expect(landAcq).toBeGreaterThan(50_000_000);
  });

  it("등급 미입력이면 파생이 없어 ⑧이 차단한다 (검증 공백 없음)", () => {
    const a = asset({ gbAcqLandPricePerSqm: "", pre1990Enabled: true } as Partial<AssetForm>);
    expect(v(a)).toMatch(/취득시 토지 공시지가/);
  });
});
