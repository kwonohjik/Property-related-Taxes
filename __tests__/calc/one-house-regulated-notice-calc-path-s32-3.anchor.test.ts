/**
 * #32-3 계산기 경로 anchor — 조정 여부 미입력 고지(`155-1-regulated-at-new-acquisition-unverified`)가 양도세 계산기
 * 사용자에게 막다른 안내가 되지 않는다.
 *
 * 고지가 가리키는 「조정대상지역 처분기한」 칸(`TempTwoHouseRegulatedInputs`)은 판정 메뉴(`TemporaryTwoHouseSection`
 * full 모드)와 부담부증여 화면에만 있다 — 계산기 Step4는 `mode="calc"`라 그 칸을 그리지 않는다. 그래서 고지는
 * 계산기에서 판정 메뉴로 돌아가 입력해 다시 넘기라고 함께 안내하고, 그 길이 실제로 통한다(짝: 판정 메뉴에서 입력한
 * 값을 핸드오프로 넘기면 계산기 route에서 고지가 사라진다).
 *
 * 경로: 판정 메뉴 폼 → 핸드오프(`toTransferFormPatch`) → ④ `callTransferTaxAPI` → ⑫⑭ `/api/calc/transfer` route.
 * 시료는 `one-house-pr8b-reasons.anchor`의 X2-1 첫 케이스(양도 2028-10-05 · 종전 2020-01-10 · 신규 2026-08-21 —
 * 조정→조정 2년은 지났고 본문 3년은 안이라 두 독법의 결론이 갈린다).
 */
import { describe, it, expect } from "vitest";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { handoff, withToday } from "./_one-house-pr6a-routes";
import { runCalc } from "./_one-house-pr3a-calc-route";

const NOTICE_HEAD = "주소나 조정대상지역 여부가 입력되지 않아";

function mk(declared?: { newHouseRegulatedAtAcquisition: string; prevHouseRegulatedAtNewAcquisition: string }): RulingCase {
  return {
    id: "s32-3", docNo: "-", docDate: "-", basis: "current", today: "2028-10-06", summary: "", bucket: "match",
    form: {
      isOneHousehold: true, transferDate: "2028-10-05", contractTotalPrice: "800000000",
      ...(declared ?? {}),
      asset: { assetKind: "housing", acquisitionDate: "2020-01-10", residenceInputMode: "direct", residencePeriodMonthsAsset: "30" },
      houses: [{ id: "b", region: "capital", acquisitionOrigin: "general", acquisitionDate: "2026-08-21" }],
    },
  } as unknown as RulingCase;
}

const warningsOf = (r: { warnings?: unknown }) => ((r.warnings as string[] | undefined) ?? []).join("\n");

describe("#32-3 조정 여부 미입력 고지 — 계산기 경로", () => {
  it("미입력 → 계산기 route 고지가 판정 메뉴로 가는 길을 안내한다(계산기에는 그 칸이 없다)", async () => {
    const c = mk();
    await withToday(c.today, async () => {
      const r = await runCalc(handoff(buildCaseForm(c)));
      expect(r.status).toBe(200);
      const w = warningsOf(r);
      expect(w).toContain(NOTICE_HEAD);
      expect(w).toContain("「조정대상지역 처분기한」 칸");
      expect(w).toContain("양도세 계산기에는 이 칸이 없어 1세대1주택 판정 메뉴에서 입력해 다시 넘기면");
      expect(r.isExempt).toBe(false);
    });
  });

  it("짝 — 판정 메뉴에서 「두 주택 모두 조정 아님」을 입력해 넘기면 계산기 route 고지가 사라지고 결론이 바뀐다", async () => {
    const c = mk({ newHouseRegulatedAtAcquisition: "no", prevHouseRegulatedAtNewAcquisition: "no" });
    await withToday(c.today, async () => {
      const r = await runCalc(handoff(buildCaseForm(c)));
      expect(r.status).toBe(200);
      expect(warningsOf(r)).not.toContain(NOTICE_HEAD);
      expect(r.isExempt).toBe(true);
    });
  });

  it("짝 — 「두 주택 모두 조정」을 입력해 넘기면 결론(과세)은 미입력과 같아도 고지는 사라진다(입력이 고지를 지운다)", async () => {
    const c = mk({ newHouseRegulatedAtAcquisition: "yes", prevHouseRegulatedAtNewAcquisition: "yes" });
    await withToday(c.today, async () => {
      const r = await runCalc(handoff(buildCaseForm(c)));
      expect(r.status).toBe(200);
      expect(warningsOf(r)).not.toContain(NOTICE_HEAD);
      expect(r.isExempt).toBe(false);
    });
  });
});
