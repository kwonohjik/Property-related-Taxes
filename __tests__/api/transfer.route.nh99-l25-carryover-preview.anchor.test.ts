/**
 * route anchor — 이월과세 Step4 미리보기 2곳의 취득일 읽기 수정(L25)은 **엔진 결론·세액을 바꾸지 않는다**.
 *
 * 화면(한시 유예 나·다목 보유 2년 게이트 · §154⑤ 단서 재기산 미리보기)만 칸 없는 `acquisitionDate`를 읽었고 ④ 와이어·엔진은 증여 등기접수일만 읽는다.
 * 이 파일이 (1) 엔진 결론(G: isSurchargeApplied · R: 재기산 고지)이 화면 기대와 같음을 (2) 같은 등기접수일에서 잔재가 무엇이든 와이어 취득일·결론·총세액이 같음을 고정한다.
 * 모든 셀에서 ⑧ 이슈 0건(⑧ 통과 ⇔ 200).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
import { makeMockRates, makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { graceForm, restartForm } from "../calc/_helpers/l25-carryover-preview-form";

const STALES = ["", "2005-01-01", "2020-01-01", "2025-03-01", "2030-01-01"] as const;
const restartNotice = (j: unknown) => /재기산일|2021년 1월 1일~2022년 5월 9일 양도분/.test(JSON.stringify(j ?? {}));
const surcharged = (j: unknown) => /"isSurchargeApplied":true/.test(JSON.stringify(j ?? {}));

describe("G — 한시 유예 나·다목 보유 2년 게이트: 등기접수일 고정, 잔재 5종 무관", () => {
  beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
  const CELLS = [
    { n: "G1/G2 (등기 2025-03 → 보유 2년 미만)", gift: "2025-03-01", surcharge: true },
    { n: "G3/G4 (등기 2020-01 → 보유 2년 이상, 다목 충족)", gift: "2020-01-01", surcharge: false },
  ] as const;
  for (const c of CELLS) {
    it(`${c.n}: 엔진 isSurchargeApplied=${c.surcharge} · 잔재 무관 와이어 취득일·결론·총세액 동일`, async () => {
      const ref = await runCalc(graceForm("", c.gift));
      expect(ref.status).toBe(200);
      for (const S of STALES) {
        const r = await runCalc(graceForm(S, c.gift));
        expect(r.status, `S=${S}`).toBe(200);
        expect((r.body as { acquisitionDate?: string }).acquisitionDate, `S=${S}`).toBe(c.gift);
        expect(surcharged(r.json), `S=${S}`).toBe(c.surcharge);
        expect(r.result.totalTax, `S=${S}`).toBe(ref.result.totalTax);
        expect(r.issues, `S=${S}`).toEqual([]);
      }
    }, 90_000);
  }
  it("대조(불변) — 일반 매매 주택: 취득일 2025-03-01 → 중과 · 2020-01-01 → 중과 없음", async () => {
    const a = await runCalc(graceForm("2025-03-01", "", "purchase"));
    expect(a.issues).toEqual([]);
    expect(surcharged(a.json)).toBe(true);
    const b = await runCalc(graceForm("2020-01-01", "", "purchase"));
    expect(surcharged(b.json)).toBe(false);
  }, 60_000);
});

describe("R — §154⑤ 단서 재기산 고지: 등기접수일 고정, 잔재 5종 무관", () => {
  beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine() as never); });
  const CELLS = [
    { n: "R1/R4 (등기 2019 → 처분 2021-06 이 취득일 뒤 → 재기산)", gift: "2019-01-01", restart: true },
    { n: "R2/R3 (등기 2021-09 → 처분이 취득일 앞 → 재기산 없음)", gift: "2021-09-01", restart: false },
  ] as const;
  const taxByGift: Record<string, number> = {};
  for (const c of CELLS) {
    it(`${c.n}: 엔진 재기산 고지=${c.restart} · 잔재 무관 와이어 취득일·총세액 동일`, async () => {
      const ref = await runCalc(restartForm("", c.gift));
      expect(ref.status).toBe(200);
      taxByGift[c.gift] = ref.result.totalTax;
      for (const S of STALES) {
        const r = await runCalc(restartForm(S, c.gift));
        expect(r.status, `S=${S}`).toBe(200);
        expect((r.body as { acquisitionDate?: string }).acquisitionDate, `S=${S}`).toBe(c.gift);
        expect(restartNotice(r.json), `S=${S}`).toBe(c.restart);
        expect(r.result.totalTax, `S=${S}`).toBe(ref.result.totalTax);
        expect(r.issues, `S=${S}`).toEqual([]);
      }
    }, 90_000);
  }
  it("두 등기접수일의 총세액이 다르다 (재기산 유무가 세액에 닿는다)", () => {
    expect(taxByGift["2019-01-01"]).not.toBe(taxByGift["2021-09-01"]);
  });
  it("대조(불변) — 일반 매매 주택: 취득일 2019 → 재기산 · 2021-09 → 없음", async () => {
    const a = await runCalc(restartForm("2019-01-01", "", "purchase"));
    expect(a.issues).toEqual([]);
    expect(restartNotice(a.json)).toBe(true);
    const b = await runCalc(restartForm("2021-09-01", "", "purchase"));
    expect(restartNotice(b.json)).toBe(false);
  }, 60_000);
});
