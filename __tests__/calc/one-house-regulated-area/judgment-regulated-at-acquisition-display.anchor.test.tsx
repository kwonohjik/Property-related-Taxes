/**
 * @vitest-environment jsdom
 *
 * S10-6·S13-14 anchor — 판정 메뉴 ② 화면의 §155⑳(§154⑩ 표준 경로)·입주권 카드는
 * 엔진과 같은 「코드 우선」 취득 당시 조정대상지역 값을 써야 한다(소령 §154① 괄호·⑩).
 * 정방향: 강남 코드 + 숨은 토글 false → 「조정대상지역 취득입니다」·「✗ 미충족」(엔진 passed=false와 일치).
 * 역방향: 부산 중구 코드 + 숨은 토글 true → 「조정대상지역 취득이 아니므로」·「✓ 충족」(엔진 passed=true와 일치).
 * S13-14: 입주권 강남 코드 + 숨은 토글 false + 종전주택 거주 10개월 → 거주 경고 노출.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

function base(kind: string, regionCode: string, was: boolean, extra: Record<string, unknown>): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  const a = makeDefaultAsset(1);
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2025-06-02",
    contractTotalPrice: "1000000000",
    wasRegulatedAtAcquisition: was,
    houses: [],
    assets: [{ ...a, assetKind: kind, acquisitionCause: "purchase", acquisitionDate: "2018-01-01", regionCode, addressJibun: "주소 1", ...extra }],
  } as unknown as OneHouseJudgmentFormData;
}
const rental = (code: string, was: boolean) =>
  base("housing", code, was, {
    residenceInputMode: "direct",
    residencePeriods: [],
    rentalHousingException: {
      ...makeDefaultAsset(1).rentalHousingException,
      applyException: true,
      scenario: "B",
      rentalUnits: [],
      wasRegisteredRentalOrChildcare: true,
      priorResidenceTransferDate: "2018-06-01",
    },
  });

describe("S10-6·S13-14 anchor — 화면 표시 = 코드 우선 판정", () => {
  it("정방향: 강남 코드 + 숨은 토글 false → 조정대상지역 취득·미충족", () => {
    render(<Step3 form={rental("1168010100", false)} onChange={() => {}} />);
    const t = document.body.textContent ?? "";
    expect(t).toContain("이 주택은 조정대상지역 취득입니다.");
    expect(t).not.toContain("조정대상지역 취득이 아니므로");
    expect(t).toMatch(/✗ 미충족 —\s*현재 0개월/);
  });
  it("역방향: 부산 중구 코드 + 숨은 토글 true → 조정대상지역 취득 아님·충족", () => {
    render(<Step3 form={rental("2611010100", true)} onChange={() => {}} />);
    const t = document.body.textContent ?? "";
    expect(t).toContain("이 주택은 조정대상지역 취득이 아니므로 거주요건이 없습니다.");
    expect(t).toMatch(/✓ 충족 —\s*현재 0개월/);
  });
  it("S13-14: 입주권 강남 코드 + 숨은 토글 false → 거주 경고", () => {
    render(
      <Step3
        form={base("right_to_move_in", "1168010100", false, {
          redevSubject: "right",
          redevExemptionEligibleAtApproval: "yes",
          redevPriorHouseHoldingMonths: "60",
          redevPriorHouseResidenceMonths: "10",
        })}
        onChange={() => {}}
      />,
    );
    expect(document.body.textContent ?? "").toContain("조정대상지역 취득으로 거주 24개월 미만");
  });
  it("긍정 짝: 주소 없음 + 숨은 토글 true → 저장값을 따른다(조정대상지역 취득·미충족)", () => {
    render(<Step3 form={rental("", true)} onChange={() => {}} />);
    const t = document.body.textContent ?? "";
    expect(t).toContain("이 주택은 조정대상지역 취득입니다.");
    expect(t).toMatch(/✗ 미충족 —\s*현재 0개월/);
  });
  it("긍정 짝: 주소 없음 + 숨은 토글 false → 조정대상지역 취득 아님·충족", () => {
    render(<Step3 form={rental("", false)} onChange={() => {}} />);
    const t = document.body.textContent ?? "";
    expect(t).toContain("이 주택은 조정대상지역 취득이 아니므로 거주요건이 없습니다.");
    expect(t).toMatch(/✓ 충족 —\s*현재 0개월/);
  });
  it("긍정 짝(S13-14): 입주권 강남 코드 + 숨은 토글 true → 거주 경고(코드·토글이 같으면 같다)", () => {
    render(
      <Step3
        form={base("right_to_move_in", "1168010100", true, {
          redevSubject: "right",
          redevExemptionEligibleAtApproval: "yes",
          redevPriorHouseHoldingMonths: "60",
          redevPriorHouseResidenceMonths: "10",
        })}
        onChange={() => {}}
      />,
    );
    expect(document.body.textContent ?? "").toContain("조정대상지역 취득으로 거주 24개월 미만");
  });
});
