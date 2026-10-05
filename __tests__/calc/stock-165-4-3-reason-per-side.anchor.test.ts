/**
 * 영 §165④3 순자산 단독 사유 — **양도 당시·취득 당시 평가마다 따로** (PR-6)
 *
 * 계획서 `docs/00-pm/stock-165-4-valuation-followups.plan.md` §14
 *
 * §165④는 양도 당시·취득 당시 기준시가를 **각각** 평가한다(1호 가·나목 「양도일 또는 취득일이 속하는
 * 사업연도」). 3호 사유도 평가 시점의 사실이다 — 구 다목 「양도일 또는 취득일이 속하는 사업연도 전 3년」·
 * 라목 「평가기준일 현재」, 나목은 서울고법 2024누52016(양도일로부터 역산하여 사업개시 후 1년 미만).
 * 종전: 사유 칸 하나 → 양측 함께 단독. 「양도측만」·「취득측만」을 입력할 수 없었다.
 *
 *   PS-1  양측 경로 4조합 (없음 · 양도만 · 취득만 · 양측)
 *   PS-2  필수 입력 — 단독인 쪽만 순손익가치를 요구하지 않는다 (⑧·⑫)
 *   PS-3  취득측만 경로 — 취득일 거래정지 · 매매사례가액 개산공제는 **취득 사유**만 읽는다
 *   PS-4  양도측만 경로 — 사례 49(취득시 장부분실 액면가)는 **양도 사유**만 읽는다
 *   PS-5  연혁 게이트는 시점마다 — 취득 사유 칸에도 같은 차단
 *   PS-6  §165⑧1호 후단(라목 주식등)은 양측 공통
 *   PS-7  echo — 결과뷰가 시점별 근거를 받는다
 *   PS-8  저장값 이전 — 종전 레코드의 사유 하나는 양측이었다
 *   PS-10 §165⑨ 전전연도는 양도 당시 평가와 같은 기준
 *   PS-11 연혁 차단은 사유를 읽는 시점에서만 — 사례 49에 남은 취득 사유 · 이월과세 증여자 분모의 양도 사유
 *   PS-12 엔진 직접 — §99①4 액면가 경로
 *   PS-9  증여 부담부 주식 — 시점별 사유 · 종전 레코드(키 없음) · «없음» = null
 *
 * 공통 입력(2022 양도 — 80% 하한 시행): 양도 6,000,000,000 · 8,000주
 *   양도연도 순손익 150,000 / 순자산 200,000 → 가중 170,000(하한 160,000 미발동) · 단독 200,000
 *   취득연도 순손익   6,000 / 순자산  10,000 → 가중 7,600 → 하한 8,000          · 단독 10,000
 *   없음   : 6e9 × 8,000  ÷ 170,000 = 282,352,941
 *   양도만 : 6e9 × 8,000  ÷ 200,000 = 240,000,000
 *   취득만 : 6e9 × 10,000 ÷ 170,000 = 352,941,176
 *   양측   : 6e9 × 10,000 ÷ 200,000 = 300,000,000
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { calcTransferStdPriceForFaceValue } from "@/lib/tax-engine/stock-transfer/stock-valuation-unlisted";
import { buildBurdenedUnlistedValuationFields } from "@/lib/calc/gift-burdened-stock-unlisted";
import { missingBurdenedUnlistedValuationInputs } from "@/lib/calc/gift-burdened-stock-unlisted";

type Reason = StockTransferFormData["netAssetOnlyReason"];

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "시점별사유법인",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "0",
    totalIssuedShares: "40000",
    priorYearEndDate: "2021-12-31",
    acquisitionDate: "2010-01-01",
    transferDate: "2022-06-01",
    shareCount: "8000",
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "6000000000",
    acquisitionMode: "estimated",
    transferYearNetIncomePerShare: "150000",
    transferYearNetAssetPerShare: "200000",
    acquisitionYearNetIncomePerShare: "6000",
    acquisitionYearNetAssetPerShare: "10000",
    filingType: "preliminary",
    filingDate: "2022-08-31",
    netAssetOnlyReason: "",
    acquisitionNetAssetOnlyReason: "",
    ...o,
  } as StockTransferFormData;
}
const T = (r: Reason): Partial<StockTransferFormData> => ({ netAssetOnlyReason: r });
const A = (r: Reason): Partial<StockTransferFormData> => ({ acquisitionNetAssetOnlyReason: r });

type Run =
  | { blocked: true; issues: { path: string; message: string }[]; step2: { field: string; message: string }[] }
  | { blocked: false; r: StockTransferResult; step2: { field: string; message: string }[] };

function run(f: StockTransferFormData): Run {
  const step2 = validateStep2Domestic(f)
    .filter((e) => e.severity === "error")
    .map((e) => ({ field: e.field, message: e.message }));
  const body = buildStockTransferApiBody(f) as Record<string, unknown>;
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success)
    return {
      blocked: true,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      step2,
    };
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return { blocked: false, r: calculateStockTransferTax(buildEngineInput(coerced)), step2 };
}
function ok(x: Run): StockTransferResult {
  if (x.blocked) throw new Error(`blocked: ${x.issues.map((i) => `${i.path} ${i.message}`).join(" | ")}`);
  expect(x.step2).toEqual([]);
  return x.r;
}
const fields = (x: Run) => x.step2.map((e) => e.field);
const paths = (x: Run) => (x.blocked ? x.issues.map((i) => i.path) : []);

describe("PS-1: 양측 경로 4조합", () => {
  it.each<[string, Partial<StockTransferFormData>, number]>([
    ["없음", {}, 282_352_941],
    ["양도만", T("no_business_or_short_or_closed"), 240_000_000],
    ["취득만", A("no_business_or_short_or_closed"), 352_941_176],
    ["양측", { ...T("liquidation_or_owner_death"), ...A("liquidation_or_owner_death") }, 300_000_000],
  ])("%s → %d", (_, o, expected) => {
    expect(ok(run(form(o))).acquisitionPrice).toBe(expected);
  });
  it("양도·취득 사유가 서로 달라도 된다 — 양도 구 다목 · 취득 나목 → 양측 단독 300,000,000", () => {
    expect(ok(run(form({ ...T("consecutive_loss_3y"), ...A("no_business_or_short_or_closed") }))).acquisitionPrice).toBe(
      300_000_000,
    );
  });
});

describe("PS-2: 필수 입력 — 단독인 쪽만 순손익가치 면제", () => {
  it("양도만 단독 + 양도 순손익 빈칸 → 통과 / 취득 순손익 빈칸 → ⑧·⑫ 차단", () => {
    expect(ok(run(form({ ...T("no_business_or_short_or_closed"), transferYearNetIncomePerShare: "" }))).acquisitionPrice).toBe(
      240_000_000,
    );
    const x = run(form({ ...T("no_business_or_short_or_closed"), acquisitionYearNetIncomePerShare: "" }));
    expect(fields(x)).toContain("acquisitionYearNetIncomePerShare");
    expect(paths(x)).toContain("acquisitionYearNetIncomePerShare");
  });
  it("취득만 단독 + 취득 순손익 빈칸 → 통과 / 양도 순손익 빈칸 → ⑧·⑫ 차단", () => {
    expect(ok(run(form({ ...A("no_business_or_short_or_closed"), acquisitionYearNetIncomePerShare: "" }))).acquisitionPrice).toBe(
      352_941_176,
    );
    const x = run(form({ ...A("no_business_or_short_or_closed"), transferYearNetIncomePerShare: "" }));
    expect(fields(x)).toContain("transferYearNetIncomePerShare");
    expect(paths(x)).toContain("transferYearNetIncomePerShare");
  });
});

describe("PS-3: 취득측만 경로 — 취득 사유만 읽는다", () => {
  const halt = {
    marketType: "kosdaq" as const,
    acquisitionStdMode: "halt_acquisition" as const,
    transferDatePriceAvg1Month: "750000",
  };
  it("취득일 거래정지 — 취득 사유 → 6e9 × 10,000 ÷ 750,000 = 80,000,000 · echo", () => {
    const r = ok(run(form({ ...halt, ...A("no_business_or_short_or_closed") })));
    expect(r.acquisitionPrice).toBe(80_000_000);
    expect(r.valuationDetail?.acquisitionNetAssetOnlyReason).toBe("no_business_or_short_or_closed");
  });
  it("취득일 거래정지 — 양도 사유만 → 취득측 가중평균+하한 8,000 → 64,000,000", () => {
    expect(ok(run(form({ ...halt, ...T("no_business_or_short_or_closed") }))).acquisitionPrice).toBe(64_000_000);
  });
  const sale = { acquisitionMode: "sale_case" as const, acquisitionMarketSamplePrice: "30000" };
  it("매매사례가액 개산공제 기준 — 취득 사유 → 10,000 × 8,000 = 80,000,000", () => {
    expect(ok(run(form({ ...sale, ...A("no_business_or_short_or_closed") }))).estimatedBase).toBe(80_000_000);
  });
  it("매매사례가액 개산공제 기준 — 양도 사유만 → 8,000 × 8,000 = 64,000,000", () => {
    expect(ok(run(form({ ...sale, ...T("no_business_or_short_or_closed") }))).estimatedBase).toBe(64_000_000);
  });
});

describe("PS-4: 사례 49 — 양도 사유만 읽는다", () => {
  const c49 = { acqFaceValueOnly: true, acqFaceValuePerShare: "5000" };
  it("양도 사유 → 6e9 × 5,000 ÷ 200,000 = 150,000,000", () => {
    expect(ok(run(form({ ...c49, ...T("no_business_or_short_or_closed") }))).acquisitionPrice).toBe(150_000_000);
  });
  it("취득 사유만(화면에 없는 남은 값) → 양도 가중 170,000 → 176,470,588", () => {
    expect(ok(run(form({ ...c49, ...A("no_business_or_short_or_closed") }))).acquisitionPrice).toBe(176_470_588);
  });
});

describe("PS-5: 연혁 게이트는 시점마다", () => {
  it("2022 양도 + 취득 사유 현행 다목 → `acquisitionNetAssetOnlyReason` 칸 차단 (⑧·⑫ 같은 문구)", () => {
    const x = run(form(A("stock_holding_company")));
    expect(x.step2.filter((e) => e.field === "acquisitionNetAssetOnlyReason").map((e) => e.message)).toEqual([
      UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA,
    ]);
    expect(x.blocked).toBe(true);
    if (x.blocked)
      expect(x.issues.filter((i) => i.path === "acquisitionNetAssetOnlyReason").map((i) => i.message)).toEqual([
        UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA,
      ]);
    expect(fields(x)).not.toContain("netAssetOnlyReason");
  });
  it("2022 양도 + 취득 사유 구 다목 → 통과 352,941,176", () => {
    expect(ok(run(form(A("consecutive_loss_3y")))).acquisitionPrice).toBe(352_941_176);
  });
  it("취득측만 경로(매매사례)에 남은 양도 사유는 막지 않는다 — 칸이 화면에 없다", () => {
    const x = run(form({ acquisitionMode: "sale_case", acquisitionMarketSamplePrice: "30000", ...T("stock_holding_company") }));
    expect(fields(x)).not.toContain("netAssetOnlyReason");
    expect(paths(x)).not.toContain("netAssetOnlyReason");
  });
});

describe("PS-6: §165⑧1호 후단(라목 주식등)은 양측 공통", () => {
  it("2024 양도 · 라목 · 사유 없음 → 양측 단독 300,000,000", () => {
    const r = ok(
      run(
        form({
          transferDate: "2024-06-01",
          priorYearEndDate: "2023-12-31",
          filingDate: "2024-08-31",
          isHeavyRealEstateForRate: true,
        }),
      ),
    );
    expect(r.acquisitionPrice).toBe(300_000_000);
    expect(r.valuationDetail?.netAssetOnlyReason).toBe("ra_mok_heavy_real_estate");
    expect(r.valuationDetail?.acquisitionNetAssetOnlyReason).toBe("ra_mok_heavy_real_estate");
  });
});

describe("PS-7: echo", () => {
  it("취득만 → valuationDetail.netAssetOnlyReason 없음 · acquisitionNetAssetOnlyReason 나목", () => {
    const r = ok(run(form(A("no_business_or_short_or_closed"))));
    expect(r.valuationDetail?.netAssetOnlyReason).toBeUndefined();
    expect(r.valuationDetail?.acquisitionNetAssetOnlyReason).toBe("no_business_or_short_or_closed");
  });
  it("양도만 → 반대", () => {
    const r = ok(run(form(T("no_business_or_short_or_closed"))));
    expect(r.valuationDetail?.netAssetOnlyReason).toBe("no_business_or_short_or_closed");
    expect(r.valuationDetail?.acquisitionNetAssetOnlyReason).toBeUndefined();
  });
});

describe("PS-8: 저장값 이전", () => {
  it("취득 사유 키가 없는 종전 레코드 → 양도 사유를 복사(종전 의미 = 양측)", () => {
    const legacy = { ...form(T("liquidation_or_owner_death")) } as Record<string, unknown>;
    delete legacy.acquisitionNetAssetOnlyReason;
    const n = normalizeStockFormData(legacy);
    expect(n.netAssetOnlyReason).toBe("liquidation_or_owner_death");
    expect(n.acquisitionNetAssetOnlyReason).toBe("liquidation_or_owner_death");
    expect(ok(run(n)).acquisitionPrice).toBe(300_000_000);
  });
  it("키가 있으면 빈 값도 그대로 — 사용자가 고른 «없음»", () => {
    const n = normalizeStockFormData(form({ ...T("liquidation_or_owner_death"), ...A("") }));
    expect(n.acquisitionNetAssetOnlyReason).toBe("");
  });
  it("구 다목도 보존", () => {
    expect(normalizeStockFormData(form(A("consecutive_loss_3y"))).acquisitionNetAssetOnlyReason).toBe("consecutive_loss_3y");
  });
});

describe("PS-9: 증여 부담부 주식 — 시점별 사유 · 종전 레코드", () => {
  const base = {
    transferYearNetIncomePerShare: 1,
    transferYearNetAssetPerShare: 1,
    acquisitionYearNetAssetPerShare: 1,
  };
  it("취득 사유 키가 없는 종전 레코드 → 양도 사유가 취득에도 실린다 · 취득 순손익 면제", () => {
    const legacy = { ...base, netAssetOnlyReason: "liquidation_or_owner_death" as const };
    expect(buildBurdenedUnlistedValuationFields(legacy).acquisitionNetAssetOnlyReason).toBe("liquidation_or_owner_death");
    expect(missingBurdenedUnlistedValuationInputs(legacy)).toEqual([]);
  });
  it("취득 사유 null(«없음») → 싣지 않는다 · 취득 순손익 필수", () => {
    const fresh = { ...base, netAssetOnlyReason: "liquidation_or_owner_death" as const, acquisitionNetAssetOnlyReason: null };
    expect("acquisitionNetAssetOnlyReason" in buildBurdenedUnlistedValuationFields(fresh)).toBe(false);
    expect(missingBurdenedUnlistedValuationInputs(fresh)).toEqual(["취득일 직전 사업연도 1주당 순손익가치"]);
  });
  it("취득만 사유 → 양도 순손익은 필수", () => {
    const acqOnly = {
      transferYearNetAssetPerShare: 1,
      acquisitionYearNetAssetPerShare: 1,
      acquisitionNetAssetOnlyReason: "no_business_or_short_or_closed" as const,
    };
    expect(missingBurdenedUnlistedValuationInputs(acqOnly)).toEqual(["양도일(증여일) 직전 사업연도 1주당 순손익가치"]);
    expect(buildBurdenedUnlistedValuationFields(acqOnly).acquisitionNetAssetOnlyReason).toBe("no_business_or_short_or_closed");
    expect("netAssetOnlyReason" in buildBurdenedUnlistedValuationFields(acqOnly)).toBe(false);
  });
});

describe("PS-10: §165⑨ 월할 보정 — 전전연도는 양도 당시 평가와 같은 기준", () => {
  // 2022-01-10 취득 · 2022-06-01 양도(같은 사업연도) → 보유월수 5 · 직전 사업연도 12개월
  // 양도만 단독: 양도 순자산 100,000 = 취득 가중 (100,000×3+100,000×2)÷5 = 100,000 → 같아서 보정 발동
  // 전전연도(순손익 0 · 순자산 50,000) — 양도 기준(단독)이면 50,000 → 보정 ⌊(100,000×12 + 50,000×5)÷12⌋ = 120,833
  //   (가중평균으로 재면 20,000 → 하한 40,000 → 125,000 = 4,800,000,000)
  // 환산 = 6e9 × 100,000 ÷ 120,833 = 4,965,530,939
  it("양도만 단독 → 전전연도도 순자산 단독 → 4,965,530,939", () => {
    const r = ok(
      run(
        form({
          ...T("no_business_or_short_or_closed"),
          acquisitionDate: "2022-01-10",
          transferYearNetIncomePerShare: "",
          transferYearNetAssetPerShare: "100000",
          acquisitionYearNetIncomePerShare: "100000",
          acquisitionYearNetAssetPerShare: "100000",
          unlistedSameBizYearToggle: true,
          prePriorYearNetIncomePerShare: "0",
          prePriorYearNetAssetPerShare: "50000",
          priorBizYearMonths: "12",
        }),
      ),
    );
    expect(r.valuationDetail?.section1659Detail?.prePrior).toBe(50_000);
    expect(r.acquisitionPrice).toBe(4_965_530_939);
  });
});

describe("PS-11: 사유를 읽는 시점에서만 연혁 차단 — 남은 값·양도측만 경로", () => {
  it("사례 49 + 2022 양도 + 화면에 없는 취득 사유(현행 다목) → 막지 않는다", () => {
    const x = run(form({ acqFaceValueOnly: true, acqFaceValuePerShare: "5000", ...A("stock_holding_company") }));
    expect(fields(x)).not.toContain("acquisitionNetAssetOnlyReason");
    expect(paths(x)).not.toContain("acquisitionNetAssetOnlyReason");
  });
  it("이월과세 증여자 기준 환산(실지거래가 취득) + 2022 양도 + 양도 사유 현행 다목 → 양도 칸 차단 (분모가 양도 당시 평가)", () => {
    const x = run(
      form({
        acquisitionCause: "carryover_gift",
        donorAcquisitionDate: "2005-06-01",
        donorRelation: "spouse",
        donorAcquisitionMethod: "estimated",
        donorAcquisitionStdPrice: "5000",
        acquisitionMode: "actual",
        acquisitionActualInputMode: "per_share",
        perShareAcquisitionPrice: "30000",
        ...T("stock_holding_company"),
      }),
    );
    expect(fields(x)).toContain("netAssetOnlyReason");
    expect(paths(x)).toContain("netAssetOnlyReason");
  });
});

describe("PS-12: 엔진 직접 — §99①4 액면가 경로의 양도기준시가는 양도 사유만", () => {
  const base = {
    transferDate: new Date("2022-06-01"),
    transferYearNetIncomePerShare: 150_000,
    transferYearNetAssetPerShare: 200_000,
  } as unknown as StockTransferInput;
  it("양도 사유 → 순자산 200,000 / 취득 사유만 → 가중 170,000", () => {
    expect(calcTransferStdPriceForFaceValue({ ...base, netAssetOnlyReason: "liquidation_or_owner_death" }).perShare).toBe(200_000);
    expect(
      calcTransferStdPriceForFaceValue({ ...base, acquisitionNetAssetOnlyReason: "liquidation_or_owner_death" }).perShare,
    ).toBe(170_000);
  });
});
