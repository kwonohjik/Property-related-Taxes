/**
 * 건물(토지 제외) × 「소득세법 시행령」 §163⑨ 단서 2호 · §164⑤ — 상속 · 증여 · 부담부증여.
 * 계획서 docs/00-pm/building-163-9-proviso-164-5.plan.md · 사용자 결정 Q-30 a · Q-31 a · Q-32 a · Q-33 a.
 *
 * 시료: 상속(증여) 1999-06-01 건물 · 평가액 1억 · §164⑤ 칸(`inhBuildingSec164Value`) 2억 · 양도가액 5억.
 * 수정 전에는 ②를 받을 칸 · 운반 · 엔진 슬롯이 없어 평가액 1억만 써 양도차익 400,000,000이었다(1999 = 2002 — 구간을 보지 않았다).
 * 세율 mock — 양도차익으로 본다.
 */
import { describe, expect, it, vi } from "vitest";

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
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const B: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "building", acquisitionCause: "inheritance", acquisitionDate: "1999-06-01",
  inheritanceStartDate: "1999-06-01", decedentAcquisitionDate: "1980-01-01", actualSalePrice: "500000000", standardPriceAtTransfer: "300000000",
  standardPriceAtAcq: "200000000", publishedValueAtInheritance: "100000000", inheritanceValuationMethod: "supplementary",
};
const V: Loose = { inhBuildingSec164Value: "200000000" };
const GIFT: Loose = { acquisitionCause: "gift", inheritanceStartDate: "", fixedAcquisitionPrice: "100000000", donorAcquisitionDate: "1990-01-01", giftDonorRelation: "other", giftSameHousehold: "no" };
const at = (d: string): Loose => ({ acquisitionDate: d, inheritanceStartDate: d });
const bg = (actual = "100000000", debt = "250000000"): Loose => ({
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", bgMortgageDebtAmount: debt,
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: actual,
});

function form(a: Loose): TransferFormData {
  return rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: (a.contractTotal as string) ?? "500000000",
    assets: [{ ...makeDefaultAsset(1), ...a } as AssetForm],
  })) as TransferFormData;
}
async function run(a: Loose) {
  const f = form(a);
  const body = (await captureBody(f)) as Loose;
  const r = await postTransfer(body);
  const res = (r.result ?? {}) as Loose;
  const step = ((res.steps ?? []) as Loose[]).find((s) => /취득가액 의제/.test(String(s.label)));
  return {
    fe8: allIssues(f).map((i) => i.field), status: r.status, err: r.json?.error,
    sent: body.inheritedBuildingSec164Value as number | undefined, sentInh: body.inheritedAcquisition !== undefined,
    gain: res.transferGain as number | undefined, formula: String(step?.formula ?? ""),
  };
}

describe("BLD164 — 건물 × §163⑨ 단서 2호 · §164⑤", () => {
  it("G1 상속 1999 — max(1억, 2억) = 2억 · 양도차익 300,000,000", async () => {
    const r = await run({ ...B, ...V });
    expect([r.fe8, r.status, r.err, r.sent]).toEqual([[], 200, undefined, 200_000_000]);
    expect(r.gain).toBe(300_000_000);
    expect(r.formula).toContain("§164⑤ 취득당시 기준시가 200,000,000");
  });
  it("G2 구간 밖(상속 2001) — 싣지 않는다 · 평가액만", async () => {
    const r = await run({ ...B, ...V, ...at("2001-06-01") });
    expect([r.status, r.sent]).toEqual([200, undefined]);
    expect(r.gain).toBe(400_000_000);
  });
  it("G2b 경계 2000-12-31 — 연도 ≤ 2000이라 단서 안(Q-30 a · 일반건물 경로와 같다)", async () => {
    const r = await run({ ...B, ...V, ...at("2000-12-31") });
    expect([r.status, r.sent]).toEqual([200, 200_000_000]);
    expect(r.gain).toBe(300_000_000);
  });
  it("G3 증여 1999 — 같은 값", async () => {
    const r = await run({ ...B, ...V, ...GIFT });
    expect([r.fe8, r.status, r.err]).toEqual([[], 200, undefined]);
    expect(r.gain).toBe(300_000_000);
  });
  it("G4 ② 칸을 비우면 평가액만 · 막지 않는다(Q-32 a)", async () => {
    const r = await run({ ...B });
    expect([r.fe8, r.status, r.sent]).toEqual([[], 200, undefined]);
    expect(r.gain).toBe(400_000_000);
  });
  it("G5 평가액이 크면 평가액", async () => {
    const r = await run({ ...B, inhBuildingSec164Value: "50000000" });
    expect(r.gain).toBe(400_000_000);
    expect(r.formula).toContain("상증법 평가액 채택");
  });
  it("G6 지분 1/2(축 A) — ① · ② 모두 1/2로 비교 · 양도차익은 G1의 절반", async () => {
    const r = await run({ ...B, ...V, ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes" });
    expect([r.fe8, r.status, r.err, r.sent]).toEqual([[], 200, undefined, 200_000_000]);
    expect(r.gain).toBe(150_000_000);
  });
  it("G7 상속 부담부증여(시가 · 실지) — max(1억, 2억) × 0.5 → 양도차익 150,000,000(수정 전 200,000,000)", async () => {
    const r = await run({ ...B, ...V, ...bg() });
    expect([r.fe8, r.status, r.err, r.sent, r.sentInh]).toEqual([[], 200, undefined, 200_000_000, true]);
    expect(r.gain).toBe(150_000_000);
  });
  it("G7g 증여 부담부증여 — 같은 값", async () => {
    const r = await run({ ...B, ...V, ...GIFT, ...bg() });
    expect([r.fe8, r.status, r.err]).toEqual([[], 200, undefined]);
    expect(r.gain).toBe(150_000_000);
  });
  it("G7b 부담부증여 ② 비움 — 평가액 × 0.5(싣지 않는다)", async () => {
    const r = await run({ ...B, ...bg() });
    expect([r.status, r.sent, r.sentInh]).toEqual([200, undefined, false]);
    expect(r.gain).toBe(200_000_000);
  });
  it("G8 부담부증여 기준시가 평가 — §163⑨를 쓰지 않는다(inheritedAcquisition 없음)", async () => {
    const r = await run({ ...B, ...V, ...bg(), bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "", bgMortgageDebtAmount: "100000000" });
    expect([r.status, r.sentInh]).toEqual([200, false]);
  });
  it("G9 의제취득일 전(상속 1983) — §164⑤ 칸(의제취득일 이후 전용)은 싣지 않는다 · ③이 크면 ③(Q-34 a 뒤에도 같은 값)", async () => {
    const r = await run({ ...B, ...V, ...at("1983-06-01") });
    expect([r.status, r.sent]).toEqual([200, undefined]);
    expect(r.gain).toBe(160_666_667);
  });
  it("G10 ⑫ 직접 호출 — 구간 밖(2001)·의제취득일 전(1983)에 ②를 보내도 엔진이 쓰지 않는다", async () => {
    for (const [d, gain] of [["2001-06-01", 400_000_000], ["1983-06-01", 160_666_667]] as const) {
      const body = (await captureBody(form({ ...B, ...at(d) }))) as Loose;
      const r = await postTransfer({ ...body, inheritedBuildingSec164Value: 200_000_000 });
      expect([r.status, ((r.result ?? {}) as Loose).transferGain]).toEqual([200, gain]);
    }
  });
  it("G11 상속 ① 비움 · ②만 — ⑧ 통과 · max(0, 2억)(isSec164ClauseAFilled · 다른 종류와 같은 규칙)", async () => {
    const r = await run({ ...B, ...V, publishedValueAtInheritance: "" });
    expect([r.fe8, r.status, r.err, r.sent]).toEqual([[], 200, undefined, 200_000_000]);
    expect(r.gain).toBe(300_000_000);
  });
  it("G12 함께 양도(컴패니언 건물) — ②를 넣으면 전체 양도차익이 정확히 1억(② − ①) 줄어든다", async () => {
    const land: Loose = {
      ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 2-1", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2010-01-01", transferType: "regular",
      actualSalePrice: "500000000", fixedAcquisitionPrice: "300000000", acquisitionArea: "100", transferArea: "100", landNature: "standalone",
      standardPriceAtTransfer: "400000000",
    };
    const bundle = (over: Loose) => Object.assign(createDefaultTransferFormData(), {
      transferDate: "2023-02-16", filingDate: "2023-04-30", householdHousingCount: "0", isOneHousehold: false, contractTotalPrice: "1000000000",
      assets: [land, { ...makeDefaultAsset(2), ...B, ...over }],
    }) as TransferFormData;
    const gains: number[] = [];
    for (const over of [{}, V]) {
      const f = bundle(over);
      expect(allIssues(f)).toEqual([]);
      const body = (await captureBody(f)) as Loose;
      const c = (body.companionAssets as Loose[])[0];
      expect(c.inheritedBuildingSec164Value).toBe(over === V ? 200_000_000 : undefined);
      const r = await postTransfer(body);
      expect(r.status).toBe(200);
      const props = ((r.json?.data?.aggregated?.properties ?? []) as Loose[]).map((p) => p.transferGain as number);
      gains.push(props.reduce((a, b) => a + b, 0));
    }
    expect(gains[0] - gains[1]).toBe(100_000_000);
  });
});

/**
 * Q-34 a · Q-35 a(계획서 §9) — 의제취득일(1985.1.1.) 전 상속 · 증여 건물: ② §164⑤ = ③ 분자(「의제취득일 기준시가」 칸).
 * 건물 기준시가는 2001.1.1. 전 고시가 없어 1985.1.1. 기준시가는 §164⑤로만 산정된다. ②가 이기는 것은 양도가액 < 양도시 기준시가일 때뿐이다.
 * 시료: 1983 상속 · 분자 2억 · 양도가액 2억 · 양도시 기준시가 4억 · ① 5천만 → ③ 1억(+개산공제 6백만) vs ② 2억(실지 의제 · 개산공제 없음).
 */
describe("BLD164-PD — 의제취득일 전 건물 ② = ③ 분자", () => {
  const PD: Loose = { ...at("1983-06-01"), standardPriceAtAcq: "200000000" };
  const LOW: Loose = { actualSalePrice: "200000000", contractTotal: "200000000", standardPriceAtTransfer: "400000000", publishedValueAtInheritance: "50000000" };
  it("PD1 ③ > ② — ③ 그대로(160,666,667) · 산식에 ② 줄이 생긴다", async () => {
    const r = await run({ ...B, ...PD });
    expect([r.fe8, r.status]).toEqual([[], 200]);
    expect(r.gain).toBe(160_666_667);
    expect(r.formula).toContain("② §164 취득당시 기준시가: 200,000,000 (미적용");
  });
  it("PD2 양도가액 < 양도시 기준시가 — ② 2억 채택 · 양도차익 0(수정 전 94,000,000)", async () => {
    const r = await run({ ...B, ...PD, ...LOW });
    expect([r.fe8, r.status, r.err]).toEqual([[], 200, undefined]);
    expect(r.gain).toBe(0);
    expect(r.formula).toContain("→ 적용 (①②③ 중 큰 금액, ② §164 취득당시 기준시가): 200,000,000");
  });
  it("PD2g 증여 — 같은 값", async () => {
    const r = await run({ ...B, ...PD, ...LOW, ...GIFT, fixedAcquisitionPrice: "50000000", donorAcquisitionDate: "1975-01-01" });
    expect([r.fe8, r.status, r.err]).toEqual([[], 200, undefined]);
    expect(r.gain).toBe(0);
  });
  it("PD3 지분 1/2 — ②도 1/2(1억)로 비교 · 양도차익 0(안분하지 않으면 −1억)", async () => {
    const r = await run({ ...B, ...PD, ...LOW, ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes" });
    expect([r.fe8, r.status, r.err]).toEqual([[], 200, undefined]);
    expect(r.gain).toBe(0);
    expect(r.formula).toContain("② §164 취득당시 기준시가: 100,000,000");
  });
  it("PD4 부담부증여(시가 · β 0.5) — ② 2억 × 0.5 · 양도차익 0(수정 전 47,000,000)", async () => {
    const r = await run({ ...B, ...PD, ...LOW, ...bg("", "100000000"), bgMarketValueAtTransfer: "200000000" });
    expect([r.fe8, r.status, r.err]).toEqual([[], 200, undefined]);
    expect(r.gain).toBe(0);
  });
  it("PD5 분자를 비우면 ②도 없다", async () => {
    const r = await run({ ...B, ...PD, ...LOW, standardPriceAtAcq: "" , publishedValueAtInheritance: "150000000" });
    expect(r.formula).not.toContain("② §164");
  });
  it("PD6 부담부증여 기준시가 평가 — 의제취득일 기준시가 × β 그대로(② 주입과 무관)", async () => {
    const r = await run({ ...B, ...PD, ...LOW, ...bg("", "100000000"), bgMarketValueAtTransfer: "", bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "" });
    expect([r.fe8, r.status, r.err]).toEqual([[], 200, undefined]);
    expect(r.gain).toBe(48_500_000);
  });
  it("PD7 ① 비움 · 분자만 — ②가 있으므로 「가목 확인 불가」 선언을 요구하지 않는다(Q-36 a) · ② 채택 0", async () => {
    const r = await run({ ...B, ...PD, ...LOW, publishedValueAtInheritance: "" });
    expect([r.fe8, r.status, r.err]).toEqual([[], 200, undefined]);
    expect(r.gain).toBe(0);
  });
  it("PD8 ⑫ `deemedStdNotSec164`(증여세 계산기 비주택 건물 전용) — ②를 넣지 않는다 · 94,000,000(Q-37 a)", async () => {
    const body = (await captureBody(form({ ...B, ...PD, ...LOW }))) as Loose;
    const r = await postTransfer({ ...body, inheritedAcquisition: { ...(body.inheritedAcquisition as Loose), deemedStdNotSec164: true } });
    expect([r.status, ((r.result ?? {}) as Loose).transferGain]).toEqual([200, 94_000_000]);
  });
});

