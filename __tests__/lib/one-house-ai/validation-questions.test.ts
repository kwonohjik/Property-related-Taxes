/**
 * 검증 질문(`collectValidationQuestions`) · 폼 합치기(`mergeExtractedForm`).
 *
 * 평가셋 손 매핑 폼은 판정이 기대값과 맞는 실제 입력이다 — 합친 폼에서 막히는 칸이 없어야 한다.
 * 그 폼에서 칸 하나를 지우면 그 칸이 화면 검증 문구로 질문이 되어야 한다.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";
import { mergeExtractedForm } from "@/lib/one-house-ai/merge-form";
import { collectValidationQuestions } from "@/lib/one-house-ai/validation-questions";
import type { ExtractedForm } from "@/lib/one-house-ai/apply-extraction";

type Case = { id: string; basis: string; bucket: string; today: string; form?: ExtractedForm; expected?: object };
const DIR = path.join(__dirname, "../../calc/one-house-rulings/cases");
const cases: Case[] = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Case[]);
const byId = (id: string) => cases.find((c) => c.id === id)!;

/** 케이스의 판정 기준일로 시계를 맞춘다(⑧이 오늘 날짜를 읽는 칸이 있다) */
const at = <T>(c: Case, fn: () => T): T => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    return fn();
  } finally {
    vi.useRealTimers();
  }
};
const questionsOf = (c: Case, form: ExtractedForm) => at(c, () => collectValidationQuestions(mergeExtractedForm(form), ONE_HOUSE_FIELD_CATALOG));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
/**
 * 손 매핑 폼은 거주 기본값이 직접 입력(개월)이던 때 작성됐다 — 하네스(`buildCaseForm`)와 같이 그 모드를 명시해 읽는다.
 * (빈 판정 메뉴 폼의 기본값은 구간 입력 + 빈 구간 1개라 거주를 넣지 않으면 화면처럼 거주를 묻는다 — 아래 「폼 합치기」)
 */
const asAuthored = (form: ExtractedForm): ExtractedForm => ({
  ...form,
  asset: { residenceInputMode: "direct", residencePeriods: [], ...(form.asset ?? {}) },
});

describe("검증 질문", () => {
  it("판정이 맞는 손 매핑 폼(연혁 기준 match)은 막히는 칸이 없다", () => {
    const blocked = cases
      .filter((c) => c.basis === "era" && c.bucket === "match" && c.form && c.expected)
      .map((c) => ({ id: c.id, q: questionsOf(c, asAuthored(c.form!)).map((q) => `${q.path}: ${q.question}`) }))
      .filter((x) => x.q.length > 0);
    expect(blocked).toEqual([]);
    // 평가셋 전체(약 250건)를 돈다 — 2코어 CI 러너에서 기본 5초를 넘긴다(평가셋 하네스 테스트와 같은 60초)
  }, 60_000);

  it("양도가액을 지우면 그 칸이 화면 검증 문구로 질문이 된다", () => {
    const c = byId("E014-era");
    const form = clone(asAuthored(c.form!));
    delete (form as Record<string, unknown>).contractTotalPrice;
    const q = questionsOf(c, form);
    expect(q).toContainEqual(expect.objectContaining({ path: "contractTotalPrice", question: "예상 양도가액을 입력하세요.", source: "validation" }));
  });

  it("명부 행의 칸은 행 이름으로 묻는다(⑧ 행 번호 → 행 id)", () => {
    const c = byId("E014-era");
    const form = clone(asAuthored(c.form!));
    const row = form.houses![0] as Record<string, unknown> & { id: string };
    delete row.acquisitionDate;
    const q = questionsOf(c, form);
    expect(q.map((x) => x.path)).toContain(`houses[${row.id}].acquisitionDate`);
  });

  it("화면 검증을 지나도 API 본문 스키마가 막는 칸(분양권 지역 구분)도 묻는다", () => {
    const c = byId("E011-era");
    const form = clone(asAuthored(c.form!));
    const right = form.presaleRights![0] as unknown as Record<string, unknown> & { id: string };
    delete right.region;
    const q = questionsOf(c, form);
    expect(q).toContainEqual(expect.objectContaining({ path: `presaleRights[${right.id}].region`, label: "지역 구분" }));
  });
});

describe("폼 합치기", () => {
  it("명부 행은 화면 「+ 주택 추가」 기본값 위에 추출 칸을 덮는다", () => {
    const merged = mergeExtractedForm({ houses: [{ id: "B", acquisitionDate: "2010-01-01" }] });
    expect(merged.houses[0]).toMatchObject({ id: "B", acquisitionDate: "2010-01-01", region: "capital", isInherited: false });
  });
  it("거주를 하나도 받지 않으면 화면 기본값(구간 입력 + 빈 구간)이라 거주를 묻는다", () => {
    const c = byId("E014-era");
    const form = clone(c.form!);
    const q = questionsOf(c, form);
    expect(q.map((x) => x.path)).toContain("asset.residencePeriods");
  });
  it("거주를 총 개월로만 받으면 직접 입력 모드, 구간이면 구간 모드", () => {
    expect(mergeExtractedForm({ asset: { residencePeriodMonthsAsset: "24" } }).assets[0].residenceInputMode).toBe("direct");
    expect(
      mergeExtractedForm({ asset: { residenceInputMode: "interval", residencePeriods: [{ moveInDate: "2001-01-01", moveOutDate: "2003-01-01" }] } })
        .assets[0].residenceInputMode,
    ).toBe("interval");
  });
});
