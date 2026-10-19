import { describe, expect, it } from "vitest";
import { applyExtraction, flattenForm, formFromFlat, parsePath, ROW_MARKER } from "@/lib/one-house-ai/apply-extraction";
import type { FieldSpec } from "@/lib/one-house-ai/field-catalog.types";
import type { OneHouseExtraction } from "@/lib/one-house-ai/extraction-schema";

const CATALOG: FieldSpec[] = [
  { path: "transferDate", kind: "date", label: "양도일", hint: "" },
  { path: "isOneHousehold", kind: "boolean", label: "1세대", hint: "" },
  { path: "contractTotalPrice", kind: "amount", label: "양도가액", hint: "" },
  { path: "winWinRentalIncreaseRatePct", kind: "decimalString", label: "인상률", hint: "" },
  { path: "asset.assetKind", kind: "enum", label: "자산", hint: "", values: [{ value: "housing", label: "주택" }] },
  { path: "asset.residencePeriods[].moveInDate", kind: "date", label: "전입", hint: "" },
  { path: "houses[].acquisitionDate", kind: "date", label: "취득일", hint: "" },
  { path: "asset.rentalHousingException.rentalUnits[].rentalMonths", kind: "int", label: "임대개월", hint: "" },
];

const ex = (over: Partial<OneHouseExtraction>): OneHouseExtraction => ({
  rows: [],
  facts: [],
  missingFacts: [],
  notes: [],
  ...over,
});
const fact = (path: string, value: string) => ({ path, value, evidence: "원문" });

describe("applyExtraction", () => {
  it("최상위·자산·명부·중첩 배열을 폼 조각 모양으로 옮긴다", () => {
    const { form, issues } = applyExtraction(
      ex({
        rows: [
          { collection: "houses", rowId: "B", description: "B주택" },
          { collection: "asset.rentalHousingException.rentalUnits", rowId: "U1", description: "임대주택" },
        ],
        facts: [
          fact("transferDate", "2006-04-14"),
          fact("isOneHousehold", "true"),
          fact("contractTotalPrice", "400,000,000"),
          fact("asset.assetKind", "housing"),
          fact("houses[B].acquisitionDate", "2005-01-02"),
          fact("asset.rentalHousingException.rentalUnits[U1].rentalMonths", "60"),
        ],
      }),
      CATALOG,
    );
    expect(issues).toEqual([]);
    expect(form).toEqual({
      transferDate: "2006-04-14",
      isOneHousehold: true,
      contractTotalPrice: "400000000",
      asset: { assetKind: "housing", rentalHousingException: { rentalUnits: [{ unitId: "U1", rentalMonths: 60 }] } },
      houses: [{ id: "B", acquisitionDate: "2005-01-02" }],
    });
  });

  it("사실이 없는 행도 만든다 — 주택이 있다는 사실만으로 주택 수에 들어간다", () => {
    const { form } = applyExtraction(ex({ rows: [{ collection: "houses", rowId: "C", description: "" }] }), CATALOG);
    expect(form.houses).toEqual([{ id: "C" }]);
  });

  it("사전에 없는 경로·형식 오류·허용값 밖·중복은 넣지 않고 오류로 돌려준다", () => {
    const { form, issues } = applyExtraction(
      ex({
        facts: [
          fact("transferDate", "2006.4."),
          fact("asset.assetKind", "land"),
          fact("unknownField", "x"),
          fact("isOneHousehold", "yes"),
          fact("contractTotalPrice", "1"),
          fact("contractTotalPrice", "2"),
        ],
        missingFacts: [{ path: "nope", question: "?", why: "" }],
      }),
      CATALOG,
    );
    expect(form).toEqual({ contractTotalPrice: "1" });
    expect(issues.map((i) => i.path)).toEqual([
      "transferDate",
      "asset.assetKind",
      "unknownField",
      "isOneHousehold",
      "contractTotalPrice",
      "nope",
    ]);
  });

  it("묶음 질문(배열 경로 · 행 이름 없는 칸)은 질문 경로로 받는다", () => {
    const q = (path: string) => ({ path, question: "?", why: "" });
    const { issues } = applyExtraction(
      ex({ missingFacts: [q("houses"), q("asset.residencePeriods"), q("asset.residencePeriods[].moveInDate"), q("presale"), q("houses[].nope")] }),
      CATALOG,
    );
    expect(issues.map((i) => i.path)).toEqual(["presale", "houses[].nope"]);
  });

  it("소수·음수 칸은 소수·음수를 받는다", () => {
    const { form, issues } = applyExtraction(ex({ facts: [fact("winWinRentalIncreaseRatePct", "-4.5")] }), CATALOG);
    expect(issues).toEqual([]);
    expect(form).toEqual({ winWinRentalIncreaseRatePct: "-4.5" });
  });

  it("존재하지 않는 날짜(2월 30일)는 거른다", () => {
    const { issues } = applyExtraction(ex({ facts: [fact("transferDate", "2021-02-30")] }), CATALOG);
    expect(issues).toHaveLength(1);
  });

  it("거주 구간을 받으면 구간 입력 모드로 둔다", () => {
    const { form } = applyExtraction(
      ex({
        rows: [{ collection: "asset.residencePeriods", rowId: "1", description: "" }],
        facts: [fact("asset.residencePeriods[1].moveInDate", "2001-01-01")],
      }),
      CATALOG,
    );
    expect(form.asset).toEqual({ residencePeriods: [{ moveInDate: "2001-01-01" }], residenceInputMode: "interval" });
  });

  it("선언 안 된 행에 사실이 오면 행을 만들되 고지한다", () => {
    const { form, issues } = applyExtraction(ex({ facts: [fact("houses[X].acquisitionDate", "2010-01-01")] }), CATALOG);
    expect(form.houses).toEqual([{ id: "X", acquisitionDate: "2010-01-01" }]);
    expect(issues).toHaveLength(1);
  });
});

describe("parsePath · flattenForm · formFromFlat", () => {
  it("행 이름에 점이 있어도 구간을 가른다", () => {
    expect(parsePath("houses[a.b].acquisitionDate")).toEqual([{ name: "houses", row: "a.b" }, { name: "acquisitionDate" }]);
    expect(parsePath("houses[].x")).toBeNull();
  });

  it("평면화했다 되돌리면 같은 폼이다(행 식별자는 경로로)", () => {
    const form = {
      transferDate: "2004-03-03",
      asset: { assetKind: "housing", residencePeriods: [{ moveInDate: "2001-01-01", moveOutDate: "2002-01-01" }] },
      houses: [{ id: "son-in-law", acquisitionDate: "1995-05-15" }],
      presaleRights: [],
    };
    const flat = flattenForm(form as never);
    expect([...flat.keys()]).toEqual([
      "transferDate",
      "asset.assetKind",
      "asset.residencePeriods[1]",
      "asset.residencePeriods[1].moveInDate",
      "asset.residencePeriods[1].moveOutDate",
      "houses[son-in-law]",
      "houses[son-in-law].acquisitionDate",
      "presaleRights",
    ]);
    expect(flat.get("houses[son-in-law]")).toBe(ROW_MARKER);
    expect(formFromFlat(flat)).toEqual(form);
  });

  it("사실이 없는 행도 평면화 → 복원에서 살아남는다", () => {
    const form = { houses: [{ id: "C" }] };
    expect(formFromFlat(flattenForm(form as never))).toEqual(form);
  });
});
