/**
 * 축 B 토지 지분 정밀판정 레코드(④⑧ 공용)와 다건 엔진 고지 — 단위 anchor.
 * 계획서: docs/00-pm/axis-b-land-share-nbl-detailed-judgment.plan.md §4
 */
import { describe, it, expect } from "vitest";
import { buildFractionalShareNblRecord, NBL_ACQUISITION_DEPENDENT_EXEMPT_FLAGS } from "@/lib/calc/non-business-land-request";
import { nblShareExemptionWithheldNotice } from "@/lib/tax-engine/non-business-land/sole-split-share-notice";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";

const primary = {
  ...makeDefaultAsset(1),
  assetKind: "land", acquisitionArea: "300", acquisitionCause: "inheritance", acquisitionDate: "2014-01-02",
  decedentAcquisitionDate: "1990-01-01", ownershipNumerator: "50", ownershipDenominator: "100",
  nblUseDetailedJudgment: true, nblLandType: "farmland", nblZoneType: "agricultural",
  nblExemptAncestor8YearFarming: true, nblExemptInheritBefore2007: true, nblExemptFactoryAdjacent: true,
  transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01",
} as AssetForm;

describe("buildFractionalShareNblRecord", () => {
  it("땅 사실은 첫 카드, 취득 사실·지분율은 지분 카드", () => {
    const s = { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2019-06-03", donorAcquisitionDate: "2001-01-01", ownershipNumerator: "30", ownershipDenominator: "100" } as AssetForm;
    const r = buildFractionalShareNblRecord(s, primary);
    expect([r.assetKind, r.acquisitionArea, r.nblLandType, r.nblZoneType, r.transferCause, r.expropriationNoticeDate, r.nblUseDetailedJudgment])
      .toEqual(["land", "300", "farmland", "agricultural", "public_expropriation", "2020-01-01", true]);
    expect([r.acquisitionCause, r.acquisitionDate, r.decedentAcquisitionDate, r.donorAcquisitionDate, r.ownershipNumerator])
      .toEqual(["purchase", "2019-06-03", s.decedentAcquisitionDate, "2001-01-01", "30"]);
  });

  it("취득원인·취득일이 다르면 취득 경위 의존 6종만 끈다(땅 단위 공장 인접은 유지)", () => {
    for (const diff of [{ acquisitionCause: "purchase" }, { acquisitionDate: "2014-01-03" }] as Partial<AssetForm>[]) {
      const r = buildFractionalShareNblRecord({ ...primary, ...diff } as AssetForm, primary);
      for (const f of NBL_ACQUISITION_DEPENDENT_EXEMPT_FLAGS) expect(r[f]).toBe(false);
      expect(r.nblExemptFactoryAdjacent).toBe(true);
    }
  });

  it("같으면 첫 카드 선언 그대로", () => {
    const r = buildFractionalShareNblRecord({ ...primary, ownershipNumerator: "50" }, primary);
    expect([r.nblExemptAncestor8YearFarming, r.nblExemptInheritBefore2007]).toEqual([true, true]);
  });
});

describe("nblShareExemptionWithheldNotice", () => {
  const det = (u: Record<string, boolean> | undefined) => ({ unconditionalExemption: u }) as unknown as NonBusinessLandInput;
  const first = { nonBusinessLandDetails: det({ isAncestor8YearFarming: true, isInheritedBefore2007: true, isFactoryAdjacent: true }) };

  it("첫 지분에서 켜진 6종 중 꺼진 것만 이름을 든다(공장 인접은 대상 아님)", () => {
    const w = nblShareExemptionWithheldNotice({ soleSplitAcquisition: true, nonBusinessLandDetails: det({ isFactoryAdjacent: true } as never) }, first);
    expect(w).toContain("(2006.12.31. 이전 상속 · 직계존속 8년 이상 재촌·자경 토지의 상속·증여 — 소득세법 시행령 §168조의14 ③)");
    // 의제 입력 자체가 없는 지분(선언 전부 꺼짐)도 같다
    expect(nblShareExemptionWithheldNotice({ soleSplitAcquisition: true, nonBusinessLandDetails: det(undefined) }, first)).toBe(w);
  });

  it("고지하지 않는 경우: 축 B 아님 · 지분 판정 입력 없음 · 꺼진 선언 없음", () => {
    expect(nblShareExemptionWithheldNotice({ soleSplitAcquisition: undefined, nonBusinessLandDetails: det(undefined) }, first)).toBeUndefined();
    expect(nblShareExemptionWithheldNotice({ soleSplitAcquisition: true, nonBusinessLandDetails: undefined }, first)).toBeUndefined();
    expect(nblShareExemptionWithheldNotice({ soleSplitAcquisition: true, nonBusinessLandDetails: first.nonBusinessLandDetails }, first)).toBeUndefined();
  });
});

describe("임야·목장 「상속 3년 이내」 — 지분 사실로 (forest-pasture-inheritance §3-1)", () => {
  const first = {
    ...primary, acquisitionDate: "2020-01-01",
    nblForestInheritedWithin3Years: true, nblForestInheritanceDate: "2020-01-01", nblPastureInheritanceDate: "2020-01-01",
  } as AssetForm;
  const facts = (r: AssetForm) => [r.nblForestInheritedWithin3Years, r.nblForestInheritanceDate, r.nblPastureInheritanceDate];

  it("같은 경위면 첫 카드 값 그대로", () => {
    expect(facts(buildFractionalShareNblRecord({ ...first }, first))).toEqual([true, "2020-01-01", "2020-01-01"]);
  });
  it("경위가 다른 상속 지분 → 상속일 = 그 지분 상속개시일(취득일)", () => {
    const s = { ...makeDefaultAsset(2), acquisitionCause: "inheritance", acquisitionDate: "2022-01-01" } as AssetForm;
    expect(facts(buildFractionalShareNblRecord(s, first))).toEqual([true, "2022-01-01", "2022-01-01"]);
  });
  it("상속이 아닌 지분 → 끈다", () => {
    const s = { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2022-06-01" } as AssetForm;
    expect(facts(buildFractionalShareNblRecord(s, first))).toEqual([false, "", ""]);
  });
  it("Q-2 첫 카드에 선언이 없으면 상속 지분도 끈 채로", () => {
    const bare = { ...first, nblForestInheritedWithin3Years: false, nblForestInheritanceDate: "", nblPastureInheritanceDate: "" } as AssetForm;
    const s = { ...makeDefaultAsset(2), acquisitionCause: "inheritance", acquisitionDate: "2022-01-01" } as AssetForm;
    expect(facts(buildFractionalShareNblRecord(s, bare))).toEqual([false, "", ""]);
  });
});

describe("nblShareExemptionWithheldNotice — 임야·목장 상속 3년", () => {
  const det = (o: Record<string, unknown>) => o as unknown as NonBusinessLandInput;
  const first = {
    nonBusinessLandDetails: det({
      unconditionalExemption: { isAncestor8YearFarming: true },
      forestDetail: { inheritedForestWithin3Years: true, forestInheritanceDate: new Date("2022-01-01") },
      pasture: { inheritanceDate: new Date("2022-01-01") },
    }),
  };
  it("둘 다 빠지면 사유별 인용으로 알리고 6종 문구 뒤에 잇는다", () => {
    const w = nblShareExemptionWithheldNotice({ soleSplitAcquisition: true, nonBusinessLandDetails: det({}) }, first);
    expect(w).toBe(
      "같은 토지를 지분별로 나눠 취득했고 이 지분의 취득원인·취득일이 첫 지분과 다릅니다 — " +
        "첫 지분 카드에서 선언한 비사업용 토지 무조건 사업용 의제(직계존속 8년 이상 재촌·자경 토지의 상속·증여 — 소득세법 시행령 §168조의14 ③)는 " +
        "이 지분의 취득 경위에도 해당하는지 확인되지 않아 이 지분의 판정에는 적용하지 않았습니다 — 확인 필요. " +
        "이 지분은 상속받은 지분이 아니어서 첫 지분 카드에 입력한 상속 3년 이내 임야(소득세법 시행령 §168조의9 ③ 7호) · " +
        "상속 3년 이내 목장용지(소득세법 시행령 §168조의10 ② 1호) 사유를 이 지분의 판정에는 적용하지 않았습니다.",
    );
  });
  it("지분에 자기 상속일이 있으면(날짜가 달라도) 알리지 않는다", () => {
    const own = det({
      unconditionalExemption: { isAncestor8YearFarming: true },
      forestDetail: { inheritedForestWithin3Years: true, forestInheritanceDate: new Date("2023-01-01") },
      pasture: { inheritanceDate: new Date("2023-01-01") },
    });
    expect(nblShareExemptionWithheldNotice({ soleSplitAcquisition: true, nonBusinessLandDetails: own }, first)).toBeUndefined();
  });
});
