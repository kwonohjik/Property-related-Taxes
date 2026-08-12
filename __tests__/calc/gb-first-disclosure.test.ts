/**
 * §99-164-10 최초공시 — 술어·파생 단일 소스 (`lib/calc/gb-first-disclosure.ts`).
 *
 * 계획서: `docs/02-design/features/gb-first-disclosure-3point-integration.plan.md` §4.4·§6.2·§7.5
 *
 * 고정 계약:
 *   FD-1  총액 직접 입력(legacy)과 「㎡당 단가 × 면적」이 **같은 값**을 낸다
 *   FD-2  단가가 있으면 legacy 총액은 **무시**된다
 *   FD-3  단가가 없으면 legacy 총액이 그대로 쓰인다 (회귀 0)
 *   FD-9  단가를 지우면 fallback이 끊긴다 — legacy도 없으면 0
 *   FD-12 게이트 술어가 **파트 축**이다 — 분리 ON + 파트만 환산에서도 참
 *
 * ⚠️ 이 파일이 지키는 것은 **술어와 파생**이다. 세액 동치(FD-1의 엔진 관통)는
 *    `__tests__/tax-engine/transfer-tax/case-35-followup-1-converted-housing.test.ts`가 진다.
 */
import { describe, it, expect } from "vitest";
import {
  isGbFirstDisclosureApplicable,
  gbFirstDisclosureLandStdPriceOf,
  gbFirstDisclosureUsesLegacyLandTotal,
} from "@/lib/calc/gb-first-disclosure";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    gbLandArea: "160",
    ...over,
  };
}

describe("gbFirstDisclosureLandStdPriceOf — 토지 총액 파생", () => {
  it("FD-1: 「단가 × 면적」이 같은 값의 총액 직접 입력과 일치한다", () => {
    const perSqm = gbAsset({
      gbFirstDisclosureLandPricePerSqm: "2,000,000",
      gbLandArea: "160",
    });
    const legacy = gbAsset({ gbFirstDisclosureLandStdPrice: "320,000,000" });

    expect(gbFirstDisclosureLandStdPriceOf(perSqm)).toBe(320_000_000);
    expect(gbFirstDisclosureLandStdPriceOf(legacy)).toBe(320_000_000);
    expect(gbFirstDisclosureLandStdPriceOf(perSqm)).toBe(
      gbFirstDisclosureLandStdPriceOf(legacy),
    );
  });

  it("FD-2: 단가가 있으면 legacy 총액을 무시한다", () => {
    const both = gbAsset({
      gbFirstDisclosureLandPricePerSqm: "2,000,000",
      gbLandArea: "160",
      // 일부러 크게 다른 값 — 이것이 이기면 안 된다
      gbFirstDisclosureLandStdPrice: "999,999,999",
    });
    expect(gbFirstDisclosureLandStdPriceOf(both)).toBe(320_000_000);
    expect(gbFirstDisclosureUsesLegacyLandTotal(both)).toBe(false);
  });

  it("FD-3: 단가가 없으면 legacy 총액이 그대로 쓰인다 (구형 sessionStorage 회귀 0)", () => {
    const legacy = gbAsset({
      gbFirstDisclosureLandPricePerSqm: "",
      gbFirstDisclosureLandStdPrice: "320,000,000",
    });
    expect(gbFirstDisclosureLandStdPriceOf(legacy)).toBe(320_000_000);
    expect(gbFirstDisclosureUsesLegacyLandTotal(legacy)).toBe(true);
  });

  it("FD-9: 단가·총액 모두 없으면 0 — fallback이 끊긴다", () => {
    expect(gbFirstDisclosureLandStdPriceOf(gbAsset())).toBe(0);
    expect(gbFirstDisclosureUsesLegacyLandTotal(gbAsset())).toBe(false);
  });

  it("면적이 비면 단가만으로는 총액을 만들지 않고 legacy로 떨어진다", () => {
    const noArea = gbAsset({
      gbLandArea: "",
      gbFirstDisclosureLandPricePerSqm: "2,000,000",
      gbFirstDisclosureLandStdPrice: "111,000,000",
    });
    expect(gbFirstDisclosureLandStdPriceOf(noArea)).toBe(111_000_000);
    expect(gbFirstDisclosureUsesLegacyLandTotal(noArea)).toBe(true);
  });

  it("소수 면적은 floor로 정수화한다 (Zod z.number().int() 계약)", () => {
    const frac = gbAsset({
      gbLandArea: "160.55",
      gbFirstDisclosureLandPricePerSqm: "1,234,567",
    });
    const v = gbFirstDisclosureLandStdPriceOf(frac);
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBe(Math.floor(1_234_567 * 160.55));
  });
});

describe("isGbFirstDisclosureApplicable — 파트 축 술어", () => {
  it("분리 OFF + 환산 플래그 → 참 (종전 노출 유지)", () => {
    expect(
      isGbFirstDisclosureApplicable(gbAsset({ useEstimatedAcquisition: true })),
    ).toBe(true);
  });

  it("분리 OFF + 실거래가 → 거짓", () => {
    expect(
      isGbFirstDisclosureApplicable(gbAsset({ useEstimatedAcquisition: false })),
    ).toBe(false);
  });

  it("FD-12: 분리 ON + **토지만** 환산 → 참 (플래그는 false)", () => {
    const asset = gbAsset({
      useEstimatedAcquisition: false,
      hasSeperateLandAcquisitionDate: true,
      landAcqMode: "estimated",
      buildingAcqMode: "actual",
    });
    // 이것이 이번 변경의 핵심 — 플래그 축이면 여기서 false가 되어 토글이 뜨지 않는다.
    expect(asset.useEstimatedAcquisition).toBe(false);
    expect(isGbFirstDisclosureApplicable(asset)).toBe(true);
  });

  it("FD-12: 분리 ON + **건물만** 환산 → 참", () => {
    expect(
      isGbFirstDisclosureApplicable(
        gbAsset({
          useEstimatedAcquisition: false,
          hasSeperateLandAcquisitionDate: true,
          landAcqMode: "actual",
          buildingAcqMode: "estimated",
        }),
      ),
    ).toBe(true);
  });

  it("분리 ON + 두 파트 모두 실가 → 거짓", () => {
    expect(
      isGbFirstDisclosureApplicable(
        gbAsset({
          useEstimatedAcquisition: false,
          hasSeperateLandAcquisitionDate: true,
          landAcqMode: "actual",
          buildingAcqMode: "actual",
        }),
      ),
    ).toBe(false);
  });

  it("감정가액·매매사례가액은 환산이 아니다 → 거짓", () => {
    expect(
      isGbFirstDisclosureApplicable(
        gbAsset({ isAppraisalAcquisition: true, useEstimatedAcquisition: false }),
      ),
    ).toBe(false);
    expect(
      isGbFirstDisclosureApplicable(
        gbAsset({ isSalesCaseAcquisition: true, useEstimatedAcquisition: false }),
      ),
    ).toBe(false);
  });
});
