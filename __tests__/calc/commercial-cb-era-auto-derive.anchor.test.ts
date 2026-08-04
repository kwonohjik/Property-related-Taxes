/**
 * cbEra 자동 판정 anchor — 「호별고시 취득 시점 구분」은 취득일에서 파생한다.
 *
 * 경계는 국세청 상업용건물·오피스텔 호별 기준시가 **최초 고시일 2005-01-01**로,
 * 엔진(`transfer-tax-commercial-step.ts` COMMERCIAL_FIRST_DISCLOSURE_DATE)·
 * 상속 상가 §163⑨2호(`transfer-tax-api-inheritance.ts`)가 쓰는 값과 같다.
 *
 * 계약: UI 표시·API 변환·validate가 **같은 `resolveCbEra`**를 쓴다(3중 패턴).
 * 사용자의 명시 선택(`asset.cbEra`)은 파생을 덮어쓴다 — 호별 고시 대상이 아닌 물건은
 * 취득이 2005년 이후여도 §164⑥ 경로가 필요하기 때문이다.
 */
import { describe, it, expect } from "vitest";
import {
  deriveCbEra,
  resolveCbEra,
  isCbEraAutoDerived,
  COMMERCIAL_FIRST_DISCLOSURE_DATE,
} from "@/lib/calc/commercial-cb-era";
import { isSec164_8ProvisoApplicable } from "@/lib/calc/commercial-164-6-proviso";
import { buildCommercialBuildingValuation } from "@/lib/calc/transfer-tax-api-helpers";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

describe("deriveCbEra — 2005-01-01 경계", () => {
  it("최초 고시일 상수가 2005-01-01이다", () => {
    expect(COMMERCIAL_FIRST_DISCLOSURE_DATE).toBe("2005-01-01");
  });

  it("2004-12-31 취득 → pre_disclosure", () => {
    expect(deriveCbEra("2004-12-31")).toBe("pre_disclosure");
  });

  it("2005-01-01 취득 → post_disclosure (경계 당일은 고시 후)", () => {
    expect(deriveCbEra("2005-01-01")).toBe("post_disclosure");
  });

  it("취득일 미입력·미완성이면 판정하지 않는다", () => {
    expect(deriveCbEra("")).toBe("");
    expect(deriveCbEra(undefined)).toBe("");
    expect(deriveCbEra("2005-01")).toBe("");
  });
});

describe("resolveCbEra — 명시 선택 우선", () => {
  it("사용자가 고른 값이 취득일 파생을 덮어쓴다 (고시 대상 아닌 물건)", () => {
    expect(
      resolveCbEra({ cbEra: "pre_disclosure", acquisitionDate: "2010-03-01" }),
    ).toBe("pre_disclosure");
  });

  it("선택이 없으면 취득일에서 파생한다", () => {
    expect(resolveCbEra({ cbEra: "", acquisitionDate: "2000-12-07" })).toBe(
      "pre_disclosure",
    );
  });

  it("isCbEraAutoDerived — 파생일 때만 true", () => {
    expect(isCbEraAutoDerived({ cbEra: "", acquisitionDate: "2000-12-07" })).toBe(true);
    expect(isCbEraAutoDerived({ cbEra: "pre_disclosure", acquisitionDate: "2000-12-07" })).toBe(false);
    expect(isCbEraAutoDerived({ cbEra: "", acquisitionDate: "" })).toBe(false);
  });
});

/** 환산 배치 — §164⑥ 8필드가 모두 채워진 상태. cbEra는 **비워둔다**(파생 대상). */
function estimatedAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "commercial_building",
    acquisitionCause: "purchase",
    useEstimatedAcquisition: true,
    cbEra: "",
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
    cbAcqBuildingStdBy164_5: true,
    ...over,
  } as AssetForm;
}

describe("validate — cbEra 미선택이어도 취득일로 판정한다", () => {
  it("취득 1998 + cbEra 미선택 → 시점 선택을 요구하지 않고 통과한다", () => {
    expect(validateAssetAcquisition(estimatedAsset(), "자산1")).toBeNull();
  });

  it("취득일이 없으면 취득일 입력을 요구한다 (파생 불가)", () => {
    const err = validateAssetAcquisition(estimatedAsset({ acquisitionDate: "" }), "자산1");
    expect(err).toContain("취득일을 입력하세요");
  });

  it("취득 2010 + cbEra 미선택 → post_disclosure 경로로 검증한다", () => {
    // post 경로는 최초고시(2005) 건물 기준시가·개별공시지가를 요구하지 않는다.
    const asset = estimatedAsset({
      acquisitionDate: "2010-03-01",
      cbBuildingStdPriceAtFirst: "",
      cbLandPricePerSqmAtFirst: "",
    });
    expect(validateAssetAcquisition(asset, "자산1")).toBeNull();
  });
});

describe("API 변환 — 파생 cbEra가 엔진 isPreDisclosure에 도달한다", () => {
  it("취득 1998 + cbEra 미선택 → isPreDisclosure = true", () => {
    const payload = buildCommercialBuildingValuation(estimatedAsset(), "2026-05-01") as
      | { isPreDisclosure: boolean }
      | undefined;
    expect(payload).toBeDefined();
    expect(payload!.isPreDisclosure).toBe(true);
  });

  it("취득 2010 + cbEra 미선택 → isPreDisclosure = false", () => {
    const payload = buildCommercialBuildingValuation(
      estimatedAsset({ acquisitionDate: "2010-03-01" }),
      "2026-05-01",
    ) as { isPreDisclosure: boolean } | undefined;
    expect(payload).toBeDefined();
    expect(payload!.isPreDisclosure).toBe(false);
  });

  it("취득일이 없으면 payload를 만들지 않는다 (엔진 미도달 — validate가 먼저 차단)", () => {
    expect(
      buildCommercialBuildingValuation(estimatedAsset({ acquisitionDate: "" }), "2026-05-01"),
    ).toBeUndefined();
  });
});

describe("§164⑧ 준용 게이트도 파생 cbEra를 쓴다", () => {
  it("cbEra 미선택 + 취득 1998 + 두 시점 기준시가합 동일 → 발동", () => {
    // 취득·최초고시 시점의 토지·건물 기준시가를 같게 맞춘다.
    const asset = estimatedAsset({
      cbLandPricePerSqmAtFirst: "3978096",
      cbBuildingStdPriceAtFirst: "69602660",
    });
    expect(isSec164_8ProvisoApplicable(asset)).toBe(true);
  });

  it("cbEra 미선택 + 취득 2010(post) → 미발동", () => {
    const asset = estimatedAsset({
      acquisitionDate: "2010-03-01",
      cbLandPricePerSqmAtFirst: "3978096",
      cbBuildingStdPriceAtFirst: "69602660",
    });
    expect(isSec164_8ProvisoApplicable(asset)).toBe(false);
  });
});
