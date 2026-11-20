/**
 * 조특법 §71의2① 인구감소지역주택 — 소재지 단서는 ④ 토글로 덮을 수 없다(2026-11 리뷰 D-50 (b)) · 관심지역 첫 고시 전 취득(D-51 · Q-20 (a)).
 *
 * 조특령 §68의2①(원문 MST 288915 실독 2026-11-20)
 * - 1호 가목 단서: 1) 수도권(「접경지역 지원 특별법」 제2조제1호에 따른 접경지역은 제외한다) 2) 광역시(광역시에 있는 군은 제외한다)
 * - 2호 가목: 「취득 당시 수도권 밖의 지역으로서 … 인구감소관심지역에 소재할 것」 · 단서 1) 광역시(광역시에 있는 군은 제외한다)
 * 소득세법 시행령 §167의3①12호 다·라목도 같은 단서다. 종전에는 단서가 데이터 집합에만 있어 ④ 「인구감소지역 소재」 토글을
 * 켜면 부산 동구(행정안전부 지정 인구감소지역 · 광역시 자치구)·서울 중구에서도 성립했다.
 *
 * 관심지역은 첫 지정 고시(행정안전부 고시 제2025-78호)가 2026.1.1. 시행이다. 법률 부칙 제14조(2025.11.28. 이후 취득분)와
 * 그 사이 취득분은 「취득 당시 … 소재할 것」과 갈리고 해석이 없어 미적용 + 확인 필요다(Q-20 (a)).
 */
import { describe, it, expect } from "vitest";
import {
  resolvePopulationDecline71_2,
  POP_DECLINE_71_2_UNCONFIRMED_ID,
  type PopDeclineInput,
  type PopDeclineHouse,
} from "@/lib/tax-engine/transfer-reductions/population-decline-71-2";
import { populationDeclineLocationExcluded } from "@/lib/tax-engine/data/population-decline-areas";
import { resolvePopulationDeclineSecondHome } from "@/lib/tax-engine/multi-house-surcharge-12ho";
import { observeCase, type RulingCase } from "../../calc/one-house-rulings/harness";
import { makeHouseInfo } from "../_helpers/mock-rates";

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const NOWON = "1135010500";
const BUSAN_DONGGU = "2617010100"; // 부산 동구 — 행정안전부 지정 인구감소지역(광역시 자치구)
const SEOUL_JUNGGU = "1114010100"; // 서울 중구 — 수도권 비접경
const DAEGU_GUNWI = "2772025021"; // 대구 군위군 — 광역시의 군
const GANGHWA = "2871025021"; // 인천 강화군 — 수도권 접경(§2①)
const GAPYEONG = "4182025021"; // 경기 가평군 — 2025.3.11. 접경 편입
const POCHEON = "4165025021"; // 경기 포천시 — 수도권(관심지역은 수도권 밖만)
const GANGNEUNG = "5115010100"; // 강원 강릉시 — 관심지역
const PYEONGCHANG = "5176025021"; // 강원 평창군 — 인구감소지역

describe("L 소재지 단서 leaf", () => {
  it("L-1 광역시 자치구는 빼고 광역시의 군은 남긴다", () => {
    expect(populationDeclineLocationExcluded(BUSAN_DONGGU, "decline", "2026-01-01")).toBe("metro_district");
    expect(populationDeclineLocationExcluded(BUSAN_DONGGU, "interest", "2026-01-01")).toBe("metro_district");
    expect(populationDeclineLocationExcluded(DAEGU_GUNWI, "decline", "2026-01-01")).toBeNull();
  });

  it("L-2 수도권 — 인구감소지역은 접경지역만 남기고, 관심지역은 모두 뺀다", () => {
    expect(populationDeclineLocationExcluded(SEOUL_JUNGGU, "decline", "2026-01-01")).toBe("capital");
    expect(populationDeclineLocationExcluded(GANGHWA, "decline", "2026-01-01")).toBeNull();
    expect(populationDeclineLocationExcluded(GANGHWA, "interest", "2026-01-01")).toBe("capital");
    expect(populationDeclineLocationExcluded(POCHEON, "interest", "2026-01-01")).toBe("capital");
  });

  it("L-3 가평 접경 편입일(2025-03-11) 전에는 수도권 비접경", () => {
    expect(populationDeclineLocationExcluded(GAPYEONG, "decline", "2025-03-10")).toBe("capital");
    expect(populationDeclineLocationExcluded(GAPYEONG, "decline", "2025-03-11")).toBeNull();
  });

  it("L-4 수도권 밖·광역시 밖은 빼지 않는다", () => {
    expect(populationDeclineLocationExcluded(PYEONGCHANG, "decline", "2026-01-01")).toBeNull();
    expect(populationDeclineLocationExcluded(GANGNEUNG, "interest", "2026-01-01")).toBeNull();
    expect(populationDeclineLocationExcluded(undefined, "decline", "2026-01-01")).toBeNull();
  });
});

const selling = (): PopDeclineHouse => ({ id: "selling", acquisitionDate: D("2023-06-01"), regionCode: NOWON, isInherited: false });
const cand = (over: Partial<PopDeclineHouse>): PopDeclineHouse => ({
  id: "p",
  acquisitionDate: D("2026-03-01"),
  acquisitionOfficialPrice: 200_000_000,
  isInherited: false,
  popDeclSoleAtAcquisition: "yes",
  popDeclAcquiredByGift: "no",
  ...over,
});
const run = (c: Partial<PopDeclineHouse>, over: Partial<PopDeclineInput> = {}) =>
  resolvePopulationDecline71_2({
    houses: [selling(), cand(c)],
    sellingHouseId: "selling",
    transferDate: D("2026-11-01"),
    presaleRights: [],
    alreadyExcludedIds: new Set(),
    otherExcludedCount: 0,
    householdHousingCount: 2,
    sellingIsHousing: true,
    ...over,
  });
const ON = { isPopulationDeclineArea: true, populationAreaType: "decline" as const };

describe("E 평가기 — ④ 토글로 단서를 덮을 수 없다", () => {
  it("E-1 부산 동구·서울 중구에 토글 ON + 인구감소지역 → 후보 아님", () => {
    expect(run({ regionCode: BUSAN_DONGGU, ...ON }).entries).toEqual([]);
    expect(run({ regionCode: SEOUL_JUNGGU, ...ON }).entries).toEqual([]);
  });

  it("E-2 대조 — 평창(수도권 밖)·강화(수도권 접경)는 적격", () => {
    expect(run({ regionCode: PYEONGCHANG }).entries.filter((e) => e.eligible)).toHaveLength(1);
    expect(run({ regionCode: GANGHWA }).entries.filter((e) => e.eligible)).toHaveLength(1);
  });
});

describe("S 중과 12호 다·라목 — 같은 leaf", () => {
  it("S-1 부산 동구 토글 ON 세컨드홈은 대상 아님 · 평창은 대상", () => {
    const h = (regionCode: string, over = {}) =>
      makeHouseInfo("p", { regionCode, acquisitionDate: D("2026-03-01"), officialPrice: 200_000_000, region: "non_capital", ...over });
    expect(resolvePopulationDeclineSecondHome(h(BUSAN_DONGGU, ON), [], [], D("2026-11-01"))).toBeNull();
    expect(resolvePopulationDeclineSecondHome(h(PYEONGCHANG), [], [], D("2026-11-01"))).not.toBeNull();
  });
});

// ─── 판정 메뉴 route ────────────────────────────────────────────────────────────
const menu = (house: Record<string, unknown>): RulingCase => ({
  id: "d50-51",
  docNo: "-",
  docDate: "-",
  basis: "current",
  today: "2027-06-03",
  summary: "인구감소지역주택 소재지 단서",
  bucket: "match",
  form: {
    isOneHousehold: true,
    // 종전 주택 2025-06-01 취득 → 신규 취득이 1년 안이라 §155① 일시적 2주택이 받쳐 주지 않는다 — §71의2만 결론을 가른다.
    transferDate: "2027-06-02",
    contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2025-06-01", regionCode: NOWON },
    houses: [
      {
        id: "p",
        acquisitionDate: "2026-03-01",
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
  it("R-1 D-50 (b) — 부산 동구 주택에 「인구감소지역 소재」 토글 ON → 과세(수정 전 비과세)", async () => {
    const o = await observeCase(menu({ region: "non_capital", regionCode: BUSAN_DONGGU, ...ON }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
  });

  it("R-2 D-51 — 강릉(관심지역) 2025-12-10 취득 → 과세 + 확인 필요 · 2026-01-05 취득 → 비과세", async () => {
    const before = await observeCase(menu({ region: "non_capital", regionCode: GANGNEUNG, acquisitionDate: "2025-12-10" }));
    expect(before.isExempt).toBe(false);
    expect(before.undetermined).toContain(POP_DECLINE_71_2_UNCONFIRMED_ID);
    const after = await observeCase(menu({ region: "non_capital", regionCode: GANGNEUNG, acquisitionDate: "2026-01-05" }));
    expect(after.isExempt).toBe(true);
  });
});
