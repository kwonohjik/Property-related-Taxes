/**
 * anchor: 건물 **신축** + 토지 **상속·증여** — 파트별 취득원인 상이 (2026-07-30).
 *
 * 계획서: docs/02-design/features/transfer-part-acquisition-cause.plan.md
 *
 * 🔴 현행 결함: `acquisitionCause`가 자산 단위 단일값이라 「신축」을 고르면 사용승인일 4시점 +
 *   신축비용만 받고 **토지 취득일·취득가액 칸이 아예 없다** → 토지 취득가액 0 → 과대과세.
 *
 * 설계(엔진 변경 0):
 *   · 엔진은 파트별 취득 **방식**(4-way)만 안다 — 취득 **원인**은 모른다.
 *   · 상속 §163⑨ 평가액·증여 신고가액은 "확인된 취득가액"이므로 `landAcqMode="actual"` +
 *     `landAcquisitionPrice`로 흘린다. `landAcquisitionCause`는 UI 라벨 전용.
 *   · 건물 취득가액의 정본은 「신축비용」(`fixedAcquisitionPrice`) — API·validate가 함께 후퇴.
 */
import { describe, it, expect } from "vitest";
import { buildSplitPayload } from "@/lib/calc/transfer-tax-api-split";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

/** 토지 상속(2015) + 건물 신축(2020) — 토글 ON 시 UI가 세팅하는 상태. */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "newConstruction",
    acquisitionDate: "2020-06-01", // 사용승인일 → 건물 취득일
    landAcquisitionCause: "inheritance",
    landAcquisitionDate: "2015-03-10", // 상속개시일
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000", // 상속개시일 평가액
    fixedAcquisitionPrice: "400,000,000", // 신축비용 = 건물 취득가액
    actualSalePrice: "1,000,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "600,000,000",
    buildingTransferPrice: "400,000,000",
    ...over,
  } as AssetForm;
}

const payload = (a: AssetForm) =>
  buildSplitPayload(a, {
    isBurdenedGift: false,
    usesPhd: false,
    ratioed: (v) => {
      const n = parseInt((v ?? "").replace(/,/g, ""), 10);
      return isFinite(n) && n > 0 ? n : undefined;
    },
  });

describe("C1 — API ⑬: 신축비용이 건물 파트 취득가액으로 전달된다", () => {
  it("buildingAcquisitionPrice가 fixedAcquisitionPrice로 후퇴한다", () => {
    expect(payload(asset()).buildingAcquisitionPrice).toBe(400_000_000);
  });

  it("토지 취득가액은 입력값 그대로", () => {
    expect(payload(asset()).landAcquisitionPrice).toBe(300_000_000);
  });

  it("파트별 취득일이 각각 전달돼 별개취득으로 판정된다", () => {
    const p = payload(asset());
    expect(p.landAcquisitionDate).toBe("2015-03-10");
    expect(p.isSeparateAcquisition).toBe(true);
  });

  it("🔴 회귀 — landAcquisitionCause가 없으면 후퇴하지 않는다 (다른 경로 불변)", () => {
    const p = payload(asset({ landAcquisitionCause: "", buildingAcquisitionPrice: "" }));
    expect(p.buildingAcquisitionPrice).toBeUndefined();
  });

  it("건물 파트를 직접 입력하면 그 값이 우선한다", () => {
    expect(
      payload(asset({ buildingAcquisitionPrice: "450,000,000" })).buildingAcquisitionPrice,
    ).toBe(450_000_000);
  });
});

describe("C2 — validate ⑧: API와 같은 후퇴를 인식한다 (모순 금지)", () => {
  it("신축비용만 있고 건물 파트 칸이 비어도 통과", () => {
    expect(validateSplitDirectInputs(asset(), "자산 1")).toBeNull();
  });

  it("🔴 토지 취득가액이 없으면 차단", () => {
    expect(validateSplitDirectInputs(asset({ landAcquisitionPrice: "" }), "자산 1")).toMatch(
      /토지 취득가액/,
    );
  });

  it("🔴 신축비용도 건물 파트도 없으면 차단", () => {
    expect(
      validateSplitDirectInputs(asset({ fixedAcquisitionPrice: "" }), "자산 1"),
    ).toMatch(/건물 취득가액/);
  });
});

describe("C3 — 엔진: 파트별 취득가액·보유기간이 각각 적용된다", () => {
  const engineInput = () =>
    ({
      propertyType: "housing",
      transferDate: new Date("2025-10-01"),
      acquisitionDate: new Date("2020-06-01"),
      landAcquisitionDate: new Date("2015-03-10"),
      transferPrice: 1_000_000_000,
      isSeparateAcquisition: true,
      saleSplitMode: "actual",
      landTransferPrice: 600_000_000,
      buildingTransferPrice: 400_000_000,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landAcquisitionPrice: 300_000_000,
      buildingAcquisitionPrice: 400_000_000,
    }) as unknown as TransferTaxInput;

  it("토지 취득가액이 0으로 떨어지지 않는다 (결함의 핵심)", () => {
    expect(calcSplitGain(engineInput())!.land.acquisitionPrice).toBe(300_000_000);
  });

  it("보유기간이 파트별로 갈린다 — 토지 10년 / 건물 5년", () => {
    const r = calcSplitGain(engineInput())!;
    expect(r.land.holdingYears).toBe(10);
    expect(r.building.holdingYears).toBe(5);
  });

  it("양도차익이 파트별로 산출된다", () => {
    const r = calcSplitGain(engineInput())!;
    expect(r.land.gain).toBe(300_000_000);
    expect(r.building.gain).toBe(0);
  });

  it("확인된 취득가액이므로 개산공제는 없다", () => {
    const r = calcSplitGain(engineInput())!;
    expect(r.land.appraisalDeduction).toBe(0);
    expect(r.building.appraisalDeduction).toBe(0);
  });
});

describe("C4 — 증여 조합도 동형", () => {
  it("landAcquisitionCause='gift'에서도 배관이 같다", () => {
    const a = asset({ landAcquisitionCause: "gift" });
    expect(payload(a).buildingAcquisitionPrice).toBe(400_000_000);
    expect(validateSplitDirectInputs(a, "자산 1")).toBeNull();
  });
});
