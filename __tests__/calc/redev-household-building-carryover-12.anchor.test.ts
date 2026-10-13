/**
 * #12 ④⑧⑫⑭ — 세대원 건물 출자 통산 입력 경로.
 *
 * 폼(AssetForm 3필드) → ④ payload(`householdBuilding`) → ⑧ validate → ⑫ Zod → ⑭ Date 변환 → 엔진(비과세 보유·거주 통산).
 * 한 층만 빠져도 통산 선언이 조용히 사라져 비과세가 과세로 계산된다(불리 방향). 판정 자체는 엔진 anchor
 * `land-contributed-household-building-carryover-12`가 고정한다 — 이 파일은 **입력이 도달하는지**를 본다.
 *
 * 시료: 강남(1168010100) · 토지 2005-01-01 · 인가 2017-09-01 · 사용승인 2023-03-15 · 양도 2024-06-01 · 15억 · 신축 거주 12개월.
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
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const BASE = (over: Record<string, unknown> = {}) => ({
  acquisitionDate: "2005-01-01",
  regionCode: "1168010100",
  residenceInputMode: "direct",
  residencePeriods: [],
  redevOriginalAssetType: "land",
  redevApprovalDate: "2017-09-01",
  redevCompletionDate: "2023-03-15",
  redevNewHouseResidenceMonths: "12",
  redevActualAcquisitionPrice: "100000000",
  fixedAcquisitionPrice: "100000000",
  ...over,
});
const CARRY = { redevHouseholdBuildingCarryover: "yes", redevHouseholdBuildingAcquisitionDate: "2010-05-01", redevHouseholdBuildingResidenceMonths: "36" };
const form = (over: Record<string, unknown> = {}) =>
  redevAptForm({ count: "1", price: "1500000000", assetOver: BASE(over), formOver: { residencePeriodMonths: "0" } as never });
const asset = (over: Record<string, unknown> = {}) => form(over).assets[0] as AssetForm;
type Hb = { acquisitionDate: string; residenceMonths?: number } | undefined;
const hb = (a: AssetForm) => (buildRedevelopmentPayload(a) as { householdBuilding?: Hb }).householdBuilding;

describe("#12 ④ — payload", () => {
  it("선언 + 취득일 + 거주 → 객체로 싣는다", () => {
    expect(hb(asset(CARRY))).toEqual({ acquisitionDate: "2010-05-01", residenceMonths: 36 });
  });
  it("거주 개월 비움 → residenceMonths 없음(0이 아니라 미입력)", () => {
    expect(hb(asset({ ...CARRY, redevHouseholdBuildingResidenceMonths: "" }))).toEqual({ acquisitionDate: "2010-05-01", residenceMonths: undefined });
  });
  it("미선언이면 남은 값이 있어도 싣지 않는다", () => {
    expect(hb(asset({ ...CARRY, redevHouseholdBuildingCarryover: "" }))).toBeUndefined();
  });
  it("취득일이 없으면 싣지 않는다(⑧이 먼저 막는다)", () => {
    expect(hb(asset({ ...CARRY, redevHouseholdBuildingAcquisitionDate: "" }))).toBeUndefined();
  });
  it("축 밖(주택 출자 · 승계조합원 · 입주권)이면 stale 선언을 보내지 않는다", () => {
    for (const o of [
      { redevOriginalAssetType: "housing" },
      { redevIsSuccessorMember: "yes" },
      { assetKind: "right_to_move_in", redevSubject: "right" },
    ]) {
      expect(hb(asset({ ...CARRY, ...o }))).toBeUndefined();
    }
  });
});

describe("#12 ⑧ — validate", () => {
  it("선언했는데 건물 취득일이 없으면 차단(칸으로 이동)", () => {
    const { result: err, fieldOf } = collectWithFields(() =>
      validateRedevelopmentAsset(asset({ ...CARRY, redevHouseholdBuildingAcquisitionDate: "" }), "자산1", true),
    );
    expect(err).toContain("세대원이 철거된 기존 건물을 취득한 날");
    expect(fieldOf(err!)).toBe("redevHouseholdBuildingAcquisitionDate");
  });
  it("건물 취득일이 인가일 뒤면 차단", () => {
    const { result: err, fieldOf } = collectWithFields(() =>
      validateRedevelopmentAsset(asset({ ...CARRY, redevHouseholdBuildingAcquisitionDate: "2017-09-02" }), "자산1", true),
    );
    expect(err).toContain("인가일 이전");
    expect(fieldOf(err!)).toBe("redevHouseholdBuildingAcquisitionDate");
  });
  it("거주 개월이 건물 취득일~인가일 개월 수를 넘으면 차단", () => {
    const { result: err, fieldOf } = collectWithFields(() =>
      validateRedevelopmentAsset(asset({ ...CARRY, redevHouseholdBuildingAcquisitionDate: "2017-01-01", redevHouseholdBuildingResidenceMonths: "24" }), "자산1", true),
    );
    expect(err).toContain("개월을 넘습니다");
    expect(fieldOf(err!)).toBe("redevHouseholdBuildingResidenceMonths");
  });
  it("정상 입력은 통과 · 미선언이면 남은 값이 어긋나도 막지 않는다", () => {
    expect(validateRedevelopmentAsset(asset(CARRY), "자산1", true)).toBeNull();
    expect(validateRedevelopmentAsset(asset({ ...CARRY, redevHouseholdBuildingCarryover: "", redevHouseholdBuildingAcquisitionDate: "2020-01-01" }), "자산1", true)).toBeNull();
  });
});

describe("#12 ⑫·⑭·엔진 — route", () => {
  it("🔑 선언이 입력부터 엔진까지 도달해 과세 → 비과세(안분) — body에 householdBuilding이 실리고 고지가 나온다", async () => {
    const without = await runCalc(form());
    expect(without.status).toBe(200);
    expect(without.result.isExempt).toBe(false);
    expect(without.result.isPartialExempt).toBe(false);

    const r = await runCalc(form(CARRY));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect((r.body.redevelopment as { householdBuilding?: Hb }).householdBuilding).toEqual({ acquisitionDate: "2010-05-01", residenceMonths: 36 });
    expect(r.result.isExempt || r.result.isPartialExempt).toBe(true);
    expect((r.result.warnings as string[]).join("\n")).toMatch(/세대원 건물 출자 통산을 적용했습니다/);
  });
  it("⑫ — 건물 취득일이 인가일 뒤인 요청을 직접 보내면 400", async () => {
    const r = await runCalc(form(CARRY));
    const body = JSON.parse(JSON.stringify(r.body)) as { redevelopment: { householdBuilding: { acquisitionDate: string } } };
    body.redevelopment.householdBuilding.acquisitionDate = "2018-01-01";
    const res = await postTransfer(body as unknown as Record<string, unknown>);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("인가일 이전");
  });
  it("⑫ — 거주 개월이 상한을 넘는 요청을 직접 보내면 400", async () => {
    const r = await runCalc(form(CARRY));
    const body = JSON.parse(JSON.stringify(r.body)) as { redevelopment: { householdBuilding: { residenceMonths: number } } };
    body.redevelopment.householdBuilding.residenceMonths = 999;
    const res = await postTransfer(body as unknown as Record<string, unknown>);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("개월을 넘습니다");
  });
});
