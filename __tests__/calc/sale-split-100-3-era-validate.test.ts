/**
 * anchor — §100③ 양도일 연혁의 **validate 쪽** (Q-2 조건부 해제 · V9 근거 필수 게이트)
 *
 * 계획서: `docs/00-pm/sale-split-100-3-era-gate.plan.md` §4.2 · §5.1 · Step 1 A-5
 *
 * ## 양도시 기준시가 필수 해제 (Q-2 — 사용자 결정 2026-10-18)
 *
 * 양도일 2016.1.1. 전에는 30% 판정이 없어 이 값이 판정에는 쓰이지 않는다. 그러나 다른 계산에는 쓰이므로
 * **세 조건이 모두 맞을 때만** 푼다 — (1) 양도일 `none` (2) 구분 기재(`actual`) (3) 어느 파트도 환산 취득이 아님.
 *
 * | 조건 | 기준시가 없이 |
 * |---|---|
 * | `none` ∧ actual ∧ 환산 없음 | **통과** |
 * | `none` ∧ actual ∧ **토지 환산** | 차단 (환산취득가액의 분모) |
 * | `none` ∧ **일괄양도(apportioned)** | 차단 (안분의 기준) |
 * | 2016-01-01 이후 | 차단 (30% 판정의 비교 기준) |
 * | 양도일 없음 | 차단 (엔진과 같이 `body`로 읽는다) |
 */
import { describe, it, expect } from "vitest";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { saleSplitEra, saleSplitProvisoApplies, saleStdPriceWaivedByEra } from "@/lib/calc/sale-split-100-3-era";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 구분양도 + 토지·건물 취득일 분리 + 양쪽 실가 취득 — 양도시 기준시가 두 칸은 **비어 있다** */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2005-06-01",
    landAcquisitionDate: "2003-06-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "250,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "1,200,000,000",
    buildingTransferPrice: "300,000,000",
    actualSalePrice: "1,500,000,000",
    ...over,
  } as AssetForm;
}

const v = (a: AssetForm, transferDate?: string) => validateSplitDirectInputs(a, "자산 1", transferDate);
const STD_MSG = "양도시 기준시가";

describe("술어 — 경계는 엔진 leaf(`sec100_3Era`)와 같다", () => {
  it("saleSplitEra", () => {
    expect(saleSplitEra("2015-12-31")).toBe("none");
    expect(saleSplitEra("2016-01-01")).toBe("body");
    expect(saleSplitEra("2024-12-31")).toBe("body");
    expect(saleSplitEra("2025-01-01")).toBe("body_and_proviso");
    expect(saleSplitEra(undefined)).toBe("body");
  });

  it("saleSplitProvisoApplies — 2025-01-01 이후만", () => {
    expect(saleSplitProvisoApplies("2024-12-31")).toBe(false);
    expect(saleSplitProvisoApplies("2025-01-01")).toBe(true);
    expect(saleSplitProvisoApplies(undefined)).toBe(false);
  });

  it("saleStdPriceWaivedByEra — 세 조건이 모두 맞아야 true", () => {
    const base = { transferDate: "2015-12-31", saleSplitMode: "actual", landMode: "actual", buildingMode: "actual" };
    expect(saleStdPriceWaivedByEra(base)).toBe(true);
    expect(saleStdPriceWaivedByEra({ ...base, transferDate: "2016-01-01" })).toBe(false);
    expect(saleStdPriceWaivedByEra({ ...base, transferDate: undefined })).toBe(false);
    expect(saleStdPriceWaivedByEra({ ...base, saleSplitMode: "apportioned" })).toBe(false);
    expect(saleStdPriceWaivedByEra({ ...base, saleSplitMode: "appraisal" })).toBe(false);
    expect(saleStdPriceWaivedByEra({ ...base, landMode: "estimated" })).toBe(false);
    expect(saleStdPriceWaivedByEra({ ...base, buildingMode: "estimated" })).toBe(false);
  });
});

describe("A-5 — Q-2 양도시 기준시가 필수 해제 (validate V7)", () => {
  it("🔴 양도일 2015-12-31 · 구분 기재 · 환산 없음: 기준시가 없이 통과한다", () => {
    expect(v(asset(), "2015-12-31")).toBeNull();
  });

  it("양도일 2016-01-01(경계 첫날): 같은 입력이 차단된다 — 30% 판정의 비교 기준", () => {
    expect(v(asset(), "2016-01-01")).toContain(STD_MSG);
  });

  it("양도일이 없으면 풀지 않는다 — 엔진과 같이 판정 구간으로 읽는다", () => {
    expect(v(asset())).toContain(STD_MSG);
  });

  it("🔴 해제 조건에서 환산 파트가 빠지면 안 된다 — 토지 환산이면 기준시가(환산 분모)가 여전히 필수", () => {
    const a = asset({
      landAcqMode: "estimated",
      standardPricePerSqmAtAcq: "1,000,000",
      acquisitionArea: "100",
    } as Partial<AssetForm>);
    expect(v(a, "2015-12-31")).toContain(STD_MSG);
  });

  it("🔴 일괄양도(안분)이면 풀지 않는다 — 이 값이 양도가액 구분의 기준이다", () => {
    const a = asset({ saleSplitMode: "apportioned", landTransferPrice: "", buildingTransferPrice: "" });
    expect(v(a, "2015-12-31")).toContain(STD_MSG);
  });
});

describe("V9 — 예외 근거 필수는 단서가 시행된 양도일에만 (칸이 숨겨지는 구간에서 요구하면 막다른 길)", () => {
  const WITH_EXEMPTION = { saleSplitExemption: "other_law", landStandardPriceAtTransfer: "900,000,000", buildingStandardPriceAtTransfer: "600,000,000" } as Partial<AssetForm>;

  it("2025-01-01 이후: 근거가 없으면 차단", () => {
    expect(v(asset(WITH_EXEMPTION), "2025-01-01")).toContain("근거를 입력하세요");
  });

  it("🔴 2024-12-31 이전: 근거를 요구하지 않는다", () => {
    expect(v(asset(WITH_EXEMPTION), "2024-12-31")).toBeNull();
  });
});

describe("체인 — 양도일이 진입 함수(`validateAssetAcquisition`)에서 split 검증까지 실제로 닿는다", () => {
  // 단위 테스트가 `validateSplitDirectInputs`를 직접 부르면 상위 함수가 양도일을 **넘기는지**는 검증되지 않는다
  // (스레딩이 끊겨도 단위 테스트는 초록). 그래서 진입 함수를 통과시킨다.
  const WITH_EXEMPTION = {
    saleSplitExemption: "other_law",
    landStandardPriceAtTransfer: "900,000,000",
    buildingStandardPriceAtTransfer: "600,000,000",
  } as Partial<AssetForm>;

  it("2025-01-01 이후: 근거 없는 예외가 진입 함수에서도 차단된다", () => {
    expect(validateAssetAcquisition(asset(WITH_EXEMPTION), "자산 1", "2025-06-01")).toContain("근거를 입력하세요");
  });

  it("🔴 2024-12-31 이전: 같은 입력이 진입 함수에서 근거 요구 없이 통과한다 — 양도일이 체인 끝까지 전달됐다는 증거", () => {
    const msg = validateAssetAcquisition(asset(WITH_EXEMPTION), "자산 1", "2024-12-31");
    expect(msg ?? "").not.toContain("근거를 입력하세요");
  });

  it("🔴 기준시가 해제도 진입 함수를 통과한다 — 양도일 2015-12-31", () => {
    const msg = validateAssetAcquisition(asset(), "자산 1", "2015-12-31");
    expect(msg ?? "").not.toContain(STD_MSG);
  });

  it("양도일 2016-01-01이면 같은 입력이 기준시가를 요구한다", () => {
    expect(validateAssetAcquisition(asset(), "자산 1", "2016-01-01")).toContain(STD_MSG);
  });

  // 진입 함수 안에는 split 검증으로 가는 길이 **세 갈래**다(건물 원인 혼합 · 신축 · 일반). 한 갈래만 덮으면 나머지 둘의 스레딩이 끊겨도 초록이다.
  it("🔴 건물 상속 + 토지 매매(원인 혼합) 갈래도 양도일을 전달한다", () => {
    const mix = asset({
      ...WITH_EXEMPTION,
      acquisitionCause: "inheritance",
      landCauseHost: "inheritance",
      landAcquisitionCause: "purchase",
      decedentAcquisitionDate: "1990-01-01",
    } as Partial<AssetForm>);
    expect(validateAssetAcquisition(mix, "자산 1", "2025-06-01")).toContain("근거를 입력하세요");
    expect(validateAssetAcquisition(mix, "자산 1", "2024-12-31")).toBeNull();
  });

  it("🔴 신축 갈래도 양도일을 전달한다", () => {
    const nc = asset({
      ...WITH_EXEMPTION,
      acquisitionCause: "newConstruction",
      occupancyApprovalDate: "2005-06-01",
      fixedAcquisitionPrice: "500,000,000",
    } as Partial<AssetForm>);
    expect(validateAssetAcquisition(nc, "자산 1", "2025-06-01")).toContain("근거를 입력하세요");
    expect(validateAssetAcquisition(nc, "자산 1", "2024-12-31") ?? "").not.toContain("근거를 입력하세요");
  });
});
