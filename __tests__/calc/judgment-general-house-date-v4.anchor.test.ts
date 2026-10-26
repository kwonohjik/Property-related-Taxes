/**
 * anchor — §99의4①·§98의9① 「취득 전 보유」 일반주택 취득일: 판정 메뉴 두 곳·계산기·화면 leaf가 같은 날짜를 본다
 * (`docs/00-pm/multi-house-surcharge-menu-residuals.plan.md` §1 · V-4).
 *
 * 시료: 직계존속 2018-01-01 취득 → 2019-03-01 세대 보유 시작 → 2021-06-01 증여 → 2025-02-16 양도(9억 · 비조정 · 전주 완산구).
 * 명부에 §99의4 농어촌주택 1채(2020-06-01 취득) — 세대 보유 시작일 뒤 · 증여일 앞이다.
 *
 * | # | 주장 |
 * |---|---|
 * | GH-1 | 「계속 같은 세대 = 예」 — 1주택 판정 메뉴 비과세(농어촌주택 제외) |
 * | GH-2 | 같은 시료 — 다주택 중과 메뉴 비과세 요약 = 1주택 판정 메뉴 = 계산기(넘기기) |
 * | GH-3 | 「아니오」 음성 짝 — 세 곳 모두 과세(취득 순서 불성립) |
 * | GH-4 | §155⑳ 세대 구성도 같은 날짜 — 사례 E177-era(거주주택 + 장기임대 2호)를 같은 세대로 증여받은 주택으로 바꾸고 세대 보유 시작일 뒤 ·
 * |      | 증여일 앞에 취득한 농어촌주택을 더하면, 판정 메뉴·계산기 모두 구성 충족 · 비과세(「아니오」는 둘 다 불충족 · 과세) |
 * | GH-5 | 화면 leaf(`eligibleCountExcludedHouseIds`) — 「예」면 판정 메뉴 폼·계산기 폼 모두 농어촌주택을 뺀다 · 「아니오」면 빼지 않는다 |
 * | GH-6 | 용도변경 주택이어도 leaf와 계산기 엔진이 같은 행을 뺀다(엔진의 이 날짜는 용도변경을 보지 않는다) |
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST as POST_MH } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildMultiHouseSurchargeApiBody } from "@/lib/calc/multi-house-surcharge-api";
import { eligibleCountExcludedHouseIds } from "@/lib/calc/house-count-exclusion-rows";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { handoff, runJudgment, withToday } from "./_one-house-pr6a-routes";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import cases from "./one-house-rulings/cases/E177.json";
import { runCalc } from "./_one-house-pr3a-calc-route";
import { RH_ANSWERED_NO } from "./_helpers/phrp-154-10-answer";

const RURAL = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "",
  ruralHouseStdPrice: "100000000",
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};
const ruralRow = {
  id: "r1",
  region: "non_capital",
  regionCode: "4682025021",
  acquisitionDate: "2020-06-01",
  officialPrice: "100000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  acquisitionOrigin: "general",
  countExclusion: { kind: "reduction", reduction: RURAL },
} as unknown as HouseEntry;

function form(sameHousehold: "yes" | "no"): OneHouseJudgmentFormData {
  const asset = {
    ...makeDefaultAsset(1),
    rentalHousingException: RH_ANSWERED_NO,
    residenceInputMode: "direct",
    residencePeriods: [],
    assetKind: "housing",
    acquisitionCause: "gift",
    acquisitionDate: "2021-06-01",
    donorAcquisitionDate: "2018-01-01",
    giftDonorRelation: "lineal",
    giftSameHousehold: sameHousehold,
    giftHouseholdHoldingStartDate: sameHousehold === "yes" ? "2019-03-01" : "",
    standardPriceAtTransfer: "300000000",
    regionCode: "4511110100",
  } as AssetForm;
  return {
    ...createInitialOneHouseJudgmentForm(),
    assets: [asset],
    transferDate: "2025-02-16",
    contractTotalPrice: "900000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [ruralRow],
    presaleRights: [],
  } as unknown as OneHouseJudgmentFormData;
}

/** 넘기기 후 계산기 폼 — 직계존속 10년 안 증여라 이월과세로 바뀌고, 그 경로의 필수 금액 두 칸만 채운다. */
function calcForm(sameHousehold: "yes" | "no"): TransferFormData {
  const f = handoff(form(sameHousehold));
  const a = f.assets[0];
  return { ...f, assets: [{ ...a, carryover: { ...a.carryover!, donorAcquisitionPrice: "300000000", giftDateValuation: "500000000" } }] };
}

async function surchargeMenu(f: OneHouseJudgmentFormData) {
  const res = await POST_MH(
    new NextRequest("http://localhost/api/calc/multi-house-surcharge-judgment", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(buildMultiHouseSurchargeApiBody(f)),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await res.json()) as any;
}

describe("GH 판정 단계 일반주택 취득일", () => {
  it("[GH-1] 같은 세대 — 1주택 판정 메뉴 비과세 · 농어촌주택 제외", async () => {
    const j = await runJudgment(form("yes"));
    expect(j.ve.filter((x) => x.startsWith("error"))).toEqual([]);
    expect(j.data.judgment.isExempt).toBe(true);
  });

  it("[GH-2] 같은 세대 — 중과 메뉴 비과세 요약 = 판정 메뉴 = 계산기", async () => {
    const m = await surchargeMenu(form("yes"));
    const c = await runCalc(calcForm("yes"));
    expect(c.status).toBe(200);
    expect([m.data.exemption.judgment.isExempt, c.isExempt]).toEqual([true, true]);
    expect(c.r.houseCountExclusionDetails).toEqual([expect.objectContaining({ id: "new_99_4_rural", isEligible: true, houseId: "r1" })]);
  });

  it("[GH-3] 같은 세대 아님 — 세 곳 모두 과세(취득 순서 불성립)", async () => {
    const j = await runJudgment(form("no"));
    const m = await surchargeMenu(form("no"));
    const c = await runCalc(calcForm("no"));
    expect([j.data.judgment.isExempt, m.data.exemption.judgment.isExempt, c.isExempt]).toEqual([false, false, false]);
    expect(c.r.houseCountExclusionDetails[0].ineligibleReasons[0].code).toBe("ACQUISITION_ORDER");
  });
});

describe("GH-5 화면 leaf", () => {
  it("같은 세대면 판정 메뉴 폼·계산기 폼 모두 농어촌주택을 뺀다 · 아니면 빼지 않는다", () => {
    expect([...eligibleCountExcludedHouseIds(form("yes"))]).toEqual(["r1"]);
    expect([...eligibleCountExcludedHouseIds(calcForm("yes"))]).toEqual(["r1"]);
    expect([...eligibleCountExcludedHouseIds(form("no"))]).toEqual([]);
    expect([...eligibleCountExcludedHouseIds(calcForm("no"))]).toEqual([]);
  });
});

describe("GH-4 §155⑳ 세대 구성", () => {
  const base = (cases as RulingCase[]).find((c) => c.id === "E177-era")!;
  function rentalForm(sameHousehold: "yes" | "no"): OneHouseJudgmentFormData {
    const f = buildCaseForm(base);
    const asset = {
      ...f.assets[0],
      acquisitionCause: "gift",
      donorAcquisitionDate: "2012-01-01",
      giftDonorRelation: "lineal",
      giftSameHousehold: sameHousehold,
      giftHouseholdHoldingStartDate: sameHousehold === "yes" ? "2013-01-01" : "",
    } as AssetForm;
    return { ...f, assets: [asset], houses: [...f.houses, { ...ruralRow, acquisitionDate: "2016-01-01" }] };
  }

  it("같은 세대 — 판정 메뉴 구성 충족 · 비과세 / 아니오 — 불충족 · 과세", async () => {
    await withToday(base.today!, async () => {
      const yes = await runJudgment(rentalForm("yes"));
      const no = await runJudgment(rentalForm("no"));
      expect([yes.ve, no.ve].map((v) => v.filter((x) => x.startsWith("error")))).toEqual([[], []]);
      expect([yes.data.rentalHousingException.passed, yes.data.judgment.isExempt]).toEqual([true, true]);
      expect([no.data.rentalHousingException.passed, no.data.judgment.isExempt]).toEqual([false, false]);
    });
  });

  it("계산기(넘기기)도 같은 결론", async () => {
    await withToday(base.today!, async () => {
      const toCalc = (h: "yes" | "no") => {
        const f = handoff(rentalForm(h));
        const a = f.assets[0];
        return { ...f, assets: [{ ...a, carryover: { ...a.carryover!, donorAcquisitionPrice: "300000000", giftDateValuation: "500000000" } }] };
      };
      const yes = await runCalc(toCalc("yes"));
      const no = await runCalc(toCalc("no"));
      expect([yes.status, no.status]).toEqual([200, 200]);
      expect([yes.isExempt, no.isExempt]).toEqual([true, false]);
    });
  });
});

describe("GH-6 용도변경 주택", () => {
  it("leaf와 계산기 엔진이 같은 행을 뺀다", async () => {
    const f = calcForm("yes");
    const conv = { ...f, assets: [{ ...f.assets[0], hasNonHousingConversion: true, residentialUseStartDate: "2022-01-01" }] } as TransferFormData;
    const c = await runCalc(conv);
    expect([c.status, c.err]).toEqual([200, undefined]);
    expect(c.r.houseCountExclusionDetails).toEqual([expect.objectContaining({ houseId: "r1", isEligible: true })]);
    expect([...eligibleCountExcludedHouseIds(conv)]).toEqual(["r1"]);
  });
});
