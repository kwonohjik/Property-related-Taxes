/**
 * anchor — 양도세 결과뷰 리뷰(2026-11-21) MAJOR 묶음 m4 — 부담부증여 증여세 행 · 겸용 BG 공유지분 산식.
 *
 * R-c04-01: 부담부증여 증여세 행(`BurdenedGiftGiftTaxRows`)에 상증법 §57 할증과세액 행이 없어 보이는 행만으로는
 *           산출세액 − 공제 ≠ 결정세액이었다. 요약 echo `generationSkipSurcharge`를 행으로 그린다.
 * R-c04-02: 겸용 부담부증여 공유지분의 취득가액·개산공제 산식이 물건 전체 기준시가를 적어, 적힌 산식으로 적힌 값이 나오지 않았다.
 *           엔진은 기준시가를 지분만큼 줄인 뒤 채무비율을 곱한다(mixed-use-burdened-gift.ts basisOf) — 산식에 「× 지분」 항을 적는다.
 *
 * 시료는 route anchor `transfer.route.mixed-use-bg-share.anchor.test.ts`(SH-1·SH-4)와 같다 — 화면 경로(④ → ⑫ → ⑭ → 엔진).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { BurdenedGiftGiftTaxRows } from "@/components/calc/results/transfer/BurdenedGiftGiftTaxRows";
import { resolveBgMixedDisplay } from "@/components/calc/results/transfer/DetailedStatementBgMixedFormulas";
import { buildBgMixedAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementBgMixedFormulas";
import { buildBgMixedExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementBgMixedFormulas";
import { MixedUseBgAcqRows } from "@/components/calc/results/mixed-use/MixedUseBurdenedGiftSection";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
afterEach(cleanup);

const mixed = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2010-03-15",
  isMixedUseHouse: true,
  residentialFloorArea: "100",
  nonResidentialFloorArea: "100",
  mixedUseTotalLandArea: "200",
  buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000",
  mixedTransferLandPricePerSqm: "5000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000",
  mixedTransferHousingBuildingStdPrice: "100000000",
  mixedIsMetropolitanArea: true,
  fixedAcquisitionPrice: "700000000",
};
const BG_ON = {
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1500000000",
  bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "actual",
  bgActualAcquisitionTotal: "700000000",
  standardPriceAtTransfer: "1500000000",
  standardPriceAtAcq: "700000000",
  bgMortgageAttribution: "unallocated",
  bgHousingAppraisalDeclared: "none",
};
const SHARE = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };

const mk = (over: Record<string, unknown>): TransferFormData =>
  ({
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", ...mixed, ...over } as AssetForm],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1500000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: false,
  }) as unknown as TransferFormData;

async function calc(over: Record<string, unknown>) {
  const f = mk(over);
  const issues = collectStepIssues(0, f as never);
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
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        isNonBusinessLand: false,
        annualBasicDeductionUsed: 0,
        ...cap.body,
        isOneHousehold: false,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as { data?: { result?: MixedUseGainBreakdown } };
  const raw = json.data?.result;
  return { issues, status: res.status, result: raw ? mixedUseToFilingResult(raw) : undefined };
}

const num = (s: string) => Number(s.replace(/,/g, ""));
const amountsOf = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("tr")).map((tr) => {
    const tds = tr.querySelectorAll("td");
    return { label: tds[0]?.textContent ?? "", value: tds[1]?.textContent ?? "" };
  });

describe("R-c04-01 · 부담부증여 증여세 행 — §57 할증과세액 행", () => {
  it("세대생략(손자녀) 수증 → 할증과세액 행이 있고, 보이는 행만으로 산출세액 + 할증 − 공제 = 결정세액", async () => {
    const { issues, status, result } = await calc({ ...BG_ON, bgMortgageDebtAmount: "300000000", ...SHARE, bgIsGenerationSkip: true });
    expect(issues).toEqual([]);
    expect(status).toBe(200);
    const gt = result!.mixedUseDetail!.burdenedGift!.giftTax!;
    expect(gt.generationSkipSurcharge).toBeGreaterThan(0);
    const { container } = render(
      <table><tbody><BurdenedGiftGiftTaxRows giftTax={gt} /></tbody></table>,
    );
    const rows = amountsOf(container);
    expect(rows[0].label).toContain("§57");
    const surchargeRow = rows.find((r) => r.label.includes("할증과세액"));
    expect(surchargeRow).toBeDefined();
    expect(surchargeRow!.label).toContain("상증법 §57");
    const val = (needle: string) => num(rows.find((r) => r.label.includes(needle))!.value);
    const computed = val("산출세액");
    const surcharge = num(surchargeRow!.value);
    const prior = rows.find((r) => r.label.includes("§58")) ? -val("§58") : 0;
    const filing = -val("신고세액공제");
    const final = val("결정세액");
    expect(surcharge).toBe(gt.generationSkipSurcharge);
    expect(computed + surcharge - prior - filing).toBe(final);
  });

  it("🔴 짝: 세대생략 아님 → 할증과세액 행 없음 · 산출세액 − 공제 = 결정세액 그대로", async () => {
    const { status, result } = await calc({ ...BG_ON, bgMortgageDebtAmount: "300000000", ...SHARE });
    expect(status).toBe(200);
    const gt = result!.mixedUseDetail!.burdenedGift!.giftTax!;
    expect(gt.generationSkipSurcharge ?? 0).toBe(0);
    const { container } = render(
      <table><tbody><BurdenedGiftGiftTaxRows giftTax={gt} /></tbody></table>,
    );
    const rows = amountsOf(container);
    expect(rows.some((r) => r.label.includes("할증과세액"))).toBe(false);
    const val = (needle: string) => num(rows.find((r) => r.label.includes(needle))!.value);
    expect(val("산출세액") + val("신고세액공제")).toBe(val("결정세액"));
  });
});

/**
 * 「A × 지분 50% × (… 양도로 보는 채무액 N / … 증여가액 D) [× 개산공제율 3%] = V」 를 법대로 곱해(중간 floor) V와 대조한다.
 * 지분 항은 「P%」(십진) 또는 「p/q」(분수) — 적힌 값 그대로 정확히(BigInt) 곱한다.
 */
function shareFrac(s: string): [bigint, bigint] {
  const f = s.match(/^(\d+)\/(\d+)$/);
  if (f) return [BigInt(f[1]), BigInt(f[2])];
  const [i, d = ""] = s.replace(/%$/, "").split(".");
  return [BigInt(i + d), 100n * 10n ** BigInt(d.length)];
}
function evalLine(line: string) {
  const m = line.match(/기준시가 ([\d,]+)( × 지분 ([\d.]+%|\d+\/\d+))? × \(\S+ 양도로 보는 채무액 ([\d,]+) \/ \S+ 증여가액 ([\d,]+)\)( × 개산공제율 ([\d.]+)%)? = ([\d,]+)/);
  if (!m) throw new Error(`산식 형식 불일치: ${line}`);
  let x = BigInt(num(m[1]));
  if (m[3]) {
    const [p, q] = shareFrac(m[3]);
    x = (x * p) / q;
  }
  x = (x * BigInt(num(m[4]))) / BigInt(num(m[5]));
  if (m[7]) x = Math.floor((Number(x) * Number(m[7])) / 100) as unknown as bigint;
  return { computed: Number(x), shown: num(m[8]), hasShare: m[2] !== undefined, share: m[3] };
}

describe("R-c04-02 · 겸용 부담부증여 공유지분 — 취득가액·개산공제 산식에 지분 항", () => {
  it("SH-4(지분 50% · 담보 승 → 취득시 기준시가 경로): 적힌 산식대로 곱한 값 = 적힌 값", async () => {
    const { issues, status, result } = await calc({ ...BG_ON, bgMortgageDebtAmount: "800000000", ...SHARE });
    expect(issues).toEqual([]);
    expect(status).toBe(200);
    const d = resolveBgMixedDisplay(result!)!;
    expect(d.breakdown.ownershipRatio).toBe(0.5);
    expect(d.breakdown.acquisitionMethodUsed).toBe("standard_price");
    const lines = [
      ...buildBgMixedAcquisitionFormula(d).split("\n"),
      ...buildBgMixedExpenseFormula(d).split("\n"),
    ].filter((l) => l.includes("기준시가"));
    expect(lines.length).toBe(8);
    for (const l of lines) {
      const e = evalLine(l);
      expect(e.hasShare, l).toBe(true);
      expect(e.computed, l).toBe(e.shown);
    }
    // 형제 경로 — 결과 카드(겸용 본문)의 취득가액·개산공제 산식 줄에도 같은 지분 항(주택·상가 각 4줄 = 취득 2 + 개산공제 2)
    for (const side of ["housing", "commercial"] as const) {
      const { container } = render(<MixedUseBgAcqRows bg={d.breakdown} side={side} />);
      const text = container.textContent ?? "";
      expect(text.match(/기준시가 [\d,]+ × 지분 50% ×/g)?.length, side).toBe(4);
      cleanup();
    }
  });

  it.each([
    // 레거시 저장값(분모 ≠ 100) — 순환 소수 지분. 4자리 % 반올림으로 적으면 1/3에서 −83원·−16원·−2원 어긋났다(리뷰 반영).
    { name: "레거시 1/3 · 채무 5.5억", share: { ownershipNumerator: "1", ownershipDenominator: "3" }, debt: "550000000", term: "1/3" },
    { name: "레거시 1/7 · 채무 2.5억", share: { ownershipNumerator: "1", ownershipDenominator: "7" }, debt: "250000000", term: "1/7" },
    // 화면 % 칸에 소수 5자리 이상 — 유한 소수라 엔진은 정확 십진 계산, 적는 %도 잘라 내지 않는다.
    { name: "33.33333% · 채무 5.5억", share: { ownershipNumerator: "33.33333", ownershipDenominator: "100" }, debt: "550000000", term: "33.33333%" },
  ])("$name: 지분 항이 엔진이 곱한 지분 그대로 적히고 산식 = 값", async ({ share, debt, term }) => {
    const { issues, status, result } = await calc({ ...BG_ON, bgMortgageDebtAmount: debt, ...share, ownershipRemainderThirdParty: "yes" });
    expect(issues).toEqual([]);
    expect(status).toBe(200);
    const d = resolveBgMixedDisplay(result!)!;
    expect(d.breakdown.acquisitionMethodUsed).toBe("standard_price");
    const lines = [
      ...buildBgMixedAcquisitionFormula(d).split("\n"),
      ...buildBgMixedExpenseFormula(d).split("\n"),
    ].filter((l) => l.includes("기준시가"));
    expect(lines.length).toBe(8);
    for (const l of lines) {
      const e = evalLine(l);
      expect(e.share, l).toBe(term);
      expect(e.computed, l).toBe(e.shown);
    }
    const { container } = render(<MixedUseBgAcqRows bg={d.breakdown} side="housing" />);
    expect(container.textContent?.split(`× 지분 ${term} ×`).length).toBe(5);
  });

  it("🔴 짝: 단독 소유(지분 없음) · 같은 담보 승 경로 → 지분 항 없음 · 산식 = 값", async () => {
    const { status, result } = await calc({ ...BG_ON, bgMortgageDebtAmount: "1600000000" });
    expect(status).toBe(200);
    const d = resolveBgMixedDisplay(result!)!;
    expect(d.breakdown.ownershipRatio).toBeUndefined();
    expect(d.breakdown.acquisitionMethodUsed).toBe("standard_price");
    const lines = [
      ...buildBgMixedAcquisitionFormula(d).split("\n"),
      ...buildBgMixedExpenseFormula(d).split("\n"),
    ].filter((l) => l.includes("기준시가"));
    expect(lines.length).toBe(8);
    for (const l of lines) {
      const e = evalLine(l);
      expect(e.hasShare, l).toBe(false);
      expect(e.computed, l).toBe(e.shown);
    }
    const { container } = render(<MixedUseBgAcqRows bg={d.breakdown} side="housing" />);
    expect(container.textContent).not.toContain("× 지분");
    expect(container.textContent?.match(/기준시가 [\d,]+ × /g)?.length).toBe(4);
  });
});
