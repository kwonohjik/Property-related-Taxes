/**
 * S10-11 anchor — 판정 메뉴 사이드바 「선언한 특례」가 ④와 같은 leaf(`deriveOneHouseFactsFromHouses` — 행 우선, 레거시 폴백)로
 * §155⑥1호·⑦·⑧ 선언을 적는다.
 *
 * 결함: 사이드바가 화면에서 켤 수 없는 레거시 스칼라(`culturalHeritageHouseSpecial` 등)만 읽어, 정본인 명부 행 선언은 빠졌다
 * (route는 행 선언으로 특례를 적용하는데 결과 화면에 들어가기 전에는 선언이 어디에도 안 보임). 판정값은 그대로다.
 * 레거시 줄을 지우지 않는다 — 행 표시가 없는 옛 record는 ④가 스칼라를 그대로 쓰므로 짝(레거시 폴백)을 함께 고정한다.
 */
import { describe, it, expect } from "vitest";
import { computeOneHouseJudgmentSummary } from "@/lib/calc/one-house-exemption-validate";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";

function mkCase(form: Record<string, unknown>): RulingCase {
  return { id: "p", docNo: "-", docDate: "-", basis: "era", today: "2024-06-02", summary: "", bucket: "match", form } as unknown as RulingCase;
}
const declared = (row: Record<string, unknown> | null, top: Record<string, unknown> = {}, rowOver: Record<string, unknown> = {}) =>
  String(
    computeOneHouseJudgmentSummary(
      buildCaseForm(
        mkCase({
          isOneHousehold: true, transferDate: "2024-06-01", contractTotalPrice: "800000000",
          asset: { assetKind: "housing", acquisitionDate: "2015-01-01", residenceMonths: "60" },
          houses: row ? [{ id: "H", acquisitionDate: "2010-01-01", region: "non_capital", ...row, ...rowOver }] : [],
          ...top,
        }),
      ),
    ).find((i) => i.label === "선언한 특례")?.value ?? "",
  );

describe("S10-11 사이드바 「선언한 특례」 — 명부 행 선언", () => {
  it("행 문화유산 → 문화유산주택", () => expect(declared({ oneHouseCulturalHeritage: true })).toContain("문화유산주택"));
  it("행 농어촌 → 농어촌주택", () =>
    expect(declared({ oneHouseRuralHouse: true, ruralHouseKind: "inherited", decedentSameHouseholdAtInheritance: false })).toContain("농어촌주택"));
  it("행 수도권 밖 부득이 → 수도권 밖 부득이", () =>
    expect(declared({ oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work" })).toContain("수도권 밖 부득이"));

  it("긍정 짝: 행 선언이 없으면 이 세 줄이 없다", () => {
    expect(declared({})).not.toMatch(/문화유산주택|농어촌주택|수도권 밖 부득이/);
    expect(declared(null)).toBe("");
  });

  it("양도일 이후 취득 행의 선언은 적지 않는다 — ④와 같은 보유 행 술어(S10-1)", () =>
    expect(declared({ oneHouseCulturalHeritage: true }, {}, { acquisitionDate: "2024-06-01" })).not.toContain("문화유산주택"));

  it("대조: 행 표시가 없는 옛 record의 레거시 스칼라 선언은 폴백으로 남는다", () => {
    expect(declared({}, { culturalHeritageHouseSpecial: true })).toContain("문화유산주택");
    expect(declared(null, { culturalHeritageHouseSpecial: true })).toContain("문화유산주택");
  });
});
