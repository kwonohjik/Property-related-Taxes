/**
 * @vitest-environment jsdom
 *
 * D-78 — 판정 메뉴 취득일 칸 안내는 재개발·재건축 신축주택의 조합원 경위를 가른다.
 *
 * 종전 안내는 「재개발로 받은 신축주택이면 사용승인일」을 경위 구분 없이 지시했다. 주택을 출자한 원조합원이 따르면
 * 「취득 당시」 판정일·보유 기산이 준공일로 옮겨져 비과세가 과세로 바뀐다(`judgment-acq-date-redev-d78.anchor.test.ts`).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";

afterEach(cleanup);

function form(): OneHouseJudgmentFormData {
  return {
    ...createInitialOneHouseJudgmentForm(),
    isOneHousehold: true,
    transferDate: "2025-03-04",
    contractTotalPrice: "1000000000",
    assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2015-03-01" }],
  } as unknown as OneHouseJudgmentFormData;
}

describe("D-78 취득일 칸 안내 — 조합원 경위 세 갈래", () => {
  it("주택 출자 원조합원 = 헐기 전 종전주택 취득일, 승계·토지만 출자 = 사용승인일", () => {
    render(<Step3 form={form()} onChange={() => {}} />);
    const hint = screen.getByText(/주택\(건물\)을 출자한 원조합원은 헐기 전 종전주택 취득일/);
    expect(hint.textContent).toMatch(/소득세법 시행령 §154⑧/);
    expect(hint.textContent).toMatch(/입주권을 승계받은 조합원은 사용승인일/);
    expect(hint.textContent).toMatch(/토지만 출자한 원조합원도 사용승인일/);
    expect(document.body.textContent).not.toMatch(/재개발로 받은 신축주택이면 사용승인일/);
  });

  it("AI 필드 사전도 같은 세 갈래이고, 경위를 모르면 날짜를 넣지 않는다", () => {
    const entry = ONE_HOUSE_FIELD_CATALOG.find((e) => e.path === "asset.acquisitionDate");
    expect(entry?.hint).toMatch(/주택\(건물\)을 출자한 원조합원이면 헐기 전 종전주택 취득일/);
    expect(entry?.hint).toMatch(/입주권을 승계받았거나 토지만 출자한 원조합원이면 사용승인일/);
    expect(entry?.hint).toMatch(/경위를 알 수 없으면 날짜를 넣지 않는다/);
    expect(entry?.hint).not.toMatch(/재개발로 받은 신축주택이면 사용승인일/);
  });
});
