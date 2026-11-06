/**
 * L8 NH-80 anchor — 판정 메뉴 결과의 §99의4 제외 명세에 «보유기간»과 ⑥ 사후관리 고지를 싣는다 (사용자 결정 Q-23: 결과 화면만 — 이력·인쇄 별도 작업 없음).
 *
 * 법문(KoreanLaw MCP 실독 2026-11-06, 조특법 MST 284389 · 조특령 MST 288915):
 *  - 조특법 §99의4④ 「…3년 이상 보유 요건을 충족하기 전에 일반주택을 양도하는 경우에도 제1항을 적용한다」
 *  - 조특법 §99의4⑥ 「제4항에 따른 양도소득세의 특례를 적용받은 1세대가 농어촌주택등을 3년 이상 보유하지 아니하게 된 경우에는 … 그 보유하지
 *    아니하게 된 날이 속하는 달의 말일부터 2개월 이내에 양도소득세로 납부하여야 한다. 다만, … 수용 등 대통령령으로 정하는 부득이한 사유가 있는 경우에는 그러하지 아니하다」
 *  - 조특령 §99의4⑧(⑥ 본문 세액) · ⑨(⑥ 단서 부득이한 사유: 수용·상속·멸실)
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | A-1 | 보유 3년 미만(1년) 적격 선언 → 명세 notes에 보유기간 1년 + ⑥ 납부 고지(조문·령) — 값은 엔진 평가기 그대로 |
 * | A-2 | 짝 — 보유 3년 이상(4년) → 보유기간 4년 + 「⑥ 사후관리 대상이 아닙니다」, 납부 고지는 없다 |
 * | A-3 | 기존 notes 순서 불변 — 적용 한도·확인 필요가 앞에 온다(`new-99-4-l2b.ui.test.tsx` 계약) |
 * | A-4 | 고향주택 라벨 |
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-asset";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { RH_ANSWERED_NO } from "./_helpers/phrp-154-10-answer";

const asset = (): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    rentalHousingException: RH_ANSWERED_NO,
    residenceInputMode: "direct",
    residencePeriods: [],
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01",
  }) as AssetForm;

const RURAL = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "",
  ruralHouseStdPrice: "150000000",
  isRegisteredHanok: false,
  adjacentArea994: "no" as const,
  meetsLocationRequirement: true,
} as AssetReductionForm;
const HOMETOWN = { ...RURAL, type: "new_99_4_hometown", meetsHometownRequirement: true } as AssetReductionForm;

const row = (reduction: AssetReductionForm, acquisitionDate: string) => ({
  id: "h1",
  region: "non_capital",
  acquisitionDate,
  officialPrice: "150000000",
  isInherited: false,
  isLongTermRental: false,
  countExclusion: { kind: "reduction", reduction },
});

const formOf = (houses: unknown[], transferDate = "2024-06-01") =>
  ({
    ...createInitialOneHouseJudgmentForm(),
    assets: [asset()],
    transferDate,
    contractTotalPrice: "900000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses,
    presaleRights: [],
  }) as unknown as OneHouseJudgmentFormData;

const form = (reduction: AssetReductionForm, acquisitionDate: string) =>
  ({
    ...createInitialOneHouseJudgmentForm(),
    assets: [asset()],
    transferDate: "2024-06-01",
    contractTotalPrice: "900000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [row(reduction, acquisitionDate)],
    presaleRights: [],
  }) as unknown as OneHouseJudgmentFormData;

async function notesOf(f: OneHouseJudgmentFormData): Promise<string[]> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(f)),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(200);
  expect(json.data.houseCount.excluded).toHaveLength(1);
  return json.data.houseCount.excluded[0].notes ?? [];
}

describe("NH-80 판정 메뉴 §99의4 보유기간·⑥ 사후관리 고지", () => {
  it("[A-1] 농어촌주택 보유 1년(2022-09-01 취득 · 양도 2024-06-01) → 보유기간 1년 + ⑥ 납부 고지", async () => {
    const notes = await notesOf(form(RURAL, "2022-09-01"));
    expect(notes).toContain("농어촌주택 보유기간 1년 (양도일 기준)");
    const aftercare = notes.find((n) => n.includes("보유 3년 미만"));
    expect(aftercare).toContain("조특법 §99의4④");
    expect(aftercare).toContain("조특법 §99의4⑥");
    expect(aftercare).toContain("조특령 §99의4⑧");
    expect(aftercare).toContain("조특령 §99의4⑨");
    expect(aftercare).toContain("양도소득세로 납부해야 합니다");
  });

  it("[A-2] 짝 — 보유 4년(2020-01-01 취득) → 보유기간 4년 · 사후관리 대상 아님 · 납부 고지 없음", async () => {
    const notes = await notesOf(form(RURAL, "2020-01-01"));
    expect(notes).toContain("농어촌주택 보유기간 4년 (양도일 기준)");
    expect(notes.some((n) => n.includes("⑥ 사후관리 대상이 아닙니다") || n.includes("조특법 §99의4⑥ 사후관리 대상이 아닙니다"))).toBe(true);
    expect(notes.some((n) => n.includes("양도소득세로 납부해야 합니다"))).toBe(false);
  });

  it("[A-3] 적용 한도 줄이 첫째로 남는다(기존 계약)", async () => {
    const notes = await notesOf(form(RURAL, "2022-09-01"));
    expect(notes[0]).toContain("적용 한도: 취득 당시 기준시가 합계");
  });

  it("[A-4] 고향주택은 라벨이 바뀐다", async () => {
    const notes = await notesOf(form(HOMETOWN, "2022-09-01"));
    expect(notes).toContain("고향주택 보유기간 1년 (양도일 기준)");
  });
});

describe("NH-50 확장 (a) — 판정 메뉴도 면적 초과 선언을 「1채」에서 빼고 주택 수에 남긴다", () => {
  const land = (sqm: string) => ({ ...RURAL, ruralLandAreaSqm994: sqm, ruralHouseType994: "other", ruralHouseFloorAreaSqm994: "100" }) as unknown as AssetReductionForm;
  async function detail(secondLand: string) {
    const f = formOf([{ ...row(land("330"), "2015-03-01"), id: "r1" }, { ...row(land(secondLand), "2018-03-01"), id: "r2" }], "2019-06-01");
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(buildOneHouseExemptionApiBody(f)),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);
    return json.data.houseCount as { total: number; countedForExemption: number; excluded: { houseId?: string }[]; notApplied?: { houseId?: string; reasons: string[] }[] };
  }
  it("[MH-7] r2 대지 661㎡ → r1만 제외 · r2는 불성립 사유(대지 660㎡ 초과)와 함께 주택 수에 남는다 (3채 중 2채)", async () => {
    const h = await detail("661");
    expect(h.total).toBe(3);
    expect(h.excluded.map((e) => e.houseId)).toEqual(["r1"]);
    expect(h.notApplied?.find((n) => n.houseId === "r2")?.reasons.join(" ")).toContain("660㎡를 초과");
    expect(h.countedForExemption).toBe(2);
  });
  it("[MH-7+] 짝 — r2 대지 660㎡면 2채로 세어 둘 다 불성립(MULTIPLE_HOUSES) → 3채 그대로", async () => {
    const h = await detail("660");
    expect(h.excluded).toEqual([]);
    expect(h.countedForExemption).toBe(3);
  });
});
