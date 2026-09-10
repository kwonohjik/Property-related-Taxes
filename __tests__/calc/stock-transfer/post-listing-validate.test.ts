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
    acquisitionStdMode: "post_listing",
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

  /**
   * 🔄 **S3 이관 (2026-09-10)** — 종전 PL-VALIDATE-6·7은 「거래정지 + 취득 후 상장」이라는
   * **불가 조합**을 ⑧이 막는지 보았다. `acquisitionStdMode`가 배타적 4상태가 되면서
   * 폼에서 그 조합을 **만들 수 없게** 됐고, ⑧의 차단 코드는 도달 불가라 제거했다(Q-2 3안).
   *
   * 지킬 성질은 두 곳으로 나뉘었다:
   *   · 「폼에서 만들 수 없다」 → `stock-std-mode-migration.anchor.test.ts` MAP-5
   *   · 「API로는 여전히 막힌다」 → `stock-conversion-branch-matrix.anchor.test.ts` MTX-XA'·XB'
   *
   * 여기서는 **각 방식이 서로를 배제한다**는 것만 확인한다 — 조합 자체가 표현 불가라는 증거.
   */
  it("PL-VALIDATE-6 — 산정 방식은 배타적이다 (halt_transfer면 §165⑤ 요구가 없다)", () => {
    const form: StockTransferFormData = {
      ...simpleModeForm(),
      unlistedDetailMode: "full",
      acquisitionStdMode: "halt_transfer",
    };
    const errors = validateStep2(form);
    // §165⑤ 전용 요구(상장일 등)가 붙지 않는다 — 그 방식이 아니기 때문이다
    expect(errors.find((e) => e.field === "listingDate")).toBeUndefined();
  });

  it("PL-VALIDATE-7 — post_listing이면 거래정지 쪽 요구가 없다 (반대 방향 대조군)", () => {
    const form: StockTransferFormData = {
      ...simpleModeForm(),
      unlistedDetailMode: "simple",
      acquisitionStdMode: "post_listing",
    };
    const errors = validateStep2(form);
    // 보충 평가(거래정지 방식) 전용 필드를 요구하지 않는다
    expect(errors.find((e) => e.field === "transferYearNetIncomePerShare")).toBeUndefined();
  });

  it("PL-VALIDATE-8 — acquiredBeforeListing=false 시 unlistedDetailMode 무관 통과", () => {
    const form: StockTransferFormData = {
      ...simpleModeForm(),
      acquisitionStdMode: "monthly_avg",
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
      acquisitionStdMode: "halt_transfer",
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
      acquisitionStdMode: "halt_transfer",
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
