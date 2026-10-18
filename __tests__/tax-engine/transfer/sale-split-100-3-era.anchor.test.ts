/**
 * Pre-Do anchor — §100③ 양도가액 축의 **시행시기(양도일) 게이트**
 *
 * 계획서: `docs/00-pm/sale-split-100-3-era-gate.plan.md` §1 · §2.2 · §6 Step 1
 * 이 파일은 **구현 전에** 작성돼 현행에서 `none`·`body` 구간 케이스가 실패한다(정책 `feedback_pre_anchor_verification`).
 *
 * ## 조문 (원문 실독 — 계획서 V-1~V-4)
 *
 * | 양도일 | 30% 판정(본문) | 단서(영 §166⑧) |
 * |---|---|---|
 * | ~ 2015-12-31 | 없음 | 없음 |
 * | 2016-01-01 ~ 2024-12-31 | 적용 | 없음 |
 * | 2025-01-01 ~ | 적용 | 적용 |
 *
 * ## 현행 실패 지점 (계획서 §2.2 probe 실측)
 *
 * - 2015-12-31 · 14억/1억: 의제 발동 → 9억/6억 · 241,131,000 (기대: 구분 기재 그대로 · 218,031,000)
 * - 2024-12-31 · 14억/1억 + 예외: 예외 인정 → 14억/1억 · 146,366,000 (기대: 의제 발동 · 187,726,000)
 *
 * 세액은 `makeMockRates` 기준이며 **같은 양도일끼리** 비교한 값이다(mock 세율이 날짜 의존).
 *
 * ## 이 파일이 덮는 것 / 덮지 않는 것
 *
 * - 덮는다: 주택 split(`calculateTransferTax`) · 일반건물 환산(`buildGeneralBuildingAssetCards`) · 일반건물 실가(`calculateGeneralBuildingActualTransfer`)
 * - 덮지 않는다: 증축 경로(`general-building-extension.ts`) — Step 2에서 별도 fixture로 추가
 * - 덮지 않는다: validate·UI(Step 3), 취득가액 축 불변(기존 `dec17-6-acq-contract-split.anchor.test.ts`가 고정)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { buildGeneralBuildingAssetCards, type GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";
import { calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

// ─────────────────────────────────────────────────────────────────────────────
// A. 주택 split — 안분값 토지 9억 / 건물 6억, 구분 기재 14억 / 1억(건물 −83%)
// ─────────────────────────────────────────────────────────────────────────────

const APPORTIONED = { land: 900_000_000, building: 600_000_000 };
const DECLARED = { land: 1_400_000_000, building: 100_000_000 };
const SKEW = { landTransferPrice: DECLARED.land, buildingTransferPrice: DECLARED.building };

const housing = (transferDate: string | Date, over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_500_000_000,
    transferDate: typeof transferDate === "string" ? new Date(transferDate) : transferDate,
    acquisitionDate: new Date("2010-06-01"), // 건물
    landAcquisitionDate: new Date("2008-06-01"),
    acquisitionPrice: 0,
    landAcquisitionPrice: 400_000_000,
    buildingAcquisitionPrice: 400_000_000,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    isSeparateAcquisition: true,
    landStandardPriceAtTransfer: 900_000_000,
    buildingStandardPriceAtTransfer: 600_000_000,
    isOneHousehold: false,
    householdHousingCount: 1,
    isRegulatedArea: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    ...over,
  });

const runHousing = (d: string | Date, over: Partial<TransferTaxInput> = {}) => {
  const r = calculateTransferTax(housing(d, over), rates);
  return {
    tax: r.totalTax,
    land: r.splitDetail!.land.transferPrice,
    building: r.splitDetail!.building.transferPrice,
    judgment: r.splitDetail!.saleSplitJudgment as unknown as
      | { deemedUnclear: boolean; exemptionApplied?: string; era?: string }
      | undefined,
  };
};

describe("E-1 — 양도일 ≤ 2015-12-31: 30% 판정이 없다 (법률 제13558호 부칙 제2조②)", () => {
  it("🔴 구분 기재 14억/1억을 그대로 쓴다 — 의제로 안분값(9억/6억)이 되면 안 된다", () => {
    const r = runHousing("2015-12-31", SKEW);
    expect(r.land).toBe(DECLARED.land);
    expect(r.building).toBe(DECLARED.building);
    expect(r.judgment?.deemedUnclear).toBe(false);
  });

  it("🔴 세액 218,031,000 (현행 241,131,000은 의제 안분 결과)", () => {
    expect(runHousing("2015-12-31", SKEW).tax).toBe(218_031_000);
  });

  it("판정 흔적에 era가 실린다 — 표시 계층이 읽는 값", () => {
    expect(runHousing("2015-12-31", SKEW).judgment?.era).toBe("none");
  });

  it("예외를 입력해도 결과가 같다 — 판정 자체가 없으므로 예외는 무관", () => {
    const withEx = runHousing("2015-12-31", { ...SKEW, saleSplitExemption: "other_law" });
    expect(withEx.tax).toBe(218_031_000);
    expect(withEx.land).toBe(DECLARED.land);
  });
});

describe("E-2 — 2016-01-01 ~ 2024-12-31: 본문만 적용, 단서(예외)는 없다", () => {
  it("2016-01-01(경계 첫날): 의제 발동 — 안분값 9억/6억 · 241,131,000", () => {
    const r = runHousing("2016-01-01", SKEW);
    expect(r.land).toBe(APPORTIONED.land);
    expect(r.building).toBe(APPORTIONED.building);
    expect(r.judgment?.deemedUnclear).toBe(true);
    expect(r.tax).toBe(241_131_000);
  });

  it("🔴 2024-12-31(경계 막날) + other_law: 예외가 **인정되지 않는다** — 의제 발동 · 187,726,000", () => {
    const r = runHousing("2024-12-31", { ...SKEW, saleSplitExemption: "other_law" });
    expect(r.land).toBe(APPORTIONED.land);
    expect(r.building).toBe(APPORTIONED.building);
    expect(r.judgment?.deemedUnclear).toBe(true);
    expect(r.tax).toBe(187_726_000);
  });

  it("🔴 2024-12-31 + demolished_land_only: 같다", () => {
    const r = runHousing("2024-12-31", { ...SKEW, saleSplitExemption: "demolished_land_only" });
    expect(r.judgment?.deemedUnclear).toBe(true);
    expect(r.tax).toBe(187_726_000);
  });

  it("예외를 무시했다는 사실이 판정 흔적에 남는다 — 침묵 후퇴 금지", () => {
    const j = runHousing("2024-12-31", { ...SKEW, saleSplitExemption: "other_law" }).judgment as unknown as {
      era?: string;
      exemptionIgnoredByEra?: string;
      exemptionApplied?: string;
    };
    expect(j.era).toBe("body");
    expect(j.exemptionIgnoredByEra).toBe("other_law");
    expect(j.exemptionApplied).toBeUndefined();
  });

  it("예외 없는 같은 날 입력과 세액이 같다 (예외가 세액에 아무 영향도 못 준다)", () => {
    expect(runHousing("2024-12-31", { ...SKEW, saleSplitExemption: "other_law" }).tax).toBe(
      runHousing("2024-12-31", SKEW).tax,
    );
  });
});

describe("E-3 — 양도일 ≥ 2025-01-01: 본문 + 단서 (현행 유지 — 회귀 0)", () => {
  it("2025-01-01(경계 첫날) + other_law: 예외 인정 — 구분 기재 14억/1억 · 146,366,000", () => {
    const r = runHousing("2025-01-01", { ...SKEW, saleSplitExemption: "other_law" });
    expect(r.land).toBe(DECLARED.land);
    expect(r.judgment?.deemedUnclear).toBe(false);
    expect(r.judgment?.exemptionApplied).toBe("other_law");
    expect(r.judgment?.era).toBe("body_and_proviso");
    expect(r.tax).toBe(146_366_000);
  });

  it("2025-01-01 + 예외 없음: 의제 발동", () => {
    expect(runHousing("2025-01-01", SKEW).judgment?.deemedUnclear).toBe(true);
  });

  // Q-3 결정(2026-10-18): 영 §166⑧ 신설일(2025-02-28) 전 53일 구간도 법 부칙(2025.1.1.) 기준으로 단서를 인정한다.
  // 이 케이스는 그 «현행 유지» 결정을 고정한다 — 이 구간의 처리는 자료 미확보(계획서 V-8)라 바꾸려면 근거부터.
  it("Q-3 현행 유지 — 2025-02-27 · 2025-02-28 모두 예외 인정", () => {
    for (const d of ["2025-02-27", "2025-02-28"]) {
      const r = runHousing(d, { ...SKEW, saleSplitExemption: "other_law" });
      expect(r.judgment?.exemptionApplied, d).toBe("other_law");
    }
  });
});

describe("E-4 — 경계일 직렬화: 문자열과 UTC 자정 Date가 같은 구간으로 읽힌다", () => {
  it("2015-12-31 / 2016-01-01 경계", () => {
    expect(runHousing(new Date("2015-12-31"), SKEW).judgment?.era).toBe("none");
    expect(runHousing(new Date("2016-01-01"), SKEW).judgment?.era).toBe("body");
  });
  it("2024-12-31 / 2025-01-01 경계", () => {
    expect(runHousing(new Date("2024-12-31"), SKEW).judgment?.era).toBe("body");
    expect(runHousing(new Date("2025-01-01"), SKEW).judgment?.era).toBe("body_and_proviso");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. 일반건물 환산 경로 — 안분값 토지 904,725,192 / 건물 20,274,808 (기준시가 비율)
// ─────────────────────────────────────────────────────────────────────────────

const GB_BASE: GeneralBuildingInput = {
  totalTransferPrice: 925_000_000,
  transferDate: new Date("2023-02-19"),
  acquisitionDate: new Date("1999-05-24"),
  landArea: 85,
  buildingArea: 180.96,
  buildingFootprintArea: 90.48,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 2_800_000,
  acquisitionBuildingStdPrice: 28_144_700,
  zoneType: "commercial",
  isMetropolitan: true,
  buildingAcquisitionCause: "purchase",
  buildingAcquisitionDate: new Date("1999-05-24"),
};
const GB_APPORTIONED = { land: 904_725_192, building: 20_274_808 };
const GB_SKEW = { landTransferPrice: 825_000_000, buildingTransferPrice: 100_000_000 };

const gb = (transferDate: string, over: Partial<GeneralBuildingInput> = {}) =>
  buildGeneralBuildingAssetCards({ ...GB_BASE, transferDate: new Date(transferDate), ...over });

describe("G-E — 일반건물 환산 경로", () => {
  it("🔴 2015-12-31: 구분 기재를 그대로 쓴다 (현행은 의제로 안분값)", () => {
    const out = gb("2015-12-31", GB_SKEW);
    expect(out.allocation.land).toBe(825_000_000);
    expect(out.allocation.building).toBe(100_000_000);
  });

  it("2016-01-01: 의제 발동 — 안분값 (현행 유지)", () => {
    const out = gb("2016-01-01", GB_SKEW);
    expect(out.allocation.land).toBe(GB_APPORTIONED.land);
    expect(out.allocation.building).toBe(GB_APPORTIONED.building);
  });

  it("🔴 2024-12-31 + other_law: 예외 무시 — 안분값 (현행은 예외 인정)", () => {
    const out = gb("2024-12-31", { ...GB_SKEW, saleSplitExemption: "other_law" });
    expect(out.allocation.land).toBe(GB_APPORTIONED.land);
    expect(out.allocation.building).toBe(GB_APPORTIONED.building);
  });

  it("2025-01-01 + other_law: 예외 인정 — 구분 기재 (현행 유지)", () => {
    const out = gb("2025-01-01", { ...GB_SKEW, saleSplitExemption: "other_law" });
    expect(out.allocation.land).toBe(825_000_000);
    expect(out.allocation.building).toBe(100_000_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. 일반건물 실가 경로 — 총액 10억, 안분값 토지 7.5억 / 건물 2.5억
// ─────────────────────────────────────────────────────────────────────────────

const ACT_BASE = {
  totalTransferPrice: 1_000_000_000,
  acquisitionDate: new Date("2005-03-01"),
  landArea: 200,
  buildingFootprintArea: 100,
  transferLandPricePerSqm: 3_000_000,
  transferBuildingStdPrice: 200_000_000,
  acquisitionLandPricePerSqm: 1_000_000,
  acquisitionBuildingStdPrice: 100_000_000,
  zoneType: "commercial",
  isMetropolitan: false,
  isUnregistered: false,
  actualAcquisitionPrice: 500_000_000,
  actualExpenses: 0,
};
const ACT_SKEW = { landTransferPrice: 900_000_000, buildingTransferPrice: 100_000_000 };

function actual(transferDate: string, over: Record<string, unknown> = {}) {
  const r = calculateGeneralBuildingActualTransfer(
    { ...ACT_BASE, transferDate: new Date(transferDate), ...over } as never,
    Number(transferDate.slice(0, 4)),
    undefined,
    [],
    rates,
  );
  const d = r.aggregated.generalBuildingValuationDetail as unknown as {
    assetCards: Array<{ propertyId: string; transferPrice: number }>;
  };
  const pick = (k: string) => d.assetCards.find((c) => c.propertyId.includes(k))!.transferPrice;
  return { land: pick("land"), building: pick("building") };
}

describe("A-E — 일반건물 실가 경로", () => {
  it("🔴 2015-12-31: 구분 기재 9억/1억을 그대로 쓴다 (현행은 안분값 7.5억/2.5억)", () => {
    const r = actual("2015-12-31", ACT_SKEW);
    expect(r.land).toBe(900_000_000);
    expect(r.building).toBe(100_000_000);
  });

  it("2016-01-01: 의제 발동 — 안분값 (현행 유지)", () => {
    const r = actual("2016-01-01", ACT_SKEW);
    expect(r.land).toBe(750_000_000);
    expect(r.building).toBe(250_000_000);
  });

  it("🔴 2024-12-31 + other_law: 예외 무시 — 안분값 (현행은 예외 인정)", () => {
    const r = actual("2024-12-31", { ...ACT_SKEW, saleSplitExemption: "other_law" });
    expect(r.land).toBe(750_000_000);
    expect(r.building).toBe(250_000_000);
  });

  it("2025-01-01 + other_law: 예외 인정 (현행 유지)", () => {
    const r = actual("2025-01-01", { ...ACT_SKEW, saleSplitExemption: "other_law" });
    expect(r.land).toBe(900_000_000);
    expect(r.building).toBe(100_000_000);
  });
});
