/**
 * PR-10 anchor (2026-11 리뷰 D-13) — 중과 메뉴에서 켠 명부 행의 중과 전용 사실이 1주택 메뉴 본문에 실려 400 · 1주택 화면에는 고칠 칸이 없다.
 *
 * 두 판정 메뉴가 명부를 공유한다. 1주택 route는 이 사실을 읽지 않으므로(3호 on·off 판정 결과 같음 — 리뷰 실측) 1주택 본문은 싣지 않는다
 * (`buildHousesPayload` 옵션 `omitSurchargeOnlyRowFacts` = `judgmentMenuFlags("one_house").hideSurchargeInputs`). 중과 본문은 그대로 싣는다.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST as oneHousePOST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { RH_ANSWERED_NO } from "./_helpers/phrp-154-10-answer";
import { validateStepByIndex } from "@/lib/calc/one-house-exemption-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { makeHouse } from "./one-house-rulings/harness";

const GANGNAM = "1168010100";
function form(rowOver: Partial<HouseEntry>): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2021-06-01",
    contractTotalPrice: "500000000",
    assets: [
      {
        ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", regionCode: GANGNAM,
        residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "24",
        rentalHousingException: RH_ANSWERED_NO,
      },
    ],
    houses: [makeHouse("h1", { regionCode: GANGNAM, officialPrice: "500000000", acquisitionDate: "2010-01-01", ...rowOver })],
  } as OneHouseJudgmentFormData;
}
async function judge(f: OneHouseJudgmentFormData) {
  const res = await oneHousePOST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(f)),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: (await res.json()) as any };
}
const errors = (f: OneHouseJudgmentFormData) => [0, 1, 2].flatMap((s) => validateStepByIndex(f, s)).filter((e) => e.severity === "error");

const SAMPLES: [string, Partial<HouseEntry>][] = [
  ["3호 칩 ON + 임대개시일 없음", { isTaxIncentiveRental: true } as Partial<HouseEntry>],
  ["3호 후단 ⑪ 연장 「있음」 + 날짜 미완", { isTaxIncentiveRental: true, rentalStartDate: "2012-01-01", taxIncentiveRentalAptDeadlineExtension: { status: "has" } } as Partial<HouseEntry>],
];

describe("D-13 1주택 본문은 중과 전용 행 사실을 싣지 않는다", () => {
  it.each(SAMPLES)("%s — 1주택 ⑧ 0건 · route 200 · 본문 행에 3호 키 없음", async (_n, over) => {
    const f = form(over);
    expect(errors(f)).toEqual([]);
    const row = (buildOneHouseExemptionApiBody(f).houses as Array<Record<string, unknown>>).find((h) => h.id === "h1")!;
    expect(row).not.toHaveProperty("isTaxIncentiveRental");
    const r = await judge(f);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  });
  it("판정은 그 사실이 없는 행과 같다", async () => {
    const [a, b] = await Promise.all([judge(form({})), judge(form(SAMPLES[0][1]))]);
    expect(b.json.data.judgment).toEqual(a.json.data.judgment);
  });
  it("대조 — 옵션 없는 빌더(계산기·중과 메뉴 본문)는 그대로 싣는다", () => {
    const f = form(SAMPLES[0][1]);
    const rows = buildHousesPayload(f.assets[0], f.houses, 0, undefined, f.transferDate) as Array<Record<string, unknown>>;
    expect(rows.find((h) => h.id === "h1")!.isTaxIncentiveRental).toBe(true);
  });
});
