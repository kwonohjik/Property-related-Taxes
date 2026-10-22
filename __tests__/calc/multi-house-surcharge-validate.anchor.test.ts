/**
 * anchor — 다주택 중과 판정 메뉴 ⑧(계획서 `multi-house-surcharge-judgment-menu.plan.md` §5.9 · P6a) · M1 · MH-P8.
 *
 * - VC-0 왜 M1이 필수인가: 가액기준 지역 양도 주택의 양도 당시 기준시가가 없으면 1호(3억 이하 불산입·중과 배제)를 판정할 수 없다.
 *   종전 엔진은 0을 3억 이하로 읽어 주택 수에서 뺐다(납세자 유리) — 계산기 PR-2(`calc-selling-house-std-price-value-region.plan.md`)부터
 *   0은 미입력이다(산입 + 판정 불가 경고). 값이 3억 이하여야 1호가 선다.
 * - VC-1~2 M1·가액기준 행 기준시가 — 칸·⑧이 같은 술어(`surcharge-price-criteria.ts`)
 * - VC-3~5 중과 축 leaf(계산기 ⑧과 같은 것) — 1주택 ⑧에는 없고 중과 ⑧에만 있다 · 행별 첫 오류 1건
 * - VC-6 3중 패턴 — ⑧이 막는 값과 ④가 싣는 값이 같은 칸이다
 * - MH-P8 1주택 판정 불변 — 판정 폼에 중과 축을 채워도 1주택 본문은 그 값을 싣지 않고 판정도 같다(F-3 · P-2 안전망 0 실측)
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST as surchargePOST } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import { POST as oneHousePOST } from "@/app/api/calc/one-house-exemption/route";
import { buildMultiHouseSurchargeApiBody } from "@/lib/calc/multi-house-surcharge-api";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateSurchargeStepByIndex } from "@/lib/calc/multi-house-surcharge-validate";
import { validateStepByIndex } from "@/lib/calc/one-house-exemption-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { makeHouse } from "./one-house-rulings/harness";

const ASAN = "4420010100"; // 충남 아산시 — 가액기준
const GANGNAM = "1168010100"; // 서울 강남구 — 지역기준

function form(sellingCode: string, price: string, houses: HouseEntry[] = [], over: Partial<OneHouseJudgmentFormData> = {}) {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2021-06-01",
    contractTotalPrice: "500000000",
    assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", regionCode: sellingCode, standardPriceAtTransfer: price }],
    houses,
    ...over,
  } as OneHouseJudgmentFormData;
}
/** 명부 행 — 양도 주택(2015)보다 먼저 취득해 §155① 신규 주택 질문이 걸리지 않게 한다 */
const row = (id: string, over: Partial<HouseEntry>) => makeHouse(id, { acquisitionDate: "2010-01-01", ...over });
const errorsOf = (f: OneHouseJudgmentFormData, step: number) =>
  validateSurchargeStepByIndex(f, step).filter((e) => e.severity === "error");
const fields = (f: OneHouseJudgmentFormData, step: number) => errorsOf(f, step).map((e) => e.field);

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

describe("VC-0 — 가액기준 양도 주택의 기준시가 없이는 1호를 판정할 수 없다(M1이 필수인 이유)", () => {
  const rows = [row("h1", { regionCode: GANGNAM, officialPrice: "500000000" }), row("h2", { regionCode: GANGNAM, officialPrice: "500000000" })];
  const judge = (price: string) =>
    post(surchargePOST, "/api/calc/multi-house-surcharge-judgment", buildMultiHouseSurchargeApiBody(form(ASAN, price, rows)));
  it("비움 → 3억 이하로 읽지 않는다: 산입(3) / 2억 → 1호로 불산입 / 4억 → 산입(3)", async () => {
    const [empty, low, high] = await Promise.all([judge(""), judge("200000000"), judge("400000000")]);
    expect([empty.status, low.status, high.status]).toEqual([200, 200, 200]);
    const ids = (r: typeof empty) => r.json.data.headline.result.excludedHouses.map((e: { houseId: string }) => e.houseId);
    expect(ids(empty)).not.toContain("selling");
    expect(empty.json.data.headline.result.effectiveHouseCount).toBe(3);
    expect(ids(low)).toContain("selling");
    expect(high.json.data.headline.result.effectiveHouseCount).toBe(3);
  });
});

describe("VC-1 — M1 양도 당시 기준시가(② 양도 대상)", () => {
  it("가액기준 + 비움 → 차단 · 값이 있으면 통과", () => {
    expect(fields(form(ASAN, ""), 1)).toContain("standardPriceAtTransfer");
    expect(fields(form(ASAN, "200000000"), 1)).not.toContain("standardPriceAtTransfer");
  });
  it("지역기준 · 소재지 없음(지역기준으로 싣는다) · 입주권 양도는 요구하지 않는다", () => {
    expect(fields(form(GANGNAM, ""), 1)).not.toContain("standardPriceAtTransfer");
    expect(fields(form("", ""), 1)).not.toContain("standardPriceAtTransfer");
    const right = form(ASAN, "");
    right.assets = [{ ...right.assets[0], assetKind: "right_to_move_in" }];
    expect(fields(right, 1)).not.toContain("standardPriceAtTransfer");
  });
  it("1주택 메뉴 ⑧은 이 칸을 요구하지 않는다(칸도 없다)", () => {
    expect(validateStepByIndex(form(ASAN, ""), 1).map((e) => e.field)).not.toContain("standardPriceAtTransfer");
  });
});

describe("VC-2 — 가액기준 행의 기준시가(③ 보유 주택)", () => {
  it("행 코드가 가액기준 · 코드 없고 「가액기준」 선택 → 차단 / 지역기준 → 통과", () => {
    expect(fields(form(GANGNAM, "", [row("h1", { regionCode: ASAN, region: "non_capital", officialPrice: "" })]), 2)).toContain("houses.0.officialPrice");
    expect(fields(form(GANGNAM, "", [row("h1", { region: "non_capital", officialPrice: "" })]), 2)).toContain("houses.0.officialPrice");
    expect(fields(form(GANGNAM, "", [row("h1", { regionCode: GANGNAM, officialPrice: "" })]), 2)).toEqual([]);
    expect(fields(form(GANGNAM, "", [row("h1", { regionCode: ASAN, region: "non_capital", officialPrice: "250000000" })]), 2)).toEqual([]);
  });
});

describe("VC-3~5 — 중과 축 leaf", () => {
  it("[VC-3] 등록 장기임대 행의 등록일 누락: 중과 ⑧만 막는다(1주택 ⑧은 그 칸을 닫는다)", () => {
    const f = form(GANGNAM, "", [row("h1", { regionCode: GANGNAM, officialPrice: "500000000", isLongTermRental: true, isRegisteredRental: true })]);
    expect(errorsOf(f, 2).map((e) => e.message).join()).toMatch(/임대사업자 등록일/);
    expect(validateStepByIndex(f, 2).filter((e) => e.severity === "error")).toEqual([]);
  });
  it("[VC-4] 1주택 ⑧이 이미 오류를 낸 행에는 중과 축 오류를 더하지 않는다(행별 첫 오류 1건)", () => {
    const f = form(GANGNAM, "", [row("h1", { regionCode: GANGNAM, officialPrice: "500000000", isInherited: true, inheritedDate: "" })]);
    const rowErrors = errorsOf(f, 2).filter((e) => e.field.startsWith("houses.0"));
    expect(rowErrors).toHaveLength(1);
    expect(rowErrors[0].field).toBe("houses.0.inheritedDate");
  });
  it("[VC-5] 양도 주택 사원용 주택 연수 · 한시 유예 계약일 누락 → 중과 ⑧만 막는다", () => {
    const rows = [row("h1", { regionCode: GANGNAM, officialPrice: "500000000" })];
    const f = form(GANGNAM, "", rows, {
      transferDate: "2026-08-01",
      sellingHouseExclusion: { isEmployeeHousing: true },
      gracePeriod: { contractDate: "" },
    });
    expect(fields(f, 2)).toEqual(expect.arrayContaining(["sellingHouseExclusion.freeProvisionYears", "gracePeriod.contractDate"]));
    expect(validateStepByIndex(f, 2).filter((e) => e.severity === "error")).toEqual([]);
  });
  it("[VC-5 짝] 명부가 비면 한시 유예는 범위 밖이라 막지 않는다(⑤·④와 같은 게이트)", () => {
    const f = form(GANGNAM, "", [], { transferDate: "2026-08-01", gracePeriod: { contractDate: "" } });
    expect(fields(f, 2)).not.toContain("gracePeriod.contractDate");
  });
});

describe("VC-6 — 3중 패턴: ⑧이 요구하는 칸이 ④ 본문 양도 주택 행의 기준시가다", () => {
  it("입력한 양도 당시 기준시가가 양도 주택 행 officialPrice로 실린다", () => {
    const body = buildMultiHouseSurchargeApiBody(form(ASAN, "234000000", [row("h1", { regionCode: GANGNAM, officialPrice: "500000000" })]));
    const sell = (body.property.houses as Array<Record<string, unknown>>).find((h) => h.id === "selling");
    expect(sell?.officialPrice).toBe(234_000_000);
  });
});

describe("MH-P8 — 1주택 판정 불변", () => {
  const rows = [row("h1", { regionCode: GANGNAM, officialPrice: "500000000", acquisitionDate: "2019-01-01" })];
  const plain = form(GANGNAM, "", rows);
  const filled = form(GANGNAM, "900000000", rows, {
    sellingHouseExclusion: { isMortgageExecution: true, isCulturalHeritage: true },
    gracePeriod: { contractDate: "2021-01-01", isLandPermitTarget: false },
  });
  it("1주택 본문은 양도 주택 배제 사실·한시 유예를 싣지 않는다", () => {
    const body = buildOneHouseExemptionApiBody(filled) as Record<string, unknown>;
    const sell = (body.houses as Array<Record<string, unknown>>).find((h) => h.id === "selling")!;
    expect(sell.isMortgageExecution).not.toBe(true);
    expect(sell.isCulturalHeritage).not.toBe(true);
    expect(body.gracePeriod).toBeUndefined();
  });
  it("1주택 route의 판정이 채우기 전과 같다", async () => {
    const a = await post(oneHousePOST, "/api/calc/one-house-exemption", buildOneHouseExemptionApiBody(plain));
    const b = await post(oneHousePOST, "/api/calc/one-house-exemption", buildOneHouseExemptionApiBody(filled));
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.json.data.judgment).toEqual(a.json.data.judgment);
  });
});
