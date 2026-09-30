/**
 * @vitest-environment jsdom
 *
 * anchor: D-3 — `HouseCountVerifier` 세대 별도 인정 표시가 `description`이 없으면
 * 내부 `reason` id(예: `over65_cohabitation`)를 그대로 화면에 노출하던 결함.
 *
 * 오늘의 엔진(`lib/tax-engine/house-count/household.ts`)은 4종 사유 모두 항상
 * `description`을 채우므로 폴백은 실행되지 않지만, 옛 이력·향후 호출부 누락에 대비해
 * `SeparateHouseholdReason` 4종 전부에 한국어 라벨을 두어 내부 id가 새 나가지 않게 한다
 * (memory `feedback_no_internal_id_in_result`).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseCountVerifier } from "@/components/calc/results/acquisition/HouseCountVerifier";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";
import type { SeparateHouseholdReason } from "@/lib/tax-engine/house-count/types";

afterEach(cleanup);

const REASON_LABELS: Record<SeparateHouseholdReason, string> = {
  under30_income: "30세 미만 자녀 — 소득 요건 충족 (§28의3② 1호)",
  over65_cohabitation: "65세 이상 직계존속 동거봉양 합가 (§28의3② 2호)",
  overseas_90days: "90일 이상 해외 출국 (§28의3② 3호)",
  relocate_60days: "취득 후 60일 이내 주소 이전 (§28의3② 4호)",
};

function renderWithSeparateHousehold(reason: SeparateHouseholdReason, description?: string) {
  const result = {
    houseCountDetail: {
      totalCount: 1,
      effectiveCount: 1,
      pendingAcquisitionIncluded: true,
      excludedDetails: [],
      referenceDate: "2026-01-01",
      separateHousehold: { isSeparate: true, reason, description, legalBasis: "지방세법 시행령 §28의3②" },
    },
  } as unknown as AcquisitionTaxResult;

  render(<HouseCountVerifier result={result} />);
  fireEvent.click(screen.getByRole("button", { name: /주택 수 산정 결과/ }));
}

describe("D-3: HouseCountVerifier 세대 별도 인정 — description 누락 폴백", () => {
  for (const reason of Object.keys(REASON_LABELS) as SeparateHouseholdReason[]) {
    it(`${reason}: description 없어도 내부 id 대신 한국어 문구를 보여준다`, () => {
      renderWithSeparateHousehold(reason, undefined);
      expect(screen.getByText(REASON_LABELS[reason])).toBeInTheDocument();
      expect(screen.queryByText(reason)).not.toBeInTheDocument();
    });
  }

  it("twin: description이 있으면 그대로(엔진 문장 우선) 보여준다 — 회귀 방지", () => {
    renderWithSeparateHousehold("over65_cohabitation", "65세 이상 직계존속(72세) 동거봉양 합가 → 별도 세대 인정");
    expect(
      screen.getByText("65세 이상 직계존속(72세) 동거봉양 합가 → 별도 세대 인정"),
    ).toBeInTheDocument();
    expect(screen.queryByText(REASON_LABELS.over65_cohabitation)).not.toBeInTheDocument();
  });
});
