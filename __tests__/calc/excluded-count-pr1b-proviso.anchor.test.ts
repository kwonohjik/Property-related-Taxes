/**
 * PR1b S03-4 앵커 — §154① 단서 게이트는 엔진과 같은 「제외 후 주택 수」로 연다.
 * 근거: 소득세법 시행령 §155②(「1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용」),
 *       조특법 §99의4①(「소유주택이 아닌 것으로 보아 소득세법 §89①3호를 적용」), §154① 단서 2호가목(수용).
 * 경로: 계산기 ⑧ → ④ → route(⑫⑭) · 판정 메뉴 ⑤④(judgmentProvisoMode) → route.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { POST as JPOST } from "@/app/api/calc/one-house-exemption/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { judgmentProvisoMode } from "@/lib/calc/one-house-judgment-section-scope";
import { hrow, runCalc } from "./_owned-at-transfer-pr1a-helpers";

const T = "2025-06-02";
const PROVISO = { provisoReason: "expropriation", provisoExpropriationDate: T, provisoBusinessApprovalDate: "2024-12-01" };
const inh = (d: string) => hrow({ id: "INH", acquisitionDate: d, isInherited: true, inheritedDate: d, isCoInherited: false, decedentSameHouseholdAtInheritance: false, parentalCareMergeInheritedHouse: false } as Partial<HouseEntry>);
const rural = () => hrow({ id: "R", region: "non_capital", acquisitionDate: "2024-06-01", countExclusion: { kind: "reduction", reduction: { type: "new_99_4_rural", ruralHouseAcquisitionDate: "2024-06-01", ruralHouseStdPrice: "100000000", isRegisteredHanok: false, isAdjacentArea: false, meetsLocationRequirement: true, meetsHometownRequirement: false } } } as Partial<HouseEntry>);
const N = () => hrow({ id: "N", acquisitionDate: "2024-10-01" });

async function calc(houses: HouseEntry[], sellAcq: string) {
  const f = createDefaultTransferFormData();
  f.transferDate = T; f.isOneHousehold = true; f.contractTotalPrice = "1000000000"; f.householdNoPresaleRightsConfirmed = true;
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: sellAcq, actualSalePrice: "1000000000", fixedAcquisitionPrice: "700000000", addressJibun: "서울특별시 테스트구 1", residenceInputMode: "direct", residencePeriods: [] });
  Object.assign(f, PROVISO);
  f.houses = houses;
  f.householdHousingCount = String(1 + houses.length);
  return runCalc(f);
}
function jform(houses: HouseEntry[], sellAcq: string) {
  const f = createInitialOneHouseJudgmentForm();
  f.isOneHousehold = true; f.transferDate = T; f.contractTotalPrice = "1000000000";
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: sellAcq, residenceInputMode: "direct", residencePeriods: [] });
  Object.assign(f, PROVISO);
  f.houses = houses;
  return f;
}
async function judg(houses: HouseEntry[], sellAcq: string) {
  const f = jform(houses, sellAcq);
  const res = await JPOST(new NextRequest("http://localhost/api/calc/one-house-exemption", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(buildOneHouseExemptionApiBody(f)) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((await res.json()) as any).data.judgment as { isExempt: boolean };
}

describe("S03-4 제외 후 1주택(일시적 2주택)이면 §154① 단서가 전송·적용된다", () => {
  it("계산기 · §155② 상속주택 + 수용 → 단서 전송 · 비과세 0", async () => {
    const r = await calc([inh("2024-09-01")], "2024-03-01");
    expect(r.issues).toEqual([]);
    expect(r.body.oneHouseExemptionProviso).toMatchObject({ reason: "expropriation" });
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
  it("계산기 · 조특법 §99의4 농어촌주택 + 수용 → 비과세 0", async () => {
    const r = await calc([rural()], "2024-03-01");
    expect(r.isExempt).toBe(true);
  });
  it("계산기 · 일시적 2주택 + §155② 상속주택(n=3) + 수용 → 비과세 0", async () => {
    const r = await calc([inh("2024-01-01"), N()], "2023-09-01");
    expect(r.isExempt).toBe(true);
  });
  it("판정 메뉴 · §155② 상속주택 + 수용 → mode one_house · 비과세", async () => {
    expect(judgmentProvisoMode(jform([inh("2024-09-01")], "2024-03-01"))).toBe("one_house");
    expect((await judg([inh("2024-09-01")], "2024-03-01")).isExempt).toBe(true);
  });
  it("판정 메뉴 · 일시적 2주택 + 상속주택(n=3) → mode temporary_two_house · 비과세", async () => {
    expect(judgmentProvisoMode(jform([inh("2024-01-01"), N()], "2023-09-01"))).toBe("temporary_two_house");
    expect((await judg([inh("2024-01-01"), N()], "2023-09-01")).isExempt).toBe(true);
  });
  it("[짝] 명부 없음 + 수용 → 비과세(현행 통과)", async () => {
    const r = await calc([], "2024-03-01");
    expect(r.isExempt).toBe(true);
  });
  it("[짝] 순수 2주택(상속·감면 아님) + 수용 → 단서 미전송 · 과세(제외할 주택이 없으니 2주택)", async () => {
    const plain = hrow({ id: "P", acquisitionDate: "2010-01-01" });
    const r = await calc([plain], "2024-03-01");
    expect(r.body.oneHouseExemptionProviso).toBeUndefined();
    expect(r.isExempt).toBe(false);
  });
  it("⑧ · §155② 상속주택 + 수용인데 수용일이 비면 막는다(④가 보내는 맥락이면 ⑧도 본다 — 3중 패턴)", async () => {
    const f = createDefaultTransferFormData();
    f.transferDate = T; f.isOneHousehold = true; f.contractTotalPrice = "1000000000"; f.householdNoPresaleRightsConfirmed = true;
    Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2024-03-01", actualSalePrice: "1000000000", fixedAcquisitionPrice: "700000000", addressJibun: "서울특별시 테스트구 1", residenceInputMode: "direct", residencePeriods: [] });
    Object.assign(f, { provisoReason: "expropriation", provisoExpropriationDate: "" });
    f.houses = [inh("2024-09-01")];
    f.householdHousingCount = "2";
    const r = await runCalc(f);
    expect(r.issues.some((i) => /수용/.test(i.message))).toBe(true);
  });
});
