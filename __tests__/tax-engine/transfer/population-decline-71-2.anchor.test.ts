/**
 * 조특법 §71의2① 인구감소지역주택 — 양도세 1주택 판정에서 소유주택으로 보지 않는다 (결정 #42 · S14a-4).
 *
 * 자동화 계획서가 「종부세 축」이라며 뺐지만 ①은 소득세법 §89①3호·4호를 적용하는 양도세 규정이다. 노원 1주택 세대가 평창 인구감소지역주택(2024.3.1.
 * 취득, 기준시가 2억)을 산 뒤 노원 주택(8억)을 양도하면, 일시적 2주택(§155①)이 받쳐 주지 않는 구간에서 고지 없이 과세로 나왔다(재실측).
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | P-1~P-9 | 평가기 | 양성 · 취득기간 경계 · 양도일 선후 · 가액 한도 연혁 · 관심지역 · 동일 시·군·구(코드 개편 별칭) · 모름은 불성립 + 확인 필요 |
 * | P-10~P-13 | 평가기 | 취득 전 2채 이상 · 종전 주택 권리 유래 · 겹침 · 이중 차감 |
 * | R-* | 판정 메뉴 route | D1·D2 비과세 고정(④ 토글 무관) · 12억 초과 안분 · 모름 + 확인 필요 · 결론 무관이면 고지 없음 · 중과 15호 추종 |
 * | RS-* | 판정 메뉴 route — 입주권 양도 | §89①4호 가·나목 「다른 주택」에서도 뺀다 · 12억 초과 안분 · 모름 + 확인 필요(결론을 가를 때만) |
 * | M-* | 겸용 경로 | 겸용주택 양도에도 같은 판정 |
 * | CR-* | 계산기 — 입주권 양도 | 판정 메뉴에서 넘겨받은 같은 사실 → 같은 결론 · 명세 · 모름 경고 · ⑤ 질문 노출 |
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  resolvePopulationDecline71_2,
  POP_DECLINE_71_2_ARTICLE,
  type PopDeclineInput,
  type PopDeclineHouse,
} from "@/lib/tax-engine/transfer-reductions/population-decline-71-2";
import { SPECIAL_ACT_15HO_VERIFIED_ARTICLES } from "@/lib/tax-engine/transfer-tax-house-exclusion-step";
import { rightSaleSpecialExclusionApplies } from "@/lib/tax-engine/one-house/right-sale-special-act-exclusion";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { popDeclineRowCandidate, popDeclinePriorRightQuestionVisible } from "@/lib/calc/pop-decline-71-2-scope";
import { popDeclineQuestionAsset } from "@/lib/calc/pop-decline-71-2-scope";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { buildCaseForm, observeCase, type RulingCase } from "../../calc/one-house-rulings/harness";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../_helpers/mixed-use-identity-std";
import { makeMockRates, makeHouseInfo } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const NOWON = "1135010500";
const PYEONGCHANG = "5176025021"; // 강원 평창군 — 인구감소지역(수도권 밖)
const GANGHWA = "2871025021"; // 인천 강화군 — 인구감소지역(수도권 접경)
const GANGNEUNG = "5115010100"; // 강원 강릉시 — 인구감소관심지역
const SEOUL_JUNGGU = "1114010100";

const selling = (over: Partial<PopDeclineHouse> = {}): PopDeclineHouse => ({
  id: "selling",
  acquisitionDate: D("2023-06-01"),
  regionCode: NOWON,
  isInherited: false,
  ...over,
});
const cand = (over: Partial<PopDeclineHouse> = {}): PopDeclineHouse => ({
  id: "p",
  acquisitionDate: D("2024-03-01"),
  regionCode: PYEONGCHANG,
  acquisitionOfficialPrice: 200_000_000,
  isInherited: false,
  popDeclSoleAtAcquisition: "yes",
  popDeclAcquiredByGift: "no",
  ...over,
});
const run = (over: Partial<PopDeclineInput> = {}, c: Partial<PopDeclineHouse> = {}, s: Partial<PopDeclineHouse> = {}) =>
  resolvePopulationDecline71_2({
    houses: [selling(s), cand(c)],
    sellingHouseId: "selling",
    transferDate: D("2026-11-01"),
    presaleRights: [],
    alreadyExcludedIds: new Set(),
    otherExcludedCount: 0,
    householdHousingCount: 2,
    sellingIsHousing: true,
    ...over,
  });
const eligible = (r: ReturnType<typeof run>) => r.entries.filter((e) => e.eligible).length;
const unconfirmed = (r: ReturnType<typeof run>) => r.entries.filter((e) => !e.eligible && e.unconfirmed);

describe("P-1 양성", () => {
  it("평창 인구감소지역주택(2024-03-01 · 기준시가 2억)을 산 뒤 노원 주택을 양도 → 소유주택에서 뺀다 + 신고서 안내", () => {
    const r = run();
    expect(eligible(r)).toBe(1);
    expect(r.excludedCount).toBe(1);
    expect(r.entries[0]).toMatchObject({ article: POP_DECLINE_71_2_ARTICLE, houseId: "p", legalBasis: "조특법 §71의2①" });
    expect(r.entries[0].notice).toContain("과세특례신고서");
  });
  it("중과 13·15호 확인 조문 · 입주권 양도(4호) 「다른 주택」 제외에 들어간다 (하위 결정 가 · 법률이 4호를 직접 적는다)", () => {
    expect(SPECIAL_ACT_15HO_VERIFIED_ARTICLES.has(POP_DECLINE_71_2_ARTICLE)).toBe(true);
    expect(rightSaleSpecialExclusionApplies(POP_DECLINE_71_2_ARTICLE)).toBe(true);
  });
});

describe("P-2 취득기간 2024.1.4.~2026.12.31. (경계 ±1일)", () => {
  it.each([
    ["2024-01-03", 0],
    ["2024-01-04", 1],
    ["2026-12-31", 1],
    ["2027-01-01", 0],
  ])("취득일 %s → 적격 %i", (acq, n) => {
    const r = run({ transferDate: D("2027-06-01") }, { acquisitionDate: D(acq) });
    expect(eligible(r)).toBe(n);
    if (n === 0) expect(r.entries).toHaveLength(0); // 후보가 아니면 침묵
  });
});

describe("P-3 양도일은 취득일 뒤 — 같은 날 취득은 양도 후 취득", () => {
  it("양도일 = 취득일 → 후보 아님 / 하루 뒤 → 적격", () => {
    expect(run({ transferDate: D("2024-03-01") }).entries).toHaveLength(0);
    expect(eligible(run({ transferDate: D("2024-03-02") }))).toBe(1);
  });
});

describe("P-4 가액 한도 연혁 (취득일 기준)", () => {
  it("2025-08-14 이후 취득 수도권 밖 인구감소지역 — 9억 이하 적격 · 9억 초과 불성립(침묵)", () => {
    expect(eligible(run({}, { acquisitionDate: D("2025-08-14"), acquisitionOfficialPrice: 900_000_000 }))).toBe(1);
    expect(run({}, { acquisitionDate: D("2025-08-14"), acquisitionOfficialPrice: 900_000_001 }).entries).toHaveLength(0);
  });
  it("2025-08-13 이전 취득은 4억 단일 — 4억 이하 적격 · 4억 초과 불성립", () => {
    expect(eligible(run({}, { acquisitionDate: D("2025-08-13"), acquisitionOfficialPrice: 400_000_000 }))).toBe(1);
    expect(run({}, { acquisitionDate: D("2025-08-13"), acquisitionOfficialPrice: 400_000_001 }).entries).toHaveLength(0);
  });
  it("수도권 접경(강화) 인구감소지역은 9억 구간에서도 4억", () => {
    const c = { regionCode: GANGHWA, acquisitionDate: D("2025-09-01") };
    expect(eligible(run({}, { ...c, acquisitionOfficialPrice: 400_000_000 }))).toBe(1);
    expect(run({}, { ...c, acquisitionOfficialPrice: 400_000_001 }).entries).toHaveLength(0);
  });
  it("가액을 입력하지 않으면 한도를 판단할 수 없다 → 불성립 + 확인 필요", () => {
    const r = run({}, { acquisitionOfficialPrice: undefined });
    expect(eligible(r)).toBe(0);
    expect(unconfirmed(r)).toHaveLength(1);
    expect(unconfirmed(r)[0].reason).toContain("공시가격");
  });
});

describe("P-5 인구감소관심지역 — 법률 부칙 2025.11.28. · 시행령 2호 신설 2026.2.27.", () => {
  const ci = (acq: string) => ({ regionCode: GANGNEUNG, acquisitionDate: D(acq), acquisitionOfficialPrice: 400_000_000 });
  it("2025-11-27 취득 → 후보 아님 · 2025-11-28~2026-02-26 → 시행령 부칙 미확인이라 불성립 + 확인 필요 · 2026-02-27 → 적격", () => {
    expect(run({}, ci("2025-11-27")).entries).toHaveLength(0);
    for (const d of ["2025-11-28", "2026-02-26"]) {
      const r = run({}, ci(d));
      expect(eligible(r)).toBe(0);
      expect(unconfirmed(r)).toHaveLength(1);
    }
    expect(eligible(run({}, ci("2026-02-27")))).toBe(1);
  });
  it("관심지역은 4억 단일(수도권 밖이어도 9억이 아니다)", () => {
    expect(run({}, { ...ci("2026-03-01"), acquisitionOfficialPrice: 400_000_001 }).entries).toHaveLength(0);
  });
});

describe("P-6 동일 시·군·구 제외 (취득 전 보유 주택과)", () => {
  it("종전 주택이 같은 시·군·구에 있으면 불성립(침묵)", () => {
    expect(run({}, {}, { regionCode: PYEONGCHANG }).entries).toHaveLength(0);
  });
  it("코드 개편 별칭 — 구 코드(광주 동구 29110)와 신 코드(12210)도 같은 시·군·구로 비교한다", () => {
    // 구 코드/신 코드가 한 명부에 섞여도 같은 곳으로 본다. 후보는 전남 영암(구 46830)이 인구감소지역이다.
    const sameAsLegacy = run({}, { regionCode: "4683025021" }, { regionCode: "1280025021" });
    expect(sameAsLegacy.entries).toHaveLength(0);
  });
  it("종전 주택 주소를 입력하지 않으면 비교할 수 없다 → 불성립 + 확인 필요", () => {
    const r = run({}, {}, { regionCode: undefined });
    expect(eligible(r)).toBe(0);
    expect(unconfirmed(r)[0].reason).toContain("동일 시·군·구");
  });
});

describe("P-7 소재지 — 수도권·광역시 자치구는 후보가 아니다", () => {
  it("서울 중구 · 인구감소지역 아닌 곳 → 침묵", () => {
    expect(run({}, { regionCode: SEOUL_JUNGGU }).entries).toHaveLength(0);
  });
  it("④ 지정(isPopulationDeclineArea=false)은 자동판정을 덮는다 — 중과 ④와 같은 인자", () => {
    expect(run({}, { isPopulationDeclineArea: false }).entries).toHaveLength(0);
  });
  it("주소가 없으면 수도권·광역시 여부를 알 수 없다 → 후보(④ 지정)일 때 불성립 + 확인 필요", () => {
    const r = run({}, { regionCode: undefined, isPopulationDeclineArea: true, populationAreaType: "decline" });
    expect(eligible(r)).toBe(0);
    expect(unconfirmed(r)).toHaveLength(1);
  });
});

describe("P-8 명부에 없는 과거 사실 — 모르면 불성립 + 확인 필요", () => {
  it("취득 당시 1채만 보유: 아니오 → 침묵 · 모름·미답 → 확인 필요", () => {
    expect(run({}, { popDeclSoleAtAcquisition: "no" }).entries).toHaveLength(0);
    for (const v of ["unknown", undefined] as const) {
      const r = run({}, { popDeclSoleAtAcquisition: v });
      expect(eligible(r)).toBe(0);
      expect(unconfirmed(r)).toHaveLength(1);
    }
  });
  it("증여 취득: 예·모름·미답 → 해석 본문 확인 전 미적용 + 확인 필요", () => {
    for (const v of ["yes", "unknown", undefined] as const) {
      const r = run({}, { popDeclAcquiredByGift: v });
      expect(eligible(r)).toBe(0);
      expect(unconfirmed(r)).toHaveLength(1);
    }
  });
  it("상속 취득 → 미적용 + 확인 필요", () => {
    const r = run({}, { isInherited: true });
    expect(eligible(r)).toBe(0);
    expect(unconfirmed(r)[0].reason).toContain("상속");
  });
});

describe("P-9 취득 전 보유가 이미 둘 이상 / 권리", () => {
  it("명부에 먼저 가진 다른 주택이 있으면 불성립(질문 없이)", () => {
    const other = { id: "o", acquisitionDate: D("2020-01-01"), regionCode: "4311010100" } as PopDeclineHouse;
    const r = resolvePopulationDecline71_2({
      houses: [selling(), other, cand()],
      sellingHouseId: "selling",
      transferDate: D("2026-11-01"),
      presaleRights: [],
      alreadyExcludedIds: new Set(),
      otherExcludedCount: 0,
      householdHousingCount: 3,
      sellingIsHousing: true,
    });
    expect(r.entries).toHaveLength(0);
  });
  it("취득 전에 보유한 분양권·입주권이 있으면 불성립", () => {
    expect(run({ presaleRights: [{ acquisitionDate: D("2022-01-01"), regionCode: "4311010100" }] }).entries).toHaveLength(0);
    // 인구감소지역주택 취득 뒤에 산 권리는 세지 않는다
    expect(eligible(run({ presaleRights: [{ acquisitionDate: D("2025-01-01") }] }))).toBe(1);
  });
});

describe("P-10 종전 주택이 후보보다 늦게 기록된 경우 — 권리 유래 여부", () => {
  const later = { acquisitionDate: D("2024-06-01") };
  it("미답·모름 → 선후를 알 수 없어 불성립 + 확인 필요 · 아니오 → 침묵", () => {
    for (const v of ["unknown", undefined] as const) {
      const r = run({}, { popDeclPriorRight: v }, later);
      expect(eligible(r)).toBe(0);
      expect(unconfirmed(r)).toHaveLength(1);
    }
    expect(run({}, { popDeclPriorRight: "no" }, later).entries).toHaveLength(0);
  });
  it("권리 유래 — 권리를 가진 날이 후보 취득일보다 앞서면 적격 · 같거나 뒤면 침묵 · 날짜 없으면 확인 필요", () => {
    expect(eligible(run({}, { popDeclPriorRight: "yes", popDeclPriorRightDate: D("2024-02-29") }, later))).toBe(1);
    expect(run({}, { popDeclPriorRight: "yes", popDeclPriorRightDate: D("2024-03-01") }, later).entries).toHaveLength(0);
    expect(unconfirmed(run({}, { popDeclPriorRight: "yes" }, later))).toHaveLength(1);
  });
  it("질문 노출 술어 — 종전 주택이 같거나 늦을 때만", () => {
    expect(popDeclinePriorRightQuestionVisible({ acquisitionDate: "2024-03-01" }, "2024-03-01")).toBe(true);
    expect(popDeclinePriorRightQuestionVisible({ acquisitionDate: "2024-03-01" }, "2024-02-29")).toBe(false);
  });
});

describe("P-11 다른 특례와 겹쳐야만 비과세", () => {
  it("다른 제외가 함께 있거나 이 의제 뒤에도 2채 이상 남으면 미적용 + 확인 필요 (2026.6.11. 해석 본문 미확인)", () => {
    for (const over of [{ otherExcludedCount: 1 }, { householdHousingCount: 3 }]) {
      const r = run(over);
      expect(eligible(r)).toBe(0);
      expect(unconfirmed(r)[0].reason).toContain("겹");
    }
  });
  it("입주권 양도는 다른 주택이 0채 남아야 한다", () => {
    expect(eligible(run({ sellingIsHousing: false, householdHousingCount: 1 }))).toBe(1);
    expect(eligible(run({ sellingIsHousing: false, householdHousingCount: 2 }))).toBe(0);
  });
});

describe("P-12 이중 차감 방지 · 후보 둘", () => {
  it("다른 제외가 이미 뺀 행은 평가하지 않는다 (houseId 기준 1회)", () => {
    expect(run({ alreadyExcludedIds: new Set(["p"]) }).entries).toHaveLength(0);
  });
  it("요건을 모두 갖춘 후보가 둘이면 어느 것도 빼지 않는다", () => {
    const c2 = cand({ id: "q", acquisitionDate: D("2024-03-01"), regionCode: "5176025021" });
    const c1 = cand({ id: "p", acquisitionDate: D("2024-03-01") });
    // 같은 날 취득은 서로를 보유로 세므로 보통 침묵하지만, 평가기는 방어적으로 둘 이상이면 0을 보장한다
    const r = resolvePopulationDecline71_2({
      houses: [selling(), c1, { ...c2, acquisitionDate: D("2024-03-02") }],
      sellingHouseId: "selling",
      transferDate: D("2026-11-01"),
      presaleRights: [],
      alreadyExcludedIds: new Set(),
      otherExcludedCount: 0,
      householdHousingCount: 3,
      sellingIsHousing: true,
    });
    expect(r.excludedCount).toBe(0);
  });
});

describe("⑤ 후보 행 술어", () => {
  it("취득일 창 + 인구감소지역일 때만 묻는다", () => {
    expect(popDeclineRowCandidate({ acquisitionDate: "2024-03-01", regionCode: PYEONGCHANG })).toBe(true);
    expect(popDeclineRowCandidate({ acquisitionDate: "2024-01-03", regionCode: PYEONGCHANG })).toBe(false);
    expect(popDeclineRowCandidate({ acquisitionDate: "2024-03-01", regionCode: NOWON })).toBe(false);
    expect(popDeclineRowCandidate({ acquisitionDate: "2025-11-27", regionCode: GANGNEUNG })).toBe(false);
    expect(popDeclineRowCandidate({ acquisitionDate: "2024-03-01", regionCode: NOWON, isPopulationDeclineArea: true })).toBe(true);
  });
});

// ─── 판정 메뉴 route ────────────────────────────────────────────────────────────
const menu = (house: Record<string, unknown>, top: Record<string, unknown> = {}, asset: Record<string, unknown> = {}): RulingCase => ({
  id: "d42",
  docNo: "-",
  docDate: "-",
  basis: "current",
  today: "2026-11-02",
  summary: "인구감소지역주택",
  bucket: "match",
  form: {
    isOneHousehold: true,
    transferDate: "2026-11-01",
    contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2023-06-01", regionCode: NOWON, ...asset },
    houses: [
      {
        id: "p",
        region: "non_capital",
        regionCode: PYEONGCHANG,
        acquisitionDate: "2024-03-01",
        acquisitionOfficialPrice: "200000000",
        popDeclSoleAtAcquisition: "yes",
        popDeclAcquiredByGift: "no",
        acquisitionOrigin: "general",
        ...house,
      },
    ],
    ...top,
  } as RulingCase["form"],
});

describe("R 판정 메뉴 route", () => {
  it("R-1 D1 — 평창 인구감소지역주택을 산 뒤 노원 주택 양도(8억) → 비과세 (수정 전 과세)", async () => {
    const o = await observeCase(menu({}));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.excludedHouses).toEqual([expect.objectContaining({ houseId: "p", legalBasis: "조특법 §71의2①" })]);
    expect(o.undetermined).not.toContain("71-2-pop-decline-unconfirmed");
  });

  it("R-2 D2 — ④ 인구감소 토글·세컨드홈 등록을 켜든 끄든 같은 비과세다 (④는 중과 주택 수 전용)", async () => {
    for (const patch of [
      { isPopulationDeclineArea: true, isSecondHomeRegistered: true, populationAreaType: "decline" },
      { isPopulationDeclineArea: true, isSecondHomeRegistered: false, populationAreaType: "decline" },
    ]) {
      const o = await observeCase(menu(patch));
      expect(o.isExempt).toBe(true);
    }
  });

  it("R-3 대조군 — 인구감소지역이 아닌 곳(노원)이면 같은 사실도 과세", async () => {
    const o = await observeCase(menu({ regionCode: "1135010500", region: "capital" }));
    expect(o.isExempt).toBe(false);
  });

  it("R-4 12억 초과는 안분 과세 (전액 과세가 아니다)", async () => {
    const o = await observeCase(menu({}, { contractTotalPrice: "1500000000" }));
    expect(o.isExempt).toBe(false);
    expect(o.isPartialExempt).toBe(true);
  });

  it("R-5 모름 → 과세 + 확인 필요 · 결론을 가르지 않으면 고지 없음", async () => {
    const un = await observeCase(menu({ popDeclSoleAtAcquisition: "unknown" }));
    expect(un.isExempt).toBe(false);
    expect(un.undetermined).toContain("71-2-pop-decline-unconfirmed");
    // 짝: 양도 주택 보유 2년 미달로 어차피 과세면 모름이어도 고지하지 않는다
    const moot = await observeCase(menu({ popDeclSoleAtAcquisition: "unknown" }, { transferDate: "2024-12-01" }, { acquisitionDate: "2024-02-01" }));
    expect(moot.isExempt).toBe(false);
    expect(moot.undetermined).not.toContain("71-2-pop-decline-unconfirmed");
  });

  it("R-6 가액 미입력 → 과세 + 확인 필요 / 증여 취득 → 같다", async () => {
    for (const patch of [{ acquisitionOfficialPrice: "" }, { popDeclAcquiredByGift: "yes" }]) {
      const o = await observeCase(menu(patch));
      expect(o.isExempt).toBe(false);
      expect(o.undetermined).toContain("71-2-pop-decline-unconfirmed");
    }
  });

  it("R-7 종전 주택이 인구감소지역주택보다 늦게 기록된 사례 — 권리 유래 선언으로 비과세", async () => {
    const base = menu({ popDeclPriorRight: "yes", popDeclPriorRightDate: "2023-12-01" }, {}, { acquisitionDate: "2024-06-01" });
    const o = await observeCase(base);
    expect(o.isExempt).toBe(true);
    const no = await observeCase(menu({ popDeclPriorRight: "no" }, {}, { acquisitionDate: "2024-06-01" }));
    expect(no.isExempt).toBe(false);
  });
});

// ─── 판정 메뉴 — 입주권 양도(§89①4호) ─────────────────────────────────────────────
/**
 * 법률이 4호를 직접 적는다(「…「소득세법」 제89조제1항제3호 또는 제4호를 적용한다」) — 입주권 가·나목의 「다른 주택」에서도 뺀다.
 * 🔴 수정 전: 명부 도출 §71의2가 가·나목 복사본 제외(`oneRightInputAfterSpecialActExclusionOf`)에 들어오지 않아 노원 대조군과 같은 과세였다.
 */
const RIGHT_ASSET = {
  assetKind: "right_to_move_in",
  redevSubject: "right",
  redevExemptionEligibleAtApproval: "yes",
  acquisitionDate: "2010-03-15",
  redevApprovalDate: "2023-05-15",
  regionCode: NOWON,
};
const rightMenu = (house: Record<string, unknown> = {}, top: Record<string, unknown> = {}) =>
  menu(house, { transferDate: "2026-06-15", ...top }, RIGHT_ASSET);

describe("RS 판정 메뉴 — 입주권 양도에도 같은 의제 (결정 #42 「입주권 양도(§89①4호)에도 적용」)", () => {
  it("RS-1 평창 인구감소지역주택(2억) + 입주권 양도 8억 → 가목 비과세 · 명세에 §71의2 행 (수정 전 과세 · 제외 0건)", async () => {
    const o = await observeCase(rightMenu());
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain("one_right_89_1_4_ga");
    expect(o.excludedHouses).toEqual([expect.objectContaining({ houseId: "p", legalBasis: "조특법 §71의2①" })]);
    expect(o.undetermined).not.toContain("71-2-pop-decline-unconfirmed");
  });

  it("RS-2 대조군 — 인구감소지역이 아닌 곳(노원)이면 같은 사실도 과세 · 제외 없음", async () => {
    const o = await observeCase(rightMenu({ regionCode: NOWON, region: "capital" }));
    expect(o.isExempt).toBe(false);
    expect(o.excludedHouses).toEqual([]);
  });

  it("RS-3 12억 초과 입주권은 안분 과세 (전액 과세가 아니다)", async () => {
    const o = await observeCase(rightMenu({}, { contractTotalPrice: "1500000000" }));
    expect(o.isExempt).toBe(false);
    expect(o.isPartialExempt).toBe(true);
  });

  it("RS-4 모름 → 과세 + 확인 필요 · 명세에 제외 없음", async () => {
    const o = await observeCase(rightMenu({ popDeclSoleAtAcquisition: "unknown" }));
    expect(o.isExempt).toBe(false);
    expect(o.excludedHouses).toEqual([]);
    expect(o.undetermined).toContain("71-2-pop-decline-unconfirmed");
  });

  it("RS-5 결론을 가르지 않으면 고지 없음 — 인가일 현재 요건 미선언(어차피 과세) · 가목이 이미 성립(사실을 다 답함)", async () => {
    const moot = await observeCase(
      menu({ popDeclSoleAtAcquisition: "unknown" }, { transferDate: "2026-06-15" }, { ...RIGHT_ASSET, redevExemptionEligibleAtApproval: "no" }),
    );
    expect(moot.isExempt).toBe(false);
    expect(moot.undetermined).not.toContain("71-2-pop-decline-unconfirmed");
    expect((await observeCase(rightMenu())).undetermined).not.toContain("71-2-pop-decline-unconfirmed");
  });

  it("RS-6 모름이어도 나목(그 1주택 취득일부터 3년 이내)이 이미 성립하면 비과세 · 고지 없음", async () => {
    const o = await observeCase(
      menu({ popDeclSoleAtAcquisition: "unknown" }, { transferDate: "2026-06-15" }, { ...RIGHT_ASSET, redevOtherHouseAcquisitionDate: "2024-03-01" }),
    );
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain("one_right_89_1_4_na");
    expect(o.undetermined).not.toContain("71-2-pop-decline-unconfirmed");
  });
});

// ─── 겸용 경로 ──────────────────────────────────────────────────────────────────
describe("M 겸용주택 경로 — runHouseCountExclusionStep을 타지 않아 따로 연결한다", () => {
  const TRANSFER = D("2026-06-01");
  const PRICE = 1_000_000_000;
  const run2 = (pop: Record<string, unknown>, extra: Partial<MixedUseAssetInput> = {}) =>
    calcMixedUseTransferTax(
      PRICE,
      TRANSFER,
      {
        ...mixedUseCase14(),
        isOneHouseExempt: false,
        isOneHousehold: true,
        householdHousingCountForExclusion: 2,
        multiHouse: {
          houses: [
            makeHouseInfo("selling", { acquisitionDate: D("1997-09-12"), regionCode: NOWON }),
            makeHouseInfo("p", {
              acquisitionDate: D("2024-03-01"),
              regionCode: PYEONGCHANG,
              acquisitionOfficialPrice: 200_000_000,
              popDeclSoleAtAcquisition: "yes",
              popDeclAcquiredByGift: "no",
              ...pop,
            }),
          ],
          sellingHouseId: "selling",
          presaleRights: [],
          isOneHousehold: true,
          isRegulatedArea: false,
        },
        ...extra,
      } as MixedUseAssetInput,
      makeMockRates(),
    );
  it("M-1 인구감소지역주택을 뺀 1주택 — 주택분 12억 이하 비과세 (대조: 모름이면 종전 과세)", () => {
    const r = run2({});
    expect(r.calculationRoute.highValueRule).toBe("below_threshold_exempt");
    const un = run2({ popDeclSoleAtAcquisition: "unknown" });
    expect(un.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    expect(un.total.taxBase).toBeGreaterThan(r.total.taxBase);
  });
});

// ─── 계산기 route ───────────────────────────────────────────────────────────────
describe("C 계산기 — 같은 사실, 같은 결론 + 중과 13·15호 추종 (하위 결정 가)", () => {
  const calc = async (pop: Record<string, unknown>) => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2027-06-01";
    f.isOneHousehold = true;
    f.contractTotalPrice = "2000000000";
    f.householdNoPresaleRightsConfirmed = true;
    f.householdNoOtherHousesConfirmed = true;
    f.residencePeriodMonths = "60";
    Object.assign(f.assets[0], {
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2015-03-15",
      actualSalePrice: "2000000000",
      fixedAcquisitionPrice: "1500000000",
      addressJibun: "x",
      regionCode: "1168010100",
      residenceInputMode: "direct",
      residencePeriods: [],
      residencePeriodMonthsAsset: "60",
    });
    f.houses = [
      {
        id: "p",
        region: "non_capital",
        regionCode: PYEONGCHANG,
        acquisitionDate: "2024-03-01",
        officialPrice: "400000000",
        acquisitionOfficialPrice: "400000000",
        isInherited: false,
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        acquisitionOrigin: "general",
        ...pop,
      } as never,
    ];
    let body: Record<string, unknown> = {};
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }) as never;
    try {
      await callTransferTaxAPI(f);
    } catch {
      /* 본문만 본다 */
    } finally {
      globalThis.fetch = realFetch;
    }
    const res = await SINGLE(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    const json = (await res.json()) as {
      data: {
        result: {
          totalTax: number;
          isPartialExempt: boolean;
          warnings: string[];
          multiHouseSurchargeEvaluation?: { surchargeType: string; exclusionReasons: { type: string; detail: string }[] };
        };
      };
    };
    return { body, status: res.status, r: json.data.result };
  };

  it("C-1 사실을 답하면 12억 초과 안분 과세 + 다주택 중과 없음(15호 추종) · ④ body에 새 사실이 실린다", async () => {
    const { body, r } = await calc({ popDeclSoleAtAcquisition: "yes", popDeclAcquiredByGift: "no" });
    expect((body as { houses: Record<string, unknown>[] }).houses.find((h) => h.id === "p")).toMatchObject({
      popDeclSoleAtAcquisition: "yes",
      popDeclAcquiredByGift: "no",
    });
    expect(r).toMatchObject({ totalTax: 14_124_000, isPartialExempt: true });
    expect(r.multiHouseSurchargeEvaluation?.surchargeType).toBe("none");
    expect(r.multiHouseSurchargeEvaluation?.exclusionReasons[0].detail).toContain("조특법 §71의2①");
  });

  it("C-2 모름 → 안분 아닌 전액 과세 + 다주택 중과 + 확인 필요 경고 (수정 전과 같은 세액 299,816,000)", async () => {
    const { r } = await calc({ popDeclSoleAtAcquisition: "unknown", popDeclAcquiredByGift: "no" });
    expect(r).toMatchObject({ totalTax: 299_816_000, isPartialExempt: false });
    expect(r.multiHouseSurchargeEvaluation?.surchargeType).toBe("multi_house_2");
    expect(r.warnings.join(" ")).toContain("조특법 §71의2①");
  });
});

// ─── 계산기 — 입주권 양도(§166 분기) ──────────────────────────────────────────────
describe("CR 계산기 입주권 양도 — 판정 메뉴와 같은 사실, 같은 결론 (결정 #42 · 결정 #2 같은 함수)", () => {
  /** 판정 메뉴 폼 → 전달 → 계산기 폼. 판정 메뉴가 묻지 않는 §166 산식 입력만 채운다(`right-sale-special-exclusion-calc.anchor.test.ts`와 같다). */
  const calcFormOf = (c: RulingCase): TransferFormData => {
    const f = { ...createDefaultTransferFormData(), ...toTransferFormPatch(buildCaseForm(c)) } as TransferFormData;
    return {
      ...f,
      assets: [
        {
          ...f.assets[0],
          fixedAcquisitionPrice: "300,000,000",
          redevSubject: "right",
          redevApprovalDate: RIGHT_ASSET.redevApprovalDate,
          redevApprovalLawBasis: "urban_renovation_art_74",
          redevRightsValue: "500,000,000",
          redevSettlementDirection: "pay",
          redevSettlementAmount: "50,000,000",
          redevOriginalAssetType: "housing",
        },
      ],
    } as TransferFormData;
  };
  type R = {
    isExempt?: boolean;
    totalTax?: number;
    warnings?: string[];
    specialHouseExclusionDetail?: { entries: { article: string; houseId?: string; eligible: boolean }[] };
  };
  const calcRight = async (c: RulingCase) => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
    try {
      await callTransferTaxAPI(calcFormOf(c));
    } finally {
      vi.unstubAllGlobals();
    }
    const res = await SINGLE(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    const json = (await res.json()) as { data?: { result?: R }; error?: unknown };
    expect(res.status, JSON.stringify(json.error ?? "").slice(0, 300)).toBe(200);
    return { body, r: json.data!.result! };
  };

  it("CR-1 평창 인구감소지역주택(2억) + 입주권 양도 8억 → 비과세 0 · 명세에 §71의2 행 · ④ body에 사실이 실린다 (수정 전 과세 245,751,000)", async () => {
    const { body, r } = await calcRight(rightMenu());
    expect((body as { houses: Record<string, unknown>[] }).houses.find((h) => h.id === "p")).toMatchObject({
      popDeclSoleAtAcquisition: "yes",
      popDeclAcquiredByGift: "no",
    });
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect(r.specialHouseExclusionDetail?.entries).toEqual([
      expect.objectContaining({ article: POP_DECLINE_71_2_ARTICLE, houseId: "p", eligible: true }),
    ]);
  });

  it("CR-2 대조군 노원 → 과세 245,751,000 · 명세 없음", async () => {
    const { r } = await calcRight(rightMenu({ regionCode: NOWON, region: "capital" }));
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(245_751_000);
    expect(r.specialHouseExclusionDetail).toBeUndefined();
  });

  it("CR-3 모름 → 과세(대조군과 같은 세액) + 판정 메뉴와 같은 확인 필요 경고 · 결론을 가르지 않으면(인가일 요건 미선언) 경고 없음", async () => {
    const { r } = await calcRight(rightMenu({ popDeclSoleAtAcquisition: "unknown" }));
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(245_751_000);
    expect((r.warnings ?? []).filter((w) => w.includes("§71의2①(인구감소지역주택을 소유주택이 아닌 것으로 봄) 후보가 있으나 적용하지 않았습니다"))).toHaveLength(1);
    const moot = await calcRight(
      menu({ popDeclSoleAtAcquisition: "unknown" }, { transferDate: "2026-06-15" }, { ...RIGHT_ASSET, redevExemptionEligibleAtApproval: "no" }),
    );
    expect((moot.r.warnings ?? []).join(" ")).not.toContain("§71의2①");
  });

  it("CR-4 ⑤ 질문 노출 — 계산기는 주택·재개발 완공 아파트·조합원입주권 양도에서 연다 (분양권·토지는 닫는다)", () => {
    for (const k of ["housing", "redevelopment_apt", "right_to_move_in"]) expect(popDeclineQuestionAsset(k), k).toBe(true);
    for (const k of ["presale_right", "land", undefined]) expect(popDeclineQuestionAsset(k), String(k)).toBe(false);
  });
});
