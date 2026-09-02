/**
 * ② 상장일 이후 1개월 종가평균 — 파생 단일 진실 + validate 축
 *
 * 소득세법 시행령 §165⑤ 계산식 첫 항
 *   「코스닥시장 또는 코넥스시장 상장일 이후 1개월간 공표된 매일의 … 최종시세가액의 평균액」
 *
 * ## 왜 저장 mirror를 두지 않는가
 *
 * 평균을 폼 필드에 «기록»하면 쓰기 지점이 4곳(셀 편집·자본조정 토글·상장일 변경·키움
 * 자동조회)이 되고, 그중 **상장일 변경은 표를 재구성하면서 평균은 옛 값으로 남긴다**.
 * simple 모드에서 그 필드는 곧 엔진 입력이라 조용한 오답이 된다(형제 축 ①의 실사고).
 * ⇒ `resolveListingClosingAvg`가 읽는 쪽에서 매번 파생한다.
 *
 * ## 왜 절단을 헬퍼가 해야 하는가
 *
 * simple 모드는 `postListingDetail`을 보내지 않으므로(adapter 조기 반환) 엔진이
 * 증자·합병 기간 절단(상증령 §52의2②2호 준용)을 대신해줄 수 없다.
 */

import { describe, it, expect } from "vitest";
import { resolveListingClosingAvg } from "@/lib/tax-engine/stock-transfer/post-listing-flat-adapter";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

/** 상장일 2009-08-24(월)부터 5거래일 — 주말 슬롯은 빈칸 */
const DATES = ["2009-08-24", "2009-08-25", "2009-08-26", "2009-08-27", "2009-08-28"];
const CLOSES = ["10000", "10000", "10000", "20000", "20000"];

describe("RLA — resolveListingClosingAvg (파생 단일 진실)", () => {
  it("RLA-1 direct — 사용자가 입력한 단일 숫자가 정본. 표는 무시한다", () => {
    const avg = resolveListingClosingAvg({
      listingStdInputMode: "direct",
      listingDatePriceAvg1Month: "8001",
      listingPriceDates: DATES,
      listingPriceClosing: CLOSES,
    });
    expect(avg).toBe(8001);
  });

  it("RLA-2 daily — 표에서 산정한다. 단일 숫자 필드는 무시한다", () => {
    const avg = resolveListingClosingAvg({
      listingStdInputMode: "daily",
      listingDatePriceAvg1Month: "8001", // ← daily로 바꾸기 전 남은 값
      listingPriceDates: DATES,
      listingPriceClosing: CLOSES,
    });
    // (10000×3 + 20000×2) / 5 = 14000
    expect(avg).toBe(14000);
  });

  it("RLA-3 daily — 증자·합병 기간 절단이 반영된다 (상증령 §52의2②2호 준용)", () => {
    const avg = resolveListingClosingAvg({
      listingStdInputMode: "daily",
      listingPriceDates: DATES,
      listingPriceClosing: CLOSES,
      listingPriceHasIncrease: true,
      listingPriceIncreaseDate: "2009-08-27", // 발생일 당일·이후 제외 → 앞 3일만
    });
    expect(avg).toBe(10000);
  });

  it("RLA-4 축 미설정(부재값)은 direct로 읽는다 — 이 필드가 생기기 전 폼 보존", () => {
    const avg = resolveListingClosingAvg({ listingDatePriceAvg1Month: "8001" });
    expect(avg).toBe(8001);
  });

  /**
   * 🔴 **여기서 «진입점»을 잘못 골라 실제 결함을 놓쳤다** (2026-09-02 정정).
   *
   * 종전 RLA-5는 `adaptFlatToApiBody`를 **직접** 호출했다. 그런데 그 함수는
   * `buildStockTransferApiBody`에서 **`listing_only`·`full`에만 게이트**돼 호출된다
   * (`stock-transfer-tax-api.ts:400`). simple 모드는 그 줄을 아예 타지 않으므로,
   * adapter의 simple 분기는 **API 경로에서 죽은 코드**였다. 그래서
   *   · 이 anchor는 통과하고
   *   · 뮤테이션(M-A)도 빨개지고
   *   · 화면 미리보기는 파생값을 보여주는데
   *   · **엔진만 `undefined`를 받아 취득가액이 0**이 됐다(실측: direct 40,000,000 vs daily 0).
   *
   * ⇒ 배관 anchor의 진입점은 **UI가 실제로 부르는 함수**여야 한다
   *   ([[feedback_leaf_anchor_skips_zod_layer]]). leaf를 겨눈 뮤테이션은
   *   「구별력」은 증명해도 「도달성」은 증명하지 못한다.
   */
  it("RLA-5 API 변환 — simple+daily는 표에서 산정한 값을 body에 싣는다 (진입점 = UI가 부르는 함수)", () => {
    const body = buildStockTransferApiBody(
      postListingForm({
        listingStdInputMode: "daily",
        listingDatePriceAvg1Month: "8001", // ← 옛 필드를 읽으면 8001이 나온다
        listingPriceDates: DATES,
        listingPriceClosing: CLOSES,
      }),
    );
    expect(body.listingDatePriceAvg1Month).toBe(14000);
    expect(body.postListingDetail).toBeUndefined(); // simple 경로 유지 (엔진 무변경)
  });
});

// ────────────────────────────────────────────────────────────

function postListingForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kosdaq",
    securityCode: "005930",
    securityName: "종목",
    acquisitionDate: "2005-04-20",
    transferDate: "2025-06-10",
    shareCount: "5000",
    acquisitionMode: "estimated",
    acquiredBeforeListing: true,
    unlistedDetailMode: "simple",
    listingDate: "2009-08-24",
    // ③은 채워 둔다 — ②의 오류만 남기기 위해
    listingYearNetIncomePerShare: "39082",
    listingYearNetAssetPerShare: "39082",
    acquisitionYearNetIncomePerShare: "28451",
    acquisitionYearNetAssetPerShare: "28451",
    ...o,
  };
}

const fieldsOf = (form: StockTransferFormData) =>
  validateStep2Domestic(form).map((e) => e.field);

describe("LSV — ② 축 validate (① `transferStdInputMode`와 같은 형태)", () => {
  it("LSV-1 direct + 미입력 → 단일 숫자 칸을 차단한다", () => {
    const f = postListingForm({ listingStdInputMode: "direct", listingDatePriceAvg1Month: "" });
    expect(fieldsOf(f)).toContain("listingDatePriceAvg1Month");
  });

  it("LSV-2 direct + 입력 → ② 관련 오류가 없다", () => {
    const f = postListingForm({ listingStdInputMode: "direct", listingDatePriceAvg1Month: "8001" });
    const fields = fieldsOf(f);
    expect(fields).not.toContain("listingDatePriceAvg1Month");
    expect(fields).not.toContain("listingPriceClosing");
  });

  it("LSV-3 daily + 표 비었음 → 표를 차단한다. 단일 숫자 칸은 «차단하지 않는다»", () => {
    const f = postListingForm({
      listingStdInputMode: "daily",
      listingDatePriceAvg1Month: "",
      listingPriceDates: DATES,
      listingPriceClosing: ["", "", "", "", ""],
    });
    const fields = fieldsOf(f);
    expect(fields).toContain("listingPriceClosing");
    // 🔑 daily에서는 그 칸이 화면에 없다 — 요구하면 입력 UI 없는 dead-end가 된다
    expect(fields).not.toContain("listingDatePriceAvg1Month");
  });

  it("LSV-4 daily + 표 입력 → 단일 숫자가 비어 있어도 통과한다", () => {
    const f = postListingForm({
      listingStdInputMode: "daily",
      listingDatePriceAvg1Month: "",
      listingPriceDates: DATES,
      listingPriceClosing: CLOSES,
    });
    const fields = fieldsOf(f);
    expect(fields).not.toContain("listingPriceClosing");
    expect(fields).not.toContain("listingDatePriceAvg1Month");
  });
});
