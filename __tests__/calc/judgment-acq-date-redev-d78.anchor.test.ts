/**
 * D-78 anchor — 판정 메뉴 「취득일」에 무엇을 넣느냐가 주택 출자 원조합원의 결론을 가른다(엔진 불변 · 안내 정정의 근거).
 *
 * 시료 — 강남(1168010100) 주택을 2015-03-01에 취득해 출자한 원조합원. 인가 2018-01-01 · 준공 2021-06-01 · 신축 거주 12개월 ·
 * 2025-03-04 10억 양도 · 다른 주택 없음.
 * - 종전 안내(「재개발로 받은 신축주택이면 사용승인일」)대로 2021-06-01을 넣으면 「취득 당시 조정대상지역」이라 거주 2년 요건이 걸려 과세다.
 * - 새 안내(주택 출자 원조합원 = 헐기 전 종전주택 취득일)대로 2015-03-01을 넣으면 강남 지정(2017.8.3.) 전 취득이라 거주요건이 없어
 *   비과세다. 계산기 원조합원 완공APT 경로(엔진 정본 `redevAptJudgmentAcquisitionDate`)도 같은 사실을 비과세로 계산한다.
 * - 대조: 종전 주택을 2017-09-01(지정 뒤)에 취득했으면 어느 쪽이든 과세다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return { ...actual, shouldBypassRateLimit: vi.fn().mockReturnValue(true) };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";
import { runCalc, redevAptForm } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const GANGNAM = "1168010100";

function menu(acquisitionDate: string): RulingCase {
  return {
    id: "d78", docNo: "-", docDate: "-", basis: "current", today: "2025-03-04", summary: "d78", bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2025-03-04",
      contractTotalPrice: "1000000000",
      asset: { assetKind: "housing", acquisitionDate, regionCode: GANGNAM, residenceInputMode: "direct", residencePeriodMonthsAsset: "12" },
    } as RulingCase["form"],
  };
}

function calcOriginalMember(existingAcq: string) {
  return redevAptForm({
    kind: "redevelopment_apt",
    price: "1000000000",
    assetOver: {
      acquisitionDate: existingAcq,
      regionCode: GANGNAM,
      redevApprovalDate: "2018-01-01",
      redevCompletionDate: "2021-06-01",
      residencePeriods: [{ moveInDate: "2024-03-01", moveOutDate: "2025-03-01" }],
    },
    formOver: { transferDate: "2025-03-04", filingDate: "2025-05-31", residencePeriodMonths: "12" } as never,
  });
}

describe("D-78 판정 메뉴 취득일 — 주택 출자 원조합원", () => {
  it("헐기 전 종전주택 취득일(2015-03-01) — 비과세", async () => {
    const o = await observeCase(menu("2015-03-01"));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
  });

  it("사용승인일(2021-06-01, 종전 안내) — 거주요건이 걸려 과세", async () => {
    const o = await observeCase(menu("2021-06-01"));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
  });

  it("대조 — 종전 주택을 지정 뒤(2017-09-01)에 취득했으면 과세", async () => {
    expect((await observeCase(menu("2017-09-01"))).isExempt).toBe(false);
  });

  it("계산기 원조합원 완공APT(정본 경로)도 종전주택 취득일 기준 — 판정 메뉴 2015-03-01과 같은 결론", async () => {
    const [early, late] = [await runCalc(calcOriginalMember("2015-03-01")), await runCalc(calcOriginalMember("2017-09-01"))];
    expect(early.status).toBe(200);
    expect(early.result.isExempt).toBe(true);
    expect(late.result.isExempt).toBe(false);
  });
});
