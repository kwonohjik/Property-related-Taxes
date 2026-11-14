/**
 * @vitest-environment jsdom
 *
 * anchor(⑤⑦) — §155⑳ 임대사업 승계 입력(G-3·G-5 · 계획서 PR-2).
 *
 * | # | 주장 |
 * |---|---|
 * | SB-1 | 승계 종류별 칸 노출 — 없음=칸 없음 · 상속·포괄양수=개월만 · 증여=개월+증여자 날짜 3칸, 개월 라벨은 종류별 |
 * | SB-2 | 종류를 바꾸면 개월·증여자 날짜가 비고 같은 종류를 다시 고르면 지우지 않는다 (한 번의 onChange) |
 * | SB-3 ★ | 증여 선택 시 판정 기준 배지가 **증여자 날짜 기준 목**(가목)으로 바뀐다 — 수증자 날짜(마목)로 대신하지 않는다 |
 * | SB-4 | 증여자 날짜를 비워 두면 배지는 본인 날짜로 대신하지 않고 입력 요구를 보인다 |
 * | SB-5 | 종류 변경으로 실효 등록 기준이 바뀌어 무효가 된 임대 구분은 장기일반으로 치유된다 |
 * | SB-6 | 결과 echo — 호별 한 줄(한국어 풀어쓰기) · 승계 없으면 렌더하지 않는다 |
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { RentalSuccessionEchoNote, rentalSuccessionEchoText } from "@/components/calc/results/transfer/RentalSuccessionEchoNote";
import { applyRentalRegDate, applyRentalSuccession } from "@/lib/calc/rental-unit-reg-date";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

type Unit = ReturnType<typeof makeDefaultRentalUnit>;

/** 수증자 본인 등록은 2021(마목) · 증여자 등록은 2019(가목) */
const OWN = {
  businessRegistrationDate: "2021-01-01",
  rentalRegistrationDate: "2021-01-01",
  rentalRegisteredDate: "2021-01-01",
};
const DONOR = {
  donorBusinessRegistrationDate: "2019-05-01",
  donorRentalRegistrationDate: "2019-06-01",
  donorRentalRegisteredDate: "2019-06-01",
};

let latest: Unit;
function Harness({ initial }: { initial: Unit }) {
  const [unit, setUnit] = useState(initial);
  const onChange = (u: Unit) => {
    latest = u; // 마지막 변경값 — 이벤트 핸들러에서 기록한다(렌더 중 기록 금지)
    setUnit(u);
  };
  return <RentalUnitCard unit={unit} index={0} onChange={onChange} onRemove={() => {}} canRemove={false} transferDate="2024-01-01" />;
}
function renderCard(over: Partial<Unit>) {
  const initial = { ...makeDefaultRentalUnit(), ...OWN, ...over };
  latest = initial;
  render(<Harness initial={initial} />);
}
const badge = () => screen.getByTestId("rental-verdict-badge-0").textContent ?? "";
const pick = (id: string) => fireEvent.click(screen.getByTestId(id));

describe("⑳ 임대사업 승계 입력", () => {
  it("SB-1 종류별 칸 노출", () => {
    renderCard({});
    expect(screen.queryByTestId("rental-predecessor-months-0")).toBeNull();
    expect(screen.queryByTestId("rental-donor-reg-date-0")).toBeNull();

    pick("rental-succession-inheritance-0");
    expect(screen.getByText("피상속인 임대기간")).toBeTruthy();
    expect(screen.queryByTestId("rental-donor-reg-date-0")).toBeNull();

    pick("rental-succession-assumption-0");
    expect(screen.getByText("전 임대사업자 임대기간")).toBeTruthy();
    expect(screen.queryByTestId("rental-donor-reg-date-0")).toBeNull();

    pick("rental-succession-household-gift-0");
    expect(screen.getByText("증여자 임대기간")).toBeTruthy();
    for (const id of ["rental-donor-biz-date-0", "rental-donor-reg-date-0", "rental-donor-registered-date-0"]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }

    pick("rental-succession-none-0");
    expect(screen.queryByTestId("rental-predecessor-months-0")).toBeNull();
    expect(screen.queryByTestId("rental-donor-biz-date-0")).toBeNull();
  });

  it("SB-2 종류 변경 시 개월·증여자 날짜 초기화, 같은 종류 재선택은 유지", () => {
    renderCard({ rentalSuccession: "household_gift", decedentRentalMonths: "24", ...DONOR });
    pick("rental-succession-household-gift-0");
    expect(latest).toMatchObject({ decedentRentalMonths: "24", donorRentalRegistrationDate: "2019-06-01" });

    pick("rental-succession-inheritance-0");
    expect(latest).toMatchObject({
      rentalSuccession: "inheritance",
      isInheritedRental: false,
      decedentRentalMonths: "",
      donorBusinessRegistrationDate: "",
      donorRentalRegistrationDate: "",
      donorRentalRegisteredDate: "",
    });
  });

  it("SB-3 ★ 증여 선택 + 증여자 날짜 → 배지가 증여자 기준 가목, 본인 날짜는 마목", () => {
    renderCard({});
    expect(badge()).toContain("마목");
    expect(screen.queryByTestId("rental-verdict-donor-basis-0")).toBeNull();

    // 증여 선택 후 증여자 날짜를 채운 상태(전환 직후엔 비어 있으므로 폼 상태를 채워 다시 그린다)
    cleanup();
    renderCard({ rentalSuccession: "household_gift", decedentRentalMonths: "24", ...DONOR });
    expect(badge()).toContain("가목");
    expect(badge()).not.toContain("마목");
    expect(screen.getByTestId("rental-verdict-donor-basis-0").textContent).toContain("2019-06-01");
  });

  it("SB-4 증여인데 증여자 날짜가 비면 본인 날짜로 대신하지 않고 입력을 요구한다", () => {
    renderCard({ rentalSuccession: "household_gift", decedentRentalMonths: "24" });
    expect(badge()).toContain("증여자의 세무서 사업자등록일");
    expect(badge()).not.toContain("마목");
  });

  it("SB-5 증여자 등록 기준으로 무효가 된 임대 구분은 장기일반으로 치유되고, 신청일을 넣으면 등록일이 따라간다", () => {
    // 본인 등록 2025-07-01 — 단기 6년(2025.6.4. 이후 등록) 선택 가능. 증여자 신청일 2019-06-01 — 불가
    const own = {
      ...makeDefaultRentalUnit(),
      businessRegistrationDate: "2025-07-01",
      rentalRegistrationDate: "2025-07-01",
      rentalRegisteredDate: "2025-07-01",
      rentalCategory: "short_6y" as const,
      rentalSuccession: "household_gift" as const,
    };
    const biz = applyRentalRegDate(own, "donorBusinessRegistrationDate", "2019-05-01");
    expect(biz.rentalCategory).toBe("short_6y"); // 증여자 신청일이 아직 없어 판정 불가 — 지우지 않는다
    const app = applyRentalRegDate(biz, "donorRentalRegistrationDate", "2019-06-01");
    expect(app.rentalCategory).toBe("long_general");
    expect(app.donorRentalRegisteredDate).toBe("2019-06-01");
    // 본인 칸은 건드리지 않는다
    expect(app.rentalRegistrationDate).toBe("2025-07-01");
    // 종류를 없음으로 되돌리면 본인 등록 기준으로 다시 점검(2025-07-01 — 단기 6년 가능)하고 증여자 칸은 비운다
    const back = applyRentalSuccession({ ...app, rentalCategory: "short_6y" }, "");
    expect(back).toMatchObject({ rentalCategory: "short_6y", donorRentalRegistrationDate: "", rentalSuccession: "" });
  });

  it("SB-6 echo 문구 — 증여는 증여자 개월·신청일, 상속·포괄양수는 개월", () => {
    expect(
      rentalSuccessionEchoText({
        unitIndex: 1,
        kind: "household_gift",
        predecessorMonths: 24,
        donorBusinessRegistrationDate: "2019-05-01",
        donorRentalRegistrationDate: "2019-06-01",
      }),
    ).toBe(
      "2호: 같은 세대원에게 증여받아 계속 임대 — 증여자 임대기간 24개월을 더했고, 목은 증여자 지자체 등록 신청일 2019-06-01 기준으로 판정했습니다(증여자 세무서 사업자등록일 2019-05-01)",
    );
    expect(rentalSuccessionEchoText({ unitIndex: 0, kind: "inheritance", predecessorMonths: 30 })).toBe(
      "1호: 상속받아 계속 임대 — 피상속인 임대기간 30개월을 더했습니다",
    );
    expect(rentalSuccessionEchoText({ unitIndex: 0, kind: "assumption", predecessorMonths: 12 })).toContain("전 임대사업자 임대기간 12개월");

    render(<RentalSuccessionEchoNote items={[{ unitIndex: 0, kind: "inheritance", predecessorMonths: 30 }]} />);
    expect(screen.getByTestId("rental-succession-echo-0").textContent).toContain("피상속인 임대기간 30개월");
    cleanup();
    const { container } = render(<RentalSuccessionEchoNote items={undefined} />);
    expect(container.innerHTML).toBe("");
  });
});
