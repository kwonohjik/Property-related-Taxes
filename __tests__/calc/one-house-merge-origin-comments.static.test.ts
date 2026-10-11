/**
 * S14a-13 — 합가 전 보유 쪽(`mergeOrigin`) 입력은 판정 메뉴·계산기 공통이다(PR-2 이후).
 * 계산기: Step4.tsx·SurchargeJudgmentSection.tsx가 `mergeContextOf(form)`을 넘기고, ⑧(`transfer-tax-validate-step1.ts`)이
 * 미입력을 막으며, ④(`transfer-tax-api-houses.ts`)가 싣는다. 「계산기는 이 칸이 없다·넘기지 않는다·판정 메뉴 전용」 주석은 사실과 다르다.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("S14a-13 — mergeOrigin 주석·화면 설명", () => {
  it("사실(계산기도 입력·전송)이 코드에 있다 — 주석의 근거", () => {
    expect(read("app/calc/transfer-tax/steps/Step4.tsx")).toMatch(/mergeContext=\{mergeContextOf\(form\)\}/);
    expect(read("app/calc/transfer-tax/steps/step4-sections/SurchargeJudgmentSection.tsx")).toMatch(
      /mergeContext=\{mergeContextOf\(form\)\}/,
    );
    expect(read("lib/calc/transfer-tax-validate-step1.ts")).toMatch(/mergeHouseSideOf\(h, mergeCtx\) === undefined/);
  });
  it.each([
    ["lib/calc/transfer-tax-api-houses.ts", /계산기는 이 칸이 없어 늘 미전송/],
    ["app/calc/transfer-tax/steps/step4-sections/HousesListSection.tsx", /계산기는 넘기지 않는다\.\s*\*\/\s*\n\s*mergeContext/],
    ["components/calc/transfer/HouseEntryEditor.tsx", /합가 전 보유 쪽을 묻는다\(판정 메뉴 전용\)/],
    ["lib/stores/calc-wizard-asset-nbl.ts", /\*\*판정 메뉴 전용\*\* 입력\(엔진 `HouseInfo\.mergeOrigin`/],
    ["app/calc/transfer-tax/steps/step4-sections/HouseCountExemptionInputs.tsx", /판정 메뉴 전용 — `HousesListSection`의 같은 이름 prop으로 그대로 넘긴다\. \*\/\s*\n\s*mergeContext/],
    ["lib/api/transfer-tax-schema-sub.ts", /합가 전 보유 쪽 — 판정 메뉴 명부 입력/],
    ["lib/tax-engine/transfer-reductions/new-99-4.ts", /판정 메뉴만 그 칸을 채운다/],
    ["lib/tax-engine/transfer-tax-mixed-use-exemption.ts", /겸용 경로에는 합가 전 보유 쪽\(`mergeOrigin`\) 입력이 없다/],
    ["components/calc/transfer/HouseEntryMergeOriginBlock.tsx", /§155④⑤ · 판정 메뉴 전용/],
  ])("%s — 사실과 다른 주석이 없다", (rel, stale) => {
    expect(read(rel)).not.toMatch(stale);
  });
});
