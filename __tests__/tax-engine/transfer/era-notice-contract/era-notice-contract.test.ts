/**
 * I-26 (2026-11 리뷰) — 판정 보류 고지마다 「결론 불변 셀에서는 침묵」 계약 테스트 상설화.
 *
 * | 가드 | 주장 |
 * |---|---|
 * | 표 | 고지 id마다 결론을 가르는 셀 → 고지 · 결론 불변 셀 → 침묵 · 계산기 경고도 같은 문장 |
 * | 완전성 ① | 계산기 경고 목록 `ERA_UNDETERMINED_IDS`의 id마다 표 행이 하나 |
 * | 완전성 ② | 수집기 두 파일(`era-undetermined*.ts`)이 직접 내는 id ⊆ `ERA_UNDETERMINED_IDS`(빠지면 계산기 경고에서 사라진다 — 사용자 결정 2026-11-21) |
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { ERA_UNDETERMINED_IDS } from "@/lib/tax-engine/one-house/era-undetermined";
import * as EraModule from "@/lib/tax-engine/one-house/era-undetermined";
import * as RuralFacts from "@/lib/tax-engine/one-house/rural-return-to-farm-facts";
import * as NewHouseOrigin from "@/lib/tax-engine/one-house/new-house-origin";
import * as PopDecline from "@/lib/tax-engine/transfer-reductions/population-decline-71-2";
import * as TempTwoHouseEra from "@/lib/tax-engine/one-house/era-undetermined-temp-two-house";
import { calcWarnings, judgeCell, undeterminedIds, type EraContractRow } from "./contract";
import { ROWS_A } from "./rows-a";
import { ROWS_B } from "./rows-b";
import { ROWS_C } from "./rows-c";
import { ROWS_D } from "./rows-d";

const ROWS: EraContractRow[] = [...ROWS_A, ...ROWS_B, ...ROWS_C, ...ROWS_D];

describe("I-26 표 — 결론을 가를 때만 고지", () => {
  for (const row of ROWS) {
    describe(row.id, () => {
      const decides = row.decides;
      if (!decides) {
        it.skip(`실데이터로 고지 셀을 만들 수 없음 — ${row.decidesWhy}`, () => {});
        return;
      }
      it(`결론을 가르는 셀 → 고지 (${row.decidesWhy})`, () => {
        expect(undeterminedIds(decides)).toContain(row.id);
      });
      if (row.silent) {
        const silent = row.silent;
        it(`결론 불변 셀 → 침묵 (${row.silentWhy})`, () => {
          expect(undeterminedIds(silent)).not.toContain(row.id);
        });
      } else {
        it.skip(`결론 불변 셀 없음 — ${row.silentWhy}`, () => {});
      }
      if (!row.calcParitySkip) {
        it("계산기 경고도 같은 문장", () => {
          const reason = judgeCell(decides).undetermined.find((u) => u.id === row.id)?.reason;
          expect(reason).toBeDefined();
          expect(calcWarnings({ ...decides, input: { ...decides.input, ...row.calcInput } })).toContain(reason);
        });
      }
    });
  }
});

describe("I-26 완전성", () => {
  it("① ERA_UNDETERMINED_IDS의 id마다 표 행이 정확히 하나", () => {
    const keys = ROWS.map((r) => r.id);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...ERA_UNDETERMINED_IDS].sort());
  });

  it("② 수집기 두 파일이 직접 내는 id ⊆ ERA_UNDETERMINED_IDS", () => {
    // 수집기가 import해 쓰는 id 상수의 모듈 — 새 모듈의 상수를 쓰면 아래가 「unresolved」로 실패해 여기에 더하게 한다
    const consts = { ...EraModule, ...TempTwoHouseEra, ...RuralFacts, ...NewHouseOrigin, ...PopDecline } as unknown as Record<string, unknown>;
    const found = new Set<string>();
    for (const f of ["lib/tax-engine/one-house/era-undetermined.ts", "lib/tax-engine/one-house/era-undetermined-temp-two-house.ts"]) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/\bid:\s*"([^"]+)"/g)) found.add(m[1]);
      for (const m of src.matchAll(/\bid:\s*([A-Z][A-Z0-9_]+)\b/g)) {
        const v = consts[m[1]];
        found.add(typeof v === "string" ? v : `<unresolved ${m[1]}>`);
      }
    }
    expect([...found].filter((id) => !ERA_UNDETERMINED_IDS.has(id))).toEqual([]);
  });
});
