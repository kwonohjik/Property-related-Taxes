/**
 * 조특법 §71의2① 인구감소지역주택 — 지정 연혁 축 (2026-11 리뷰 D-43·D-44 · PR-22a).
 *
 * - D-43: 행정안전부 고시 제2026-61호(2026.10.20. 시행)로 세법 대상이 바뀐 네 곳을 취득일 기준으로 반영한다.
 *   동두천(관심 → 인구감소, 수도권 접경 4억) · 통영(관심 4억 → 인구감소 9억) · 예천·칠곡(관심 신규 4억).
 *   그 전 취득분은 종전 지정(고시 제2025-78호) 그대로다 — 「취득 당시 인구감소지역에 소재할 것」(조특령 §68의2①).
 * - D-44: 가평군은 「접경지역 지원 특별법 시행령」 §2②1호에 2025.3.11. 들어왔다. 그 전에는 수도권(접경지역 제외) 소재라
 *   §68의2①1호 가목 1) 단서로 대상이 아니다. 취득·양도가 모두 편입 전이면 후보 아님, 취득 < 편입 ≤ 양도면 불성립 + 확인 필요.
 *   ④ 토글로 덮어도 같다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | C-* | 분류 | 네 지역 × 2026-10-19/10-20 · 가평 × 2025-03-10/03-11 · 기준일 미상(화면 fallback)은 현행 지정 |
 * | E-* | 평가기 | 같은 경계 · 가액 한도(동두천 4억 · 통영 4억 → 9억) · 가평 편입 전후 · 토글 무관 |
 * | S-* | 중과 12호 다·라목 | 같은 분류 leaf — 동두천 2026-10-19 취득은 대상 아님, 10-20은 대상 |
 * | R-* | 판정 메뉴 route | 춘천 + 동두천(2026-11-01) → 비과세(수정 전 과세) · 춘천 + 가평(2024-01-15) 2025-03-05 양도 → 과세(수정 전 비과세) |
 */
import { describe, it, expect } from "vitest";
import {
  resolvePopulationDecline71_2,
  POP_DECLINE_71_2_UNCONFIRMED_ID,
  type PopDeclineInput,
  type PopDeclineHouse,
} from "@/lib/tax-engine/transfer-reductions/population-decline-71-2";
import { classifyPopulationDeclineArea } from "@/lib/tax-engine/data/population-decline-areas";
import { resolvePopulationDeclineSecondHome } from "@/lib/tax-engine/multi-house-surcharge-12ho";
import { observeCase, type RulingCase } from "../../calc/one-house-rulings/harness";
import { makeHouseInfo } from "../_helpers/mock-rates";

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const NOWON = "1135010500";
const CHUNCHEON = "5111010100"; // 강원 춘천시 — 인구감소지역 아님
const DONGDUCHEON = "4125010100"; // 경기 동두천시 — 2026.10.20.부터 인구감소지역(수도권 접경)
const TONGYEONG = "4822010100"; // 경남 통영시 — 관심 → 2026.10.20.부터 인구감소지역
const YECHEON = "4790025021"; // 경북 예천군 — 2026.10.20.부터 관심지역
const CHILGOK = "4785025021"; // 경북 칠곡군 — 2026.10.20.부터 관심지역
const GAPYEONG = "4182025021"; // 경기 가평군 — 2025.3.11. 수도권 접경 편입

describe("C 분류 — 취득일 기준 지정", () => {
  it("C-1 고시 제2026-61호 경계(2026-10-19 / 10-20)", () => {
    const k = (code: string, d: string) => classifyPopulationDeclineArea(code, d).kind;
    expect([k(DONGDUCHEON, "2026-10-19"), k(DONGDUCHEON, "2026-10-20")]).toEqual([null, "decline"]);
    expect([k(TONGYEONG, "2026-10-19"), k(TONGYEONG, "2026-10-20")]).toEqual(["interest", "decline"]);
    expect([k(YECHEON, "2026-10-19"), k(YECHEON, "2026-10-20")]).toEqual([null, "interest"]);
    expect([k(CHILGOK, "2026-10-19"), k(CHILGOK, "2026-10-20")]).toEqual([null, "interest"]);
  });

  it("C-2 가평 수도권 접경 편입(2025-03-10 / 03-11)", () => {
    expect(classifyPopulationDeclineArea(GAPYEONG, D("2025-03-10")).kind).toBeNull();
    expect(classifyPopulationDeclineArea(GAPYEONG, D("2025-03-11")).kind).toBe("decline");
  });

  it("C-3 기준일 미상(화면 표시 fallback)은 현행 지정 — 동두천 인구감소 · 통영 인구감소 · 예천 관심 · 가평 인구감소", () => {
    expect(classifyPopulationDeclineArea(DONGDUCHEON, undefined).kind).toBe("decline");
    expect(classifyPopulationDeclineArea(TONGYEONG, undefined).kind).toBe("decline");
    expect(classifyPopulationDeclineArea(YECHEON, undefined).kind).toBe("interest");
    expect(classifyPopulationDeclineArea(GAPYEONG, undefined).kind).toBe("decline");
  });
});

const selling = (over: Partial<PopDeclineHouse> = {}): PopDeclineHouse => ({
  id: "selling",
  acquisitionDate: D("2023-06-01"),
  regionCode: NOWON,
  isInherited: false,
  ...over,
});
const cand = (over: Partial<PopDeclineHouse> = {}): PopDeclineHouse => ({
  id: "p",
  acquisitionDate: D("2026-10-20"),
  regionCode: DONGDUCHEON,
  acquisitionOfficialPrice: 200_000_000,
  isInherited: false,
  popDeclSoleAtAcquisition: "yes",
  popDeclAcquiredByGift: "no",
  ...over,
});
const run = (c: Partial<PopDeclineHouse> = {}, over: Partial<PopDeclineInput> = {}) =>
  resolvePopulationDecline71_2({
    houses: [selling(), cand(c)],
    sellingHouseId: "selling",
    transferDate: D("2028-01-10"),
    presaleRights: [],
    alreadyExcludedIds: new Set(),
    otherExcludedCount: 0,
    householdHousingCount: 2,
    sellingIsHousing: true,
    ...over,
  });
const eligible = (r: ReturnType<typeof run>) => r.entries.filter((e) => e.eligible).length;
const unconfirmed = (r: ReturnType<typeof run>) => r.entries.filter((e) => !e.eligible && e.unconfirmed);

describe("E 평가기 — 고시 제2026-61호", () => {
  it("E-1 동두천 — 2026-10-19 취득은 후보 아님, 10-20 취득은 적격(수도권 접경 4억 한도)", () => {
    expect(run({ acquisitionDate: D("2026-10-19") }).entries).toEqual([]);
    expect(eligible(run())).toBe(1);
    expect(eligible(run({ acquisitionOfficialPrice: 400_000_000 }))).toBe(1);
    expect(run({ acquisitionOfficialPrice: 400_000_001 }).entries).toEqual([]);
  });

  it("E-2 통영 — 10-19 취득은 관심지역 4억, 10-20 취득은 인구감소지역 9억", () => {
    const at = (acq: string, price: number) => run({ regionCode: TONGYEONG, acquisitionDate: D(acq), acquisitionOfficialPrice: price });
    expect(eligible(at("2026-10-19", 400_000_000))).toBe(1);
    expect(at("2026-10-19", 500_000_000).entries).toEqual([]);
    expect(eligible(at("2026-10-20", 500_000_000))).toBe(1);
    expect(at("2026-10-20", 900_000_001).entries).toEqual([]);
  });

  it("E-3 예천·칠곡 — 10-19 취득은 후보 아님, 10-20 취득은 관심지역 적격(4억)", () => {
    for (const code of [YECHEON, CHILGOK]) {
      expect(run({ regionCode: code, acquisitionDate: D("2026-10-19") }).entries).toEqual([]);
      expect(eligible(run({ regionCode: code }))).toBe(1);
      expect(run({ regionCode: code, acquisitionOfficialPrice: 400_000_001 }).entries).toEqual([]);
    }
  });
});

describe("E 평가기 — 가평 수도권 접경 편입(2025.3.11.)", () => {
  const gp = (acq: string, transfer: string, c: Partial<PopDeclineHouse> = {}) =>
    run({ regionCode: GAPYEONG, acquisitionDate: D(acq), ...c }, { transferDate: D(transfer) });

  it("E-4 취득·양도 모두 편입 전 — 후보 아님(④ 토글로 덮어도 같다)", () => {
    expect(gp("2024-01-15", "2025-03-05").entries).toEqual([]);
    expect(gp("2024-01-15", "2025-03-05", { isPopulationDeclineArea: true, populationAreaType: "decline" }).entries).toEqual([]);
  });

  it("E-5 취득 < 편입 ≤ 양도 — 불성립 + 확인 필요(접경지역 시행령 인용)", () => {
    const r = gp("2024-01-15", "2025-06-01");
    expect(eligible(r)).toBe(0);
    expect(unconfirmed(r)).toHaveLength(1);
    expect(unconfirmed(r)[0].reason).toMatch(/접경지역 지원 특별법 시행령 §2②/);
    expect(unconfirmed(r)[0].reason).toMatch(/2025\.3\.11\./);
  });

  it("E-6 편입일 이후 취득 — 적격", () => {
    expect(eligible(gp("2025-03-11", "2026-06-01"))).toBe(1);
  });
});

describe("S 중과 12호 다·라목 — 같은 분류 leaf", () => {
  it("S-1 동두천 2026-10-19 취득은 대상 아님, 10-20 취득은 대상", () => {
    const h = (acq: string) => makeHouseInfo("p", { regionCode: DONGDUCHEON, acquisitionDate: D(acq), officialPrice: 200_000_000 });
    expect(resolvePopulationDeclineSecondHome(h("2026-10-19"), [], [], D("2026-12-01"))).toBeNull();
    expect(resolvePopulationDeclineSecondHome(h("2026-10-20"), [], [], D("2026-12-01"))).not.toBeNull();
  });
});

// ─── 판정 메뉴 route ────────────────────────────────────────────────────────────
const menu = (house: Record<string, unknown>, transferDate: string, sellingAcq: string): RulingCase => ({
  id: "d43-44",
  docNo: "-",
  docDate: "-",
  basis: "current",
  today: transferDate,
  summary: "인구감소지역주택 지정 연혁",
  bucket: "match",
  form: {
    isOneHousehold: true,
    transferDate,
    contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: sellingAcq, regionCode: CHUNCHEON },
    houses: [
      {
        id: "p",
        region: "capital",
        acquisitionOfficialPrice: "200000000",
        popDeclSoleAtAcquisition: "yes",
        popDeclAcquiredByGift: "no",
        acquisitionOrigin: "general",
        ...house,
      },
    ],
  } as RulingCase["form"],
});

describe("R 판정 메뉴 route", () => {
  it("R-1 D-43 — 춘천(2026-01-02) + 동두천(2026-11-01, 2억), 춘천 2028-01-10 양도 → 비과세(수정 전 과세·고지 없음)", async () => {
    const o = await observeCase(menu({ regionCode: DONGDUCHEON, acquisitionDate: "2026-11-01" }, "2028-01-10", "2026-01-02"));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.excludedHouses).toEqual([expect.objectContaining({ houseId: "p", legalBasis: "조특법 §71의2①" })]);
  });

  it("R-2 D-44 — 춘천(2023-02-01) + 가평(2024-01-15, 2억), 춘천 2025-03-05 양도 → 과세(수정 전 비과세)", async () => {
    const o = await observeCase(menu({ regionCode: GAPYEONG, acquisitionDate: "2024-01-15" }, "2025-03-05", "2023-02-01"));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).not.toContain(POP_DECLINE_71_2_UNCONFIRMED_ID);
  });

  it("R-3 D-44 — 같은 세대가 편입 뒤(2025-06-02) 양도 → 과세 + 확인 필요", async () => {
    const o = await observeCase(menu({ regionCode: GAPYEONG, acquisitionDate: "2024-01-15" }, "2025-06-02", "2023-02-01"));
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).toContain(POP_DECLINE_71_2_UNCONFIRMED_ID);
  });
});
