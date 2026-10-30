/**
 * anchor(⑤⑧④⑫⑭·엔진) — 증여받은 종전주택으로 원조합원이 된 완공APT의 「증여자와 계속 같은 세대」 사실
 * (계획서 `docs/00-pm/redev-apt-gift-household-fact.plan.md` · 사용자 결정 Q-1~Q-4 a · 2026-10-26).
 *
 * 종전에는 세대 사실 칸이 `assetKind === "housing"`에만 열려 완공APT는 ④가 사실을 싣지 않았다 — 같은 사실관계에서 일반 주택 0 ↔
 * 완공APT 149,060,000(RG-1 시료). 엔진·⑫·⑭는 사실을 받으면 이미 통산한다(서면인터넷방문상담4팀-2069 · 부동산거래관리과-173·1503).
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
import { allIssues, postTransfer, redevAptForm, runCalc } from "./_helpers/redev-one-house-route";
import { runMulti } from "./_helpers/single-multi-route-parity";
import { redevGiftPriorResidenceBeforeGift } from "@/lib/tax-engine/one-house/redev-apt-judgment-input";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Over = Record<string, unknown>;

/**
 * 원조합원(주택 출자) 완공APT · 배우자 증여 · 강남(조정대상지역) · 10억 · 1세대 1주택 · 2024-12-01 양도.
 * 기본 시료(T2): 증여자 취득·세대 보유 시작 2008-01-01(조정 지정 전) · 증여 2018-01-01(조정 중) · 인가 2019-06-01 · 준공 2023-06-01 · 신축 거주 6개월.
 */
function giftAptForm(assetOver: Over = {}, opts: { price?: string } = {}) {
  return redevAptForm({
    kind: "redevelopment_apt",
    price: opts.price ?? "1000000000",
    assetOver: {
      acquisitionCause: "gift",
      acquisitionDate: "2018-01-01",
      // 증여 신고가액(§163⑨ 평가액) — 원조합원 증여는 필수다(계획서 successor-right-carryover-contribution §15 Q-2). 종전 부동산 실거래가와 같은 값이라 세액은 종전 그대로다.
      fixedAcquisitionPrice: "400000000",
      donorAcquisitionDate: "2008-01-01",
      giftDonorRelation: "spouse",
      giftSameHousehold: "yes",
      giftHouseholdHoldingStartDate: "2008-01-01",
      giftPriorHouseholdResidenceMonths: "0",
      regionCode: "1168010100",
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "6",
      residencePeriods: [],
      redevApprovalDate: "2019-06-01",
      redevCompletionDate: "2023-06-01",
      redevPriorHouseResidenceMonths: "0",
      redevNewHouseResidenceMonths: "6",
      redevOriginalAssetType: "housing",
      redevIsSuccessorMember: "no",
      ...assetOver,
    },
    formOver: { transferDate: "2024-12-01", filingDate: "2025-02-28", residencePeriodMonths: "6" } as never,
  });
}

const FACT_KEYS = ["giftSameHouseholdContinuous", "giftHouseholdHoldingStartDate", "giftPriorHouseholdResidenceMonths"] as const;
const sentFacts = (body: Record<string, unknown>) => FACT_KEYS.filter((k) => k in body);
const NOT_REFLECTED = "세대 관계가 입력되지 않아";
const warnings = (r: { result?: { warnings?: string[] } }) => r.result?.warnings ?? [];

describe("RG — 주택을 출자한 원조합원 완공APT (Q-1 a)", () => {
  it("RG-1 같은 세대 = 예 → ④가 사실을 싣고 「취득 당시」를 세대 보유 시작일로 옮겨 비과세 (종전 149,060,000)", async () => {
    const r = await runCalc(giftAptForm());
    expect(r.issues).toEqual([]);
    expect(sentFacts(r.body)).toEqual([...FACT_KEYS]);
    expect(r.status).toBe(200);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.determinedTax).toBe(0);
  });

  it("RG-2 같은 세대 = 아니오 → 증여일 기준 · 종전 세액 그대로", async () => {
    const r = await runCalc(giftAptForm({ giftSameHousehold: "no", giftHouseholdHoldingStartDate: "", giftPriorHouseholdResidenceMonths: "" }));
    expect(r.issues).toEqual([]);
    expect(r.body.giftSameHouseholdContinuous).toBe(false);
    expect(r.result.determinedTax).toBe(149_060_000);
  });

  it("RG-3 미답 → ⑧이 일반 주택과 같은 필수 질문으로 막는다", () => {
    const issues = allIssues(giftAptForm({ giftSameHousehold: "" }));
    expect(issues.some((i) => i.field === "giftSameHousehold")).toBe(true);
  });

  it("RG-4 거주 축 — 증여 전 동일세대 거주 24개월이 통산된다 (없으면 157,060,000)", async () => {
    const t3 = { acquisitionDate: "2020-01-01", giftHouseholdHoldingStartDate: "2017-09-01", redevApprovalDate: "2020-06-01" };
    const withPrior = await runCalc(giftAptForm({ ...t3, giftPriorHouseholdResidenceMonths: "24" }));
    expect(withPrior.issues).toEqual([]);
    expect(withPrior.body.giftPriorHouseholdResidenceMonths).toBe(24);
    expect(withPrior.result.determinedTax).toBe(0);
    const without = await runCalc(giftAptForm({ ...t3, giftPriorHouseholdResidenceMonths: "0" }));
    expect(without.result.determinedTax).toBe(157_060_000);
  });

  it("RG-5 보유 축(V-R4 시료) — 세대 보유 시작일부터 통산해 보유 2년 미달이 풀린다 (종전 298,500,000)", async () => {
    const r = await runCalc(
      giftAptForm({ acquisitionDate: "2023-01-01", redevApprovalDate: "2023-02-01", redevCompletionDate: "2024-06-01", regionCode: "" }),
    );
    expect(r.issues).toEqual([]);
    expect(r.result.determinedTax).toBe(0);
  });

  it("RG-6 다건 계산은 재개발 자산을 받지 않는다 — 이 사실의 다건 경로는 없다 (V-6)", async () => {
    const m = await runMulti([giftAptForm()]);
    expect(m.status).toBe(400);
    expect(JSON.stringify(m.json)).toContain("단건 계산기에서만 지원됩니다");
  });
});

describe("RG — 칸을 열지 않는 축 (Q-1 a 범위 밖)", () => {
  it("RG-7 토지만 출자한 원조합원 — 저장값이 있어도 싣지 않고, 결론과 무관한 「세대 관계 미입력」 고지도 없다 (Q-4 a)", async () => {
    const r = await runCalc(giftAptForm({ redevOriginalAssetType: "land" }));
    expect(sentFacts(r.body)).toEqual([]);
    expect(r.result.determinedTax).toBe(149_060_000);
    expect(warnings(r).some((w) => w.includes(NOT_REFLECTED))).toBe(false);
  });

  it("RG-8 승계조합원(입주권 상태 증여) — 일반 세대 관계 칸은 싣지 않는다 · 증여자 유형 미답이면 준공일 기산 고지 (redev-successor-gift-holding에서 재개발 카드로 받는다)", async () => {
    const r = await runCalc(
      giftAptForm({
        acquisitionDate: "2020-01-01",
        redevIsSuccessorMember: "yes",
        redevSuccessorGiftSameHousehold: "yes",
        fixedAcquisitionPrice: "500000000",
        redevSettlementDirection: "",
        redevSettlementAmount: "",
      }),
    );
    expect(sentFacts(r.body)).toEqual([]);
    expect(r.result.determinedTax).toBe(298_500_000);
    expect(warnings(r).some((w) => w.includes(NOT_REFLECTED))).toBe(false);
    const notice = warnings(r).find((w) => w.includes("준공일(사용승인일)부터 보유기간을 세어"));
    expect(notice).toContain("그 사실이 입력되지 않아");
    expect(notice).toContain("재개발 카드");
  });
});

describe("RG — 종전주택 입주일 ≥ 증여일 (Q-3 a · ⑧ ↔ ⑫ 같은 leaf)", () => {
  const preGift = { redevPriorResidenceStartDate: "2016-01-01", redevPriorResidenceEndDate: "2019-12-31", redevPriorHouseResidenceMonths: "47" };

  it("RG-9 증여일 전 입주 → ⑧ 「종전주택 입주일」 칸에서 막는다", () => {
    const issues = allIssues(giftAptForm(preGift));
    const hit = issues.find((i) => i.field === "redevPriorResidenceStartDate");
    expect(hit?.message).toContain("종전주택 입주일이 증여일보다 앞섭니다");
  });

  it("RG-10 같은 입력을 API로 직접 보내면 ⑫가 400", async () => {
    const r = await runCalc(giftAptForm());
    const redevelopment = { ...(r.body.redevelopment as Record<string, unknown>), priorResidenceStartDate: "2016-01-01", priorResidenceEndDate: "2019-12-31", priorHouseResidenceMonths: 47 };
    const res = await postTransfer({ ...r.body, redevelopment });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("증여일 이후만 종전주택 거주로 셉니다");
  });

  it("RG-11 증여일 이후 입주 · 인가 뒤 철거 전 퇴거는 막지 않는다", () => {
    const issues = allIssues(
      giftAptForm({ redevPriorResidenceStartDate: "2018-01-01", redevPriorResidenceEndDate: "2020-03-31", redevPriorHouseResidenceMonths: "26" }),
    );
    expect(issues.filter((i) => i.field === "redevPriorResidenceStartDate")).toEqual([]);
  });

  it("RG-12 매매로 취득한 원조합원은 이 규칙 밖이다 (Q-3 a — 증여 축만)", () => {
    const issues = allIssues(giftAptForm({ ...preGift, acquisitionCause: "purchase", acquisitionDate: "2018-01-01", fixedAcquisitionPrice: "" }));
    expect(issues.filter((i) => i.field === "redevPriorResidenceStartDate")).toEqual([]);
  });

  it("RG-13 토지만 출자한 원조합원 — 종전주택 거주를 읽지 않으므로 API로 실어 와도 ⑫가 막지 않는다", async () => {
    const r = await runCalc(giftAptForm({ redevOriginalAssetType: "land" }));
    const redevelopment = { ...(r.body.redevelopment as Record<string, unknown>), priorResidenceStartDate: "2016-01-01", priorResidenceEndDate: "2019-12-31" };
    const res = await postTransfer({ ...r.body, redevelopment });
    expect(res.status).toBe(200);
  });

  it("RG-14 승계조합원(증여 승계) — 종전주택 거주는 증여자 세대의 거주라 증여일 전이어도 ⑧·⑫가 막지 않는다 (사전-2020-법령해석재산-0691)", async () => {
    const f = giftAptForm({
      ...preGift,
      acquisitionDate: "2020-01-01",
      redevIsSuccessorMember: "yes",
      redevSuccessorGiftSameHousehold: "yes",
      fixedAcquisitionPrice: "500000000",
      redevSettlementDirection: "",
      redevSettlementAmount: "",
    });
    expect(allIssues(f).filter((i) => i.field === "redevPriorResidenceStartDate")).toEqual([]);
    const r = await runCalc(f);
    expect((r.body.redevelopment as Record<string, unknown>).priorResidenceStartDate).toBe("2016-01-01");
    expect(r.status).toBe(200);
  });

  it("RG-15 청산금 수령 단독신고 — 신축주택 §154① 판정 결과를 쓰지 않아(자기선언 `exemptionEligibleAtApproval`) 이 규칙 밖이다(⑧·⑫ 공용 leaf)", () => {
    // ⑧은 첫 오류 하나만 돌려줘 단독신고 시료의 다른 필수 칸이 먼저 걸린다 — 공용 leaf를 직접 본다.
    const base = { acquisitionCause: "gift", acquisitionDate: "2018-01-01", subject: "apt", isSuccessorMember: false, originalAssetType: "housing", priorResidenceStartDate: "2016-01-01" };
    expect(redevGiftPriorResidenceBeforeGift(base)).toBe(true);
    expect(redevGiftPriorResidenceBeforeGift({ ...base, receiveOnlyMode: true })).toBe(false);
  });
});
