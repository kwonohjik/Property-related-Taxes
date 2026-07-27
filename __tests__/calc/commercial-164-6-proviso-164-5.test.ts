/**
 * A-P01·A-P03·A-P04·A-P05·A-P07 — §164⑥ 단서(나목 가액 부재 → §164⑤ 준용) 게이트 anchor.
 *
 * 경계는 국세청 「취득당시 건물기준시가 산정기준율표」의 취득연도 축 상한(2000)이다 —
 * 그 표가 1985~2000만 수록하고 `resolveAcqBaseRate()`가 그 위를 잘라낸다.
 *
 * 계획서: docs/01-plan/features/commercial-164-6-proviso-164-5-application.plan.md
 */
import { describe, it, expect } from "vitest";
import {
  isBeforeBuildingStdPriceNotice,
  isSec164_5ProvisoApplicable,
  isSec164_8ProvisoApplicable,
  stdPriceSumAt,
} from "@/lib/calc/commercial-164-6-proviso";
import {
  ACQ_BASE_RATE_MAX_ACQ_YEAR,
  resolveAcqBaseRate,
} from "@/lib/tax-engine/data/building-standard-price";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";

describe("게이트 경계 — 산정기준율표 정의역과 일치해야 한다", () => {
  it("상한 상수가 표의 실제 취득연도 축 상한과 같다", () => {
    expect(ACQ_BASE_RATE_MAX_ACQ_YEAR).toBe(2000);
    // 표가 실제로 2000까지만 응답한다 (I그룹·신축 1990)
    expect(resolveAcqBaseRate("I", 1990, 2000)).toBeDefined();
    expect(resolveAcqBaseRate("I", 1990, 2001)).toBeUndefined();
  });

  it("A-P04 / A-P05: 2000은 발동, 2001은 미발동", () => {
    expect(isBeforeBuildingStdPriceNotice("2000-12-31")).toBe(true);
    expect(isBeforeBuildingStdPriceNotice("2001-01-01")).toBe(false);
  });

  it("A-P01: 2003년 취득은 나목 가액이 있어 단서 미발동", () => {
    expect(isSec164_5ProvisoApplicable("pre_disclosure", "2003-05-10")).toBe(false);
  });

  it("post_disclosure는 §164⑥ 경로가 아니므로 항상 미발동", () => {
    expect(isSec164_5ProvisoApplicable("post_disclosure", "1998-05-10")).toBe(false);
  });

  it("취득일 미입력이면 판정하지 않는다 (임의 발동 금지)", () => {
    expect(isSec164_5ProvisoApplicable("pre_disclosure", "")).toBe(false);
    expect(isSec164_5ProvisoApplicable("pre_disclosure", undefined)).toBe(false);
  });
});

/** 환산(배치 A) — §164⑥ 8필드가 모두 채워진 상태 */
function estimatedAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "commercial_building",
    acquisitionCause: "purchase",
    useEstimatedAcquisition: true,
    cbEra: "pre_disclosure",
    acquisitionDate: "1998-05-10",
    cbExclusiveArea: "36",
    cbSharedArea: "33.52",
    cbLandArea: "12.57",
    cbUnitPriceAtTransfer: "5000000",
    cbUnitPriceAtFirstOrAcq: "3000000",
    cbBuildingStdPriceAtAcq: "69602660",
    cbBuildingStdPriceAtFirst: "69527856",
    cbBuildingStdPriceAtTransfer: "80000000",
    cbLandPricePerSqmAtAcq: "3978096",
    cbLandPricePerSqmAtFirst: "11060632",
    cbLandPricePerSqmAtTransfer: "15000000",
    ...over,
  } as AssetForm;
}

describe("A-P03: 환산 배치 — 확인 없이는 차단", () => {
  it("취득 1998 + 미확인 → §164⑤ 준용 안내로 차단", () => {
    const err = validateAssetAcquisition(estimatedAsset({ cbAcqBuildingStdBy164_5: false }), "자산1");
    expect(err).toContain("§164⑥ 단서");
    expect(err).toContain("§164⑤ 준용");
  });

  it("확인하면 통과한다", () => {
    expect(validateAssetAcquisition(estimatedAsset({ cbAcqBuildingStdBy164_5: true }), "자산1")).toBeNull();
  });

  it("A-P01: 취득 2003은 미확인이어도 통과 — 단서 구간이 아니다", () => {
    const asset = estimatedAsset({
      acquisitionDate: "2003-05-10",
      cbAcqBuildingStdBy164_5: false,
    });
    expect(validateAssetAcquisition(asset, "자산1")).toBeNull();
  });

  it("A-P05: 경계 2001-01-01은 통과", () => {
    const asset = estimatedAsset({
      acquisitionDate: "2001-01-01",
      cbAcqBuildingStdBy164_5: false,
    });
    expect(validateAssetAcquisition(asset, "자산1")).toBeNull();
  });

  it("A-P04: 경계 2000-12-31은 차단", () => {
    const asset = estimatedAsset({
      acquisitionDate: "2000-12-31",
      cbAcqBuildingStdBy164_5: false,
    });
    expect(validateAssetAcquisition(asset, "자산1")).toContain("§164⑤ 준용");
  });
});

/** 상속(배치 B) — §163⑨2호 max 경로. 8필드 opt-in. */
function inheritedAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "commercial_building",
    acquisitionCause: "inheritance",
    useEstimatedAcquisition: false,
    acquisitionDate: "2000-12-07",
    inheritanceStartDate: "2000-12-07",
    decedentAcquisitionDate: "1995-01-01",
    inheritanceAssetKind: "land",
    publishedValueAtInheritance: "100000000",
    cbExclusiveArea: "36",
    cbSharedArea: "33.52",
    cbLandArea: "12.57",
    cbUnitPriceAtFirstOrAcq: "3000000",
    cbLandPricePerSqmAtAcq: "3978096",
    cbLandPricePerSqmAtFirst: "11060632",
    cbBuildingStdPriceAtAcq: "69602660",
    cbBuildingStdPriceAtFirst: "69527856",
    ...over,
  } as AssetForm;
}

describe("A-P07: 상속 배치 — 8필드 opt-in 시에만 확인을 요구한다", () => {
  it("8필드 전부 입력 + 미확인 → 차단", () => {
    const err = validateAssetAcquisition(inheritedAsset({ cbAcqBuildingStdBy164_5: false }), "자산1");
    expect(err).toContain("§164⑤ 준용");
  });

  it("확인하면 통과 (기존 E2E 시드와 동일 조건)", () => {
    expect(validateAssetAcquisition(inheritedAsset({ cbAcqBuildingStdBy164_5: true }), "자산1")).toBeNull();
  });

  it("8필드를 모두 비우면 §164⑥ 미적용이므로 확인을 요구하지 않는다", () => {
    const asset = inheritedAsset({
      cbExclusiveArea: "",
      cbSharedArea: "",
      cbLandArea: "",
      cbUnitPriceAtFirstOrAcq: "",
      cbLandPricePerSqmAtAcq: "",
      cbLandPricePerSqmAtFirst: "",
      cbBuildingStdPriceAtAcq: "",
      cbBuildingStdPriceAtFirst: "",
      cbAcqBuildingStdBy164_5: false,
    });
    expect(validateAssetAcquisition(asset, "자산1")).toBeNull();
  });

  it("상속개시 2003이면 단서 구간이 아니라 미확인도 통과", () => {
    const asset = inheritedAsset({
      acquisitionDate: "2003-06-01",
      inheritanceStartDate: "2003-06-01",
      cbAcqBuildingStdBy164_5: false,
    });
    expect(validateAssetAcquisition(asset, "자산1")).toBeNull();
  });
});

describe("③ normalize — 구 세션 호환", () => {
  it("신규 필드 기본값은 false(미확인)다", () => {
    expect(makeDefaultAsset().cbAcqBuildingStdBy164_5).toBe(false);
  });
});

describe("§164⑥ 괄호 단서 — 폼 조건 판정 + validate 차단 (⑧)", () => {
  /** 두 시점 기준시가합을 같게 맞춘 폼 (개공지·건물기준시가 동일) */
  function sameSumAsset(over: Partial<AssetForm> = {}): AssetForm {
    return estimatedAsset({
      acquisitionDate: "2003-05-10", // §164⑤ 구간 밖 — 이 테스트의 관심사 분리
      cbLandPricePerSqmAtAcq: "1000000",
      cbLandPricePerSqmAtFirst: "1000000",
      cbBuildingStdPriceAtAcq: "120000000",
      cbBuildingStdPriceAtFirst: "120000000",
      cbLandArea: "100",
      ...over,
    });
  }

  it("두 합계액이 같으면 조건이 성립한다 (엔진과 동일한 floor 위치)", () => {
    expect(isSec164_8ProvisoApplicable(sameSumAsset())).toBe(true);
    expect(stdPriceSumAt(sameSumAsset(), "acq")).toBe(220_000_000);
  });

  it("합계액이 다르면 성립하지 않는다", () => {
    expect(
      isSec164_8ProvisoApplicable(sameSumAsset({ cbBuildingStdPriceAtFirst: "150000000" })),
    ).toBe(false);
  });

  it("post_disclosure는 대상이 아니다", () => {
    expect(isSec164_8ProvisoApplicable(sameSumAsset({ cbEra: "post_disclosure" }))).toBe(false);
  });

  it("조건 성립 + B 미입력 → validate 차단", () => {
    const err = validateAssetAcquisition(sameSumAsset({ cbPrevStdPriceSum: "" }), "자산1");
    expect(err).toContain("§164⑧");
    expect(err).toContain("전기");
  });

  it("B를 입력하면 통과한다", () => {
    expect(
      validateAssetAcquisition(sameSumAsset({ cbPrevStdPriceSum: "200000000" }), "자산1"),
    ).toBeNull();
  });

  it("조건 미성립이면 B 없이도 통과한다 (회귀)", () => {
    const asset = sameSumAsset({ cbBuildingStdPriceAtFirst: "150000000", cbPrevStdPriceSum: "" });
    expect(validateAssetAcquisition(asset, "자산1")).toBeNull();
  });
});
