import { describe, it, expect } from "vitest";
import { answerTargetOf, readAnswer, writeAnswer } from "@/lib/one-house-ai/question-answer";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";
import { mergeExtractedForm } from "@/lib/one-house-ai/merge-form";
import { catalogKeyOf, parsePath } from "@/lib/one-house-ai/apply-extraction";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

// 추출 API가 질문에 붙이는 칸 정보와 같다(사전 한 줄)
const fieldOf = (path: string) => {
  const segs = parsePath(path);
  return segs ? ONE_HOUSE_FIELD_CATALOG.find((s) => s.path === catalogKeyOf(segs)) : undefined;
};
const targetOf = (path: string, f: OneHouseJudgmentFormData) => answerTargetOf(path, fieldOf(path), f);
const form = () =>
  mergeExtractedForm({
    transferDate: "2026-11-07",
    asset: { acquisitionDate: "2017-12-08", rentalHousingException: { rentalUnits: [{ unitId: "R1" }] } },
    houses: [{ id: "B", acquisitionDate: "2024-11-07" }],
  });

describe("answerTargetOf — 바로 입력할 수 있는 질문", () => {
  it.each([
    ["isOneHousehold", "boolean"],
    ["contractTotalPrice", "amount"],
    ["asset.acquisitionDate", "date"],
    ["houses[B].region", "enum"],
    ["asset.rentalHousingException.rentalUnits[R1].rentalRegistrationDate", "date"],
  ] as const)("%s → %s 칸", (path, kind) => {
    expect(targetOf(path, form())?.spec.kind).toBe(kind);
  });

  it.each([
    ["houses", "묶음 질문(행 추가)"],
    ["asset.residencePeriods[].moveInDate", "행 이름 없는 칸"],
    ["houses[Z].region", "폼에 없는 행"],
    ["asset.rentalHousingException.rentalUnits[R9].rentalRegistrationDate", "폼에 없는 임대 행"],
    ["asset.regionCode", "주소 검색으로 채우는 코드 칸"],
    ["notInCatalog", "사전에 없는 경로"],
    ["asset.residencePeriodMonthsAsset", "구간 입력 중에는 읽히지 않는 거주 개월"],
  ])("%s → null (%s)", (path) => {
    expect(targetOf(path, form())).toBeNull();
  });

  it("칸 정보가 경로와 다르면 바로 입력하지 않는다", () => {
    expect(answerTargetOf("asset.acquisitionDate", fieldOf("transferDate"), form())).toBeNull();
  });

  it("거주 개월은 직접 입력 방식이면 바로 입력한다", () => {
    const f = form();
    f.assets[0] = { ...f.assets[0], residenceInputMode: "direct" };
    expect(targetOf("asset.residencePeriodMonthsAsset", f)?.spec.kind).toBe("decimalString");
  });
});

describe("readAnswer · writeAnswer", () => {
  it("행 칸에 쓰면 그 행만 바뀌고 입력 폼은 그대로다", () => {
    const f = form();
    const t = targetOf("houses[B].region", f)!;
    const before = readAnswer(f, t);
    const value = t.spec.values!.find((v) => v.value !== before)!.value;
    const next = writeAnswer(f, t, value);
    expect(readAnswer(next, t)).toBe(value);
    expect(next.houses[0].acquisitionDate).toBe("2024-11-07");
    expect(readAnswer(f, t)).toBe(before);
  });

  it("최상위·자산·임대 행 칸을 읽고 쓴다", () => {
    let f = form();
    for (const [path, value] of [
      ["isOneHousehold", true],
      ["asset.acquisitionDate", "2018-01-02"],
      ["asset.rentalHousingException.rentalUnits[R1].rentalRegistrationDate", "2017-03-01"],
    ] as const) {
      const t = targetOf(path, f)!;
      f = writeAnswer(f, t, value);
      expect(readAnswer(f, t)).toBe(value);
    }
    expect(f.isOneHousehold).toBe(true);
    expect(f.assets[0].acquisitionDate).toBe("2018-01-02");
  });
});
