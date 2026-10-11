/**
 * @vitest-environment jsdom
 *
 * S14b-8 anchor — 중과 경과조치 미리보기가 **양도일 현재 비조정 지역** 주택에 「경과조치 대상 지역이 아닙니다 … 중과가 적용됩니다」와
 * 「미충족 — 현재 입력 기준 경과조치 배제 미해당」을 띄우지 않는다.
 *
 * 「소득세법」 §104⑦ 각 호는 「조정대상지역에 있는 주택으로서 …」로 시작한다 — 양도일 현재 비조정 지역 주택에는 중과 자체가 없다.
 * 그 경우 거짓 단정이다(세액은 원래 정확했다 — 표시 항목). 양도일 조정 여부는 엔진이 쓰는 leaf `isRegulatedByBjdCode`다.
 *
 * 짝: 양도일에는 조정(구리, 2026-07-01 지정)이지만 2026.5.9에는 비조정인 지역은 「대상 지역이 아닙니다」 안내가 남는다 —
 *     다만 「중과가 적용됩니다」 단정은 하지 않는다(다른 배제 사유 §167의10①11호 등을 이 카드가 보지 않았다).
 *     강남은 적용 개월수가 그대로 뜬다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";
import { makeHouse } from "../calc/one-house-rulings/harness";

afterEach(cleanup);

type Form = ReturnType<typeof createDefaultTransferFormData>;
const T = "2026-09-01";
const BUSAN = "2611010100"; // 부산 중구 — 전 기간 미지정
const GURI = "4131010100"; // 구리 — 2026-07-01 지정
const GANGNAM = "1168010100";
const NOT_TARGET = "나·다목 경과조치 대상 지역이 아닙니다";
const UNMET = "미충족 — 현재 입력 기준 경과조치 배제 미해당";
const NOT_REGULATED = "양도일 현재 조정대상지역이 아니어서 다주택 중과 대상이 아닙니다";

function form(code: string, contractDate = "2026-04-01"): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", regionCode: code };
  f.houses = [makeHouse("h2", { region: "capital", regionCode: GANGNAM, acquisitionDate: "2012-01-01", isApartment: true })];
  return Object.assign(f, {
    transferDate: T,
    householdHousingCount: "2",
    gracePeriod: { contractDate, isLandPermitTarget: false, permitApplicationDate: undefined, permitGranted: false, depositReceiptConfirmed: false },
  }) as Form;
}
const ui = (code: string, contractDate?: string) => {
  const { container } = render(<HousesListSection form={form(code, contractDate)} onChange={() => {}} />);
  return (container.textContent ?? "").replace(/\s+/g, " ");
};

describe("S14b-8 경과조치 미리보기 — 양도일 현재 비조정 지역", () => {
  it("부산 중구(양도일 비조정): 「중과가 적용됩니다」·「대상 지역이 아닙니다」·「미충족」을 띄우지 않고 중과 대상이 아니라고 말한다", () => {
    expect(isRegulatedByBjdCode(BUSAN, T).isRegulated).toBe(false); // 전제 — 엔진 leaf가 비조정
    for (const contractDate of ["", "2026-04-01"]) {
      const t = ui(BUSAN, contractDate);
      expect(t).not.toContain("중과가 적용됩니다");
      expect(t).not.toContain(NOT_TARGET);
      expect(t).not.toContain(UNMET);
      expect(t).toContain(NOT_REGULATED);
    }
  });

  it("대조: 구리(양도일 조정·5.9 비조정)는 「대상 지역이 아닙니다」 안내가 남고 「중과가 적용됩니다」 단정은 없다", () => {
    expect(isRegulatedByBjdCode(GURI, T).isRegulated).toBe(true);
    const t = ui(GURI);
    expect(t).toContain(NOT_TARGET);
    expect(t).not.toContain(NOT_REGULATED);
    expect(t).not.toContain("중과가 적용됩니다");
    expect(t).toContain(UNMET); // 조정 지역은 미충족 판정 줄이 그대로 있다
  });

  it("대조: 강남은 적용 개월수가 그대로 뜬다", () => {
    const t = ui(GANGNAM);
    expect(t).toContain("적용 개월수: 4개월");
    expect(t).not.toContain(NOT_REGULATED);
  });
});
