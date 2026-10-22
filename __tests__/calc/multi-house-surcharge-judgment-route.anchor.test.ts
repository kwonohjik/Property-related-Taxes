/**
 * anchor — 다주택 중과 판정 route (계획서 §7 · P4): 폼 → ④ `buildMultiHouseSurchargeApiBody` → route POST(⑫⑭) → 응답.
 *
 * - MH-1~5 교재 사례(양도일 2021-06-01) — 양도 예정 주택은 정밀(headline), 나머지 주택은 행별 간이 판정.
 * - MH-B1~B5 경계 · MH-P1(비과세 요약 = 1주택 route) · MH-P2(headline = 계산기) · MH-P4(양도 주택 배제 사실 배선).
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST as surchargePOST } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import { POST as oneHousePOST } from "@/app/api/calc/one-house-exemption/route";
import { buildJudgmentEngineInput } from "@/app/api/calc/one-house-exemption/judgment-request";
import { buildMultiHouseSurchargeApiBody } from "@/lib/calc/multi-house-surcharge-api";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { MultiHouseSurchargeJudgmentResponse } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";

const TD = "2021-06-01";
const C = {
  ASAN: "4420010100", SEJONG_BANGOK: "3611010100", SEJONG_JOCHIWON: "3611025021",
  GWACHEON: "4129010100", POSEUNG: "4122025621", GANGNEUNG: "5115010100", GWANGJU: "1224010400", GWANGJU_OLD: "2914010400",
  GANGNAM: "1168010100", SEOCHO: "1165010100", SUSEONG: "2726010100", HAEUNDAE: "2635010100", BUNDANG: "4113510100",
  GWANGMYEONG: "4121010100", GUMI: "4719010100",
};
type Row = { id?: string; regionCode: string; officialPrice: string; acquisitionDate?: string; region?: string };

function form(
  selling: { regionCode: string; price: string; acquisitionDate?: string; assetKind?: string },
  houses: Row[],
  top: Record<string, unknown> = {},
): OneHouseJudgmentFormData {
  const c = {
    id: "mh", docNo: "", docDate: "", basis: "current", today: "2026-10-22", summary: "", bucket: "match",
    form: {
      transferDate: TD,
      contractTotalPrice: "500000000",
      isOneHousehold: true,
      asset: {
        assetKind: selling.assetKind ?? "housing",
        acquisitionDate: selling.acquisitionDate ?? "2015-01-01",
        regionCode: selling.regionCode,
        standardPriceAtTransfer: selling.price,
      },
      houses: houses.map((h) => ({ acquisitionDate: "2015-01-01", ...h })),
      ...top,
    },
  } as unknown as RulingCase;
  return buildCaseForm(c);
}

async function post(handler: typeof surchargePOST, url: string, body: unknown) {
  const res = await handler(
    new NextRequest(`http://localhost${url}`, {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: (await res.json()) as any };
}
async function judge(f: OneHouseJudgmentFormData): Promise<MultiHouseSurchargeJudgmentResponse> {
  const r = await post(surchargePOST, "/api/calc/multi-house-surcharge-judgment", buildMultiHouseSurchargeApiBody(f));
  expect(r.status, JSON.stringify(r.json?.error)).toBe(200);
  return r.json.data;
}
const typeOf = (d: MultiHouseSurchargeJudgmentResponse, id: string) =>
  d.rows!.houses.find((r) => r.houseId === id)!.result.surchargeType;

describe("MH-1~5 교재 사례 (양도일 2021-06-01)", () => {
  it("[MH-1] 세종 동 2억·4억 + 아산 2억·4억 → 주택 수 3 · 세종 둘 3주택 이상 중과 · 아산 둘 중과 없음", async () => {
    const d = await judge(
      form({ regionCode: C.SEJONG_BANGOK, price: "200000000" }, [
        { id: "sj4", regionCode: C.SEJONG_BANGOK, officialPrice: "400000000" },
        { id: "as2", regionCode: C.ASAN, officialPrice: "200000000", region: "non_capital" },
        { id: "as4", regionCode: C.ASAN, officialPrice: "400000000", region: "non_capital" },
      ]),
    );
    expect(d.headline!.result.effectiveHouseCount).toBe(3);
    expect(d.headline!.result.surchargeType).toBe("multi_house_3plus");
    expect(typeOf(d, "sj4")).toBe("multi_house_3plus");
    expect(typeOf(d, "as2")).toBe("none");
    expect(typeOf(d, "as4")).toBe("none");
    expect(d.rows!.houses.find((r) => r.houseId === "as2")!.countExclusion?.reason).toBe("low_price_local_300");
  });

  it("[MH-1 대조] 세종 둘이 조치원읍이면 주택 수 2 · 전부 중과 없음", async () => {
    const d = await judge(
      form({ regionCode: C.SEJONG_JOCHIWON, price: "200000000" }, [
        { id: "sj4", regionCode: C.SEJONG_JOCHIWON, officialPrice: "400000000" },
        { id: "as2", regionCode: C.ASAN, officialPrice: "200000000", region: "non_capital" },
        { id: "as4", regionCode: C.ASAN, officialPrice: "400000000", region: "non_capital" },
      ]),
    );
    expect(d.headline!.result.effectiveHouseCount).toBe(2);
    expect(d.rows!.houses.every((r) => r.result.surchargeType === "none")).toBe(true);
    expect(d.rows!.houses.find((r) => r.houseId === "selling")!.regionCriteria).toEqual({ criteria: "VALUE", reason: "eup_myeon" });
  });

  it("[MH-2] 과천·포승·강릉·광주 각 2억 → 주택 수 2 · 과천·광주 2주택 중과 · 포승 1호 배제 · 강릉 비조정 · 광주 구 코드 동치", async () => {
    const rows = (gwangju: string): Row[] => [
      { id: "ps", regionCode: C.POSEUNG, officialPrice: "200000000" },
      { id: "gn", regionCode: C.GANGNEUNG, officialPrice: "200000000", region: "non_capital" },
      { id: "gj", regionCode: gwangju, officialPrice: "200000000", region: "non_capital" },
    ];
    const d = await judge(form({ regionCode: C.GWACHEON, price: "200000000" }, rows(C.GWANGJU)));
    expect(d.headline!.result.effectiveHouseCount).toBe(2);
    expect(d.headline!.result.surchargeType).toBe("multi_house_2");
    expect(typeOf(d, "gj")).toBe("multi_house_2");
    const ps = d.rows!.houses.find((r) => r.houseId === "ps")!;
    expect(ps.regulated?.isRegulated).toBe(true); // 조정대상지역이지만
    expect(ps.stage).toBe("self_low_price"); // 1호(읍 · 2억)로 배제
    expect(d.rows!.houses.find((r) => r.houseId === "gn")!.stage).toBe("not_regulated");
    const old = await judge(form({ regionCode: C.GWACHEON, price: "200000000" }, rows(C.GWANGJU_OLD)));
    expect(typeOf(old, "gj")).toBe("multi_house_2");
  });

  it("[MH-4] 강남 1억·수성·해운대·분당 각 2억 — 양도일마다 조정대상지역이 다르다", async () => {
    const rows: Row[] = [
      { id: "ss", regionCode: C.SUSEONG, officialPrice: "200000000", region: "non_capital" },
      { id: "hd", regionCode: C.HAEUNDAE, officialPrice: "200000000", region: "non_capital" },
      { id: "bd", regionCode: C.BUNDANG, officialPrice: "200000000" },
    ];
    const at = (td: string) => judge(form({ regionCode: C.GANGNAM, price: "100000000" }, rows, { transferDate: td }));
    const d21 = await at("2021-06-01");
    expect([d21.headline!.result.surchargeType, typeOf(d21, "ss"), typeOf(d21, "hd"), typeOf(d21, "bd")]).toEqual(
      Array(4).fill("multi_house_3plus"),
    );
    const d20 = await at("2020-06-01");
    expect([typeOf(d20, "ss"), typeOf(d20, "hd")]).toEqual(["none", "none"]);
    const d19 = await at("2019-06-01");
    expect(typeOf(d19, "ss")).toBe("none");
    expect(typeOf(d19, "hd")).toBe("multi_house_3plus");
  });

  it("[MH-5] 강남 1억·광명 입주권 2억·해운대·구미 2억 → 주택+권리 3 · 강남·해운대 중과 · 입주권 행 산입 · 구미 비조정", async () => {
    const d = await judge(
      form(
        { regionCode: C.GANGNAM, price: "100000000" },
        [
          { id: "hd", regionCode: C.HAEUNDAE, officialPrice: "200000000", region: "non_capital" },
          { id: "gm", regionCode: C.GUMI, officialPrice: "200000000", region: "non_capital" },
        ],
        {
          presaleRights: [
            { id: "r1", type: "redevelopment_right", acquisitionDate: "2015-01-01", region: "capital", regionCode: C.GWANGMYEONG, rightValue: "200000000" },
          ],
        },
      ),
    );
    expect(d.headline!.result.effectiveHouseCount).toBe(3);
    expect(d.headline!.result.surchargeType).toBe("multi_house_3plus");
    expect(typeOf(d, "hd")).toBe("multi_house_3plus");
    expect(d.rows!.houses.find((r) => r.houseId === "gm")!.stage).toBe("not_regulated");
    expect(d.rows!.rights).toEqual([{ rightId: "r1", type: "redevelopment_right", countReason: "counted", spouseSubtracted: false }]);
  });

  it("[MH-5 입주권 양도] 양도 대상이 조합원입주권이면 §104⑦ 주택 양도가 아니라 판정 범위 밖(중과 없음)", async () => {
    const d = await judge(
      form({ regionCode: C.GWANGMYEONG, price: "200000000", assetKind: "right_to_move_in" }, [
        { id: "gnm", regionCode: C.GANGNAM, officialPrice: "100000000" },
        { id: "hd", regionCode: C.HAEUNDAE, officialPrice: "200000000", region: "non_capital" },
      ]),
    );
    expect(d.scope).toEqual({ supported: false, reason: "non_housing_sale" });
    expect(d.headline).toBeUndefined();
    expect(d.exemption.judgment).toBeDefined(); // 비과세 요약은 그대로 싣는다
  });

  it("[MH-5 후속] 입주권을 먼저 판 뒤 강남 1억 + 해운대 → 2주택 · 9호(양도 당시 기준시가 1억 이하) 배제", async () => {
    const d = await judge(
      form({ regionCode: C.GANGNAM, price: "100000000" }, [{ id: "hd", regionCode: C.HAEUNDAE, officialPrice: "200000000", region: "non_capital" }]),
    );
    expect(d.headline!.decisionStage).toBe("excluded");
    expect(d.headline!.result.exclusionReasons.map((e) => e.type)).toEqual(["low_price_two_house"]);
  });
});

describe("MH-B 경계", () => {
  const twoRegulated = (td: string, acq = "2015-01-01") =>
    form({ regionCode: C.GANGNAM, price: "500000000", acquisitionDate: acq }, [{ id: "sc", regionCode: C.SEOCHO, officialPrice: "500000000" }], {
      transferDate: td,
    });

  it("[MH-B1] 2018-03-31 판정 범위 밖 / 2018-04-01 가산율 +10%p", async () => {
    expect((await judge(twoRegulated("2018-03-31"))).scope).toEqual({ supported: false, reason: "before_2018_04_01" });
    const d = await judge(twoRegulated("2018-04-01"));
    expect(d.scope).toEqual({ supported: true });
    expect(d.rateImpact!.addonRate).toBe(0.1);
  });

  it("[MH-B2] 2021-05-31 +10%p → 2021-06-01 +20%p", async () => {
    expect((await judge(twoRegulated("2021-05-31"))).rateImpact!.addonRate).toBe(0.1);
    expect((await judge(twoRegulated("2021-06-01"))).rateImpact!.addonRate).toBe(0.2);
  });

  it("[MH-B3] 한시 유예 창 2022-05-10 ~ 2026-05-09", async () => {
    const stage = async (td: string) => (await judge(twoRegulated(td))).headline!.decisionStage;
    expect(await stage("2022-05-09")).toBe("surcharged");
    expect(await stage("2022-05-10")).toBe("suspended");
    expect(await stage("2026-05-09")).toBe("suspended");
    expect(await stage("2026-05-10")).toBe("surcharged");
    const s = await judge(twoRegulated("2024-03-01"));
    expect(s.rateImpact).toMatchObject({ isSurchargeCase: true, isRateSurchargeApplied: false, lthdExcluded: false, suspension: { basis: "a" } });
  });

  it("[MH-B4] 위기 취득(2009.3.16.~2012.12.31.) — 세율 축만 빠지고 장특 배제는 남는다", async () => {
    const d = await judge(twoRegulated("2021-06-01", "2010-06-01"));
    expect(d.rateImpact).toMatchObject({
      isSurchargeCase: true,
      isRateSurchargeApplied: false,
      addonRate: null,
      lthdExcluded: true,
      rateSurchargeStatutoryExcluded: true,
    });
  });

  it("[MH-B5] 양도일에 취득한 행은 양도일 현재 보유가 아니다 — 행에 없고 주택 수에 들지 않는다", async () => {
    const d = await judge(
      form({ regionCode: C.GANGNAM, price: "500000000" }, [{ id: "sc", regionCode: C.SEOCHO, officialPrice: "500000000", acquisitionDate: TD }]),
    );
    expect(d.rows!.houses.map((r) => r.houseId)).toEqual(["selling"]);
    expect(d.headline!.result.effectiveHouseCount).toBe(1);
  });

  it("[MH-B6] 명부가 비어도 양도 주택 행을 싣는다 — 정밀 판정 1주택 이하", async () => {
    const d = await judge(form({ regionCode: C.GANGNAM, price: "500000000" }, []));
    expect(d.scope).toEqual({ supported: true });
    expect(d.headline!.decisionStage).toBe("one_house_or_less");
    expect(d.headline!.narrative.steps[0].verdict).toBe("조정대상지역");
  });
});

describe("MH-P parity", () => {
  const cases: Array<[string, () => OneHouseJudgmentFormData]> = [
    ["2주택 중과", () => form({ regionCode: C.GANGNAM, price: "500000000" }, [{ id: "sc", regionCode: C.SEOCHO, officialPrice: "500000000" }])],
    ["명부 없음", () => form({ regionCode: C.GANGNAM, price: "500000000" }, [])],
    [
      "3주택 + 지방 저가",
      () =>
        form({ regionCode: C.GANGNAM, price: "500000000" }, [
          { id: "sc", regionCode: C.SEOCHO, officialPrice: "500000000" },
          { id: "as", regionCode: C.ASAN, officialPrice: "200000000", region: "non_capital" },
        ]),
    ],
  ];

  it.each(cases)("[MH-P1] %s — 비과세 요약 = 1주택 route 응답", async (_name, mk) => {
    const f = mk();
    const s = await judge(f);
    const o = await post(oneHousePOST, "/api/calc/one-house-exemption", buildOneHouseExemptionApiBody(f));
    expect(o.status).toBe(200);
    expect(s.exemption).toEqual(o.json.data);
  });

  it.each(cases)("[MH-P2] %s — headline = 계산기(calculateTransferTax)의 중과 판정", async (_name, mk) => {
    const f = mk();
    const s = await judge(f);
    const { engineInput } = buildJudgmentEngineInput(propertySchema.parse(buildMultiHouseSurchargeApiBody(f).property));
    const calc = calculateTransferTax(engineInput, loadFallbackTransferRates(engineInput.transferDate)).multiHouseSurchargeEvaluation!;
    expect(s.headline!.result.surchargeType).toBe(calc.surchargeType);
    expect(s.headline!.result.effectiveHouseCount).toBe(calc.effectiveHouseCount);
    expect(s.headline!.result.exclusionReasons.map((e) => e.type)).toEqual(calc.exclusionReasons.map((e) => e.type));
  });

  it("[MH-P4] 양도 주택 문화유산 선언 — 중과 본문은 배제(cultural_heritage), 1주택 본문은 싣지 않아 3주택 이상 중과", async () => {
    const f = {
      ...form({ regionCode: C.GANGNAM, price: "500000000" }, [
        { id: "sc", regionCode: C.SEOCHO, officialPrice: "500000000" },
        { id: "gn2", regionCode: C.GANGNAM, officialPrice: "500000000" },
      ]),
      sellingHouseExclusion: { isCulturalHeritage: true },
    } as OneHouseJudgmentFormData;
    const s = await judge(f);
    expect(s.headline!.result.surchargeType).toBe("none");
    expect(s.headline!.result.exclusionReasons.map((e) => e.type)).toContain("cultural_heritage");
    // 같은 폼의 1주택 본문으로는 같은 판정이 중과 — 배선 차이가 결론을 가른다(구별력)
    const { engineInput } = buildJudgmentEngineInput(propertySchema.parse(buildOneHouseExemptionApiBody(f)));
    const calc = calculateTransferTax(engineInput, loadFallbackTransferRates(engineInput.transferDate)).multiHouseSurchargeEvaluation!;
    expect(calc.surchargeType).toBe("multi_house_3plus");
  });
});
