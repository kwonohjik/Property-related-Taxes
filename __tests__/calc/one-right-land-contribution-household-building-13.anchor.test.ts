/**
 * #13 anchor — 토지만 출자한 조합원입주권의 §89①4호 비과세: 기본 불성립 + 「세대원 건물 소유」 선언 「예」일 때만 성립.
 *
 * 사용자 결정 B(2026-10-11, 하위 결정 나·나): 법문 주체가 「기존주택을 소유하는 세대」라(재산세과-1748) 토지 출자 입주권은 일괄
 * 불성립(A)도 현행 유지(C)도 아니다. 인가일·양도일 두 시점 모두 같은 세대가 철거 대상 건물을 소유한다는 선언이 「예」일 때만 기존
 * 인가일 요건 선언대로 판정한다. 미답이 결론을 가를 때만 확인 필요.
 *
 * ## 수정 전 실측 (회귀 판별용)
 * 토지 출자 · 10억 · 인가일 요건 선언 「예」 → 전액 비과세(세액 0) / 20억 → 12억 초과 안분. 엔진 주석·Step4 고지·#1243은
 * 「토지 출자 = 대상 아님」인데 비과세 경로만 이를 따르지 않았다(표2 축만 막음).
 *
 * ⚠️ 수치는 mock 세율표 실측값이다. 장기보유특별공제 표2는 이 결정 범위 밖(입주권 표2 기준 결정과 함께) — 토지 출자는 계속 표1.
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
import { runCalc, redevAptForm } from "./_helpers/redev-one-house-route";
import { buildRedevelopmentPayload } from "@/lib/calc/transfer-tax-api-redev";
import { landHouseholdBuildingInScope } from "@/lib/calc/redev-field-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const NOTICE_UNDECLARED = /같은 세대가 철거 대상 건물\(기존주택\)을 소유한 경우에만 §89①4호 비과세가 성립/;
const NOTICE_DECLARED_NO = /같은 세대가 철거 대상 건물\(기존주택\)을 소유하지 않는다고 선언해/;
const NOTICE_166 = /토지 출자 산식\(「소득세법 시행령」 §166\)은 같은 세대가 가진 건물분을 반영하지 못할 수 있습니다/;

function landRightForm(price: string, over: Record<string, unknown> = {}) {
  return redevAptForm({
    price,
    count: "0",
    assetOver: {
      assetKind: "right_to_move_in",
      redevSubject: "right",
      redevApprovalDate: "2022-03-01",
      redevOriginalAssetType: "land",
      redevExemptionEligibleAtApproval: "yes",
      redevSettlementAmount: "50000000",
      ...over,
    },
    formOver: { householdRightCount: "1" } as never,
  });
}

describe("#13 — 토지 출자 입주권 §89①4호: 선언별 판정", () => {
  it("선언 없음(미답) · 10억 — 불성립 → 과세 (수정 전: 전액 비과세 · 세액 0) + 확인 필요 고지", async () => {
    const r = await runCalc(landRightForm("1000000000"));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    const d = r.result.redevelopmentDetail;
    expect(d.oneRightExemptionApplied).toBeUndefined();
    expect(d.oneRightHighValueApplied).toBeUndefined();
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBeGreaterThan(0);
    const w = r.result.warnings.join("\n");
    expect(w).toMatch(NOTICE_UNDECLARED);
    expect(w).toContain("확인 필요");
    expect(w).toContain("재산세과-1748");
  });

  it("「아니오」 선언 · 10억 — 불성립 → 과세, 선언대로 계산했다는 고지(확인 필요 아님)", async () => {
    const r = await runCalc(landRightForm("1000000000", { redevLandHouseholdOwnedBuilding: "no" }));
    expect(r.result.redevelopmentDetail.oneRightExemptionApplied).toBeUndefined();
    expect(r.result.totalTax).toBeGreaterThan(0);
    const w = r.result.warnings.join("\n");
    expect(w).toMatch(NOTICE_DECLARED_NO);
    expect(w).not.toMatch(NOTICE_UNDECLARED);
  });

  it("「예」 선언 · 10억 — 기존 인가일 요건 선언대로 전액 비과세 (세액 0 · 고지 없음)", async () => {
    const r = await runCalc(landRightForm("1000000000", { redevLandHouseholdOwnedBuilding: "yes" }));
    expect(r.result.redevelopmentDetail.oneRightExemptionApplied).toBe(true);
    expect(r.result.totalTax).toBe(0);
    const w = r.result.warnings.join("\n");
    expect(w).not.toMatch(NOTICE_UNDECLARED);
    expect(w).not.toMatch(NOTICE_DECLARED_NO);
    expect(w).not.toMatch(NOTICE_166);
  });

  it("「예」 선언 · 20억 — 12억 초과 안분(비율 0.4) + 토지 출자 산식 한계 확인 필요 고지 (소령 §166)", async () => {
    const r = await runCalc(landRightForm("2000000000", { redevLandHouseholdOwnedBuilding: "yes" }));
    const d = r.result.redevelopmentDetail;
    expect(d.oneRightHighValueApplied).toBe(true);
    expect(d.highValueAllocation.taxableRatio).toBeCloseTo(0.4, 10);
    const w = r.result.warnings.join("\n");
    expect(w).toMatch(NOTICE_166);
    expect(w).toContain("확인 필요");
  });

  it("선언 없음 · 20억 — 안분도 없다(수정 전: 12억 초과 안분 과세대상 620,000,000 부분 과세) → 전액 과세", async () => {
    const none = await runCalc(landRightForm("2000000000"));
    const yes = await runCalc(landRightForm("2000000000", { redevLandHouseholdOwnedBuilding: "yes" }));
    expect(none.result.redevelopmentDetail.oneRightHighValueApplied).toBeUndefined();
    expect(none.result.redevelopmentDetail.highValueAllocation).toBeUndefined();
    expect(none.result.transferGain).toBeGreaterThan(yes.result.transferGain);
  });

  it("긍정 짝 — 주택 출자는 선언과 무관하게 종전대로 성립 (10억 비과세 · stale 「아니오」도 영향 없음)", async () => {
    const plain = await runCalc(landRightForm("1000000000", { redevOriginalAssetType: "housing" }));
    expect(plain.result.redevelopmentDetail.oneRightExemptionApplied).toBe(true);
    expect(plain.result.totalTax).toBe(0);
    expect(plain.result.warnings.join("\n")).not.toMatch(NOTICE_UNDECLARED);
    const stale = await runCalc(
      landRightForm("1000000000", { redevOriginalAssetType: "housing", redevLandHouseholdOwnedBuilding: "no" }),
    );
    expect(stale.result.redevelopmentDetail.oneRightExemptionApplied).toBe(true);
    expect(stale.result.totalTax).toBe(0);
  });

  it("고지 부정 짝 — 인가일 요건 선언이 없으면(어차피 4호 불성립) 토지 출자 고지도 없다", async () => {
    const r = await runCalc(landRightForm("1000000000", { redevExemptionEligibleAtApproval: "" }));
    expect(r.result.redevelopmentDetail.oneRightExemptionApplied).toBeUndefined();
    expect(r.result.warnings.join("\n")).not.toMatch(NOTICE_UNDECLARED);
  });

  it("1세대 토글 OFF면 「예」 선언이어도 성립하지 않는다 (1세대 성립은 사용자 선언 · 본문 요건 그대로)", async () => {
    const r = await runCalc(
      landRightForm("1000000000", { redevLandHouseholdOwnedBuilding: "yes" }),
    );
    expect(r.result.redevelopmentDetail.oneRightExemptionApplied).toBe(true);
    const off = landRightForm("1000000000", { redevLandHouseholdOwnedBuilding: "yes" });
    (off as { isOneHousehold: boolean }).isOneHousehold = false;
    const r2 = await runCalc(off);
    expect(r2.result.redevelopmentDetail.oneRightExemptionApplied).toBeUndefined();
    expect(r2.result.totalTax).toBeGreaterThan(0);
  });
});

describe("#13 ④⑫⑭ — 선언 운반", () => {
  const mk = (over: Record<string, unknown>) =>
    landRightForm("1000000000", over).assets[0] as AssetForm;

  it("④: 토지 출자 입주권 — 예/아니오/미답을 true/false/undefined로 싣는다", () => {
    expect(buildRedevelopmentPayload(mk({ redevLandHouseholdOwnedBuilding: "yes" })).landHouseholdOwnedBuilding).toBe(true);
    expect(buildRedevelopmentPayload(mk({ redevLandHouseholdOwnedBuilding: "no" })).landHouseholdOwnedBuilding).toBe(false);
    expect(buildRedevelopmentPayload(mk({})).landHouseholdOwnedBuilding).toBeUndefined();
  });
  it("④: 축 밖(주택 출자 · 완공APT)이면 stale 선언을 보내지 않는다", () => {
    const housing = mk({ redevOriginalAssetType: "housing", redevLandHouseholdOwnedBuilding: "yes" });
    expect(buildRedevelopmentPayload(housing).landHouseholdOwnedBuilding).toBeUndefined();
    const apt = mk({ assetKind: "redevelopment_apt", redevSubject: "apt", redevLandHouseholdOwnedBuilding: "yes" });
    expect(buildRedevelopmentPayload(apt).landHouseholdOwnedBuilding).toBeUndefined();
  });
  it("술어 — 입주권 × 토지 출자만 범위 안", () => {
    expect(landHouseholdBuildingInScope(mk({}))).toBe(true);
    expect(landHouseholdBuildingInScope(mk({ redevOriginalAssetType: "housing" }))).toBe(false);
    expect(landHouseholdBuildingInScope(mk({ redevSubject: "apt", assetKind: "redevelopment_apt" }))).toBe(false);
  });
  it("⑫: Zod가 선언을 제거하지 않는다 — body에 실리고 엔진 결과가 비과세로 바뀐다", async () => {
    const r = await runCalc(landRightForm("1000000000", { redevLandHouseholdOwnedBuilding: "yes" }));
    expect((r.body.redevelopment as Record<string, unknown>).landHouseholdOwnedBuilding).toBe(true);
    expect(r.result.redevelopmentDetail.oneRightExemptionApplied).toBe(true);
  });
  it("판정 메뉴 마이그레이션 — 구 저장분은 미답(\"\")", async () => {
    const { migrateAsset } = await import("@/lib/stores/calc-wizard-asset-migrate");
    const { makeDefaultAsset } = await import("@/lib/stores/calc-wizard-asset-factory");
    const raw = { ...makeDefaultAsset(1) } as Record<string, unknown>;
    delete raw.redevLandHouseholdOwnedBuilding;
    const out = migrateAsset(raw as never) as unknown as AssetForm;
    expect(out.redevLandHouseholdOwnedBuilding).toBe("");
  });
});
