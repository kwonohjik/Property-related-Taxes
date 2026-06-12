/**
 * Post-Listing validate 모드별 매트릭스 테스트 (Round 4 G-04·H-07).
 *
 * 검증:
 *   - simple 모드: 4 결과값 필드 필수
 *   - listing_only: 종가 + 상장 18필드 필수 + 취득 4 결과값 직접 입력
 *   - full: 80필드 모두 필수
 *   - H-03 조합 차단: tradingHaltAtTransfer + acquiredBeforeListing + mode!==simple
 */

import { describe, it, expect } from "vitest";
import { validateStep2 } from "@/lib/calc/stock-transfer-tax-validate";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

/** simple 모드 — 취득 후 상장 ON + 4 결과값 직접 입력 시나리오 */
function simpleModeForm(): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kosdaq",
    isMajorShareholder: true,
    shareCount: "5000",
    totalIssuedShares: "100000",
    perShareTransferPrice: "8950",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    acquisitionMode: "estimated",
    acquiredBeforeListing: true,
    listingDate: "2018-07-01",
    unlistedDetailMode: "simple",
    listingDatePriceAvg1Month: "8001",
    listingYearNetIncomePerShare: "61570",
    listingYearNetAssetPerShare: "5352",
    acquisitionYearNetIncomePerShare: "44520",
    acquisitionYearNetAssetPerShare: "4348",
    transferDatePriceAvg1Month: "8659",
  };
}

describe("PL-VALIDATE — 취득 후 상장 모드별 매트릭스", () => {
  it("PL-VALIDATE-1 — simple 모드: 4 결과값 입력 시 통과", () => {
    const form = simpleModeForm();
    const errors = validateStep2(form);
    // 4 결과값 누락 오류 없음
    const postListingErrors = errors.filter((e) =>
      e.field.includes("listingDatePriceAvg1Month") ||
      e.field.includes("YearNet"),
    );
    expect(postListingErrors).toHaveLength(0);
  });

  it("PL-VALIDATE-2 — simple 모드: 4 결과값 중 일부 누락 시 차단", () => {
    const form = {
      ...simpleModeForm(),
      listingYearNetIncomePerShare: "",   // 누락
    };
    const errors = validateStep2(form);
    expect(errors.some((e) => e.field === "listingYearNetIncomePerShare")).toBe(true);
  });

  it("PL-VALIDATE-3 — listing_only 모드: 종가 + 상장 핵심 필드 필수", () => {
    const form: StockTransferFormData = {
      ...simpleModeForm(),
      unlistedDetailMode: "listing_only",
      // 종가 미입력 → 차단
      listingPriceClosing: [],
      // 상장 핵심 필드 미입력 → 차단
      niShareCountListing: "",
      naAssetTotalRow1Listing: "",
      naLiabTotalRow8Listing: "",
      naShareCountListing: "",
      // 취득연도는 직접 4 필드 (simple 모드 default 사용)
    };
    const errors = validateStep2(form);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("listingPriceClosing");
    expect(fields).toContain("niShareCountListing");
    expect(fields).toContain("naAssetTotalRow1Listing");
    expect(fields).toContain("naLiabTotalRow8Listing");
    expect(fields).toContain("naShareCountListing");
  });

  it("PL-VALIDATE-4 — listing_only 모드: 취득연도 직접 4 필드 통과 + 상장 채움 시 통과", () => {
    const form: StockTransferFormData = {
      ...simpleModeForm(),
      unlistedDetailMode: "listing_only",
      // 종가 1셀 이상
      listingPriceClosing: ["8000", "", "8050"],
      // 상장 핵심 4필드
      niShareCountListing: "1253600",
      naAssetTotalRow1Listing: "12375006000",
      naLiabTotalRow8Listing: "5623872030",
      naShareCountListing: "1253600",
      // 취득연도 4 결과값 (simple 모드 default — simpleModeForm()에 이미 채워짐)
    };
    const errors = validateStep2(form);
    // 상장 핵심 필드 오류 없음
    const listingErrors = errors.filter((e) =>
      ["listingPriceClosing", "niShareCountListing", "naAssetTotalRow1Listing", "naLiabTotalRow8Listing", "naShareCountListing"].includes(e.field),
    );
    expect(listingErrors).toHaveLength(0);
  });

  it("PL-VALIDATE-5 — full 모드: 양 연도 결산서 필드 필수", () => {
    const form: StockTransferFormData = {
      ...simpleModeForm(),
      unlistedDetailMode: "full",
      // 모든 nested 필드 미입력
    };
    const errors = validateStep2(form);
    const fields = errors.map((e) => e.field);
    // 상장 + 취득 양쪽 핵심 필드 차단
    expect(fields).toContain("niShareCountListing");
    expect(fields).toContain("naAssetTotalRow1Listing");
    expect(fields).toContain("niShareCountAcq");
    expect(fields).toContain("naAssetTotalRow1Acq");
    expect(fields).toContain("naLiabTotalRow8Acq");
  });

  it("PL-VALIDATE-6 — 거래정지 + 취득 후 상장 조합 차단 (full 모드 — 문구 갱신)", () => {
    const form: StockTransferFormData = {
      ...simpleModeForm(),
      unlistedDetailMode: "full",
      tradingHaltAtTransfer: true,   // 거래정지 ON
    };
    const errors = validateStep2(form);
    const haltError = errors.find((e) => e.field === "tradingHaltAtTransfer");
    expect(haltError).toBeDefined();
    expect(haltError?.message).toContain("§52의2③");
  });

  it("PL-VALIDATE-7 — 거래정지 + 취득 후 상장 조합은 simple 모드도 차단 (G-5 모드 무관 재산정)", () => {
    // PR-§165③: 엔진은 post-listing 우선이라 거래정지 침묵 무시 → 모드 무관 차단으로 통일
    const form: StockTransferFormData = {
      ...simpleModeForm(),
      unlistedDetailMode: "simple",
      tradingHaltAtTransfer: true,
    };
    const errors = validateStep2(form);
    const haltError = errors.find((e) => e.field === "tradingHaltAtTransfer");
    expect(haltError).toBeDefined();
    expect(haltError?.message).toContain("§52의2③");
  });

  it("PL-VALIDATE-8 — acquiredBeforeListing=false 시 unlistedDetailMode 무관 통과", () => {
    const form: StockTransferFormData = {
      ...simpleModeForm(),
      acquiredBeforeListing: false,
      unlistedDetailMode: "full",   // 모드 무관
    };
    const errors = validateStep2(form);
    // acquiredBeforeListing=false면 §165⑤ 검증 자체가 비활성
    const postListingErrors = errors.filter((e) =>
      ["listingDate", "niShareCountListing", "naAssetTotalRow1Listing", "tradingHaltAtTransfer"].includes(e.field),
    );
    expect(postListingErrors).toHaveLength(0);
  });

  // ── 거래정지 §165③ 우회 validate (활성화 PR) ──
  it("A-TH-4 — 거래정지 ON + 평가 미입력 → 비상장 평가 필수 차단 (C-6)", () => {
    const form: StockTransferFormData = {
      ...simpleModeForm(),
      acquiredBeforeListing: false,
      tradingHaltAtTransfer: true,
      transferYearNetIncomePerShare: "",
      transferYearNetAssetPerShare: "",
      acquisitionYearNetIncomePerShare: "",
      acquisitionYearNetAssetPerShare: "",
    };
    const errors = validateStep2(form);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("transferYearNetAssetPerShare");
    expect(fields).toContain("acquisitionYearNetAssetPerShare");
  });

  it("A-TH-5 — 거래정지 ON + §163⑨ 분모 미입력 → 분모 오류 면제 (G-6)", () => {
    const form: StockTransferFormData = {
      ...simpleModeForm(),
      acquiredBeforeListing: false,
      tradingHaltAtTransfer: true,
      transferDatePriceAvg1Month: "", // 분모 비움 — 거래정지 시 무효·미사용
      transferYearNetIncomePerShare: "30000",
      transferYearNetAssetPerShare: "10000",
      acquisitionYearNetIncomePerShare: "15000",
      acquisitionYearNetAssetPerShare: "5000",
    };
    const errors = validateStep2(form);
    const denomError = errors.find((e) => e.field === "transferDatePriceAvg1Month");
    expect(denomError).toBeUndefined();
  });
});
