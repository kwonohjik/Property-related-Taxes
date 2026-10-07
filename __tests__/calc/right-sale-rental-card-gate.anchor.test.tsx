/**
 * @vitest-environment jsdom
 *
 * anchor — 판정 메뉴: **입주권 양도에는 §155⑳ 장기임대주택 칸이 없고, 임대주택은 명부에 넣게 안내한다** (평가셋 G066 · E197).
 *
 * ⑳은 주택 양도의 특례라 입주권 양도에 적용되지 않는다(서면-2017-법령해석재산-1581 · 조심-2019-서-3806). 칸이 보이면
 * 명부 밖에 선언한 임대주택이 §89①4호의 다른 주택 수에서 빠져 비과세가 났다. ⑤·④·⑧이 같은 `judgmentSaleIsHousing` 게이트.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | R-1 | ⑤ | 주택 양도엔 ⑳ 칸 · 입주권 양도엔 칸 대신 「명부에 넣으세요」 안내 |
 * | R-2 | ④ | 입주권 양도면 남아 있는 ⑳ 선언을 싣지 않는다 · 주택 양도면 싣는다 |
 * | R-3 | ⑧ | 입주권 양도면 ⑳ 오류·이중입력 경고·혼인 전 보유자 칸이 없다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateStep2, validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import { judgmentMarriageRentalOriginVisible } from "@/lib/calc/one-house-judgment-section-scope";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const RENTAL_TITLE = "장기임대주택 보유자 거주주택 비과세 특례 적용";

function form(assetKind: "housing" | "right_to_move_in"): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  const a = f.assets[0];
  return {
    ...f,
    transferDate: "2017-06-15",
    marriageDate: "2015-06-15",
    // 명부 2채 — 합가 칸이 열리는 구성(혼인 전 보유자 칸 게이트가 이것만으로 닫히지 않게)
    houses: [
      { id: "h1", acquisitionDate: "2010-03-15", mergeOrigin: "counterpart_side" },
      { id: "h2", acquisitionDate: "2011-03-15", mergeOrigin: "counterpart_side" },
    ],
    assets: [
      {
        ...a,
        assetKind,
        acquisitionDate: "2004-04-15",
        ...(assetKind === "right_to_move_in" ? { redevSubject: "right" } : {}),
        // 필수값이 빈 기본 호 — 주택 양도면 ⑧이 막는다
        rentalHousingException: { ...a.rentalHousingException, applyException: true, rentalUnits: [makeDefaultRentalUnit()] },
      },
    ],
  } as unknown as OneHouseJudgmentFormData;
}

describe("R-1 ⑤", () => {
  it("주택 양도엔 ⑳ 칸 · 입주권 양도엔 안내", () => {
    render(<Step3 form={form("housing")} onChange={() => {}} />);
    expect(screen.getByText(RENTAL_TITLE)).toBeTruthy();
    expect(screen.queryByTestId("one-house-right-sale-rental-notice")).toBeNull();
    cleanup();
    render(<Step3 form={form("right_to_move_in")} onChange={() => {}} />);
    expect(screen.queryByText(RENTAL_TITLE)).toBeNull();
    expect(screen.getByTestId("one-house-right-sale-rental-notice").textContent).toMatch(/보유 주택 목록에 넣으세요/);
  });
});

describe("R-2 ④ · R-3 ⑧", () => {
  it("입주권 양도면 싣지 않고 오류·경고·칸도 없다 · 주택 양도면 모두 있다", () => {
    const body = (k: "housing" | "right_to_move_in") =>
      (buildOneHouseExemptionApiBody(form(k)) as Record<string, unknown>).rentalHousingException;
    expect(body("right_to_move_in")).toBeUndefined();
    expect(body("housing")).toBeDefined();

    const rentalErrors = (k: "housing" | "right_to_move_in") =>
      validateStep3(form(k)).filter((e) => e.field === "rentalHousingException");
    expect(rentalErrors("right_to_move_in")).toEqual([]);
    expect(rentalErrors("housing").length).toBeGreaterThan(0);

    const dupWarn = (k: "housing" | "right_to_move_in") =>
      validateStep2(form(k)).filter((e) => e.field === "houses" && /다시 넣지 마세요/.test(e.message));
    expect(dupWarn("right_to_move_in")).toEqual([]);
    expect(dupWarn("housing")).toHaveLength(1);

    expect(judgmentMarriageRentalOriginVisible(form("right_to_move_in"))).toBe(false);
    expect(judgmentMarriageRentalOriginVisible(form("housing"))).toBe(true);
  });
});
