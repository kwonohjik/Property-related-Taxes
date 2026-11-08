/**
 * calc anchor — 이월과세 Step4 미리보기 2곳(L25)이 읽는 취득일 = 증여 등기접수일 (엔진 ④ 와이어와 같은 leaf `primaryAcquisitionDateOf`).
 * 화면 판정을 순수 함수 조립으로 재현해, 잔재 4종(빔·옛 날짜·뒤 날짜)과 무관하게 엔진 결론(route anchor)과 같은 쪽임을 고정한다.
 */
import { describe, it, expect } from "vitest";
import { primaryAcquisitionDateOf } from "@/lib/calc/transfer-tax-api-carryover";
import { gracePeriodInScope } from "@/lib/calc/grace-period-scope";
import { calcFinalHouseRestartInScope, buildFinalHouseRestartPayload } from "@/lib/calc/final-house-restart";
import { householdFactsFormView } from "@/lib/calc/household-facts-view";
import { meetsSurchargeSuspensionHolding } from "@/lib/tax-engine/tax-utils";
import { describeFinalOneHouseRestart } from "@/lib/tax-engine/one-house/final-house-restart";
import { toEngineFinalHouseRestart } from "@/lib/api/final-house-restart-coerce";
import { graceForm, restartForm } from "./_helpers/l25-carryover-preview-form";

const STALES = ["", "2005-01-01", "2020-01-01", "2025-03-01", "2030-01-01"] as const;

/** GracePeriodSection 게이트 — 취득일이 있고 보유 2년 미만이면 «미충족(holdingGateFailed)», 취득일이 없으면 게이트 미적용. */
function holdingGateFails(acq: string | undefined, transfer: string): boolean {
  if (!acq) return false;
  return !meetsSurchargeSuspensionHolding(new Date(acq), new Date(transfer));
}
/** Step4 FinalHouseRestartSection — 미리보기 문장(재기산 여부). 취득일이 없으면 미리보기 없음(undefined). */
function restartApplied(f: ReturnType<typeof restartForm>): boolean | undefined {
  const hv = householdFactsFormView(f);
  const acq = primaryAcquisitionDateOf(hv.assets[0]);
  const p = buildFinalHouseRestartPayload(hv, true).finalOneHouseRestart;
  if (!acq || !p) return undefined;
  return describeFinalOneHouseRestart({ transferDate: new Date(f.transferDate), acquisitionDate: new Date(acq), finalOneHouseRestart: toEngineFinalHouseRestart(p) })?.applied;
}

describe("G — 보유 2년 게이트는 등기접수일로 판정", () => {
  const CELLS: [string, string, boolean][] = [
    ["G1/G2 등기 2025-03-01", "2025-03-01", true],
    ["G3/G4 등기 2020-01-01", "2020-01-01", false],
  ];
  for (const [n, gift, fails] of CELLS) {
    it(`${n}: 잔재 5종 모두 holdingGateFailed=${fails}`, () => {
      for (const S of STALES) {
        const f = graceForm(S, gift);
        expect(gracePeriodInScope(f), `S=${S}`).toBe(true);
        expect(primaryAcquisitionDateOf(f.assets[0]), `S=${S}`).toBe(gift);
        expect(holdingGateFails(primaryAcquisitionDateOf(f.assets[0]), f.transferDate), `S=${S}`).toBe(fails);
      }
    });
  }
  it("등기접수일 빔 → 게이트 미적용(판정 불가 ≠ 미충족) — 잔재가 있어도 잔재로 채우지 않는다", () => {
    for (const S of ["", "2025-03-01"]) {
      expect(primaryAcquisitionDateOf(graceForm(S, "").assets[0]) || undefined, `S=${S}`).toBeUndefined();
    }
  });
  it("대조(불변) — 일반 매매 주택은 원시 취득일 그대로", () => {
    expect(holdingGateFails(primaryAcquisitionDateOf(graceForm("2025-03-01", "", "purchase").assets[0]), "2026-07-15")).toBe(true);
    expect(holdingGateFails(primaryAcquisitionDateOf(graceForm("2020-01-01", "", "purchase").assets[0]), "2026-07-15")).toBe(false);
  });
});

describe("R — 재기산 미리보기는 등기접수일로 판정", () => {
  const CELLS: [string, string, boolean][] = [
    ["R1/R4 등기 2019-01-01", "2019-01-01", true],
    ["R2/R3 등기 2021-09-01", "2021-09-01", false],
  ];
  for (const [n, gift, applied] of CELLS) {
    it(`${n}: 잔재 5종 모두 재기산=${applied}`, () => {
      for (const S of STALES) {
        const f = restartForm(S, gift);
        expect(calcFinalHouseRestartInScope(householdFactsFormView(f)), `S=${S}`).toBe(true);
        expect(restartApplied(f), `S=${S}`).toBe(applied);
      }
    });
  }
  it("등기접수일 빔 → 미리보기 없음 (잔재가 있어도)", () => {
    for (const S of ["", "2019-01-01"]) expect(restartApplied(restartForm(S, "")), `S=${S}`).toBeUndefined();
  });
  it("대조(불변) — 일반 매매 주택은 원시 취득일 그대로", () => {
    expect(restartApplied(restartForm("2019-01-01", "", "purchase"))).toBe(true);
    expect(restartApplied(restartForm("2021-09-01", "", "purchase"))).toBe(false);
  });
});
