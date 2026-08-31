/**
 * API 배관 anchor — 리뷰 2026-08-28 #3·#12·#20
 *
 * 세 결함 모두 **④ `buildStockTransferApiBody`의 falsy·분기 strip**이 뿌리다.
 * 그래서 이 파일은 **폼 → ④ → ⑨⑫ Zod → ⑭ route 매핑 → 엔진** 전 계층을 태운다 —
 * 엔진을 직접 호출하는 anchor는 strip을 **구조적으로 볼 수 없다**
 * (기존 `case-49-unlisted-exchange.test.ts`가 그 이유로 이 결함을 놓쳤다).
 *
 * ── #3 액면가(§99①4) 모드가 양도연도 순손익·순자산을 침묵 strip ────────────────
 *   `face_value` 분기는 `faceValuePerShare`만 보낸다. 그런데 액면가 환산의 **분모**인
 *   양도기준시가를 `calcTransferStdPriceForFaceValue`가 바로 그 두 필드로 만든다.
 *   분모가 0이면 `calcFaceValueTransferEstimated`가 **취득가액 0**을 반환한다.
 *   UI(`FaceValueBlock`)는 두 칸을 렌더하고 환산 미리보기까지 보여주므로 화면↔엔진이 갈린다.
 *   근거: 소득세법 §99①4호 후단 · 시행령 §165④1호(순손익×3 + 순자산×2 ÷ 5, 단서 80% 하한)
 *
 *   동반 — `calcTransferStdPriceForFaceValue`가 `netAssetOnlyReason`(§165④3)을 아예 읽지
 *   않는다. MAIN 경로·C-1 경로는 모두 처리하므로 배선을 고치는 순간 이 비대칭이 활성화된다.
 *
 * ── #12 양도 매매사례가액이 취득모드·시장 게이트 없이 양도가액을 침묵 치환 ──────
 *   전송 게이트가 `transferPriceMode === "actual"`뿐이라 형제 필드
 *   (`acquisitionMarketSamplePrice`는 `sale_case` 블록 **안**)와 비대칭이다.
 *   입력 위젯은 `sale_case`에서만 렌더되는데 모드 전환 시 정리가 없어 stale 값이 남고,
 *   엔진은 이 값에 **절대 우선순위**를 준다(`perShareTransferPrice`를 앞지른다).
 *   상장 차단은 validate·Zod 둘 다 `acquisitionMode === "sale_case"` 축이라 침묵한다.
 *   근거: 시행령 §176의2③1호 본문(「주권상장법인의 주식등은 제외한다」) · §163⑫ · 법 §96①
 *
 * ── #20 §165⑤ 환산의 falsy 가드가 「1주당 순손익가치 0」을 미입력으로 읽는다 ────
 *   결손·무수익 법인의 NI=0은 §165④1 단서(순자산×80%)가 작동해야 할 전형인데,
 *   그 단서를 계산하기 **전에** 조기 이탈해 전 필드 0을 반환한다.
 *   음수는 `!(-100) === false`라 지금도 흐르므로 **발현 조건은 정확히 0**이다.
 *   세팅 지점이 둘 — ④의 full 모드 합성값 재-strip도 같은 falsy라 엔진만 고치면 안 된다.
 *   근거: 시행령 §165⑤ · 같은 조 ④1호 단서
 *
 *   AP-FV-1~5   (#3)
 *   AP-MS-1~5   (#12)
 *   AP-PL-1~4   (#20)
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import {
  stockTransferInputSchema,
  addStockRefines,
} from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/**
 * route.ts와 **같은 순서**로 전 계층을 태운다.
 * Zod가 막으면 그 사실 자체를 반환한다 — 「차단됐다」와 「값이 틀렸다」를 구별하기 위함이다.
 */
function runFullStack(
  form: StockTransferFormData,
): { blocked: true; issues: string[] } | { blocked: false; result: StockTransferResult; body: Record<string, unknown> } {
  const body = buildStockTransferApiBody(form);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) {
    return { blocked: true, issues: parsed.error.issues.map((i) => i.message) };
  }
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return { blocked: false, result: calculateStockTransferTax(buildEngineInput(coerced)), body };
}

function baseForm(overrides: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "60",
    selfMarketCap: "2000000000",
    priorYearEndDate: "2024-12-31",
    acquisitionDate: "2020-01-01",
    transferDate: "2025-06-01",
    shareCount: "10000",
    totalIssuedShares: "1000000",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "500000000",
    filingType: "preliminary",
    filingDate: "2025-08-31",
    ...overrides,
  } as StockTransferFormData;
}

// ============================================================
// #3 — 액면가 모드 NI/NA strip
// ============================================================

describe("AP-FV (#3): 액면가 모드도 양도기준시가 입력을 엔진까지 보낸다", () => {
  /** 액면가 5,000 · 양도기준시가 = max(10,000×3/5 + 10,000×2/5, 10,000×80%) = 10,000 */
  const faceValueForm = (o: Partial<StockTransferFormData> = {}) =>
    baseForm({
      acquisitionMode: "face_value",
      bookLost: true,
      faceValuePerShare: "5000",
      transferYearNetIncomePerShare: "10000",
      transferYearNetAssetPerShare: "10000",
      ...o,
    });

  it("AP-FV-1: ④가 양도연도 순손익·순자산을 body에 싣는다", () => {
    const body = buildStockTransferApiBody(faceValueForm());
    expect(body.transferYearNetIncomePerShare).toBe(10_000);
    expect(body.transferYearNetAssetPerShare).toBe(10_000);
  });

  it("AP-FV-2: 취득가액 = 양도가액 × 액면가 ÷ 양도기준시가 (0이 아니다)", () => {
    const run = runFullStack(faceValueForm());
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    // 500,000,000 × 5,000 ÷ 10,000 = 250,000,000
    expect(run.result.acquisitionPrice).toBe(250_000_000);
  });

  it("AP-FV-3: 순손익가치 0(결손)이어도 80% 하한으로 분모가 선다", () => {
    // 순자산 10,000 · NI 0 → 가중평균 4,000 vs 하한 8,000 → 8,000
    const run = runFullStack(faceValueForm({ transferYearNetIncomePerShare: "0" }));
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    expect(run.result.acquisitionPrice).toBe(312_500_000); // 500,000,000 × 5,000 ÷ 8,000
  });

  it("AP-FV-4: 순자산 단독 평가 사유(§165④3)를 액면가 경로도 존중한다", () => {
    // netAssetOnlyReason 이 있으면 NI 를 보지 않고 순자산 그대로 → 분모 10,000
    const run = runFullStack(
      faceValueForm({
        transferYearNetIncomePerShare: "50000", // 존중하면 무시되어야 하는 값
        netAssetOnlyReason: "liquidation_or_owner_death",
      }),
    );
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    expect(run.result.acquisitionPrice).toBe(250_000_000); // 500,000,000 × 5,000 ÷ 10,000
  });

  it("AP-FV-5: ⑧ — 액면가 모드에서 순자산가치 미입력은 차단한다", () => {
    const errors = validateStep2Domestic(
      faceValueForm({ transferYearNetAssetPerShare: "" }),
    ).filter((e) => e.severity === "error");
    expect(errors.some((e) => e.field === "transferYearNetAssetPerShare")).toBe(true);
    // 순손익가치는 0 허용 — 결손 법인이 정상 입력이다
    const niZero = validateStep2Domestic(
      faceValueForm({ transferYearNetIncomePerShare: "0" }),
    ).filter((e) => e.severity === "error");
    expect(niZero.some((e) => e.field === "transferYearNetIncomePerShare")).toBe(false);
  });
});

// ============================================================
// #12 — 양도 매매사례가액 게이트
// ============================================================

describe("AP-MS (#12): 양도 매매사례가액은 취득측과 같은 게이트를 탄다", () => {
  it("AP-MS-1: 취득모드가 sale_case 가 아니면 stale 값을 싣지 않는다", () => {
    const body = buildStockTransferApiBody(
      baseForm({
        acquisitionMode: "actual",
        acquisitionActualInputMode: "per_share",
        perShareAcquisitionPrice: "40000",
        transferMarketSamplePrice: "10000", // 모드 전환 후 남은 값
      }),
    );
    expect(body.transferMarketSamplePrice).toBeUndefined();
    expect(body.transferMarketSampleDate).toBeUndefined();
    expect(body.transferMarketSampleCounterparty).toBeUndefined();
  });

  it("AP-MS-2: 그래서 양도가액이 치환되지 않는다", () => {
    const run = runFullStack(
      baseForm({
        acquisitionMode: "actual",
        acquisitionActualInputMode: "per_share",
        perShareAcquisitionPrice: "40000",
        transferMarketSamplePrice: "10000",
      }),
    );
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    expect(run.result.transferPrice).toBe(500_000_000);
  });

  it("AP-MS-3: sale_case + 비상장이면 종전대로 적용된다 (회귀 가드)", () => {
    const run = runFullStack(
      baseForm({
        acquisitionMode: "sale_case",
        perShareAcquisitionPrice: "40000",
        transferMarketSamplePrice: "10000",
      }),
    );
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    expect(run.result.transferPrice).toBe(100_000_000); // 10,000 × 10,000주
  });

  it("AP-MS-4: 양도측 단독 적용이어도 §176의2③1호·§163⑫ 인용이 남는다", () => {
    // 인용은 `appliedRules`(태그 union)가 아니라 `warnings`로 들어간다 — 기존 배선 그대로다.
    // 종전에는 취득측 분기에만 push가 있어 **양도측 단독이면 인용이 한 건도 안 남았다**.
    const run = runFullStack(
      baseForm({
        acquisitionMode: "sale_case",
        // 취득측 매매사례는 비우고 1주당 취득가액으로 대체 → 양도측 단독 적용
        perShareAcquisitionPrice: "40000",
        transferMarketSamplePrice: "10000",
      }),
    );
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    const notes = run.result.warnings.join(" ");
    expect(notes).toContain("176의2");
    expect(notes).toContain("163");
  });

  it("AP-MS-5: 상장주식은 엔진 가드가 양도측 치환을 막는다 (영§176의2③1호 본문 괄호)", () => {
    // 상장은 §176의2③1호 본문 괄호가 매매사례가액 자체를 배제한다.
    // UI 안내가 아니라 엔진이 막아야 한다 — 취득모드를 되돌리면 UI 차단은 사라진다.
    const run = runFullStack(
      baseForm({
        marketType: "kospi",
        acquisitionMode: "actual",
        acquisitionActualInputMode: "per_share",
        perShareAcquisitionPrice: "40000",
        transferMarketSamplePrice: "30000",
      }),
    );
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    expect(run.result.transferPrice).toBe(500_000_000);
  });
});

// ============================================================
// #20 — §165⑤ 환산 falsy 가드
// ============================================================

describe("AP-PL (#20): 취득 후 상장 환산은 「순손익가치 0」을 정상값으로 흘린다", () => {
  /** 사례48 축약 — 코스닥 대주주, 취득 후 상장 환산 simple 모드 */
  const postListingForm = (o: Partial<StockTransferFormData> = {}) =>
    baseForm({
      marketType: "kosdaq",
      shareCount: "5000",
      transferActualInputMode: "per_share",
      perShareTransferPrice: "20000",
      transferTotalPrice: "",
      acquisitionMode: "estimated",
      acquiredBeforeListing: true,
      listingDate: "2023-06-01",
      transferDatePriceAvg1Month: "20000",
      listingDatePriceAvg1Month: "10000",
      listingYearNetIncomePerShare: "5000",
      listingYearNetAssetPerShare: "5000",
      acquisitionYearNetIncomePerShare: "4000",
      acquisitionYearNetAssetPerShare: "4000",
      ...o,
    });

  it("AP-PL-1: 취득연도 순손익가치 0 — 환산이 0으로 무너지지 않는다", () => {
    const run = runFullStack(postListingForm({ acquisitionYearNetIncomePerShare: "0" }));
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    expect(run.result.acquisitionPrice).toBeGreaterThan(0);
  });

  it("AP-PL-2: 그 경우 §165④1 단서(순자산 80%)가 취득연도 평가액이 된다", () => {
    const run = runFullStack(postListingForm({ acquisitionYearNetIncomePerShare: "0" }));
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    const d = run.result.postListingDetail;
    expect(d).toBeDefined();
    // 4,000 × 80% = 3,200 (가중평균 1,600 < 하한 3,200)
    expect(d!.acquisitionYearPerShareValue).toBe(3_200);
  });

  it("AP-PL-3: ④가 0을 strip 하지 않는다 — simple 모드", () => {
    const body = buildStockTransferApiBody(
      postListingForm({ acquisitionYearNetIncomePerShare: "0" }),
    );
    expect(body.acquisitionYearNetIncomePerShare).toBe(0);
  });

  it("AP-PL-3b: ④가 adapter 합성 0을 strip 하지 않는다 — full 모드 (세팅 지점 2)", () => {
    // **세팅 지점이 둘이다.** full 모드는 취득연도 값을 결산서 행에서 합성하므로
    // 플랫 칸이 비어 있고, ④의 falsy 덮어쓰기가 합성된 0을 흘려보내면 body에 값이 아예 없다.
    // 엔진만 고치면 이 경로는 `undefined`를 받아 같은 조기반환이 그대로 발동한다.
    // 결손 법인(순손익액 0)은 사용자가 "0"을 타이핑하지 않아도 이 상태에 도달한다.
    const body = buildStockTransferApiBody(
      postListingForm({
        unlistedDetailMode: "full",
        listingPriceDates: ["2023-06-01", "2023-06-02"],
        listingPriceClosing: ["10000", "10000"],
        listingPriceBasisDate: "2023-06-30",
        niShareCountListing: "5000",
        niAddRow1Listing: "25000000",
        naShareCountListing: "5000",
        naAssetTotalRow1Listing: "25000000",
        // 취득연도 — 순손익액 0(결손), 순자산 20,000,000 / 5,000주 = 4,000
        niShareCountAcq: "5000",
        niAddRow1Acq: "0",
        naShareCountAcq: "5000",
        naAssetTotalRow1Acq: "20000000",
        // 플랫 칸은 비어 있다 — full 모드에서는 합성값이 정본이다
        acquisitionYearNetIncomePerShare: "",
        acquisitionYearNetAssetPerShare: "",
      }),
    );
    expect(body.acquisitionYearNetIncomePerShare).toBe(0);
    expect(body.acquisitionYearNetAssetPerShare).toBe(4_000);
  });

  it("AP-PL-4: 값이 정상이면 종전과 같다 (회귀 가드)", () => {
    const run = runFullStack(postListingForm());
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    const d = run.result.postListingDetail;
    expect(d).toBeDefined();
    expect(d!.acquisitionYearPerShareValue).toBe(4_000); // 가중평균 4,000 = 하한 3,200 초과
    expect(run.result.acquisitionPrice).toBeGreaterThan(0);
  });
});
