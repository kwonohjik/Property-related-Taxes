/**
 * anchor: 주식 §97의2④ 가업상속공제 의제 취득가액 — **취득 lot 축** 폼 → ④ body → Zod(⑫⑩) → ⑭ → 엔진 → ⑧ 배선 (PR-1d′)
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.3·§7.4·§7.7(L-a~L-g) · Q-10
 * 짝 anchor(단건): `stock-family-business-wiring.anchor.test.ts` · 엔진 lot anchor: `fb-97-2-4-stock-lots.anchor.test.ts` F1-10
 *
 * ⚠️ ⑫⑬⑭는 TypeScript가 잡지 못한다 — 「값이 세액까지 도달했는가」를 **세액으로** 단언한다.
 * 🔑 폼 필드(`AcquisitionLotForm`)에서 출발한다(`feedback_api_trigger_without_input_path_is_noop`).
 *
 * 기준 사례(계획서 F1-10, 엔진 anchor와 같은 손계산) — 비상장 대주주 비중소 · 양도 2026-06-01 5,000주 @8만 · fifo
 *   A 매수 2023-01-10 2,000주 @3만 · C 일반 상속 2024-01-15 1,000주 @4만 · B 가업 상속 2024-03-01 6,000주
 *   (평가 5만/주 · 피상속인 5천/주 · 자본적지출 총액 1,200만 · 법인 총자산 50억/사업무관 10억 = 4/5)
 *   FIFO: A 2,000 · C 1,000 · B 2,000 → B buyCost = ⌊(5,000×2,000 + 4,000,000) × 4/5⌋ + ⌊50,000×2,000 × 1/5⌋ = 31,200,000
 *   취득가 합 131,200,000 · 산출세액 53,260,000 · §18의2⑩ 공제 = 53,260,000 − 39,500,000 = 13,760,000
 *
 * A ④ body(술어·era 쌍·잔존값 inert·종목 축 배타) · B 세액 도달 · C ⑧ · D ⑧↔⑩ 패리티 격자(lot 축) ·
 * E ③′ normalize/② initial · F 미리보기 throw 방어 · G 결과 buyCost 표시
 */
import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { createInitialStockFormData, createEmptyAcquisitionLot } from "@/lib/stores/calc-wizard-stock-store";
import type { AcquisitionLotForm, StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import { stockTransferInputSchema as baseSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { stockFamilyBusinessInputError } from "@/lib/tax-engine/stock-transfer/stock-family-business-input-check";
import { validateAllSteps } from "@/lib/calc/stock-transfer-tax-validate";
import { validateStockFamilyBusiness, validateStockFamilyBusinessLots } from "@/lib/calc/stock-transfer-tax-validate-family-business";
import { allowsStockFamilyBusiness, stockFbBlockedReason } from "@/lib/calc/stock-family-business";
import {
  allowsStockFbLot,
  isStockFbLotOn,
  lotFbFields,
  stockFbLotBlockedReason,
  stockFbLotSaleEra,
} from "@/lib/calc/stock-family-business-lots";
import { previewSplitAllocation } from "@/lib/calc/stock-split-preview";

const FB_FIELDS = {
  familyBusinessInheritance: true,
  fbDecedentPerSharePrice: "5000",
  fbDecedentCapitalExpenditure: "12000000",
  fbDeductionAmount: "",
  fbBusinessEstateValue: "",
  fbCorpTotalAssets: "5000000000",
  fbCorpNonBusinessAssets: "1000000000",
} as const;

function lot(id: string, date: string, shares: string, perShare: string, o: Partial<AcquisitionLotForm> = {}): AcquisitionLotForm {
  return { ...createEmptyAcquisitionLot(), id, acquisitionDate: date, shareCount: shares, perShareAcquisitionPrice: perShare, ...o };
}

/** F1-10 매수 lot 3건 — B(가업)의 7필드는 완결 */
function f110Lots(fbOverride: Partial<AcquisitionLotForm> = {}): AcquisitionLotForm[] {
  return [
    lot("a", "2023-01-10", "2000", "30000"),
    lot("c", "2024-01-15", "1000", "40000", { acquisitionCause: "inheritance", decedentAcquisitionDate: "2015-01-01" }),
    lot("b", "2024-03-01", "6000", "50000", {
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: "2015-01-01",
      ...FB_FIELDS,
      ...fbOverride,
    }),
  ];
}

/** 일자별 다건(lots-only) · 양도 단건 2026-06-01 5,000주 @8만 */
function lotsForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "예제법인",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "60",
    selfMarketCap: "2000000000",
    totalIssuedShares: "1000000",
    priorYearEndDate: "2025-12-31",
    lotsMode: "single",
    acquisitionDate: "2023-01-10",
    transferDate: "2026-06-01",
    shareCount: "5000",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: "80000",
    acquisitionMode: "actual",
    acquisitionActualInputMode: "lots",
    costAllocationMethod: "fifo",
    acquisitionLots: f110Lots(),
    expenseMode: "actual",
    actualExpenses: "0",
    filingType: "preliminary",
    filingDate: "2026-08-31",
    ...o,
  };
}

/** 분할 양도(split) — 같은 매수 lot, 매도 lot 1건 */
function splitForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return lotsForm({
    lotsMode: "split",
    acquisitionActualInputMode: "per_share",
    acquisitionDate: "",
    transferDate: "",
    shareCount: "",
    perShareTransferPrice: "",
    transferLots: [{ id: "t1", transferDate: "2026-06-01", shareCount: "5000", perShareTransferPrice: "80000" }],
    ...o,
  });
}

/**
 * ⑩ 포함 스키마 — route가 쓰는 `addStockRefines(...)`. 맨 `stockTransferInputSchema`는 refine이 없어
 * 가업상속 공용 술어가 돌지 않는다(그 스키마로 단언하면 ⑩ 격자가 공허해진다).
 */
const stockTransferInputSchema = addStockRefines(baseSchema);

function runPipeline(f: StockTransferFormData) {
  const body = buildStockTransferApiBody(f);
  const parsed = stockTransferInputSchema.safeParse(body);
  if (!parsed.success) throw new Error(`zod 실패: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return { body, result: calculateStockTransferTax(buildEngineInput(coerced)) };
}

type BodyLot = Record<string, unknown>;
const bodyLots = (f: StockTransferFormData) => buildStockTransferApiBody(f).acquisitionLots as BodyLot[];
const fbOf = (f: StockTransferFormData, id: string) => bodyLots(f).find((l) => l.id === id)?.familyBusinessInheritance;
const lotErrors = (f: StockTransferFormData) => validateStockFamilyBusinessLots(f);

describe("A. ④ body — 술어 통과한 lot에만, 매도일 era의 쌍만, 종목 축과 배타", () => {
  it("A-1 lots-only: 가업 lot(B)에만 실리고 A·C에는 없다 — 법인 쌍만(구 쌍 잔존값은 버린다)", () => {
    const f = lotsForm({ acquisitionLots: f110Lots({ fbDeductionAmount: "8", fbBusinessEstateValue: "10" }) });
    expect(fbOf(f, "b")).toEqual({
      decedentAcquisitionPricePerShare: 5_000,
      decedentCapitalExpenditure: 12_000_000,
      fbRateBasis: { kind: "corporate_business_assets", totalAssets: 5_000_000_000, nonBusinessAssets: 1_000_000_000 },
    });
    expect(fbOf(f, "a")).toBeUndefined();
    expect(fbOf(f, "c")).toBeUndefined();
  });

  it("A-2 split: 같은 매퍼가 split에도 실린다(split 쪽 누락 사고 선례 P-7)", () => {
    expect(fbOf(splitForm(), "b")).toMatchObject({ decedentAcquisitionPricePerShare: 5_000 });
  });

  it("A-3 매도일 era — 2026-02-26은 구 ③ 쌍(공제금액·재산가액), 02-27은 법인 쌍", () => {
    const old = lotsForm({
      transferDate: "2026-02-26",
      acquisitionLots: f110Lots({ fbDeductionAmount: "8", fbBusinessEstateValue: "10" }),
    });
    expect((fbOf(old, "b") as { fbRateBasis: unknown }).fbRateBasis).toEqual({ kind: "deduction_ratio", deductionAmount: 8, businessEstateValue: 10 });
    const edge = lotsForm({ transferDate: "2026-02-27" });
    expect((fbOf(edge, "b") as { fbRateBasis: { kind: string } }).fbRateBasis.kind).toBe("corporate_business_assets");
  });

  it("A-4 토글 OFF — 키가 없다 · 자본적지출 0·빈칸은 보내지 않는다", () => {
    expect(fbOf(lotsForm({ acquisitionLots: f110Lots({ familyBusinessInheritance: false }) }), "b")).toBeUndefined();
    for (const capex of ["", "0"]) {
      const fb = fbOf(lotsForm({ acquisitionLots: f110Lots({ fbDecedentCapitalExpenditure: capex }) }), "b") as Record<string, unknown>;
      expect(fb.decedentCapitalExpenditure, capex).toBeUndefined();
    }
  });

  it("A-5 잔존값 inert — 술어 불통과 lot은 ON·값이 있어도 미전송", () => {
    const inert: Array<[string, Partial<StockTransferFormData> | ((f: StockTransferFormData) => StockTransferFormData)]> = [
      ["이 lot 취득원인이 매매로 바뀜", (f) => ({ ...f, acquisitionLots: f.acquisitionLots.map((l) => (l.id === "b" ? { ...l, acquisitionCause: "purchase" as const } : l)) })],
      ["이 lot 취득원인이 증여", (f) => ({ ...f, acquisitionLots: f.acquisitionLots.map((l) => (l.id === "b" ? { ...l, acquisitionCause: "gift" as const } : l)) })],
      ["국외주식", { marketType: "foreign_stock" }],
      ["국외전출세", { marketType: "exit_tax" }],
    ];
    for (const [name, patch] of inert) {
      const base = lotsForm();
      const f = typeof patch === "function" ? patch(base) : { ...base, ...patch };
      expect(JSON.stringify(buildStockTransferApiBody(f)), name).not.toContain("decedentAcquisitionPricePerShare");
    }
    // 환산 취득 — lot 자체가 body에 실리지 않는다
    const est = buildStockTransferApiBody(lotsForm({ acquisitionMode: "estimated" }));
    expect(JSON.stringify(est)).not.toContain("decedentAcquisitionPricePerShare");
    // 단건·일자별 다건이 아닌 취득(1주당)에서는 lot이 실리지 않는다
    const single = buildStockTransferApiBody(lotsForm({ acquisitionActualInputMode: "per_share", perShareAcquisitionPrice: "50000" }));
    expect(single.acquisitionLots).toBeUndefined();
    expect(JSON.stringify(single)).not.toContain("decedentAcquisitionPricePerShare");
  });

  it("A-6 종목 축과 lot 축은 같은 body에 실리지 않는다 — 단건 FB 토글이 ON으로 남아도 lot 모드에선 미전송(엔진·⑩이 막는 조합)", () => {
    for (const make of [lotsForm, splitForm]) {
      const f = make({
        acquisitionCause: "inheritance",
        decedentAcquisitionDate: "2015-01-01", // 단건 상속 원인의 필수 보조 입력(lot 모드에서도 stale로 남는다)
        familyBusinessInheritance: true,
        fbDecedentPerSharePrice: "5000",
        fbCorpTotalAssets: "5000000000",
        fbCorpNonBusinessAssets: "1000000000",
      });
      expect(allowsStockFamilyBusiness(f)).toBe(false);
      const body = buildStockTransferApiBody(f);
      expect(body.familyBusinessInheritance).toBeUndefined();
      expect(fbOf(f, "b")).toBeDefined();
      // 그 body가 서버(⑩)·엔진 술어를 통과한다 — 두 축 동시 금지에 걸리지 않는다
      expect(stockTransferInputSchema.safeParse(body).success).toBe(true);
      expect(stockFamilyBusinessInputError(buildEngineInput(coerceDates(body, [...STOCK_DATE_FIELDS])))).toBeNull();
      // 단건 ⑧도 그 잔존값을 검증하지 않는다
      expect(validateStockFamilyBusiness({ ...f, fbDecedentPerSharePrice: "" })).toEqual([]);
    }
  });

  it("A-7 술어 — 단건과 lot은 배타(lot 모드면 단건 사유 문구가 「각 상속 lot 카드」로 안내)", () => {
    const f = lotsForm({ acquisitionCause: "inheritance" });
    expect(allowsStockFamilyBusiness(f)).toBe(false);
    expect(stockFbBlockedReason(f)).toContain("각 상속 lot 카드");
    const lotB = f.acquisitionLots[2];
    expect(allowsStockFbLot(f, lotB)).toBe(true);
    expect(stockFbLotBlockedReason(f, lotB)).toBeNull();
    // 단건 모드에서는 lot 술어가 닫힌다
    const single = lotsForm({ acquisitionActualInputMode: "per_share" });
    expect(allowsStockFbLot(single, lotB)).toBe(false);
  });

  it("A-8 매도일이 2026-02-27을 사이에 두면(split) 가장 이른 매도일 era의 쌍을 싣는다 — 서버 throw 대신 ⑧이 먼저 막는다(C-3)", () => {
    const f = splitForm({
      transferLots: [
        { id: "t1", transferDate: "2026-02-20", shareCount: "2500", perShareTransferPrice: "80000" },
        { id: "t2", transferDate: "2026-06-01", shareCount: "2500", perShareTransferPrice: "80000" },
      ],
      acquisitionLots: f110Lots({ fbDeductionAmount: "8", fbBusinessEstateValue: "10" }),
    });
    expect(stockFbLotSaleEra(f)).toEqual({ era: "deduction_ratio", straddle: true });
    expect((fbOf(f, "b") as { fbRateBasis: { kind: string } }).fbRateBasis.kind).toBe("deduction_ratio");
  });
});

describe("B. 입력이 세액까지 도달한다 (⑫⑩⑭ 엔진) — F1-10", () => {
  for (const [name, make] of [
    ["lots-only", lotsForm],
    ["split", splitForm],
  ] as const) {
    it(`B-1 ${name}: 취득가 131,200,000 · 산출세액 53,260,000 · 지방소득세 5,326,000 · §18의2⑩ 공제 13,760,000`, () => {
      const { result } = runPipeline(make());
      expect(result.acquisitionPrice).toBe(131_200_000);
      expect(result.transferIncome).toBe(268_800_000);
      expect(result.taxBase).toBe(266_300_000);
      expect(result.calculatedTax).toBe(53_260_000);
      expect(result.localIncomeTax).toBe(5_326_000);
      expect(result.familyBusinessDetail).toMatchObject({
        imputedAcquisitionPrice: 31_200_000,
        cgtUnderSection97_2_4: 53_260_000,
        cgtUnderSection97: 39_500_000,
        creditAmount: 13_760_000,
        shareCount: 2_000,
        decedentCapitalExpenditure: 4_000_000,
      });
      // sub-lot 취득원가 총액(buyCost) — 가업 lot 배정분만 의제 · 합이 결과 취득가액
      const matched = result.lotMatchingDetail!.matched;
      expect(matched.map((m) => m.buyCost)).toEqual([undefined, undefined, 31_200_000]);
      expect(matched.reduce((s, m) => s + (m.buyCost ?? m.buyShares * m.perShareBuyPrice), 0)).toBe(result.acquisitionPrice);
    });
  }

  it("B-2 OFF — 일반 §97(B 평가 2,000주 × 50,000): 취득가 200,000,000 · 산출세액 39,500,000 · 의제 카드 없음", () => {
    const { result } = runPipeline(lotsForm({ acquisitionLots: f110Lots({ familyBusinessInheritance: false }) }));
    expect(result.acquisitionPrice).toBe(200_000_000);
    expect(result.calculatedTax).toBe(39_500_000);
    expect(result.familyBusinessDetail).toBeUndefined();
  });

  it("B-3 moving_avg — 가업 lot도 같이 평균에 들어가고 `pooled`·고지가 붙는다", () => {
    const { result } = runPipeline(lotsForm({ costAllocationMethod: "moving_avg" }));
    expect(result.familyBusinessDetail?.pooled).toBe(true);
    expect(result.lotMatchingDetail?.warnings.some((w) => w.includes("구분 관리 여부 확인 필요"))).toBe(true);
  });

  it("B-4 가업 lot 2개가 한 매도에 배정되면 detail.lots[]가 lot별로 실린다", () => {
    const f = lotsForm({
      acquisitionLots: [
        lot("b1", "2024-03-01", "3000", "50000", { acquisitionCause: "inheritance", decedentAcquisitionDate: "2015-01-01", ...FB_FIELDS, fbDecedentCapitalExpenditure: "" }),
        lot("b2", "2024-05-01", "3000", "60000", {
          acquisitionCause: "inheritance",
          decedentAcquisitionDate: "2015-01-01",
          ...FB_FIELDS,
          fbDecedentPerSharePrice: "6000",
          fbDecedentCapitalExpenditure: "",
        }),
      ],
    });
    const { result } = runPipeline(f);
    expect(result.familyBusinessDetail?.lots).toHaveLength(2);
    expect(result.familyBusinessDetail?.lots?.map((l) => l.shares)).toEqual([3000, 2000]);
  });
});

describe("C. ⑧ — 필수 누락·매도일 시대 걸침·값 관계", () => {
  it("C-1 완결 lot 폼은 가업상속 오류가 없다 (lots-only·split 전체 검증에서도)", () => {
    expect(lotErrors(lotsForm())).toEqual([]);
    expect(lotErrors(splitForm())).toEqual([]);
    for (const f of [lotsForm(), splitForm()]) {
      const all = validateAllSteps(f).filter((e) => e.severity === "error");
      expect(all, JSON.stringify(all)).toEqual([]);
    }
  });

  it("C-2 빈칸 — lot 경로(`acquisitionLots[i].fb…`)로 필드별 지목한다(자동 0·자동 채움 없음)", () => {
    const f = lotsForm({ acquisitionLots: f110Lots({ fbDecedentPerSharePrice: "", fbCorpTotalAssets: "", fbCorpNonBusinessAssets: "" }) });
    const e = lotErrors(f);
    expect(e.map((x) => x.field).sort()).toEqual([
      "acquisitionLots[2].fbCorpNonBusinessAssets",
      "acquisitionLots[2].fbCorpTotalAssets",
      "acquisitionLots[2].fbDecedentPerSharePrice",
    ]);
    expect(e.every((x) => x.severity === "error" && x.message.includes("매수 lot #3"))).toBe(true);
    // 사업무관자산 0은 유효한 입력(빈칸과 구분)
    expect(lotErrors(lotsForm({ acquisitionLots: f110Lots({ fbCorpNonBusinessAssets: "0" }) }))).toEqual([]);
  });

  it("C-3 매도일이 2026-02-27을 사이에 두면 차단한다(split) — 남은 한계 문구", () => {
    const f = splitForm({
      transferLots: [
        { id: "t1", transferDate: "2026-02-26", shareCount: "2500", perShareTransferPrice: "80000" },
        { id: "t2", transferDate: "2026-02-27", shareCount: "2500", perShareTransferPrice: "80000" },
      ],
      // 가장 이른 매도일(02-26)의 era = 구 ③ — 그 쌍은 채워 둬 걸침 차단만 남긴다
      acquisitionLots: f110Lots({ fbDeductionAmount: "8", fbBusinessEstateValue: "10" }),
    });
    const e = lotErrors(f);
    expect(e).toHaveLength(1);
    expect(e[0].field).toBe("transferLots");
    expect(e[0].message).toContain("2026.2.26. 이전과 2026.2.27. 이후에 걸쳐");
    // 같은 시대 두 매도는 통과
    const same = splitForm({
      transferLots: [
        { id: "t1", transferDate: "2026-03-02", shareCount: "2500", perShareTransferPrice: "80000" },
        { id: "t2", transferDate: "2026-06-01", shareCount: "2500", perShareTransferPrice: "80000" },
      ],
    });
    expect(lotErrors(same)).toEqual([]);
  });

  it("C-4 매도일을 경계 건너로 바꾸면 새 쌍이 빈칸이라 막힌다 (조용한 전환 없음)", () => {
    const e = lotErrors(lotsForm({ transferDate: "2026-02-26" }));
    expect(e.map((x) => x.field).sort()).toEqual(["acquisitionLots[2].fbBusinessEstateValue", "acquisitionLots[2].fbDeductionAmount"]);
  });

  it("C-5 값 관계 — 분자 > 분모는 공용 술어가 막는다", () => {
    const e = lotErrors(lotsForm({ acquisitionLots: f110Lots({ fbCorpNonBusinessAssets: "5000000001" }) }));
    expect(e).toHaveLength(1);
    expect(e[0].message).toContain("사업무관자산가액이 법인 총자산가액보다 클 수 없습니다");
  });

  it("C-6 술어를 통과하지 못한 lot은 검증하지 않는다 — 안 보이는 잔존값이 막지 않는다", () => {
    const f = lotsForm({
      acquisitionLots: f110Lots({ acquisitionCause: "purchase", fbDecedentPerSharePrice: "", fbCorpTotalAssets: "" }),
    });
    expect(lotErrors(f)).toEqual([]);
    expect(lotErrors(lotsForm({ acquisitionMode: "estimated", acquisitionLots: f110Lots({ fbDecedentPerSharePrice: "" }) }))).toEqual([]);
  });

  it("C-7 validateAllSteps에 연결돼 있다(lots-only → 2단계, split → 1단계)", () => {
    const blank = { fbDecedentPerSharePrice: "" };
    const l = validateAllSteps(lotsForm({ acquisitionLots: f110Lots(blank) }));
    expect(l.some((e) => e.field === "acquisitionLots[2].fbDecedentPerSharePrice")).toBe(true);
    const s = validateAllSteps(splitForm({ acquisitionLots: f110Lots(blank) }));
    expect(s.some((e) => e.field === "acquisitionLots[2].fbDecedentPerSharePrice")).toBe(true);
  });
});

describe("D. ⑧ ↔ ⑩ 패리티 격자(lot 축) — ⑧ 통과 ⇒ Zod·공용 술어 통과", () => {
  const forms = [lotsForm, splitForm] as const;
  const lotCauses = ["inheritance", "purchase", "gift"] as const;
  const acqModes: Array<Partial<StockTransferFormData>> = [{ acquisitionMode: "actual" }, { acquisitionMode: "estimated" }];
  const saleDates = ["2026-02-26", "2026-02-27", ""];
  const pairs: Array<Partial<AcquisitionLotForm>> = [
    { fbDeductionAmount: "", fbBusinessEstateValue: "", fbCorpTotalAssets: "", fbCorpNonBusinessAssets: "" },
    { fbDeductionAmount: "8", fbBusinessEstateValue: "10", fbCorpTotalAssets: "", fbCorpNonBusinessAssets: "" },
    { fbDeductionAmount: "", fbBusinessEstateValue: "" },
    { fbDeductionAmount: "8", fbBusinessEstateValue: "10" },
    { fbDeductionAmount: "11", fbBusinessEstateValue: "10", fbCorpTotalAssets: "10", fbCorpNonBusinessAssets: "11" },
    { fbDeductionAmount: "0", fbBusinessEstateValue: "10", fbCorpTotalAssets: "10", fbCorpNonBusinessAssets: "0" },
  ];
  const capexes = ["", "0", "7000"];
  const perShares = ["5000", "0", ""];

  function build(make: (typeof forms)[number], cause: AcquisitionLotForm["acquisitionCause"], mode: Partial<StockTransferFormData>, date: string, pair: Partial<AcquisitionLotForm>, capex: string, ps: string) {
    const lots = f110Lots({ acquisitionCause: cause, fbDecedentCapitalExpenditure: capex, fbDecedentPerSharePrice: ps, ...pair });
    return make === lotsForm
      ? lotsForm({ ...mode, transferDate: date, acquisitionLots: lots })
      : splitForm({ ...mode, transferLots: [{ id: "t1", transferDate: date, shareCount: "5000", perShareTransferPrice: "80000" }], acquisitionLots: lots });
  }

  it("⑧이 통과한 모든 칸에서 공용 술어와 Zod가 FB 사유로 막지 않는다 (격자 전수)", () => {
    let cells = 0;
    let blockedBy8 = 0;
    let passed8WithFb = 0;
    for (const make of forms) {
      for (const cause of lotCauses) {
        for (const mode of acqModes) {
          for (const date of saleDates) {
            for (const pair of pairs) {
              for (const capex of capexes) {
                for (const ps of perShares) {
                  const f = build(make, cause, mode, date, pair, capex, ps);
                  cells++;
                  if (lotErrors(f).length > 0) {
                    blockedBy8++;
                    continue;
                  }
                  const body = buildStockTransferApiBody(f);
                  if (JSON.stringify(body).includes("decedentAcquisitionPricePerShare")) passed8WithFb++;
                  const parsed = stockTransferInputSchema.safeParse(body);
                  const fbIssues = parsed.success
                    ? []
                    : parsed.error.issues.filter(
                        (i) => i.message.startsWith("가업상속공제") || i.path.includes("familyBusinessInheritance"),
                      );
                  expect(fbIssues, JSON.stringify({ cause, mode, date, pair, capex, ps, fbIssues })).toEqual([]);
                  if (date) {
                    const engineIn = buildEngineInput(coerceDates(body, [...STOCK_DATE_FIELDS]));
                    expect(stockFamilyBusinessInputError(engineIn), JSON.stringify({ cause, mode, date, pair, capex, ps })).toBeNull();
                  }
                }
              }
            }
          }
        }
      }
    }
    // 격자가 공허하지 않다 — ⑧이 막는 칸과 FB를 싣고 통과한 칸이 모두 실재한다
    expect(cells).toBe(2 * 3 * 2 * 3 * 6 * 3 * 3);
    expect(blockedBy8).toBeGreaterThan(100);
    expect(passed8WithFb).toBeGreaterThan(20);
  });

  it("⑩이 막는 lot FB 입력은 ⑧도 막는다 (술어 통과 lot 한정 — 서버가 막는데 UI가 통과시키는 모순 없음)", () => {
    for (const make of forms) {
      for (const date of ["2026-02-26", "2026-02-27"]) {
        for (const pair of pairs) {
          for (const ps of perShares) {
            const f = build(make, "inheritance", { acquisitionMode: "actual" }, date, pair, "", ps);
            const parsed = stockTransferInputSchema.safeParse(buildStockTransferApiBody(f));
            const serverBlocks = !parsed.success && parsed.error.issues.some((i) => i.message.startsWith("가업상속공제"));
            if (serverBlocks) expect(lotErrors(f).length, JSON.stringify({ date, pair, ps })).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("종목 축 + lot 축 동시 body는 ⑩이 막는다 — ④는 그 조합을 만들지 못한다(A-6)", () => {
    const body = {
      ...buildStockTransferApiBody(lotsForm()),
      familyBusinessInheritance: {
        decedentAcquisitionPricePerShare: 5_000,
        fbRateBasis: { kind: "corporate_business_assets", totalAssets: 10, nonBusinessAssets: 2 },
      },
    };
    const parsed = stockTransferInputSchema.safeParse(body);
    expect(parsed.success).toBe(false);
  });
});

describe("E. ②③′ — initial · normalize(구 이력)", () => {
  it("E-1 factory — false·빈 문자열(lotFbFields 기본값과 같다)", () => {
    const l = createEmptyAcquisitionLot();
    expect(l.familyBusinessInheritance).toBe(false);
    expect(lotFbFields(l)).toEqual({
      familyBusinessInheritance: false,
      fbDecedentPerSharePrice: "",
      fbDecedentCapitalExpenditure: "",
      fbDeductionAmount: "",
      fbBusinessEstateValue: "",
      fbCorpTotalAssets: "",
      fbCorpNonBusinessAssets: "",
    });
    // 필드가 아예 없는 lot(구 이력·테스트 픽스처)도 같은 기본값
    expect(lotFbFields({ id: "x", acquisitionDate: "", shareCount: "", perShareAcquisitionPrice: "", acquisitionCause: "inheritance" })).toEqual(lotFbFields(l));
  });

  it("E-2 구 이력(lot에 신규 7필드 없음)은 false·빈 문자열로 복원되고 전송되지 않는다", () => {
    const n = normalizeStockFormData({
      lotsMode: "single",
      acquisitionLots: [{ id: "b", acquisitionDate: "2024-03-01", shareCount: "6000", perShareAcquisitionPrice: "50000", acquisitionCause: "inheritance" }],
    });
    const l = n.acquisitionLots[0];
    expect(l.familyBusinessInheritance).toBe(false);
    for (const k of ["fbDecedentPerSharePrice", "fbDecedentCapitalExpenditure", "fbDeductionAmount", "fbBusinessEstateValue", "fbCorpTotalAssets", "fbCorpNonBusinessAssets"] as const) {
      expect(l[k], k).toBe("");
    }
    expect(JSON.stringify(buildStockTransferApiBody({ ...lotsForm(), ...n, acquisitionActualInputMode: "lots" }))).not.toContain("decedentAcquisitionPricePerShare");
  });

  it("E-3 저장된 값은 보존, 타입이 틀리면 default", () => {
    const n = normalizeStockFormData({
      acquisitionLots: [{ id: "b", acquisitionCause: "inheritance", familyBusinessInheritance: true, fbDecedentPerSharePrice: "5000", fbCorpTotalAssets: 123 }],
    });
    expect(n.acquisitionLots[0].familyBusinessInheritance).toBe(true);
    expect(n.acquisitionLots[0].fbDecedentPerSharePrice).toBe("5000");
    expect(n.acquisitionLots[0].fbCorpTotalAssets).toBe("");
    expect(normalizeStockFormData({ acquisitionLots: [{ id: "b", familyBusinessInheritance: "yes" }] }).acquisitionLots[0].familyBusinessInheritance).toBe(false);
  });
});

describe("F. 미리보기(`previewSplitAllocation`)는 엔진 throw를 화면 크래시로 내지 않는다", () => {
  it("F-1 완결 입력 — 엔진 배정값(buyCost 포함)과 같다: 취득가액 131,200,000", () => {
    for (const f of [lotsForm(), splitForm()]) {
      const detail = previewSplitAllocation(f);
      expect(detail?.totalAcquisitionPrice).toBe(131_200_000);
      expect(detail?.matched.find((m) => m.buyCost !== undefined)?.buyCost).toBe(31_200_000);
      expect(detail?.familyBusinessSummary?.shares).toBe(2_000);
    }
  });

  it("F-2 입력 도중(법정량 쌍 빈칸 · 매도일 시대 걸침)이라 엔진이 throw할 상태 → null(throw 아님)", () => {
    const blank = lotsForm({ acquisitionLots: f110Lots({ fbCorpTotalAssets: "", fbCorpNonBusinessAssets: "" }) });
    expect(() => previewSplitAllocation(blank)).not.toThrow();
    expect(previewSplitAllocation(blank)).toBeNull();
    const straddle = splitForm({
      transferLots: [
        { id: "t1", transferDate: "2026-02-20", shareCount: "2500", perShareTransferPrice: "80000" },
        { id: "t2", transferDate: "2026-06-01", shareCount: "2500", perShareTransferPrice: "80000" },
      ],
    });
    expect(() => previewSplitAllocation(straddle)).not.toThrow();
    // 가업 lot(B 6,000주)이 두 매도에 걸쳐 배정되고 첫 매도의 era 쌍(법인)이 맞지 않는 칸 → throw → null
    expect(previewSplitAllocation(straddle)).toBeNull();
  });
});

describe("F′. 미완결 가업 lot은 미리보기를 산출하지 않는다(14지점 점검 lot M-1)", () => {
  it("F-3 사업무관자산 빈칸(0으로 읽히면 적용률 100%) · 구 ③ 공제금액 빈칸(0%) → null — 그럴듯한 오답을 내지 않는다", () => {
    for (const make of [lotsForm, splitForm]) {
      const nb = make({ acquisitionLots: f110Lots({ fbCorpNonBusinessAssets: "" }) });
      expect(previewSplitAllocation(nb)).toBeNull();
    }
    const oldEra = lotsForm({
      transferDate: "2026-01-15",
      acquisitionLots: f110Lots({ fbCorpTotalAssets: "", fbCorpNonBusinessAssets: "", fbDeductionAmount: "", fbBusinessEstateValue: "1200" }),
    });
    expect(previewSplitAllocation(oldEra)).toBeNull();
  });
});

describe("G. 결과 표시 — sub-lot 취득원가 총액(buyCost)이 정본이다", () => {
  it("G-1 buyCost는 1주당(표시용 절사) × 주식수와 다를 수 있다 — 총액이 결과 취득가액과 맞는다", () => {
    const { result } = runPipeline(
      lotsForm({
        acquisitionLots: [
          lot("b", "2024-03-01", "6000", "50001", {
            acquisitionCause: "inheritance",
            decedentAcquisitionDate: "2015-01-01",
            ...FB_FIELDS,
            fbDecedentPerSharePrice: "5001",
            fbDecedentCapitalExpenditure: "",
            fbCorpTotalAssets: "7",
            fbCorpNonBusinessAssets: "2",
          }),
        ],
        shareCount: "5000",
      }),
    );
    const m = result.lotMatchingDetail!.matched[0];
    expect(m.buyCost).toBeDefined();
    // 1주당 × 주식수로 다시 곱하면 항별 절사가 사라져 결과 취득가액과 어긋난다 — 총액이 정본
    expect(m.buyShares * m.perShareBuyPrice).not.toBe(m.buyCost);
    expect(result.acquisitionPrice).toBe(m.buyCost);
    expect(result.lotMatchingDetail!.totalAcquisitionPrice).toBe(m.buyCost);
  });

  it("G-2 가업 lot 취득원인이 상속이 아니면 isStockFbLotOn이 닫힌다", () => {
    const f = lotsForm();
    expect(isStockFbLotOn(f, f.acquisitionLots[2])).toBe(true);
    expect(isStockFbLotOn(f, { ...f.acquisitionLots[2], acquisitionCause: "purchase" })).toBe(false);
    expect(isStockFbLotOn(f, { ...f.acquisitionLots[2], familyBusinessInheritance: false })).toBe(false);
  });
});
