/**
 * anchor(판정 메뉴 폼 → ⑧ → ④ → route → 결과 화면 · 핸드오프 계산기) — §155⑳ 불성립 × 명부의 임대주택 (F-1 Q-3 (a) · D-4).
 *
 * 계획서 `docs/00-pm/rental-155-20-unmet-blocks-155-1.plan.md` §1.2. 판정 메뉴는 임대주택을 명부에 넣지 않는 것이 전제라
 * 불성립이면 비과세를 거둔다(`applyRentalHousingVerdict`). 사용자가 임대주택을 명부에 「장기임대 등록주택」으로 넣으면 판정 엔진이 그 주택을
 * 세어 일시적 2주택(영 §155①)을 판정한다 — 그 비과세는 거두지 않는다(계산기 STEP 0.96과 같은 술어 `rosterCountsRentalUnits`).
 *
 * | # | 입력 | 판정 메뉴 | 계산기(핸드오프) |
 * |---|---|---|---|
 * | UO-8a | 불성립 · 명부에 임대 행 | 종전 과세 → **비과세(일시적 2주택)** · 결과 카드에 적용한 비과세 한 줄 | 비과세 0 (PR-1) |
 * | UO-8b | 불성립 · 명부 없음(메뉴 전제) | 과세 불변 — 임대주택 취득일을 몰라 다른 특례를 판정할 수 없다 | 과세 124,366,000 |
 * | UO-8c | 불성립 · 명부의 행이 「장기임대」 표시 없음 | 과세 불변 — 술어는 표시한 행만 본다 | — |
 * | UO-8d | ⑧ 경고 | 「장기임대 등록주택」으로 표시하라는 처방 | — |
 * | UO-8e | 세대 구성 불성립(3중첩 등) + 명부에 임대 행 | 유지 — 계산기도 구성 회수(종전 D12)를 없앴다(composition-revoke Q-2 (a) · 2026-10-24 반전) | 명부 없으면 원인 무관 거둔다(짝) |
 * | CR-7 | 메뉴 · 임대 행 + 조특법 §98 행(⑳ 겹침 해석 미확보 → 세대 구성 불성립) | 종전 과세 → 비과세(호별 성립·불성립 모두) · 핸드오프 계산기도 비과세 | 임대 행 없는 메뉴 전제는 과세 불변 |
 */
import { describe, it, expect } from "vitest";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { handoff, runJudgment, withToday } from "./_one-house-pr6a-routes";
import { runCalc } from "./_one-house-pr3a-calc-route";
import { judgeAndRender } from "./_one-house-pr12a-judge-view";
import { applyRentalHousingVerdict, type OneHouseRentalHousingVerdict } from "@/lib/tax-engine/one-house/rental-housing-verdict";
import type { OneHouseJudgment } from "@/lib/tax-engine/one-house/types";

const unit = {
  unitId: "b",
  businessRegistrationDate: "2023-02-01",
  rentalRegistrationDate: "2023-02-01",
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "seoul-metro",
  // 임대개시 당시 기준시가 7억 — 수도권 6억 상한 초과(불성립)
  standardPriceAtRentalStart: "700000000",
  acquisitionOfficialPrice: "700000000",
  isNationalSizeHousing: true,
  hasMinimum2Units: true,
  rentalMonths: "16",
  requirementsConfirmed: true,
};
const row = (isLongTermRental = true) => ({
  id: "r1",
  region: "capital",
  acquisitionDate: "2023-01-01",
  officialPrice: "700000000",
  isLongTermRental,
  isApartment: false,
  acquisitionOrigin: "general",
});
const mk = (houses: object[]): RulingCase =>
  ({
    id: "f1-menu",
    docNo: "",
    docDate: "",
    basis: "era",
    today: "2024-06-02",
    summary: "",
    form: {
      isOneHousehold: true,
      transferDate: "2024-06-01",
      contractTotalPrice: "1000000000",
      houses,
      asset: {
        assetKind: "housing",
        acquisitionDate: "2008-01-01",
        fixedAcquisitionPrice: "500000000",
        addressJibun: "서울특별시 종로구 청운동 1",
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "60",
        rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [unit], priorRentalExemptionHistory: "none" },
      },
    },
  }) as never;
const errors = (ve: string[]) => ve.filter((x) => x.startsWith("error"));

describe("판정 메뉴 × §155⑳ 불성립 — 명부의 임대주택을 센 비과세를 거두지 않는다", () => {
  it("UO-8a ★ 명부에 임대 행 → 메뉴 비과세(일시적 2주택) · 결과 카드 한 줄 · 핸드오프 계산기도 비과세", async () => {
    const c = mk([row()]);
    const v = await judgeAndRender(c);
    expect(v.status).toBe(200);
    expect(v.issues.filter((x: string) => x.startsWith("error"))).toEqual([]);
    expect(v.data.rentalHousingException.passed).toBe(false);
    expect(v.isExempt).toBe(true);
    expect(v.j.exemptReason).toBe("일시적 2주택 비과세");
    expect(v.text).toContain("요건 미충족 — 특례가 적용되지 않습니다");
    expect(v.text).toContain("임대주택을 세대 주택 수에 넣어 판정했고, 적용한 비과세는 「일시적 2주택 비과세」입니다.");
    await withToday(c.today, async () => {
      const r = await runCalc(handoff(buildCaseForm(c)));
      expect(r.issues).toEqual([]);
      expect(r.isExempt).toBe(true);
    });
  });

  it("UO-8b 명부 없음(메뉴 전제) → 메뉴 과세 불변 · 카드 한 줄 없음 · 핸드오프 계산기도 과세", async () => {
    const c = mk([]);
    const v = await judgeAndRender(c);
    expect(v.isExempt).toBe(false);
    expect(v.text).not.toContain("적용한 비과세는");
    await withToday(c.today, async () => {
      const r = await runCalc(handoff(buildCaseForm(c)));
      expect(r.isExempt).toBe(false);
    });
  });

  it("UO-8c 명부의 행이 「장기임대」 표시 없음 → 과세 불변(술어는 표시한 행만 본다)", async () => {
    const c = mk([row(false)]);
    await withToday(c.today, async () => {
      const j = await runJudgment(buildCaseForm(c));
      expect(errors(j.ve)).toEqual([]);
      expect(j.data?.judgment?.isExempt).toBe(false);
    });
  });

  it("UO-8d ⑧ 경고 — 이중 계상 경고에 불성립 시 처방을 덧붙인다", async () => {
    const c = mk([row()]);
    await withToday(c.today, async () => {
      const j = await runJudgment(buildCaseForm(c));
      const w = j.ve.find((x) => x.startsWith("warning:houses:")) ?? "";
      expect(w).toContain("다시 넣지 마세요");
      expect(w).toContain("명부에 취득일과 함께 넣고 「장기임대 등록주택」으로 표시하세요.");
    });
  });

  it("UO-8e 명부에 임대 행이 있으면 호별·세대 구성 어느 불성립이든 유지 · 명부 없으면 둘 다 거둔다(짝)", () => {
    const exempt = { isExempt: true, isPartialExempt: false, exemptReason: "일시적 2주택 비과세", appliedExceptions: [], pending: [], undetermined: [], requirementReview: [] } as unknown as OneHouseJudgment;
    const base = {
      scenario: "A",
      passed: false,
      residenceFailReasons: [],
      unitFailReasons: [{ unitIndex: 0, message: "가액 초과" }],
      periodPendingUnitIndexes: [],
      notices: [],
      legalBasis: "소득세법 시행령 §155⑳",
    } as OneHouseRentalHousingVerdict;
    const composition = { ...base, unitFailReasons: [], compositionFailReason: "그 밖의 주택 2채" };
    expect(applyRentalHousingVerdict(exempt, base, true).isExempt).toBe(true);
    expect(applyRentalHousingVerdict(exempt, base, false).isExempt).toBe(false);
    // composition-revoke Q-2 (a) — 종전에는 구성 불성립이면 명부 임대 행이 있어도 거뒀다(계산기 D12와 같은 축의 과다 회수)
    expect(applyRentalHousingVerdict(exempt, composition, true).isExempt).toBe(true);
    expect(applyRentalHousingVerdict(exempt, composition, false).isExempt).toBe(false);
  });

  describe("CR-7 세대 구성 불성립(조특법 §98 행 — ⑳ 겹침 해석 미확보) + 명부에 임대 행", () => {
    const sp98 = {
      id: "h3",
      region: "non_capital",
      regionCode: "4682025021",
      acquisitionDate: "1996-06-01",
      officialPrice: "100000000",
      isApartment: false,
      acquisitionOrigin: "general",
      countExclusion: {
        kind: "special",
        special: { article: "unsold_98", houseAcquisitionDate: "1996-06-01", houseContractDate: "1996-06-01", isNationalHousing: false, requirementsConfirmed: true },
      },
    };
    const withUnit = (c: RulingCase, price: string): RulingCase => {
      const asset = c.form!.asset as { rentalHousingException: { rentalUnits: object[] } };
      const rhe = asset.rentalHousingException;
      return { ...c, form: { ...c.form!, asset: { ...asset, rentalHousingException: { ...rhe, rentalUnits: [{ ...rhe.rentalUnits[0], standardPriceAtRentalStart: price, acquisitionOfficialPrice: price }] } } } } as RulingCase;
    };
    it.each([
      ["호별 성립(3억)", "300000000"],
      ["호별 불성립(7억)", "700000000"],
    ])("CR-7 ★ %s · 구성 불성립 → 메뉴 비과세(일시적 2주택) · 핸드오프 계산기 비과세 (종전 메뉴 과세)", async (_l, price) => {
      const c = withUnit(mk([row(), sp98]), price);
      const v = await judgeAndRender(c);
      expect(v.issues.filter((x: string) => x.startsWith("error"))).toEqual([]);
      expect(v.data.rentalHousingException.passed).toBe(false);
      expect(v.isExempt).toBe(true);
      expect(v.j.exemptReason).toBe("일시적 2주택 비과세");
      expect(v.text).toContain("적용한 비과세는 「일시적 2주택 비과세」입니다.");
      // ⑳을 적용하지 않았으므로 ㉒ 안내는 사실이 아니고, 구성 「확인 필요」는 결론을 가르지 않는다(계산기 CR-2·CR-4와 같다)
      expect(v.data.rentalHousingException.periodPendingUnitIndexes).toEqual([]);
      expect(v.text).not.toContain("§155㉒에 따라 차액");
      expect(v.text).not.toContain("겹쳐 적용하는지는 해석이 확인되지 않았습니다");
      await withToday(c.today, async () => {
        const r = await runCalc(handoff(buildCaseForm(c)));
        expect(r.issues).toEqual([]);
        expect(r.isExempt).toBe(true);
      });
    });
    it("CR-7 짝 — 메뉴 전제(임대 행 없음 · §98 행만) · 호별 성립 · 구성 불성립 → 메뉴·핸드오프 계산기 모두 과세", async () => {
      const c = withUnit(mk([sp98]), "300000000");
      const v = await judgeAndRender(c);
      expect(v.data.rentalHousingException.passed).toBe(false);
      expect(v.isExempt).toBe(false);
      // 과세면 구성 「확인 필요」가 결론을 가르므로 남는다
      expect(v.text).toContain("겹쳐 적용하는지는 해석이 확인되지 않았습니다");
      await withToday(c.today, async () => {
        const r = await runCalc(handoff(buildCaseForm(c)));
        expect(r.isExempt).toBe(false);
      });
    });
  });
});
