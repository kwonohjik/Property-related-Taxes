/**
 * anchor — 일반건물 «감정평가» 안분 모드 선택 후 금액 미입력(V8-b) ⑧ 누락 (V-1~V-11).
 *
 * ## 결함
 *
 * 일반건물 양도 정보에서 안분 방식을 «감정평가»로 골라 놓고 토지·건물 감정평가가액을 하나도 입력하지 않으면
 * ⑧ `validateGbSaleAxis`가 통과시키고 계산은 **조용히 양도시 기준시가 비율로 안분**한다(결과가 «기준시가 안분»
 * 선택과 원 단위까지 같고 판정 흔적도 없다). 주택 split는 V8-b(`transfer-tax-validate-split-sale-std.ts`)가,
 * 겸용은 `transfer-tax-validate-mixed-use-sale-split.ts`가 막는다 — 일반건물만 빠져 있었다.
 *
 * ⑫로는 막을 수 없다: ④가 일반건물 `saleSplitMode`를 와이어에 싣지 않으므로(V-11) 서버는 «기준시가 안분» 요청과
 * 구별하지 못한다. ⑧(클라이언트) 전용 갭이다. 증축은 제외한다(Q-1 (a) — F36 계약 «감정값이 없으면 통과» 유지).
 *
 * 계획서: docs/00-pm/gb-v8b-appraisal-mode-empty.plan.md
 */
import { describe, it, expect } from "vitest";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { cForm, bodyOf, issuesOf } from "@/__tests__/calc/_helpers/split-carryover-c-form";

const TD = "2025-06-30";
const LAND_APP = "landAppraisalAtTransfer";
const BLD_APP = "buildingAppraisalAtTransfer";
const V8B_MSG = "「감정평가」를 선택했으면 토지·건물 감정평가가액을 입력하세요";
const V8_MSG = "양도시 감정평가가액은 토지·건물 양쪽 모두 필요합니다";

const gbAsset = (over: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    addressJibun: "서울 강남구 테스트동 1-1",
    acquisitionCause: "purchase",
    acquisitionDate: "2005-03-01",
    landAcquisitionDate: "1999-05-24",
    hasSeperateLandAcquisitionDate: true,
    gbBuildingAcquisitionCause: "purchase",
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "90.48",
    gbZoneType: "commercial",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbAcqLandPricePerSqm: "1500000",
    gbAcqBuildingValue: "28144700",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "400000000",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
    ...over,
  }) as unknown as AssetForm;

const v = (over: Record<string, unknown> = {}) => validateGeneralBuildingAsset(gbAsset(over), "자산", TD);

/** ⑧ 수집 경로(`collectStepIssues`)로 얻은 V8-b 차단의 입력칸 식별자. */
const fieldsOf = (over: Record<string, unknown>) =>
  issuesOf(cForm({ transferDate: TD, filingDate: "2026-02-28", contractTotalPrice: "2000000000" } as never, gbAsset(over)))
    .filter((i) => i.message.includes(V8B_MSG))
    .map((i) => i.field);

/** 감정 입력 상태 5종. */
type App = "none" | "zero" | "both" | "landOnly" | "bldOnly";
const appOver = (app: App): Record<string, unknown> => {
  switch (app) {
    case "none": return {};
    case "zero": return { [LAND_APP]: "0", [BLD_APP]: "0" };
    case "both": return { [LAND_APP]: "1,400,000,000", [BLD_APP]: "600,000,000" };
    case "landOnly": return { [LAND_APP]: "1,400,000,000" };
    case "bldOnly": return { [BLD_APP]: "600,000,000" };
  }
};

describe("V-1·V-2 — 감정평가 선택 + 감정평가가액 없음 → V8-b 차단", () => {
  it("V-1 두 칸 빈칸: 오류 문구와 오류 필드(landAppraisalAtTransfer)", () => {
    const err = v({ saleSplitMode: "appraisal" });
    expect(err).not.toBeNull();
    expect(err).toContain(V8B_MSG);
    expect(err).toContain("부가가치세법 시행령 §64①1호 단서");
    // 입력칸 점프 대상 — fieldError 수집(collectStepIssues)이 기록한 field
    expect(fieldsOf({ saleSplitMode: "appraisal" })).toEqual([LAND_APP]);
  });

  it("V-2 0 / 0 도 빈칸으로 본다(split `opt()`와 같은 술어)", () => {
    const err = v({ saleSplitMode: "appraisal", ...appOver("zero") });
    expect(err).toContain(V8B_MSG);
    expect(fieldsOf({ saleSplitMode: "appraisal", ...appOver("zero") })).toEqual([LAND_APP]);
  });
});

describe("V-3~V-6 — 인접 입력은 영향 0", () => {
  it("V-3 양쪽 입력 → 통과", () => {
    expect(v({ saleSplitMode: "appraisal", ...appOver("both") })).toBeNull();
  });

  it("V-4 한쪽만 → 기존 V8(양쪽 모두 필요) 문구 — V8-b가 가로채지 않는다(순서 보장)", () => {
    for (const app of ["landOnly", "bldOnly"] as const) {
      const err = v({ saleSplitMode: "appraisal", ...appOver(app) });
      expect(err, app).toContain(V8_MSG);
      expect(err, app).not.toContain(V8B_MSG);
    }
  });

  it("V-5 기준시가 안분(apportioned)·모드 미지정(레거시) + 빈칸 → 통과 (잔존 감정값 보호와 같은 이유)", () => {
    expect(v({ saleSplitMode: "apportioned" })).toBeNull();
    expect(v({})).toBeNull();
  });

  it("V-6 구분 기재(actual) + 감정 빈칸 → 통과 (V8-b는 appraisal 전용 · Q-2 별건)", () => {
    expect(v({ saleSplitMode: "actual", landTransferPrice: "1,500,000,000", buildingTransferPrice: "500,000,000" })).toBeNull();
  });
});

describe("V-7 — 증축은 제외한다 (Q-1 (a) · F36 계약 유지)", () => {
  const ext = {
    gbHasExtension: true,
    gbExtensionDate: "2015-06-01",
    gbExtensionAcquisitionCause: "newConstruction",
    gbExtensionAcquisitionMode: "estimated",
    gbTransferExtensionBuildingStdPrice: "10000000",
    gbAcquisitionExtensionBuildingStdPrice: "6000000",
  };

  it("증축 × 감정 선택 × 빈칸/0·0 → 통과", () => {
    expect(v({ ...ext, saleSplitMode: "appraisal" })).toBeNull();
    expect(v({ ...ext, saleSplitMode: "appraisal", ...appOver("zero") })).toBeNull();
  });

  it("증축 × 감정 선택 × 감정값 있음 → 기존 F36 차단(증축 문구) 그대로", () => {
    expect(v({ ...ext, saleSplitMode: "appraisal", ...appOver("both") })).toContain("증축이 있는 건물에서는 감정평가가액으로 안분할 수 없습니다");
  });
});

describe("V-8 — 취득 방식과 무관하다 (환산 취득도 같은 차단)", () => {
  it("환산 취득 · 감정 선택 · 빈칸 → V-1과 같은 오류", () => {
    const over = { landAcqMode: "estimated", buildingAcqMode: "estimated", useEstimatedAcquisition: true, landAcquisitionPrice: "", buildingAcquisitionPrice: "" };
    expect(v({ ...over, saleSplitMode: "appraisal" })).toContain(V8B_MSG);
    expect(v({ ...over, saleSplitMode: "appraisal", ...appOver("both") })).toBeNull();
    expect(v({ ...over, saleSplitMode: "apportioned" })).toBeNull();
  });
});

describe("V-9 — 지분(축 B) 후속 카드: axisBEffectiveAsset 병합 경로에도 닿는다", () => {
  const half = { ownershipNumerator: "50", ownershipDenominator: "100" };
  /** 지분 카드 — 저장 assetKind는 기본값 «주택»(① 기본정보를 숨긴다). 물건-수준 값은 첫 카드에서 병합된다. */
  const share = (id: number): AssetForm =>
    ({ ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2005-03-01", landAcquisitionDate: "1999-05-24", hasSeperateLandAcquisitionDate: true, gbBuildingAcquisitionCause: "purchase", landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "150000000", buildingAcquisitionPrice: "200000000", ...half }) as unknown as AssetForm;
  const shares = (primaryOver: Record<string, unknown>): TransferFormData =>
    cForm(
      { transferDate: TD, filingDate: "2026-02-28", contractTotalPrice: "2000000000", assetSplitMode: "fractional", assets: [gbAsset({ ...half, ...primaryOver }), share(2)] } as never,
    );

  const errorsByAsset = (form: TransferFormData) =>
    issuesOf(form).map((i) => ({ assetIndex: i.assetIndex, message: i.message }));

  it("첫 카드 appraisal·빈칸 → 첫 카드와 후속 카드 모두 같은 오류", () => {
    const errs = errorsByAsset(shares({ saleSplitMode: "appraisal" }));
    const hits = errs.filter((e) => e.message.includes(V8B_MSG));
    expect(hits.map((h) => h.assetIndex).sort()).toEqual([0, 1]);
  });

  it("첫 카드 appraisal·양쪽 입력 → 지분 묶음 전체 통과(V8-b 없음)", () => {
    const errs = errorsByAsset(shares({ saleSplitMode: "appraisal", ...appOver("both") }));
    expect(errs.filter((e) => e.message.includes(V8B_MSG))).toEqual([]);
  });

  it("첫 카드 apportioned → V8-b 없음", () => {
    const errs = errorsByAsset(shares({ saleSplitMode: "apportioned" }));
    expect(errs.filter((e) => e.message.includes(V8B_MSG))).toEqual([]);
  });
});

describe("V-10 — split ↔ 일반건물 격자: 모드 3 × 감정 5 (증축 없음) ⑧ 차단 여부 일치", () => {
  const splitAsset = (over: Record<string, unknown>): AssetForm =>
    ({
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 1-1",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2005-06-01",
      landAcquisitionDate: "2003-06-01",
      hasSeperateLandAcquisitionDate: true,
      actualSalePrice: "1,500,000,000",
      standardPricePerSqmAtAcq: "1,000,000",
      acquisitionArea: "100",
      buildingStandardPriceAtAcq: "100,000,000",
      landAcquisitionPrice: "300,000,000",
      buildingAcquisitionPrice: "250,000,000",
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landStandardPriceAtTransfer: "900,000,000",
      buildingStandardPriceAtTransfer: "600,000,000",
      ...over,
    }) as unknown as AssetForm;

  const modes = ["actual", "apportioned", "appraisal"] as const;
  const apps: App[] = ["none", "zero", "both", "landOnly", "bldOnly"];

  it("15셀 전수: split ⑧ 차단 ⇔ 일반건물 ⑧ 차단", () => {
    let blockedCount = 0;
    const mismatch: string[] = [];
    for (const sm of modes)
      for (const app of apps) {
        const priced = sm === "actual" ? { landTransferPrice: "1,200,000,000", buildingTransferPrice: "300,000,000" } : {};
        const gbPriced = sm === "actual" ? { landTransferPrice: "1,500,000,000", buildingTransferPrice: "500,000,000" } : {};
        const splitForm = cForm({ transferDate: TD, filingDate: "2026-02-28", contractTotalPrice: "1500000000" } as never, splitAsset({ saleSplitMode: sm, ...priced, ...appOver(app) }));
        const gbForm = cForm({ transferDate: TD, filingDate: "2026-02-28", contractTotalPrice: "2000000000" } as never, gbAsset({ saleSplitMode: sm, ...gbPriced, ...appOver(app) }));
        const s = issuesOf(splitForm).length > 0;
        const g = issuesOf(gbForm).length > 0;
        if (g) blockedCount++;
        if (s !== g) mismatch.push(`${sm}/${app}: split=${s} gb=${g}`);
      }
    expect(mismatch).toEqual([]);
    // 비공허: 감정 선택의 none·zero(2) + 한쪽만(2×3모드=6) = 8셀 차단
    expect(blockedCount).toBe(8);
  });
});

describe("V-11 — ④ 와이어 대조: 모드·감정 키가 와이어에 없다 → ⑫로 막을 수 없고 ⑧이 유일한 관문", () => {
  it("appraisal + 빈칸/0·0 body의 generalBuildingValuation에 saleSplitMode·감정 키가 없다", async () => {
    for (const app of ["none", "zero"] as const) {
      const body = await bodyOf(
        cForm({ transferDate: TD, filingDate: "2026-02-28", contractTotalPrice: "2000000000" } as never, gbAsset({ saleSplitMode: "appraisal", ...appOver(app) })),
      );
      const gbv = body.generalBuildingValuation as Record<string, unknown>;
      expect(gbv, app).toBeDefined();
      expect(gbv).not.toHaveProperty("saleSplitMode");
      expect(gbv).not.toHaveProperty(LAND_APP);
      expect(gbv).not.toHaveProperty(BLD_APP);
    }
  });
});
