/**
 * I-26 — 판정 뒤 강제 과세 route 짝. 판정 메뉴 파이프라인(`runOneHouseJudgmentPipeline`)은 본체 판정 뒤에 비거주자(6.7)·잔금 전 멸실(6.8)·
 * 토지만 본인 다른 세대(6.9)로 비과세를 거둔다. 비과세를 전제로 낸 판정 보류 고지는 그때 함께 거둬야 한다(`revoke-exemption.ts` — D-37·D-69 ·
 * I-26에서 2002 경과조치 고지를 더함). 계약 표의 「결론을 가르는 셀」(비과세)에 강제 과세 사실 하나만 더한다.
 */
import { describe, it, expect } from "vitest";
import { runOneHouseJudgmentPipeline } from "@/app/api/calc/one-house-exemption/judgment-pipeline";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { ROWS_B } from "./rows-b";
import { ROWS_D } from "./rows-d";

const RATES = parseRatesFromMap(makeMockRates());
const BASE_DATE = new Date("2026-11-21");
// 파이프라인은 계산기처럼 원래 주택 수를 받아 STEP 0.9·0.95로 스스로 뺀다 — 행의 계산기용 입력(`calcInput`)을 덮어쓴다.
const cellOf = (rows: typeof ROWS_D, id: string) => {
  const row = rows.find((r) => r.id === id)!;
  return { ...row.decides!.input, ...row.calcInput };
};
const run = (input: Partial<TransferTaxInput>) =>
  runOneHouseJudgmentPipeline(baseTransferInput(input), RATES, BASE_DATE, false).judgment;
const ids = (j: ReturnType<typeof run>) => j.undetermined.map((u) => u.id);

const PAIRS: [string, Partial<TransferTaxInput>, string, Partial<TransferTaxInput>][] = [
  ["6.7 비거주자", cellOf(ROWS_D, "155-2-reinheritance-reference-date-unverified"), "155-2-reinheritance-reference-date-unverified", { transferorNonResidentAtTransfer: true }],
  ["6.8 잔금 전 멸실", cellOf(ROWS_D, "155-1-new-house-origin-uncollected"), "155-1-new-house-origin-uncollected", { demolishedBeforeBalance: { contractDate: new Date("2023-06-01") } }],
  ["6.9 토지만 본인 · 건물 소유자 다른 세대", cellOf(ROWS_B, "155-1-2002-transition-unverified"), "155-1-2002-transition-unverified", { selfOwns: "land_only", buildingOwnerSameHousehold: false }],
];

describe("I-26 판정 뒤 강제 과세 — 비과세 전제 고지를 함께 거둔다", () => {
  for (const [stage, cell, id, forced] of PAIRS) {
    it(`${stage} — 본체 비과세 + ${id} → 강제 과세면 고지 없음`, () => {
      const before = run(cell);
      expect(before.isExempt || before.isPartialExempt).toBe(true);
      expect(ids(before)).toContain(id);
      const after = run({ ...cell, ...forced });
      expect(after.isExempt || after.isPartialExempt).toBe(false);
      expect(ids(after)).not.toContain(id);
    });
  }
});
