/**
 * E-14k leaf — 12의2 한시 배제의 **하한**(2022.5.10.)은 seed 행이 아니라 부칙으로 판정한다.
 *
 * 대통령령 제32654호(2022.5.31.) 부칙 제4조: 「제167조의3제1항제12호의2 … 및 제167조의11제1항제12호의
 * 개정규정은 2022년 5월 10일 이후 주택을 양도하는 경우부터 적용한다.」
 *
 * 다건 route는 과세기간 말일로 세율을 읽어(2022년 → 2022-05-10 유예 행) 하한 전 양도분에도 유예 행을 넘긴다.
 * 그래서 두 판정 지점 모두 **유예 행을 받은 상태에서** 하한을 지켜야 한다.
 * route 관측은 `__tests__/api/transfer.route.multi-surcharge-pre-suspension-e14k.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { isSurchargeSuspended, isBeforeSurchargeSuspensionStart } from "@/lib/tax-engine/tax-utils";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionActive,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

/** 다건 route가 2022년 과세기간에 받는 세율 — 2022-05-10 유예 행과 같은 내용 */
const RULES_2022 = suspensionActive;

describe("isSurchargeSuspended — 하한 2022.5.10.", () => {
  it("L-1 2022.5.9. 양도 + 유예 행 → false (수정 전 true)", () => {
    expect(isBeforeSurchargeSuspensionStart(new Date("2022-05-09"))).toBe(true);
    expect(isSurchargeSuspended(RULES_2022, new Date("2022-05-09"), "multi_house_3plus")).toBe(false);
  });
  it("L-2 긍정 짝 — 2022.5.10. 양도 → true", () => {
    expect(isBeforeSurchargeSuspensionStart(new Date("2022-05-10"))).toBe(false);
    expect(isSurchargeSuspended(RULES_2022, new Date("2022-05-10"), "multi_house_3plus")).toBe(true);
  });
});

describe("determineMultiHouseSurcharge(정밀 경로) — 유예 행을 받아도 하한 전 양도는 중과", () => {
  const run = (transferDate: string, withGrace: boolean) =>
    determineMultiHouseSurcharge(
      makeInput([makeHouse("h1", { acquisitionDate: new Date("2015-01-01") }), makeHouse("h2"), makeHouse("h3")], {
        sellingHouseId: "h1",
        transferDate: new Date(transferDate),
        ...(withGrace
          ? { gracePeriod: { contractDate: new Date(transferDate), isLandPermitTarget: false, depositReceiptConfirmed: true } }
          : {}),
      }),
      defaultRules,
      mockRegulatedHistory,
      RULES_2022,
      true,
    );

  it("L-3 2022.3.15. 양도 → 유예 아님 · 중과 (수정 전 유예)", () => {
    expect(run("2022-03-15", false)).toMatchObject({ isSurchargeSuspended: false, surchargeApplicable: true });
  });
  it("L-4 2022.3.15. 양도 + gracePeriod(가목 게이트 경로) → 유예 아님 (수정 전 가목 유예)", () => {
    const r = run("2022-03-15", true);
    expect(r).toMatchObject({ isSurchargeSuspended: false, surchargeApplicable: true });
    expect(r.surchargeSuspensionBasis).toBeUndefined();
  });
  it("L-5 긍정 짝 — 2022.5.10. 양도 → 유예 (gracePeriod 유무 모두 · 가목)", () => {
    expect(run("2022-05-10", false)).toMatchObject({ isSurchargeSuspended: true, surchargeApplicable: false });
    expect(run("2022-05-10", true)).toMatchObject({ isSurchargeSuspended: true, surchargeSuspensionBasis: "a" });
  });
});
