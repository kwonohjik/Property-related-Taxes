/**
 * @vitest-environment jsdom
 *
 * anchor — §154⑧3호 동일세대 상속: 거주요건의 「취득 당시」를 **동일세대 보유 개시일**로 본다 (M4).
 * 서면-2020-법령해석재산-3884(2017.8.2. 이전 동일세대 피상속인 취득 → 거주요건 없음) ·
 * 서면-2024-부동산-2580(지정 중 취득 → 해제 뒤 상속 → 거주요건 적용). route 결론은 평가셋 P-F242 · F252가 고정한다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | S-1 | leaf | 동일세대 상속 + 개시일이 상속개시일보다 앞설 때만 그 날 |
 * | S-2 | 엔진 | 거주요건 판정 — 경과규정(2017.8.3.)과 조정대상지역 여부가 그 날 기준 |
 * | S-3 | ⑤ | 판정 메뉴 자동 판정 카드도 같은 기준일 · 라벨이 바뀐다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { sameHouseholdInheritanceHoldingStart } from "@/lib/tax-engine/one-house/same-household-inheritance-start";
import { describeOneHouseResidenceRequirement } from "@/lib/tax-engine/transfer-tax-exemption-holding";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const D = (s: string) => new Date(s);
const RULE = { regulatedAreaMinResidenceYears: 2, prePolicyDate: "2017-08-03", prePolicyExemptResidence: true };
/** 서울 마포 — 2017-08-03 지정 · 2023-01-05 해제 */
const MAPO = "1144010100";

const inh = (start: string | undefined, sameHousehold = true) => ({
  acquisitionCause: "inheritance" as const,
  decedentSameHouseholdBeforeInheritance: sameHousehold,
  decedentCohabitationHoldingStartDate: start ? D(start) : undefined,
  acquisitionDate: D("2024-09-15"),
});

describe("S-1 leaf", () => {
  it("동일세대 + 개시일이 앞설 때만", () => {
    expect(sameHouseholdInheritanceHoldingStart(inh("2021-12-20"))).toEqual(D("2021-12-20"));
    expect(sameHouseholdInheritanceHoldingStart(inh("2021-12-20", false))).toBeUndefined();
    expect(sameHouseholdInheritanceHoldingStart(inh(undefined))).toBeUndefined();
    expect(sameHouseholdInheritanceHoldingStart(inh("2024-09-15"))).toBeUndefined();
  });
});

describe("S-2 거주요건 판정", () => {
  const basis = (start: string, regionCode?: string, sameHousehold = true) =>
    describeOneHouseResidenceRequirement(
      { ...inh(start, sameHousehold), transferDate: D("2025-06-15"), residencePeriodMonths: 0, regionCode } as never,
      RULE,
    ).basis;
  it("지정 중 동일세대 보유 개시 → 해제 뒤 상속이어도 거주요건(2580) · 별도세대면 상속개시일 기준(요건 없음)", () => {
    expect(basis("2021-12-20", MAPO)).toBe("unmet");
    expect(basis("2021-12-20", MAPO, false)).toBe("not_regulated");
  });
  it("2017.8.2. 이전 동일세대 보유 개시 → 경과규정으로 거주요건 없음(3884)", () => {
    expect(basis("2012-09-05", MAPO)).not.toBe("unmet");
    // 주소 없이 토글(취득 당시 조정)만 있는 경로 — 2017.8.3. 전에는 지정이 없어 주소 경로로는 경과규정이 가려진다.
    const toggle = (start: string) =>
      describeOneHouseResidenceRequirement(
        { ...inh(start), transferDate: D("2021-09-15"), residencePeriodMonths: 0, wasRegulatedAtAcquisition: true } as never,
        RULE,
      ).basis;
    expect(toggle("2012-09-05")).toBe("pre_policy");
    expect(toggle("2018-01-10")).toBe("unmet");
  });
});

describe("S-3 ⑤ 자동 판정 카드", () => {
  const form = (sameHousehold: boolean): OneHouseJudgmentFormData => {
    const f = createInitialOneHouseJudgmentForm();
    return {
      ...f,
      transferDate: "2025-06-15",
      assets: [
        {
          ...f.assets[0],
          assetKind: "housing",
          acquisitionDate: "2024-09-15",
          acquisitionCause: "inheritance",
          decedentSameHouseholdBeforeInheritance: sameHousehold,
          decedentCohabitationHoldingStartDate: "2021-12-20",
          regionCode: MAPO,
        },
      ],
    } as OneHouseJudgmentFormData;
  };
  it("동일세대면 보유 개시일로 판정(해당) · 아니면 상속개시일(미해당)", () => {
    render(<Step3 form={form(true)} onChange={() => {}} />);
    expect(screen.getByTestId("one-house-regulated-auto").textContent).toMatch(/동일세대 보유 개시 당시 조정대상지역 해당/);
    cleanup();
    render(<Step3 form={form(false)} onChange={() => {}} />);
    expect(screen.getByTestId("one-house-regulated-auto").textContent).toMatch(/취득 당시 조정대상지역 미해당/);
  });
});
