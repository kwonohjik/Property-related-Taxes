/**
 * anchor(판정 메뉴 폼 → ⑧ → ④ → route → 결과 화면 · 핸드오프 계산기) — 명부의 「장기임대」 행 × §155⑳ 충족.
 *
 * 계획서 `docs/00-pm/menu-roster-rental-155-20-met.plan.md`. 판정 메뉴는 임대주택을 명부에 넣지 않는 것이 전제라 ⑳ 충족이면
 * 판정을 그대로 뒀다. 사용자가 임대주택을 명부에도 「장기임대 등록주택」으로 넣으면 판정 엔진이 그 행을 센 채 과세로 냈다(계산기는 0).
 * ⑳ 충족 + 비과세가 서지 않았으면 그 행을 빼고 다시 판정한다(D-1) — 영 §155⑳ 「1개의 주택을 소유하고 있는 것으로 보아」.
 *
 * | # | 입력 | 판정 메뉴 | 짝 · 계산기 |
 * |---|---|---|---|
 * | RM-1 | 명부 임대 행(2007) · ⑳ 충족 · 10억 | 종전 과세 → **비과세** · 카드 「2채 중 1채」 + ⑳ 한 줄(D-3) | 명부 없음 비과세 · 계산기 0 |
 * | RM-2 | 같음 · 15억 | 종전 과세 → **부분 비과세(고가주택)** | 명부 없음 같음 · 계산기 14,124,000 |
 * | RM-3 | 같음 · B | 종전 과세 → **기간분 비과세** | 명부 없음 같음 |
 * | RM-4 | 혼인 2022 · 임대 행 + 배우자 주택 | 종전 과세 → **비과세(§155⑤)** · 3채 중 2채 | 명부 배우자 주택만 같음 · 계산기 0 |
 * | RM-5 | 임대 행 + 일반 주택(2023 · 일시적 2주택 신규) | 종전 과세 → **비과세(일시적 2주택)** · 3채 중 2채 | 계산기 0 |
 * | RM-6 | 임대 행이 일시적 2주택 신규 주택 · ⑳ 충족 | 불변 — 엔진이 임대주택을 센 비과세를 둔다(D-2 · 계산기 STEP 1a) · 2채 중 2채 | 계산기 같은 사유 |
 * | RM-7 | ⑳ 불성립(기준시가 7억 · 거주 1년 · 세대 구성) | 불변 과세 · 카드에 ⑳ 줄 없음 | 계산기 과세 |
 */
import { describe, it, expect } from "vitest";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { handoff, withToday } from "./_one-house-pr6a-routes";
import { runCalc } from "./_one-house-pr3a-calc-route";
import { judgeAndRender } from "./_one-house-pr12a-judge-view";

const DEEMED = "장기임대주택 — 거주주택 특례 요건 충족으로 거주주택을 1주택으로 봄";

const unit = (price = "250000000", extra: object = {}) => ({
  unitId: "b",
  businessRegistrationDate: "2023-02-01",
  rentalRegistrationDate: "2023-02-01",
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "seoul-metro",
  standardPriceAtRentalStart: price,
  acquisitionOfficialPrice: price,
  isNationalSizeHousing: true,
  hasMinimum2Units: true,
  rentalMonths: "16",
  requirementsConfirmed: true,
  ...extra,
});
const rentalRow = (acquisitionDate: string, extra: object = {}) => ({
  id: "r1",
  region: "capital",
  acquisitionDate,
  officialPrice: "250000000",
  isLongTermRental: true,
  isApartment: false,
  acquisitionOrigin: "general",
  ...extra,
});
const house = (id: string, acquisitionDate: string, extra: object = {}) => ({
  id,
  region: "capital",
  acquisitionDate,
  officialPrice: "300000000",
  isApartment: false,
  acquisitionOrigin: "general",
  ...extra,
});
const spouseHouse = house("h3", "2015-01-01", { mergeOrigin: "counterpart_side" });
const MARRIAGE = { marriageDate: "2022-01-01", isFirstTransferredInMerge: true };

const mk = (o: {
  houses: object[];
  price?: string;
  unitPrice?: string;
  scenario?: "A" | "B";
  top?: object;
  unitExtra?: object;
  residence?: string;
}): RulingCase =>
  ({
    id: "rm",
    docNo: "",
    docDate: "",
    basis: "era",
    today: "2024-06-02",
    summary: "",
    form: {
      isOneHousehold: true,
      transferDate: "2024-06-01",
      contractTotalPrice: o.price ?? "1000000000",
      houses: o.houses,
      ...(o.top ?? {}),
      asset: {
        assetKind: "housing",
        acquisitionDate: "2008-01-01",
        fixedAcquisitionPrice: "500000000",
        addressJibun: "서울특별시 종로구 청운동 1",
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: o.residence ?? "60",
        rentalHousingException: {
          applyException: true,
          scenario: o.scenario ?? "A",
          rentalUnits: [unit(o.unitPrice, o.unitExtra)],
          priorRentalExemptionHistory: "none",
          ...(o.scenario === "B" ? { priorResidenceTransferDate: "2020-01-01", postRegistrationResidenceMonths: "30" } : {}),
        },
      },
    },
  }) as never;

async function menu(c: RulingCase) {
  const v = await judgeAndRender(c);
  expect(v.status).toBe(200);
  expect(v.issues.filter((x: string) => x.startsWith("error"))).toEqual([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = v.data as any;
  return {
    ...v,
    passed: data.rentalHousingException?.passed as boolean,
    hc: data.houseCount as { total: number; countedForExemption: number; excluded: { label: string; legalBasis: string; houseNo?: number }[] },
  };
}
async function calc(c: RulingCase) {
  let r: Awaited<ReturnType<typeof runCalc>> | undefined;
  await withToday(c.today, async () => {
    r = await runCalc(handoff(buildCaseForm(c)));
  });
  expect(r!.issues).toEqual([]);
  return r!;
}

describe("판정 메뉴 × 명부의 「장기임대」 행 — §155⑳ 충족이면 그 행을 빼고 판정한다", () => {
  it("RM-1 ★ 10억 → 비과세 · 카드 「2채 중 1채」 + ⑳ 한 줄 · 명부 없음 짝·계산기와 같은 결론", async () => {
    const c = mk({ houses: [rentalRow("2007-01-01")] });
    const v = await menu(c);
    expect(v.passed).toBe(true);
    expect(v.isExempt).toBe(true);
    expect(v.j.exemptReason).toBe("1세대1주택 비과세");
    expect(v.hc).toMatchObject({ total: 2, countedForExemption: 1 });
    expect(v.hc.excluded).toEqual([
      { houseId: "r1", houseNo: 1, houseAcquisitionDate: "2007-01-01", label: DEEMED, legalBasis: "소득세법 시행령 §155⑳" },
    ]);
    expect(v.text).toContain("세대 보유 주택 2채 중 비과세 판정에 세는 주택은 1채입니다.");
    expect(v.text).toContain(`보유 주택 1 (2007-01-01 취득) — ${DEEMED}`);

    const pair = await menu(mk({ houses: [] }));
    expect(pair.isExempt).toBe(true);
    expect(pair.j.exemptReason).toBe(v.j.exemptReason);
    expect(pair.hc.excluded).toEqual([]);

    const r = await calc(c);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("RM-2 15억 → 부분 비과세(고가주택) — 명부 없음 짝과 같다 · 계산기 14,124,000", async () => {
    const c = mk({ houses: [rentalRow("2007-01-01")], price: "1500000000" });
    const v = await menu(c);
    expect(v.isExempt).toBe(false);
    expect(v.j.isPartialExempt).toBe(true);
    expect(v.j.exemptReason).toBe("1세대1주택 고가주택");
    expect(v.hc).toMatchObject({ total: 2, countedForExemption: 1 });

    const pair = await menu(mk({ houses: [], price: "1500000000" }));
    expect(pair.j.isPartialExempt).toBe(true);
    expect(pair.j.exemptReason).toBe(v.j.exemptReason);

    expect((await calc(c)).totalTax).toBe(14_124_000);
  });

  it("RM-3 B(임대→거주 전환) → 기간분 비과세 — 명부 없음 짝과 같다", async () => {
    const v = await menu(mk({ houses: [rentalRow("2007-01-01")], scenario: "B" }));
    expect(v.passed).toBe(true);
    expect(v.isExempt).toBe(true);
    expect(v.text).toContain("기간분 비과세");
    expect(v.hc).toMatchObject({ total: 2, countedForExemption: 1 });

    const pair = await menu(mk({ houses: [], scenario: "B" }));
    expect(pair.text).toContain("기간분 비과세");
  });

  it("RM-4 혼인 2022 · 임대 행 + 배우자 주택 → 비과세(§155⑤) · 3채 중 2채 · 계산기 0", async () => {
    const c = mk({
      houses: [rentalRow("2007-01-01", { mergeOrigin: "seller_side" }), spouseHouse],
      top: MARRIAGE,
      unitExtra: { mergeOrigin: "seller_side" },
    });
    const v = await menu(c);
    expect(v.isExempt).toBe(true);
    expect(v.j.exemptReason).toBe("혼인 합가 (§155⑤) 1세대1주택 비과세");
    expect(v.hc).toMatchObject({ total: 3, countedForExemption: 2 });

    const pair = await menu(mk({ houses: [spouseHouse], top: MARRIAGE, unitExtra: { mergeOrigin: "seller_side" } }));
    expect(pair.j.exemptReason).toBe(v.j.exemptReason);

    expect((await calc(c)).totalTax).toBe(0);
  });

  it("RM-5 임대 행 + 일반 주택(2023 · 일시적 2주택 신규) → 비과세(일시적 2주택) · 3채 중 2채 · 계산기 0", async () => {
    const c = mk({ houses: [rentalRow("2007-01-01"), house("g1", "2023-01-01")] });
    const v = await menu(c);
    expect(v.isExempt).toBe(true);
    expect(v.j.exemptReason).toBe("일시적 2주택 비과세");
    expect(v.hc).toMatchObject({ total: 3, countedForExemption: 2 });
    expect(v.hc.excluded.map((e) => e.label)).toEqual([DEEMED]);

    expect((await calc(c)).totalTax).toBe(0);
  });

  it("RM-6 임대 행이 일시적 2주택 신규 주택 → 엔진이 임대주택을 센 비과세를 둔다(D-2) · 카드 2채 중 2채 · 계산기 같은 사유", async () => {
    const c = mk({ houses: [rentalRow("2023-01-01")] });
    const v = await menu(c);
    expect(v.passed).toBe(true);
    expect(v.isExempt).toBe(true);
    expect(v.j.exemptReason).toBe("일시적 2주택 비과세");
    expect(v.hc).toMatchObject({ total: 2, countedForExemption: 2, excluded: [] });

    const r = await calc(c);
    expect(r.exemptReason).toBe(v.j.exemptReason);
  });

  it.each([
    ["기준시가 7억(호별 요건)", { unitPrice: "700000000" }],
    ["거주 12개월(⑳1호 거주 요건)", { residence: "12" }],
    ["일반 주택 2010 추가(세대 구성)", { extraHouse: true }],
  ])("RM-7 ⑳ 불성립 — %s → 과세 불변 · 카드에 ⑳ 줄 없음", async (_, o: { unitPrice?: string; residence?: string; extraHouse?: boolean }) => {
    const houses = [rentalRow("2007-01-01"), ...(o.extraHouse ? [house("g1", "2010-01-01")] : [])];
    const v = await menu(mk({ houses, unitPrice: o.unitPrice, residence: o.residence }));
    expect(v.passed).toBe(false);
    expect(v.isExempt).toBe(false);
    expect(v.j.isPartialExempt).toBe(false);
    expect(v.hc.countedForExemption).toBe(houses.length + 1);
    expect(v.hc.excluded).toEqual([]);
  });
});
