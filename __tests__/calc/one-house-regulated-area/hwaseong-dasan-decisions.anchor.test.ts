/**
 * 1세대1주택 코드 리뷰 결정 #3(화성 시 전역 2020.6.19.~2022.11.13.)·#4(다산동 누락 보정 + 별내동 질문 철회) anchor.
 *
 * 경로: 데이터 leaf · 판정 메뉴(④ → ⑫ → ⑭) · 계산기(④ callTransferTaxAPI → ⑫ → ⑭) · 다주택 중과 엔진.
 * 세액은 `loadFallbackTransferRates(2026-06-01)` 세율 기준이다 — 같은 양도가·취득가의 강남(취득 당시 조정, 거주 0) 대조군과 같다.
 *
 * 전 기대값: 비과세(0) → 과세는 결정 문서의 「판정·세액 방향」(비과세→과세, 세액 증가)과 같은 방향이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  designatedDistrictsForCode,
  governingDesignationStart,
  isRegulatedByBjdCode,
  toRegulatedAreaHistory,
} from "@/lib/tax-engine/data/regulated-areas";
import { determineMultiHouseSurcharge, type MultiHouseSurchargeInput } from "@/lib/tax-engine/multi-house-surcharge";
import { hwaseongSurchargeWindowNotice, hwaseongTemporaryTwoHouseWindowNotice, HWASEONG_WINDOW_NOTICE_ID } from "@/lib/tax-engine/one-house/hwaseong-announcement-window";
import { NextRequest } from "next/server";
import { POST as regulatedAreaPOST } from "@/app/api/address/regulated-area/route";
import { runCalc } from "../_one-house-pr3a-calc-route";
import { mkCase, observeRaw } from "../_one-house-pr3a-judge-route";
import { judge } from "./_helpers";
import { defaultRules, suspensionNone, makeHouse, makeInput } from "../../tax-engine/_helpers/multi-house-mock";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date("2026-06-01")) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const HYOHAENG = "4159325021"; // 화성시 효행구 — 2020.6.19.~2022.11.13. 시 전역 지정
const NEUNGDONG = "4159710100"; // 화성시 동탄구 능동 — 동탄2 밖
const SANCHEOK = "4159711000"; // 화성시 동탄구 산척동 — 동탄2(2017.8.3.부터 지정)
const BANSONG = "4159710200"; // 화성시 동탄구 반송동 — 동탄1 지구 99.8%(동탄2 지구 한정 지정 때는 동탄2 안·밖을 선언받는다)
const NAMYANG = "4159125600"; // 화성시 만세구 남양읍
const SEOSIN = "4159133000"; // 화성시 만세구 서신면 — 2022.7.5. 해제
const DASAN = "4136011200"; // 남양주시 다산동 — 2019.11.8.~2020.6.18. 지정
const SUSEOK = "4136010800"; // 남양주시 수석동 — 고시에 이름 없음
const JIGEUM = "4136010900"; // 남양주시 지금동 — 「다산동」 범위 미확인(질문 유지)
const BYEOLLAE = "4136011100"; // 남양주시 별내동 — 어느 독법으로도 동 전체 지정
const GANGNAM = "1168010100";

function cform(regionCode: string, acq: string, transfer: string, price = "900000000", residence = "0") {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: transfer,
    isOneHousehold: true,
    contractTotalPrice: price,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
  });
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: acq,
    actualSalePrice: price,
    fixedAcquisitionPrice: "500000000",
    addressJibun: "테스트",
    regionCode,
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: residence,
  });
  return f;
}

const TAX_9EOK = 135_806_000; // 양도 9억·취득 5억·보유 4년+·거주 0 — 강남(취득 당시 조정) 기준
const TAX_9EOK_DASAN = 132_286_000; // 같은 조건, 2020-01-15 취득(보유 4년+ 장특 공제 차이)

describe("#3 화성시 전역 지정 — 데이터 leaf 경계", () => {
  it("효행구 — 2020-06-18 미지정 · 2020-06-19 지정(고시 문구 2020-06-19) · 2022-11-13 지정 · 2022-11-14 미지정", () => {
    expect(isRegulatedByBjdCode(HYOHAENG, "2020-06-18").isRegulated).toBe(false);
    const start = isRegulatedByBjdCode(HYOHAENG, "2020-06-19");
    expect(start.isRegulated).toBe(true);
    expect(start.basis).toContain("2020-06-19 고시");
    expect(isRegulatedByBjdCode(HYOHAENG, "2022-11-13").isRegulated).toBe(true);
    expect(isRegulatedByBjdCode(HYOHAENG, "2022-11-14").isRegulated).toBe(false);
  });

  it("서신면 — 2022-07-04까지 지정 · 2022-07-05부터 제외(현행 41591330 · 구 41590350), 같은 구 남양읍은 2022-11-13까지 지정", () => {
    expect(isRegulatedByBjdCode(SEOSIN, "2022-07-04").isRegulated).toBe(true);
    expect(isRegulatedByBjdCode(SEOSIN, "2022-07-05").isRegulated).toBe(false);
    expect(isRegulatedByBjdCode("4159035000", "2022-07-05").isRegulated).toBe(false);
    expect(isRegulatedByBjdCode(NAMYANG, "2022-07-05").isRegulated).toBe(true);
  });

  it("능동 — 동탄2 밖: 2020-06-18까지 미지정 · 2020-06-19부터 지정. 동탄2(산척동)는 종전 2017-08-03부터 지정 그대로", () => {
    expect(isRegulatedByBjdCode(NEUNGDONG, "2020-06-18").isRegulated).toBe(false);
    expect(isRegulatedByBjdCode(NEUNGDONG, "2020-06-19").isRegulated).toBe(true);
    expect(isRegulatedByBjdCode(SANCHEOK, "2017-08-03").isRegulated).toBe(true);
    expect(governingDesignationStart(SANCHEOK, "2021-03-01")).toBe("2017-08-03"); // 동탄2 — 구간 시작은 그대로(공고일 2017-11-10)
    expect(governingDesignationStart(NEUNGDONG, "2021-03-01")).toBe("2020-06-19"); // 동탄2 밖 — 공고일 2020-06-19
    expect(governingDesignationStart(HYOHAENG, "2021-03-01")).toBe("2020-06-19");
  });
});

describe("#3 화성 동탄2 밖 — 판정 메뉴·계산기 세액 (비과세 → 과세)", () => {
  it("효행구 2021-03-01 취득 · 거주 0 → 판정 메뉴 과세 · 계산기 135,806,000 (종전 비과세 0)", async () => {
    const j = await judge({ regionCode: HYOHAENG, acq: "2021-03-01", transfer: "2024-03-15", price: "900000000" });
    expect(j.isExempt).toBe(false);
    const c = await runCalc(cform(HYOHAENG, "2021-03-01", "2024-03-15"));
    expect(c.status).toBe(200);
    expect(c.isExempt).toBe(false);
    expect(c.totalTax).toBe(TAX_9EOK);
  });

  it("능동 2021-03-01 취득 · 거주 0 → 과세 135,806,000 · 동탄2 산척동 대조군도 같은 과세(양쪽 지정)", async () => {
    expect((await runCalc(cform(NEUNGDONG, "2021-03-01", "2024-03-15"))).totalTax).toBe(TAX_9EOK);
    expect((await runCalc(cform(SANCHEOK, "2021-03-01", "2024-03-15"))).totalTax).toBe(TAX_9EOK);
  });

  it("긍정 짝 — 거주 24개월이면 비과세 · 2020-06-18 취득(미지정)이면 거주 0이어도 비과세 · 2020-06-19 취득은 과세", async () => {
    expect((await judge({ regionCode: HYOHAENG, acq: "2021-03-01", transfer: "2024-03-15", residence: "24" })).isExempt).toBe(true);
    expect((await judge({ regionCode: HYOHAENG, acq: "2020-06-18", transfer: "2024-03-15" })).isExempt).toBe(true);
    expect((await judge({ regionCode: HYOHAENG, acq: "2020-06-19", transfer: "2024-03-15" })).isExempt).toBe(false);
    expect((await runCalc(cform(HYOHAENG, "2020-06-18", "2024-03-15"))).totalTax).toBe(0);
  });

  it("서신면 — 2022-08-01 취득(해제 후)은 거주 0이어도 비과세 · 같은 구 남양읍은 과세(시 전역은 2022-11-13까지)", async () => {
    expect((await judge({ regionCode: SEOSIN, acq: "2022-08-01", transfer: "2025-03-15" })).isExempt).toBe(true);
    expect((await judge({ regionCode: NAMYANG, acq: "2022-08-01", transfer: "2025-03-15" })).isExempt).toBe(false);
    expect((await judge({ regionCode: SEOSIN, acq: "2021-03-01", transfer: "2024-03-15" })).isExempt).toBe(false);
  });
});

describe("#3 취득세 자동 조회 등 `/api/address/regulated-area` — 같은 데이터를 쓴다", () => {
  const ask = async (body: Record<string, unknown>) => {
    const res = await regulatedAreaPOST(
      new NextRequest("http://localhost/api/address/regulated-area", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return (await res.json()) as { isRegulatedAtTransfer: boolean; wasRegulatedAtAcquisition: boolean; acquisitionBasis: string | null };
  };

  it("능동 코드: 2020-08-12 이후 취득분의 자동 기본값이 「조정대상지역」(종전 미지정) · 2020-06-18 이전 취득은 미지정", async () => {
    const after = await ask({ regionCode: NEUNGDONG, transferDate: "2021-09-01", acquisitionDate: "2020-08-12" });
    expect(after.wasRegulatedAtAcquisition).toBe(true);
    expect(after.acquisitionBasis).toContain("2020-06-19 고시");
    const before = await ask({ regionCode: NEUNGDONG, transferDate: "2021-09-01", acquisitionDate: "2020-06-18" });
    expect(before.wasRegulatedAtAcquisition).toBe(false);
  });

  it("주소 문자열(효행구)도 같은 결론 — 「경기도 화성시 효행구」 2021 지정 · 2022-11-14 미지정", async () => {
    expect((await ask({ address: "경기도 화성시 효행구 병점로 1", transferDate: "2021-03-01" })).isRegulatedAtTransfer).toBe(true);
    expect((await ask({ address: "경기도 화성시 효행구 병점로 1", transferDate: "2022-11-14" })).isRegulatedAtTransfer).toBe(false);
  });
});

describe("#3 하위 2 — 화성 지정 시작 열흘(2020.6.19.~6.28.) 확인 필요 고지", () => {
  it("판정 메뉴 · 계산기: 취득일이 열흘 안이고 거주요건이 결론을 가르면 고지", async () => {
    const j = await judge({ regionCode: HYOHAENG, acq: "2020-06-25", transfer: "2024-06-25" });
    expect(j.isExempt).toBe(false);
    expect(j.undetermined).toContain(HWASEONG_WINDOW_NOTICE_ID);
    const r = await runCalc(cform(HYOHAENG, "2020-06-25", "2024-06-25"));
    expect(r.isExempt).toBe(false);
    expect((r.warnings as string[]).some((w) => w.includes("화성시 지정 시작 열흘") && w.includes("2020.06.29."))).toBe(true);
  });

  it("고지 문장 — 6.19. 판정 근거와 6.29. 독법, 해석례 미확인을 밝힌다", async () => {
    const r = await observeRaw(
      mkCase("2026-10-11", {
        isOneHousehold: true,
        transferDate: "2024-06-25",
        contractTotalPrice: "900000000",
        asset: { assetKind: "housing", acquisitionDate: "2020-06-25", regionCode: HYOHAENG, residenceInputMode: "direct", residencePeriodMonthsAsset: "0" },
        houses: [],
      }),
    );
    const u = (r.j.undetermined as { id: string; reason: string }[]).find((x) => x.id === HWASEONG_WINDOW_NOTICE_ID);
    expect(u?.reason).toContain("제2020-828호");
    expect(u?.reason).toContain("제2020-877호");
    expect(u?.reason).toContain("해석례·심판례는 확인하지 못했고");
    expect(u?.reason).toContain("결과가 달라집니다(확인 필요)");
  });

  it("열흘 밖이거나 결론을 가르지 않으면 고지하지 않는다 — 6.29. 취득 · 6.18. 취득(미지정) · 동탄2 · 거주 충족(비과세)", async () => {
    for (const o of [
      { regionCode: HYOHAENG, acq: "2020-06-29", transfer: "2024-06-29" },
      { regionCode: HYOHAENG, acq: "2020-06-18", transfer: "2024-06-25" },
      { regionCode: SANCHEOK, acq: "2020-06-25", transfer: "2024-06-25" }, // 동탄2 — 6.19. 전부터 지정(구간 시작 2017-08-03)
      { regionCode: HYOHAENG, acq: "2020-06-25", transfer: "2024-06-25", residence: "24" },
    ]) {
      const j = await judge(o);
      expect(j.undetermined, JSON.stringify(o)).not.toContain(HWASEONG_WINDOW_NOTICE_ID);
    }
  });

  it("거주와 무관하게 과세가 정해졌으면(비특례 2주택) 고지하지 않는다 — 6.29. 독법으로도 결론이 같다", async () => {
    const j = await judge({
      regionCode: HYOHAENG,
      acq: "2020-06-25",
      transfer: "2024-06-25",
      top: { houses: [{ id: "h2", region: "non_capital", acquisitionDate: "2010-01-01", officialPrice: "300000000" }] },
    });
    expect(j.isExempt).toBe(false);
    expect(j.undetermined).not.toContain(HWASEONG_WINDOW_NOTICE_ID);
  });

  const rowHouse = (id: string, over = {}) => ({ ...makeHouse(id), ...over });

  it("다주택 중과(계산기): 양도일이 열흘 안이면 중과 적용 + 고지 · 6.29. 양도는 고지 없음", () => {
    const base = (transferDate: Date) =>
      makeInput([rowHouse("h1", { regionCode: HYOHAENG }), rowHouse("h2")], { sellingHouseId: "h1", transferDate });
    const run = (i: MultiHouseSurchargeInput) =>
      determineMultiHouseSurcharge(i, defaultRules, toRegulatedAreaHistory(), suspensionNone, true);
    const inWin = base(new Date("2020-06-25"));
    expect(run(inWin).isRegulatedAtTransfer).toBe(true);
    expect(run(inWin).surchargeApplicable).toBe(true);
    expect(hwaseongSurchargeWindowNotice(inWin, true, false)).toHaveLength(1);
    expect(hwaseongSurchargeWindowNotice(inWin, true, true)).toEqual([]); // 비과세면 중과 무관
    expect(hwaseongSurchargeWindowNotice(inWin, false, false)).toEqual([]); // 중과가 적용되지 않았으면 결론이 안 갈린다
    const after = base(new Date("2020-06-29"));
    expect(run(after).surchargeApplicable).toBe(true);
    expect(hwaseongSurchargeWindowNotice(after, true, false)).toEqual([]);
    // 동탄2(산척동)는 6.19. 전부터 지정이라 열흘이 걸리지 않는다
    const dongtan2 = makeInput([rowHouse("h1", { regionCode: SANCHEOK }), rowHouse("h2")], {
      sellingHouseId: "h1",
      transferDate: new Date("2020-06-25"),
    });
    expect(hwaseongSurchargeWindowNotice(dongtan2, true, false)).toEqual([]);
  });

  it("다주택 중과: 공고 전 매매계약 배제의 「공고」가 6.19.이냐 6.29.이냐 — 계약일 6.25.은 6.19. 독법으로 배제 미적용 + 고지, 6.19. 이전 계약은 배제", () => {
    const withContract = (contractDate: string) =>
      makeInput(
        [
          rowHouse("h1", { regionCode: HYOHAENG, contractDate: new Date(contractDate), saleDepositReceived: true }),
          rowHouse("h2"),
        ],
        { sellingHouseId: "h1", transferDate: new Date("2021-03-01") },
      );
    const run = (i: MultiHouseSurchargeInput) =>
      determineMultiHouseSurcharge(i, defaultRules, toRegulatedAreaHistory(), suspensionNone, true);
    const gap = withContract("2020-06-25");
    expect(run(gap).surchargeApplicable).toBe(true); // 공고일 6.19. — 6.25. 계약은 공고 후라 배제 불가
    expect(hwaseongSurchargeWindowNotice(gap, true, false)).toHaveLength(1);
    expect(hwaseongSurchargeWindowNotice(gap, true, false)[0]).toContain("공고 전 매매계약 중과 배제");
    const before = withContract("2020-06-19");
    expect(run(before).surchargeApplicable).toBe(false); // 공고 당일 이전(당일 포함) 계약 — 배제
    expect(hwaseongSurchargeWindowNotice(before, run(before).surchargeApplicable, false)).toEqual([]);
    const late = withContract("2020-06-30");
    expect(hwaseongSurchargeWindowNotice(late, true, false)).toEqual([]);
  });

  it("§155①2호: 신규 주택 취득이 열흘 안이고 두 독법의 처분기한 판정이 갈리면 고지 · 같으면 없음", () => {
    const tt = (newAcq: string) => ({
      previousAcquisitionDate: new Date("2015-01-01"),
      newAcquisitionDate: new Date(newAcq),
      newHouseRegionCode: HYOHAENG,
      previousHouseIsRosterRow: false,
    });
    const years = (both: boolean) => (both ? 2 : 3); // 조정→조정이면 2년, 아니면 3년(연혁 예시)
    const common = { regionCode: GANGNAM };
    // 신규 취득 2020-06-25 → 양도 2023-03-01(2년 8개월): 2년 기한이면 초과, 3년이면 충족 → 갈린다
    expect(
      hwaseongTemporaryTwoHouseWindowNotice({ ...common, transferDate: new Date("2023-03-01") }, tt("2020-06-25"), true, years),
    ).toHaveLength(1);
    // 양도 2020-12-01(5개월): 어느 기한이든 충족 → 안 갈린다
    expect(
      hwaseongTemporaryTwoHouseWindowNotice({ ...common, transferDate: new Date("2020-12-01") }, tt("2020-06-25"), true, years),
    ).toEqual([]);
    // 6.19. 독법에서도 두 주택이 조정이 아니면(6.29. 독법은 그보다 지정이 적다) 갈리지 않는다
    expect(
      hwaseongTemporaryTwoHouseWindowNotice({ ...common, transferDate: new Date("2023-03-01") }, tt("2020-06-25"), false, years),
    ).toEqual([]);
    // 신규 취득이 열흘 밖(7월)이면 고지 없음
    expect(
      hwaseongTemporaryTwoHouseWindowNotice({ ...common, transferDate: new Date("2023-03-01") }, tt("2020-07-10"), true, years),
    ).toEqual([]);
  });
});

describe("#3 하위 2 — 지구 안·밖 선언이 열흘 해당 여부를 가른다 (반송동·석우동: 동탄2 지구 밖이면 6.19.부터 지정)", () => {
  const rowHouse = (id: string, over = {}) => ({ ...makeHouse(id), ...over });

  it("① 취득: 지구 밖(동탄1) 선언 + 취득 2020.6.22. → 6.19.부터 지정이라 고지 · 지구 안 선언(2017.8.3.부터 지정)·미선언·열흘 밖은 고지 없음", async () => {
    const outside = await judge({ regionCode: BANSONG, acq: "2020-06-22", transfer: "2024-06-22", asset: { regionInDesignatedDistrict: false } });
    expect(outside.isExempt).toBe(false); // 지구 밖 선언도 6.19.부터 지정이라 취득 당시 조정 — 거주 0 → 과세
    expect(outside.undetermined).toContain(HWASEONG_WINDOW_NOTICE_ID);
    for (const o of [
      { asset: { regionInDesignatedDistrict: true }, acq: "2020-06-22" }, // 지구 안 — 6.19. 전부터 지정(구간 시작 2017-08-03)
      { asset: {}, acq: "2020-06-22" }, // 미선언 — 지정(모름=불리), 열흘에 의존하지 않는다
      { asset: { regionInDesignatedDistrict: false }, acq: "2020-06-29" }, // 열흘 밖
      { asset: { regionInDesignatedDistrict: false }, acq: "2020-06-18" }, // 지구 밖 선언 + 6.18. 취득 — 미지정
    ]) {
      const j = await judge({ regionCode: BANSONG, acq: o.acq, transfer: "2024-06-29", asset: o.asset });
      expect(j.undetermined, JSON.stringify(o)).not.toContain(HWASEONG_WINDOW_NOTICE_ID);
    }
  });

  it("② §155①2호: 신규 주택이 지구 밖 선언 반송동이고 취득이 열흘 안이면 고지 · 지구 안·미선언이면 없음", () => {
    const years = (both: boolean) => (both ? 2 : 3);
    const common = { regionCode: GANGNAM, transferDate: new Date("2023-03-01") };
    const tt = (inDistrict: boolean | undefined) => ({
      previousAcquisitionDate: new Date("2015-01-01"),
      newAcquisitionDate: new Date("2020-06-25"),
      newHouseRegionCode: BANSONG,
      newHouseInDesignatedDistrict: inDistrict,
      previousHouseIsRosterRow: false,
    });
    expect(hwaseongTemporaryTwoHouseWindowNotice(common, tt(false), true, years)).toHaveLength(1);
    expect(hwaseongTemporaryTwoHouseWindowNotice(common, tt(true), true, years)).toEqual([]);
    expect(hwaseongTemporaryTwoHouseWindowNotice(common, tt(undefined), true, years)).toEqual([]);
  });

  it("② 종전 주택 쪽: 양도 주택(비명부)의 선언은 input, 명부 행의 선언은 tt.previousHouseInDesignatedDistrict를 쓴다", () => {
    const years = (both: boolean) => (both ? 2 : 3);
    const base = {
      previousAcquisitionDate: new Date("2015-01-01"),
      newAcquisitionDate: new Date("2020-06-25"),
      newHouseRegionCode: GANGNAM, // 신규 주택은 열흘과 무관 — 종전 주택 쪽만 본다
    };
    const transferDate = new Date("2023-03-01");
    // 비명부 — 종전 주택 = 양도 주택(input.regionCode · input.regionInDesignatedDistrict)
    const nonRoster = { ...base, previousHouseIsRosterRow: false };
    expect(
      hwaseongTemporaryTwoHouseWindowNotice({ regionCode: BANSONG, regionInDesignatedDistrict: false, transferDate }, nonRoster, true, years),
    ).toHaveLength(1);
    expect(hwaseongTemporaryTwoHouseWindowNotice({ regionCode: BANSONG, transferDate }, nonRoster, true, years)).toEqual([]);
    // 명부 행 — 선언은 tt.previousHouseInDesignatedDistrict(양도 주택 선언은 무관)
    const roster = (inDistrict: boolean | undefined) => ({
      ...base,
      previousHouseIsRosterRow: true,
      previousHouseRegionCode: BANSONG,
      previousHouseInDesignatedDistrict: inDistrict,
    });
    const input = { regionCode: GANGNAM, regionInDesignatedDistrict: false, transferDate };
    expect(hwaseongTemporaryTwoHouseWindowNotice(input, roster(false), true, years)).toHaveLength(1);
    expect(hwaseongTemporaryTwoHouseWindowNotice(input, roster(true), true, years)).toEqual([]);
    expect(hwaseongTemporaryTwoHouseWindowNotice(input, roster(undefined), true, years)).toEqual([]);
  });

  it("③ 다주택 중과: 양도 주택이 지구 밖 선언 반송동 + 양도일 열흘 안이면 중과 적용 + 고지 · 지구 안·미선언이면 고지 없음", () => {
    const run = (i: MultiHouseSurchargeInput) =>
      determineMultiHouseSurcharge(i, defaultRules, toRegulatedAreaHistory(), suspensionNone, true);
    const mk = (inDesignatedDistrict: boolean | undefined) =>
      makeInput([rowHouse("h1", { regionCode: BANSONG, inDesignatedDistrict }), rowHouse("h2")], {
        sellingHouseId: "h1",
        transferDate: new Date("2020-06-25"),
      });
    const outside = mk(false);
    expect(run(outside).isRegulatedAtTransfer).toBe(true);
    expect(run(outside).surchargeApplicable).toBe(true);
    expect(hwaseongSurchargeWindowNotice(outside, true, false)).toHaveLength(1);
    expect(hwaseongSurchargeWindowNotice(mk(true), true, false)).toEqual([]);
    expect(hwaseongSurchargeWindowNotice(mk(undefined), true, false)).toEqual([]);
  });
});

describe("#4 다산동 누락 보정(B) — 2019.11.8.~2020.6.18.", () => {
  it("다산동(법정동 41360112) — 경계 2019-11-07(전역기) · 2019-11-08 · 2020-06-18 지정(high, 지구 질문 없음) · 2020-06-19 전역 · 2022-11-14 해제", () => {
    for (const d of ["2019-11-07", "2019-11-08", "2020-01-15", "2020-06-18", "2020-06-19", "2022-11-13"]) {
      const j = isRegulatedByBjdCode(DASAN, d);
      expect(j.isRegulated, d).toBe(true);
      expect(j.confidence, d).toBe("high");
      expect(j.districtOnly, d).toBeUndefined();
    }
    expect(isRegulatedByBjdCode(DASAN, "2022-11-14").isRegulated).toBe(false);
    expect(designatedDistrictsForCode(DASAN)).toEqual([]);
  });

  it("공고 전 계약 식별 — 다산동은 2017-08-03부터 계속 지정이라 구간 시작이 2017-08-03이다(종전 2020-06-19로 잘못 나왔다)", () => {
    expect(governingDesignationStart(DASAN, "2020-07-15")).toBe("2017-08-03");
    expect(governingDesignationStart(DASAN, "2021-06-01")).toBe("2017-08-03");
  });

  it("수석동은 고시에 이름이 없어 미지정 그대로(원칙 3) · 지금동은 임시 지정 + 범위 미확인 질문 유지 · 별내동은 질문 없이 지정", () => {
    expect(isRegulatedByBjdCode(SUSEOK, "2020-01-15")).toMatchObject({ isRegulated: false, confidence: "high" });
    const jigeum = isRegulatedByBjdCode(JIGEUM, "2020-01-15");
    expect(jigeum).toMatchObject({ isRegulated: true, confidence: "medium" });
    expect(jigeum.districtOnly).toMatchObject({ district: "다산동", scopeUnverified: true });
    expect(designatedDistrictsForCode(JIGEUM).map((d) => d.scopeUnverified)).toEqual([true]);
    const byeollae = isRegulatedByBjdCode(BYEOLLAE, "2020-01-15");
    expect(byeollae).toMatchObject({ isRegulated: true, confidence: "high" });
    expect(byeollae.districtOnly).toBeUndefined();
    expect(designatedDistrictsForCode(BYEOLLAE)).toEqual([]);
    // 「밖」으로 저장된 기록(하위 결정 1 가)도 이제 무시된다 — 별내동 전체가 지정
    expect(isRegulatedByBjdCode(BYEOLLAE, "2020-01-15", false).isRegulated).toBe(true);
    // 지금동은 선언을 따른다(밖 → 미지정)
    expect(isRegulatedByBjdCode(JIGEUM, "2020-01-15", false).isRegulated).toBe(false);
  });

  it("다산동 2020-01-15 취득 · 거주 0 → 판정 메뉴 과세 · 계산기 132,286,000 (종전 비과세 0) · 거주 24개월이면 비과세", async () => {
    expect((await judge({ regionCode: DASAN, acq: "2020-01-15", transfer: "2024-03-15" })).isExempt).toBe(false);
    const c = await runCalc(cform(DASAN, "2020-01-15", "2024-03-15"));
    expect(c.totalTax).toBe(TAX_9EOK_DASAN);
    expect((await judge({ regionCode: DASAN, acq: "2020-01-15", transfer: "2024-03-15", residence: "24" })).isExempt).toBe(true);
  });

  it("수석동 대조군 — 같은 입력이 비과세 0 그대로", async () => {
    expect((await runCalc(cform(SUSEOK, "2020-01-15", "2024-03-15"))).totalTax).toBe(0);
  });

  it("§154①5호 공고 전 계약 단서 — 다산동 취득자는 판정 메뉴에서 단서 사유를 골라 거주요건을 면제받을 수 있다(입력란 경로 유지)", async () => {
    const withProviso = await judge({
      regionCode: DASAN,
      acq: "2019-12-01",
      transfer: "2024-03-15",
      top: { provisoReason: "pre_designation_contract", provisoPreContractNoHouse: true },
    });
    expect(withProviso.isExempt).toBe(true);
    const without = await judge({ regionCode: DASAN, acq: "2019-12-01", transfer: "2024-03-15" });
    expect(without.isExempt).toBe(false);
  });

  it("별내동 — 질문·확인 필요 고지가 사라지고 거주요건 과세 판정은 그대로(언제나 동 전체 지정)", async () => {
    const j = await judge({ regionCode: BYEOLLAE, acq: "2020-01-15", transfer: "2024-03-15" });
    expect(j.isExempt).toBe(false);
    expect(j.undetermined).not.toContain("regulated-district-undeclared:selling");
    expect((await runCalc(cform(BYEOLLAE, "2020-01-15", "2024-03-15"))).totalTax).toBe(TAX_9EOK_DASAN);
  });

  it("지금동 고지 — 「동 전체가 아니라 …만」이라 단정하지 않고 범위 미확인을 밝힌다", async () => {
    const r = await observeRaw(
      mkCase("2026-10-11", {
        isOneHousehold: true,
        transferDate: "2024-03-15",
        contractTotalPrice: "900000000",
        asset: { assetKind: "housing", acquisitionDate: "2020-01-15", regionCode: JIGEUM, residenceInputMode: "direct", residencePeriodMonthsAsset: "0" },
        houses: [],
      }),
    );
    const u = (r.j.undetermined as { id: string; reason: string }[]).find((x) => x.id === "regulated-district-undeclared:selling");
    expect(u?.reason).toContain("고시에 「다산동」만 조정대상지역으로 적혀 있는데");
    expect(u?.reason).toContain("법정동인지 행정동인지");
    expect(u?.reason).not.toContain("동 전체가 아니라");
  });
});
