/**
 * anchor: PR-1 — NBL ⑧ 검증 게이트 + lib/calc 배선
 *
 * 근거 리뷰: docs/reviews/nbl-code-review-2026-09.md
 * 배치 계획: docs/00-pm/nbl-review-fix-batching.plan.md §PR-1
 *
 * Pre-Do(TDD): 수정 전 전건 RED. c1~c7 구현 후 GREEN.
 *
 * 각 블록은 리뷰 발견 ID를 그대로 단다 — 회귀 시 어느 결함이 되살아났는지 즉시 알 수 있게.
 */
import { describe, it, expect } from "vitest";

// transfer-tax-schema.ts ⇄ transfer-tax-schema-sub.ts 순환 — main을 먼저 평가해 초기화 순서 확정
import "@/lib/api/transfer-tax-schema";

import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { validateNblDetailedJudgment } from "@/lib/calc/transfer-tax-validate-nbl";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { evaluateUnconditionalExemption } from "@/lib/calc/nbl-unconditional-exemption-status";
import { buildAssetPayload, mergePrimaryBasic } from "@/lib/calc/transfer-tax-api-helpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const TRANSFER = "2024-05-01";

/** 정밀판정 ON + 지목·용도지역까지 채운 「통과해야 정상」인 토지 자산 */
function landAsset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...createDefaultTransferFormData().assets[0],
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-01-01",
    fixedAcquisitionPrice: "300,000,000",
    actualSalePrice: "1,000,000,000",
    acquisitionArea: "1000",
    isNonBusinessLand: true,
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    nblZoneType: "agriculture_forest",
    ...overrides,
  } as AssetForm;
}

// ────────────────────────────────────────────────────────────────────────
// c1 · A3-01 · V9-a · V9-c — ⑧ NBL 검증이 취득원인 조기 return에 가려지지 않는다
// ────────────────────────────────────────────────────────────────────────
describe("[c1] ⑧ NBL 검증은 취득원인 분기보다 앞이다 (A3-01·V9-a·V9-c)", () => {
  /** carryover_gift 필수 입력은 전부 채워 두어 「이월과세 검증 오류」로 조기 종료되지 않게 한다 */
  function carryoverLand(overrides: Partial<AssetForm> = {}): AssetForm {
    return landAsset({
      acquisitionCause: "carryover_gift",
      carryover: {
        giftRegistryDate: "2018-06-01",
        donorAcquisitionDate: "2010-01-01",
        donorAcquisitionPrice: "100,000,000",
        giftTaxAmount: "10,000,000",
        donorCapitalExpenditure: "0",
      },
      ...overrides,
    } as Partial<AssetForm>);
  }

  it("A3-01: carryover_gift 토지에서 지목 미선택이 차단된다", () => {
    const err = validateAssetAcquisition(
      carryoverLand({ nblLandType: "" }),
      "자산1",
      TRANSFER,
    );
    expect(err).toContain("지목");
  });

  it("A3-01: carryover_gift 토지에서 용도지역 미선택이 차단된다", () => {
    const err = validateAssetAcquisition(
      carryoverLand({ nblZoneType: "" }),
      "자산1",
      TRANSFER,
    );
    expect(err).toContain("용도지역");
  });

  it("V9-c: newConstruction 토지에서도 지목 미선택이 차단된다", () => {
    const err = validateAssetAcquisition(
      landAsset({
        acquisitionCause: "newConstruction",
        occupancyApprovalDate: "2014-01-01",
        fixedAcquisitionPrice: "300,000,000",
        nblLandType: "",
      }),
      "자산1",
      TRANSFER,
    );
    expect(err).toContain("지목");
  });

  it("정상 입력은 NBL 사유로 차단되지 않는다 (과차단 방지)", () => {
    const err = validateAssetAcquisition(carryoverLand(), "자산1", TRANSFER);
    expect(err == null || !/지목|용도지역/.test(err)).toBe(true);
  });

  it("토지가 아닌 자산은 영향받지 않는다 (조기 이동 부작용 방지)", () => {
    const housing = landAsset({
      assetKind: "housing",
      nblUseDetailedJudgment: false,
      isNonBusinessLand: false,
    });
    const err = validateAssetAcquisition(housing, "자산1", TRANSFER);
    expect(err == null || !/지목|용도지역/.test(err)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// c2 · A1-01 — 기타토지 재산세 과세 분류 미선택 차단
// ────────────────────────────────────────────────────────────────────────
describe("[c2] 기타토지 재산세 과세 분류 미선택 차단 (A1-01)", () => {
  it("other_land + nblOtherPropertyTaxType 공란이 차단된다", () => {
    const err = validateNblDetailedJudgment(
      landAsset({ nblLandType: "other_land", nblOtherPropertyTaxType: "" }),
      "자산1",
      TRANSFER,
    );
    expect(err).toContain("재산세");
  });

  it("분류를 선택하면 그 사유로는 차단되지 않는다", () => {
    const err = validateNblDetailedJudgment(
      landAsset({ nblLandType: "other_land", nblOtherPropertyTaxType: "separate" }),
      "자산1",
      TRANSFER,
    );
    expect(err == null || !err.includes("재산세")).toBe(true);
  });

  it("other_land 이외 지목에는 요구하지 않는다", () => {
    const err = validateNblDetailedJudgment(
      landAsset({ nblLandType: "farmland", nblOtherPropertyTaxType: "" }),
      "자산1",
      TRANSFER,
    );
    expect(err == null || !err.includes("재산세")).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// c3 · E3-01 · A2-02 — 수도권 여부 "unknown" 차단
// ────────────────────────────────────────────────────────────────────────
describe("[c3] 주택부수토지 수도권 여부 「미확인」 차단 (E3-01·A2-02)", () => {
  function housingSite(metro: "" | "yes" | "no" | "unknown"): AssetForm {
    return landAsset({
      nblLandType: "housing_site",
      nblZoneType: "residential",
      nblHousingFootprint: "100",
      nblIsMetropolitanArea: metro,
    });
  }

  it("🔴 \"unknown\"이 차단된다 — 엔진은 미지정을 수도권(3배·불리)으로 대체한다", () => {
    const err = validateNblDetailedJudgment(housingSite("unknown"), "자산1", TRANSFER);
    expect(err).toContain("수도권");
  });

  it("공란도 계속 차단된다 (기존 동작 보존)", () => {
    const err = validateNblDetailedJudgment(housingSite(""), "자산1", TRANSFER);
    expect(err).toContain("수도권");
  });

  it("yes·no는 통과한다", () => {
    for (const v of ["yes", "no"] as const) {
      const err = validateNblDetailedJudgment(housingSite(v), "자산1", TRANSFER);
      expect(err == null || !err.includes("수도권")).toBe(true);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
// c4 · V2-b · A1-02 — 기간 배열 행 단위 공란 차단
// ────────────────────────────────────────────────────────────────────────
describe("[c4] 기간·이력 배열의 빈 행 차단 (V2-b·A1-02)", () => {
  it("V2-b: 농지 자경기간 행의 종료일 공란이 차단된다", () => {
    const err = validateNblDetailedJudgment(
      landAsset({
        nblBusinessUsePeriods: [
          { startDate: "2014-01-01", endDate: "2019-01-01", usageType: "자경" },
          { startDate: "2019-01-01", endDate: "", usageType: "자경" },
        ],
      }),
      "자산1",
      TRANSFER,
    );
    expect(err).toContain("자경");
  });

  it("V2-b: 목장 축산기간 행의 개시일 공란이 차단된다", () => {
    const err = validateNblDetailedJudgment(
      landAsset({
        nblLandType: "pasture",
        nblPastureLivestockPeriods: [
          { startDate: "", endDate: "2024-01-01", usageType: "축산" },
        ],
      }),
      "자산1",
      TRANSFER,
    );
    expect(err).toContain("축산");
  });

  it("V2-b: 별장 사용기간 행의 종료일 공란이 차단된다", () => {
    const err = validateNblDetailedJudgment(
      landAsset({
        nblLandType: "villa_land",
        nblVillaUsePeriods: [
          { startDate: "2020-01-01", endDate: "", usageType: "별장 사용" },
        ],
      }),
      "자산1",
      TRANSFER,
    );
    expect(err).toContain("별장");
  });

  it("A1-02: 거주 이력 행의 날짜 공란이 차단된다", () => {
    const err = validateNblDetailedJudgment(
      landAsset({
        nblResidenceHistories: [
          {
            sigunguCode: "41830",
            sigunguName: "경기도 양평군",
            startDate: "2014-01-01",
            endDate: "",
            hasResidentRegistration: true,
          },
        ],
      }),
      "자산1",
      TRANSFER,
    );
    expect(err).toContain("거주");
  });

  it("완전한 행만 있으면 통과한다 (과차단 방지)", () => {
    const err = validateNblDetailedJudgment(
      landAsset({
        nblBusinessUsePeriods: [
          { startDate: "2014-01-01", endDate: "2024-01-01", usageType: "자경" },
        ],
        nblResidenceHistories: [
          {
            sigunguCode: "41830",
            sigunguName: "경기도 양평군",
            startDate: "2014-01-01",
            endDate: "2024-01-01",
            hasResidentRegistration: true,
          },
        ],
      }),
      "자산1",
      TRANSFER,
    );
    expect(err).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────
// c5 · V5-b · E1-03 — 편입일 · 정착면적 차단
// ────────────────────────────────────────────────────────────────────────
describe("[c5] 편입일·정착면적 차단 (V5-b·E1-03)", () => {
  it("V5-b: 도시지역(주·상·공) 농지인데 편입일이 비면 차단된다", () => {
    const err = validateNblDetailedJudgment(
      landAsset({ nblZoneType: "residential", nblUrbanIncorporationDate: "" }),
      "자산1",
      TRANSFER,
    );
    expect(err).toContain("편입");
  });

  it("V5-b: 도시지역 밖이면 편입일을 요구하지 않는다", () => {
    const err = validateNblDetailedJudgment(
      landAsset({ nblZoneType: "agriculture_forest", nblUrbanIncorporationDate: "" }),
      "자산1",
      TRANSFER,
    );
    expect(err == null || !err.includes("편입")).toBe(true);
  });

  it("E1-03: 주택부수토지 정착면적 공란이 차단된다", () => {
    const err = validateNblDetailedJudgment(
      landAsset({
        nblLandType: "housing_site",
        nblZoneType: "agriculture_forest",
        nblHousingFootprint: "",
      }),
      "자산1",
      TRANSFER,
    );
    expect(err).toContain("정착면적");
  });
});

// ────────────────────────────────────────────────────────────────────────
// c6 · E5-02 · A3-02 · A1-03 · A2-03 · A3-03 — 무조건 의제 어댑터 단일 소스
// ────────────────────────────────────────────────────────────────────────
describe("[c6] 무조건 의제 어댑터가 서버 매퍼와 같은 소스를 읽는다 (E5-02·A3-02·A1-03)", () => {
  it("A3-02: 이월과세 증여자 취득일(carryover 중첩)로 §168의14③3호나목 의제가 성립한다", () => {
    // 고시일 2019-01-01, 증여자 취득일 2010-01-01 → 5년 이전 취득 → 나목 성립.
    // 평면 donorAcquisitionDate는 비어 있고 carryover에만 있다(정상 경로).
    const asset = landAsset({
      acquisitionCause: "carryover_gift",
      acquisitionDate: "2018-06-01",
      carryover: {
        giftRegistryDate: "2018-06-01",
        donorAcquisitionDate: "2010-01-01",
        donorAcquisitionPrice: "100,000,000",
        giftTaxAmount: "10,000,000",
        donorCapitalExpenditure: "0",
      },
      nblExemptPublicExpropriation: true,
      nblExemptPublicNoticeDate: "2019-01-01",
    } as Partial<AssetForm>);
    expect(evaluateUnconditionalExemption(asset, TRANSFER).isExempt).toBe(true);
  });

  it("A1-03: 양도원인 공익수용 단독으로도 어댑터가 의제를 인식한다 (서버 매퍼와 동일 트리거)", () => {
    const asset = landAsset({
      transferCause: "public_expropriation",
      expropriationNoticeDate: "2004-04-23", // ≤ 2006.12.31 → 가목 성립
      nblExemptPublicExpropriation: false, // 섹션 토글은 OFF
    } as Partial<AssetForm>);
    expect(evaluateUnconditionalExemption(asset, TRANSFER).isExempt).toBe(true);
  });

  it("A1-03: 그 경우 ④ raw 빌더도 지목 없이 페이로드를 만든다 (게이트 일치)", () => {
    const asset = landAsset({
      transferCause: "public_expropriation",
      expropriationNoticeDate: "2004-04-23",
      nblExemptPublicExpropriation: false,
      nblLandType: "",
      nblZoneType: "",
    } as Partial<AssetForm>);
    expect(buildNonBusinessLandRaw(asset, TRANSFER)).toBeDefined();
  });

  it("요건 미달이면 의제가 성립하지 않는다 (과대 인정 방지)", () => {
    const asset = landAsset({
      acquisitionCause: "carryover_gift",
      acquisitionDate: "2018-06-01",
      carryover: {
        giftRegistryDate: "2018-06-01",
        donorAcquisitionDate: "2017-01-01", // 고시일 5년 이내 취득 → 나목 불성립
        donorAcquisitionPrice: "100,000,000",
        giftTaxAmount: "10,000,000",
        donorCapitalExpenditure: "0",
      },
      nblExemptPublicExpropriation: true,
      nblExemptPublicNoticeDate: "2019-01-01",
    } as Partial<AssetForm>);
    expect(evaluateUnconditionalExemption(asset, TRANSFER).isExempt).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// c7 · V10-a · V10-f — 컴패니언 NBL 중과 배선
// ────────────────────────────────────────────────────────────────────────
describe("[c7] 컴패니언 자산의 NBL 중과가 ⑬에 실린다 (V10-a·V10-f)", () => {
  it("V10-a: buildAssetPayload가 isNonBusinessLand를 싣는다", () => {
    const payload = buildAssetPayload(
      landAsset({ isNonBusinessLand: true }),
      "actual",
      TRANSFER,
    ) as Record<string, unknown>;
    expect(payload.isNonBusinessLand).toBe(true);
  });

  it("V10-a: 토지가 아니면 싣지 않는다 (assetKind 게이트 — 단건과 3중 패턴 일치)", () => {
    const payload = buildAssetPayload(
      landAsset({ assetKind: "housing", isNonBusinessLand: true }),
      "actual",
      TRANSFER,
    ) as Record<string, unknown>;
    expect(payload.isNonBusinessLand).toBeFalsy();
  });

  it("V10-f: mergePrimaryBasic이 isNonBusinessLand를 승계한다 (같은 필지의 지분 카드)", () => {
    const primary = landAsset({ isNonBusinessLand: true });
    const companion = landAsset({ isNonBusinessLand: false });
    expect(mergePrimaryBasic(companion, primary).isNonBusinessLand).toBe(true);
  });
});
