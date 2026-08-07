/**
 * 일반건물 증축(3-way) — **토지 파트 취득일**이 토지 카드에 도달한다 (Phase 2).
 *
 * 계획서: `docs/02-design/features/transfer-gb-inheritance-extension-3part.plan.md` §5 Phase 2
 *
 * ## 종전 실측 (2026-08-08, Pre-Do)
 *
 * 분리 ON(토지 1995-05-01 · 건물 2020-05-01) · 양도 2026-02-16 · 양도가 16.2억:
 *
 * | | 토지 취득일 | 장기보유특별공제 합 |
 * |---|---|---|
 * | 증축 OFF | 1995 | 245,587,665 |
 * | **증축 ON** | 1995 (payload에 실림) | **81,999,999** |
 * | 증축 OFF · 토지도 2020 | 2020 | **81,999,999** |
 *
 * 증축 ON의 값이 「토지도 2020」과 **정확히 일치**했다 ⇒ 3-way가 `landAcquisitionDate`를
 * 무시하고 **건물 취득일을 토지에도** 쓴 것이다. 토지의 31년 보유가 6년으로 계산됐다.
 *
 * ## 원인 — #1137의 파트 가액과 같은 모양
 *
 * payload는 값을 싣고 있었다(`route-helper.ts:127` — `coercedGbRaw`에 `Date`로 들어간다).
 * 3-way 카드 생성부가 세 군데 모두 `input.acquisitionDate`를 그대로 썼을 뿐이다.
 * 2-way는 처음부터 `input.landAcquisitionDate ?? input.acquisitionDate`였다
 * (`general-building-valuation.ts:379`).
 *
 * ⚠️ `input.acquisitionDate`는 **건물** 취득일이다 — `general-building-route-actual.ts:73`이
 *    그 규약을 적어 두었다. 분리 OFF에서는 두 날짜가 같아 증상이 드러나지 않았다.
 *
 * ## 이것이 V-3 차단의 실체였다
 *
 * validate V-3은 「증축(건물2)과 「토지·건물 취득일 다름」은 함께 지원하지 않습니다」로 막고
 * 있었고, 사유를 「3파트 축이라 2분할과 섞이지 않는다」로 적었다. 실제 갭은 **토지 취득일
 * 미반영** 하나였다(파트별 취득방식·가액은 #1137의 Step 2.5가 이미 해결했다).
 *
 * 「소득세법」 제95조 제4항: 「보유기간은 **그 자산의 취득일**부터 양도일까지로 한다」 —
 * 토지와 건물은 각자의 취득일을 쓴다(§166⑥ 별개취득).
 */
import { describe, it, expect } from "vitest";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const T = 1_620_000_000;
const TD = "2026-02-16";

/** 분리 ON — 토지 1995(31년) · 건물 2020(6년). 장특공제가 크게 갈리는 조합. */
function separate(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "1995-05-01",
    acquisitionDate: "2020-05-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "500000000",
    buildingAcquisitionPrice: "300000000",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "2814470",
    gbLandArea: "205",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "135",
    gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "5514000",
    gbTransferBuildingValue: "259072400",
    transferPrice: String(T),
    actualSalePrice: String(T),
    ...over,
  } as AssetForm;
}

/** 증축 ON — 건물2는 2022 자가증축 실가 3억. */
const EXTENSION: Partial<AssetForm> = {
  gbHasExtension: true,
  gbExtensionDate: "2022-06-01",
  gbExtensionArea: "80",
  gbExtensionAcquisitionCause: "newConstruction",
  gbExtensionAcquisitionMode: "actual",
  gbExtensionActualAcquisitionPrice: "300000000",
  gbExtensionActualExpenses: "0",
  gbTransferExtensionBuildingStdPrice: "60000000",
  gbAcquisitionExtensionBuildingStdPrice: "40000000",
} as Partial<AssetForm>;

function run(a: AssetForm) {
  const p = buildGeneralBuildingValuation(a, TD) as Record<string, unknown> | undefined;
  if (!p) throw new Error("④ API 변환이 payload를 drop했다");
  const bundled = (p.bundledAcquisitionPrice as number | undefined) ?? 0;
  const r = dispatchGeneralBuilding(
    p, T, new Date(TD), new Date(a.acquisitionDate!), bundled, 0, 2026, 0, [], makeMockRates(),
  );
  const ap = r.apportionment.apportioned;
  const buildings = ap.filter((x) => x.assetKind === "building");
  return {
    land: ap.find((x) => x.assetKind === "land")?.allocatedAcquisitionPrice,
    building1: buildings[0]?.allocatedAcquisitionPrice,
    building2: buildings[1]?.allocatedAcquisitionPrice,
    cardCount: ap.length,
    ltd: r.aggregated.totalLongTermHoldingDeduction,
    tax: r.aggregated.calculatedTax,
  };
}

const v = (a: AssetForm) => validateGeneralBuildingAsset(a, "자산1", TD);

describe("P2-1 — 3-way도 토지 파트 취득일을 쓴다", () => {
  /**
   * 관측 지점은 **장기보유특별공제**다 — 취득일이 카드에 도달했는지를 세액 파이프라인 끝에서
   * 본다. 카드의 `acquisitionDate`를 직접 들여다보면 「중간값은 맞는데 세액은 틀린」 경우를
   * 놓친다(`feedback_anchor_observes_wrong_stage`).
   */
  it("🔴 토지 1995와 토지 2020이 다른 값을 낸다 (종전에는 같았다)", () => {
    const old = run(separate(EXTENSION));
    const young = run(separate({ ...EXTENSION, landAcquisitionDate: "2020-05-01" }));
    expect(old.ltd).not.toBe(young.ltd);
    expect(old.ltd).toBeGreaterThan(young.ltd);
  });

  it("🔴 증축 ON의 장특공제가 「토지도 2020」 값(81,999,999)과 달라진다", () => {
    expect(run(separate(EXTENSION)).ltd).not.toBe(81_999_999);
  });

  it("증축 OFF 대조군은 종전 그대로 (실가 경로 — 회귀 0)", () => {
    expect(run(separate()).ltd).toBe(245_587_665);
  });
});

describe("P2-2 — ⑧ validate가 분리 ON × 증축을 허용한다", () => {
  it("🔴 분리 ON + 증축 조합이 통과한다 (종전 V-3 하드 차단)", () => {
    expect(v(separate(EXTENSION))).toBeNull();
  });

  it("🔴 부분 상속(토지만) + 증축이 통과한다 — Phase 2의 목표 조합", () => {
    const partial = separate({
      ...EXTENSION,
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: "1990-01-01",
      publishedValueAtInheritance: "500000000",
    } as Partial<AssetForm>);
    expect(v(partial)).toBeNull();
  });

  it("부분 상속 + 분리 OFF는 계속 막는다 (V-5 불변 — 이중계상 방지)", () => {
    const off = separate({
      acquisitionCause: "inheritance",
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "2020-05-01",
      decedentAcquisitionDate: "1990-01-01",
      publishedValueAtInheritance: "500000000",
    } as Partial<AssetForm>);
    expect(v(off)).toMatch(/한쪽만 상속으로 취득했다면/);
  });

  it("부담부증여 × 분리 ON은 계속 막는다 (V-4 불변)", () => {
    const bg = separate({ transferType: "burdened_gift" } as Partial<AssetForm>);
    expect(v(bg)).toMatch(/부담부증여/);
  });
});

describe("P2-3 — 부분 상속 × 증축이 계산까지 간다", () => {
  it("🔴 토지는 상속 평가액, 건물1은 실지거래가액, 건물2는 증축 실가", () => {
    const partial = separate({
      ...EXTENSION,
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: "1990-01-01",
      publishedValueAtInheritance: "500000000",
    } as Partial<AssetForm>);
    const r = run(partial);
    expect(r.cardCount).toBe(3);
    expect(r.land).toBe(500_000_000);
    expect(r.building1).toBe(300_000_000);
    expect(r.building2).toBe(300_000_000);
  });
});

describe("P2-4 — 회귀 0", () => {
  it("분리 OFF + 증축은 종전 그대로 (두 날짜가 같으므로 값이 움직이면 안 된다)", () => {
    const off = separate({
      ...EXTENSION,
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "2020-05-01",
    } as Partial<AssetForm>);
    const r = run(off);
    expect(r.cardCount).toBe(3);
    expect(r.ltd).toBe(81_999_999);
  });

  /**
   * 분리 OFF · 실가 · 증축 = **조합 A**(일괄 취득가를 취득시 기준시가 비율로 안분).
   *
   * ⚠️ 파트 모드를 명시하지 않는다 — 분리 OFF에서는 `effectivePartAcqMode`가
   *    `useEstimatedAcquisition`(false)에서 "actual"을 파생한다. 여기에 `landAcqMode:
   *    "estimated"`를 억지로 끼우면 「환산이라면서 일괄 실가를 넣은」 **모순 입력**이 되어
   *    validate가 만들어 낼 수 없는 상태를 잠그게 된다.
   */
  it("매매 + 증축 일괄 취득가는 기준시가 안분 그대로 (조합 A)", () => {
    const bundled = separate({
      ...EXTENSION,
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "2020-05-01",
      landAcquisitionPrice: "",
      buildingAcquisitionPrice: "",
      fixedAcquisitionPrice: "800000000",
    } as Partial<AssetForm>);
    const r = run(bundled);
    expect(r.land).toBe(796_096_533);
    expect(r.building1).toBe(3_903_467);
    expect(r.building2).toBe(300_000_000);
  });

  /**
   * 🔴 **환산 파트는 이제 0이 아니다** — 이 세 값이 이 PR의 본체다.
   * 종전에는 `route-helper`가 `actualBundledAcquisitionPrice`를 항상 주입해 조합 C/D에
   * 도달하지 못했고, 환산 파트가 일괄 안분값(=0)을 그대로 받았다.
   */
  it("🔴 분리 OFF + 증축 + 환산 모드(일괄칸 비움)에서 취득가액이 0이 아니다", () => {
    const converted = separate({
      ...EXTENSION,
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "2020-05-01",
      useEstimatedAcquisition: true,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: "",
      buildingAcquisitionPrice: "",
      fixedAcquisitionPrice: "",
    } as Partial<AssetForm>);
    const r = run(converted);
    expect(r.land).toBe(669_246_886);
    expect(r.building1).toBe(3_281_490);
    expect(r.building2).toBe(300_000_000);
  });

  /**
   * 혼합 모드의 환산 파트가 **증축 OFF 대조군과 같은 값**을 낸다 — 강한 교차검증이다.
   * 증축은 건물2를 더하는 축이므로 건물1의 환산취득가는 증축 유무와 무관해야 한다.
   */
  it("🔴 혼합(토지 실가 + 건물1 환산)의 건물1이 증축 OFF 대조군과 같다", () => {
    const withExt = run(
      separate({ ...EXTENSION, buildingAcqMode: "estimated", buildingAcquisitionPrice: "" } as Partial<AssetForm>),
    );
    const withoutExt = run(
      separate({ buildingAcqMode: "estimated", buildingAcquisitionPrice: "" } as Partial<AssetForm>),
    );
    expect(withExt.building1).toBe(3_281_490);
    expect(withExt.building1).toBe(withoutExt.building1);
    expect(withExt.ltd).toBe(withoutExt.ltd);
  });
});
