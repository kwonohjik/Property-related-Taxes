/**
 * anchor A-5 — 일반건물 분리 취득 validate (P6)
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md` §3.5
 *
 * 고정 계약:
 *   V-1 분리 ON + 파트 취득일 미입력 → 차단
 *   V-3 분리 ON + 증축 → 차단 (증축은 3파트 축)
 *   V-4 분리 ON + 부담부증여 → 차단 (§159 자동 산정)
 *   V-5 취득시 기준시가는 **환산 파트만** 요구 (실가 파트에 요구하면 거짓 차단)
 *   V-6 신축(자가건축) + 건물 취득일 미입력 → **취득가액 산정 방식과 무관하게** 차단
 *   V-7 비-환산 파트의 실지거래가액 미입력 → 엔진이 던지기 전에 차단
 *
 * ⚠️ **UI 통과 ↔ validate 차단 모순 금지** — 마지막 describe가 두 계층의 게이트가 같은
 *    술어를 쓰는지 확인한다(memory `feedback_ui_gate_removes_sole_input_path`).
 */
import { describe, it, expect } from "vitest";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { effectivePartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const LAND = "1999-05-24";
const BUILDING = "2015-03-01";

/** 분리 ON · 두 파트 실가 · 필수값을 모두 채운 통과 기준선 */
function base(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: LAND,
    acquisitionDate: BUILDING,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "120000000",
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "180.96",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbZoneType: "commercial",
    actualSalePrice: "2000000000",
    ...over,
  } as AssetForm;
}

const v = (a: AssetForm) => validateGeneralBuildingAsset(a, "자산1", "2026-02-16");

describe("A-5 — 분리 취득 차단 규칙", () => {
  it("기준선은 통과한다", () => {
    expect(v(base())).toBeNull();
  });

  it("V-1 토지 취득일 미입력 → 차단", () => {
    expect(v(base({ landAcquisitionDate: "" }))).toMatch(/토지 취득일을 입력/);
  });

  it("V-1 건물 취득일 미입력 → 차단", () => {
    expect(v(base({ acquisitionDate: "" }))).toMatch(/건물 취득일을 입력/);
  });

  /**
   * 🔄 **정정(2026-08-08) — V-3 차단을 해제했다.**
   *
   * 종전 사유는 「증축은 3파트 축이라 2분할과 섞이지 않는다」였는데, 실제 갭은 **하나**였다 —
   * 3-way 카드 생성부가 토지 카드에도 `input.acquisitionDate`(= **건물** 취득일)를 써서
   * `landAcquisitionDate`가 계산에 도달하지 않았다.
   *
   * 실측(토지 1995 · 건물 2020 · 2026 양도): 장기보유특별공제 합이 **81,999,999**로
   * 「토지도 2020」인 경우와 정확히 같았다(분리 ON·증축 OFF 대조군 245,587,665).
   * 그 갭을 메웠으므로 차단을 푼다 — 파트별 취득**방식·가액**은 #1137이 이미 처리했다.
   *
   * 이 해제로 **부분 상속·증여 × 증축**이 열린다(V-5가 요구하는 분리 ON과 정면 충돌해
   * 종전에는 dead-end였다).
   *
   * anchor: `__tests__/tax-engine/transfer-tax/gb-extension-part-acq-date.anchor.test.ts`
   * 계획서: `docs/02-design/features/transfer-gb-inheritance-extension-3part.plan.md` §5
   */
  it("🔄 V-3 증축 조합 → 차단하지 않는다 (토지 파트 취득일 반영 완료)", () => {
    expect(v(base({ gbHasExtension: true }))).not.toMatch(/증축.*함께 지원하지 않습니다/);
  });

  it("V-4 부담부증여 조합 → 차단", () => {
    expect(v(base({ transferType: "burdened_gift" }))).toMatch(/부담부증여/);
  });

  it("V-7 실가 파트의 취득가액 미입력 → 차단", () => {
    expect(v(base({ landAcquisitionPrice: "" }))).toMatch(/토지 취득가액을 입력/);
    expect(v(base({ buildingAcquisitionPrice: "" }))).toMatch(/건물 취득가액을 입력/);
  });
});

describe("A-5 V-5 — 취득시 기준시가는 환산 파트만 요구", () => {
  it("두 파트 실가 — 취득시 기준시가를 요구하지 않는다 (거짓 차단 금지)", () => {
    expect(v(base({ gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" }))).toBeNull();
  });

  it("건물만 환산 — 건물 기준시가만 요구한다", () => {
    const mixed = base({
      buildingAcqMode: "estimated",
      buildingAcquisitionPrice: "",
      gbAcqLandPricePerSqm: "",
      gbAcqBuildingValue: "",
    });
    expect(v(mixed)).toMatch(/취득시 건물기준시가/);
    // 건물 기준시가만 채우면 통과 — 토지 공시지가는 계산 어디에도 쓰이지 않는다
    expect(v({ ...mixed, gbAcqBuildingValue: "2814470" } as AssetForm)).toBeNull();
  });

  it("토지만 환산 — 토지 공시지가만 요구한다", () => {
    const mixed = base({
      landAcqMode: "estimated",
      landAcquisitionPrice: "",
      gbAcqLandPricePerSqm: "",
      gbAcqBuildingValue: "",
    });
    expect(v(mixed)).toMatch(/취득시 토지 공시지가/);
    expect(v({ ...mixed, gbAcqLandPricePerSqm: "2800000" } as AssetForm)).toBeNull();
  });
});

describe("A-5 V-6 — 신축 건물 취득일은 산정 방식과 무관", () => {
  it("실거래가 모드 + 신축 + 건물 취득일 미입력 → 차단 (종전에는 통과했다)", () => {
    const a = base({
      hasSeperateLandAcquisitionDate: false,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      gbBuildingAcquisitionCause: "newConstruction",
      acquisitionDate: "",
      landAcquisitionDate: "",
      fixedAcquisitionPrice: "600000000",
    });
    expect(v(a)).toMatch(/신축\(자가건축\)/);
  });
});

/**
 * UI 게이트(`GeneralBuildingBlock`의 취득시 기준시가 섹션)와 validate V-5가 **같은 술어**인지.
 * 어긋나면 「입력 칸이 없는데 차단」이 된다.
 */
describe("A-17 — V-8 자본적지출 귀속 (O-1 해소)", () => {
  /** 혼합 모드 — 토지 실가 + 건물 환산. 기준시가는 환산 파트(건물)만 필요하다. */
  const mixed = (over: Partial<AssetForm> = {}) =>
    base({
      buildingAcqMode: "estimated",
      buildingAcquisitionPrice: "",
      gbAcqBuildingValue: "2814470",
      ...over,
    } as Partial<AssetForm>);

  it("🔴 혼합 모드 + **파트별** 자본적지출은 통과한다 — 종전엔 차단됐다", () => {
    expect(v(mixed({ landDirectExpenses: "30000000" } as Partial<AssetForm>))).toBeNull();
  });

  it("혼합 모드 + **자산 단위** 자본적지출은 파트별 칸으로 안내한다", () => {
    const msg = v(mixed({ capitalExpenditure: "30000000" } as Partial<AssetForm>));
    expect(msg).toMatch(/토지분·건물분 칸에 각각/);
  });

  it("두 파트 모두 실가여도 자산 단위 칸은 쓸 수 없다 — 귀속 파트를 알 수 없다", () => {
    expect(v(base({ capitalExpenditure: "30000000" } as Partial<AssetForm>))).toMatch(
      /토지분·건물분 칸에 각각/,
    );
  });

  it("두 파트 모두 환산이면 자산 단위 칸이 정상 경로다 (회귀 0)", () => {
    const bothEstimated = base({
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: "",
      buildingAcquisitionPrice: "",
      gbAcqLandPricePerSqm: "2800000",
      gbAcqBuildingValue: "2814470",
      capitalExpenditure: "30000000",
    } as Partial<AssetForm>);
    expect(v(bothEstimated)).toBeNull();
  });
});

describe("A-5 — UI 게이트 ↔ validate 정합", () => {
  it("혼합 모드는 UI 술어도 취득시 기준시가 섹션을 연다", () => {
    const mixed = base({ buildingAcqMode: "estimated", buildingAcquisitionPrice: "" });
    // UI: GeneralBuildingBlock.showAcqStdPrice 와 동일 식
    const uiShows =
      effectivePartAcqMode(mixed.landAcqMode, mixed) === "estimated" ||
      effectivePartAcqMode(mixed.buildingAcqMode, mixed) === "estimated" ||
      mixed.gbHasExtension ||
      mixed.transferType === "burdened_gift";
    expect(uiShows).toBe(true);

    // validate: 같은 조건에서 기준시가를 요구한다
    expect(v({ ...mixed, gbAcqBuildingValue: "" } as AssetForm)).toMatch(/취득시 건물기준시가/);
  });

  it("두 파트 실가는 UI도 섹션을 닫고 validate도 요구하지 않는다", () => {
    const both = base({ gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" });
    const uiShows =
      effectivePartAcqMode(both.landAcqMode, both) === "estimated" ||
      effectivePartAcqMode(both.buildingAcqMode, both) === "estimated" ||
      both.gbHasExtension ||
      both.transferType === "burdened_gift";
    expect(uiShows).toBe(false);
    expect(v(both)).toBeNull();
  });
});
