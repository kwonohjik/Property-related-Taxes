/**
 * anchor — 부담부증여 **축 B(같은 물건 지분 분할 취득) × 시가 모드 × 담보 승(상증법 §66)** (S-1).
 * 계획서 `docs/00-pm/bg-nonsupp-winner-support.plan.md` §4.1 · 사용자 결정 Q-1(착수 순서 S-1 → S-2 → I-0 → I-1 → 질의 병행 → I-2·M-1).
 *
 * 종전: 축 B 카드는 채무·시가를 물건 전체로 입력하는데 ⑧이 축 B에서는 `bgWholeGiftValuation`을 건너뛰어 증여가액 C가 시가로 남았고,
 * 시가 모드 담보 승(시가 10억 · 채무 12억)이면 «채무액(12억)이 증여가액(10억)을 초과»라는 **틀린 사유**로 두 카드를 막았다. ⑫는 200이고 양도차익이
 * 손계산과 일치했다(685,000,000 = 12억 − 취득시 기준시가 5억 − 개산공제 1,500만). 또 ⑫ Zod가 시가를 줄이기 전 값으로 담보 승을 판정해 엔진이 읽지 않는
 * 실지취득가액을 요구했고(비우면 400), ⑤에는 필요한 취득시 기준시가 칸이 없었다 — ⑧만 풀면 막다른 길이다.
 *
 * 이 PR은 ⑤·⑧·⑫를 함께 맞춘다. 범위는 **주택**(이월과세·의제취득일 전 상속·증여 제외)이다. 그 밖의 종류는 같은 상황에서 정확한 사유로 막는다.
 * 축 A(공유 소유) 지분의 담보·임대 승은 이 PR의 범위가 아니다(S-2) — 종전처럼 막힌다.
 *
 * · AB-1 격자 — 기준시가(보충·담보·임대) · 시가(보충·담보): ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 오라클.
 * · AB-2 입력 요구 정합 — 시가 모드 담보 승: 실지취득가액은 요구하지 않고(⑧·⑫ 모두), 취득시 기준시가는 둘 다 요구한다(⑧ ⊇ ⑫).
 * · AB-3 ⑤ 술어 — 축 B 플래그를 넘기면 취득가액 강제 ∧ 취득시 기준시가 칸 ∧ 필요경비 칸 숨김. 플래그가 없으면 종전(false) — 카드 하나로 판정하면 틀린다.
 * · AB-4 범위 밖 종류는 정확한 사유로 막는다(«채무액 초과» 아님).
 * · AB-5 축 A의 주택 외 종류는 여전히 막힌다(주택은 S-2가 열었다 — `transfer.route.bg-axis-a-nonsupp-win.anchor.test.ts`) — 단건 시가 담보 승·컴패니언 묶음 비보충 승자 게이트.
 * · AB-6 ⑫ 판정은 엔진처럼 시가를 지분분으로 줄인다.
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { bgCollateralForcesStdAcq } from "@/lib/calc/burdened-gift-collateral-win";
import { bgSplitAxisCollateralWinUnsupported } from "@/lib/calc/burdened-gift-collateral-win";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import { bgExpenseInputsUnused } from "@/lib/calc/burdened-gift-expense-scope";
import { collateralForcesStdAcquisition } from "@/lib/api/transfer-tax-schema-collateral-win";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type A = Record<string, unknown>;

/** 주택 지분 카드 — 물건 전체 시가/기준시가 10억 · 취득시 기준시가 5억. 지분 60/40, 취득일이 서로 다르다(축 B 선례 `bg-axis-b-card-acquisition-sum`). */
const house = (id: number, num: string, acq: string, over: A = {}) =>
  ({
    ...makeDefaultAsset(id), assetId: id === 1 ? "p" : `s${id}`, addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: acq, ownershipNumerator: num, ownershipDenominator: "100", transferType: "burdened_gift",
    bgDonorRelation: "lineal_descendant", standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", ...over,
  }) as AssetForm;
const form = (a: A, b: A = {}, shape?: { assets?: AssetForm[] }) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "1000000000", totalTransferExpense: "0", householdHousingCount: "2",
    isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assetSplitMode: "fractional",
    assets: shape?.assets ?? [house(1, "60", "2009-03-01", a), house(2, "40", "2012-03-01", b)],
  }) as TransferFormData;

const STD: A = { bgValuationMode: "sangjeungbeop_standard" };
const MKT: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "400000000" };
/** 채무는 물건 전체 100% 기준 입력(축 B 규약). */
const W = {
  supp: { bgLendingDepositTotal: "300000000", bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000" },
  mortgage: { bgLendingDepositTotal: "0", bgMortgageDebtAmount: "1200000000", bgMortgageSetAmount: "1200000000" },
  rental: { bgLendingDepositTotal: "200000000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "120000000" },
} as const;

/** 화면과 같은 ⑧ 전체 메시지(`allIssues`는 80자로 자른다). */
const issues = (f: TransferFormData) => {
  const out: { field?: string; message: string }[] = [];
  for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, f)) out.push({ field: i.field, message: i.message });
  return out;
};
const gainOf = (r: Awaited<ReturnType<typeof runCalc>>) => {
  const d = (r.json as { data?: { result?: { transferGain?: number }; aggregated?: { totalTransferGain?: number } } }).data;
  return d?.aggregated?.totalTransferGain ?? d?.result?.transferGain;
};

describe("AB-1 축 B 격자 — ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 오라클", () => {
  // 오라클(손계산): 양도가액 = 채무 B(물건 전체 합), 취득가액 = (기준시가 모드·시가 모드 담보 승) 취득시 기준시가 5억 × B/C, 개산공제 3%, 보충·임대는 아래 값.
  // 담보 승은 C = B = 12억(채무비율 1): 12억 − 5억 − 1,500만 = 685,000,000. 기준시가 모드 담보 승과 시가 모드 담보 승이 같아야 한다(괄호가 같은 취득가액을 강제).
  it.each([
    ["기준시가 · 보충", { ...STD, ...W.supp }, 291_000_000],
    ["기준시가 · 담보", { ...STD, ...W.mortgage }, 685_000_000],
    ["기준시가 · 임대", { ...STD, ...W.rental }, 114_166_668],
    ["시가 · 보충", { ...MKT, ...W.supp }, 360_000_000],
    ["시가 · 담보 (신규 통과)", { ...MKT, ...W.mortgage }, 685_000_000],
  ] as const)("%s", async (_n, over, gain) => {
    const f = form(over);
    expect(issues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(gainOf(r)).toBe(gain);
  });

  it("둘째 카드 채무·시가를 비워도 첫 카드 값으로 병합되어 같다(축 B 규약)", async () => {
    const f = form({ ...MKT, ...W.mortgage }, { bgLendingDepositTotal: "", bgMortgageDebtAmount: "", bgMarketValueAtTransfer: "" });
    expect(issues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(gainOf(r)).toBe(685_000_000);
  });
});

describe("AB-2 입력 요구 정합 — 시가 모드 담보 승", () => {
  it("실지취득가액을 비워도 ⑧ 통과 ∧ ⑫ 200 (엔진이 읽지 않는 값 — 종전 ⑫ 400)", async () => {
    const f = form({ ...MKT, ...W.mortgage, bgActualAcquisitionTotal: "" });
    expect(issues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(gainOf(r)).toBe(685_000_000);
  });

  it("취득시 기준시가를 비우면 ⑧ 차단(standardPriceAtAcq) ∧ ⑫ 400 — ⑧ ⊇ ⑫", async () => {
    const f = form({ ...MKT, ...W.mortgage, standardPriceAtAcq: "" });
    const m = issues(f).filter((i) => i.field === "standardPriceAtAcq");
    expect(m.length).toBeGreaterThan(0);
    expect(m[0].message).toContain("취득시 기준시가");
    expect(issues(f).some((i) => i.message.includes("채무액") && i.message.includes("초과"))).toBe(false);
    const r = await runCalc(f);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("취득시 기준시가를 입력하세요");
  });

  it("둘째 카드 취득시 기준시가를 비워도 같다 — ⑧ 차단 ∧ ⑫ 400", async () => {
    const f = form({ ...MKT, ...W.mortgage }, { standardPriceAtAcq: "" });
    expect(issues(f).some((i) => i.field === "standardPriceAtAcq")).toBe(true);
    const r = await runCalc(f);
    expect(r.status).toBe(400);
  });

  it("보충적평가 승(채무 6억)은 종전대로 실지취득가액을 요구한다 — 요구를 풀지 않았다는 안전망", async () => {
    const f = form({ ...MKT, ...W.supp, bgActualAcquisitionTotal: "" });
    expect(issues(f).some((i) => i.field === "bgActualAcquisitionTotal")).toBe(true);
    const r = await runCalc(f);
    expect(r.status).toBe(400);
  });
});

describe("AB-3 ⑤ 술어 — 축 B 플래그", () => {
  const first = house(1, "60", "2009-03-01", { ...MKT, ...W.mortgage });
  const second = house(2, "40", "2012-03-01", { ...MKT, ...W.mortgage });
  it.each([["60% 카드", first], ["40% 카드", second]] as const)("%s — 플래그를 넘기면 취득가액 강제 ∧ 취득시 기준시가 칸 ∧ 필요경비 칸 숨김", (_n, a) => {
    expect(bgCollateralForcesStdAcq(a, true)).toBe(true);
    expect(needsBgAcqStdPriceInput(a, true)).toBe(true);
    expect(bgExpenseInputsUnused(a, true)).toBe(true);
  });
  it("플래그가 없으면 종전 — 지분 자산은 false (자산 하나만으로 축을 가릴 수 없다)", () => {
    expect(bgCollateralForcesStdAcq(first)).toBe(false);
    expect(bgCollateralForcesStdAcq(second)).toBe(false);
    expect(bgExpenseInputsUnused(first)).toBe(false);
  });
  it("엔진은 보충 승인 카드를 카드 하나로 판정하면 틀린다 — 채무 6억(물건 전체) 40% 카드는 플래그 없이 쓰면 담보 승으로 읽힌다", () => {
    const a = house(2, "40", "2012-03-01", { ...MKT, ...W.supp, bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000", bgLendingDepositTotal: "0" });
    // 물건 전체 판정(플래그 true)은 보충 승 — 엔진과 같다.
    expect(bgCollateralForcesStdAcq(a, true)).toBe(false);
  });
});

describe("AB-4 범위 밖 종류는 «채무액 초과»가 아니라 정확한 사유로 막는다", () => {
  const UNSUPPORTED = "지분 분할 취득(같은 물건)에서 담보평가액";
  const base = { ...MKT, ...W.mortgage };
  const check = (a: AssetForm) => validateBurdenedGiftAsset(a, "자산 1", undefined, "2026-02-16", true) ?? "";
  it.each([
    ["토지", { assetKind: "land" }],
    ["일반건물", { assetKind: "general_building" }],
  ] as const)("%s", (_n, o) => {
    const m = check(house(1, "60", "2009-03-01", { ...base, ...o }));
    expect(m).toContain(UNSUPPORTED);
    expect(m).not.toContain("초과합니다");
  });
  // 이월과세는 당초 증여자 입력 요구(`missingCoDonorBasisLabel`)가 이 차단보다 먼저 걸린다 — 그 입력을 채우면 이 차단에 도달한다. 여기서는 판정 술어와
  // «초과 아님»만 고정하고, 이월과세 교차의 끝단 측정은 계획서 V-S4로 남긴다.
  it("이월과세 — 판정은 미지원 ∧ 거짓 사유(채무액 초과)로 막지 않는다", () => {
    const a = house(1, "60", "2009-03-01", { ...base, acquisitionCause: "carryover_gift" });
    expect(bgSplitAxisCollateralWinUnsupported(a)).toBe(true);
    expect(bgCollateralForcesStdAcq(a, true)).toBe(false);
    expect(check(a)).not.toContain("초과합니다");
  });
  it("조합원입주권 — 축 B 시가 담보 승도 «채무액 초과»가 아니라 입주권 사유로 막는다", () => {
    const a = house(1, "60", "2009-03-01", {
      ...base, assetKind: "right_to_move_in", redevSubject: "right", isSuccessorRightToMoveIn: false,
      bgRightMemberRightsValue: "700000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000", bgMarketValueAtTransfer: "1000000000",
    });
    const m = check(a);
    expect(m).toContain("조합원입주권의 기준시가(같은 영 제165조 제1항) 입력 경로가 없어");
    expect(m).not.toContain("초과합니다");
  });
  it("주택은 막지 않는다(취득시 기준시가가 있으면 null)", () => {
    expect(check(house(1, "60", "2009-03-01", base))).toBe("");
  });
});

describe("AB-5 축 A의 주택 외 종류는 여전히 막힌다 (주택은 S-2가 열었다)", () => {
  it("단건 지분 50% 시가 담보 승(축 A) 재개발 APT는 종전처럼 FRAC_WIN으로 막는다", () => {
    const a = house(1, "50", "2012-03-01", { assetKind: "redevelopment_apt", ...MKT, bgMortgageDebtAmount: "700000000", bgMortgageSetAmount: "700000000", bgLendingDepositTotal: "0", ownershipRemainderThirdParty: "yes" });
    const f = Object.assign(createDefaultTransferFormData(), {
      transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets: [a],
    }) as TransferFormData;
    expect(issues(f).some((i) => i.message.includes("담보평가액") && i.message.includes("시가 해당분보다 커서"))).toBe(true);
  });
  it("컴패니언(다른 물건) 묶음의 지분 재개발 APT 담보 승은 비보충 승자 게이트로 막는다", () => {
    const whole = (id: number, over: A) => house(id, "100", "2015-01-01", { ...MKT, ...over });
    const share = house(2, "50", "2012-03-01", { assetKind: "redevelopment_apt", ...MKT, ...W.mortgage });
    const f = Object.assign(form({}, {}, { assets: [whole(1, W.mortgage), share] }), { assetSplitMode: "companion" }) as TransferFormData;
    expect(issues(f).some((i) => i.message.includes("함께 양도와 같이 계산하지 않습니다"))).toBe(true);
  });
});

describe("AB-6 ⑫ 담보 승 판정 — 엔진처럼 시가를 지분분으로 줄인다", () => {
  // 축 B 60% 카드: ④가 채무를 줄여 보낸다(12억 → 7.2억), 시가는 물건 전체 10억. 엔진은 시가를 6억으로 줄여 비교 → 담보 승.
  const wire = { valuationMode: "sangjeungbeop_market", marketValueAtTransfer: 1_000_000_000, lendingDepositTotal: 0, mortgageDebtAmount: 720_000_000, mortgageSetAmount: 720_000_000 };
  it("지분율을 넘기면 담보 승(엔진과 같다)", () => expect(collateralForcesStdAcquisition(wire, 0.6)).toBe(true));
  it("지분율을 안 넘기면 종전처럼 줄이기 전 값 — 시가 10억 > 담보 7.2억이라 담보 승이 아니다", () => expect(collateralForcesStdAcquisition(wire)).toBe(false));
  it("지분율 1·undefined·범위 밖은 줄이지 않는다", () => {
    expect(collateralForcesStdAcquisition(wire, 1)).toBe(false);
    expect(collateralForcesStdAcquisition(wire, undefined)).toBe(false);
  });
});
