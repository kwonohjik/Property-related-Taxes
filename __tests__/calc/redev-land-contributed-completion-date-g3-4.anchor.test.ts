/**
 * G3-4 — 토지만 출자한 원조합원의 완공APT: **준공일(사용승인서 교부일)** 입력 경로 5단 파이프라인.
 *
 * 엔진 anchor(`land-contributed-apt-holding-start-g3-4`)가 판정을 고정한다면, 이 파일은 그 판정에 **입력이
 * 도달하는지**를 본다 — 입력칸(⑤) → payload(④) → ⑧ 필수 → Zod(⑫) → route(⑭) → 엔진.
 * 한 층만 빠져도(예: ④가 안 보내면) 엔진은 종전 동작(토지 취득일 기산)으로 조용히 떨어진다.
 *
 * 술어는 `landContributedOriginalApt`(⑤·⑧)·`redevCompletionDateInScope`(④) 하나다.
 * 거주요건 판정 기준일(사용승인일 vs 인가일)은 사용자 결정 대기라 이 파일이 고정하지 않는다.
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
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { redevCompletionDateInScope, landContributedOriginalApt } from "@/lib/calc/redev-field-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** 토지(2007-02-01 취득) 출자 + 준공 후 1년 4개월 양도(2024-06-01) — 1세대1주택 · 거주 60개월 */
const LAND = (completion: string, over: Record<string, unknown> = {}) => ({
  acquisitionDate: "2007-02-01",
  redevOriginalAssetType: "land",
  redevCompletionDate: completion,
  ...over,
});
const asset = (o: Record<string, unknown> = {}) => redevAptForm({ assetOver: o }).assets[0] as AssetForm;

describe("G3-4 — 범위 술어", () => {
  it("토지 출자 + 원조합원 + 완공APT(동시신고) = 범위 안", () => {
    expect(landContributedOriginalApt(asset(LAND("2023-01-15")))).toBe(true);
    expect(redevCompletionDateInScope(asset(LAND("2023-01-15")))).toBe(true);
  });
  it("승계조합원은 종전대로 범위 안(landContributedOriginalApt는 아님)", () => {
    const a = asset({ redevIsSuccessorMember: "yes", redevOriginalAssetType: "land" });
    expect(redevCompletionDateInScope(a)).toBe(true);
    expect(landContributedOriginalApt(a)).toBe(false);
  });
  it("범위 밖 — 주택 출자 · 입주권 양도 · 청산금 단독신고", () => {
    expect(redevCompletionDateInScope(asset({ redevOriginalAssetType: "housing" }))).toBe(false);
    expect(redevCompletionDateInScope(asset({ redevOriginalAssetType: "land", redevSubject: "right", assetKind: "right_to_move_in" }))).toBe(false);
    expect(
      redevCompletionDateInScope(asset({ redevOriginalAssetType: "land", redevSettlementDirection: "receive", redevReceiveOnlyMode: "yes" })),
    ).toBe(false);
  });
});

describe("G3-4 ④ — payload", () => {
  it("토지 출자 원조합원: 준공일을 보낸다", () => {
    expect(buildRedevelopmentPayload(asset(LAND("2023-01-15"))).completionDate).toBe("2023-01-15");
  });
  it("범위 밖이면 보내지 않는다 — 주택 출자에 남은 stale 준공일은 엔진에 닿지 않는다", () => {
    expect(
      buildRedevelopmentPayload(asset({ redevOriginalAssetType: "housing", redevCompletionDate: "2023-01-15" })).completionDate,
    ).toBeUndefined();
  });
  it("승계조합원은 종전대로 보낸다(회귀 가드)", () => {
    expect(
      buildRedevelopmentPayload(asset({ redevIsSuccessorMember: "yes", redevCompletionDate: "2020-03-01" })).completionDate,
    ).toBe("2020-03-01");
  });
});

describe("G3-4 ⑧ — 필수 입력", () => {
  it("토지 출자 + 준공일 미입력 → 차단(입력칸 redevCompletionDate로 이동)", () => {
    const { result: err, fieldOf } = collectWithFields(() => validateRedevelopmentAsset(asset(LAND("")), "자산1"));
    expect(err).toContain("준공일");
    expect(fieldOf(err!)).toBe("redevCompletionDate");
  });
  it("준공일 < 인가일 → 차단", () => {
    const err = validateRedevelopmentAsset(asset(LAND("2015-01-01")), "자산1"); // 인가 2016-06-01
    expect(err).toContain("인가일 이후");
  });
  it("준공일 입력 → 통과", () => {
    expect(validateRedevelopmentAsset(asset(LAND("2023-01-15")), "자산1")).toBeNull();
  });
  it("대조 — 주택 출자 원조합원은 준공일 없이 통과(필수 아님)", () => {
    expect(validateRedevelopmentAsset(asset({ redevOriginalAssetType: "housing", redevCompletionDate: "" }), "자산1")).toBeNull();
  });
  it("대조 — 청산금 단독신고는 신축주택을 양도하지 않아 준공일을 요구하지 않는다", () => {
    const a = asset(LAND("", { redevSettlementDirection: "receive", redevSettlementAmount: "100000000", redevReceiveOnlyMode: "yes", redevSettlementSaleDate: "2024-06-01" }));
    expect(validateRedevelopmentAsset(a, "자산1") ?? "").not.toContain("준공일");
  });
});

describe("G3-4 ⑫·⑭ — route", () => {
  it("🔑 토지 출자 + 1세대1주택 + 준공 1년 4개월 — 입력부터 엔진까지 도달해 비과세가 아니다(수정 전: 전액 비과세 · 세액 0)", async () => {
    const r = await runCalc(
      redevAptForm({ count: "1", assetOver: LAND("2023-01-15", { redevActualAcquisitionPrice: "100000000", fixedAcquisitionPrice: "100000000" }) }),
    );
    expect(r.issues).toEqual([]); // ⑧ 전 단계 — 준공일을 넣으면 막히지 않는다
    expect(r.status).toBe(200);
    expect((r.body.redevelopment as { completionDate?: string }).completionDate).toBe("2023-01-15");
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBeGreaterThan(0);
  });

  it("긍정 짝 — 준공 2020-01-01(양도까지 4년 이상)은 같은 사실에서 비과세 판정이 유지된다", async () => {
    const r = await runCalc(
      redevAptForm({ count: "1", assetOver: LAND("2020-01-01", { redevActualAcquisitionPrice: "100000000", fixedAcquisitionPrice: "100000000" }) }),
    );
    expect(r.status).toBe(200);
    expect(r.result.exemptReason).toMatch(/1세대1주택/);
  });

  it("⑧ 전 단계 — 준공일을 비우면 collectStepIssues가 그 칸으로 막는다", async () => {
    const r = await runCalc(
      redevAptForm({ count: "1", assetOver: LAND("", { redevActualAcquisitionPrice: "100000000", fixedAcquisitionPrice: "100000000" }) }),
    );
    expect(r.issues.some((i) => i.field === "redevCompletionDate")).toBe(true);
  });

  it("⑫ — 준공일 없이 직접 호출하면 400(필수)", async () => {
    const r = await runCalc(
      redevAptForm({ count: "1", assetOver: LAND("2023-01-15", { redevActualAcquisitionPrice: "100000000", fixedAcquisitionPrice: "100000000" }) }),
    );
    const body = JSON.parse(JSON.stringify(r.body)) as { redevelopment: Record<string, unknown> };
    delete body.redevelopment.completionDate;
    const res = await postTransfer(body as unknown as Record<string, unknown>);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("준공일");
  });
});
