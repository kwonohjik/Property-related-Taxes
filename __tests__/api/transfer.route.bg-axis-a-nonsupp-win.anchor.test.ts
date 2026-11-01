/**
 * anchor — 부담부증여 **축 A(공유 소유 — 채무는 본인 인수분) 지분 주택의 담보·임대 승** (S-2).
 * 계획서 `docs/00-pm/bg-axis-a-nonsupp-win.plan.md` · 상위 `bg-nonsupp-winner-support.plan.md` §4.1 · 사용자 결정 Q-1(착수 순서 S-1 → S-2 → I-0 → I-1 → 질의 병행 → I-2·M-1).
 *
 * 종전: 단건 지분 시가 모드 담보 승은 «지분 N%를 가진 자산에서 담보평가액이 … 계산하지 않습니다»로, 함께 양도(컴패니언) 묶음의 지분 자산 담보·임대 승은
 * «… 자산은 함께 양도와 같이 계산하지 않습니다»로 ⑧이 막았다. ⑫는 200이고 값은 손계산과 일치했다(S-1 계획서 §3.1 — 오라클 ±0).
 * 법문은 명확하다 — 소령 §159①1호 A(괄호에 상증법 §66 포함, 2023.2.28. 이후)와 §61⑤ 임대: 취득가액 = 취득시 기준시가 × 채무비율(× 지분).
 *
 * 이 PR은 ⑤(취득시 기준시가 칸)·⑧(승자 판정·입력 요구)·⑫(이미 맞음)를 같은 축 인지 판정으로 맞춘다. 범위는 **주택**(이월과세·의제취득일 전 상속·증여·겸용 제외)이다.
 * 판정 함수 `isFractionalSplit`는 세 상태 — `true` 축 B · `false` 축 A · `undefined` 축 미지정(승자 미확정 = 종전 차단 유지).
 *
 * · AA-1 단건 축 A 격자 — 기준시가(보충·담보·임대) · 시가(보충·담보): ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 오라클(손계산).
 * · AA-2 입력 요구 정합 — 시가 담보 승: 실지취득가액은 요구하지 않고(⑧·⑫), 취득시 기준시가는 둘 다 요구한다(⑧ ⊇ ⑫).
 * · AA-3 컴패니언 묶음 — 균일 승자는 ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 자산별 단건 지분 실행의 합, 혼합 승자는 계속 막는다(⑧ ∧ ⑫ 400).
 * · AA-4 범위 밖 — 주택 외 종류·이월과세는 정확한 사유로 막는다(단건 · 묶음). 축 미지정 호출은 종전처럼 확정하지 않는다.
 * · AA-5 ⑤ 술어 — 축 A로 확인한 호출만 취득가액 강제 ∧ 필요경비 칸 숨김.
 * · AA-6 분할 방식 선택이 없는 폼 — 종전처럼 추론 축 B로 읽는다(S-2가 바꾸지 않은 것). 축 A는 `companion` 선언 폼만.
 * · AA-7 12억 고가주택 판정 — 담보 승 지분은 지분 증여가액 ÷ 지분율(소령 §156①)로 판정한다(엔진 G1-14 anchor가 값을 고정, 여기서는 화면 경로 도달을 확인).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { bgCollateralForcesStdAcq, bgNonSupplementaryWinnerUnsupported, bgUnsupportedWinnerCause } from "@/lib/calc/burdened-gift-collateral-win";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import { bgExpenseInputsUnused } from "@/lib/calc/burdened-gift-expense-scope";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
/** 주택 — 물건 전체 시가·기준시가 10억 · 취득시 기준시가 5억 · 실지 4억. 시가 모드 기본. 채무는 호출이 정한다. */
const house = (id: number, ...over: Partial<AssetForm>[]) =>
  Object.assign({ ...makeDefaultAsset(id) }, x({
    assetId: `h${id}`, addressJibun: `서울 강남구 테스트동 ${id}-1`, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
    standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", useEstimatedAcquisition: false, transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "400000000", ownershipNumerator: "100", ownershipDenominator: "100",
  }), ...over) as AssetForm;
const STD = x({ bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "" });
const debt = (d: string) => x({ bgMortgageDebtAmount: d, bgMortgageSetAmount: d });
const RENT = x({ bgLendingDepositTotal: "100000000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "120000000" });
const HALF = x({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });
const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };

const mkForm = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), FORM, over, { assets }) as TransferFormData;
const companionForm = (assets: AssetForm[]) => mkForm(assets, { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" });

/** 화면과 같은 ⑧ 전체 메시지(`allIssues`는 80자로 자른다). */
const issues = (f: TransferFormData) => {
  const out: { field?: string; message: string }[] = [];
  for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, f)) out.push({ field: i.field, message: i.message });
  return out;
};
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const gainOf = (r: Awaited<ReturnType<typeof post>>) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;
const GATE = "함께 양도와 같이 계산하지 않습니다";
const FRAC_WIN = "지분 50%를 가진 자산에서 담보평가액";

describe("AA-1 단건 축 A 격자 — ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 오라클", () => {
  // 오라클(손계산, 지분 50%): 채무는 본인 인수분 D. 증여가액 C = max(보충적 = 시가·기준시가 × 50% = 5억, 담보평가액). 양도가액 = D, 채무비율 = D/C.
  //   담보 승(D=7억): C=7억 → 비율 1 → 취득가액 = 취득시 기준시가 5억 × 50% × 1 = 2.5억 · 개산공제 3% = 750만 → 7억 − 2.5억 − 750만 = 442,500,000
  //   보충 승(D=3억): C=5억 → 비율 0.6 → 취득가액 = 실지 4억 × 50% × 0.6 = 1.2억(실지 방식은 개산공제 없음) → 3억 − 1.2억 = 180,000,000
  // 임대 승은 시가 모드에 없고(`rentalEligible`), 기준시가 모드 임대 승은 종전부터 통과하므로 아래에서 안전망으로만 확인한다.
  it.each([
    ["기준시가 · 담보", { ...STD, ...debt("700000000") }, 442_500_000],
    ["시가 · 담보 (신규 통과)", debt("700000000"), 442_500_000],
  ] as const)("%s", async (_n, over, gain) => {
    const f = mkForm([house(1, HALF, over)]);
    expect(issues(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(gainOf(r)).toBe(gain);
  });

  it("시가 담보 승과 기준시가 담보 승의 양도차익이 같다 — 괄호가 같은 취득가액을 강제한다", async () => {
    const a = await post(mkForm([house(1, HALF, debt("700000000"))]));
    const b = await post(mkForm([house(1, HALF, STD, debt("700000000"))]));
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(gainOf(a)).toBe(gainOf(b));
  });

  it("보충 승(채무 3억)은 종전 그대로 통과 — 안전망", async () => {
    const f = mkForm([house(1, HALF, debt("300000000"))]);
    expect(issues(f)).toEqual([]);
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(gainOf(r)).toBe(180_000_000);
  });

  it("기준시가 모드 임대 승: ⑧ 통과 ∧ ⑫ 200 (종전부터 통과 — 안전망)", async () => {
    const f = mkForm([house(1, HALF, STD, RENT)]);
    expect(issues(f)).toEqual([]);
    expect((await post(f)).status).toBe(200);
  });
});

describe("AA-2 입력 요구 정합 — 시가 담보 승", () => {
  it("실지취득가액을 비워도 ⑧ 통과 ∧ ⑫ 200 (엔진이 읽지 않는 값을 요구하지 않는다)", async () => {
    const f = mkForm([house(1, HALF, debt("700000000"), x({ bgActualAcquisitionTotal: "" }))]);
    expect(issues(f)).toEqual([]);
    expect((await post(f)).status).toBe(200);
  });
  it("취득시 기준시가를 비우면 ⑧ 차단(칸 standardPriceAtAcq) ∧ ⑫ 400 (⑧ ⊇ ⑫)", async () => {
    const f = mkForm([house(1, HALF, debt("700000000"), x({ standardPriceAtAcq: "" }))]);
    const m = issues(f);
    expect(m.length).toBe(1);
    expect(m[0].field).toBe("standardPriceAtAcq");
    expect((await post(f)).status).toBe(400);
  });
  it("보충 승은 실지취득가액 요구가 그대로다 — 요구를 풀지 않았다는 안전망", () => {
    const m = issues(mkForm([house(1, HALF, debt("300000000"), x({ bgActualAcquisitionTotal: "" }))]));
    expect(m.some((i) => i.field === "bgActualAcquisitionTotal")).toBe(true);
  });
});

describe("AA-3 컴패니언(서로 다른 물건) 묶음 — 균일 승자는 통과, 혼합 승자는 계속 막는다", () => {
  const FULL_MORT = [house(1, debt("1200000000"))]; // 100% · 시가 10억 · 채무 12억 → 담보 승 (C = 12억)
  const pair = (second: Partial<AssetForm>[]) => [...FULL_MORT, house(2, ...second)];

  it("시가 담보 + 담보(100/50): ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 자산별 단건 지분 실행의 합", async () => {
    const f = companionForm(pair([HALF, debt("700000000")]));
    expect(issues(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    const s1 = await post(mkForm([house(1, debt("1200000000"))]));
    const s2 = await post(mkForm([house(2, HALF, debt("700000000"))]));
    expect(gainOf(r)).toBe(gainOf(s1)! + gainOf(s2)!);
  });
  it("기준시가 담보 + 담보(100/50): ⑧ 통과 ∧ ⑫ 200 ∧ 양도차익 = 단건 합", async () => {
    const f = companionForm([house(1, STD, debt("1600000000")), house(2, STD, HALF, debt("700000000"))]);
    expect(issues(f)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    const s1 = await post(mkForm([house(1, STD, debt("1600000000"))]));
    const s2 = await post(mkForm([house(2, STD, HALF, debt("700000000"))]));
    expect(gainOf(r)).toBe(gainOf(s1)! + gainOf(s2)!);
  });
  it("시가 담보 + 보충(혼합): ⑧ 차단(승자 혼합) ∧ ⑫ 400 — 증여세가 ΣA보다 작아지는 조합은 계속 막는다", async () => {
    const f = companionForm(pair([HALF, debt("300000000")]));
    expect(issues(f).some((i) => i.message.includes("증여재산 평가 방식이 달라"))).toBe(true);
    expect((await post(f)).status).toBe(400);
  });
  it("지분 자산 취득시 기준시가를 비우면 ⑧ 차단 ∧ ⑫ 400 (⑧ ⊇ ⑫), 실지를 비우면 둘 다 통과", async () => {
    const noStd = companionForm(pair([HALF, debt("700000000"), x({ standardPriceAtAcq: "" })]));
    expect(issues(noStd).some((i) => i.field === "standardPriceAtAcq")).toBe(true);
    expect((await post(noStd)).status).toBe(400);
    const noActual = companionForm(pair([HALF, debt("700000000"), x({ bgActualAcquisitionTotal: "" })]));
    expect(issues(noActual)).toEqual([]);
    expect((await post(noActual)).status).toBe(200);
  });
});

describe("AA-4 범위 밖 — 주택 외·이월과세는 정확한 사유로 막고, 축 미지정은 확정하지 않는다", () => {
  const redev = (id: number) => house(id, HALF, debt("700000000"), x({ assetKind: "redevelopment_apt" }));
  it("단건 재개발 APT 지분 담보 승: «주택(이월과세·의제취득일 전 상속·증여 제외)만 계산합니다»", () => {
    const m = issues(mkForm([redev(1)])).map((i) => i.message).filter((t) => t.includes(FRAC_WIN));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("주택(이월과세·의제취득일 전 상속·증여 제외)만 계산합니다");
  });
  it("묶음 지분 재개발 APT 담보 승: 묶음 게이트가 «지분 보유 자산은 … 주택 … 만 계산합니다»", () => {
    const m = issues(companionForm([house(1, debt("1200000000")), redev(2)])).map((i) => i.message).filter((t) => t.includes(GATE));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("지분 보유 자산은");
    expect(m[0]).toContain("주택(이월과세·의제취득일 전 상속·증여 제외)만 계산합니다");
    expect(m[0]).not.toContain("단건으로 계산하세요");
  });
  it("술어 — 주택 지분은 풀리고 입주권·겸용은 지분 여부와 무관하게 막힌다", () => {
    const base = (over: Partial<AssetForm>) => house(1, HALF, debt("700000000"), over);
    expect(bgNonSupplementaryWinnerUnsupported(base(x({})))).toBe(false);
    expect(bgNonSupplementaryWinnerUnsupported(base(x({ assetKind: "right_to_move_in" })))).toBe(true);
    expect(bgNonSupplementaryWinnerUnsupported(base(x({ isMixedUseHouse: true })))).toBe(true);
    expect(bgNonSupplementaryWinnerUnsupported(base(x({ assetKind: "land" })))).toBe(true);
    expect(bgUnsupportedWinnerCause(base(x({ assetKind: "right_to_move_in" })))).toContain("조합원입주권의 기준시가");
  });
  it("축 미지정(undefined)은 종전처럼 지분 자산의 담보 승을 확정하지 않는다 — 미전환 호출처의 fail-closed", () => {
    const a = house(1, HALF, debt("700000000"));
    expect(bgCollateralForcesStdAcq(a)).toBe(false);
    expect(bgCollateralForcesStdAcq(a, false)).toBe(true);
    expect(needsBgAcqStdPriceInput(a)).toBe(false);
    expect(needsBgAcqStdPriceInput(a, false)).toBe(true);
  });
});

describe("AA-5 ⑤ 술어 — 축 A로 확인한 호출만 취득가액 강제 · 필요경비 칸 숨김", () => {
  const a = house(1, HALF, debt("700000000"));
  it("축 A(false): 취득가액 강제 ∧ 취득시 기준시가 칸 ∧ 필요경비 «개산공제만»", () => {
    expect(bgCollateralForcesStdAcq(a, false)).toBe(true);
    expect(needsBgAcqStdPriceInput(a, false)).toBe(true);
    expect(bgExpenseInputsUnused(a, false)).toBe(true);
  });
  it("같은 입력을 축 B(true)로 읽으면 물건 전체 판정 — 시가 10억 > 담보 7억이라 담보 승이 아니다", () => {
    expect(bgCollateralForcesStdAcq(a, true)).toBe(false);
  });
  it("보충 승 지분(채무 3억)은 강제하지 않는다", () => {
    expect(bgCollateralForcesStdAcq(house(1, HALF, debt("300000000")), false)).toBe(false);
  });
});

describe("AA-6 분할 방식 선택이 없는 폼 — 종전처럼 추론 축 B로 읽는다 (이 PR이 바꾸지 않은 것)", () => {
  // 종전 세션·이력의 폼에는 `assetSplitMode`가 없고 전 자산이 지분이면 ⑧·⑫ 모두 축 B로 추론한다(`isFullFractionalBundle`). S-2가 여는 축 A는 `companion`이 **선언된** 폼뿐이라
  // 선택이 없는 폼에는 새 침묵 오산이 없다 — 가드(차단)를 넣으면 종전에 통과하던 입력을 막고 화면에서 비파괴로 고를 방법도 없다(토글을 끄면 형제 자산이 사라진다).
  // 시료: 시가 10억 · 50/50 · 채무 7억(각자). 축 B 읽기는 물건 전체 채무 7억 < 시가 10억이라 보충 승, 축 A 읽기는 본인 인수분 7억 > 지분 시가 5억이라 담보 승이다.
  const two = () => [house(1, HALF, debt("700000000")), house(2, HALF, debt("700000000"))];
  it("선택 없음(추론 축 B): ⑧ 통과 ∧ ⑫ 200 — 종전과 같다", async () => {
    const f = mkForm(two(), { contractTotalPrice: "2000000000" });
    expect(f.assetSplitMode).toBeUndefined();
    expect(issues(f)).toEqual([]);
    expect((await post(f)).status).toBe(200);
  });
  it("선택 `fractional`은 선택 없음과 같은 값, `companion`은 축 A로 읽어 값이 다르다 — 같은 입력이 축에 따라 달라진다는 측정 기록", async () => {
    const none = await post(mkForm(two(), { contractTotalPrice: "2000000000" }));
    const frac = await post(mkForm(two(), { assetSplitMode: "fractional", contractTotalPrice: "2000000000" }));
    const comp = await post(mkForm(two(), { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" }));
    expect([none.status, frac.status, comp.status]).toEqual([200, 200, 200]);
    expect(gainOf(none)).toBe(gainOf(frac));
    expect(gainOf(comp)).not.toBe(gainOf(none));
  });
});

describe("AA-7 1세대1주택 12억 판정 — 담보 승 지분이 화면 경로로 도달한다 (값은 엔진 G1-14 anchor)", () => {
  it("지분 50% · 담보 7억 → 판정 가액 14억(7억 ÷ 0.5) > 12억 → 고가주택 부분 비과세 (분모 echo 14억)", async () => {
    const one = { isOneHousehold: true, householdHousingCount: "1" };
    const a = house(1, HALF, debt("700000000"), x({ acquisitionDate: "2009-03-01" }));
    const f = mkForm([a], one);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    const res = r.j.data.result;
    expect(res.isPartialExempt).toBe(true);
    expect(res.transferBurdenedGiftBreakdown.fractionalHighValueDenominator).toBe(1_400_000_000);
  });
});
