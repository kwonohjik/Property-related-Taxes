/**
 * anchor: `requiresAcqStdPrice` **3절(양도가액 안분 fallback) 제거** (2026-07-30).
 *
 * 계획서: docs/02-design/features/transfer-split-acq-std-part-gating.plan.md §3.3
 *
 * 종전 3절: `!hasSaleRatio && 양도가액 2칸 미입력 → 취득시 기준시가 필요`.
 * 그 전제는 "양도시 기준시가가 없으면 엔진이 **취득시 비율로 후퇴**한다"였는데,
 * 2026-07-29에 그 후퇴가 폐지됐다 — `transfer-tax-split-gain.ts`의 양도가액 축은
 * `effectiveSaleLandRatio = saleRatio?.land ?? null`로 **취득시 비율을 참조하지 않는다**.
 *
 * ⇒ 3절은 계산에 쓰이지 않는 값을 요구하는 **거짓 요구**였다. 제거하면:
 *   · UI: 쓰이지 않는 취득시 기준시가 카드가 사라진다
 *   · 엔진: 오류 메시지가 실제 원인(양도가액 구분 근거 부재)을 가리킨다
 *   · validate: V4(구분양도)·V7(일괄양도 기준시가)이 그대로 차단하므로 **구멍이 생기지 않는다**
 */
import { describe, it, expect } from "vitest";
import {
  requiresAcqStdPrice,
  requiresAcqStdPricePart,
} from "@/lib/calc/transfer-tax-split-acq-mode";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

/** 양쪽 실가 + 파트 취득가액 입력 완료 — 3절만이 유일한 true 사유였던 조합. */
const ACTUAL_BOTH = {
  landAcquisitionPrice: "300,000,000",
  buildingAcquisitionPrice: "200,000,000",
} as const;
const CTX = {
  landMode: "actual",
  buildingMode: "actual",
  isSeparate: true,
  /** 양도시 기준시가 2필드가 없다 → 종전 3절 발동 조건 */
  hasSaleRatio: false,
} as const;

describe("S1 — 술어: 양도가액 미입력만으로는 취득시 기준시가를 요구하지 않는다", () => {
  it("🔴 양쪽 실가 + 양도가액 2칸 미입력 + 양도시 기준시가 없음 → false", () => {
    expect(requiresAcqStdPrice(ACTUAL_BOTH, CTX)).toBe(false);
  });

  it("파트별 술어도 양쪽 false", () => {
    expect(requiresAcqStdPricePart("land", ACTUAL_BOTH, CTX)).toBe(false);
    expect(requiresAcqStdPricePart("building", ACTUAL_BOTH, CTX)).toBe(false);
  });

  it("회귀 — 환산 파트가 있으면 여전히 true (1절)", () => {
    expect(requiresAcqStdPrice(ACTUAL_BOTH, { ...CTX, landMode: "estimated" })).toBe(true);
  });

  it("회귀 — 비-별개취득 + 파트 취득가액 2칸 미입력이면 여전히 true (2절)", () => {
    expect(
      requiresAcqStdPrice({}, { ...CTX, isSeparate: false }),
      "총액 안분이 유일한 도출 수단",
    ).toBe(true);
  });

  it("회귀 — legacy 자본적지출 총액 안분이 필요하면 여전히 true (4절)", () => {
    expect(requiresAcqStdPrice({ ...ACTUAL_BOTH, expenses: 30_000_000 }, CTX)).toBe(true);
  });
});

describe("S2 — 안전망: 제거해도 차단 구멍이 생기지 않는다", () => {
  const asset = (over: Partial<AssetForm> = {}): AssetForm =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "housing",
      hasSeperateLandAcquisitionDate: true,
      acquisitionDate: "2020-06-01",
      landAcquisitionDate: "2015-03-10",
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landAcquisitionPrice: "300,000,000",
      buildingAcquisitionPrice: "200,000,000",
      actualSalePrice: "1,000,000,000",
      ...over,
    }) as AssetForm;

  it("구분양도 + 양도가액 2칸 미입력 → V4가 차단한다", () => {
    expect(validateSplitDirectInputs(asset({ saleSplitMode: "actual" }), "자산 1")).toMatch(
      /구분양도를 선택했으면/,
    );
  });

  it("일괄양도 + 양도시 기준시가 미입력 → V7이 차단한다", () => {
    expect(validateSplitDirectInputs(asset({ saleSplitMode: "apportioned" }), "자산 1")).toMatch(
      /양도시 기준시가/,
    );
  });
});

describe("S3 — 엔진: 오류가 실제 원인(양도가액)을 가리킨다", () => {
  it("취득시 기준시가가 아니라 양도가액 구분 부재로 차단된다", () => {
    const input = {
      propertyType: "housing",
      transferDate: new Date("2025-10-01"),
      acquisitionDate: new Date("2020-06-01"),
      landAcquisitionDate: new Date("2015-03-10"),
      transferPrice: 1_000_000_000,
      isSeparateAcquisition: true,
      saleSplitMode: "actual",
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landAcquisitionPrice: 300_000_000,
      buildingAcquisitionPrice: 200_000_000,
      // 양도가액 2칸·양도시 기준시가 모두 없음 — 취득시 기준시가도 없다
    } as unknown as TransferTaxInput;

    // 종전에는 "㎡당 개별공시지가와 토지 면적이 필요합니다"(거짓 원인)로 막혔다.
    expect(() => calcSplitGain(input)).toThrow(/양도가액/);
  });
});
