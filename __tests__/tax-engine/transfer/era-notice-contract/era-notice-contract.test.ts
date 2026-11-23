/**
 * I-26 (2026-11 리뷰) — 판정 보류 고지마다 「결론 불변 셀에서는 침묵」 계약 테스트 상설화.
 *
 * | 가드 | 주장 |
 * |---|---|
 * | 표 | 고지 id마다 결론을 가르는 셀 → 고지 · 결론 불변 셀 → 침묵 · 계산기 경고도 같은 문장 |
 * | 완전성 ① | 계산기 경고 목록 `ERA_UNDETERMINED_IDS`의 id마다 표 행이 하나 |
 * | 완전성 ② | 수집기 두 파일(`era-undetermined*.ts`)이 직접 내는 id ⊆ `ERA_UNDETERMINED_IDS`(빠지면 계산기 경고에서 사라진다 — 사용자 결정 2026-11-21) |
 * | 완전성 ③ | 수집기 `collectUndetermined`(`pending.ts`)가 직접 내는 id(접두 묶음 `…:*`)와 부르는 하위 수집기가 전부 표에 있다(2026-11-23 표 밖 고지 편입 — 묶음 E) |
 * | 완전성 ④ | `checkExemption`의 `undetermined` 배열에 덧붙는 함수 · 판정 route 파이프라인이 판정 뒤에 붙이는 단계가 내는 id도 전부 표에 있다(같은 날 표 확장 — 묶음 F) |
 *
 * 표 키 = 판정 메뉴 「판정하지 않은 부분」에 실릴 수 있는 id 전부 — `collectUndetermined`(직접 id · 연혁 수집기 · 지정 지구) ∪ `checkExemption`이
 * 덧붙이는 §89② 계열 ∪ 판정 route 단계(비거주자 · 잔금 전 멸실 · 같은 날 권리 · 합가 상대 쪽 임대). id 끝의 `*`는 접두 묶음이다.
 * 「적용되지 않은 특례」(`unmetExceptions`) 채널은 판정 보류가 아니라 이 표 밖이다.
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
import { ROWS_E } from "./rows-e";
import { ROWS_F } from "./rows-f";
import * as Pending from "@/lib/tax-engine/one-house/pending";
import * as SameDay from "@/lib/tax-engine/one-house/same-day-right";
import * as Demolished from "@/lib/tax-engine/data/demolished-before-balance-era";
import * as MergeRental from "@/lib/tax-engine/one-house/merge-rental-carveout";
import { DESIGNATED_DISTRICT_UNDECLARED_ID_PREFIX } from "@/lib/tax-engine/one-house/designated-district-undeclared";

const ROWS: EraContractRow[] = [...ROWS_A, ...ROWS_B, ...ROWS_C, ...ROWS_D, ...ROWS_E];

/** 표 행 id가 고지 id를 덮는가 — 끝이 `*`면 접두 묶음. */
const covers = (rowId: string, id: string) => (rowId.endsWith("*") ? id.startsWith(rowId.slice(0, -1)) : id === rowId);

/** `collectUndetermined` 본문 — 직접 내는 id(템플릿 `${…}`는 `*`)와 `undetermined.push(...하위수집기(` 이름. */
function collectorSource() {
  const src = fs.readFileSync("lib/tax-engine/one-house/pending.ts", "utf8");
  const start = src.indexOf("export function collectUndetermined(");
  const body = src.slice(start, src.indexOf("\n}\n", start));
  const ids = [
    ...[...body.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]),
    ...[...body.matchAll(/\bid:\s*`([^`$]*)\$\{[^`]*`/g)].map((m) => `${m[1]}*`),
  ];
  const callees = [...body.matchAll(/undetermined\.push\(\.\.\.(\w+)\(/g)].map((m) => m[1]);
  return { ids, callees };
}
/** 하위 수집기 → 그 수집기가 내는 표 키 */
/** `checkExemption`의 `undetermined` 배열에 덧붙는 함수 이름(6칸 들여쓰기 `...이름(` — 인자 안의 전개는 더 깊다). */
function checkExemptionCallees(): string[] {
  const src = fs.readFileSync("lib/tax-engine/transfer-tax-exemption.ts", "utf8");
  const start = src.indexOf("    undetermined: [\n");
  const block = src.slice(start, src.indexOf("\n    ],\n", start));
  return [...block.matchAll(/^ {6}\.\.\.(\w+)\(/gm)].map((m) => m[1]);
}
const CHECK_EXEMPTION_KEYS: Record<string, string[]> = {
  undeclaredThreeYearExceptionUndetermined: ["89-2-three-year-exception-undeclared"],
  undeclaredMergeCompositionUndetermined: ["89-2-merged-household-composition-undeclared"],
  article89ConfirmNotesUndetermined: ["89-2-confirm:*"],
  article89ReadingNotesUndetermined: ["89-2-reading:*"],
  inheritedPresaleRightSeparateHouseholdUndetermined: [Pending.INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_ID],
  reverseDoubleMergeUndetermined: [Pending.REVERSE_DOUBLE_MERGE_UNVERIFIED_ID],
  inheritedSpecialOverlapUndetermined: [Pending.INHERITED_SPECIAL_OVERLAP_UNVERIFIED_ID],
};
/** 판정 route 파이프라인 — 판정 뒤 단계(`apply…Verdict(`) · 직접 싣는 id 상수(`id: …_ID`) · 같은 날 권리 재판정. */
function pipelineSource() {
  const p = fs.readFileSync("app/api/calc/one-house-exemption/judgment-pipeline.ts", "utf8");
  const r = fs.readFileSync("app/api/calc/one-house-exemption/judgment-request.ts", "utf8");
  return {
    stages: [...p.matchAll(/\b(apply\w+Verdict)\(/g)].map((m) => m[1]),
    inlineIdConsts: [...p.matchAll(/\bid:\s*([A-Z][A-Z0-9_]+_ID)\b/g)].map((m) => m[1]),
    sameDay: /\bwithSameDayRightNotice\(/.test(r),
  };
}
/** 비거주자 단계가 직접 내는 판정 보류 id — 아래 표 키 목록이 소스와 어긋나면 ④가 깨진다. */
const nonResidentIds = () =>
  [...fs.readFileSync("lib/tax-engine/one-house/non-resident.ts", "utf8").matchAll(/withUndetermined\(\s*judgment,\s*"([^"]+)"/g)].map((m) => m[1]);
const PIPELINE_STAGE_KEYS: Record<string, string[]> = {
  applyRentalHousingVerdict: [],
  applyOneRightVerdict: [],
  applyNonResidentVerdict: ["121-2-pre2020-non-resident-right-unverified", "121-2-pre2010-non-resident-unverified"],
  applyDemolishedBeforeBalanceVerdict: [Demolished.DEMOLISHED_BEFORE_BALANCE_UNVERIFIED_ID],
  applyLandOnlyHouseholdVerdict: [], // 다른 세대 사유는 「적용되지 않은 특례」 채널(표 밖) · 같은 세대 합가일 고지는 2026-11-23 지웠다
};

const SUB_COLLECTOR_KEYS: Record<string, string[]> = {
  collectEraUndetermined: [...ERA_UNDETERMINED_IDS],
  designatedDistrictUndeclared: [`${DESIGNATED_DISTRICT_UNDECLARED_ID_PREFIX}*`],
};

describe("I-26 표 — 결론을 가를 때만 고지", () => {
  for (const row of ROWS) {
    describe(row.id, () => {
      const decides = row.decides;
      if (!decides) {
        it.skip(`실데이터로 고지 셀을 만들 수 없음 — ${row.decidesWhy}`, () => {});
        return;
      }
      it(`결론을 가르는 셀 → 고지 (${row.decidesWhy})`, () => {
        expect(undeterminedIds(decides).filter((id) => covers(row.id, id))).not.toEqual([]);
      });
      if (row.silent) {
        const silent = row.silent;
        it(`결론 불변 셀 → 침묵 (${row.silentWhy})`, () => {
          expect(undeterminedIds(silent).filter((id) => covers(row.id, id))).toEqual([]);
        });
      } else {
        it.skip(`결론 불변 셀 없음 — ${row.silentWhy}`, () => {});
      }
      if (!row.calcParitySkip) {
        it("계산기 경고도 같은 문장", () => {
          const reason = judgeCell(decides).undetermined.find((u) => covers(row.id, u.id))?.reason;
          expect(reason).toBeDefined();
          expect(calcWarnings({ ...decides, input: { ...decides.input, ...row.calcInput } })).toContain(reason);
        });
      }
    });
  }
});

describe("I-26 완전성", () => {
  it("① 표 키(묶음 A~F) = 판정 보류 고지가 나오는 모든 곳의 id — 행이 정확히 하나씩", () => {
    const keys = [...ROWS.map((r) => r.id), ...ROWS_F.map((r) => r.id)];
    expect(new Set(keys).size).toBe(keys.length);
    const { ids, callees } = collectorSource();
    const unknown = (where: string, name: string) => [`<${where}: 표 키를 정하지 않은 ${name}>`];
    const fromCollector = [...ids, ...callees.flatMap((c) => SUB_COLLECTOR_KEYS[c] ?? unknown("하위 수집기", c))];
    const fromCheckExemption = checkExemptionCallees()
      .filter((c) => c !== "collectUndetermined")
      .flatMap((c) => CHECK_EXEMPTION_KEYS[c] ?? unknown("checkExemption", c));
    const consts = { ...PopDecline, ...MergeRental } as unknown as Record<string, unknown>;
    const pipe = pipelineSource();
    const fromPipeline = [
      ...pipe.stages.flatMap((s) => PIPELINE_STAGE_KEYS[s] ?? unknown("판정 route 단계", s)),
      ...pipe.inlineIdConsts.map((c) => (typeof consts[c] === "string" ? (consts[c] as string) : `<unresolved ${c}>`)),
      ...(pipe.sameDay ? [SameDay.SAME_DAY_RIGHT_UNVERIFIED_ID] : []),
    ];
    expect([...keys].sort()).toEqual([...new Set([...fromCollector, ...fromCheckExemption, ...fromPipeline])].sort());
  });

  it("④ 소스 스캔 자체가 비지 않는다 · 비거주자 단계 id 목록이 소스와 같다", () => {
    expect(checkExemptionCallees()).toContain("collectUndetermined");
    expect(checkExemptionCallees().length).toBeGreaterThanOrEqual(8);
    const pipe = pipelineSource();
    expect([...pipe.stages].sort()).toEqual(Object.keys(PIPELINE_STAGE_KEYS).sort());
    expect(pipe.sameDay).toBe(true);
    expect([...nonResidentIds()].sort()).toEqual([...PIPELINE_STAGE_KEYS.applyNonResidentVerdict].sort());
  });

  it("③ 소스 스캔 자체가 비지 않는다(수집기 이름·모양이 바뀌면 여기서 먼저 깨진다)", () => {
    const { ids, callees } = collectorSource();
    expect(ids).toEqual(expect.arrayContaining(["154-1-residence-deadline-unavailable", "89-2-open:*"]));
    expect([...callees].sort()).toEqual(["collectEraUndetermined", "designatedDistrictUndeclared"]);
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
