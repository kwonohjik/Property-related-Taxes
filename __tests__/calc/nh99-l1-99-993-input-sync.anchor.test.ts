/**
 * anchor — 조특법 §99·§99의3 입력 동기화 (리뷰 `docs/reviews/new-housing-99-review-2026-11.md` NH-25·NH-56·NH-57·NH-35·NH-44)
 *
 * 화면 입력 경로 전체(⑧ → ④ → ⑫ → ⑭ → 엔진)를 route로 돌린다. 세액은 route 실측값(totalTax)이다.
 *
 * | # | 결함 | 법령 | 수정 전 → 후 |
 * |---|---|---|---|
 * | NH-57 | 재계약·대체취득 배제 선언이 자기건설에도 걸렸다 | 조특령 §99의3④(법 §99의3①1호 사유)·조특령 §99②(법 §99①2호 단서 사유) | §99의3 2호 124,366,000 → 83,610,998 · §99 1호 155,166,000 → 95,595,000 |
 * | NH-56 | 양도시 기준시가 칸 「0」 — ⑧은 자산값으로 통과, ④는 0을 실어 라우터 fallback이 막혔다 | 조특령 §99의3②2호 | 154,242,000 → 104,524,200 |
 * | NH-25 | §99 ⑧이 5년시점·양도시 기준시가를 묻지 않았다 — 엔진이 감면 0(MISSING_STD_PRICE) | 조특령 §99①2호 | 계산 통과 155,166,000 → ⑧ 차단 |
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as CALC_POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { evaluateNew993 } from "@/lib/tax-engine/transfer-reductions/new-99-3";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

afterEach(() => vi.unstubAllGlobals());

async function captureBody(f: TransferFormData): Promise<Record<string, unknown>> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  return cap.body!;
}

type Detail = { isEligible: boolean; ineligibleReasons: { code: string }[] };
type Result = { totalTax?: number; new993Detail?: Detail; new99Detail?: Detail };

async function run(f: TransferFormData): Promise<Result> {
  const res = await CALC_POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(await captureBody(f)),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.result;
}

/** ⑧ 감면 단계 메시지 */
const step2 = (f: TransferFormData) => collectStepIssues(2, f).map((i) => i.message);

const form = (
  asset: Partial<AssetForm>,
  reduction: AssetReductionForm,
  over: Partial<TransferFormData> = {},
): TransferFormData => ({
  ...createDefaultTransferFormData(),
  transferDate: "2023-08-01",
  contractTotalPrice: "800,000,000",
  isOneHousehold: true,
  householdHousingCount: "2",
  assets: [
    {
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2004-09-01",
      actualSalePrice: "800,000,000",
      fixedAcquisitionPrice: "300,000,000",
      ...asset,
      reductions: [reduction],
    } as AssetForm,
  ],
  ...over,
});

const r993 = (o: Record<string, unknown>) =>
  ({
    ...getReductionDefault("new_99_3"),
    standardPriceAtAcquisition993: "100,000,000",
    standardPriceAt5Years: "200,000,000",
    standardPriceAtTransfer993: "400,000,000",
    exclusiveAreaSqm993: "84",
    ...o,
  }) as AssetReductionForm;

const r99 = (o: Record<string, unknown>) =>
  ({
    ...getReductionDefault("new_99"),
    standardPriceAtAcquisition99: "100,000,000",
    standardPriceAt5Years99: "160,000,000",
    standardPriceAtTransfer99: "250,000,000",
    exclusiveAreaSqm99: "84",
    ...o,
  }) as AssetReductionForm;

const T99 = { transferDate: "2024-08-01", contractTotalPrice: "900,000,000" };
const A99 = { acquisitionDate: "1999-01-01", actualSalePrice: "900,000,000" };
const T99_REDUCED = 95_595_000; // §99 차감 적용
const T99_NONE = 155_166_000; // §99 감면 0

describe("NH-57 재계약·대체취득 배제는 주택건설사업자로부터 취득한 갈래에만 건다", () => {
  const SB993 = { acquisitionType993: "self_built", usageApprovalDate993: "2002-08-01" };
  const A993 = { acquisitionDate: "2002-08-01" };

  it("§99의3 2호(자기건설) 기준선 — 83,610,998", async () => {
    const r = await run(form(A993, r993(SB993)));
    expect(r.new993Detail?.isEligible).toBe(true);
    expect(r.totalTax).toBe(83_610_998);
  });

  it("🔴 §99의3 2호에 남은 재계약 선언으로 배제하지 않는다 (수정 전 RECONTRACT_EXCLUDED · 124,366,000)", async () => {
    const r = await run(form(A993, r993({ ...SB993, isRecontractExcluded993: true })));
    expect(r.new993Detail?.ineligibleReasons.map((x) => x.code) ?? []).not.toContain("RECONTRACT_EXCLUDED");
    expect(r.totalTax).toBe(83_610_998);
  });

  it("짝 — §99의3 1호(주택건설사업자 취득)는 그대로 배제한다", () => {
    const d = evaluateNew993({
      transferDate: new Date("2023-08-01"),
      acquisitionDate: new Date("2004-09-01"),
      contractDate: new Date("2002-05-01"),
      transferIncome: 300_000_000,
      standardPriceAtAcquisition: 100_000_000,
      standardPriceAt5Years: 200_000_000,
      standardPriceAtTransfer: 400_000_000,
      wholePropertyTransferPrice: 800_000_000,
      exclusiveAreaSqm: 84,
      region: "outside_speculation",
      isResident: true,
      isHousingConstructionBusiness: false,
      acquisitionType: "from_builder",
      isRecontractExcluded: true,
      calculatedTaxBeforeReduction: 0,
      calculatedTaxAfterReduction: 0,
    });
    expect(d.ineligibleReasons.map((x) => x.code)).toContain("RECONTRACT_EXCLUDED");
  });

  const SB99 = { acquisitionType99: "self_built", usageApprovalDate99: "1999-03-01" };
  it("🔴 §99 1호(자기건설)에 남은 재계약 선언으로 배제하지 않는다 (수정 전 155,166,000)", async () => {
    const base = await run(form({ ...A99, acquisitionDate: "1999-03-01" }, r99(SB99), T99));
    const declared = await run(
      form({ ...A99, acquisitionDate: "1999-03-01" }, r99({ ...SB99, isRecontractExcluded99: true }), T99),
    );
    expect(base.totalTax).toBe(T99_REDUCED);
    expect(declared.new99Detail?.isEligible).toBe(true);
    expect(declared.totalTax).toBe(T99_REDUCED);
  });

  it("짝 — §99 2호(주택건설사업자 취득)는 그대로 배제한다", async () => {
    const r = await run(form(A99, r99({ contractDate99: "1998-06-01", isRecontractExcluded99: true }), T99));
    expect(r.new99Detail?.ineligibleReasons.map((x) => x.code)).toContain("RECONTRACT_EXCLUDED");
    expect(r.totalTax).toBe(T99_NONE);
  });
});

describe("NH-56 §99의3 양도시 기준시가 칸 「0」 = 미입력 (⑧·④·라우터 같은 fallback)", () => {
  // 환산취득가액 모드 — ④가 자산 양도시 기준시가를 엔진에 싣는다(⑧도 같은 leaf로 통과시킨다).
  const EST = {
    fixedAcquisitionPrice: "",
    useEstimatedAcquisition: true,
    standardPriceAtAcq: "100,000,000",
    standardPriceAtTransfer: "400,000,000",
  } as Partial<AssetForm>;
  const red = (v: string) => r993({ contractDate993: "2002-05-01", standardPriceAtTransfer993: v });

  it("④ — 「0」은 싣지 않는다 (라우터가 자산값으로 대신한다)", () => {
    const [out] = toEngineReductions([red("0")], "purchase") as Record<string, unknown>[];
    expect(out.standardPriceAtTransfer993).toBeUndefined();
  });

  it("🔴 「0」과 빈 칸이 같은 세액 — 104,524,200 (수정 전 「0」 154,242,000 · MISSING_STD_PRICE)", async () => {
    expect(step2(form(EST, red("0")))).toEqual([]);
    const blank = await run(form(EST, red("")));
    const zero = await run(form(EST, red("0")));
    expect(blank.totalTax).toBe(104_524_200);
    expect(zero.new993Detail?.isEligible).toBe(true);
    expect(zero.totalTax).toBe(104_524_200);
  });
});

describe("NH-25 §99 ⑧ — 엔진이 안분에 쓰는 기준시가를 같은 조건으로 묻는다", () => {
  const FB = { contractDate99: "1998-06-01" };

  it("기준선 — 모두 입력하면 통과 · 95,595,000", async () => {
    const f = form(A99, r99(FB), T99);
    expect(step2(f)).toEqual([]);
    expect((await run(f)).totalTax).toBe(T99_REDUCED);
  });

  it("🔴 5년 후 양도 + 5년시점 기준시가 미입력 → ⑧ 차단 (수정 전 통과 · 엔진 감면 0 → 155,166,000)", () => {
    const issues = step2(form(A99, r99({ ...FB, standardPriceAt5Years99: "" }), T99));
    expect(issues.join("\n")).toMatch(/§99 적용: 취득 후 5년 경과 양도는 취득일부터 5년이 되는 날의 기준시가/);
  });

  it("🔴 5년 후 양도 + 양도시 기준시가 미입력(실가 모드라 자산값도 안 감) → ⑧ 차단", () => {
    const issues = step2(form(A99, r99({ ...FB, standardPriceAtTransfer99: "" }), T99));
    expect(issues.join("\n")).toMatch(/§99 적용: 취득 후 5년 경과 양도는 양도시 기준시가/);
  });

  it("짝 — 5년 이내 양도는 5년시점·양도시 기준시가를 묻지 않는다 (엔진도 전액 차감이라 쓰지 않는다)", () => {
    const issues = step2(
      form(A99, r99({ ...FB, standardPriceAt5Years99: "", standardPriceAtTransfer99: "" }), {
        transferDate: "2003-12-01",
        contractTotalPrice: "900,000,000",
      }),
    );
    expect(issues.filter((m) => m.startsWith("§99 적용"))).toEqual([]);
  });

  it("🔴 재개발 변형은 5년 이내에도 양도시 기준시가를 묻는다 (조특령 §99①1호 단서)", () => {
    const issues = step2(
      form(
        A99,
        r99({ ...FB, standardPriceAtTransfer99: "", isRedevelopedNewHouse99: true, previousHouseStdPrice99: "50,000,000" }),
        { transferDate: "2003-12-01", contractTotalPrice: "900,000,000" },
      ),
    );
    expect(issues.join("\n")).toMatch(/§99 적용: 재개발·재건축 신축주택은 5년 이내 양도에도 양도시 기준시가/);
  });
});

describe("NH-35·NH-44 엔진 안내 문구 — 법문 대조", () => {
  const base = {
    transferDate: new Date("2023-08-01"),
    acquisitionDate: new Date("2020-09-01"),
    contractDate: new Date("2002-05-01"),
    transferIncome: 300_000_000,
    standardPriceAtAcquisition: 100_000_000,
    standardPriceAt5Years: 0,
    standardPriceAtTransfer: 400_000_000,
    wholePropertyTransferPrice: 800_000_000,
    exclusiveAreaSqm: 84,
    region: "outside_speculation" as const,
    isResident: true,
    isHousingConstructionBusiness: false,
    acquisitionType: "from_builder" as const,
    calculatedTaxBeforeReduction: 0,
    calculatedTaxAfterReduction: 0,
  };

  it("NH-35 1호 단서 — 「다른 자가」 없이 「매매계약일 현재 입주한 사실」(법률 제6538호로 삭제)", () => {
    const m = evaluateNew993({ ...base, hasOccupancyAtContract: true }).ineligibleReasons[0].message;
    expect(m).toContain("매매계약일 현재 입주한 사실");
    expect(m).not.toContain("다른 자가");
  });

  it("NH-44 거주자 — 법 §99의3① 본문이다(「대통령령으로 정하는 거주자」가 아니다)", () => {
    const m = evaluateNew993({ ...base, isResident: false }).ineligibleReasons[0].message;
    expect(m).not.toContain("대통령령");
    expect(m).toContain("§99의3① 본문");
  });

  it("NH-44 5년 이내 + 재개발 변형의 기준시가 미입력은 ②1호 단서로 인용한다", () => {
    const d = evaluateNew993({
      ...base,
      standardPriceAtTransfer: 0,
      isRedevelopedNewHouse: true,
      previousHouseStdPriceAtAcquisition: 50_000_000,
    });
    expect(d.ineligibleReasons[0].code).toBe("MISSING_STD_PRICE");
    expect(d.ineligibleReasons[0].legalBasis).toContain("1호 단서");
    expect(d.ineligibleReasons[0].message).not.toContain("②2호");
  });
});
