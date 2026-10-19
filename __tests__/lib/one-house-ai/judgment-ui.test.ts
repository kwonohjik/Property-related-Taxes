import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  HOUSEHOLD_STEP_FIELDS,
  TRANSFER_STEP_FIELDS,
  hasJudgmentInput,
  judgmentStepOfPath,
} from "@/lib/one-house-ai/judgment-ui";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";

describe("judgmentStepOfPath — 질문 칸이 있는 화면", () => {
  it.each([
    ["isOneHousehold", 0],
    ["nonResidentStartDate", 0],
    ["transferDate", 1],
    ["asset.acquisitionDate", 1],
    ["asset.residencePeriods[].moveInDate", 1],
    ["asset.rentalHousingException.rentalUnits[u1].rentalCategory", 1],
    ["houses[A].acquisitionDate", 2],
    ["houses", 2],
    ["presaleRights[P].type", 2],
    ["temporaryTwoHouseSpecial", 2],
    ["newHouseAcquisitionDate", 2],
  ] as const)("%s → %i", (path, step) => {
    expect(judgmentStepOfPath(path)).toBe(step);
  });

  // 칸 목록이 화면 파일과 어긋나면 「그 단계에서 입력」이 엉뚱한 화면으로 데려간다
  it.each([
    ["Step1.tsx", HOUSEHOLD_STEP_FIELDS],
    ["Step3.tsx", TRANSFER_STEP_FIELDS],
  ] as const)("%s가 목록의 칸을 모두 받는다", (file, fields) => {
    const src = readFileSync(`app/calc/one-house-exemption/steps/${file}`, "utf-8");
    for (const f of fields) expect(src, f).toMatch(new RegExp(`\\b${f}\\b`));
  });
});

describe("hasJudgmentInput — 바꾸기 전 확인", () => {
  it("빈 폼은 입력이 없다(자동 생성 식별자는 매번 달라도)", () => {
    expect(hasJudgmentInput(createInitialOneHouseJudgmentForm())).toBe(false);
  });
  it("칸 하나라도 다르면 입력이 있다", () => {
    expect(hasJudgmentInput({ ...createInitialOneHouseJudgmentForm(), transferDate: "2024-04-30" })).toBe(true);
  });
});
