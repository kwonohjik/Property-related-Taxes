/**
 * #12 3중 패턴 — 토지만 출자한 원조합원 완공APT는 **종전주택 거주를 세지 않는다**(승계조합원과 같은 축).
 *
 * 엔진 번역 leaf(`translateRedevAptForHousingJudgment`)는 `resolveAptResidenceMonths(isSuccessorMember: true)`로
 * 신축주택 거주만 읽는다. 화면이 종전주택 거주 칸을 계속 받거나(⑤) 그 입력이 Step4 거주 입력을 가리면(⑧) 사용자가 넣은 값이
 * 조용히 무시된다 — 이 파일은 ⑤ 술어 · ④ payload · ⑧ validate · 엔진이 **같은 축**을 보는지를 고정한다.
 *
 * 시료: P1(대전 유성 · 토지 2005-01-01 출자 · 인가 2020-07-01(공고 후 — 전환일도 조정) · 사용승인 2021-02-15 ·
 * 양도 2024-06-01). 사용승인일에 조정대상지역이라 거주 2년이 필요하고, 사용승인일~양도일은 약 39개월이다.
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
import { validateRedevelopmentAsset } from "@/lib/calc/transfer-tax-validate-redev";
import { redevSplitResidenceSupersedesStep4 } from "@/lib/calc/redev-field-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const P1 = (over: Record<string, unknown> = {}) => ({
  acquisitionDate: "2005-01-01",
  regionCode: "3020000000",
  residenceInputMode: "direct",
  residencePeriods: [],
  redevOriginalAssetType: "land",
  redevApprovalDate: "2020-07-01",
  redevCompletionDate: "2021-02-15",
  redevActualAcquisitionPrice: "100000000",
  fixedAcquisitionPrice: "100000000",
  ...over,
});
const form = (assetOver: Record<string, unknown>, step4Months: string) =>
  redevAptForm({
    count: "1",
    price: "1000000000",
    assetOver: P1({ residencePeriodMonthsAsset: step4Months, ...assetOver }),
    formOver: { residencePeriodMonths: step4Months } as never,
  });
const asset = (over: Record<string, unknown> = {}) => form(over, "0").assets[0] as AssetForm;

describe("#12 ⑤ — 종전주택 거주만 입력해도 Step4 거주 입력을 가리지 않는다", () => {
  it("토지 출자: 종전만 있으면 Step4 대체 아님 / 신축이 있으면 대체", () => {
    expect(redevSplitResidenceSupersedesStep4(asset({ redevPriorHouseResidenceMonths: "30" }))).toBe(false);
    expect(redevSplitResidenceSupersedesStep4(asset({ redevNewHouseResidenceMonths: "30" }))).toBe(true);
  });
  it("긍정 짝 — 주택 출자 원조합원은 종전만 있어도 대체(§154⑧1호 통산)", () => {
    expect(
      redevSplitResidenceSupersedesStep4(asset({ redevOriginalAssetType: "housing", redevPriorHouseResidenceMonths: "30" })),
    ).toBe(true);
  });
});

describe("#12 ④ — 종전주택 거주는 토지 출자 축에서 보내지 않는다", () => {
  it("토지 출자: 종전 개월·입주일·퇴거일 미송신, 신축은 송신", () => {
    const p = buildRedevelopmentPayload(
      asset({
        redevPriorHouseResidenceMonths: "30",
        redevPriorResidenceStartDate: "2005-02-01",
        redevPriorResidenceEndDate: "2007-08-01",
        redevNewHouseResidenceMonths: "26",
      }),
    );
    expect(p.priorHouseResidenceMonths).toBeUndefined();
    expect(p.priorResidenceStartDate).toBeUndefined();
    expect(p.priorResidenceEndDate).toBeUndefined();
    expect(p.newHouseResidenceMonths).toBe(26);
  });
  it("긍정 짝 — 주택 출자 원조합원은 종전 거주를 그대로 보낸다", () => {
    const p = buildRedevelopmentPayload(
      asset({ redevOriginalAssetType: "housing", redevPriorHouseResidenceMonths: "30" }),
    );
    expect(p.priorHouseResidenceMonths).toBe(30);
  });
});

describe("#12 ⑧ — 화면에 없는 종전주택 거주 칸의 stale 값으로 막지 않는다", () => {
  it("토지 출자: 종전 거주가 음수여도 차단하지 않는다 (칸이 없다)", () => {
    expect(validateRedevelopmentAsset(asset({ redevPriorHouseResidenceMonths: "-3" }), "자산1", true)).toBeNull();
  });
  it("긍정 짝 — 주택 출자는 여전히 음수 종전 거주를 차단", () => {
    expect(
      validateRedevelopmentAsset(asset({ redevOriginalAssetType: "housing", redevPriorHouseResidenceMonths: "-3" }), "자산1", true),
    ).toContain("종전주택 거주개월수");
  });
});

describe("#12 엔진 — 입력이 판정에 닿는 값만 화면이 받는다 (route)", () => {
  it("🔑 종전주택 거주 30개월만 입력 + Step4 거주 0 → 종전은 세지 않아 과세 (입력이 조용히 무시되던 상태가 아니라, 칸 자체가 없다)", async () => {
    const r = await runCalc(form({ redevPriorHouseResidenceMonths: "30" }, "0"));
    expect(r.status).toBe(200);
    expect((r.body.redevelopment as { priorHouseResidenceMonths?: number }).priorHouseResidenceMonths).toBeUndefined();
    expect(r.result.isExempt).toBe(false);
  });
  it("🔑 같은 사실에서 Step4 거주 30개월(사용승인일 이후)을 채우면 비과세 — Step4 칸이 살아 있어야 닿는다", async () => {
    const r = await runCalc(form({ redevPriorHouseResidenceMonths: "30" }, "30"));
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(true);
  });
  it("긍정 짝 — 신축주택 거주 30개월은 Step4 없이도 비과세", async () => {
    const r = await runCalc(form({ redevNewHouseResidenceMonths: "30" }, "0"));
    expect(r.result.isExempt).toBe(true);
  });
});
