/**
 * anchor — §155 의제 2주택 이상(합가 ④⑤ · ⑥ 문화유산 · ⑦ 농어촌 · ⑧ 수도권 밖 부득이) × §154① 단서
 * (`docs/00-pm/deemed-two-house-proviso.plan.md` · V-F4 Q-M1 (a)·Q-M2 (a) 사용자 결정 2026-10-26).
 *
 * §155④⑤ 「1세대1주택으로 보아 제154조제1항을 적용」 · ⑥⑦⑧ 「1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용」.
 * 서면-2015-부동산-22330 — 동거봉양 합가 × 3호에 「§155④ 및 §154① 단서 적용」. 종전에는 단서 카드 게이트가 `null`로
 * 떨어뜨려 계산기·판정 메뉴가 사유를 버렸다(혼인 합가 + 5호 과세 163,966,000 — 엔진 직접은 비과세 0).
 *
 * 시료: 일반 주택 · 서울 강남(2017-08-03~ 조정) · 양도 10억 · 2024-06-01 양도 · 다른 주택 1채(경남 비조정 · 기준시가 4억 · 2015 취득).
 *   5호: 2017-10-01 취득 · 거주 0. 1·2가·3호: 2023-01-01 취득(보유 1년 5개월).
 *
 * | # | 주장 |
 * |---|---|
 * | DP-1 | 혼인 합가 + 5호 → ④ 본문에 5호 · 비과세 0 · 근거에 5호 |
 * | DP-2 | 혼인 합가 + 1호·2가·3호 → 각각 비과세 0 |
 * | DP-3 | 혼인 합가 · 단서 없음 → 과세 328,350,000(음성 짝) |
 * | DP-4 | 동거봉양 · 3주택 중첩 · ⑥ · ⑦ · ⑧ + 5호 → 비과세 0 |
 * | DP-5 | 합가 특례 불성립(혼인 6년 — 2024.11.12. 전 양도는 5년) + 5호 → 과세(단서가 의제를 대신하지 않는다) |
 * | DP-6 | 순수 2주택(의제 선언 없음) → 단서 미전송 · 과세 |
 * | DP-7 | 게이트·정규화 단위 — deemed_one_house에서 1·2가·3·5호만 통과 |
 * | DP-8 | ⑧ — 의제 맥락 + 5호 + 무주택 미확인 → 검증 오류(계산기·판정 메뉴) |
 * | DP-9 | 1주택 판정 메뉴 — 같은 결론 · 적용 특례 행에 합가 + 단서 |
 * | DP-10 | 카드 — deemed_one_house 옵션은 1·2가·3·5호 · 안내문 |
 * | DP-11 | 다주택 중과 15호 — 합가 + 5호면 배제(② 요소가 같은 정본) |
 * | DP-12 | 다건 계산기 ④ · 부담부증여 게이트도 같은 맥락 |
 * | DP-13 | 본칙만으로 충족(거주 27개월)이면 단서가 실려도 근거에 적지 않는다(결정적일 때만) |
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm, houseRow, allIssues } from "./_helpers/redev-one-house-route";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { POST as judgmentPOST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { judgmentProvisoMode } from "@/lib/calc/one-house-judgment-section-scope";
import { provisoGate, effectiveProvisoReason } from "@/lib/calc/transfer-tax-api-helpers";
import { deemedOneHouseContextDeclared } from "@/lib/calc/deemed-one-house-context";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { giftBurdenedProvisoMode } from "@/lib/calc/gift-burdened-one-house";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => cleanup());

const GANGNAM = "1168010100";
const NC = { region: "non_capital", regionCode: "4682025021", officialPrice: "400000000", isApartment: false, acquisitionOrigin: "general" };
const TAXED_5 = 163_966_000;
const TAXED_123 = 328_350_000;
const P5 = { provisoReason: "pre_designation_contract", provisoPreContractNoHouse: true };
const REASONS = {
  p5: { acq: "2017-10-01", proviso: P5, label: "5호 공고전계약" },
  p1: { acq: "2023-01-01", proviso: { provisoReason: "rental_5yr_residence", provisoRentalLeaseResidenceMonths: "70" }, res: ["2023-01-01", "2024-06-01"], label: "1호 임대주택 거주5년" },
  p2a: { acq: "2023-01-01", proviso: { provisoReason: "expropriation", provisoExpropriationDate: "2024-06-01", provisoBusinessApprovalDate: "2023-06-01" }, label: "2호가 수용" },
  p3: { acq: "2023-01-01", proviso: { provisoReason: "unavoidable" }, res: ["2023-01-01", "2024-02-01"], label: "3호 부득이" },
  none: { acq: "2023-01-01", proviso: {}, label: "" },
} as const;
type Reason = keyof typeof REASONS;
const MARRIAGE = { marriageDate: "2023-03-01", isFirstTransferredInMerge: true };
const PARENTAL = { parentalCareMergeDate: "2023-03-01", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true };
const RURAL = { oneHouseRuralHouse: true, ruralHouseKind: "farm_exit", ruralOwnerResidenceYears: "6", ruralOutsideCapitalEupMyeon: true, ruralReturnedToFarmExitHouse: false };

function form(o: { reason: Reason; merge?: object; row?: object; extraHouse?: boolean; transfer?: string; price?: string; noHouse?: boolean }) {
  const R = REASONS[o.reason];
  const houses = [houseRow("sp", "2015-01-01", { ...NC, ...(o.merge ? { mergeOrigin: "counterpart_side" } : {}), ...(o.row ?? {}) } as never)];
  if (o.extraHouse) houses.push(houseRow("nb", "2022-01-01", { ...NC, mergeOrigin: "seller_side" } as never));
  const transfer = o.transfer ?? "2024-06-01";
  return redevAptForm({
    kind: "housing",
    price: o.price ?? "1000000000",
    count: String(houses.length + 1),
    houses,
    assetOver: {
      acquisitionDate: R.acq,
      regionCode: GANGNAM,
      ...("res" in R ? { residenceInputMode: "interval", residencePeriods: [{ moveInDate: R.res[0], moveOutDate: R.res[1] }] } : { residenceInputMode: "direct", residencePeriods: [] }),
    },
    formOver: {
      residencePeriodMonths: "0",
      transferDate: transfer,
      filingDate: `${transfer.slice(0, 4)}-12-31`,
      ...(o.merge ?? {}),
      ...R.proviso,
      ...(o.noHouse === false ? { provisoPreContractNoHouse: false } : {}),
    } as never,
  });
}

describe("계산기 — §155 의제 2주택 이상 × §154① 단서", () => {
  it("DP-1 혼인 합가 + 5호 → 단서가 실려 비과세 · 근거에 5호", async () => {
    const f = form({ reason: "p5", merge: MARRIAGE });
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(r.body.oneHouseExemptionProviso).toEqual({ reason: "pre_designation_contract", preContractNoHouse: true });
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);
    expect(r.result.exemptReason).toBe("혼인 합가 (§155⑤) 1세대1주택 비과세 (§154① 단서 5호 공고전계약)");
  });

  it.each(["p1", "p2a", "p3"] as const)("DP-2 혼인 합가 + %s → 비과세 0 · 근거에 그 호", async (reason) => {
    const r = await runCalc(form({ reason, merge: MARRIAGE }));
    expect(r.status).toBe(200);
    expect(r.body.oneHouseExemptionProviso).toMatchObject({ reason: (REASONS[reason].proviso as { provisoReason: string }).provisoReason });
    expect(r.result.totalTax).toBe(0);
    expect(r.result.exemptReason).toBe(`혼인 합가 (§155⑤) 1세대1주택 비과세 (§154① 단서 ${REASONS[reason].label})`);
  });

  it("DP-3 혼인 합가 · 단서 없음 → 과세(음성 짝)", async () => {
    const r = await runCalc(form({ reason: "none", merge: MARRIAGE }));
    expect(r.body.oneHouseExemptionProviso).toBeUndefined();
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(TAXED_123);
  });

  it.each([
    ["동거봉양 합가", { merge: PARENTAL }, "동거봉양 합가 (§155④) 1세대1주택 비과세 (§154① 단서 5호 공고전계약)"],
    ["일시적 2주택·혼인 합가 3주택 중첩", { merge: MARRIAGE, extraHouse: true }, "일시적 2주택·혼인 합가 중첩 (§155①·⑤) 1세대1주택 비과세 (§154① 단서 5호 공고전계약)"],
    ["§155⑥ 문화유산", { row: { oneHouseCulturalHeritage: true } }, "문화유산 주택 비과세 (§155⑥1호 · §154① 단서 5호 공고전계약)"],
    ["§155⑦ 농어촌(이농)", { row: RURAL }, "농어촌주택 비과세 (§155⑦2호 이농 · §154① 단서 5호 공고전계약)"],
    [
      "§155⑧ 수도권 밖 부득이",
      { row: { oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work", unavoidableOutsideCapitalUnresolved: true } },
      "수도권 밖 부득이한 사유 주택 비과세 (§155⑧ 근무상 형편 · §154① 단서 5호 공고전계약)",
    ],
  ] as const)("DP-4 %s + 5호 → 비과세 0", async (_label, over, exemptReason) => {
    const f = form({ reason: "p5", ...over });
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(r.body.oneHouseExemptionProviso).toEqual({ reason: "pre_designation_contract", preContractNoHouse: true });
    expect(r.result.totalTax).toBe(0);
    expect(r.result.exemptReason).toBe(exemptReason);
  });

  it("DP-5 합가 특례 불성립(혼인 2018 · 2024.11.12. 전 양도는 5년) + 5호 → 과세 그대로", async () => {
    const r = await runCalc(form({ reason: "p5", merge: { ...MARRIAGE, marriageDate: "2018-01-01" } }));
    expect(r.body.oneHouseExemptionProviso).toEqual({ reason: "pre_designation_contract", preContractNoHouse: true });
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(TAXED_5);
  });

  it("DP-6 순수 2주택(의제 선언 없음) + 5호 → 단서 미전송 · 과세", async () => {
    const f = form({ reason: "p5" });
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.body.oneHouseExemptionProviso).toBeUndefined();
    expect(r.result.totalTax).toBe(TAXED_5);
  });

  it("DP-13 합가 + 5호 + 실제 거주 27개월 → 비과세 · 근거에 단서 없음(본칙만으로 충족)", async () => {
    const f = form({ reason: "p5", merge: MARRIAGE });
    f.assets = f.assets.map((a) => ({ ...a, residenceInputMode: "interval", residencePeriods: [{ moveInDate: "2017-10-01", moveOutDate: "2020-01-01" }] }) as typeof a);
    const r = await runCalc(f);
    expect(r.body.oneHouseExemptionProviso).toEqual({ reason: "pre_designation_contract", preContractNoHouse: true });
    expect(r.result.totalTax).toBe(0);
    expect(r.result.exemptReason).toBe("혼인 합가 (§155⑤) 1세대1주택 비과세");
  });

  it("DP-8 의제 맥락 + 5호 + 무주택 미확인 → ⑧ 검증 오류(카드가 보이는 맥락이라 막는다)", () => {
    const issues = allIssues(form({ reason: "p5", merge: MARRIAGE, noHouse: false }));
    expect(issues.some((i) => i.message.includes("무주택"))).toBe(true);
  });

  it("DP-11 다주택 중과 15호 — 합가 + 5호면 배제 · 단서 없으면 중과(유예 기간 밖 2026-06-01 · 15억)", async () => {
    const m = { ...MARRIAGE, marriageDate: "2025-01-01" };
    const withP = await runCalc(form({ reason: "p5", merge: m, transfer: "2026-06-01", price: "1500000000" }));
    expect(withP.result.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(false);
    expect(withP.result.multiHouseSurchargeEvaluation?.exclusionReasons.map((e: { detail: string }) => e.detail).join()).toContain("§167의10①15호·§155⑤");
    expect(withP.result.totalTax).toBe(47_245_000);
    const none = await runCalc({ ...form({ reason: "p5", merge: m, transfer: "2026-06-01", price: "1500000000" }), provisoReason: "" });
    expect(none.result.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(true);
    expect(none.result.totalTax).toBe(640_761_000);
  });
});

describe("DP-7 게이트·정규화", () => {
  const base = { isOneHousehold: true, isHousing: true, householdHousingCount: 2, temporaryTwoHouseApplies: false, deemedOneHouseContextDeclared: true, rentalResidenceDeclared: false };
  it("2주택 이상 + 의제 선언 → deemed_one_house · 일시적 2주택이 먼저", () => {
    expect(provisoGate(base)).toEqual({ visible: true, mode: "deemed_one_house" });
    expect(provisoGate({ ...base, householdHousingCount: 4 })).toEqual({ visible: true, mode: "deemed_one_house" });
    expect(provisoGate({ ...base, temporaryTwoHouseApplies: true })).toEqual({ visible: true, mode: "temporary_two_house" });
    expect(provisoGate({ ...base, deemedOneHouseContextDeclared: false })).toEqual({ visible: false, mode: null });
    expect(provisoGate({ ...base, householdHousingCount: 1 })).toEqual({ visible: true, mode: "one_house" });
  });
  it("deemed_one_house — 1·2가·3·5호 통과 · 나·다목·삭제 전 4호는 버림", () => {
    for (const r of ["rental_5yr_residence", "expropriation", "unavoidable", "pre_designation_contract"]) {
      expect(effectiveProvisoReason("deemed_one_house", r), r).toBe(r);
    }
    for (const r of ["overseas_migration", "overseas_residence", "rental_registration_4ho"]) {
      expect(effectiveProvisoReason("deemed_one_house", r), r).toBe("");
    }
  });
  it("의제 선언 leaf — 합가일 · 명부 행 표시(⑥⑦⑧) · 레거시 스칼라", () => {
    const f = (over: object) => ({ ...form({ reason: "none" }), ...over });
    expect(deemedOneHouseContextDeclared(f({}))).toBe(false);
    expect(deemedOneHouseContextDeclared(f({ marriageDate: "2023-03-01" }))).toBe(true);
    expect(deemedOneHouseContextDeclared(f({ parentalCareMergeDate: "2023-03-01" }))).toBe(true);
    expect(deemedOneHouseContextDeclared(form({ reason: "none", row: { oneHouseCulturalHeritage: true } }))).toBe(true);
    expect(deemedOneHouseContextDeclared(form({ reason: "none", row: RURAL }))).toBe(true);
    expect(deemedOneHouseContextDeclared(form({ reason: "none", row: { oneHouseUnavoidableOutsideCapital: true } }))).toBe(true);
    expect(deemedOneHouseContextDeclared(f({ culturalHeritageHouseSpecial: true }))).toBe(true);
    // 양도일 뒤 취득 행의 표시는 보지 않는다(양도일 현재 보유 행만 — ④와 같은 leaf)
    const later = form({ reason: "none" });
    later.houses = [houseRow("sp", "2025-01-01", { ...NC, oneHouseCulturalHeritage: true } as never)];
    expect(deemedOneHouseContextDeclared(later)).toBe(false);
  });
});

function menuCase(merge: object, reason: Reason, noHouse = true): RulingCase {
  const R = REASONS[reason];
  return {
    id: "x", docNo: "-", docDate: "-", basis: "current", today: "2024-06-01", summary: "x", bucket: "match",
    form: {
      isOneHousehold: true, transferDate: "2024-06-01", contractTotalPrice: "1000000000", ...merge, ...R.proviso,
      ...(noHouse ? {} : { provisoPreContractNoHouse: false }),
      asset: { assetKind: "housing", acquisitionDate: R.acq, regionCode: GANGNAM, residencePeriodMonthsAsset: "0" },
      houses: [{ id: "sp", region: "non_capital", regionCode: "4682025021", acquisitionDate: "2015-01-01", officialPrice: "400000000", mergeOrigin: "counterpart_side" }],
    } as RulingCase["form"],
  };
}
async function runMenu(c: RulingCase) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    const fm = buildCaseForm(c);
    const ve = validateAllSteps(fm).filter((e) => e.severity === "error").map((e) => `${e.field}: ${e.message}`);
    const body = buildOneHouseExemptionApiBody(fm) as Record<string, unknown>;
    const res = await judgmentPOST(new NextRequest("http://localhost/api/calc/one-house-exemption", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    const j = (await res.json())?.data?.judgment;
    return { fm, ve, body, status: res.status, isExempt: j?.isExempt as boolean | undefined, applied: ((j?.appliedExceptions ?? []) as { id: string }[]).map((x) => x.id) };
  } finally {
    vi.useRealTimers();
  }
}

describe("1주택 판정 메뉴", () => {
  it("DP-9 혼인 합가 + 5호 → 맥락 deemed_one_house · 비과세 · 적용 특례에 합가와 5호", async () => {
    const m = await runMenu(menuCase(MARRIAGE, "p5"));
    expect(judgmentProvisoMode(m.fm)).toBe("deemed_one_house");
    expect(m.ve).toEqual([]);
    expect(m.body.oneHouseExemptionProviso).toEqual({ reason: "pre_designation_contract", preContractNoHouse: true });
    expect(m.status).toBe(200);
    expect(m.isExempt).toBe(true);
    expect(m.applied).toEqual(["155-5-marriage-merge", "154-1-proviso:pre_designation_contract"]);
  });
  it("DP-9′ 동거봉양 합가 + 2가 → 비과세 · 적용 특례에 2가", async () => {
    const m = await runMenu(menuCase(PARENTAL, "p2a"));
    expect(m.isExempt).toBe(true);
    expect(m.applied).toEqual(["155-4-parental-care-merge", "154-1-proviso:expropriation"]);
  });
  it("DP-8′ 판정 메뉴 ⑧ — 의제 맥락 + 5호 + 무주택 미확인 → 막는다", async () => {
    const m = await runMenu(menuCase(MARRIAGE, "p5", false));
    expect(m.ve.some((e) => e.startsWith("provisoReason") && e.includes("무주택"))).toBe(true);
  });
});

describe("DP-10 카드", () => {
  it("deemed_one_house — 옵션은 해당없음 + 1·2가·3·5호, 의제 안내문", () => {
    render(
      <ExemptionProvisoSection
        provisoReason=""
        provisoDepartureDate=""
        provisoDepartureOnlyHouse=""
        provisoExpropriationDate=""
        provisoBusinessApprovalDate=""
        provisoRentalLeaseResidenceMonths=""
        provisoPreContractNoHouse={false}
        mode="deemed_one_house"
        onChange={() => {}}
      />,
    );
    const values = Array.from(document.querySelectorAll('input[name="provisoReason"]')).map((e) => (e as HTMLInputElement).value);
    expect([...values].sort()).toEqual(["expropriation", "none", "pre_designation_contract", "rental_5yr_residence", "unavoidable"]);
    expect(screen.getByText(/합가·문화유산·농어촌·수도권 밖 부득이 주택 특례로 1세대1주택으로 보는 주택은/)).toBeTruthy();
  });
});

describe("DP-12 다건 계산기 · 부담부증여", () => {
  it("다건 ④ — 합가 맥락 5호를 싣는다(단건과 같은 게이트)", () => {
    const p = buildPropertyPayload(form({ reason: "p5", merge: MARRIAGE })) as Record<string, unknown>;
    expect(p.oneHouseExemptionProviso).toEqual({ reason: "pre_designation_contract", preContractNoHouse: true });
    const pure = buildPropertyPayload(form({ reason: "p5" })) as Record<string, unknown>;
    expect(pure.oneHouseExemptionProviso).toBeUndefined();
  });
  it("부담부증여 게이트 — 2주택 + 합가일 → deemed_one_house · 합가일 없음 → null", () => {
    const bgt = (o: Partial<BurdenedGiftTransferTaxInput>) =>
      ({ acquisitionDate: new Date("2018-03-01"), isOneHousehold: true, householdHousingCount: 2, residencePeriodMonths: 0, ...o }) as BurdenedGiftTransferTaxInput;
    expect(giftBurdenedProvisoMode(bgt({ marriageDate: "2023-03-01" }))).toBe("deemed_one_house");
    expect(giftBurdenedProvisoMode(bgt({ parentalCareMergeDate: "2023-03-01" }))).toBe("deemed_one_house");
    expect(giftBurdenedProvisoMode(bgt({}))).toBeNull();
  });
});
