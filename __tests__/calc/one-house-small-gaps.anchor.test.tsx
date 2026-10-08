/**
 * @vitest-environment jsdom
 *
 * anchor — 1세대1주택 판정 메뉴·계산기의 작은 입력 갭 5종 (교재 §154 장 대조 후속).
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | S-1 | ⑧ · ⑫ | 1990-01-01 전 양도 — 계산기·판정 메뉴 ⑧ 오류 · route 400(필드 오류, 종전 500) · 1990-01-01은 통과 |
 * | S-2 | ⑧ · ⑤ | §98의8·§99의2(매매계약일만으로 판정) 행 — 매매계약일 미입력 차단 · 라벨에서 「(선택)」 제거 · 다른 조문은 그대로 |
 * | S-3 | leaf | 수용 잔존주택 기한 — 2013-02-14 양도 2년 · 2013-02-15 양도 5년 (route 결론은 평가셋 N-F264-remnant-2y-era · P-F264-remnant-5y-current) |
 * | S-4 | ⑤ | 미등기 토글 — 「소득세법 시행령 §168①」 제외 사유 안내 |
 * | S-5 | ⑤ | 「조합원입주권」 선택지 — 「소득세법 §88 9호」 범위 안내(양도 대상 · 명부 권리 종류) |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST as JUDGE_POST } from "@/app/api/calc/one-house-exemption/route";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { SpecialHouseExclusionSection } from "@/components/calc/transfer/SpecialHouseExclusionSection";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { collectSpecialHouseExclusionRowErrors } from "@/lib/calc/house-count-exclusion-reduction-validate";
import { resolveExpropriationRemnantYears } from "@/lib/tax-engine/data/expropriation-remnant-era";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset-reduction";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const judgeForm = (transferDate: string, assetKind: "housing" | "right_to_move_in" = "housing"): OneHouseJudgmentFormData => {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    transferDate,
    contractTotalPrice: "100000000",
    isOneHousehold: true,
    assets: [{ ...f.assets[0], assetKind, acquisitionCause: "purchase", acquisitionDate: "1985-06-01" }],
  } as OneHouseJudgmentFormData;
};

describe("S-1 1990-01-01 전 양도", () => {
  it("⑧ 계산기·판정 메뉴", () => {
    const calc = (td: string) =>
      collectStepIssues(0, { ...createDefaultTransferFormData(), transferDate: td } as TransferFormData).filter(
        (i) => i.field === "transferDate",
      );
    expect(calc("1989-12-31").map((i) => i.message)).toEqual(["1990.1.1. 이후 양도분만 계산·판정합니다."]);
    expect(calc("1990-01-01")).toEqual([]);
    const judge = (td: string) => validateStep3(judgeForm(td)).filter((e) => e.field === "transferDate");
    expect(judge("1989-12-31")).toHaveLength(1);
    expect(judge("1990-01-01")).toEqual([]);
  });
  it("⑫ route — 400 필드 오류 · 경계일은 200", async () => {
    const post = async (td: string) => {
      const res = await JUDGE_POST(
        new NextRequest("http://localhost/api/calc/one-house-exemption", {
          method: "POST",
          headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
          body: JSON.stringify(buildOneHouseExemptionApiBody(judgeForm(td))),
        }),
      );
      return { status: res.status, json: await res.json() };
    };
    const before = await post("1989-12-31");
    expect(before.status).toBe(400);
    expect(before.json.error.fieldErrors.transferDate).toEqual(["1990.1.1. 이후 양도분만 계산·판정합니다."]);
    expect((await post("1990-01-01")).status).toBe(200);
  });
});

const special = (article: SpecialHouseExclusionFormItem["article"], houseContractDate = ""): SpecialHouseExclusionFormItem =>
  ({ article, houseAcquisitionDate: "2013-06-01", houseContractDate, isNationalHousing: false, requirementsConfirmed: true }) as SpecialHouseExclusionFormItem;

describe("S-2 매매계약일만으로 판정하는 조문", () => {
  it("⑧ 미입력 차단 — §99의2·§98의8만", () => {
    expect(collectSpecialHouseExclusionRowErrors(special("unsold_99_2"))).toHaveLength(1);
    expect(collectSpecialHouseExclusionRowErrors(special("unsold_98_8"))).toHaveLength(1);
    expect(collectSpecialHouseExclusionRowErrors(special("unsold_99_2", "2013-05-01"))).toEqual([]);
    expect(collectSpecialHouseExclusionRowErrors(special("new_99"))).toEqual([]);
  });
  it("⑤ 라벨 — 해당 조문은 「(선택)」이 없다", () => {
    render(<SpecialHouseExclusionSection items={[special("unsold_99_2")]} onChange={() => {}} />);
    expect(screen.getByText(/^감면주택 매매계약일$/)).toBeTruthy();
    cleanup();
    render(<SpecialHouseExclusionSection items={[special("new_99")]} onChange={() => {}} />);
    expect(screen.getByText("감면주택 매매계약일 (선택)")).toBeTruthy();
  });
});

describe("S-3 잔존주택 기한 연혁", () => {
  it("2013-02-14 2년 · 2013-02-15 5년", () => {
    expect(resolveExpropriationRemnantYears(new Date("2013-02-14"))).toBe(2);
    expect(resolveExpropriationRemnantYears(new Date("2013-02-15"))).toBe(5);
  });
});

describe("S-4 · S-5 ⑤ 안내", () => {
  it("판정 메뉴 — 미등기 §168① · 조합원입주권 §88 9호", () => {
    const { container } = render(<Step3 form={judgeForm("2026-06-15")} onChange={() => {}} />);
    expect(container.textContent).toMatch(/등기가 불가능한 자산은 미등기양도자산이 아니므로 체크하지 마세요.*소득세법 시행령 §168①/);
    expect(container.textContent).toMatch(/소득세법 §88 9호.*주거환경개선사업 등 그 밖의 사업으로 받은 권리는 해당하지 않습니다/);
  });
  it("명부 권리 종류 — 조합원입주권일 때만", () => {
    const right = (type: PresaleRightEntry["type"]) => ({ id: "r1", type, acquisitionDate: "" }) as PresaleRightEntry;
    render(<PresaleRightsSection rights={[right("redevelopment_right")]} onChange={() => {}} />);
    expect(screen.getByTestId("presale-right-scope-hint").textContent).toMatch(/소득세법 §88 9호/);
    cleanup();
    render(<PresaleRightsSection rights={[right("presale_right")]} onChange={() => {}} />);
    expect(screen.queryByTestId("presale-right-scope-hint")).toBeNull();
  });
});
