/**
 * anchor: 주식 §97의2④ 가업상속공제 의제 취득가액 — **폼 → ④ body → Zod(⑫⑩) → ⑭ → 엔진 → ⑧ 배선** (PR-1d · 단건 취득)
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.3·§7.4 · Q-7 · Q-10
 *
 * ⚠️ ⑫⑬⑭는 TypeScript가 잡지 못한다 — 그래서 「값이 세액까지 도달했는가」를 **세액으로** 단언한다.
 * 🔑 폼 필드에서 출발한다(`feedback_api_trigger_without_input_path_is_noop`).
 *
 * 기준 사례(계획서 §7.2 F1-2): 비상장 대주주 비중소 · 1만 주 · 상속평가 5만/주 · 피상속인 5천/주 · 양도 8만/주 ·
 *   상속 2024-03-01 · 양도 2026-06-01 · 법인 총자산 50억/사업무관 10억(적용률 4/5)
 *   → 의제 취득가액 140,000,000 · 산출세액 149,375,000 · §18의2⑩ 공제 89,875,000.
 *
 * A ④ body(술어 통과/불통과·era 쌍·잔존값 inert) · B 세액 도달 · C ⑧ · D ⑧↔⑩ 패리티 격자 · E ③ 구 이력 · F ⑥ 미리보기
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildStockTransferApiBody, callStockTransferTaxAPI, callStockTransferTaxAggregateAPI } from "@/lib/calc/stock-transfer-tax-api";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import { stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { stockFamilyBusinessInputError } from "@/lib/tax-engine/stock-transfer/stock-family-business-input-check";
import { validateAllSteps } from "@/lib/calc/stock-transfer-tax-validate";
import { validateStockFamilyBusiness } from "@/lib/calc/stock-transfer-tax-validate-family-business";
import { allowsStockFamilyBusiness, previewStockFbAcquisitionPrice } from "@/lib/calc/stock-family-business";

/** 비상장 대주주 비중소 · 1만 주 · 상속 2024-03-01 · 양도 2026-06-01 — 법인 ③2호 쌍(50억/10억)이 채워진 가업 ON 폼 */
function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "예제법인",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "60",
    selfMarketCap: "2000000000",
    totalIssuedShares: "1000000",
    priorYearEndDate: "2025-12-31",
    acquisitionCause: "inheritance",
    decedentAcquisitionDate: "2015-01-01",
    acquisitionDate: "2024-03-01",
    transferDate: "2026-06-01",
    shareCount: "10000",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: "80000",
    acquisitionMode: "actual",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: "50000",
    expenseMode: "actual",
    actualExpenses: "0",
    filingType: "preliminary",
    filingDate: "2026-08-31",
    familyBusinessInheritance: true,
    fbDecedentPerSharePrice: "5000",
    fbCorpTotalAssets: "5000000000",
    fbCorpNonBusinessAssets: "1000000000",
    ...o,
  };
}

/** 구 ③ 쌍(8/10)만 채운 폼 — 양도일 2026-02-26 이전 */
const OLD_PAIR = { fbDeductionAmount: "8", fbBusinessEstateValue: "10" } as const;

function runPipeline(f: StockTransferFormData) {
  const body = buildStockTransferApiBody(f);
  const parsed = stockTransferInputSchema.safeParse(body);
  if (!parsed.success) throw new Error(`zod 실패: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return { body, result: calculateStockTransferTax(buildEngineInput(coerced)) };
}

const fbErrors = (f: StockTransferFormData) => validateStockFamilyBusiness(f);

describe("A. ④ body — 술어 통과 시에만, 양도일 era의 쌍만", () => {
  it("A-1 신 ③2호(양도 2026-06-01) — 법인 쌍만 실린다(반대편 쌍 잔존값은 버린다)", () => {
    const body = buildStockTransferApiBody(form({ ...OLD_PAIR }));
    expect(body.familyBusinessInheritance).toEqual({
      decedentAcquisitionPricePerShare: 5_000,
      fbRateBasis: { kind: "corporate_business_assets", totalAssets: 5_000_000_000, nonBusinessAssets: 1_000_000_000 },
    });
  });

  it("A-2 구 ③(양도 2026-02-26) — 공제금액 쌍만 실린다(법인 쌍 잔존값은 버린다)", () => {
    const body = buildStockTransferApiBody(form({ transferDate: "2026-02-26", ...OLD_PAIR }));
    expect(body.familyBusinessInheritance).toEqual({
      decedentAcquisitionPricePerShare: 5_000,
      fbRateBasis: { kind: "deduction_ratio", deductionAmount: 8, businessEstateValue: 10 },
    });
  });

  it("A-3 경계 — 2026-02-27은 신 ③2호", () => {
    const body = buildStockTransferApiBody(form({ transferDate: "2026-02-27", ...OLD_PAIR }));
    expect((body.familyBusinessInheritance as { fbRateBasis: { kind: string } }).fbRateBasis.kind).toBe("corporate_business_assets");
  });

  it("A-4 토글 OFF — 키가 없다", () => {
    expect(buildStockTransferApiBody(form({ familyBusinessInheritance: false })).familyBusinessInheritance).toBeUndefined();
  });

  it("A-5 피상속인 자본적지출 — 0·빈칸은 보내지 않고 양수만 보낸다", () => {
    const fbOf = (c: string) =>
      (buildStockTransferApiBody(form({ fbDecedentCapitalExpenditure: c })).familyBusinessInheritance as Record<string, unknown>);
    expect("decedentCapitalExpenditure" in fbOf("")).toBe(false);
    expect("decedentCapitalExpenditure" in fbOf("0")).toBe(false);
    expect(fbOf("30000000").decedentCapitalExpenditure).toBe(30_000_000);
  });

  it("A-6 잔존값 inert — 술어 불통과 폼은 ON·값이 있어도 미전송", () => {
    const inert: Array<[string, Partial<StockTransferFormData>]> = [
      ["취득원인 매매", { acquisitionCause: "purchase" }],
      ["취득원인 증여", { acquisitionCause: "gift" }],
      ["취득가액 환산", { acquisitionMode: "estimated" }],
      ["취득가액 매매사례", { acquisitionMode: "sale_case" }],
      ["일자별 다건 취득", { acquisitionActualInputMode: "lots" }],
      ["분할 모드", { lotsMode: "split" }],
      ["국외주식", { marketType: "foreign_stock" }],
      ["국외전출세", { marketType: "exit_tax" }],
    ];
    for (const [name, patch] of inert) {
      const f = form(patch);
      expect(allowsStockFamilyBusiness(f), name).toBe(false);
      expect(buildStockTransferApiBody(f).familyBusinessInheritance, name).toBeUndefined();
      // ⑧도 검증하지 않는다 — 안 보이는 값이 막지 않는다
      expect(fbErrors({ ...f, fbDecedentPerSharePrice: "", fbCorpTotalAssets: "" }), name).toEqual([]);
    }
  });

  it("A-7 합계 모드(취득가액 합계)도 술어 통과 — 전송된다", () => {
    const f = form({ acquisitionActualInputMode: "total", acquisitionTotalPrice: "500000000" });
    expect(allowsStockFamilyBusiness(f)).toBe(true);
    const body = buildStockTransferApiBody(f);
    expect(body.acquisitionTotalPrice).toBe(500_000_000);
    expect(body.familyBusinessInheritance).toBeDefined();
  });

  describe("A-8 단건·다종목 호출이 같은 빌더를 거쳐 fetch body에 실린다(⑬)", () => {
    afterEach(() => vi.unstubAllGlobals());
    const stubFetch = () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: {} }) });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    };
    it("단건 callStockTransferTaxAPI", async () => {
      const fetchMock = stubFetch();
      await callStockTransferTaxAPI(form());
      const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(sent.familyBusinessInheritance.fbRateBasis.kind).toBe("corporate_business_assets");
    });
    it("다종목 callStockTransferTaxAggregateAPI items[]", async () => {
      const fetchMock = stubFetch();
      await callStockTransferTaxAggregateAPI([form({ familyBusinessInheritance: false }), form()]);
      const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(sent.items[0].familyBusinessInheritance).toBeUndefined();
      expect(sent.items[1].familyBusinessInheritance.decedentAcquisitionPricePerShare).toBe(5_000);
    });
  });
});

describe("B. 입력이 세액까지 도달한다 (⑫⑩⑭ 엔진)", () => {
  it("B-1 신 ③2호 — 의제 취득가액 140,000,000 · 산출세액 149,375,000 · §18의2⑩ 공제 89,875,000", () => {
    const { result } = runPipeline(form());
    expect(result.acquisitionPrice).toBe(140_000_000);
    expect(result.calculatedTax).toBe(149_375_000);
    expect(result.familyBusinessDetail?.creditAmount).toBe(89_875_000);
    expect(result.familyBusinessDetail?.fbItemCount).toBe(1);
  });

  it("B-2 구 ③(양도 2026-02-26) 8/10 — 같은 적용률 4/5라 같은 의제 취득가액", () => {
    const { result } = runPipeline(form({ transferDate: "2026-02-26", ...OLD_PAIR }));
    expect(result.acquisitionPrice).toBe(140_000_000);
    expect(result.familyBusinessDetail?.appliedRateBasis?.kind).toBe("deduction_ratio");
  });

  it("B-3 합계 모드 — 5억 그대로 주입돼 같은 140,000,000", () => {
    const { result } = runPipeline(form({ acquisitionActualInputMode: "total", acquisitionTotalPrice: "500000000" }));
    expect(result.acquisitionPrice).toBe(140_000_000);
  });

  it("B-4 OFF — 일반 §97(상속평가 5억) 산출세액 59,500,000 · 의제 카드 없음", () => {
    const { result } = runPipeline(form({ familyBusinessInheritance: false }));
    expect(result.acquisitionPrice).toBe(500_000_000);
    expect(result.calculatedTax).toBe(59_500_000);
    expect(result.familyBusinessDetail).toBeUndefined();
  });

  it("B-5 피상속인 자본적지출 — base 가산 × 적용률(30,000,000 → +24,000,000)", () => {
    const { result } = runPipeline(form({ fbDecedentCapitalExpenditure: "30000000" }));
    expect(result.acquisitionPrice).toBe(164_000_000);
    expect(result.familyBusinessDetail?.decedentCapitalExpenditure).toBe(30_000_000);
  });
});

describe("C. ⑧ — 필수 누락·경계 전환·값 관계", () => {
  it("C-1 완결 폼은 가업상속 오류가 없다 (전체 검증에서도)", () => {
    expect(fbErrors(form())).toEqual([]);
    const all = validateAllSteps(form()).filter((e) => e.severity === "error");
    expect(all, JSON.stringify(all)).toEqual([]);
  });

  it("C-2 빈칸 — 필드별로 지목한다(자동 0·자동 채움 없음)", () => {
    const e = fbErrors(form({ fbDecedentPerSharePrice: "", fbCorpTotalAssets: "", fbCorpNonBusinessAssets: "" }));
    expect(e.map((x) => x.field).sort()).toEqual(["fbCorpNonBusinessAssets", "fbCorpTotalAssets", "fbDecedentPerSharePrice"]);
    expect(e.every((x) => x.severity === "error")).toBe(true);
  });

  it("C-3 사업무관자산 0은 유효한 입력(전부 사업용) — 빈칸과 구분", () => {
    expect(fbErrors(form({ fbCorpNonBusinessAssets: "0" }))).toEqual([]);
    expect(fbErrors(form({ fbCorpNonBusinessAssets: "" })).map((x) => x.field)).toEqual(["fbCorpNonBusinessAssets"]);
  });

  it("C-4 양도일을 경계 건너로 바꾸면 새 쌍이 빈칸이라 막힌다 (조용한 전환 없음)", () => {
    // 신 쌍만 채운 폼 → 양도일을 02-26으로 → 구 쌍 빈칸
    const toOld = fbErrors(form({ transferDate: "2026-02-26" }));
    expect(toOld.map((x) => x.field).sort()).toEqual(["fbBusinessEstateValue", "fbDeductionAmount"]);
    // 구 쌍만 채운 폼 → 양도일을 02-27로 → 신 쌍 빈칸
    const toNew = fbErrors(form({ transferDate: "2026-02-27", fbCorpTotalAssets: "", fbCorpNonBusinessAssets: "", ...OLD_PAIR }));
    expect(toNew.map((x) => x.field).sort()).toEqual(["fbCorpNonBusinessAssets", "fbCorpTotalAssets"]);
  });

  it("C-5 값 관계 — 분자 > 분모는 공용 술어가 막는다(양 era)", () => {
    const oldEra = fbErrors(form({ transferDate: "2026-02-26", fbDeductionAmount: "11", fbBusinessEstateValue: "10" }));
    expect(oldEra).toHaveLength(1);
    expect(oldEra[0].field).toBe("fbDeductionAmount");
    expect(oldEra[0].message).toContain("가업상속공제금액이 가업상속 재산가액보다 클 수 없습니다");
    const newEra = fbErrors(form({ fbCorpNonBusinessAssets: "5000000001" }));
    expect(newEra).toHaveLength(1);
    expect(newEra[0].field).toBe("fbCorpNonBusinessAssets");
    expect(newEra[0].message).toContain("사업무관자산가액이 법인 총자산가액보다 클 수 없습니다");
  });

  it("C-6 피상속인 1주당 0은 막는다", () => {
    expect(fbErrors(form({ fbDecedentPerSharePrice: "0" })).map((x) => x.field)).toEqual(["fbDecedentPerSharePrice"]);
  });

  it("C-7 validateAllSteps(2단계)에 연결돼 있다", () => {
    const all = validateAllSteps(form({ fbDecedentPerSharePrice: "" }));
    expect(all.some((e) => e.field === "fbDecedentPerSharePrice")).toBe(true);
  });
});

describe("D. ⑧ ↔ ⑩ 패리티 격자 — ⑧ 통과 ⇒ 공용 술어·Zod 통과", () => {
  const causes = ["inheritance", "purchase", "gift"] as const;
  const modes: Array<Partial<StockTransferFormData>> = [
    { acquisitionMode: "actual", acquisitionActualInputMode: "per_share" },
    { acquisitionMode: "actual", acquisitionActualInputMode: "total", acquisitionTotalPrice: "500000000" },
    { acquisitionMode: "actual", acquisitionActualInputMode: "lots" },
    { acquisitionMode: "estimated" },
    { lotsMode: "split" },
  ];
  const dates = ["2026-02-26", "2026-02-27", ""];
  const pairs: Array<Partial<StockTransferFormData>> = [
    { fbDeductionAmount: "", fbBusinessEstateValue: "", fbCorpTotalAssets: "", fbCorpNonBusinessAssets: "" },
    { ...OLD_PAIR, fbCorpTotalAssets: "", fbCorpNonBusinessAssets: "" },
    { fbDeductionAmount: "", fbBusinessEstateValue: "" }, // 신 쌍만(form 기본)
    { ...OLD_PAIR }, // 양 쌍 완결
    { fbDeductionAmount: "11", fbBusinessEstateValue: "10", fbCorpTotalAssets: "10", fbCorpNonBusinessAssets: "11" }, // 관계 오류 양쪽
    { fbDeductionAmount: "0", fbBusinessEstateValue: "10", fbCorpTotalAssets: "10", fbCorpNonBusinessAssets: "0" }, // 0 경계
  ];
  const capexes = ["", "0", "7000"];
  const perShares = ["5000", "0", ""];

  it("⑧이 통과한 모든 칸에서 공용 술어와 Zod가 FB 사유로 막지 않는다 (격자 전수)", () => {
    let cells = 0;
    let blockedBy8 = 0;
    let passed8WithFb = 0;
    for (const cause of causes) {
      for (const mode of modes) {
        for (const transferDate of dates) {
          for (const pair of pairs) {
            for (const capex of capexes) {
              for (const ps of perShares) {
                const f = form({
                  acquisitionCause: cause,
                  transferDate,
                  fbDecedentCapitalExpenditure: capex,
                  fbDecedentPerSharePrice: ps,
                  ...mode,
                  ...pair,
                });
                cells++;
                const e8 = fbErrors(f);
                if (e8.length > 0) {
                  blockedBy8++;
                  continue;
                }
                const body = buildStockTransferApiBody(f);
                if (body.familyBusinessInheritance) passed8WithFb++;
                // ⑩ refine(=공용 술어)이 FB 사유로 막지 않는다
                const parsed = stockTransferInputSchema.safeParse(body);
                const fbIssues = parsed.success
                  ? []
                  : parsed.error.issues.filter((i) => i.message.startsWith("가업상속공제") || i.path[0] === "familyBusinessInheritance");
                expect(fbIssues, JSON.stringify({ cause, mode, transferDate, pair, capex, ps, fbIssues })).toEqual([]);
                // 엔진 입력으로 직접 건 공용 술어도 null
                if (transferDate) {
                  const engineIn = buildEngineInput(coerceDates(body, [...STOCK_DATE_FIELDS]));
                  expect(stockFamilyBusinessInputError(engineIn), JSON.stringify({ cause, mode, transferDate, pair, capex, ps })).toBeNull();
                }
              }
            }
          }
        }
      }
    }
    // 격자가 공허하지 않다 — ⑧이 막는 칸과 FB를 싣고 통과한 칸이 모두 실재한다
    expect(cells).toBe(3 * 5 * 3 * 6 * 3 * 3);
    expect(blockedBy8).toBeGreaterThan(100);
    expect(passed8WithFb).toBeGreaterThan(20);
  });

  it("⑩이 막는 FB 입력은 ⑧도 막는다 (술어 통과 폼 한정 — 서버가 막는데 UI가 통과시키는 모순 없음)", () => {
    for (const transferDate of ["2026-02-26", "2026-02-27"]) {
      for (const pair of pairs) {
        for (const ps of perShares) {
          const f = form({ transferDate, fbDecedentPerSharePrice: ps, ...pair });
          const parsed = stockTransferInputSchema.safeParse(buildStockTransferApiBody(f));
          const serverBlocks = !parsed.success && parsed.error.issues.some((i) => i.message.startsWith("가업상속공제"));
          if (serverBlocks) expect(fbErrors(f).length, JSON.stringify({ transferDate, pair, ps })).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("E. ③ normalize — 구 이력·잘못된 타입", () => {
  it("E-1 구 이력(신규 7필드 없음)은 false·빈 문자열로 복원된다", () => {
    const n = normalizeStockFormData({ acquisitionCause: "inheritance", perShareAcquisitionPrice: "50000" });
    expect(n.familyBusinessInheritance).toBe(false);
    for (const k of [
      "fbDecedentPerSharePrice",
      "fbDecedentCapitalExpenditure",
      "fbDeductionAmount",
      "fbBusinessEstateValue",
      "fbCorpTotalAssets",
      "fbCorpNonBusinessAssets",
    ] as const)
      expect(n[k], k).toBe("");
    // 구 이력 복원 결과는 전송되지 않는다
    expect(buildStockTransferApiBody({ ...form(), ...n }).familyBusinessInheritance).toBeUndefined();
  });

  it("E-2 저장된 값은 보존, 타입이 틀리면 default", () => {
    const n = normalizeStockFormData({ familyBusinessInheritance: true, fbDecedentPerSharePrice: "5000", fbCorpTotalAssets: 123 });
    expect(n.familyBusinessInheritance).toBe(true);
    expect(n.fbDecedentPerSharePrice).toBe("5000");
    expect(n.fbCorpTotalAssets).toBe("");
    expect(normalizeStockFormData({ familyBusinessInheritance: "yes" }).familyBusinessInheritance).toBe(false);
  });

  it("E-3 initial — false·빈 문자열", () => {
    const d = createInitialStockFormData();
    expect(d.familyBusinessInheritance).toBe(false);
    expect(d.fbDecedentPerSharePrice).toBe("");
  });
});

describe("F. ⑥ 사이드바 미리보기 — 상속평가 그대로가 아니라 의제값", () => {
  it("F-1 입력 완결 — 140,000,000 (상속평가 500,000,000이 아니다)", () => {
    expect(previewStockFbAcquisitionPrice(form())).toBe(140_000_000);
    expect(previewStockFbAcquisitionPrice(form({ acquisitionActualInputMode: "total", acquisitionTotalPrice: "500000000" }))).toBe(140_000_000);
  });

  it("F-2 미완결·OFF·술어 불통과는 null — 일반값으로 떨어뜨리지 않는다", () => {
    expect(previewStockFbAcquisitionPrice(form({ fbCorpTotalAssets: "" }))).toBeNull();
    expect(previewStockFbAcquisitionPrice(form({ fbDecedentPerSharePrice: "" }))).toBeNull();
    expect(previewStockFbAcquisitionPrice(form({ familyBusinessInheritance: false }))).toBeNull();
    expect(previewStockFbAcquisitionPrice(form({ acquisitionMode: "estimated" }))).toBeNull();
  });

  it("F-3 엔진 결과와 같다 — 미리보기 = 파이프라인 acquisitionPrice (자본적지출 포함)", () => {
    for (const capex of ["", "30000000"]) {
      const f = form({ fbDecedentCapitalExpenditure: capex });
      expect(previewStockFbAcquisitionPrice(f)).toBe(runPipeline(f).result.acquisitionPrice);
    }
  });

  it("F-4 상속개시일 2014.1.1. 전이면 엔진이 특례를 적용하지 않는다 — 미리보기도 상속평가 그대로", () => {
    const f = form({ acquisitionDate: "2013-12-31" });
    expect(previewStockFbAcquisitionPrice(f)).toBe(500_000_000);
    expect(runPipeline(f).result.acquisitionPrice).toBe(500_000_000);
  });
});
