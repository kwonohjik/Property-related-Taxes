/**
 * G2-1 anchor — 다건 route(⑭)도 §154① 단서 1호 「임차일부터 양도일까지 세대전원 거주 개월」을 엔진에 넘겨
 * 단건과 같은 결론을 내야 한다 (소득세법 시행령 §154① 단서·1호: 임차일부터 세대전원 거주 5년 이상이면 보유·거주기간 제한 없음).
 *
 * 종전 결함: `multi/route.ts`가 `oneHouseExemptionProviso`를 키 열거로 옮기며 `rentalLeaseResidenceMonths`를 빠뜨려
 *   (단건 `engine-input.ts`는 옮김) 다건 본문에 80이 실렸는데도 엔진은 취득일부터 센 본문 거주연수로 판정 → 단건 0원이 다건 130,350,000원.
 * 처방: 두 route가 `toEngineOneHouseExemptionProviso`(lib/api/exemption-proviso-coerce.ts) 한 leaf를 쓴다.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { runSingle, runMulti } from "./../calc/_helpers/single-multi-route-parity";

function mk(acq: string, td: string, lease: string) {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: td, isOneHousehold: true, contractTotalPrice: "500000000", householdNoPresaleRightsConfirmed: true,
    householdNoOtherHousesConfirmed: true, residencePeriodMonths: "0", provisoReason: "rental_5yr_residence",
    provisoRentalLeaseResidenceMonths: lease,
  });
  Object.assign(f.assets[0], {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: acq, actualSalePrice: "500000000",
    fixedAcquisitionPrice: "300000000", addressJibun: "테스트 1", regionCode: "4113510300",
    residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
  });
  return f;
}
function useRates(td: string) {
  vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(td)) as never);
}

describe("G2-1 다건 ⑭ — §154① 단서 1호 임차 거주 개월 도달", () => {
  it("임차 80개월(2024 분양전환 취득 → 2025-06-01 양도): 다건도 단건과 같이 비과세 0원", async () => {
    useRates("2025-06-01");
    const f = mk("2024-01-10", "2025-06-01", "80");
    const s = await runSingle(f);
    expect([s.status, s.isExempt, s.totalTax]).toEqual([200, true, 0]);
    const m = await runMulti([f]);
    expect([m.status, m.props[0]?.isExempt, m.totalTax]).toEqual([200, true, 0]);
  });

  it("연혁(2006-03-14 취득 → 2007-03-15 양도, 임차 71개월): 다건 = 단건", async () => {
    useRates("2007-03-15");
    const f = mk("2006-03-14", "2007-03-15", "71");
    const s = await runSingle(f);
    const m = await runMulti([f]);
    expect([s.status, s.isExempt, s.totalTax]).toEqual([200, true, 0]); // 기대값 고정 — 두 route가 함께 깨져도 잡는다
    expect([m.status, m.props[0]?.isExempt, m.totalTax]).toEqual([200, s.isExempt, s.totalTax]);
  });

  it("긍정 짝 — 임차 개월 칸을 비우면 단건·다건 모두 과세 130,350,000 (구별력: 값이 결론을 가른다)", async () => {
    useRates("2025-06-01");
    const f = mk("2024-01-10", "2025-06-01", "");
    const s = await runSingle(f);
    const m = await runMulti([f]);
    expect([s.status, s.totalTax]).toEqual([200, 130350000]);
    expect([m.status, m.totalTax]).toEqual([200, 130350000]);
  });

  it("임차 60개월 미만(59)이면 1호 불성립 — 다건도 단건과 같이 과세", async () => {
    useRates("2025-06-01");
    const f = mk("2024-01-10", "2025-06-01", "59");
    const s = await runSingle(f);
    const m = await runMulti([f]);
    expect(s.totalTax).toBe(130350000);
    expect(m.totalTax).toBe(s.totalTax);
  });

  it("정적 가드 — 두 route가 같은 leaf(toEngineOneHouseExemptionProviso)로 proviso를 옮긴다", () => {
    const single = readFileSync("app/api/calc/transfer/engine-input.ts", "utf8");
    const multi = readFileSync("app/api/calc/transfer/multi/route.ts", "utf8");
    expect(single).toContain("toEngineOneHouseExemptionProviso(");
    expect(multi).toContain("toEngineOneHouseExemptionProviso(");
    // 인라인 키 열거가 되살아나면 한쪽만 키를 빠뜨리는 같은 결함이 재발한다
    expect(multi).not.toMatch(/departureOnlyHouse:\s*p\.oneHouseExemptionProviso/);
    expect(single).not.toMatch(/departureOnlyHouse:\s*data\.oneHouseExemptionProviso/);
  });
});
