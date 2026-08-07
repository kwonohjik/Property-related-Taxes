/**
 * 일반건물 **증여** — 미공시 시기 §164 max (「소득세법 시행령」 제163조 제9항 제1호·제2호).
 *
 * ## 조문은 상속과 **같은 문장**이다
 *
 * §163⑨ 본문은 「**상속 또는 증여**받은 자산」을 대상으로 하고, 단서 1호·2호도 각각
 * 「상속 또는 **증여**받은 토지/건물」이라고 쓴다. ⇒ 증여도 같은 max를 받는다.
 *
 * ## 종전 (Pre-Do 실측 2026-08-07)
 *
 * 증여일 1988-05-01 · 분리 ON · 신고가액(5천만·2천만) < §164 가액(2.05억·1.5억):
 *
 * | | 취득가액 | 산출세액 |
 * |---|---|---|
 * | 종전 | 70,000,000 | **421,185,000** |
 * | max 적용 | 355,000,000 | **334,920,000** |
 * | | | **86,265,000원 과대** |
 *
 * ⚠️ 분리 **OFF**는 결함이 아니었다 — 자산 단위 신고가액이 §166⑥으로 정상 안분된다
 *    (40,422,535 / 29,577,465). 처음 probe가 `actualAcquisitionPrice`를 0으로 넘겨
 *    「취득가액 0」으로 보였을 뿐이다(`feedback_anchor_observes_wrong_stage`).
 *
 * ## ①의 소스가 상속과 다르다
 *
 * 상속은 전용 필드(`publishedValueAtInheritance`·`gbBuildingInheritedValue`)가 있지만,
 * 증여 신고가액은 **분리 ON이면 파트 칸**, **분리 OFF면 자산 단위 칸**으로 들어온다.
 * 그래서 파트별 비교(조문이 요구하는 「자산별」)가 성립하려면 **분리 ON이 전제**다 —
 * 분리 OFF + 게이트 안은 ⑧이 안내로 차단한다.
 *
 * 설계: `docs/02-design/features/transfer-gb-inheritance-164-max-phase3.plan.md` §7(증여 별건)
 */
import { describe, it, expect } from "vitest";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const TRANSFER_PRICE = 1_620_000_000;
const SEC164_LAND_TOTAL = 205_000_000; // 1,000,000 × 205㎡
const SEC164_BUILDING = 150_000_000;

/** 증여일 1988 — post-1985(기존 §163⑨ 증여 게이트 안) · 토지·건물 §164 게이트 모두 안 */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "gift",
    gbBuildingAcquisitionCause: "gift",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "1988-05-01",
    acquisitionDate: "1988-05-01",
    donorAcquisitionDate: "1970-01-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    // ① 증여 신고가액 — 분리 ON이면 파트 칸이 정본(#1130)
    landAcquisitionPrice: "50000000",
    buildingAcquisitionPrice: "20000000",
    fixedAcquisitionPrice: "",
    // ② 취득시 기준시가
    gbAcqLandPricePerSqm: "1000000",
    gbAcqBuildingValue: String(SEC164_BUILDING),
    gbLandArea: "205",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "135",
    gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "5514000",
    gbTransferBuildingValue: "259072400",
    transferPrice: String(TRANSFER_PRICE),
    actualSalePrice: String(TRANSFER_PRICE),
    ...over,
  } as AssetForm;
}

function run(a: AssetForm, actualAcq = 0) {
  const p = buildGeneralBuildingValuation(a, "2026-02-16") as Record<string, unknown> | undefined;
  if (!p) throw new Error("API 변환이 payload를 drop했다 (④ 침묵 strip)");
  const r = dispatchGeneralBuilding(
    p, TRANSFER_PRICE, new Date("2026-02-16"), new Date("1988-05-01"),
    actualAcq, 0, 2026, 0, [], makeMockRates(),
  );
  const ap = r.apportionment.apportioned;
  return {
    landAcq: ap.find((x) => x.assetKind === "land")?.allocatedAcquisitionPrice,
    buildingAcq: ap.find((x) => x.assetKind === "building")?.allocatedAcquisitionPrice,
    calculatedTax: r.aggregated.calculatedTax,
  };
}
const v = (a: AssetForm) => validateGeneralBuildingAsset(a, "자산1", "2026-02-16");

describe("G164-1 — 증여도 §163⑨1호·2호 max를 받는다", () => {
  it("🔴 토지: 신고가액 < §164④ → §164④ 가액", () => {
    expect(run(asset()).landAcq).toBe(SEC164_LAND_TOTAL);
  });

  it("🔴 건물: 신고가액 < §164⑤ → §164⑤ 가액", () => {
    expect(run(asset()).buildingAcq).toBe(SEC164_BUILDING);
  });

  it("🔴 세액 421,185,000 → 334,920,000", () => {
    expect(run(asset()).calculatedTax).toBe(334_920_000);
  });

  it("신고가액 > §164 → 신고가액 유지 (max이지 대체가 아니다)", () => {
    const r = run(asset({ landAcquisitionPrice: "900000000" }));
    expect(r.landAcq).toBe(900_000_000);
  });
});

describe("G164-2 — 게이트 밖은 적용하지 않는다 (회귀 0)", () => {
  it("2005년 증여 — 둘 다 신고가액 그대로", () => {
    const r = run(asset({ landAcquisitionDate: "2005-05-01", acquisitionDate: "2005-05-01" }));
    expect(r.landAcq).toBe(50_000_000);
    expect(r.buildingAcq).toBe(20_000_000);
  });

  it("🔑 1995년 증여 — 토지는 밖 · 건물만 안 (경계가 파트마다 다르다)", () => {
    const r = run(asset({ landAcquisitionDate: "1995-05-01", acquisitionDate: "1995-05-01" }));
    expect(r.landAcq).toBe(50_000_000);
    expect(r.buildingAcq).toBe(SEC164_BUILDING);
  });

  /**
   * pre-1985 증여는 §176의2④ 의제취득 영역이라 기존 §163⑨ 증여 게이트가 **꺼진다**.
   * 이 PR은 그 경계를 건드리지 않는다 — 켜면 환산 fallback 경로가 함께 바뀐다(별건).
   */
  it("pre-1985 증여 — 기존 게이트 밖이라 불변", () => {
    const r = run(asset({ landAcquisitionDate: "1980-03-01", acquisitionDate: "1980-03-01" }));
    expect(r.landAcq).toBe(50_000_000);
  });
});

describe("G164-3 — ⑧ 게이트가 켜지면 ② 비교값을 요구한다", () => {
  it("🔴 취득시 토지 공시지가 미입력 차단", () => {
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
});

describe("G164-4 — 분리 OFF + 게이트 안은 파트별 비교가 불가하므로 안내한다", () => {
  const offAsset = (over: Partial<AssetForm> = {}) =>
    asset({
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionPrice: "",
      buildingAcquisitionPrice: "",
      fixedAcquisitionPrice: "70000000",
      ...over,
    } as Partial<AssetForm>);

  it("🔴 차단 — 조문이 「자산별」 비교를 요구한다", () => {
    expect(v(offAsset())).toMatch(/파트별로 나누어 입력하세요/);
  });

  it("게이트 밖(2005년 증여)이면 분리 OFF가 종전대로 통과한다 (회귀 0)", () => {
    const a = offAsset({ landAcquisitionDate: "2005-05-01", acquisitionDate: "2005-05-01" });
    expect(v(a)).toBeNull();
  });

  it("게이트 밖 + 분리 OFF는 §166⑥ 안분이 그대로다 (결함 아님 — Pre-Do 정정)", () => {
    const a = offAsset({ landAcquisitionDate: "2005-05-01", acquisitionDate: "2005-05-01" });
    const r = run(a, 70_000_000);
    expect((r.landAcq ?? 0) + (r.buildingAcq ?? 0)).toBe(70_000_000);
  });
});
