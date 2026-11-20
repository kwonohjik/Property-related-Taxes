/**
 * @vitest-environment jsdom
 *
 * D-45 · D-64 — 재개발 카드의 개월 셈은 정본과 같다(초일 산입).
 *
 * - D-45: 「거주개월 분리 입력」 카드가 첫날을 빼고 세어 2022-03-10~2024-03-09(정확히 2년)를 23개월로 저장했다(Step4 구간 입력은 24).
 *   카드 값이 Step4 거주를 대체하고 개월 칸이 없어 사용자가 고칠 수 없었다. 이제 카드·④가 `redevSplitResidenceMonths`(날짜가 있으면
 *   정본 `residenceIntervalMonths`로 다시 도출 — 옛 기록의 23도 교정)를 쓴다.
 * - D-64: 청산금 수령 원조합원의 「관리처분계획인가일 기준 보유 2년」 참고 문구가 첫날을 빼 2017-06-10~2019-06-09를 「1년 11개월 → 미충족」으로
 *   안내했다. 이제 보유기간 정본(`calculateHoldingPeriod`)을 쓴다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ExemptionAtApprovalCard } from "@/components/calc/transfer/RedevelopmentBlockCards";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { redevSplitResidenceMonths, residenceIntervalMonths } from "@/lib/stores/calc-wizard-asset-residence";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

describe("D-45 거주 분리 카드 개월 — 정본(초일 산입)과 같다", () => {
  const pairs: [string, string, number][] = [
    ["2022-03-10", "2024-03-09", 24],
    ["2022-03-10", "2024-03-08", 23],
    ["2022-03-10", "2024-03-10", 24],
    ["2022-01-31", "2022-02-27", 0],
    ["2020-02-29", "2021-02-27", 11],
  ];
  for (const [s, e, n] of pairs) {
    it(`${s} ~ ${e} = ${n} (Step4 구간 셈과 같다)`, () => {
      expect(redevSplitResidenceMonths(s, e, undefined)).toBe(n);
      expect(redevSplitResidenceMonths(s, e, undefined)).toBe(residenceIntervalMonths(s, e));
    });
  }

  it("옛 기록 — 날짜가 있으면 저장된 개월(첫날 뺀 23)을 믿지 않고 다시 도출한다", () => {
    expect(redevSplitResidenceMonths("2022-03-10", "2024-03-09", "23")).toBe(24);
  });

  it("날짜가 없거나 순서가 뒤집히면 저장된 개월을 쓴다", () => {
    expect(redevSplitResidenceMonths(undefined, undefined, "30")).toBe(30);
    expect(redevSplitResidenceMonths("2024-03-09", "2022-03-10", "12")).toBe(12);
    expect(redevSplitResidenceMonths(undefined, undefined, "")).toBeUndefined();
  });
});

describe("D-64 인가일 기준 보유 2년 참고 문구 — 보유기간 정본", () => {
  const asset = (acq: string, approval: string) =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "redevelopment_apt",
      redevSubject: "apt",
      redevSettlementDirection: "receive",
      redevIsSuccessorMember: "no",
      acquisitionCause: "purchase",
      acquisitionDate: acq,
      redevApprovalDate: approval,
      redevRightsValue: "900000000",
      redevExemptionEligibleAtApproval: "",
    }) as AssetForm;
  const text = () => document.body.textContent ?? "";

  it("2017-06-10 → 2019-06-09(정확히 2년) = 「2년 0개월 → 충족」 (수정 전 「1년 11개월 → 미충족」)", () => {
    render(<ExemptionAtApprovalCard asset={asset("2017-06-10", "2019-06-09")} onChange={() => {}} />);
    expect(text()).toContain("2년 0개월 → 2년 요건 충족");
  });

  it("하루 모자라면(2017-06-10 → 2019-06-08) 미충족", () => {
    render(<ExemptionAtApprovalCard asset={asset("2017-06-10", "2019-06-08")} onChange={() => {}} />);
    expect(text()).toContain("→ 2년 요건 미충족");
  });
});
