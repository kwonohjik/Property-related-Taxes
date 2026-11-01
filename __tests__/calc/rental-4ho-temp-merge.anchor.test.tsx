/**
 * anchor — 삭제 전 §154①4호 × 일시적 2주택(§155①)·§155 의제(④⑤⑥⑦⑧) 맥락
 * (`docs/00-pm/rental-4ho-temp-merge-gaps.plan.md` · Q-1 (a)·Q-2 (b) 사용자 결정 2026-11-01).
 *
 * 근거 회신: 부동산납세과-1321(2021.9.29.) 「제155조 제1항에 따른 일시적 2주택 적용 시에도 해당 주택은 거주기간의 제한을 받지 아니」 ·
 * 부동산납세과-1334(2023.5.15.) 「제155조제5항에 따른 혼인합가 특례 적용 시에도 해당주택은 거주기간의 제한을 받지 아니」.
 * 금액은 mock 세율. 시료 일자는 각 회신의 사실관계를 따른다. 다른 주택은 비조정(경남).
 *
 * | # | 주장 |
 * |---|---|
 * | RT-1 | 일시적 2주택 + 완비 → ④ 실림 · 비과세 · 근거 행은 종전 4호+부칙 · 1321 고지 |
 * | RT-2 | 일시적 2주택 15억 — 2026-06 양도는 중과 배제까지 열린다 |
 * | RT-3 | 계산기 일시적 2주택 + 미완 → ⑧ 0건 · 본문 미탑재 · 과세 · 고지(카드가 없는 화면) |
 * | RT-4 | 1년 안 취득 → 과세(4호는 §155① 1년 요건을 면제하지 않는다) |
 * | RT-5 | 신청 2019-12-17 → 과세 + 미적용 사유 |
 * | RT-6 | 혼인 합가 → 비과세 · 1334 고지 / 동거봉양 → 비과세 · 정면 회신 미확보 고지 |
 * | RT-7 | 합가 맥락은 카드가 있어 ⑧이 미완을 막는다 |
 * | RT-8 | §155⑦ · 근거 표시 |
 * | RT-9 | 미선택 고지 — 일시적 2주택·합가는 결론을 가를 때만 · 순수 2주택 없음 · 1주택 보유 미달은 유지 |
 * | RT-10 | 다건·판정 route 도달 |
 * | RT-11 | 판정 → 계산기 전달 |
 * | RT-12 | 화면 — 일시적 2주택·합가 옵션에 4호, 칸에 값 · 전달 카드는 ④와 같은 사유만 적는다 |
 * | RT-13 | 겸용주택 — 일시적 2주택·혼인 합가 + 4호 → 주택분 비과세(대조 과세) |
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
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { POST as JUDGE } from "@/app/api/calc/one-house-exemption/route";
import { runCalc, redevAptForm, houseRow, allIssues } from "./_helpers/redev-one-house-route";
import { buildPropertyPayload, callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { judgmentProvisoMode } from "@/lib/calc/one-house-judgment-section-scope";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { effectiveProvisoReason } from "@/lib/calc/transfer-tax-api-helpers";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { TEMP_TWO_HOUSE_ACCEPTED_PROVISO_REASONS, TEMP_TWO_HOUSE_PROVISO_REASONS } from "@/lib/tax-engine/legal-codes/transfer";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";
import { ImportedOneHouseFactsCard } from "@/components/calc/transfer/ImportedOneHouseFactsCard";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const GANGNAM = "1168010100";
const NC = "4682025021";
const R4 = "rental_registration_4ho";
const ID4 = `154-1-proviso:${R4}`;
const NOTICE_ID = "삭제 전 소득세법 시행령 §154①4호";
const BASIS = "소득세법 시행령 §154 ① 4호(2020.2.11. 삭제 전) · 대통령령 제30395호 부칙 제38조 ②";

const facts = (date: string, over: object = {}) => ({
  provisoReason: R4,
  proviso4hoBusinessRegDate: date,
  proviso4hoRentalRegDate: date,
  proviso4hoRegulatedOneHouse: "yes",
  proviso4hoStatus: "auto_cancelled",
  ...over,
});
const other = (id: string, acq: string, over: object = {}) =>
  houseRow(id, acq, { region: "non_capital", regionCode: NC, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general", ...over } as never);

function form(o: { acq: string; transfer: string; price: string; houses: ReturnType<typeof other>[]; f?: object }): TransferFormData {
  return redevAptForm({
    kind: "housing",
    price: o.price,
    count: String(o.houses.length + 1),
    houses: o.houses,
    assetOver: { acquisitionDate: o.acq, regionCode: GANGNAM, residenceInputMode: "direct", residencePeriods: [] },
    formOver: { residencePeriodMonths: "0", transferDate: o.transfer, filingDate: `${o.transfer.slice(0, 4)}-12-31`, ...(o.f ?? {}) } as never,
  });
}

/** 부동산납세과-1321 사실 — A 2019-02 취득 · 2019-03 등록 · B 2022-03 취득 · 2023-03 말소·양도 */
const TEMP = { acq: "2019-02-01", transfer: "2023-03-20", price: "1000000000", houses: [other("b", "2022-03-01")] };
const TEMP_F = facts("2019-03-01");
const TAXED_TEMP = 172_766_000;
/** 부동산납세과-1334 사실 — B 2018-08 취득 · 2018-09 등록 · 乙 C 2018-02 · 혼인 2021-01 · 2022-09 말소 · 양도 */
const MERGE = { acq: "2018-08-01", transfer: "2024-06-01", price: "1000000000", houses: [other("c", "2018-02-01", { mergeOrigin: "counterpart_side" })] };
const MERGE_P = facts("2018-09-01");
const MARRIAGE = { marriageDate: "2021-01-01", isFirstTransferredInMerge: true };
const PARENTAL = { parentalCareMergeDate: "2023-03-01", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true };
const TAXED_MERGE = 168_366_000;

const warnings = (r: { warnings?: string[] }) => (r.warnings ?? []).join("\n");
const ids = (r: { appliedExceptions?: { id: string }[] }) => (r.appliedExceptions ?? []).map((e) => e.id);

describe("일시적 2주택 × 4호", () => {
  it("RT-1 완비 → 실림 · 비과세 · 근거 행 종전 4호+부칙 · 1321 고지", async () => {
    const f = form({ ...TEMP, f: TEMP_F });
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect((r.body.oneHouseExemptionProviso as { reason: string }).reason).toBe(R4);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);
    expect(r.result.exemptReason).toBe("일시적 2주택 비과세 (§154① 단서 4호 임대사업자 등록)");
    expect(warnings(r.result)).toContain("부동산납세과-1321");
    expect(warnings(r.result)).toContain("1년 이상 지난 후 취득");
  });

  it("RT-2 15억 — 부분과세 · 2026-06 양도는 중과 배제까지", async () => {
    const r = await runCalc(form({ ...TEMP, price: "1500000000", f: TEMP_F }));
    expect(r.result.exemptReason).toBe("일시적 2주택 고가주택 (§154① 단서 4호 임대사업자 등록)");
    expect(r.result.totalTax).toBe(53_933_000);
    const late = { ...TEMP, transfer: "2026-06-01", price: "1500000000", houses: [other("b", "2024-01-01", { officialPrice: "400000000" })] };
    const withP = await runCalc(form({ ...late, f: TEMP_F }));
    expect(withP.result.totalTax).toBe(48_917_000);
    expect(withP.result.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(false);
    const none = await runCalc(form(late));
    expect(none.result.totalTax).toBe(640_761_000);
    expect(none.result.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(true);
  });

  it("RT-3 계산기 + 미완 → ⑧ 0건 · 본문 미탑재 · 과세 · 고지", async () => {
    const f = form({ ...TEMP, f: { provisoReason: R4 } });
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.body.oneHouseExemptionProviso).toBeUndefined();
    expect(r.result.totalTax).toBe(TAXED_TEMP);
    expect(warnings(r.result)).toContain(NOTICE_ID);
    expect(warnings(r.result)).toContain("1세대1주택 판정");
  });

  it("RT-4 다른 주택을 1년 안에 취득 → 과세", async () => {
    const r = await runCalc(form({ ...TEMP, houses: [other("b", "2019-06-01")], f: TEMP_F }));
    expect((r.body.oneHouseExemptionProviso as { reason: string }).reason).toBe(R4);
    expect(r.result.isExempt).toBe(false);
    expect(r.result.exemptReason ?? "").toBe("");
    expect(warnings(r.result)).not.toContain("부동산납세과-1321");
  });

  it("RT-5 신청 2019-12-17 → 과세 + 미적용 사유", async () => {
    const r = await runCalc(form({ ...TEMP, acq: "2019-06-01", houses: [other("b", "2022-03-01")], f: facts("2019-12-17") }));
    expect(r.result.isExempt).toBe(false);
    expect(warnings(r.result)).toContain("2019년 12월 16일 뒤입니다");
  });
});

describe("§155 의제 × 4호", () => {
  it("RT-6 혼인 합가 → 비과세 · 근거 부칙 · 1334 고지", async () => {
    const f = form({ ...MERGE, f: { ...MARRIAGE, ...MERGE_P } });
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.result.totalTax).toBe(0);
    expect(r.result.exemptReason).toBe("혼인 합가 (§155⑤) 1세대1주택 비과세 (§154① 단서 4호 임대사업자 등록)");
    expect(warnings(r.result)).toContain("부동산납세과-1334");
  });

  it("RT-6′ 동거봉양 합가 → 비과세 · 정면 회신 미확보 고지", async () => {
    const r = await runCalc(form({ ...MERGE, f: { ...PARENTAL, ...MERGE_P } }));
    expect(r.result.totalTax).toBe(0);
    expect(warnings(r.result)).toContain("정면 회신을 확인하지 못했습니다");
    expect(warnings(r.result)).not.toContain("부동산납세과-1334");
  });

  it("RT-7 합가 맥락 + 미완 → 카드가 있어 ⑧이 막는다", () => {
    const issues = allIssues(form({ ...MERGE, f: { ...MARRIAGE, provisoReason: R4 } }));
    expect(issues.some((i) => i.field === "proviso4hoBusinessRegDate")).toBe(true);
  });

  it("RT-8 §155⑦ 농어촌 + 4호 → 비과세 · 근거 표시", async () => {
    const RURAL = { oneHouseRuralHouse: true, ruralHouseKind: "farm_exit", ruralOwnerResidenceYears: "6", ruralOutsideCapitalEupMyeon: true, ruralReturnedToFarmExitHouse: false };
    const r = await runCalc(form({ ...MERGE, houses: [other("c", "2015-01-01", RURAL)], f: MERGE_P }));
    expect(r.result.totalTax).toBe(0);
    expect(r.result.exemptReason).toContain("§154① 단서 4호");
    expect(warnings(r.result)).toContain("정면 회신을 확인하지 못했습니다");
  });
});

describe("RT-9 미선택 고지", () => {
  it("일시적 2주택 — 거주만으로 과세되면 고지", async () => {
    const r = await runCalc(form(TEMP));
    expect(r.result.totalTax).toBe(TAXED_TEMP);
    expect(warnings(r.result)).toContain(NOTICE_ID);
  });
  it("혼인 합가 — 거주만으로 과세되면 고지", async () => {
    const r = await runCalc(form({ ...MERGE, f: MARRIAGE }));
    expect(r.result.totalTax).toBe(TAXED_MERGE);
    expect(warnings(r.result)).toContain(NOTICE_ID);
  });
  it("순수 2주택 — 4호로 결론이 바뀌지 않으면 고지 없음", async () => {
    const r = await runCalc(form({ ...TEMP, houses: [other("b", "2019-06-01")] }));
    expect(r.result.isExempt).toBe(false);
    expect(warnings(r.result)).not.toContain(NOTICE_ID);
  });
  it("1주택 보유 미달 — 현행 고지 유지(4호가 보유를 풀지 않아도)", async () => {
    const r = await runCalc(form({ acq: "2025-11-01", transfer: "2026-07-01", price: "900000000", houses: [] }));
    expect(r.result.isExempt).toBe(false);
    expect(warnings(r.result)).toContain(NOTICE_ID);
  });
});

async function bodyOf(send: () => Promise<unknown>) {
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
  }));
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body;
}
const post = (h: (r: NextRequest) => Promise<Response>, url: string, body: unknown) =>
  h(new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

describe("RT-10 다건·판정 route", () => {
  it("다건 — 일시적 2주택 완비 → 비과세 / 미완 → 본문 미탑재", async () => {
    const mf = { taxYear: 2023, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
    const f = form({ ...TEMP, f: TEMP_F });
    const body = await bodyOf(() => callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]));
    const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
    const json = (await res.json()) as { data: { properties: { isExempt: boolean }[] } };
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    expect(json.data.properties[0].isExempt).toBe(true);
    const partial = buildPropertyPayload(form({ ...TEMP, f: { provisoReason: R4 } })) as Record<string, unknown>;
    expect(partial.oneHouseExemptionProviso).toBeUndefined();
  });

  async function judge(f: TransferFormData) {
    const jf = { ...createInitialOneHouseJudgmentForm(), ...f };
    const res = await post(JUDGE, "http://l/api/calc/one-house-exemption", buildOneHouseExemptionApiBody(jf));
    const json = (await res.json()) as { data: { judgment: { isExempt: boolean; appliedExceptions: { id: string; legalBasis: string }[] } } };
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    return { mode: judgmentProvisoMode(jf), j: json.data.judgment };
  }
  it("판정 — 일시적 2주택 · 혼인 합가 → 비과세 · 적용 특례 근거", async () => {
    const t = await judge(form({ ...TEMP, f: TEMP_F }));
    expect(t.mode).toBe("temporary_two_house");
    expect(t.j.isExempt).toBe(true);
    expect(ids(t.j)).toEqual(["155-1-temporary-two-house", ID4]);
    expect(t.j.appliedExceptions.find((e) => e.id === ID4)?.legalBasis).toBe(BASIS);
    const m = await judge(form({ ...MERGE, f: { ...MARRIAGE, ...MERGE_P } }));
    expect(m.mode).toBe("deemed_one_house");
    expect(m.j.isExempt).toBe(true);
    expect(ids(m.j)).toContain(ID4);
    expect(m.j.appliedExceptions.find((e) => e.id === ID4)?.legalBasis).toBe(BASIS);
  });
});

describe("RT-11 판정 → 계산기 전달", () => {
  it("사유·4호 8필드가 patch에 실린다", () => {
    const keys = {
      provisoReason: R4,
      proviso4hoBusinessRegDate: "2019-03-01",
      proviso4hoRentalRegDate: "2019-03-01",
      proviso4hoRegulatedOneHouse: "yes",
      proviso4hoStatus: "maintained",
      proviso4hoDuringMandatory: "no",
      proviso4hoRentOver5: "yes",
      proviso4hoRentOver5ContractDate: "2019-01-01",
      proviso4hoGiftSeparated: true,
    };
    const patch = toTransferFormPatch({ ...createInitialOneHouseJudgmentForm(), ...keys } as never) as Record<string, unknown>;
    for (const [k, v] of Object.entries(keys)) expect(patch[k], k).toBe(v);
  });
});

describe("RT-12 화면·정규화", () => {
  const props = {
    provisoReason: "" as const, provisoDepartureDate: "", provisoExpropriationDate: "", provisoBusinessApprovalDate: "",
    provisoRentalLeaseResidenceMonths: "", provisoPreContractNoHouse: false, provisoDepartureOnlyHouse: "" as const,
    rental4ho: {}, onChange: () => {},
  };
  it.each(["temporary_two_house", "deemed_one_house"] as const)("%s — 4호 통과 · 나·다목은 그대로 버림 · 옵션 노출", (mode) => {
    expect(effectiveProvisoReason(mode, R4)).toBe(R4);
    expect(effectiveProvisoReason(mode, "overseas_migration")).toBe("");
    render(<ExemptionProvisoSection {...props} mode={mode} />);
    expect(screen.getByTestId("proviso-reason-rental_4ho")).toBeTruthy();
    expect(screen.queryByTestId("proviso-reason-overseas_migration")).toBeNull();
  });
  it("1년 요건 면제 집합에는 4호가 없다 — §155① 2문 인용(1호·2호가목·3호) 밖", () => {
    expect(TEMP_TWO_HOUSE_PROVISO_REASONS.has(R4)).toBe(false);
    expect(TEMP_TWO_HOUSE_ACCEPTED_PROVISO_REASONS.has(R4)).toBe(true);
  });
  it("일시적 2주택 칸에 1년 요건·처분기한 안내 · 1주택에는 없음", () => {
    const { unmount } = render(<ExemptionProvisoSection {...props} provisoReason={R4} mode="temporary_two_house" />);
    expect(screen.getByTestId("proviso-4ho-temp-limits")).toBeTruthy();
    unmount();
    render(<ExemptionProvisoSection {...props} provisoReason={R4} mode="one_house" />);
    expect(screen.queryByTestId("proviso-4ho-temp-limits")).toBeNull();
  });
});

describe("RT-12′ 전달 카드 — ④가 싣는 사유만", () => {
  const card = (f: object) =>
    render(
      <ImportedOneHouseFactsCard
        facts={undefined}
        specials={{ transferDate: "2023-03-20", ...f } as never}
        temporaryTwoHouse={{ previousAcquisitionDate: "2019-02-01", newAcquisitionDate: "2022-03-01" } as never}
        provisoMode="temporary_two_house"
      />,
    );
  it("완비면 4호를 적고 미완이면 적지 않는다", () => {
    const { unmount } = card(TEMP_F);
    expect(screen.getByText(/임대사업자 등록 \(4호/)).toBeTruthy();
    unmount();
    card({ provisoReason: R4 });
    expect(screen.queryByText(/임대사업자 등록 \(4호/)).toBeNull();
  });
});

describe("RT-13 겸용주택", () => {
  const MIXED = {
    isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "60", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
    mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
    mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
    mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
  };
  const mixed = (m: typeof TEMP, f: object) =>
    redevAptForm({
      kind: "housing", price: m.price, count: "2", houses: m.houses,
      assetOver: { ...MIXED, acquisitionDate: m.acq, regionCode: GANGNAM, residencePeriods: [] },
      formOver: { transferDate: m.transfer, filingDate: `${m.transfer.slice(0, 4)}-12-31`, ...f } as never,
    });
  it.each([
    ["일시적 2주택", TEMP, {}, TEMP_F],
    ["혼인 합가", MERGE, MARRIAGE, MERGE_P],
  ])("%s", async (_l, m, ctx, p) => {
    const f = mixed(m, { ...ctx, ...p });
    expect(allIssues(f)).toEqual([]);
    expect((await runCalc(f)).result.housingPart.isExempt).toBe(true);
    expect((await runCalc(mixed(m, ctx))).result.housingPart.isExempt).toBe(false);
  });
});
