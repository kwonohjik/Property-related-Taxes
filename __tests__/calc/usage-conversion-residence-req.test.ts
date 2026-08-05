/**
 * Phase D — Step4 거주요건 안내 ↔ 엔진 판정 **단일 진실** 검증.
 *
 * Step4의 거주요건 경고(`residenceShortfall`)는 `buildResidenceReqInput(form)`을 만들어
 * 엔진 `meetsOneHouseResidenceRequirement`를 그대로 호출한다. 그래서 빌더가 용도변경 필드를
 * 빠뜨리면 **화면은 "요건 충족"인데 엔진은 비과세를 차단하는** 어긋남이 생긴다.
 *
 * 여기서 고정하는 것은 "빌더가 엔진과 같은 기준일을 넘긴다"는 사실이다.
 * 계획서: docs/02-design/features/non-housing-to-housing-conversion.plan.md (R-3 · C-12 · C-13)
 */
import { describe, it, expect } from "vitest";
import { buildResidenceReqInput } from "@/lib/calc/transfer-tax-api";
import { meetsOneHouseResidenceRequirement } from "@/lib/tax-engine/transfer-tax-exemption";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { ONE_HOUSE_RESIDENCE } from "@/lib/tax-engine/legal-codes/transfer";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/** 김포 동지역 — 2020-12 지정 → 2022 하반기 해제. 한 코드로 양방향 케이스를 만든다. */
const GIMPO = "4157010100";

function makeForm(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2021-06-01", // 조정대상지역 지정 기간
    regionCode: GIMPO,
    residenceInputMode: "direct" as const,
    residencePeriodMonthsAsset: "0", // 거주 0 — 요건이 부과되면 반드시 탈락
    ...over,
  };
  return {
    transferDate: "2026-01-27",
    assets: [asset],
    houses: [],
    presaleRights: [],
    isOneHousehold: true,
    householdHousingCount: "1",
    wasRegulatedAtAcquisition: true,
  } as unknown as TransferFormData;
}

describe("buildResidenceReqInput — 용도변경 기준일 전달", () => {
  it("토글 ON + 날짜 있으면 nonHousingToHousingConversion을 조립한다", () => {
    const input = buildResidenceReqInput(
      makeForm({ hasNonHousingConversion: true, residentialUseStartDate: "2023-06-01" }),
    );

    expect(input.nonHousingToHousingConversion?.residentialUseStartDate).toEqual(
      new Date("2023-06-01"),
    );
  });

  it("토글이 OFF면 undefined — 종전 경로 그대로", () => {
    const input = buildResidenceReqInput(makeForm());
    expect(input.nonHousingToHousingConversion).toBeUndefined();
  });

  it("토글만 켜고 날짜가 비어 있으면 비활성 — 술어가 단일 소스다", () => {
    const form = makeForm({ hasNonHousingConversion: true, residentialUseStartDate: "" });

    // UI·validate·API 변환이 쓰는 술어와 빌더의 판단이 일치해야 한다
    expect(isUsageConversionActive(form.assets[0])).toBe(false);
    expect(buildResidenceReqInput(form).nonHousingToHousingConversion).toBeUndefined();
  });
});

describe("★ Step4 안내 ↔ 엔진 판정 일치 (R-3 verify)", () => {
  /** Step4 `residenceShortfall`이 하는 것과 같은 호출 */
  const judge = (form: TransferFormData) =>
    meetsOneHouseResidenceRequirement(buildResidenceReqInput(form), ONE_HOUSE_RESIDENCE);

  it("C-12 취득시 조정 · 용도변경시 비조정 → 화면도 '거주요건 없음'으로 판정한다", () => {
    expect(
      judge(makeForm({ hasNonHousingConversion: true, residentialUseStartDate: "2023-06-01" })),
    ).toBe(true);

    // 토글이 없으면 취득일 기준이라 거주 0으로 경고가 뜬다 — 기준일이 결론을 가른다
    expect(judge(makeForm())).toBe(false);
  });

  it("C-13 취득시 비조정 · 용도변경시 조정 → 화면도 '거주요건 있음'으로 판정한다 (대칭)", () => {
    const acquiredBeforeDesignation = { acquisitionDate: "2019-06-01" };

    expect(
      judge(
        makeForm({
          ...acquiredBeforeDesignation,
          hasNonHousingConversion: true,
          residentialUseStartDate: "2021-06-01",
        }),
      ),
    ).toBe(false);

    expect(judge(makeForm(acquiredBeforeDesignation))).toBe(true);
  });
});
