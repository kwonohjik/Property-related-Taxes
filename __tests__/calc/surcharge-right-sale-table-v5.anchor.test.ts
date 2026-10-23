/**
 * anchor — 다주택 중과 판정: 조합원입주권 양도의 보유 주택별 표(`multi-house-surcharge-menu-residuals.plan.md` §2 · V-5 · PR-2).
 *
 * 입주권 양도는 중과가 없다(§104⑦은 주택 양도 — 자산 게이트). 표는 「같은 양도일에 다른 주택을 대신 양도한다면」을 보이고,
 * 그때 양도 입주권은 보유 권리로 센다. 가액기준 지역이면 종전 주택의 가격 3억원 이하는 주택 수에 넣지 않는다
 * (영 §167의4②1호·§167의11②1호). 시료: 양도일 2021-06-01 · 강남·서초 주택 각 5억(조정대상지역).
 *
 * | # | 주장 |
 * |---|---|
 * | RS-1 | 구미(가액기준) 입주권 · 2.5억 → 입주권 불산입 · 주택 수 2 · 각 주택 2주택 중과(간이) |
 * | RS-2 | 같은 시료 · 가격 비움 → 산입(모름 = 혜택 불성립) · 주택 수 3 · 3주택 이상 중과 |
 * | RS-3 | 광명(지역기준) 입주권 · 2.5억 → 가액과 무관하게 산입(음성 짝) |
 * | RS-4 | 비과세 요약(1주택 판정 본문)은 이 칸과 무관 — 본문에 싣지 않고 결론도 같다 |
 * | RS-5 | ④ — 입주권 양도일 때만 · 0·빈 값은 싣지 않는다 · 주택 양도에 남은 값도 싣지 않는다 · ⑫는 0을 받지 않는다 |
 * | RS-6 | 넘기기(계산기)에는 이 칸을 넘기지 않는다 |
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import { buildMultiHouseSurchargeApiBody } from "@/lib/calc/multi-house-surcharge-api";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { SELLING_RIGHT_ROW_ID } from "@/lib/tax-engine/multi-house-surcharge-narrative-steps";
import type { MultiHouseSurchargeJudgmentResponse } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";

const GUMI = "4719010100";
const GWANGMYEONG = "4121010100";

function form(regionCode: string, value: string, assetKind = "right_to_move_in"): OneHouseJudgmentFormData {
  const c = {
    id: "v5",
    form: {
      transferDate: "2021-06-01",
      contractTotalPrice: "500000000",
      isOneHousehold: true,
      asset: { assetKind, acquisitionDate: "2015-01-01", regionCode, standardPriceAtTransfer: "500000000" },
      houses: [
        { id: "gnm", acquisitionDate: "2015-01-01", regionCode: "1168010100", officialPrice: "500000000" },
        { id: "sc", acquisitionDate: "2015-01-01", regionCode: "1165010100", officialPrice: "500000000" },
      ],
    },
  } as unknown as RulingCase;
  return { ...buildCaseForm(c), surchargeSellingRightValue: value };
}

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/multi-house-surcharge-judgment", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: (await res.json()) as any };
}
async function judge(f: OneHouseJudgmentFormData): Promise<MultiHouseSurchargeJudgmentResponse> {
  const r = await post(buildMultiHouseSurchargeApiBody(f));
  expect(r.status, JSON.stringify(r.json?.error)).toBe(200);
  return r.json.data;
}
const sellingRight = (d: MultiHouseSurchargeJudgmentResponse) => d.rows!.rights.find((r) => r.rightId === SELLING_RIGHT_ROW_ID);
const houseCells = (d: MultiHouseSurchargeJudgmentResponse) =>
  d.rows!.houses.map((h) => [h.houseId, h.basis, h.result.surchargeType, h.result.effectiveHouseCount]);

describe("RS 입주권 양도 표", () => {
  it("[RS-1] 가액기준 · 2.5억 → 입주권 불산입 · 주택 수 2 · 2주택 중과(간이)", async () => {
    const d = await judge(form(GUMI, "250000000"));
    expect(d.scope).toEqual({ supported: false, reason: "non_housing_sale" });
    expect(d.headline).toBeUndefined();
    expect(sellingRight(d)).toEqual({ rightId: SELLING_RIGHT_ROW_ID, type: "redevelopment_right", countReason: "low_value_local", spouseSubtracted: false });
    expect(houseCells(d)).toEqual([
      ["gnm", "simplified", "multi_house_2", 2],
      ["sc", "simplified", "multi_house_2", 2],
    ]);
    expect(d.rightSaleHouseCount).toBe(2);
  });

  it("[RS-2] 가격 비움 → 산입 · 주택 수 3 · 3주택 이상 중과", async () => {
    const d = await judge(form(GUMI, ""));
    expect(sellingRight(d)!.countReason).toBe("counted");
    expect(houseCells(d).map((c) => c[2])).toEqual(["multi_house_3plus", "multi_house_3plus"]);
    expect(d.rightSaleHouseCount).toBe(3);
  });

  it("[RS-3] 지역기준(광명) · 2.5억 → 가액과 무관하게 산입", async () => {
    const d = await judge(form(GWANGMYEONG, "250000000"));
    expect(sellingRight(d)!.countReason).toBe("counted");
    expect(d.rightSaleHouseCount).toBe(3);
  });

  it("[RS-4] 비과세 요약은 이 칸과 무관 — 1주택 본문에 없고 결론이 같다", async () => {
    expect("surchargeSellingRightValue" in buildOneHouseExemptionApiBody(form(GUMI, "250000000"))).toBe(false);
    const [withValue, without] = [await judge(form(GUMI, "250000000")), await judge(form(GUMI, ""))];
    expect(withValue.exemption).toEqual(without.exemption);
  });
});

describe("RS-5·6 전달", () => {
  it("[RS-5] 입주권 양도일 때만 · 0·빈 값 미전송 · 주택 양도에 남은 값 미전송 · ⑫는 0을 거부", async () => {
    expect(buildMultiHouseSurchargeApiBody(form(GUMI, "250000000")).sellingRightValue).toBe(250000000);
    expect("sellingRightValue" in buildMultiHouseSurchargeApiBody(form(GUMI, ""))).toBe(false);
    expect("sellingRightValue" in buildMultiHouseSurchargeApiBody(form(GUMI, "0"))).toBe(false);
    expect("sellingRightValue" in buildMultiHouseSurchargeApiBody(form(GUMI, "250000000", "housing"))).toBe(false);
    const body = buildMultiHouseSurchargeApiBody(form(GUMI, ""));
    expect((await post({ ...body, sellingRightValue: 0 })).status).toBe(400);
  });

  it("[RS-6] 계산기로 넘기지 않는다", () => {
    expect("surchargeSellingRightValue" in toTransferFormPatch(form(GUMI, "250000000"))).toBe(false);
  });
});

describe("RS 주택 양도는 그대로", () => {
  it("주택 양도면 표에 양도 예정 입주권 행이 없고 headline이 있다", async () => {
    const d = await judge(form(GUMI, "250000000", "housing"));
    expect(d.scope).toEqual({ supported: true });
    expect(d.headline).toBeDefined();
    expect(d.rightSaleHouseCount).toBeUndefined();
    expect(sellingRight(d)).toBeUndefined();
  });
});
