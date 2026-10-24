/**
 * anchor — «환산 개별주택가격 계산해 채우기» (PHD × 비환산 PR-2, 계획서 §9.2)
 *
 * 비환산(실거래가·감정가액·매매사례가액) 주택의 «취득시 기준시가» 칸에 소득세법 시행령 §164⑦ 산식 결과(환산 개별주택가격)를 채우는 계산 보조.
 *   F1 버튼 결과 = 엔진 §164⑦ 값 (독립 BigInt 산식 · 환산 경로 route echo 와 일치)
 *   F2 대표 셀: 환산 개별주택가격 93,567,251 → 개산공제 2,807,017 → 총세액 185,101,438 (계획서 :108)
 *   F3 보이는 조건 격자 (방식 8 × 종류 × 취득일 경계 × 겸용·이월과세·취득원인)
 *   F4 ④ 본문 불변 — 보조 입력(phd* 칸)은 전송되지 않는다 · 버튼 전후 차이는 standardPriceAtAcquisition 하나뿐
 *   F5 ⑧ 불변 — 보조 입력은 ⑧ 이슈를 바꾸지 않는다
 *   F6 막힘 — 칸 부족·최초 고시일 이후·합계 동일(§164⑧ 준용)은 값을 만들지 않는다(0 대입 금지)
 */
import { describe, it, expect, vi } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }), shouldBypassRateLimit: vi.fn().mockReturnValue(true) };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { computeConvertedHousingPrice, phdFillAssistVisible } from "@/lib/calc/phd-converted-housing-price";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import {
  PHD_ELEVEN,
  PHD_METHODS,
  PHD_TRANSFER_DATE,
  allPhdIssues,
  captureSingleBody,
  phdForm,
  phdMethodIsEstimated,
  runPhdCell,
} from "./_phd-non-estimated-fixture";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const M = Object.fromEntries(PHD_METHODS) as Record<string, Partial<AssetForm>>;
const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2003-01-10", ...over }) as AssetForm;
/** 보조 입력 6칸(phd* — 양도시 제외) — 대표 셀. 토지 면적(acquisitionArea, ① 기본정보)은 보조 입력이 아니다 — ④ 가 항상 싣는다. */
const SIX: Partial<AssetForm> = {
  phdFirstDisclosureDate: PHD_ELEVEN.phdFirstDisclosureDate,
  phdFirstDisclosureHousingPrice: PHD_ELEVEN.phdFirstDisclosureHousingPrice,
  phdLandPricePerSqmAtAcq: PHD_ELEVEN.phdLandPricePerSqmAtAcq,
  phdBuildingStdPriceAtAcq: PHD_ELEVEN.phdBuildingStdPriceAtAcq,
  phdLandPricePerSqmAtFirst: PHD_ELEVEN.phdLandPricePerSqmAtFirst,
  phdBuildingStdPriceAtFirst: PHD_ELEVEN.phdBuildingStdPriceAtFirst,
};
const SEVEN: Partial<AssetForm> = { ...SIX, acquisitionArea: "100" };
/** 독립 산식 — floor(P_F × (토지 ㎡당 × 면적 + 건물)acq ÷ (…)first), BigInt (엔진 코드와 독립) */
const indep = (pf: bigint, la: bigint, ba: bigint, lf: bigint, bf: bigint, area: bigint) => Number((pf * (la * area + ba)) / (lf * area + bf));

describe("F1·F2 버튼 결과 = 엔진 §164⑦ 값", () => {
  it("대표 셀: 환산 개별주택가격 93,567,251 (독립 BigInt 산식과 일치)", () => {
    const r = computeConvertedHousingPrice(asset(SEVEN), PHD_TRANSFER_DATE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(93_567_251);
    expect(r.value).toBe(indep(100_000_000n, 1_000_000n, 60_000_000n, 1_100_000n, 61_000_000n, 100n));
    expect(r.sumAtAcquisition).toBe(160_000_000);
    expect(r.sumAtFirstDisclosure).toBe(171_000_000);
  });

  it("환산 경로(PHD 11칸) route 가 돌려주는 estimatedHousingPriceAtAcquisition 과 같다 — 같은 입력의 두 경로", async () => {
    const est = await runPhdCell("single", "est", phdForm({ ...M.est, usePreHousingDisclosure: true, ...PHD_ELEVEN }));
    expect(est.status, est.fieldErrors).toBe(200);
    const m = /"estimatedHousingPriceAtAcquisition":(\d+)/.exec(JSON.stringify(est.json));
    expect(m, "환산 경로 응답에 echo 가 있어야 한다").not.toBeNull();
    const r = computeConvertedHousingPrice(asset({ ...M.est, ...PHD_ELEVEN }), PHD_TRANSFER_DATE);
    expect(r.ok && r.value).toBe(Number(m![1]));
  });

  it("다른 입력 격자(면적 소수·큰 금액)에서도 독립 BigInt 산식과 일치", () => {
    const cases = [
      { pf: "250000000", la: "3300000", ba: "45000000", lf: "3800000", bf: "47000000", area: "87" },
      { pf: "1900000000", la: "12000000", ba: "310000000", lf: "13500000", bf: "322000000", area: "212" },
      { pf: "73000001", la: "999999", ba: "12345679", lf: "1111111", bf: "12345680", area: "55" },
    ];
    for (const c of cases) {
      const r = computeConvertedHousingPrice(
        asset({ phdFirstDisclosureDate: "2005-04-30", phdFirstDisclosureHousingPrice: c.pf, phdLandPricePerSqmAtAcq: c.la, phdBuildingStdPriceAtAcq: c.ba, phdLandPricePerSqmAtFirst: c.lf, phdBuildingStdPriceAtFirst: c.bf, acquisitionArea: c.area }),
        PHD_TRANSFER_DATE,
      );
      expect(r.ok, JSON.stringify(c)).toBe(true);
      if (r.ok) expect(r.value).toBe(indep(BigInt(c.pf), BigInt(c.la), BigInt(c.ba), BigInt(c.lf), BigInt(c.bf), BigInt(c.area)));
    }
  });

  it("F2 대표 셀: 감정 3억 + 취득시 기준시가 = 버튼 값 → 개산공제 2,807,017 · 총세액 185,101,438 (계획서 §4 (가) 행)", async () => {
    const r = computeConvertedHousingPrice(asset(SEVEN), PHD_TRANSFER_DATE);
    if (!r.ok) throw new Error("not ok");
    const row = await runPhdCell("single", "fill", phdForm({ ...M.app, usePreHousingDisclosure: true, ...PHD_ELEVEN, standardPriceAtAcq: String(r.value) }));
    expect(row.issues, row.issueMsgs.join("|")).toBe(0);
    expect(row.status, row.fieldErrors).toBe(200);
    expect(row.estDed).toBe(2_807_017); // floor(93,567,251 × 3%) — 채운 값 × 3%
    expect(row.totalTax).toBe(185_101_438);
    expect(row.phdKey).toBe(false); // 보조 입력은 전송되지 않는다
  });
});

describe("F3 보이는 조건 격자", () => {
  const dates: [string, boolean][] = [["2003-01-10", true], ["2005-04-28", true], ["2005-04-29", false], ["2005-04-30", false], ["2010-01-10", false], ["", false]];
  it.each(PHD_METHODS)("방식 %s × 취득일 경계 — 환산이면 숨김(PHD 토글이 대신) · 비환산이면 취득일 < 2005-04-29 에서만", (id, mo) => {
    for (const [d, before] of dates) {
      const want = !phdMethodIsEstimated(id) && before;
      expect(phdFillAssistVisible(asset({ ...mo, acquisitionDate: d })), `${id} ${d}`).toBe(want);
    }
  });

  it("자산 종류·취득원인·겸용·이월과세·토지 원인 혼합 — 범위 밖은 숨김, 같은 시료의 긍정 짝은 보임", () => {
    const base = { ...M.app };
    expect(phdFillAssistVisible(asset(base))).toBe(true); // 긍정 짝
    for (const kind of ["land", "building", "commercial_building", "general_building", "redevelopment_apt"] as const)
      expect(phdFillAssistVisible(asset({ ...base, assetKind: kind })), kind).toBe(false);
    for (const cause of ["inheritance", "gift", "newConstruction", "burdened_gift", "carryover_gift"] as const)
      expect(phdFillAssistVisible(asset({ ...base, acquisitionCause: cause })), cause).toBe(false);
    expect(phdFillAssistVisible(asset({ ...base, isMixedUseHouse: true }))).toBe(false);
    expect(phdFillAssistVisible(asset({ ...base, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2001-05-01", landAcquisitionCause: "inheritance", landCauseHost: "purchase" } as Partial<AssetForm>))).toBe(false);
    // 긍정 짝 — 같은 분리 입력이라도 토지 원인이 없으면(원인 미지정) 보인다
    expect(phdFillAssistVisible(asset({ ...base, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2001-05-01" }))).toBe(true);
  });

  it("PHD 플래그(usePreHousingDisclosure) 값과 무관 — 자동 ON 잔재든 OFF 든 같다(보조는 플래그를 읽지 않는다)", () => {
    for (const f of [true, false]) expect(phdFillAssistVisible(asset({ ...M.sales, usePreHousingDisclosure: f }))).toBe(true);
  });
});

describe("F4 ④ 본문 — 보조 입력은 전송되지 않는다", () => {
  const std = "93567251";
  for (const m of ["actual", "app", "sales"] as const) {
    it(`${m}: 보조 6칸(phd*)을 채운 폼과 비운 폼의 ④ 본문이 바이트 동일 (PHD 플래그 ON/OFF 모두)`, async () => {
      for (const flag of [true, false]) {
        const base = { ...M[m], usePreHousingDisclosure: flag, standardPriceAtAcq: std };
        const filled = await captureSingleBody(phdForm({ ...base, ...SIX, acquisitionArea: "100" }));
        const blank = await captureSingleBody(phdForm({ ...base, acquisitionArea: "100" }));
        expect(JSON.stringify(filled)).toBe(JSON.stringify(blank));
        expect(filled.preHousingDisclosure).toBeUndefined();
      }
    });
  }

  it("버튼 사용 전후(감정): 본문 차이는 standardPriceAtAcquisition 하나뿐 — 나머지 키·값은 바이트 동일", async () => {
    const before = await captureSingleBody(phdForm({ ...M.app, usePreHousingDisclosure: true, ...SEVEN, standardPriceAtAcq: "200000000" }));
    const after = await captureSingleBody(phdForm({ ...M.app, usePreHousingDisclosure: true, ...SEVEN, standardPriceAtAcq: "93567251" }));
    const flat = (o: unknown, p = ""): Record<string, unknown> =>
      o && typeof o === "object" ? Object.entries(o as object).reduce((a, [k, v]) => ({ ...a, ...flat(v, `${p}.${k}`) }), {}) : { [p]: o };
    const b = flat(before), a = flat(after);
    const diff = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
    expect(diff).toEqual([".standardPriceAtAcquisition"]);
    expect(a[".standardPriceAtAcquisition"]).toBe(93_567_251);
  });
});

describe("F5 ⑧ 불변 — 보조 입력이 이슈를 바꾸지 않는다", () => {
  it.each(["actual", "app", "sales"] as const)("%s: 보조 6칸 유무와 ⑧ 이슈 전 단계가 같다 (기준시가 있음/없음)", (m) => {
    for (const std of ["93567251", ""]) {
      for (const flag of [true, false]) {
        const base = { ...M[m], usePreHousingDisclosure: flag, standardPriceAtAcq: std };
        const withSeven = allPhdIssues(phdForm({ ...base, ...SIX, acquisitionArea: "100" }));
        const without = allPhdIssues(phdForm({ ...base, acquisitionArea: "100" }));
        expect(withSeven).toEqual(without);
      }
    }
  });
});

describe("F6 막힘 — 값을 만들지 않는다 (자동 안분·0 대입 금지)", () => {
  it("빈 폼 → 채울 칸 7개를 지목한다", () => {
    const r = computeConvertedHousingPrice(asset(), PHD_TRANSFER_DATE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(["최초 고시일", "최초 고시 주택가격", "토지 면적(① 기본정보)", "취득시 토지 단위 공시지가", "취득시 건물 기준시가", "최초공시일 토지 단위 공시지가", "최초공시일 건물 기준시가"]);
  });

  it("칸 하나만 비어도 막힌다 — 7칸 각각 단독 제거", () => {
    for (const k of Object.keys(SEVEN) as (keyof AssetForm)[]) {
      const r = computeConvertedHousingPrice(asset({ ...SEVEN, [k]: "" }), PHD_TRANSFER_DATE);
      expect(r.ok, String(k)).toBe(false);
    }
  });

  it("취득일 ≥ 최초 고시일 → not_eligible (isPhdEligible 단일 소스)", () => {
    const r = computeConvertedHousingPrice(asset({ ...SEVEN, acquisitionDate: "2005-04-30" }), PHD_TRANSFER_DATE);
    expect(r).toEqual({ ok: false, missing: [], blocked: "not_eligible" });
  });

  it("취득 당시·최초 고시 당시 합계가 같고 취득연도 다음 연도 말 이전 최초 고시 → same_sum (§164⑧ 준용 대상 — ⑧ 이 환산에서 차단하는 조건과 같다)", () => {
    const eq = { ...SEVEN, acquisitionDate: "2004-12-01", phdLandPricePerSqmAtFirst: SEVEN.phdLandPricePerSqmAtAcq, phdBuildingStdPriceAtFirst: SEVEN.phdBuildingStdPriceAtAcq };
    expect(computeConvertedHousingPrice(asset(eq), PHD_TRANSFER_DATE)).toEqual({ ok: false, missing: [], blocked: "same_sum" });
    // 긍정 짝 — 합계가 다르면 값이 나온다
    expect(computeConvertedHousingPrice(asset({ ...eq, phdBuildingStdPriceAtFirst: "61000000" }), PHD_TRANSFER_DATE).ok).toBe(true);
  });

  it("1990.8.30. 이전 취득 주택 — 취득시 토지 단가가 비어도 §164④ 등급가액 환산 fallback 이 없으면 막힌다(④·⑧과 같은 파생 함수)", () => {
    const r = computeConvertedHousingPrice(asset({ ...SEVEN, acquisitionDate: "1988-05-01", phdLandPricePerSqmAtAcq: "" }), PHD_TRANSFER_DATE);
    expect(r.ok).toBe(false);
  });
});
