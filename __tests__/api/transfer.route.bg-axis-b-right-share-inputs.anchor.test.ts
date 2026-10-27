/**
 * anchor: 입주권 부담부증여 × 축 B(같은 물건 지분 분할) — 원조합원 지분 취득가액 칸 · 평가 3항 병합.
 * 계획서 `docs/02-design/features/bg-axis-b-right-share-inputs.plan.md`(사용자 결정 1·2 · Q-1 a · Q-2 a).
 *
 * 수정 전:
 *  - 평가 3항(조합원권리가액·납입금·프리미엄)이 지분 카드에 병합되지 않았다. 원 + 원은 둘째 지분이 자기 재개발 권리가액만으로 평가돼
 *    94,952,732(대조 129,470,000)였고, 승계 지분은 ⑧ `bgRightMemberRightsValue`(칸 없음)·400이었다.
 *  - 첫 카드 승계 + 둘째 원조합원이면 둘째의 「종전 부동산 실지취득가액」을 넣을 칸이 없었다(#2635 회귀 — 렌더 anchor가 본다).
 * 대조: 축 B 합계세액은 `aggregated.totalTax`(지방소득세 포함)라 단건 결정세액 × 1.1이다.
 * 청산금은 지분 해당분을 넣는다(`redev-fractional-ownership.anchor.test.ts` 규약) — 물건 전체를 두 지분에 넣으면 두 번 센다.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { successorRightTogglePatch } from "@/lib/calc/transfer-successor-right";
import { mergePrimaryBasic } from "@/lib/calc/transfer-tax-api-helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type A = Record<string, unknown>;
const BASE = {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };
const RV: A = { bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000" };
/** 첫 카드 — 물건 단위 부담부증여 입력(② 양도정보) 포함. */
const first = (over: A) =>
  ({
    ...makeDefaultAsset(1), assetId: "p", addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right",
    acquisitionCause: "purchase", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000",
    bgDonorRelation: "lineal_descendant", ...RV, redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
    standardPriceAtAcq: "", standardPriceAtTransfer: "", ...over,
  }) as AssetForm;
/** 둘째 지분 카드 — 화면에 있는 칸만(③ 취득정보). */
const share = (over: A) =>
  ({ ...makeDefaultAsset(2), assetId: "s", ...HALF, acquisitionCause: "purchase", redevApprovalDate: "2018-06-01", ...over }) as AssetForm;
const SUCC: A = { ...successorRightTogglePatch(true), acquisitionDate: "2020-01-01", successorRightAcqPrice: "300,000,000", successorRightAddedContribution: "100,000,000" };
/** 원조합원 — 권리가액 9억(물건 전체) · 청산금 납부 1억(지분 해당분). */
const ORIG: A = {
  isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01", redevOriginalAssetType: "housing", redevRightsValue: "900,000,000",
  redevSettlementDirection: "pay", redevSettlementAmount: "100,000,000", redevPreApprovalExpenses: "0", redevApprovalLawBasis: "urban_renovation_art_74",
};
const one = (a: AssetForm, over: A = {}) => Object.assign(createDefaultTransferFormData(), BASE, { assets: [a] }, over) as TransferFormData;
const frac = (p: AssetForm, s: AssetForm) =>
  Object.assign(createDefaultTransferFormData(), BASE, { assetSplitMode: "fractional", contractTotalPrice: "1500000000", assets: [p, s] }) as TransferFormData;

async function run(f: TransferFormData) {
  const r = await runCalc(f);
  const res = r.result as { determinedTax?: number } | undefined;
  const agg = (r.json as { data?: { aggregated?: { totalTax?: number } } } | undefined)?.data?.aggregated?.totalTax;
  return { fields: r.issues.map((i) => i.field), messages: r.issues.map((i) => i.message), status: r.status, tax: res?.determinedTax ?? agg };
}

describe("평가 3항 병합 — 화면 상태가 대조와 같다", () => {
  it("원 + 원 — 수정 전 94,952,732 → 단건 117,700,000 × 1.1 = 129,470,000", async () => {
    expect((await run(one(first({ ...ORIG, redevSettlementAmount: "200,000,000", bgActualAcquisitionTotal: "300,000,000" })))).tax).toBe(117_700_000);
    expect(await run(frac(first({ ...ORIG, ...HALF, bgActualAcquisitionTotal: "300,000,000" }), share(ORIG)))).toMatchObject({
      fields: [], status: 200, tax: 129_470_000,
    });
  });
  it("승계 + 승계 — 수정 전 ⑧·400 → 단건 149,060,000 × 1.1 = 163,966,000", async () => {
    expect((await run(one(first(SUCC))))).toMatchObject({ fields: [], tax: 149_060_000 });
    expect(await run(frac(first({ ...SUCC, ...HALF }), share(SUCC)))).toMatchObject({ fields: [], status: 200, tax: 163_966_000 });
  });
  it("첫 원조합원(카드 3억) + 둘째 승계 — 수정 전 ⑧·400 → 146,718,000", async () => {
    expect(await run(frac(first({ ...ORIG, ...HALF, bgActualAcquisitionTotal: "300,000,000" }), share(SUCC)))).toMatchObject({
      fields: [], status: 200, tax: 146_718_000,
    });
  });
  it("첫 승계 + 둘째 원조합원(첫 카드 칸 3억) — 위 행을 뒤집은 시료와 같다", async () => {
    expect(await run(frac(first({ ...SUCC, ...HALF, bgActualAcquisitionTotal: "300,000,000" }), share(ORIG)))).toMatchObject({
      fields: [], status: 200, tax: 146_718_000,
    });
  });
});

describe("Q-1 (a) — 권리가액은 첫 카드에 보이는 값", () => {
  it("첫 카드 명시 비움 → 첫 카드 재개발 권리가액 파생(9억)을 둘째에 싣는다 — 둘째 자기 권리가액 8억을 쓰지 않는다", () => {
    const p = first({ ...ORIG, ...HALF, bgRightMemberRightsValue: "" });
    const merged = mergePrimaryBasic(share({ ...ORIG, redevRightsValue: "800,000,000" }), p);
    expect(merged.bgRightMemberRightsValue).toBe("900000000");
    expect(merged.bgRightPaidInstallments).toBe("200,000,000");
    expect(merged.bgRightPremium).toBe("100,000,000");
  });
  it("세액 — 수정 전 74,624,000 → 105,006,000", async () => {
    const f = frac(first({ ...ORIG, ...HALF, bgRightMemberRightsValue: "", bgActualAcquisitionTotal: "300,000,000" }), share({ ...ORIG, redevRightsValue: "800,000,000" }));
    expect(await run(f)).toMatchObject({ fields: [], status: 200, tax: 105_006_000 });
  });
});

describe("Q-2 (a) — 둘째 원조합원 지분 ⑧은 첫 카드 칸을 가리킨다", () => {
  it.each([["기준시가", {}], ["시가", { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,500,000,000", bgAcquisitionMethod: "actual" }]])(
    "%s 평가 · 첫 승계 + 둘째 원조합원 · 칸 비움",
    async (_n, over) => {
      const r = await run(frac(first({ ...SUCC, ...HALF, ...over, bgActualAcquisitionTotal: "" }), share(ORIG)));
      expect(r.fields).toEqual(["bgActualAcquisitionTotal"]);
      expect(r.messages[0]).toContain("첫 번째 지분 카드 「② 양도정보」");
      expect(r.messages[0]).toContain("원조합원 지분의 종전 부동산 실지취득가액");
    },
  );
  it("단건 원조합원은 종전 문구 그대로", async () => {
    const r = await run(one(first({ ...ORIG, bgActualAcquisitionTotal: "" })));
    expect(r.messages.join()).toContain("종전 부동산의 실지취득가액을 입력하세요");
    expect(r.messages.join()).not.toContain("첫 번째 지분 카드");
  });
});
