/**
 * anchor — 부담부증여 × 토지·건물 소유자 분리(건물 종류 본인 몫) 연간 합산(/multi)이 단건과 같은 값을 낸다
 * (계획서 `docs/00-pm/bg-owner-split-159.plan.md` §7 다건 · PR-4).
 *
 * 다건 ④(`multi-transfer-property-payload.ts`)는 단건과 같은 `buildBurdenedGiftInfo`를 부르므로 본인 몫 info(`bgOwnerSplitInfoPatch`)가 같게 실린다.
 * 기대값은 하드코딩하지 않고 **단건 route 결과**로 정한다(두 route가 같은 엔진을 쓰므로 어긋나면 배관 결함) — 그리고 계획서 §9.1 수치(5,244,600)를 함께 고정한다.
 * 범위 밖(주택 등)은 단건과 같은 사유 문구로 막힌다(⑫ 400).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { bgOwnerSplitReasonMessage } from "@/lib/calc/bg-owner-split-scope";
import { runSingle, buildMultiBody, postMulti } from "./_helpers/single-multi-route-parity";
import { asset, bldg, land, formOf } from "../api/_bg-owner-split-fixtures";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Obj = Record<string, unknown>;

const A1 = bldg("200,000,000", "250,000,000");
const A2 = bldg("200,000,000", "80,000,000");
const L2 = land("1,000,000", "200", "400,000", "200");
const MKT = { bgValuationMode: "sangjeungbeop_market", bgMarketValueOwnedPart: "200,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "80,000,000" };

const formA = (o: Obj) => formOf([asset(1, o)]);

async function both(o: Obj) {
  const f = formA(o);
  const s = await runSingle(f);
  expect(s.status, JSON.stringify(s.json).slice(0, 400)).toBe(200);
  const body = await buildMultiBody([f]);
  const m = await postMulti(body);
  return { f, s, m, body };
}

describe("다건 1물건(건물 종류 본인 몫) = 단건 — 양도차익·결정세액 1원 단위 일치", () => {
  it.each([
    ["A1 건물만 · 양도 2억/취득 2.5억 → 양도차익 −28,750,000 · 세액 0", A1, -28_750_000, 0],
    ["A2 건물만 · 양도 2억/취득 8천만 → 58,800,000 · 5,244,600", A2, 58_800_000, 5_244_600],
    ["L2 토지만 · 1,000,000/㎡×200㎡ / 400,000/㎡×200㎡ → 58,800,000 · 5,244,600", L2, 58_800_000, 5_244_600],
    ["M 시가 평가(실지취득가) · 시가 2억/실지 8천만 → 60,000,000", bldg("200,000,000", "", MKT), 60_000_000, undefined],
  ] as const)("%s", async (_n, over, gain, tax) => {
    const { s, m } = await both(over as Obj);
    expect(m.status, JSON.stringify(m.json).slice(0, 400)).toBe(200);
    expect(m.props).toHaveLength(1);
    expect(s.r.transferGain).toBe(gain);
    expect(m.props[0].transferGain).toBe(s.r.transferGain);
    // 증여한 부분(selfOwns)도 단건과 같다 — 결과 화면이 이 echo로 「증여한 부분」을 읽는다
    expect((m.props[0].splitDetail as { selfOwns?: string } | undefined)?.selfOwns).toBe((s.r.splitDetail as { selfOwns?: string } | undefined)?.selfOwns);
    expect((m.props[0].splitDetail as { selfOwns?: string } | undefined)?.selfOwns).not.toBe("both");
    // 결정세액 — 다건 자산별 `refDeterminedTax`(기본공제 단독 기준 결정세액)는 단건 `determinedTax`와 1원 단위로 같고, 총 납부세액(가산세 포함)도 같다
    expect(m.props[0].refDeterminedTax).toBe(s.r.determinedTax);
    expect(m.totalTax).toBe(s.totalTax);
    if (tax !== undefined) {
      expect(s.r.determinedTax).toBe(tax);
      expect(m.props[0].refDeterminedTax).toBe(tax);
    }
  }, 60_000);

  it("자산별 §159 명세·분리 상세가 단건과 같다 — selfOwns · 비소유 파트 0 · echo 한 벌", async () => {
    const { s, m } = await both(A2 as Obj);
    const p = m.props[0] as Obj;
    expect(p.transferBurdenedGiftBreakdown).toEqual(s.r.transferBurdenedGiftBreakdown);
    const sd = p.splitDetail as { selfOwns?: string; land: { transferPrice: number }; building: { transferPrice: number } };
    expect(sd.selfOwns).toBe("building_only");
    expect(sd.land.transferPrice).toBe(0);
    expect(sd.building.transferPrice).toBe(100_000_000);
  }, 60_000);

  it("④ 다건 페이로드의 본인 몫 info·selfOwns가 단건 ④와 같다 (Network request body)", async () => {
    const { s, body } = await both(A2 as Obj);
    const prop = (body.properties as Obj[])[0];
    expect(prop.selfOwns).toBe("building_only");
    expect(prop.burdenedGiftInfo).toEqual(s.body.burdenedGiftInfo);
    expect(prop.burdenedGiftInfo).toMatchObject({ landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 200_000_000, landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 80_000_000 });
    expect(buildPropertyPayload(formA(A2 as Obj)) as Obj).toMatchObject({ selfOwns: "building_only" });
  });
});

describe("범위 밖은 다건에서도 같은 사유로 막힌다 (⑫ 400)", () => {
  /** 일반 부담부증여가 먼저 요구하는 단일 기준시가·시가 칸 — 범위 밖 시료가 selfOwns 사유까지 닿게 채운다. */
  const G = { standardPriceAtTransfer: "1,000,000,000", standardPriceAtAcq: "500,000,000", bgMarketValueAtTransfer: "1,000,000,000" };
  it.each([
    ["주택", "housing", { assetKind: "housing" }],
    ["취득원인 상속", "cause", { acquisitionCause: "inheritance", decedentAcquisitionDate: "2000-01-01" }],
    ["시가 · 감정가액", "method", { bgValuationMode: "sangjeungbeop_market", bgMarketValueOwnedPart: "200,000,000", bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionTotal: "300,000,000" }],
  ] as const)("%s → %s: 단건 400과 다건 400 모두 같은 문구", async (_n, reason, over) => {
    const f = formA({ ...A2, ...G, ...over } as Obj);
    const s = await runSingle(f);
    const m = await postMulti(await buildMultiBody([f]));
    const expected = bgOwnerSplitReasonMessage(reason);
    expect(s.status).toBe(400);
    expect(JSON.stringify(s.json)).toContain(expected);
    expect(m.status, JSON.stringify(m.json).slice(0, 300)).toBe(400);
    expect(JSON.stringify(m.json)).toContain(expected);
  }, 60_000);
});
