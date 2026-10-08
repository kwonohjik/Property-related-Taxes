/**
 * @vitest-environment jsdom
 *
 * anchor — §89①4호 입주권 양도: **조특법이 소유주택으로 보지 않는 주택은 가·나목 「다른 주택」에서 뺀다** (평가셋 G049·G050·G065).
 * 사전-2018-법령해석재산-0143 · 사용자 결정 2026-10-08 「해석례대로 전 기간 제외」.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | X-1 | route | 명부 미분양주택 행에 제외 선언 → 가목 비과세 · 선언 없으면 과세(짝) |
 * | X-2 | route | §155② 상속주택 제외는 입주권 판정에서 빼지 않는다(E094 양론 축) |
 * | X-3 | leaf | 뺀 행은 명부에서도 지워 혼인합가 leaf가 다시 빼지 않는다(이중 차감 없음) |
 * | X-4 | ④·⑤ | 입주권 양도에도 행의 제외 선언을 싣고 · 명부 배지를 띄운다 |
 * | X-5 | route·④·⑤ | 해석례 미확보 조문은 빼지 않는다 — §99의4 농어촌주택 행 · §98의3 감면주택 행(음성) + 안내 |
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildCaseForm, observeCase, type RulingCase } from "./one-house-rulings/harness";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import {
  oneRightInputAfterSpecialActExclusion,
  rightSaleSpecialExclusionApplies,
} from "@/lib/tax-engine/one-house/right-sale-special-act-exclusion";
import { oneRightOtherHouseCount } from "@/lib/tax-engine/one-house/right-sale-marriage-merge";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const CASES = path.join(__dirname, "one-house-rulings", "cases");
const load = (file: string, id: string) =>
  (JSON.parse(fs.readFileSync(path.join(CASES, file), "utf8")) as RulingCase[]).find((c) => c.id === id)!;

const G065 = load("G065.json", "G065-era");
const withoutDeclaration = (c: RulingCase): RulingCase =>
  ({
    ...c,
    form: { ...c.form, houses: c.form!.houses!.map((h) => ({ ...h, countExclusion: undefined })) },
  }) as RulingCase;

describe("X-1 route", () => {
  it("미분양주택 행 제외 선언 → 가목 비과세 · 선언 없으면 나목 3년 초과 과세", async () => {
    const yes = await observeCase(G065);
    expect(yes.isExempt).toBe(true);
    expect(yes.appliedExceptions).toContain("one_right_89_1_4_ga");
    const no = await observeCase(withoutDeclaration(G065));
    expect(no.isExempt).toBe(false);
  });
});

describe("X-2 route — §155② 상속주택 제외는 입주권 판정에 쓰지 않는다", () => {
  it("E094 — 주택 수 제외에는 상속주택이 보이지만 입주권 판정은 과세", async () => {
    const o = await observeCase(load("E094.json", "E094-dual"));
    expect(o.excludedHouses.map((x) => x.houseId)).toContain("mother-house");
    expect(o.isExempt).toBe(false);
  });
});

describe("X-3 leaf — 이중 차감 없음", () => {
  it("배우자 쪽 유일 주택이 조특 제외 행이면 혼인합가로 한 번 더 빼지 않는다", () => {
    const D = (s: string) => new Date(s);
    const input = {
      householdHousingCount: 2,
      marriageMerge: { marriageDate: D("2018-05-15") },
      isFirstTransferredInMerge: true,
      acquisitionDate: D("2012-03-15"),
      transferDate: D("2026-06-15"),
      houses: [
        { id: "A", acquisitionDate: D("2010-04-15"), mergeOrigin: "counterpart_side" },
        { id: "C", acquisitionDate: D("2024-09-15") },
      ],
    } as unknown as TransferTaxInput;
    const after = oneRightInputAfterSpecialActExclusion(input, {
      specialHouseExclusionDetail: { entries: [{ eligible: true, article: "unsold_98_2", houseId: "A" }] },
    });
    expect(after.householdHousingCount).toBe(1);
    expect(after.houses?.map((h) => h.id)).toEqual(["C"]);
    expect(oneRightOtherHouseCount(after)).toBe(1); // 2 − 조특 1 (혼인합가 0 — 배우자 쪽 행이 남지 않았다)
    // 제외가 없으면 입력 그대로(같은 참조)
    expect(oneRightInputAfterSpecialActExclusion(input, { specialHouseExclusionDetail: { entries: [] } })).toBe(input);
    // 해석례 미확보 조문은 요건을 갖춰도(eligible) 빼지 않는다
    const unconfirmed = { specialHouseExclusionDetail: { entries: [{ eligible: true, article: "unsold_98_3", houseId: "A" }] } };
    expect(oneRightInputAfterSpecialActExclusion(input, unconfirmed)).toBe(input);
  });
});

describe("X-4 ④·⑤", () => {
  it("입주권 양도에도 행의 제외 선언을 본문에 싣고 명부 배지를 띄운다", () => {
    const form = buildCaseForm(G065);
    const body = buildOneHouseExemptionApiBody(form) as { specialHouseExclusions?: { houseId?: string }[] };
    expect(body.specialHouseExclusions?.map((e) => e.houseId)).toEqual(["B"]);
    render(<Step2 form={form} onChange={() => {}} />);
    expect(screen.getByTestId("house-count-exclusion-badge-B")).toBeTruthy();
  });
});

describe("X-5 해석례 미확보 조문은 빼지 않는다(음성)", () => {
  it("남는 조문은 정확히 넷 — §98 · §98의2 · §98의5 · §99", () => {
    for (const a of ["unsold_98", "unsold_98_2", "unsold_98_5", "new_99"]) expect(rightSaleSpecialExclusionApplies(a), a).toBe(true);
    for (const a of ["unsold_98_3", "unsold_98_6", "unsold_98_7", "unsold_98_8", "unsold_99_2", "new_99_3", "rental_97", "rental_97_2", "new_99_4_rural", "unsold_98_9", undefined])
      expect(rightSaleSpecialExclusionApplies(a), String(a)).toBe(false);
  });

  const RURAL = {
    kind: "reduction",
    reduction: {
      type: "new_99_4_rural",
      ruralHouseAcquisitionDate: "2015-06-15",
      ruralHouseStdPrice: "100000000",
      isRegisteredHanok: false,
      isAdjacentArea: false,
      meetsLocationRequirement: true,
      meetsHometownRequirement: false,
    },
  };
  const withRow = (countExclusion: object): RulingCase =>
    ({ ...G065, form: { ...G065.form, houses: [{ ...G065.form!.houses![0], countExclusion }] } }) as RulingCase;

  it("§99의4 농어촌주택 행 — 입주권 양도에서는 다른 주택으로 센다(과세) · 본문에 싣지 않는다 · 배지 없이 안내", async () => {
    const c = withRow(RURAL);
    const o = await observeCase(c);
    expect(o.isExempt).toBe(false);
    expect(o.excludedHouses.map((x) => x.houseId)).not.toContain("B");
    const form = buildCaseForm(c);
    expect((buildOneHouseExemptionApiBody(form) as { reductions?: unknown[] }).reductions ?? []).toEqual([]);
    render(<Step2 form={form} onChange={() => {}} />);
    expect(screen.queryByTestId("house-count-exclusion-badge-B")).toBeNull();
    expect(screen.getByTestId("right-sale-count-exclusion-unused-notice")).toBeTruthy();
  });

  it("§98의3 감면주택 행(해석례 미확보) — 과세 · 본문에 싣지 않는다", async () => {
    const g065Row = G065.form!.houses![0].countExclusion as { kind: "special"; special: object };
    const c = withRow({ kind: "special", special: { ...g065Row.special, article: "unsold_98_3" } });
    expect((await observeCase(c)).isExempt).toBe(false);
    expect((buildOneHouseExemptionApiBody(buildCaseForm(c)) as { specialHouseExclusions?: unknown[] }).specialHouseExclusions ?? []).toEqual([]);
  });
});
