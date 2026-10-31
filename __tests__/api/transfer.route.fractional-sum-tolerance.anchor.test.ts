/**
 * 완전 지분 번들(축 B) 지분율 합 허용 폭 anchor — ⑧(클라이언트) · 일반건물 지분 ⑫ · 축 B 가액 합 ⑫ 가드가 같은 상수를 쓴다.
 *
 * 종전 ±0.5%p는 필요 폭(2자리 반올림 최대 0.03%p · 서버 상한 11건의 이론 최대 0.055%p)의 9배라, 합 99.5%·100.4%에서도 200이 나오고
 * 양도가액 합은 총액으로 고정된 채 취득가액만 지분율을 따라 +554,400/−443,520원이 어긋났다.
 * 계획서: `docs/02-design/features/fractional-sum-tolerance-narrowing.plan.md` Q-1 b — 0.06%p, 세 곳이 `FRACTIONAL_RATIO_SUM_TOLERANCE` 하나를 쓴다.
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
import { GB_SAMPLES, T, asset, form } from "../components/_helpers/gb-bundled-blocks-fixtures";

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

const landForm = (pcts: string[]) => {
  const f = createDefaultTransferFormData() as TransferFormData;
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-04-30";
  f.contractTotalPrice = "1000000000";
  f.bundledSaleMode = "actual";
  f.assetSplitMode = "fractional";
  f.assets = pcts.map((p, k) => land(k + 1, p));
  return f;
};

const sumMsgs = (f: TransferFormData) => allIssues(f).filter((i) => /전체 지분율 합계가 100%/.test(i.message)).map((i) => i.message);

describe("⑧ — 지분율 합 허용 폭 ±0.06%p (경계 바로 안쪽·바깥쪽)", () => {
  const PASS: [string, string[]][] = [
    ["합 100%", ["50", "30", "20"]],
    ["합 99.95%", ["50", "30", "19.95"]],
    ["합 100.05%", ["50", "30", "20.05"]],
    ["합 99.99%(33.33×3)", ["33.33", "33.33", "33.33"]],
    ["합 100.02%(16.67×6)", Array(6).fill("16.67")],
    ["합 100.03%(14.29×7 — 2자리 반올림 최대)", Array(7).fill("14.29")],
    ["합 99.99%(9.09×11 — 서버 상한 11건)", Array(11).fill("9.09")],
  ];
  for (const [name, pcts] of PASS)
    it(`${name} — 통과`, () => {
      expect(sumMsgs(landForm(pcts))).toEqual([]);
    });

  const BLOCK: [string, string[], string][] = [
    ["합 99.93%", ["50", "30", "19.93"], "99.93%"],
    ["합 100.07%", ["50", "30", "20.07"], "100.07%"],
    ["합 99.9%(33.3×3 — 1자리 입력)", ["33.3", "33.3", "33.3"], "99.90%"],
    ["합 100.2%(16.7×6 — 1자리 입력)", Array(6).fill("16.7"), "100.20%"],
    ["합 99.5%(종전 허용 대역 끝)", ["50", "30", "19.5"], "99.50%"],
    ["합 100.4%(종전 허용 대역 안)", ["50", "30", "20.4"], "100.40%"],
  ];
  for (const [name, pcts, shown] of BLOCK)
    it(`🔑 ${name} — 차단 · 문구에 현재 합 ${shown}`, () => {
      const msgs = sumMsgs(landForm(pcts));
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain(`현재 ${shown}`);
    });
});

describe("⑫ 일반건물 지분 — ⑧과 같은 허용 폭", () => {
  const INH = GB_SAMPLES.INH[0][0];
  const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };

  async function postRatios(ratios: number[]) {
    const f = form(T, [asset(1, INH, HALF), asset(2, INH, HALF)]);
    const body = JSON.parse(JSON.stringify(await captureBody(f))) as L;
    body.generalBuildingShares.forEach((s: L, i: number) => {
      s.ownershipRatio = ratios[i];
    });
    const r = await postTransfer(body);
    const keys = Object.keys(r.json?.error?.fieldErrors ?? {});
    return { status: r.status, sumBlocked: keys.includes("generalBuildingShares") };
  }

  for (const [name, ratios] of [
    ["합 100%", [0.5, 0.5]],
    ["합 99.95%", [0.5, 0.4995]],
    ["합 100.05%", [0.5, 0.5005]],
  ] as [string, number[]][])
    it(`${name} — 합계 거부 없음`, async () => {
      const r = await postRatios(ratios);
      expect(r.sumBlocked).toBe(false);
      expect(r.status).toBe(200);
    });

  for (const [name, ratios] of [
    ["합 99.93%", [0.5, 0.4993]],
    ["합 100.07%", [0.5, 0.5007]],
    ["합 99.5%(종전 허용 대역 끝)", [0.5, 0.495]],
    ["합 100.4%(종전 허용 대역 안)", [0.5, 0.504]],
  ] as [string, number[]][])
    it(`🔑 ${name} — 합계 거부(400)`, async () => {
      const r = await postRatios(ratios);
      expect(r.status).toBe(400);
      expect(r.sumBlocked).toBe(true);
    });
});
