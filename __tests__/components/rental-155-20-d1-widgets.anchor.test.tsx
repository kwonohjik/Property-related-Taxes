/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — §155⑳ D1 입력 위젯이 **실제 카드에 배선돼 있다** (라이브러리 anchor ≠ 배선 증명).
 *
 * | # | OH | 주장 |
 * |---|---|---|
 * | W-41 | OH-41 | 나목에서도 ⑳2호 자기확인 토글이 보인다(종전: 나·라목 숨김) |
 * | W-39 | OH-39 | 말소 토글 ON이면 민특법 등록 유형 선택지가 뜨고, 고르면 onChange로 올라간다. 끄면 함께 비운다 |
 * | W-16 | OH-16 | 마목 918 안내가 양도일(2021-02-16/17)에 따라 갈린다 — 엔진과 같은 leaf |
 * | W-15 | OH-15 | B면 ③에 「등록 이후 거주기간」 칸이 모든 모드에 뜬다(A는 없다 — 짝) |
 * | W-40 | OH-40 | 판정 메뉴 구간 내에서만 경과조치·이력 입력이 뜨고, 계산기엔 없다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

type Unit = AssetForm["rentalHousingException"]["rentalUnits"][number];

function renderCard(unit: Unit, transferDate?: string, onChange = vi.fn()) {
  render(
    <RentalUnitCard
      unit={unit}
      index={0}
      onChange={onChange}
      onRemove={() => {}}
      canRemove={false}
      transferDate={transferDate}
    />,
  );
  return onChange;
}

describe("W-41 나목 ⑳2호 자기확인", () => {
  it("W-41a 나목(기존사업자)에서도 토글이 보인다", () => {
    renderCard({
      ...makeDefaultRentalUnit(),
      businessRegistrationDate: "2003-01-01",
      rentalRegistrationDate: "2003-01-01",
      rentalCategory: "existing_business",
    });
    expect(screen.getByText("나목 · 기존사업자 매입(5년)")).toBeTruthy();
    expect(screen.getByTestId("rental-requirements-confirmed-0")).toBeTruthy();
  });
});

describe("W-39 ㉓ 말소 등록 유형", () => {
  const base: Unit = {
    ...makeDefaultRentalUnit(),
    businessRegistrationDate: "2018-06-01",
    rentalRegistrationDate: "2018-06-01",
  };
  it("W-39a 토글 OFF면 등록 유형 선택지가 없다(짝)", () => {
    renderCard(base);
    expect(screen.queryByTestId("rental-terminated-type-short-0")).toBeNull();
  });
  it("W-39b 토글 ON이면 뜨고, 고르면 onChange로 올라간다", () => {
    const onChange = renderCard({ ...base, rentalAutoTermination: true });
    fireEvent.click(screen.getByTestId("rental-terminated-type-short-0"));
    expect(onChange.mock.calls.at(-1)?.[0].terminatedRegistrationType).toBe("short_term");
  });
  it("W-39c 토글을 끄면 등록 유형도 같은 onChange에서 비운다", () => {
    const onChange = renderCard({ ...base, rentalAutoTermination: true, terminatedRegistrationType: "long_term_general" });
    fireEvent.click(screen.getByRole("switch", { name: /자진·자동 말소된 임대주택/ }));
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.rentalAutoTermination).toBe(false);
    expect(last.terminatedRegistrationType).toBe("");
  });
});

describe("W-16 마목 918 안내 — 양도일 게이트", () => {
  const ma: Unit = {
    ...makeDefaultRentalUnit(),
    businessRegistrationDate: "2020-08-01",
    rentalRegistrationDate: "2020-08-01",
  };
  it("W-16a 2021-02-17 양도 → 「포함됩니다」", () => {
    renderCard(ma, "2021-02-17");
    expect(screen.getByText(/2021\.2\.17 이후 양도분은 해당해도 §155⑳ 장기임대주택에 포함됩니다/)).toBeTruthy();
  });
  it("W-16b 2021-02-16 양도 → 「배제됩니다」", () => {
    renderCard(ma, "2021-02-16");
    expect(screen.getByText(/2021\.2\.16 이전 양도분은 해당하면 §155⑳ 특례가 배제됩니다/)).toBeTruthy();
  });
});

function sectionAsset(over: Partial<AssetForm["rentalHousingException"]> = {}, acquisitionDate = "2018-01-01"): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionDate,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "30",
    rentalHousingException: {
      ...a.rentalHousingException,
      applyException: true,
      scenario: "A",
      rentalUnits: [makeDefaultRentalUnit()],
      ...over,
    },
  };
}
function renderSection(asset: AssetForm, mode: "facts" | "calc", transferDate: string, onChange = vi.fn()) {
  render(
    <RentalHousingExceptionSection
      mode={mode}
      rh={asset.rentalHousingException}
      asset={asset}
      acquisitionDate={asset.acquisitionDate}
      transferDate={transferDate}
      onChangeResidence={() => {}}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("W-15 B 등록 이후 거주기간", () => {
  const LABEL = "사업자등록·임대사업자 등록 이후 거주기간";
  it("W-15a B → 판정 메뉴·계산기 모두 칸이 있다", () => {
    renderSection(sectionAsset({ scenario: "B" }), "facts", "2027-01-01");
    expect(screen.getByLabelText(LABEL)).toBeTruthy();
    cleanup();
    renderSection(sectionAsset({ scenario: "B" }), "calc", "2027-01-01");
    expect(screen.getByLabelText(LABEL)).toBeTruthy();
  });
  it("W-15b 입력하면 문자열 개월로 올라간다", () => {
    const onChange = renderSection(sectionAsset({ scenario: "B" }), "facts", "2027-01-01");
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: "30" } });
    expect(onChange.mock.calls.at(-1)?.[0].postRegistrationResidenceMonths).toBe("30");
  });
  it("W-15c A → 칸이 없다(짝)", () => {
    renderSection(sectionAsset({ scenario: "A" }), "facts", "2027-01-01");
    expect(screen.queryByLabelText(LABEL)).toBeNull();
  });
});

describe("W-40 생애 1회 구간 입력", () => {
  it("W-40a 판정 메뉴 · 2019-06-01 취득 · 2024-06-01 양도 → 경과조치 토글 + 이력 라디오", () => {
    const onChange = renderSection(sectionAsset({}, "2019-06-01"), "facts", "2024-06-01");
    expect(screen.getByTestId("rental-lifetime-limit-block")).toBeTruthy();
    fireEvent.click(screen.getByTestId("rental-prior-history-used"));
    expect(onChange.mock.calls.at(-1)?.[0].priorRentalExemptionHistory).toBe("used");
  });
  it("W-40b 경계 짝: 2025-02-28 양도 → 블록 없음", () => {
    renderSection(sectionAsset({}, "2019-06-01"), "facts", "2025-02-28");
    expect(screen.queryByTestId("rental-lifetime-limit-block")).toBeNull();
  });
  it("W-40c 경과조치 ON이면 이력 라디오를 묻지 않는다", () => {
    renderSection(sectionAsset({ residenceTransitionUnderAddendum: true }, "2019-06-01"), "facts", "2024-06-01");
    expect(screen.queryByTestId("rental-prior-history-used")).toBeNull();
  });
  it("W-40d 계산기(calc)에는 판정 사실 칸이 없다", () => {
    renderSection(sectionAsset({}, "2019-06-01"), "calc", "2024-06-01");
    expect(screen.queryByTestId("rental-lifetime-limit-block")).toBeNull();
  });
});
