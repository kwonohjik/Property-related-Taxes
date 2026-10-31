/**
 * ⑫ 축 B(같은 물건 지분 분할) 가액 합 가드 anchor — 서버가 «마지막 자산이 흡수하는 편차»를 ⑧ 허용 대역 안으로 제한한다.
 *
 * 종전: ⑧(클라이언트 `transfer-tax-validate.ts`)만 지분율 합 100%±0.5%p를 막고 ⑫는 «⑧로 대체»라며 생략해, 폼을 거치지 않는 직접 호출은
 * 합 90%에서 마지막 자산이 10%p를 더 흡수하고 합 210%에서 마지막 자산 양도가액 −4억인 채 200이었다.
 * 서버 축 B는 지분율이 아니라 자산별 확정 양도가액(`fixedSalePrice`·`primaryActualSalePrice`)을 쓰므로, 기준은 총액 − Σ확정 가액이다.
 * 허용오차 = ceil(총액 × 0.5%) + 컴패니언 수 + 1 (⑧ 통과 입력을 ⑫가 막는 모순이 없도록 floor 절사 슬랙을 둔다).
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
import { allIssues, captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";

import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const land = (n: number, pct: string): AssetForm =>
  ({
    ...makeDefaultAsset(n),
    assetId: `A${n}`,
    addressJibun: `서울 강남구 테스트동 ${n}`,
    assetKind: "land",
    acquisitionArea: "300",
    transferArea: "300",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-03",
    fixedAcquisitionPrice: "300000000",
    standardPriceAtTransfer: "500000000",
    ownershipNumerator: pct,
    ownershipDenominator: "100",
    ownershipRemainderThirdParty: "",
  }) as AssetForm;

const formOf = (pcts: string[], total = "1000000000") => {
  const f = createDefaultTransferFormData() as TransferFormData;
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-04-30";
  f.contractTotalPrice = total;
  f.bundledSaleMode = "actual";
  f.assetSplitMode = "fractional";
  f.assets = pcts.map((p, k) => land(k + 1, p));
  return f;
};

const GUARD_MSG = "지분 분할 취득: 자산별 양도가액 합";

const blocked8 = (f: TransferFormData) => allIssues(f).some((i) => /지분율 합계/.test(i.message));

async function post(pcts: string[], total = "1000000000", mut?: (b: L) => void) {
  const f = formOf(pcts, total);
  const body = (await captureBody(f)) as L;
  mut?.(body);
  const r = await postTransfer(body);
  return {
    status: r.status,
    blocked8: blocked8(f),
    msg: (r.json?.error?.fieldErrors?.totalSalePrice ?? []) as string[],
    alloc: r.json?.data?.apportionment?.apportioned?.map((a: L) => a.allocatedSalePrice) as number[] | undefined,
    tax: r.json?.data?.aggregated?.totalTax as number | undefined,
  };
}

describe("⑫ 축 B — ⑧이 막는 지분율 합은 서버도 막는다", () => {
  const BLOCKED: [string, string[]][] = [
    ["3자산 합 90%", ["50", "30", "10"]],
    ["3자산 합 98%", ["50", "30", "18"]],
    ["3자산 합 99%", ["50", "30", "19"]],
    ["3자산 합 100.6%", ["50", "30", "20.6"]],
    ["3자산 합 110%", ["50", "30", "30"]],
    ["3자산 합 150%", ["50", "50", "50"]],
    ["3자산 합 210%(마지막 자산 −4억이던 시료)", ["70", "70", "70"]],
    ["2자산 합 80%", ["50", "30"]],
    ["2자산 합 120%", ["70", "50"]],
  ];
  for (const [name, pcts] of BLOCKED) {
    it(`🔑 ${name} — ⑧ 차단 · ⑫ 400(totalSalePrice에 사유)`, async () => {
      const r = await post(pcts);
      expect(r.blocked8).toBe(true);
      expect(r.status).toBe(400);
      expect(r.msg.join(" ")).toContain("지분 분할 취득");
      expect(r.alloc).toBeUndefined();
    });
  }
});

describe("⑫ 축 B — ⑧이 통과시키는 지분율 합은 서버도 통과하고 값은 종전 그대로", () => {
  const PASS: [string, string[], number[], number][] = [
    ["합 100%", ["50", "30", "20"], [500_000_000, 300_000_000, 200_000_000], 218_031_000],
    ["합 99.9%", ["50", "30", "19.9"], [500_000_000, 300_000_000, 200_000_000], 218_141_880],
    ["합 99.5%(허용 대역 끝)", ["50", "30", "19.5"], [500_000_000, 300_000_000, 200_000_000], 218_585_400],
    ["합 99.99%(33.33×3 — 2자리 반올림)", ["33.33", "33.33", "33.33"], [333_300_000, 333_300_000, 333_400_000], 218_042_088],
    ["합 100.4%", ["50", "30", "20.4"], [500_000_000, 300_000_000, 200_000_000], 217_587_480],
  ];
  for (const [name, pcts, alloc, tax] of PASS) {
    it(`${name} — ⑧ 통과 · ⑫ 200 · 양도가액·총세액 불변`, async () => {
      const r = await post(pcts);
      expect(r.blocked8).toBe(false);
      expect(r.status).toBe(200);
      expect(r.alloc).toEqual(alloc);
      expect(r.tax).toBe(tax);
    });
  }

  it("🔑 floor 절사 슬랙 — 합 99.5%·총액 7,777,777은 편차가 총액 0.5%를 1원 넘지만 ⑧ 통과 입력이라 ⑫도 통과한다", async () => {
    const r = await post(["50", "30", "19.5"], "7777777");
    expect(r.blocked8).toBe(false);
    expect(r.status).toBe(200);
  });

  it("🔑 ⑧ 통과 ⇒ ⑫ 통과 — 총액 4종 × 허용 대역 안 합 전부(⑧↔⑫ 정합)", async () => {
    const sums: string[][] = [["50", "30", "19.6"], ["50", "30", "19.9"], ["50", "30", "20"], ["50", "30", "20.4"], ["33.33", "33.33", "33.33"], ["60", "39.6"], ["60", "40.4"], ["25", "25", "25", "24.6"]];
    for (const pcts of sums)
      for (const total of ["1000000001", "100000000", "7777777", "123456789012"]) {
        const r = await post(pcts, total);
        expect(r.blocked8, `${pcts.join("+")} / ${total}`).toBe(false);
        expect(r.status, `${pcts.join("+")} / ${total}`).toBe(200);
      }
  });
});

describe("⑫ 축 B — 서버는 가액으로 판정한다(지분율 칸이 없거나 가액이 어긋난 직접 호출)", () => {
  it("🔑 컴패니언 fixedSalePrice만 절반으로 — 마지막 자산이 차이를 흡수하던 호출이 400이다", async () => {
    const r = await post(["50", "30", "20"], "1000000000", (b) => {
      b.companionAssets[0].fixedSalePrice = Math.floor(b.companionAssets[0].fixedSalePrice / 2);
    });
    expect(r.status).toBe(400);
    expect(r.msg.join(" ")).toContain("지분 분할 취득");
  });

  it("🔑 totalSalePrice만 2배로 — 마지막 자산이 12억을 받던 호출(총세액 599,428,500)이 400이다", async () => {
    const r = await post(["50", "30", "20"], "1000000000", (b) => {
      b.totalSalePrice *= 2;
    });
    expect(r.status).toBe(400);
  });

  it("지분율 칸을 지워도(합 100% 가액) 종전 그대로 200 — 서버는 지분율을 쓰지 않는다", async () => {
    const r = await post(["50", "30", "20"], "1000000000", (b) => {
      delete b.ownershipRatio;
      for (const c of b.companionAssets) delete c.ownershipRatio;
    });
    expect(r.status).toBe(200);
    expect(r.alloc).toEqual([500_000_000, 300_000_000, 200_000_000]);
  });

  it("🔑 허용오차 경계 — 총 10억·컴패니언 2명: 편차 5,000,003원은 통과, 5,000,004원은 400 (= ceil(총액×0.5%) + 컴패니언 수 + 1)", async () => {
    const cut = (deficit: number) => (b: L) => {
      b.companionAssets[1].fixedSalePrice -= deficit;
    };
    expect((await post(["50", "30", "20"], "1000000000", cut(5_000_003))).status).toBe(200);
    expect((await post(["50", "30", "20"], "1000000000", cut(5_000_004))).status).toBe(400);
  });

  it("주 자산 확정 가액이 없으면(흡수가 일어나지 않는다) 면제 — 종전 그대로 200", async () => {
    const r = await post(["50", "30", "20"], "1000000000", (b) => {
      delete b.primaryActualSalePrice;
    });
    expect(r.status).toBe(200);
  });
});

describe("⑫ 축 B 가드의 면제 조건 — 흡수가 일어나지 않거나 축 B가 아니면 종전 그대로", () => {


  it("🔑 컴패니언 확정 가액이 하나라도 없으면 면제 — 가드 문구로 막지 않는다(변동 자산이 안분을 받는 경로)", async () => {
    const r = await post(["50", "30", "20"], "1000000000", (b) => {
      delete b.companionAssets[1].fixedSalePrice;
    });
    expect(r.msg.join(" ")).not.toContain(GUARD_MSG);
  });

  it("🔑 축 B가 아닌 함께 양도(기준시가 안분) — 가액이 어긋난 값이 섞여 와도 이 가드로 막지 않는다", async () => {
    const f = formOf(["100", "100", "100"]);
    f.assetSplitMode = "companion";
    f.bundledSaleMode = "apportioned";
    const body = (await captureBody(f)) as L;
    expect(body.fractionalSplitBundle).toBe(false);
    body.primaryActualSalePrice = 1;
    for (const c of body.companionAssets) c.fixedSalePrice = 1;
    const r = await postTransfer(body);
    expect(JSON.stringify(r.json?.error?.fieldErrors ?? {})).not.toContain(GUARD_MSG);
  });
});

describe("⑫ 축 B 가드 × 부담부증여 — 양도가액을 §159가 정하므로 면제", () => {
  const BG = {
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "300000000",
    bgMortgageDebtAmount: "300000000",
    standardPriceAtTransfer: "1000000001",
    standardPriceAtAcq: "500000001",
  };
  const bgAsset = (n: number, num: string): AssetForm =>
    ({
      ...makeDefaultAsset(n),
      addressJibun: "서울 강남구 테스트동 1-1",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2009-03-01",
      ownershipNumerator: num,
      ownershipDenominator: "100",
      ...BG,
    }) as AssetForm;

  it("🔑 전 자산 부담부증여 축 B — 가드 전제(총액·확정 가액)가 갖춰져 있어도 총액이 어긋난 호출을 이 가드로 막지 않는다", async () => {
    const f = {
      transferDate: "2024-03-01",
      filingDate: "2024-05-31",
      assets: [bgAsset(1, "60"), bgAsset(2, "40")],
      houses: [],
      presaleRights: [],
      contractTotalPrice: "1000000000",
      totalTransferExpense: "0",
      householdHousingCount: "2",
      isOneHousehold: false,
    } as unknown as TransferFormData;
    const body = (await captureBody(f)) as L;
    // 전제 — 이 시료는 가드 조건 중 부담부증여 면제만 빼면 가드가 돌 수 있는 상태다
    expect(body.fractionalSplitBundle).toBe(true);
    expect(body.totalSalePrice).toBeGreaterThan(0);
    expect(body.primaryActualSalePrice).toBeDefined();
    expect(body.companionAssets.every((c: L) => c.fixedSalePrice !== undefined)).toBe(true);
    body.totalSalePrice *= 2;
    const r = await postTransfer({
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      annualBasicDeductionUsed: 0,
      ...body,
      isOneHousehold: false,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
    });
    expect(JSON.stringify(r.json?.error?.fieldErrors ?? {})).not.toContain(GUARD_MSG);
  });
});
