/**
 * S16-3 route anchor — 판정 메뉴(④→⑫→route)와 핸드오프 계산기 모두, ㉓ 비대상 목(구법)에 남은 stale 말소 3필드가
 * 결과를 바꾸지 않는다: 말소값 없는 짝과 같은 §155㉑ 적용 결과(비과세 · periodPendingUnitIndexes [0]).
 * 근거·leaf 단언: `rental-termination-scope-s16-3.anchor`(엔진 · ④).
 */
import { describe, it, expect } from "vitest";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { handoff, runJudgment, withToday } from "./_one-house-pr6a-routes";
import { runCalc } from "./_one-house-pr3a-calc-route";
import cases from "./one-house-rulings/cases/E177.json";

const base = (cases as RulingCase[]).find((c) => c.id === "E177-era")!;
const STALE = { rentalAutoTermination: true, registrationCancellationDate: "2021-06-01", terminatedRegistrationType: "long_term_general" };
function mk(unitOver: Record<string, unknown>): RulingCase {
  const asset = { ...(base.form!.asset as Record<string, unknown>) };
  const rhe = asset.rentalHousingException as { rentalUnits: Record<string, unknown>[] } & Record<string, unknown>;
  const unit = { ...rhe.rentalUnits[0], businessRegistrationDate: "2018-06-01", rentalRegistrationDate: "2018-06-01", rentalMonths: "20", rentalCategory: "pre_2018", ...unitOver };
  return { ...base, form: { ...base.form!, asset: { ...asset, fixedAcquisitionPrice: "300000000", addressJibun: "서울특별시 종로구 청운동 1", rentalHousingException: { ...rhe, rentalUnits: [unit] } } } };
}

describe("S16-3 숨은 말소 토글", () => {
  it("[대조] 구법 · 말소값 없음 → ㉑ 적용 비과세", async () => {
    const c = mk({});
    await withToday(c.today, async () => {
      const j = await runJudgment(buildCaseForm(c));
      expect(j.data?.judgment?.isExempt).toBe(true);
      expect(j.data?.rentalHousingException?.periodPendingUnitIndexes).toEqual([0]);
    });
  });
  it("구법 · stale 말소 3필드 → 판정 메뉴도 ㉑ 적용 비과세", async () => {
    const c = mk(STALE);
    await withToday(c.today, async () => {
      const j = await runJudgment(buildCaseForm(c));
      expect(j.ve.filter((x) => x.startsWith("error"))).toEqual([]);
      expect(j.data?.rentalHousingException?.passed).toBe(true);
      expect(j.data?.rentalHousingException?.periodPendingUnitIndexes).toEqual([0]);
      expect(j.data?.judgment?.isExempt).toBe(true);
    });
  });
  it("구법 · stale 말소 3필드 → 핸드오프 계산기도 비과세", async () => {
    const c = mk(STALE);
    await withToday(c.today, async () => {
      const r = await runCalc(handoff(buildCaseForm(c)));
      expect(r.issues).toEqual([]);
      expect(r.isExempt).toBe(true);
    });
  });
});
