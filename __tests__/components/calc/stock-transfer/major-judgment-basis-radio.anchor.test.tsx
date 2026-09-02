/**
 * @vitest-environment jsdom
 *
 * 대주주 「특수 판정 기준일 (합병·분할·신설법인)」 — **2열 2행 + 내부 변수명 제거**.
 *
 * 진단(2026-09-02):
 *   ① 선택지 4개가 세로로 쌓여 4행을 먹었다. 라벨이 최장 24자라 inline(한 행)에는
 *      들어가지 않으므로 columns={2}로 접는다.
 *   ② 🔴 **화면에 코드 변수명 `priorYearEndDate`가 두 곳 노출**돼 있었다.
 *      같은 컴포넌트가 그 필드를 화면에서는 「직전 사업연도 종료일」로 부른다(:259).
 *      정책: [[feedback_no_internal_id_in_result]]
 *
 * 근거 조문은 시행령 §157④ · 2010 소령 §157⑧ (합병·분할·신설법인 특수 판정 기준일).
 * 값(merger·split·split_new_entity·incorporation)은 엔진 계약이라 건드리지 않는다.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const FILE = "components/calc/stock-transfer/MajorShareholderBlock.tsx";
const src = () => fs.readFileSync(path.join(process.cwd(), FILE), "utf-8");

function judgmentRadio() {
  const s = src();
  const i = s.lastIndexOf("<RadioCardGroup", s.indexOf('name="judgmentBasis"'));
  expect(i).toBeGreaterThan(-1);
  const j = s.indexOf("/>", s.indexOf("tone=\"rose\"", i));
  return s.slice(i, j);
}

describe("MJ — 특수 판정 기준일 라디오", () => {
  it("MJ-1 columns={2} — 4행 세로 쌓기 회귀 차단", () => {
    expect(judgmentRadio()).toContain("columns={2}");
  });

  it("MJ-2 stack 유지 — 라벨이 최장 24자라 inline 한 행에는 안 들어간다", () => {
    const b = judgmentRadio();
    expect(b).toContain('layout="stack"');
    expect(b).not.toContain('layout="inline"');
  });

  it("MJ-3 값(judgmentBasis enum)은 그대로다 — 엔진 계약", () => {
    const b = judgmentRadio();
    for (const v of ["merger", "split", "split_new_entity", "incorporation"]) {
      expect(b).toContain(`value: "${v}"`);
    }
  });

  it("MJ-4 🔴 화면 문자열에 코드 변수명 `priorYearEndDate`가 없다", () => {
    const s = src();
    // 코드에서의 사용(form.priorYearEndDate 등)은 정상 — «사용자에게 보이는 문자열»만 본다.
    const userStrings = [
      ...(s.match(/description="[^"]*"/g) ?? []),
      ...(s.match(/label="[^"]*"/g) ?? []),
      ...(s.match(/hint="[^"]*"/g) ?? []),
      ...(s.match(/title="[^"]*"/g) ?? []),
      // JSX 텍스트 노드 중 안내 문단
      ...(s.match(/✓[^<]*/g) ?? []),
    ];
    const bad = userStrings.filter((t) => t.includes("priorYearEndDate"));
    expect(bad).toEqual([]);
  });

  it("MJ-5 그 자리를 화면상의 필드 이름이 대신한다", () => {
    const s = src();
    expect(s).toContain('「직전 사업연도 종료일」 대신 별도 기준일 사용');
    expect(s).toContain('「직전 사업연도 종료일」은 표시용으로만 쓰입니다');
    // 그 이름이 실제 FieldCard 라벨과 일치하는지 — 어긋나면 안내가 가리키는 칸이 없어진다
    expect(s).toContain('label="직전 사업연도 종료일"');
  });
});
