/**
 * 3중 패턴 — 증여 승계의 「증여자와 계속 같은 세대」 선언과 종전주택 거주 통산 (사전-2020-법령해석재산-0691).
 *
 * ⑤ 범위 술어(`successorGiftHouseholdInScope`·`Applies`) · ④ payload · ⑧ validate · 정리 patch · ⑫ Zod · 엔진이 **같은 축**을 보는지 고정한다.
 * 축 = 완공APT + 승계조합원 + 취득원인 증여. 그 밖(매매·상속 승계, 원조합원)에서는 종전주택 거주가 종전 그대로다.
 *
 * 시료: 강남구 · 인가 2017-09-01 · 증여 승계 2019-06-01 · 준공 2020-01-01 · 양도 2023-06-01 · 양도가 10억(12억 이하) ·
 * 신축 거주 0 · 종전주택 거주 240개월. 취득 당시(준공일) 조정대상지역이라 거주 2년이 필요하다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm, postTransfer } from "./_helpers/redev-one-house-route";
import { buildRedevelopmentPayload } from "@/lib/calc/transfer-tax-api-redev";
import { validateRedevelopmentAsset } from "@/lib/calc/transfer-tax-validate-redev";
import {
  clearOutOfScopeRedevPatch,
  redevSplitResidenceSupersedesStep4,
  successorGiftHouseholdApplies,
  successorGiftHouseholdInScope,
} from "@/lib/calc/redev-field-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const S = (over: Record<string, unknown> = {}) => ({
  acquisitionCause: "gift",
  acquisitionDate: "2019-06-01",
  regionCode: "1168010100",
  residenceInputMode: "direct",
  residencePeriods: [],
  redevOriginalAssetType: "housing",
  redevApprovalDate: "2017-09-01",
  redevCompletionDate: "2020-01-01",
  redevIsSuccessorMember: "yes",
  redevSettlementAmount: "0",
  redevActualAcquisitionPrice: "600000000",
  fixedAcquisitionPrice: "600000000",
  redevNewHouseResidenceMonths: "0",
  ...over,
});
const form = (assetOver: Record<string, unknown>) =>
  redevAptForm({
    count: "1",
    price: "1000000000",
    assetOver: S(assetOver),
    formOver: { transferDate: "2023-06-01", filingDate: "2023-08-31", residencePeriodMonths: "0" } as never,
  });
const asset = (over: Record<string, unknown> = {}) => form(over).assets[0] as AssetForm;

describe("⑤ 범위 술어 — 완공APT + 승계 + 증여일 때만", () => {
  it("증여 승계만 범위 안 · 선언 「예」일 때만 적용", () => {
    expect(successorGiftHouseholdInScope(asset())).toBe(true);
    expect(successorGiftHouseholdApplies(asset())).toBe(false);
    expect(successorGiftHouseholdApplies(asset({ redevSuccessorGiftSameHousehold: "yes" }))).toBe(true);
    expect(successorGiftHouseholdApplies(asset({ redevSuccessorGiftSameHousehold: "no" }))).toBe(false);
  });
  it("부정 짝 — 매매·상속 승계, 원조합원은 범위 밖(선언이 남아 있어도 적용 아님)", () => {
    const yes = { redevSuccessorGiftSameHousehold: "yes" };
    expect(successorGiftHouseholdApplies(asset({ ...yes, acquisitionCause: "purchase" }))).toBe(false);
    expect(successorGiftHouseholdApplies(asset({ ...yes, acquisitionCause: "inheritance" }))).toBe(false);
    expect(successorGiftHouseholdApplies(asset({ ...yes, redevIsSuccessorMember: "no" }))).toBe(false);
  });
  it("종전주택 거주는 Step4 거주 입력을 가리지 않는다 — 가리는 것은 신축 거주뿐(승계 축 규칙 그대로)", () => {
    const yes = asset({ redevSuccessorGiftSameHousehold: "yes", redevPriorHouseResidenceMonths: "240", redevNewHouseResidenceMonths: "" });
    expect(redevSplitResidenceSupersedesStep4(yes)).toBe(false);
  });
});

describe("④ payload", () => {
  const yes = { redevSuccessorGiftSameHousehold: "yes", redevPriorHouseResidenceMonths: "240" };
  it("「예」: 선언 true + 종전 거주 개월 송신", () => {
    const p = buildRedevelopmentPayload(asset(yes));
    expect(p.successorGiftSameHousehold).toBe(true);
    expect(p.priorHouseResidenceMonths).toBe(240);
  });
  it("「아니오」: 선언 false · 종전 거주 미송신(통산하지 않는다)", () => {
    const p = buildRedevelopmentPayload(asset({ ...yes, redevSuccessorGiftSameHousehold: "no" }));
    expect(p.successorGiftSameHousehold).toBe(false);
    expect(p.priorHouseResidenceMonths).toBeUndefined();
  });
  it("미답: 선언 미송신 · 종전 거주 미송신(모름 = 혜택 불성립)", () => {
    const p = buildRedevelopmentPayload(asset({ ...yes, redevSuccessorGiftSameHousehold: "" }));
    expect(p.successorGiftSameHousehold).toBeUndefined();
    expect(p.priorHouseResidenceMonths).toBeUndefined();
  });
  it("부정 짝 — 매매 승계에 남은 선언·종전 거주는 보내지 않는다 (stale 가드)", () => {
    const p = buildRedevelopmentPayload(asset({ ...yes, acquisitionCause: "purchase" }));
    expect(p.successorGiftSameHousehold).toBeUndefined();
    expect(p.priorHouseResidenceMonths).toBeUndefined();
  });
  it("긍정 짝 — 원조합원의 종전 거주는 종전대로 보낸다", () => {
    const p = buildRedevelopmentPayload(asset({ redevIsSuccessorMember: "no", redevPriorHouseResidenceMonths: "240" }));
    expect(p.priorHouseResidenceMonths).toBe(240);
    expect(p.successorGiftSameHousehold).toBeUndefined();
  });
});

describe("⑧ validate — 읽히는 값만 검증한다", () => {
  it("선언 「예」 + 음수 종전 거주 → 차단", () => {
    expect(
      validateRedevelopmentAsset(asset({ redevSuccessorGiftSameHousehold: "yes", redevPriorHouseResidenceMonths: "-3" }), "자산1", true),
    ).toContain("종전주택 거주개월수");
  });
  it("부정 짝 — 증여 승계가 아니거나 선언이 「예」가 아니면 화면에 없는 칸의 stale 값으로 막지 않는다", () => {
    expect(validateRedevelopmentAsset(asset({ redevPriorHouseResidenceMonths: "-3" }), "자산1", true)).toBeNull();
    expect(
      validateRedevelopmentAsset(asset({ redevSuccessorGiftSameHousehold: "yes", acquisitionCause: "purchase", redevPriorHouseResidenceMonths: "-3" }), "자산1", true),
    ).toBeNull();
  });
});

describe("정리 patch — 범위를 벗어나면 선언과 통산용 종전 거주를 함께 비운다", () => {
  const base = asset({ redevSuccessorGiftSameHousehold: "yes", redevPriorHouseResidenceMonths: "240", redevPriorResidenceStartDate: "2000-01-01", redevPriorResidenceEndDate: "2012-01-01" });
  it("승계 → 원조합원: 선언 · 종전 거주 개월 · 입주일 · 퇴거일을 비운다(원조합원 입력으로 조용히 이어지지 않게)", () => {
    const patch = clearOutOfScopeRedevPatch({ ...base, redevIsSuccessorMember: "no" } as AssetForm);
    expect(patch.redevSuccessorGiftSameHousehold).toBe("");
    expect(patch.redevPriorHouseResidenceMonths).toBe("");
    expect(patch.redevPriorResidenceStartDate).toBe("");
    expect(patch.redevPriorResidenceEndDate).toBe("");
  });
  it("범위 안에서는 비우지 않는다", () => {
    expect(clearOutOfScopeRedevPatch(base)).not.toHaveProperty("redevSuccessorGiftSameHousehold");
  });
  it("선언이 「아니오」였다면 종전 거주 칸은 건드리지 않는다(통산용 입력이 아니었다)", () => {
    const patch = clearOutOfScopeRedevPatch({ ...base, redevSuccessorGiftSameHousehold: "no", redevIsSuccessorMember: "no" } as AssetForm);
    expect(patch.redevSuccessorGiftSameHousehold).toBe("");
    expect(patch).not.toHaveProperty("redevPriorHouseResidenceMonths");
  });
});

describe("엔진까지 — 폼 → ④ → route(⑫⑭) → 엔진", () => {
  const yes = { redevSuccessorGiftSameHousehold: "yes", redevPriorHouseResidenceMonths: "240" };
  it("🔑 「예」 + 종전 240개월: 거주 2년 요건을 충족해 전액 비과세", async () => {
    const r = await runCalc(form(yes));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect((r.body.redevelopment as { successorGiftSameHousehold?: boolean }).successorGiftSameHousehold).toBe(true);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);
  });
  it("대조 — 「아니오」는 과세, 미답은 과세 + 확인 필요 고지", async () => {
    const no = await runCalc(form({ ...yes, redevSuccessorGiftSameHousehold: "no" }));
    expect(no.result.isExempt).toBe(false);
    const unanswered = await runCalc(form({ ...yes, redevSuccessorGiftSameHousehold: "" }));
    expect(unanswered.result.isExempt).toBe(false);
    expect((unanswered.result.warnings as string[]).some((w) => w.includes("사전-2020-법령해석재산-0691") && w.includes("확인 필요"))).toBe(true);
  });
  it("⑫ — 증여 승계가 아닌 입력에 선언을 실어 오면 400", async () => {
    const f = form({ acquisitionCause: "purchase" });
    const body = (await import("./_helpers/redev-one-house-route")).captureBody;
    const b = (await body(f)) as { redevelopment: Record<string, unknown> };
    b.redevelopment.successorGiftSameHousehold = true;
    const r = await postTransfer(b as unknown as Record<string, unknown>);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("successorGiftSameHousehold");
  });
});
