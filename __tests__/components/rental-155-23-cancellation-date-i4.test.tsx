/**
 * @vitest-environment jsdom
 *
 * I-4 ⑤·⑦ — 실제 카드에 배선됐는가(라이브러리 anchor ≠ 배선 증명).
 *
 * | # | 주장 |
 * |---|---|
 * | W-1 | 말소 토글 OFF면 말소일 칸이 없다 / ON이면 뜨고 입력이 onChange로 올라간다 |
 * | W-2 | 말소일을 넣으면 이 호 기한(민법 §161 연장 포함)과 양도일 기준 안/밖이 보인다 |
 * | W-3 | 2020.8.18. 전 말소일은 ㉓ 대상 아님을 알린다 |
 * | R-1 | 판정 메뉴·계산기 결과 카드가 엔진 echo(최초 말소일·기한)를 표시한다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { RentalCancellationWindowNote } from "@/components/calc/results/transfer/RentalCancellationWindowNote";
import { RentalHousingExceptionDetailCard } from "@/components/calc/results/transfer/RentalHousingExceptionDetailCard";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { RentalHousingExceptionResult } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

type Unit = AssetForm["rentalHousingException"]["rentalUnits"][number];

const base: Unit = {
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2018-06-01",
  rentalRegistrationDate: "2018-06-01",
};

function renderCard(unit: Unit, transferDate?: string, onChange = vi.fn()) {
  render(
    <RentalUnitCard unit={unit} index={0} onChange={onChange} onRemove={() => {}} canRemove={false} transferDate={transferDate} />,
  );
  return onChange;
}

describe("W ⑤ 말소일 입력", () => {
  it("W-1a 토글 OFF → 말소일 칸 없음", () => {
    renderCard(base);
    expect(screen.queryByTestId("rental-cancellation-date-0")).toBeNull();
  });
  it("W-1b 토글 ON → 칸이 뜨고 연·월·일 입력이 onChange(registrationCancellationDate)로 올라간다", () => {
    const onChange = renderCard({ ...base, rentalAutoTermination: true });
    const box = screen.getByTestId("rental-cancellation-date-0");
    fireEvent.change(within(box).getByLabelText("연도"), { target: { value: "2021" } });
    fireEvent.change(within(box).getByLabelText("월"), { target: { value: "03" } });
    fireEvent.change(within(box).getByLabelText("일"), { target: { value: "07" } });
    expect(onChange.mock.calls.at(-1)?.[0].registrationCancellationDate).toBe("2021-03-07");
  });
  it("W-2 기한 표시 — 역상 말일 2026-03-07(토) → 2026-03-09 · 양도일 03-10은 기한 경과", () => {
    renderCard({ ...base, rentalAutoTermination: true, registrationCancellationDate: "2021-03-07" }, "2026-03-10");
    const d = screen.getByTestId("rental-cancellation-deadline-0");
    expect(d.textContent).toContain("2026-03-09");
    expect(d.textContent).toContain("토요일·공휴일");
    expect(d.textContent).toContain("기한을 지났습니다");
  });
  it("W-2 짝 — 양도일 03-09는 기한 안", () => {
    renderCard({ ...base, rentalAutoTermination: true, registrationCancellationDate: "2021-03-07" }, "2026-03-09");
    expect(screen.getByTestId("rental-cancellation-deadline-0").textContent).toContain("기한 안입니다");
  });
  it("W-3 2020.8.18. 전 말소일 → 대상 아님 안내", () => {
    renderCard({ ...base, rentalAutoTermination: true, registrationCancellationDate: "2020-08-17" }, "2021-06-01");
    expect(screen.getByTestId("rental-cancellation-deadline-0").textContent).toContain("2020.8.18. 전 말소");
  });
});

describe("R ⑦ 결과 카드", () => {
  const w = {
    firstCancellationDate: "2020-09-01",
    firstUnitIndex: 1,
    calendarEnd: "2025-09-01",
    deadline: "2025-09-01",
    withinDeadline: false,
  };
  it("R-1a 기한 echo 표시(판정 메뉴 공용 컴포넌트)", () => {
    render(<RentalCancellationWindowNote window={w} />);
    const el = screen.getByTestId("rental-cancellation-window");
    expect(el.textContent).toContain("2020-09-01");
    expect(el.textContent).toContain("2호");
    expect(el.textContent).toContain("2025-09-01");
    expect(el.textContent).toContain("기한이 지났습니다");
  });
  it("R-1b echo가 없으면 아무것도 그리지 않는다(구 응답)", () => {
    const { container } = render(<RentalCancellationWindowNote window={undefined} />);
    expect(container.textContent).toBe("");
  });
  it("R-1d 판정 메뉴 결과 화면(§155⑳ 카드)이 echo를 그린다 — 배선", () => {
    const result = {
      judgment: {
        isExempt: false,
        isPartialExempt: false,
        appliedExceptions: [],
        pending: [],
        undetermined: [],
        unmetExceptions: [],
        legalBasis: [],
      },
      houseCount: { total: 1, countedForExemption: 1, excluded: [] },
      rentalHousingException: {
        scenario: "A",
        passed: false,
        residenceFailReasons: [],
        unitFailReasons: [{ unitIndex: 0, message: "1호: 기한 경과" }],
        periodPendingUnitIndexes: [],
        notices: [],
        cancellationWindow: w,
        legalBasis: "소득세법 시행령 §155⑳",
      },
    } as unknown as OneHouseExemptionResponse;
    render(<OneHouseJudgmentResultView result={result} />);
    expect(screen.getByTestId("rental-cancellation-window").textContent).toContain("2025-09-01");
  });
  it("R-1c 계산기 상세 카드(적용 분기)가 echo를 그린다", () => {
    const detail: RentalHousingExceptionResult = {
      applied: true,
      scenarioId: "RH-A2",
      eligibility: {
        passed: true,
        failReasons: [],
        residenceFailReasons: [],
        laws: [],
        cancellationWindow: { ...w, firstUnitIndex: 0, deadline: "2026-03-09", calendarEnd: "2026-03-07", withinDeadline: true },
      },
      taxableGain: 1,
      exemptGain: 1,
      appliedTable: "table-2",
      formulaTrace: { gain95Table1: 0, gain95Table2: 0, capApplied: false },
    };
    render(<RentalHousingExceptionDetailCard detail={detail} />);
    expect(screen.getByTestId("rental-cancellation-window").textContent).toContain("2026-03-09");
  });
});
