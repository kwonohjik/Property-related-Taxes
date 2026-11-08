/**
 * route anchor — 이월과세 거주요건 경고·단서 범위의 취득일 읽기 수정(L24)은 **엔진 결론·세액을 바꾸지 않는다**.
 *
 * 화면(Step4 경고·§155⑳ 카드 단서 범위)만 칸 없는 `acquisitionDate`를 읽었고 ④ 와이어·엔진은 증여 등기접수일만 읽는다.
 * 이 파일이 (1) 엔진 `isExempt` 가 화면 기대(R1 과세·R2 과세·R3~R5 경과규정 비과세)와 같음을 (2) 같은 등기접수일(G)에서 잔재(S)가
 * 무엇이든 와이어 취득일·isExempt·총세액이 같음을 고정한다. 모든 셀에서 ⑧ 이슈 0건(⑧ 통과 ⇔ 200).
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
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { carryoverResidenceForm } from "../calc/_helpers/l24-carryover-residence-form";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine() as never);
});

const STALES = ["", "2005-01-01", "2019-03-01", "2030-01-01"] as const;
const CELLS = [
  { n: "R1", G: "2019-03-01", exempt: false },
  { n: "R3/R4/R5", G: "2016-06-01", exempt: true },
] as const;

describe("세액·isExempt 불변 — 등기접수일 G 고정, 잔재 S 4종", () => {
  for (const c of CELLS) {
    it(`${c.n}: G=${c.G} → 엔진 isExempt=${c.exempt} · 잔재(빔·2005·2019·2030) 무관 와이어 취득일·isExempt·총세액 동일`, async () => {
      const ref = await runCalc(carryoverResidenceForm("", c.G));
      expect(ref.status).toBe(200);
      expect(ref.result.isExempt).toBe(c.exempt);
      for (const S of STALES) {
        const r = await runCalc(carryoverResidenceForm(S, c.G));
        expect((r.body as { acquisitionDate?: string }).acquisitionDate, `S=${S}`).toBe(c.G);
        expect(r.status, `S=${S}`).toBe(200);
        expect(r.result.isExempt, `S=${S}`).toBe(c.exempt);
        expect(r.result.totalTax, `S=${S}`).toBe(ref.result.totalTax);
        expect(r.issues, `S=${S}`).toEqual([]);
      }
    }, 60_000);
  }
  it("R1 과세 셀은 실제 세액이 있다 (비과세 0원과 구별)", async () => {
    const r = await runCalc(carryoverResidenceForm("", "2019-03-01"));
    expect(r.result.totalTax).toBeGreaterThan(0);
    const e = await runCalc(carryoverResidenceForm("", "2016-06-01"));
    expect(e.result.totalTax).toBe(0);
  }, 60_000);
});

describe("수용 단서(§154①2호 가목) × R1 — 엔진 비과세 = 카드 단서 범위 both", () => {
  const f = (S: string): TransferFormData =>
    carryoverResidenceForm(S, "2019-03-01", "carryover_gift", {}, { provisoReason: "expropriation", provisoExpropriationDate: "2024-03-01", provisoBusinessApprovalDate: "2021-01-01" } as Partial<TransferFormData>);
  it("잔재 빔·2022 모두 isExempt=true · 총세액 0 (G=2019 가 고시일 전)", async () => {
    for (const S of ["", "2022-01-01"]) {
      const r = await runCalc(f(S));
      expect(r.status, `S=${S}`).toBe(200);
      expect(r.result.isExempt, `S=${S}`).toBe(true);
      expect(r.result.totalTax, `S=${S}`).toBe(0);
    }
  }, 60_000);
});

describe("대조(불변) — 일반 매매 주택", () => {
  it("취득일 2019-03-01 → 과세 · 2016-06-01 → 비과세 (경과규정)", async () => {
    const a = await runCalc(carryoverResidenceForm("2019-03-01", "", "purchase"));
    expect(a.result.isExempt).toBe(false);
    const b = await runCalc(carryoverResidenceForm("2016-06-01", "", "purchase"));
    expect(b.result.isExempt).toBe(true);
  }, 60_000);
});
