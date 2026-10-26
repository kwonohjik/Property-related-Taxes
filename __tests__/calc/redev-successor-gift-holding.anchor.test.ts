/**
 * anchor(⑤⑧④⑫⑭·엔진) — 원조합원에게 관리처분계획 인가 뒤 입주권을 증여받은 승계조합원 완공APT의 세대 보유 통산
 * (계획서 `docs/00-pm/redev-successor-gift-holding.plan.md` · 사용자 결정 Q-1~Q-4 a · 2026-10-27).
 *
 * 종전에는 승계조합원이면 증여자와 같은 세대여도 보유기간을 준공일부터 셌다 — 같은 사실에서 화면 298,500,000 ↔ 세대 사실 주입 0
 * (부동산거래관리과-1503 · 서면인터넷방문상담4팀-2069는 통산). 증여자가 입주권을 사서 승계했거나 토지만 출자했으면 통산할 주택 보유가 없다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { allIssues, captureBody, postTransfer, redevAptForm, runCalc } from "./_helpers/redev-one-house-route";
import {
  successorGiftHouseholdStartIssue,
  translateRedevAptForHousingJudgment,
} from "@/lib/tax-engine/one-house/redev-apt-judgment-input";
import { clearOutOfScopeRedevPatch } from "@/lib/calc/redev-field-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Over = Record<string, unknown>;

/**
 * 승계조합원 완공APT · 배우자에게 입주권 증여 · 강남(조정) · 10억 · 1세대 1주택 · 2024-12-01 양도.
 * 증여자 종전주택 취득 2008-01-01 · 인가 2019-06-01 · 증여 2020-01-01 · 준공 2023-06-01 · 신축 거주 6개월.
 * 기본: 같은 세대 = 예 · 증여자 = 주택 출자 원조합원 · 세대 보유 시작 2008-01-01.
 */
function form(assetOver: Over = {}, opts: { price?: string; region?: string } = {}) {
  return redevAptForm({
    kind: "redevelopment_apt",
    price: opts.price ?? "1000000000",
    assetOver: {
      acquisitionCause: "gift",
      acquisitionDate: "2020-01-01",
      donorAcquisitionDate: "2008-01-01",
      giftDonorRelation: "spouse",
      regionCode: opts.region ?? "1168010100",
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "6",
      residencePeriods: [],
      redevApprovalDate: "2019-06-01",
      redevCompletionDate: "2023-06-01",
      redevPriorHouseResidenceMonths: "0",
      redevNewHouseResidenceMonths: "6",
      redevOriginalAssetType: "housing",
      redevIsSuccessorMember: "yes",
      redevSuccessorGiftSameHousehold: "yes",
      redevSuccessorGiftDonorHouseMember: "yes",
      redevSuccessorGiftHouseholdStartDate: "2008-01-01",
      fixedAcquisitionPrice: "500000000",
      redevSettlementDirection: "",
      redevSettlementAmount: "",
      ...assetOver,
    },
    formOver: { transferDate: "2024-12-01", filingDate: "2025-02-28", residencePeriodMonths: "6" } as never,
  });
}

const warnings = (r: { result?: { warnings?: string[] } }) => r.result?.warnings ?? [];
const redevBody = (b: Record<string, unknown>) => b.redevelopment as Record<string, unknown>;
const NOT_REFLECTED = "입력되지 않아";

describe("SG — 증여자가 주택을 출자한 원조합원 · 같은 세대 (Q-1 a)", () => {
  it("SG-1 세대 보유 시작일부터 통산해 비과세 (종전 298,500,000) · 증여 전 거주 개월은 싣지 않는다", async () => {
    const r = await runCalc(form());
    expect(r.issues).toEqual([]);
    expect(r.body.giftSameHouseholdContinuous).toBe(true);
    expect(r.body.giftHouseholdHoldingStartDate).toBe("2008-01-01");
    expect("giftPriorHouseholdResidenceMonths" in r.body).toBe(false);
    expect(redevBody(r.body).successorGiftDonorHouseMember).toBe(true);
    expect(r.status).toBe(200);
    expect(r.result.determinedTax).toBe(0);
    expect(warnings(r).some((w) => w.includes("부동산거래관리과-1503"))).toBe(true);
  });

  it("SG-2 비조정 지역도 같다", async () => {
    const r = await runCalc(form({}, { region: "" }));
    expect(r.issues).toEqual([]);
    expect(r.result.determinedTax).toBe(0);
  });

  it("SG-3 15억 — 고가주택 안분만 남는다 (종전 598,500,000) · 장특은 준공일 기준 그대로 0", async () => {
    const r = await runCalc(form({}, { price: "1500000000" }));
    expect(r.result.determinedTax).toBe(118_500_000);
    expect(r.result.longTermHoldingDeduction).toBe(0);
  });

  it("SG-4 증여 전 거주는 종전주택 거주 칸 하나로 센다 — 18 + 신축 6 = 24 비과세 · 12면 과세 (두 번 세지 않는다)", async () => {
    const hh = { donorAcquisitionDate: "2018-01-01", redevSuccessorGiftHouseholdStartDate: "2018-01-01" };
    const r18 = await runCalc(form({ ...hh, redevPriorHouseResidenceMonths: "18" }));
    expect(r18.issues).toEqual([]);
    expect(r18.result.determinedTax).toBe(0);
    const r12 = await runCalc(form({ ...hh, redevPriorHouseResidenceMonths: "12" }));
    expect(r12.result.determinedTax).toBe(298_500_000);
    // 증여 전 거주 미입력 고지(세대 사실 칸 안내)는 이 축에서 내지 않는다 — 종전주택 거주 칸이 같은 사실을 받는다
    expect(warnings(r12).some((w) => w.includes("증여 전 동일세대로 이 주택에 거주한 기간(개월)이 입력되지 않아"))).toBe(false);
  });
});

describe("SG — 통산하지 않는 답 (현행 유지 · 고지 없음 D-6)", () => {
  it("SG-5 증여자 = 입주권 승계·토지 출자(아니오) → 준공일 기산 298,500,000 · 세대 사실 미전송 · 고지 없음", async () => {
    const r = await runCalc(form({ redevSuccessorGiftDonorHouseMember: "no", redevSuccessorGiftHouseholdStartDate: "" }));
    expect(r.issues).toEqual([]);
    expect("giftSameHouseholdContinuous" in r.body).toBe(false);
    expect(redevBody(r.body).successorGiftDonorHouseMember).toBe(false);
    expect(r.result.determinedTax).toBe(298_500_000);
    expect(warnings(r).some((w) => w.includes(NOT_REFLECTED) && w.includes("보유기간"))).toBe(false);
  });

  it("SG-6 같은 세대 = 아니오 → 298,500,000 · 증여자 유형 미전송 · 고지 없음", async () => {
    const r = await runCalc(form({ redevSuccessorGiftSameHousehold: "no", redevSuccessorGiftDonorHouseMember: "", redevSuccessorGiftHouseholdStartDate: "" }));
    expect(r.issues).toEqual([]);
    expect(redevBody(r.body).successorGiftDonorHouseMember).toBeUndefined();
    expect(r.result.determinedTax).toBe(298_500_000);
    expect(warnings(r).some((w) => w.includes(NOT_REFLECTED) && w.includes("보유기간"))).toBe(false);
  });

  it("SG-7 사실 없이 부른 API — 준공일 기산으로 판정했다고 적고 입력 위치를 안내한다", async () => {
    const body = await captureBody(form({ redevSuccessorGiftDonorHouseMember: "" }));
    const r = await postTransfer(body);
    const notice = warnings(r).find((w) => w.includes("그 사실이 입력되지 않아"));
    expect(notice).toContain("준공일(사용승인일)부터 보유기간을 세어");
    expect(notice).toContain("재개발 카드");
  });
});

describe("SG — ⑧ 세대 보유 시작일 (D-3 · ⑫와 같은 leaf)", () => {
  const issueFields = (over: Over) => allIssues(form(over)).map((i) => i.field);

  it("SG-8 증여자 유형 미답 → ⑧ 필수", () => {
    expect(issueFields({ redevSuccessorGiftDonorHouseMember: "" })).toContain("redevSuccessorGiftDonorHouseMember");
  });
  it("SG-9 시작일 비움 → 필수", () => {
    expect(issueFields({ redevSuccessorGiftHouseholdStartDate: "" })).toContain("redevSuccessorGiftHouseholdStartDate");
  });
  it("SG-10 시작일 > 인가일 → 차단 (인가 뒤에는 종전주택이 없다)", () => {
    const issues = allIssues(form({ donorAcquisitionDate: "2019-07-01", redevSuccessorGiftHouseholdStartDate: "2019-07-01" }));
    const hit = issues.find((i) => i.field === "redevSuccessorGiftHouseholdStartDate");
    expect(hit?.message).toContain("관리처분계획 인가일 이전");
  });
  it("SG-11 시작일 < 증여자 취득일 → 차단", () => {
    expect(issueFields({ redevSuccessorGiftHouseholdStartDate: "2007-01-01" })).toContain("redevSuccessorGiftHouseholdStartDate");
  });
  it("SG-12 증여자 취득일 비움 → 차단", () => {
    expect(issueFields({ donorAcquisitionDate: "" })).toContain("donorAcquisitionDate");
  });
  it("SG-13 leaf 격자", () => {
    const base = { householdStartDate: "2010-01-01", donorAcquisitionDate: "2008-01-01", approvalDate: "2019-06-01", giftDate: "2020-01-01" };
    expect(successorGiftHouseholdStartIssue(base)).toBeNull();
    expect(successorGiftHouseholdStartIssue({ ...base, householdStartDate: "2019-06-01" })).toBeNull();
    expect(successorGiftHouseholdStartIssue({ ...base, householdStartDate: "2019-06-02" })).toBe("after_approval");
    expect(successorGiftHouseholdStartIssue({ ...base, householdStartDate: "2007-12-31" })).toBe("before_donor_acquisition");
    expect(successorGiftHouseholdStartIssue({ ...base, householdStartDate: "" })).toBe("missing_start");
    expect(successorGiftHouseholdStartIssue({ ...base, donorAcquisitionDate: "" })).toBe("missing_donor_acquisition");
    expect(successorGiftHouseholdStartIssue({ ...base, householdStartDate: "2020-01-01", approvalDate: "2021-01-01" })).toBe("not_before_gift");
  });
});

describe("SG — ⑫ API 직접 호출 (Q-2 a · Q-3 a)", () => {
  it("SG-14 증여자 유형 없이 세대 통산 사실 → 400 (증여자가 입주권만 보유했으면 틀린 통산 — 계획서 §2.1 S3n)", async () => {
    const body = await captureBody(form({ redevSuccessorGiftDonorHouseMember: "no", redevSuccessorGiftHouseholdStartDate: "" }));
    const r = await postTransfer({ ...body, giftSameHouseholdContinuous: true, giftHouseholdHoldingStartDate: "2008-01-01" });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("successorGiftDonorHouseMember");
  });

  it("SG-15 시작일 > 인가일 → 400", async () => {
    const body = await captureBody(form());
    const r = await postTransfer({ ...body, donorAcquisitionDate: "2019-07-01", giftHouseholdHoldingStartDate: "2019-07-01" });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("관리처분계획 인가일 이전");
  });

  it("SG-16 승계조합원에 세대 사실 쪽 증여 전 거주 개월 → 400 (두 번 센다 — 계획서 §2.2 S2d)", async () => {
    const body = await captureBody(form());
    const r = await postTransfer({ ...body, giftPriorHouseholdResidenceMonths: 12 });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("priorHouseResidenceMonths");
  });

  it("SG-17 증여자 유형 선언은 같은 세대 증여 승계에서만", async () => {
    const body = await captureBody(form({ redevSuccessorGiftSameHousehold: "no", redevSuccessorGiftDonorHouseMember: "", redevSuccessorGiftHouseholdStartDate: "" }));
    const rd = { ...redevBody(body), successorGiftDonorHouseMember: true };
    const r = await postTransfer({ ...body, redevelopment: rd });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("successorGiftDonorHouseMember");
  });
});

describe("SG — 엔진 번역 (⑫를 거치지 않는 입력 대비)", () => {
  const basis = {
    giftDate: new Date("2020-01-01"),
    donorAcquisitionDate: new Date("2008-01-01"),
    continuousSameHousehold: true,
    householdHoldingStartDate: new Date("2008-01-01"),
    priorHouseholdResidenceMonths: 12,
  };
  const input = (redevOver: Record<string, unknown>) =>
    ({
      propertyType: "redevelopment_apt",
      acquisitionCause: "gift",
      acquisitionDate: new Date("2020-01-01"),
      giftHouseholdBasis: basis,
      redevelopment: {
        subject: "apt",
        isSuccessorMember: true,
        approvalDate: new Date("2019-06-01"),
        completionDate: new Date("2023-06-01"),
        successorGiftSameHousehold: true,
        ...redevOver,
      },
    }) as unknown as TransferTaxInput;

  it("SG-18 증여자 유형 true → 세대 사실 유지(증여 전 거주 개월은 지움) · 아니면 버림", () => {
    const yes = translateRedevAptForHousingJudgment(input({ successorGiftDonorHouseMember: true }));
    expect(yes.giftHouseholdBasis?.householdHoldingStartDate).toEqual(new Date("2008-01-01"));
    expect(yes.giftHouseholdBasis?.priorHouseholdResidenceMonths).toBeUndefined();
    expect(yes.redevSuccessorGift).toEqual({ declinedConsolidation: false });
    const no = translateRedevAptForHousingJudgment(input({ successorGiftDonorHouseMember: false }));
    expect(no.giftHouseholdBasis).toBeUndefined();
    expect(no.redevSuccessorGift).toEqual({ declinedConsolidation: true });
    const unset = translateRedevAptForHousingJudgment(input({}));
    expect(unset.giftHouseholdBasis).toBeUndefined();
    expect(unset.redevSuccessorGift).toEqual({ declinedConsolidation: false });
    const notSame = translateRedevAptForHousingJudgment(input({ successorGiftDonorHouseMember: true, successorGiftSameHousehold: false }));
    expect(notSame.giftHouseholdBasis).toBeUndefined();
    expect(notSame.redevSuccessorGift).toEqual({ declinedConsolidation: true });
  });

  it("SG-19 원조합원(#2595 축)은 번역이 세대 사실을 건드리지 않는다", () => {
    const orig = translateRedevAptForHousingJudgment(input({ isSuccessorMember: false, successorGiftSameHousehold: undefined }));
    expect(orig.giftHouseholdBasis).toBe(basis);
    expect(orig.redevSuccessorGift).toBeUndefined();
  });
});

describe("SG — 범위 밖 정리 patch", () => {
  const asset = (over: Over) =>
    ({
      assetKind: "redevelopment_apt",
      redevSubject: "apt",
      redevIsSuccessorMember: "yes",
      acquisitionCause: "gift",
      redevSuccessorGiftSameHousehold: "yes",
      redevSuccessorGiftDonorHouseMember: "yes",
      redevSuccessorGiftHouseholdStartDate: "2008-01-01",
      ...over,
    }) as unknown as AssetForm;

  it("SG-20 원조합원으로 바꾸면 증여자 유형·시작일을 비운다 · 증여자 유형 「아니오」면 시작일만", () => {
    const toOriginal = clearOutOfScopeRedevPatch(asset({ redevIsSuccessorMember: "no" }));
    expect(toOriginal.redevSuccessorGiftDonorHouseMember).toBe("");
    expect(toOriginal.redevSuccessorGiftHouseholdStartDate).toBe("");
    const donorNo = clearOutOfScopeRedevPatch(asset({ redevSuccessorGiftDonorHouseMember: "no" }));
    expect(donorNo.redevSuccessorGiftDonorHouseMember).toBeUndefined();
    expect(donorNo.redevSuccessorGiftHouseholdStartDate).toBe("");
    expect(clearOutOfScopeRedevPatch(asset({}))).toEqual({});
  });
});
