/**
 * anchor — 같은 물건 지분 분할(축 B) 조합원입주권: 둘째 이후 지분 카드도 첫 카드의 §89①4호 판정 선언을 쓴다.
 *
 * 계획서 `docs/00-pm/second-share-card-redev-judgment-facts-copy.plan.md` v0.2.
 *
 * 판정 선언 6필드는 판정 메뉴만 받고(`app/calc/one-house-exemption/steps/Step3.tsx` — `assets[0]`만), 지분 토글이 만드는
 * 둘째 카드는 `makeDefaultAsset`이라 6필드가 빈 값이다. 종전에는 ④가 그 빈 값을 보내 **둘째 카드만** 비과세가 빠졌다.
 *
 * | 시료 (mock 세율 — 과세 여부·비율만 의미) | 수정 전 합계 | 수정 후 |
 * |---|---|---|
 * | 입주권 50+50 · 10억 · 「충족」 | 62,711,000 | 0 |
 * | 같은 · 20억 | 404,217,000 | 197,703,000 |
 *
 * 🔴 둘째 카드를 `{ ...a0 }`로 만들지 말 것 — 판정 선언까지 복사돼 결함이 가려진다
 *    (`one-right-shared-ownership-high-value-11.anchor.test.ts`가 그렇게 통과하고 있었다). 여기서는 화면처럼
 *    카드별로 입력하는 값만 옮기고, 판정 선언 6필드·저장 자산 종류는 `makeDefaultAsset(2)` 값을 쓴다.
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
import { runCalc, captureBody, redevAptForm } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { soleSplitRightShareDateNotice } from "@/lib/tax-engine/transfer-tax-redevelopment-shared-ownership";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** 판정 메뉴만 받는 §89①4호 사실 — 지분 둘째 카드에는 입력 경로가 없다. */
const JUDGMENT_ONLY = [
  "redevExemptionEligibleAtApproval",
  "redevLandHouseholdOwnedBuilding",
  "redevOtherHouseAcquisitionDate",
  "redevOtherHouseDisposalDelayReason",
  "redevPriorHouseHoldingMonths",
  "redevPriorHouseResidenceMonths",
] as const;

const NOTICE = /지분별 취득일/;

/**
 * 축 B 2지분. 둘째 카드 = 화면이 만드는 카드: 저장 자산 종류·판정 선언은 `makeDefaultAsset(2)` 그대로,
 * 카드마다 입력하는 취득·§166 값은 `companionOver`(기본은 첫 카드와 같은 값).
 */
function axisB(opts: {
  price: string;
  kind?: "right_to_move_in" | "redevelopment_apt";
  primaryOver?: Record<string, unknown>;
  companionOver?: Record<string, unknown>;
}): TransferFormData {
  const { price, kind = "right_to_move_in", primaryOver = {}, companionOver = {} } = opts;
  const rightOver =
    kind === "right_to_move_in"
      ? { assetKind: "right_to_move_in", redevSubject: "right", redevApprovalDate: "2022-03-01" }
      : {};
  const f = redevAptForm({
    price,
    share: ["50", "100"],
    count: "0",
    assetOver: {
      ...rightOver,
      redevExemptionEligibleAtApproval: "yes",
      redevSettlementAmount: "25000000",
      redevPriorHouseHoldingMonths: "60",
      redevPriorHouseResidenceMonths: "36",
      ...primaryOver,
    },
    formOver: kind === "right_to_move_in" ? ({ householdRightCount: "1" } as never) : {},
  });
  const a0 = f.assets[0] as AssetForm;
  a0.ownershipRemainderThirdParty = "";
  const blank = makeDefaultAsset(2);
  const a1 = {
    ...a0,
    assetId: blank.assetId,
    assetLabel: "자산 2",
    assetKind: blank.assetKind,
    ...Object.fromEntries(JUDGMENT_ONLY.map((k) => [k, blank[k]])),
    ownershipNumerator: "50",
    ownershipDenominator: "100",
    ownershipRemainderThirdParty: "",
    ...companionOver,
  } as AssetForm;
  return { ...f, assets: [a0, a1] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const props = (r: any) => r.json.data.aggregated.properties as any[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const aggWarnings = (r: any) => (r.json.data.aggregated.warnings ?? []) as string[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const companionRedev = (body: Record<string, unknown>) => (body.companionAssets as any[])[0].redevelopment;

describe("축 B 입주권 — 둘째 지분 카드가 첫 카드 판정 선언을 쓴다", () => {
  it("전제 — 둘째 카드는 판정 선언이 빈 값이고 저장 자산 종류가 입주권이 아니다(화면이 만드는 상태)", () => {
    const a1 = axisB({ price: "1000000000" }).assets[1];
    for (const k of JUDGMENT_ONLY) expect(a1[k]).toBe("");
    expect(a1.assetKind).not.toBe("right_to_move_in");
  });

  it("SC-1 10억 · 「충족」 — 두 카드 모두 비과세, 합계 0 (수정 전 62,711,000)", async () => {
    const r = await runCalc(axisB({ price: "1000000000" }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    for (const p of props(r)) {
      expect(p.redevelopmentDetail.oneRightExemptionApplied).toBe(true);
      expect(p.determinedTax).toBe(0);
    }
    expect(r.json.data.aggregated.totalTax).toBe(0);
  });

  it("SC-2 20억 · 「충족」 — 두 카드 모두 고가 안분 비율 0.4, 카드별 과세 양도차익 같음 (수정 전 404,217,000)", async () => {
    const r = await runCalc(axisB({ price: "2000000000" }));
    expect(r.issues).toEqual([]);
    const [a, b] = props(r);
    for (const p of [a, b]) {
      expect(p.redevelopmentDetail.oneRightHighValueApplied).toBe(true);
      expect(p.redevelopmentDetail.highValueAllocation.taxableRatio).toBeCloseTo(0.4, 10);
    }
    expect(b.transferGain).toBe(a.transferGain);
    expect(r.json.data.aggregated.totalTax).toBe(197_703_000);
  });

  it("SC-3 첫 카드 「미충족」 — 두 카드 모두 과세(복사는 불리 방향도 옮긴다)", async () => {
    const r = await runCalc(axisB({ price: "1000000000", primaryOver: { redevExemptionEligibleAtApproval: "no" } }));
    for (const p of props(r)) {
      expect(p.redevelopmentDetail.oneRightExemptionApplied).toBeUndefined();
      expect(p.determinedTax).toBeGreaterThan(0);
    }
  });

  it("SC-4 ④ — 둘째 카드 전송값의 판정 선언이 첫 카드 값이다(나목 취득일·사유·거주·보유·세대원 건물)", async () => {
    const body = await captureBody(
      axisB({
        price: "1000000000",
        primaryOver: {
          redevOtherHouseAcquisitionDate: "2023-05-01",
          redevOtherHouseDisposalDelayReason: "auction",
        },
      }),
    );
    const c = companionRedev(body);
    expect(c.exemptionEligibleAtApproval).toBe(true);
    expect(c.otherHouseAcquisitionDate).toBe("2023-05-01");
    expect(c.otherHouseDisposalDelayReason).toBe("auction");
    expect(c.priorHouseResidenceMonths).toBe(36);
    expect(c.priorHouseHoldingMonths).toBe(60);
  });

  it("SC-4b ④ — 토지 출자 입주권의 세대원 건물 소유 선언도 옮긴다", async () => {
    const land = { redevOriginalAssetType: "land", redevLandHouseholdOwnedBuilding: "yes" };
    const body = await captureBody(
      axisB({ price: "1000000000", primaryOver: land, companionOver: { redevOriginalAssetType: "land" } }),
    );
    expect(companionRedev(body).landHouseholdOwnedBuilding).toBe(true);
  });
});

describe("복사하지 않는 경우 (부정 짝)", () => {
  it("SC-5 완공APT — 둘째 카드가 자기 칸에 입력한 종전주택 거주월수를 유지한다(계산기 카드별 입력)", async () => {
    const body = await captureBody(
      axisB({
        price: "1000000000",
        kind: "redevelopment_apt",
        primaryOver: { redevPriorHouseResidenceMonths: "36" },
        companionOver: { redevPriorHouseResidenceMonths: "12" },
      }),
    );
    expect(companionRedev(body).priorHouseResidenceMonths).toBe(12);
  });

  it("SC-6 둘째 지분이 승계조합원 취득분 — 인가일 요건 선언을 옮기지 않는다", async () => {
    const body = await captureBody(
      axisB({ price: "1000000000", companionOver: { isSuccessorRightToMoveIn: true } }),
    );
    const c = companionRedev(body);
    expect(c.subject).toBe("right");
    expect(c.exemptionEligibleAtApproval).toBeUndefined();
  });

  it("SC-6b 첫 지분이 승계조합원 취득분 — 둘째 지분에 옮기지 않는다", async () => {
    const body = await captureBody(
      axisB({
        price: "1000000000",
        primaryOver: { isSuccessorRightToMoveIn: true },
        companionOver: { isSuccessorRightToMoveIn: false },
      }),
    );
    const c = companionRedev(body);
    expect(c.subject).toBe("right");
    expect(c.exemptionEligibleAtApproval).toBeUndefined();
  });

  it("SC-7 함께 양도(서로 다른 물건) — 다른 물건 카드는 자기 값을 쓴다", async () => {
    const f = axisB({ price: "1000000000" });
    // 축 B가 아니다: 둘째 카드가 다른 물건(단독 소유)이다.
    const a1 = { ...f.assets[1], assetKind: "right_to_move_in", ownershipNumerator: "100", ownershipDenominator: "100" } as AssetForm;
    const a0 = { ...f.assets[0], ownershipNumerator: "100", ownershipDenominator: "100" } as AssetForm;
    const body = await captureBody({ ...f, assets: [a0, a1] });
    expect(companionRedev(body).exemptionEligibleAtApproval).toBeUndefined();
  });
});

describe("Q-1 (b) — 지분별 취득일이 다르면 확인 필요 고지", () => {
  it("SC-9 둘째 지분 취득일만 다름 · 10억 — 세액은 SC-1과 같고 둘째 지분 라벨로 고지 1건", async () => {
    const r = await runCalc(axisB({ price: "1000000000", companionOver: { acquisitionDate: "2015-03-01" } }));
    expect(r.issues).toEqual([]);
    expect(r.json.data.aggregated.totalTax).toBe(0);
    const hits = aggWarnings(r).filter((w) => NOTICE.test(w));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("[자산 2]");
    expect(hits[0]).toContain("확인 필요");
  });

  it("SC-10 부정 — 취득일이 같으면 고지 없음", async () => {
    const r = await runCalc(axisB({ price: "1000000000" }));
    expect(aggWarnings(r).some((w) => NOTICE.test(w))).toBe(false);
  });

  it("SC-10b 부정 — 첫 카드 「미충족」이면 취득일이 달라도 고지 없음(선언이 결론에 쓰이지 않음)", async () => {
    const r = await runCalc(
      axisB({
        price: "1000000000",
        primaryOver: { redevExemptionEligibleAtApproval: "no" },
        companionOver: { acquisitionDate: "2015-03-01" },
      }),
    );
    expect(aggWarnings(r).some((w) => NOTICE.test(w))).toBe(false);
  });

  it("SC-10c 부정 — 「충족」 선언이어도 다른 주택 보유로 4호가 불성립하면(선언이 결론에 안 쓰임) 고지 없음", async () => {
    const f = axisB({ price: "1000000000", companionOver: { acquisitionDate: "2015-03-01" } });
    const r = await runCalc({ ...f, householdHousingCount: "1" } as TransferFormData);
    for (const p of props(r)) expect(p.redevelopmentDetail.oneRightExemptionApplied).toBeUndefined();
    expect(aggWarnings(r).some((w) => NOTICE.test(w))).toBe(false);
  });
});

describe("고지 leaf — 축 B가 아니면 없다", () => {
  it("SC-10d `soleSplitAcquisition`이 없으면(함께 양도·단건) 취득일이 달라도 고지 없음", () => {
    const applied = { oneRightExemptionApplied: true };
    const first = { acquisitionDate: new Date("2008-01-01") };
    const share = { acquisitionDate: new Date("2015-03-01") };
    expect(soleSplitRightShareDateNotice({ ...share, soleSplitAcquisition: true }, first, applied)).toMatch(NOTICE);
    expect(soleSplitRightShareDateNotice(share, first, applied)).toBeUndefined();
  });
});
