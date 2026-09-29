/**
 * anchor(④⑧) — 합가 칸 이동(① → ③)의 **전송·경고 게이트** (2026-09-29)
 *
 * 계획서 `docs/00-pm/one-house-judgment-merge-house-link.plan.md` 1단계.
 *
 * 합가 칸은 ③ 보유 주택 단계에서 **주택 수 ≥ 2 또는 권리 보유**일 때만 보인다
 * (`judgmentMergeInputVisible`). 칸이 사라지는 조건 — 명부를 지워 1주택이 됨 — 에서 남은
 * 날짜를 보내면 사용자가 볼 수 없는 합가 안내가 결과에 뜬다. 그래서 ⑤·④·⑧이 같은 술어를 쓴다.
 */
import { describe, it, expect } from "vitest";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateStepByIndex } from "@/lib/calc/one-house-exemption-validate";
import { judgmentMergeInputVisible } from "@/lib/calc/one-house-judgment-section-scope";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { HouseEntry, PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

const house: HouseEntry = {
  id: "h1",
  region: "capital",
  acquisitionDate: "2018-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
};

const right: PresaleRightEntry = {
  id: "r1",
  type: "redevelopment_right",
  acquisitionDate: "2016-10-01",
  region: "capital",
};

/** 두 합가일을 모두 넣은 폼 — 명부·권리만 바꿔 가며 게이트를 본다. */
function form(over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2024-06-01",
    contractTotalPrice: "1000000000",
    assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-06-01" }],
    marriageDate: "2020-01-01",
    parentalCareMergeDate: "2019-01-01",
    isFirstTransferredInMerge: true,
    ...over,
  };
}

const CASES = [
  { name: "2주택(명부 1행)", over: { houses: [house] }, visible: true },
  { name: "1주택 + 조합원입주권", over: { houses: [], presaleRights: [right] }, visible: true },
  { name: "1주택 · 권리 없음", over: { houses: [], presaleRights: [] }, visible: false },
] as const;

describe("MG-1 ⑤·④·⑧이 같은 게이트를 쓴다", () => {
  for (const c of CASES) {
    it(`${c.name} → 칸 ${c.visible ? "있음" : "없음"} · 전송 ${c.visible ? "함" : "안 함"} · ③ 경고 ${c.visible ? "있음" : "없음"}`, () => {
      const f = form(c.over as unknown as Partial<OneHouseJudgmentFormData>);
      expect(judgmentMergeInputVisible(f)).toBe(c.visible);

      const body = buildOneHouseExemptionApiBody(f);
      if (c.visible) {
        expect(body.marriageMerge).toEqual({ marriageDate: "2020-01-01" });
        expect(body.parentalCareMerge).toEqual({ mergeDate: "2019-01-01" });
        expect(body.isFirstTransferredInMerge).toBe(true);
      } else {
        expect(body).not.toHaveProperty("marriageMerge");
        expect(body).not.toHaveProperty("parentalCareMerge");
        expect(body).not.toHaveProperty("isFirstTransferredInMerge");
      }

      // 인덱스 2 = ③ 보유 주택 화면(`validateStepByIndex` 매핑)
      const warned = validateStepByIndex(f, 2).some((e) => e.field === "marriageDate");
      expect(warned).toBe(c.visible);
    });
  }
});

describe("MG-2 ① 세대 단계에는 합가 경고가 없다(칸이 ③으로 옮겨 갔다)", () => {
  it("두 합가일이 모두 있어도 인덱스 0(①)은 합가 경고를 내지 않는다", () => {
    const f = form({ houses: [house] });
    expect(validateStepByIndex(f, 0).some((e) => e.field === "marriageDate")).toBe(false);
  });
});
