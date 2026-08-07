/**
 * 일반건물 **상속·증여 × 증축**(3파트) — §163⑨ 평가액이 증축 경로에서도 살아남는다.
 *
 * ## 종전 실측 (2026-08-07, Pre-Do)
 *
 * 2005-05-01 상속 · 상속개시일 평가액 토지 5억·건물 3억 · 양도가 16.2억 · 2026-02-16 양도.
 * 증축은 2015-06-01 자가증축, 실가 3억.
 *
 * | | 토지 | 건물1 | 건물2 | 산출세액 |
 * |---|---|---|---|---|
 * | 증축 OFF (대조군) | 500,000,000 | 300,000,000 | — | 204,090,000 |
 * | **증축 ON** | **0** | **0** | 300,000,000 | **313,290,000** |
 *
 * 사용자가 요구받아 입력한 평가액 8억이 통째로 사라졌다. validate가 이 조합을 하드 차단하고
 * 있었으므로 사용자에게 도달하지는 않았다 — **차단은 정당한 방어였다.**
 *
 * ## 원인 — 증축 분기가 `applyPartAcqModes`를 우회한다
 *
 * ```
 * general-building-valuation.ts
 *   :286  if (input.extensionInfo) {
 *   :297      return buildGeneralBuildingAssetCardsWithExtension(...)   ← 여기서 끝
 *         }
 *   :326  const partAcq = applyPartAcqModes(...)                        ← 한 번도 안 온다
 * ```
 *
 * 파트 가격은 **payload에 실려 있었다**(`landAcquisitionPrice`/`buildingAcquisitionPrice` —
 * `partModePayload`는 환산 payload에도 spread된다). 3-way 경로가 읽지 않았을 뿐이다.
 * ⇒ 새 필드가 필요 없다. 2-way와 **같은 함수**를 태우면 된다(dual-truth 회피).
 *
 * ## 법령 — 3파트의 성질이 다르다
 *
 * - 토지·건물1: 「소득세법 시행령」 제163조 제9항 — 상속개시일·증여일 평가액을 「취득당시의
 *   실지거래가액으로 **본다**」. ⇒ 가목(실지거래가액)이므로 개산공제 **미적용**.
 * - 건물2(증축분): §163⑨ **대상 아님**. 별개 취득이다 — `transfer-tax-validate-gb.ts:439`가
 *   증축 취득원인을 「**매매·자가증축** 중」으로만 받는 것이 그 전제다.
 *
 * 개산공제가 파트별로 갈리는 근거는 「소득세법」 제97조 제2항이다 — 제1호(실지거래가액)와
 * 제2호(그 밖의 경우)를 나누고 개산공제(시행령 §163⑥)는 **제2호에만** 붙는다.
 * `applyPartAcqModes`가 그 판정의 단일 정본이다(`part-acq.ts:101` `landMode !== "actual"`).
 *
 * ## 범위 — Phase 1 (둘 다 상속 / 둘 다 증여)
 *
 * **부분** 상속·증여 × 증축은 별건이다 — V-5(부분 상속은 분리 ON 요구)와 V-3(증축 × 분리 ON
 * 차단)이 **정면 충돌**해 dead-end다. 계획서 §5 Phase 2.
 *
 * 설계: `docs/02-design/features/transfer-gb-inheritance-extension-3part.plan.md`
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
const ACQ = "2005-05-01";
const LAND_VALUE = 500_000_000;
const BUILDING_VALUE = 300_000_000;
const EXT_VALUE = 300_000_000;

/** 토지·건물 둘 다 상속(분리 OFF) — Phase 1 범위. */
function inherited(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "inheritance",
    gbBuildingAcquisitionCause: "inheritance",
    hasSeperateLandAcquisitionDate: false,
    landAcquisitionDate: ACQ,
    acquisitionDate: ACQ,
    decedentAcquisitionDate: "1990-01-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    publishedValueAtInheritance: String(LAND_VALUE),
    gbBuildingInheritedValue: String(BUILDING_VALUE),
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

/** 증축 ON — 건물2는 자가증축 실가 3억(§163⑨ 대상 아님). */
function withExtension(over: Partial<AssetForm> = {}): AssetForm {
  return inherited({
    gbHasExtension: true,
    gbExtensionDate: "2015-06-01",
    gbExtensionArea: "80",
    gbExtensionAcquisitionCause: "newConstruction",
    gbExtensionAcquisitionMode: "actual",
    gbExtensionActualAcquisitionPrice: String(EXT_VALUE),
    gbExtensionActualExpenses: "0",
    gbTransferExtensionBuildingStdPrice: "60000000",
    gbAcquisitionExtensionBuildingStdPrice: "40000000",
    ...over,
  } as Partial<AssetForm>);
}

function run(a: AssetForm) {
  const p = buildGeneralBuildingValuation(a, TD) as Record<string, unknown> | undefined;
  if (!p) throw new Error("④ API 변환이 payload를 drop했다");
  /**
   * ⚠️ **`route.ts:366`과 같은 식으로 일괄 취득가를 넘긴다.** 여기에 상수 0을 넣으면
   * 증축 경로가 「조합 A(일괄 실가 안분)에 0이 들어온 상태」가 되어, 매매 대조군이
   * **실제 프로덕션과 다른 분기**를 타게 된다(`feedback_anchor_observes_wrong_stage`).
   */
  const bundled = (p.bundledAcquisitionPrice as number | undefined) ?? 0;
  const r = dispatchGeneralBuilding(
    p, T, new Date(TD), new Date(ACQ), bundled, 0, 2026, 0, [], makeMockRates(),
  );
  const ap = r.apportionment.apportioned;
  const buildings = ap.filter((x) => x.assetKind === "building");
  return {
    land: ap.find((x) => x.assetKind === "land")?.allocatedAcquisitionPrice,
    /** 카드 순서상 첫 건물이 본체(건물1), 두 번째가 증축분(건물2). */
    building1: buildings[0]?.allocatedAcquisitionPrice,
    building2: buildings[1]?.allocatedAcquisitionPrice,
    cardCount: ap.length,
    tax: r.aggregated.calculatedTax,
  };
}

const v = (a: AssetForm) => validateGeneralBuildingAsset(a, "자산1", TD);

describe("E3-1 — 증축 경로에서도 §163⑨ 평가액이 취득가액이다", () => {
  it("🔴 토지 취득가액 = 상속개시일 평가액 (종전 0)", () => {
    expect(run(withExtension()).land).toBe(LAND_VALUE);
  });

  it("🔴 건물1 취득가액 = 상속개시일 평가액 (종전 0)", () => {
    expect(run(withExtension()).building1).toBe(BUILDING_VALUE);
  });

  it("건물2는 자기 취득가액을 유지한다 (§163⑨ 대상 아님 — 회귀 0)", () => {
    expect(run(withExtension()).building2).toBe(EXT_VALUE);
  });

  it("카드는 3장이다 (토지·건물1·건물2)", () => {
    expect(run(withExtension()).cardCount).toBe(3);
  });
});

describe("E3-2 — 증축 토글이 상속 파트의 취득가액을 바꾸지 않는다", () => {
  /**
   * 증축은 **건물2를 더하는** 축이다. 토지·건물1의 §163⑨ 평가액은 증축 유무와 무관하다.
   * 이 단언이 깨지면 3-way 안분이 상속 파트 값을 건드린 것이다.
   */
  it("🔴 토지·건물1 취득가액이 증축 OFF 대조군과 같다", () => {
    const off = run(inherited());
    const on = run(withExtension());
    expect(off.land).toBe(LAND_VALUE);
    expect(off.building1).toBe(BUILDING_VALUE);
    expect(on.land).toBe(off.land);
    expect(on.building1).toBe(off.building1);
  });
});

describe("E3-3 — ⑧ validate가 증축 조합을 허용하되 평가액은 계속 요구한다", () => {
  it("🔴 상속 + 증축 조합이 통과한다 (종전 하드 차단)", () => {
    expect(v(withExtension())).toBeNull();
  });

  it("🔴 증여 + 증축 조합이 통과한다 (종전 하드 차단)", () => {
    const gifted = withExtension({
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "gift",
      donorAcquisitionDate: "1995-01-01",
      publishedValueAtInheritance: "",
      gbBuildingInheritedValue: "",
      fixedAcquisitionPrice: String(LAND_VALUE + BUILDING_VALUE),
    } as Partial<AssetForm>);
    expect(v(gifted)).toBeNull();
  });

  it("평가액을 비우면 여전히 차단한다 — 검증 공백이 생기지 않았다", () => {
    expect(v(withExtension({ publishedValueAtInheritance: "" }))).toMatch(
      /상속개시일 토지 평가액/,
    );
    // 건물 쪽 문구는 「신고가액」이다(토지는 「평가액」) — 기존 메시지를 그대로 단언한다.
    expect(v(withExtension({ gbBuildingInheritedValue: "" }))).toMatch(
      /상속개시일 건물 신고가액/,
    );
  });

  it("상속 파트의 추계는 여전히 차단한다 (V2 — §97①1호 단서)", () => {
    expect(v(withExtension({ landAcqMode: "estimated" }))).toMatch(
      /환산취득가·감정가액·매매사례가액으로 산정할 수 없습니다/,
    );
  });
});

describe("E3-4 — 회귀 0", () => {
  it("증축 OFF 상속은 종전 값 불변", () => {
    const r = run(inherited());
    expect(r.land).toBe(LAND_VALUE);
    expect(r.building1).toBe(BUILDING_VALUE);
    expect(r.cardCount).toBe(2);
    expect(r.tax).toBe(204_090_000);
  });

  /**
   * 매매 + 증축은 **일괄 취득가(조합 A)** 경로다 — 토지·건물1을 취득시 기준시가 비율로
   * 안분한다. 상속 파트가 없으므로 `applyPartAcqModes`는 두 파트 모두 `estimated`로 보고
   * 입력을 그대로 돌려줘야 한다(`part-acq.ts:80~88` 조기 반환). 회귀 0의 핵심 대조군.
   */
  /**
   * 🔄 **픽스처 정정(2026-08-08)** — 종전에는 `landAcqMode`/`buildingAcqMode`를 명시적으로
   * `"estimated"`로 두고 **동시에** 일괄 실가를 넣었다. 「환산이라면서 일괄 실가를 넣은」
   * 모순 입력이라 validate가 만들어 낼 수 없는 상태였고, 조합 A의 회귀 가드로도 부정확했다.
   *
   * 분리 OFF에서는 `effectivePartAcqMode`가 `useEstimatedAcquisition`(false)에서 "actual"을
   * 파생한다 — 모드를 명시하지 않는 것이 실제 조합 A다. 값(796,096,533 / 3,903,467)은 그대로다.
   *
   * ⚠️ 종전 픽스처는 Phase 2 이후 **다른 값**을 낸다(669,246,886) — 환산 파트가 이제
   *    §176의2② 산식을 쓰기 때문이다. 그 동작은
   *    `gb-extension-part-acq-date.anchor.test.ts`가 따로 잠근다.
   */
  it("비-상속(매매) + 증축은 종전 경로 그대로 — 일괄 취득가 기준시가 안분 (조합 A)", () => {
    const purchase = withExtension({
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase",
      publishedValueAtInheritance: "",
      gbBuildingInheritedValue: "",
      fixedAcquisitionPrice: String(LAND_VALUE + BUILDING_VALUE),
    } as Partial<AssetForm>);
    const r = run(purchase);
    expect(r.cardCount).toBe(3);
    // 8억을 취득시 기준시가 비율(토지 574,000,000 : 건물1 2,814,470)로 안분한 값.
    expect(r.land).toBe(796_096_533);
    expect(r.building1).toBe(3_903_467);
    expect(r.building2).toBe(EXT_VALUE);
  });
});
