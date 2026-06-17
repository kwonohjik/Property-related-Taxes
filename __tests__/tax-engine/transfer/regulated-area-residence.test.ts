/**
 * 거주요건 regionCode 정밀 전환 anchor — §154① 본문 거주 2년 요건.
 *
 * 취득 당시 조정대상지역이면 거주 2년 요건이 부과된다(소령 §154①).
 * regionCode(법정동코드)가 있으면 취득일 기준 isRegulatedByBjdCode로 정밀 판정,
 * 없으면 wasRegulatedAtAcquisition boolean fallback (회귀 0).
 *
 * numeric 영향: meetsOneHouseHoldingResidence=false → 1세대1주택 비과세 차단(과세).
 */

import { describe, it, expect } from "vitest";
import {
  meetsOneHouseHoldingResidence,
  resolveWasRegulatedAtAcquisition,
} from "@/lib/tax-engine/transfer-tax-exemption";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import { baseTransferInput } from "../_helpers/mock-rates";

const RULE: OneHouseSpecialRulesData["one_house_exemption"] = {
  maxExemptPrice: 1_200_000_000,
  minHoldingYears: 2,
  regulatedAreaMinResidenceYears: 2,
  prePolicyDate: "2017-08-03",
  prePolicyExemptResidence: true,
};

describe("resolveWasRegulatedAtAcquisition — 취득일 기준 정밀 판정", () => {
  it("regionCode 강남(취득 2019, 줄곧 지정) → true", () => {
    const input = baseTransferInput({ regionCode: "1168010100", acquisitionDate: new Date("2019-06-01") });
    expect(resolveWasRegulatedAtAcquisition(input)).toBe(true);
  });

  it("regionCode 김포 통진읍(취득 2021, 읍면 제외) → false (boolean true여도 정밀 판정 우선)", () => {
    const input = baseTransferInput({
      regionCode: "4157025021",
      acquisitionDate: new Date("2021-06-01"),
      wasRegulatedAtAcquisition: true, // 부정확한 플래그가 있어도 regionCode 정밀 판정이 우선
    });
    expect(resolveWasRegulatedAtAcquisition(input)).toBe(false);
  });

  it("regionCode 김포 동지역(취득 2021, 지정) → true", () => {
    const input = baseTransferInput({ regionCode: "4157010100", acquisitionDate: new Date("2021-06-01") });
    expect(resolveWasRegulatedAtAcquisition(input)).toBe(true);
  });

  it("regionCode 없음 → wasRegulatedAtAcquisition boolean fallback", () => {
    expect(resolveWasRegulatedAtAcquisition(baseTransferInput({ wasRegulatedAtAcquisition: true }))).toBe(true);
    expect(resolveWasRegulatedAtAcquisition(baseTransferInput({ wasRegulatedAtAcquisition: false }))).toBe(false);
  });
});

describe("meetsOneHouseHoldingResidence — 거주요건 numeric 영향", () => {
  it("regionCode 강남(조정) + 거주 0개월 → 거주요건 미충족 → false", () => {
    const input = baseTransferInput({
      regionCode: "1168010100",
      acquisitionDate: new Date("2019-06-01"),
      residencePeriodMonths: 0,
    });
    expect(meetsOneHouseHoldingResidence(input, RULE)).toBe(false);
  });

  it("regionCode 강남(조정) + 거주 24개월 → 충족 → true", () => {
    const input = baseTransferInput({
      regionCode: "1168010100",
      acquisitionDate: new Date("2019-06-01"),
      residencePeriodMonths: 24,
    });
    expect(meetsOneHouseHoldingResidence(input, RULE)).toBe(true);
  });

  it("regionCode 김포 통진읍(취득시 제외=비조정) + 거주 0개월 → 거주요건 면제 → true", () => {
    const input = baseTransferInput({
      regionCode: "4157025021",
      acquisitionDate: new Date("2021-06-01"),
      transferDate: new Date("2024-06-01"), // 보유 3년 ≥ 2년
      residencePeriodMonths: 0,
    });
    expect(meetsOneHouseHoldingResidence(input, RULE)).toBe(true);
  });

  it("fallback: regionCode 없음 + wasRegulated true + 거주 0개월 → false", () => {
    const input = baseTransferInput({ wasRegulatedAtAcquisition: true, residencePeriodMonths: 0 });
    expect(meetsOneHouseHoldingResidence(input, RULE)).toBe(false);
  });

  it("fallback: regionCode 없음 + wasRegulated false + 거주 0개월 → true", () => {
    const input = baseTransferInput({ wasRegulatedAtAcquisition: false, residencePeriodMonths: 0 });
    expect(meetsOneHouseHoldingResidence(input, RULE)).toBe(true);
  });
});
