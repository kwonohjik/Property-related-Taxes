/**
 * I-26 표 묶음 F — 수집기 밖 판정 보류 고지(§89② 계열 · 판정 route 파이프라인 단계)도 「결론을 가를 때만 고지」 계약을 지킨다.
 * 셀은 판정 메뉴 폼이고 route 전체를 탄다(`contract-pipeline.ts`). 표 완전성은 `era-notice-contract.test.ts` ①이 본다.
 */
import { describe, it, expect } from "vitest";
import { calcWarningsViaRoute, covers, judgeCellViaRoute } from "./contract-pipeline";
import { ROWS_F } from "./rows-f";

describe("I-26 표 F — 판정 메뉴 route 단위", () => {
  for (const row of ROWS_F) {
    describe(row.id, () => {
      const decides = row.decides;
      if (!decides) {
        it.skip(`route로 고지 셀을 만들 수 없음 — ${row.decidesWhy}`, () => {});
        return;
      }
      it(`결론을 가르는 셀 → 고지 (${row.decidesWhy})`, async () => {
        const r = await judgeCellViaRoute(decides);
        expect(r.status).toBe(200);
        expect(r.undetermined.filter((u) => covers(row.id, u.id)).map((u) => u.id)).not.toEqual([]);
      });
      if (row.silent) {
        const silent = row.silent;
        it(`결론 불변 셀 → 침묵 (${row.silentWhy})`, async () => {
          const r = await judgeCellViaRoute(silent);
          expect(r.status).toBe(200);
          expect(r.undetermined.filter((u) => covers(row.id, u.id)).map((u) => u.id)).toEqual([]);
        });
      }
      if (!row.calcParitySkip) {
        it("계산기 경고도 같은 문장 · 결론 불변 셀에서는 계산기도 침묵(넘기기 ④ → 계산기 route)", async () => {
          const reason = (await judgeCellViaRoute(decides)).undetermined.find((u) => covers(row.id, u.id))?.reason;
          expect(reason).toBeDefined();
          expect(await calcWarningsViaRoute(decides)).toContain(reason);
          const calcSilent = row.calcSilent ?? row.silent;
          if (calcSilent) expect(await calcWarningsViaRoute(calcSilent)).not.toContain(reason);
        });
      }
    });
  }
});
