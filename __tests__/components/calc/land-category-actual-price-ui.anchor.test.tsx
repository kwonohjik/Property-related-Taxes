/**
 * 지목변경 과세표준 §10의6① 본칙 — ⑤ 화면 anchor [AT-LC-UI]
 *
 * 본칙과 보충은 **상호배타**다. 두 칸이 동시에 보이면 사용자가 둘 다 채울 수 있고,
 * 그러면 화면이 「무엇으로 계산했는가」를 말하지 못한다.
 *
 * ⚠️ 「본칙이면 시가표준액이 안 보인다」만 두면 **유일한 입력 경로를 지우는 회귀**를
 *    못 잡는다(`feedback_ui_gate_removes_sole_input_path`). OFF 짝을 함께 둔다.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { DeemedLandCategorySection } from "@/components/calc/acquisition/deemed/DeemedLandCategorySection";
import { INITIAL_FORM, type FormState } from "@/components/calc/acquisition/shared";

afterEach(cleanup);

function renderSection(patch: Partial<FormState>) {
  const form: FormState = {
    ...INITIAL_FORM,
    propertyType: "land",
    acquisitionCause: "deemed_land_category",
    deemedLandPrevCategory: "전",
    deemedLandNewCategory: "대",
    ...patch,
  };
  return render(<DeemedLandCategorySection form={form} set={() => {}} />);
}

describe("[AT-LC-UI] ⑤ 본칙·보충 상호배타", () => {
  it("[AT-LC-UI-01] 기본값(보충): 시가표준액 2칸이 보이고 사실상취득가격 칸은 없다", () => {
    renderSection({});
    expect(screen.getByLabelText("변경 전 시가표준액")).toBeTruthy();
    expect(screen.getByLabelText("변경 후 시가표준액")).toBeTruthy();
    expect(screen.queryByLabelText("사실상취득가격 (지목변경으로 증가한 가액)")).toBeNull();
  });

  it("[AT-LC-UI-02] 본칙 ON: 사실상취득가격 칸이 보이고 시가표준액 2칸은 사라진다", () => {
    renderSection({ deemedLandActualPriceKnown: true });
    expect(screen.getByLabelText("사실상취득가격 (지목변경으로 증가한 가액)")).toBeTruthy();
    expect(screen.queryByLabelText("변경 전 시가표준액")).toBeNull();
    expect(screen.queryByLabelText("변경 후 시가표준액")).toBeNull();
  });

  it("[AT-LC-UI-03] 토글 자체가 화면에 있다 — 켤 수 있어야 결함이 닫힌다", () => {
    renderSection({});
    const toggle = screen.getByTestId("land-actual-price-toggle");
    expect(within(toggle).getByRole("switch")).toBeTruthy();
  });
});

describe("[AT-LC-UI] ⑤ 미리보기는 적용된 조문을 따라간다", () => {
  it("[AT-LC-UI-10] 본칙 ON: 과세표준을 사실상취득가격으로 쓴다 (차액 아님)", () => {
    renderSection({
      deemedLandActualPriceKnown: true,
      deemedLandActualPrice: "300000000",
      // 보충용 값이 남아 있어도 미리보기는 본칙을 따른다
      deemedLandPrevStandardValue: "100000000",
      deemedLandNewStandardValue: "250000000",
    });
    expect(screen.getByText(/과세표준 = 사실상취득가격 300,000,000/)).toBeTruthy();
    // 3억 × 2% (§15② 본문)
    expect(screen.getByText(/= 6,000,000/)).toBeTruthy();
  });

  it("[AT-LC-UI-11] 〔역방향〕 본칙 OFF: 종전대로 차액 산식 (1.5억 × 2%)", () => {
    renderSection({
      deemedLandPrevStandardValue: "100000000",
      deemedLandNewStandardValue: "250000000",
    });
    expect(screen.getByText(/변경 후 250,000,000 - 변경 전 100,000,000 = 150,000,000/)).toBeTruthy();
    expect(screen.getByText(/= 3,000,000/)).toBeTruthy();
  });
});
