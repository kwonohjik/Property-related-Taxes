/**
 * @vitest-environment jsdom
 *
 * 2-C 조정대상지역 — **취득 당시·양도 당시가 같은 규약을 쓴다** (F-3).
 * 계획서: `docs/00-pm/validation-warnings-display.plan.md` §7 F-3.
 *
 * ## 고치기 전
 *
 * 주소를 넣으면 **취득 당시만** 자동 판정 읽기전용 카드로 바뀌고, 양도 당시는 수동 토글로
 * 남았다. 그런데 엔진 소비처 셋이 전부 `regionCode`를 우선하므로, 그 토글은 사용자가 켜도
 * **조용히 버려지는 칸**이었다(형제 축에서 이미 고친 것과 같은 병).
 *
 * 🔑 유닛에서만 관측되는 것: **두 축이 같은 입력에 같은 모양으로 반응하는가.**
 *    엔진 쪽 우선순위는 `judgment-transfer-regulated-region-code.predo.anchor.test.ts`가 고정한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

/**
 * 서울 강남구 역삼동. **두 기준일이 서로 다른 답을 내는 시료**를 일부러 고른다 —
 * 2017-08-03 고시로 지정됐으므로 취득 2016(미해당) · 양도 2026(해당)이다(실측).
 * 같은 답이 나오는 시료를 쓰면 「양도 당시 카드가 취득일로 판정」해도 초록이라 구별력이 0이다.
 */
const SEOUL_GANGNAM = "1168010100";
const ACQ = "2016-01-01";
const TRANSFER = "2026-06-01";

function form(over: { regionCode?: string } = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    transferDate: TRANSFER,
    assets: [
      {
        ...f.assets[0],
        assetKind: "housing",
        acquisitionDate: ACQ,
        ...(over.regionCode ? { regionCode: over.regionCode } : {}),
      },
    ],
  } as OneHouseJudgmentFormData;
}

describe("RS-0 (전제) — 시료의 두 기준일이 실제로 갈린다", () => {
  it("취득 2016 미해당 · 양도 2026 해당", () => {
    expect(isRegulatedByBjdCode(SEOUL_GANGNAM, ACQ).isRegulated).toBe(false);
    expect(isRegulatedByBjdCode(SEOUL_GANGNAM, TRANSFER).isRegulated).toBe(true);
  });
});

describe("RS-1 — 주소가 없으면 **둘 다** 수동 토글", () => {
  it("취득 당시·양도 당시 토글이 모두 뜨고 자동 카드는 없다", () => {
    render(<Step3 form={form()} onChange={() => {}} />);
    expect(screen.getByTestId("one-house-was-regulated")).toBeTruthy();
    expect(screen.getByTestId("one-house-is-regulated")).toBeTruthy();
    expect(screen.queryByTestId("one-house-regulated-auto")).toBeNull();
    expect(screen.queryByTestId("one-house-transfer-regulated-auto")).toBeNull();
  });
});

describe("RS-2 — 주소가 있으면 **둘 다** 자동 판정 읽기전용", () => {
  it("자동 카드 2개가 각자의 기준일로 판정하고 토글은 사라진다", () => {
    render(<Step3 form={form({ regionCode: SEOUL_GANGNAM })} onChange={() => {}} />);

    /*
      🔑 두 카드가 **서로 다른 답**이어야 한다 — 같은 기준일을 쓰면 여기서 깨진다.
         (취득 2016 미해당 · 양도 2026 해당 — RS-0이 데이터로 못 박았다.)
    */
    expect(screen.getByTestId("one-house-regulated-auto").textContent).toMatch(
      /취득 당시 조정대상지역 미해당/,
    );
    expect(screen.getByTestId("one-house-transfer-regulated-auto").textContent).toMatch(
      /양도 당시 조정대상지역 해당/,
    );

    // 🔴 엔진이 무시하는 토글이 남아 있으면 안 된다 — 그것이 F-3의 본체다.
    expect(screen.queryByTestId("one-house-was-regulated")).toBeNull();
    expect(screen.queryByTestId("one-house-is-regulated")).toBeNull();
  });
});
