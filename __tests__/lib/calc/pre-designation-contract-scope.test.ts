/**
 * 공고 전 매매계약(영 §167의10①11호 등) 입력 — ⑤ 노출 = ④ 전송 = ⑧ 검증 **같은 술어**
 * (`lib/calc/pre-designation-contract-scope.ts` · 계획서 regulated-area-region-code-match §5.5).
 *
 * ④는 `buildHousesPayload`가, ⑧은 `collectStepIssues(1)`이, ⑤는 `HousesListSection`이 부른다 — 여기서는
 * 앞의 둘을 **실제 호출 경로로** 본다(술어 leaf만 보면 배선을 증명하지 못한다 —
 * `feedback_library_anchor_does_not_prove_component_uses_it`).
 */
import { describe, it, expect } from "vitest";
import {
  preDesignationContractInScope,
  preDesignationContractInScopeOf,
} from "@/lib/calc/pre-designation-contract-scope";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
const GANGNAM = "1168010100";
const CHEONGJU = "4311110100"; // 2020-06-19 지정

const row: HouseEntry = {
  id: "h2",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2014-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};

function form(over: Partial<Form> = {}, assetOver: Record<string, unknown> = {}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2013-06-01", regionCode: GANGNAM, ...assetOver };
  return Object.assign(f, {
    transferDate: "2019-06-01",
    householdHousingCount: "2",
    houses: [row],
    sellingHouseExclusion: { saleDepositReceived: true, saleContractDate: "2017-07-01" },
    ...over,
  });
}
const sellingOf = (f: Form) =>
  (buildHousesPayload(f.assets[0], f.houses, f.presaleRights.length, f.sellingHouseExclusion, f.transferDate) as
    | Record<string, unknown>[]
    | undefined)?.[0];
const messages = (f: Form) => collectStepIssues(1, f).map((i) => i.message).filter((m) => m.includes("공고 전 매매계약"));

describe("범위 술어", () => {
  it("강남 · 주택 · 명부 1행 · 2019-06-01 → 범위 안", () => {
    expect(preDesignationContractInScopeOf(form())).toBe(true);
  });
  it.each([
    ["양도일 2018-08-27(호 시행 전)", { transferDate: "2018-08-27" }, {}],
    ["명부 0행 · 분양권 0건", { houses: [] }, {}],
    ["주택 계열 아님(토지)", {}, { assetKind: "land" }],
    ["법정동코드 없음", {}, { regionCode: "" }],
    ["양도일에 비조정(청주 2019)", {}, { regionCode: CHEONGJU }],
    ["양도일 형식 불완전", { transferDate: "2019-06" }, {}],
  ])("%s → 범위 밖", (_n, over, assetOver) => {
    expect(preDesignationContractInScopeOf(form(over as Partial<Form>, assetOver))).toBe(false);
  });
  it("분양권만 있어도 범위 안(④ `houses[]` 게이트와 같다)", () => {
    expect(
      preDesignationContractInScope({ assetKind: "housing", regionCode: GANGNAM, transferDate: "2019-06-01", houseRows: 0, presaleRights: 1 }),
    ).toBe(true);
  });
});

describe("④ 전송 — 범위 안 + 수령 ✅ + 계약일이 있을 때만", () => {
  it("범위 안 → 양도 주택 행에 contractDate · saleDepositReceived", () => {
    expect(sellingOf(form())).toMatchObject({ contractDate: "2017-07-01", saleDepositReceived: true });
  });
  it("수령 ❌ → 계약일도 싣지 않는다", () => {
    const s = sellingOf(form({ sellingHouseExclusion: { saleDepositReceived: false, saleContractDate: "2017-07-01" } }));
    expect(s?.contractDate).toBeUndefined();
    expect(s?.saleDepositReceived).toBeUndefined();
  });
  it("범위 밖(청주 2019)에 남은 값 → 싣지 않는다", () => {
    expect(sellingOf(form({}, { regionCode: CHEONGJU }))?.contractDate).toBeUndefined();
  });
  it("양도일 미제공(판정 메뉴 경로) → 싣지 않는다", () => {
    const f = form();
    const s = (buildHousesPayload(f.assets[0], f.houses, 0, f.sellingHouseExclusion, undefined) as Record<string, unknown>[])[0];
    expect(s.contractDate).toBeUndefined();
  });
  it("③ 구 기록·stale sessionStorage(새 필드 부재) → 싣지 않고 막지도 않는다", () => {
    const f = form({ sellingHouseExclusion: { isMortgageExecution: true } });
    expect(sellingOf(f)?.contractDate).toBeUndefined();
    expect(messages(f)).toEqual([]);
  });
});

describe("⑧ 검증 — ⑤·④와 같은 범위", () => {
  it("수령 ✅ + 계약일 비움 → 차단", () => {
    expect(messages(form({ sellingHouseExclusion: { saleDepositReceived: true } }))).toEqual([
      "양도 주택 공고 전 매매계약: 양도 매매계약 체결일을 입력하세요.",
    ]);
  });
  it("계약일 > 양도일 → 차단 · 계약일 = 양도일 → 통과", () => {
    expect(messages(form({ sellingHouseExclusion: { saleDepositReceived: true, saleContractDate: "2019-06-02" } }))).toHaveLength(1);
    expect(messages(form({ sellingHouseExclusion: { saleDepositReceived: true, saleContractDate: "2019-06-01" } }))).toEqual([]);
  });
  it("범위 밖이면 수령 ✅ + 계약일 비움이어도 막지 않는다(⑤가 숨긴 칸을 요구하지 않는다)", () => {
    expect(messages(form({ transferDate: "2018-08-27", sellingHouseExclusion: { saleDepositReceived: true } }))).toEqual([]);
  });
});
