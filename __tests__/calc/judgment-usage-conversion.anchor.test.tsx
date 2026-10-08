/**
 * @vitest-environment jsdom
 *
 * anchor — 판정 메뉴: **비주택 → 주택 용도변경일**(시행령 §154⑤ 단서 · 거주요건 기준일)이 엔진까지 닿는다.
 * 종전에는 칸이 없고 ④가 그 값을 거주 개월 상한에만 써서 본문에 싣지 않았다(엔진·⑫⑭는 이미 읽음).
 * route 결론은 평가셋 F395-era(거주요건 기준일) · F395-current / P-F395-current-noconv(보유 기산)가 고정한다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | U-1 | ⑤ | 주택 양도엔 칸 · 입주권 양도엔 없음 · 켜면 자동 판정 기준일이 주거용 사용 개시일 |
 * | U-2 | ④ | 켜고 날짜가 있으면 싣는다 · 끄거나 입주권 양도면 싣지 않는다 |
 * | U-3 | ⑧ | 계산기와 같은 leaf — 날짜 미입력·취득일 이전이면 차단 · 입주권 양도면 검사하지 않는다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

/** 고양 일산동구 — 2017-08-03 지정 · 2022-11-13 해제(장항동 한류월드 외) */
const ILSAN_DONG = "4128510100";

function form(o: { kind?: "housing" | "right_to_move_in"; on?: boolean; start?: string } = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  const kind = o.kind ?? "housing";
  return {
    ...f,
    transferDate: "2026-06-15",
    contractTotalPrice: "500000000",
    assets: [
      {
        ...f.assets[0],
        assetKind: kind,
        acquisitionDate: "2015-03-15",
        regionCode: ILSAN_DONG,
        hasNonHousingConversion: o.on ?? true,
        residentialUseStartDate: o.start ?? "2018-03-15",
        ...(kind === "right_to_move_in" ? { redevSubject: "right" } : {}),
      },
    ],
  } as OneHouseJudgmentFormData;
}

describe("U-1 ⑤", () => {
  it("주택 양도엔 칸 · 입주권 양도엔 없음", () => {
    render(<Step3 form={form()} onChange={() => {}} />);
    expect(screen.getByTestId("one-house-usage-conversion-date")).toBeTruthy();
    cleanup();
    render(<Step3 form={form({ kind: "right_to_move_in" })} onChange={() => {}} />);
    expect(screen.queryByTestId("one-house-usage-conversion")).toBeNull();
  });
  it("켜면 「취득 당시」 자동 판정이 주거용 사용 개시일 기준 — 2015 지정 전 미해당 / 2018 지정 중 해당", () => {
    render(<Step3 form={form({ on: false })} onChange={() => {}} />);
    expect(screen.getByTestId("one-house-regulated-auto").textContent).toMatch(/취득 당시 조정대상지역 미해당/);
    cleanup();
    render(<Step3 form={form()} onChange={() => {}} />);
    expect(screen.getByTestId("one-house-regulated-auto").textContent).toMatch(/주거용 사용 개시 당시 조정대상지역 해당/);
  });
});

describe("U-2 ④", () => {
  const body = (f: OneHouseJudgmentFormData) =>
    (buildOneHouseExemptionApiBody(f) as Record<string, unknown>).nonHousingToHousingConversion;
  it("켜고 날짜가 있으면 싣는다 · 아니면 싣지 않는다", () => {
    expect(body(form())).toMatchObject({ residentialUseStartDate: "2018-03-15" });
    expect(body(form({ on: false }))).toBeUndefined();
    expect(body(form({ start: "" }))).toBeUndefined();
    expect(body(form({ kind: "right_to_move_in" }))).toBeUndefined();
  });
});

describe("U-3 ⑧", () => {
  const errs = (f: OneHouseJudgmentFormData) => validateStep3(f).filter((e) => e.field === "residentialUseStartDate");
  it("날짜 미입력·취득일 이전이면 차단 · 정상·입주권 양도면 통과", () => {
    expect(errs(form({ start: "" }))).toHaveLength(1);
    expect(errs(form({ start: "2014-01-01" }))).toHaveLength(1);
    expect(errs(form())).toEqual([]);
    expect(errs(form({ kind: "right_to_move_in", start: "" }))).toEqual([]);
  });
});
