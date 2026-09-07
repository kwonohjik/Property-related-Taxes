/**
 * @vitest-environment jsdom
 *
 * anchor: 「증거 소멸 48건」 표본 재확인의 **렌더 축** (2026-09-07).
 * 순수 함수·페이로드 축은 `__tests__/calc/evidence-gone-sweep.anchor.test.ts`에 있다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FamilyBusinessImputedComparisonCard } from "@/components/calc/results/transfer/FamilyBusinessImputedComparisonCard";
import { GeneralBuilding3WayTable } from "@/components/calc/results/transfer/GeneralBuilding3WayTable";
import { RentalCommonFields } from "@/components/calc/transfer/rental/RentalCommonFields";
import { AggregateSettingsPanel } from "@/components/calc/transfer/AggregateSettingsPanel";
import { defaultMultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

afterEach(cleanup);

/* ── #14 · #31 — 가업상속 의제 비교 카드 ─────────────────────────────────────── */

const fbDetail = (imputedHigher: boolean) =>
  ({
    decedentAcquisitionPrice: 300_000_000,
    imputedAcquisitionPrice: 500_000_000,
    cgtUnderSection97: 100_000_000,
    cgtUnderSection97_2_4: imputedHigher ? 130_000_000 : 80_000_000,
    creditAmount: imputedHigher ? 30_000_000 : 0,
    appliedRate: 0.6,
    inheritanceMarketValue: 600_000_000,
    decedentCapitalExpenditure: 0,
  }) as never;

describe("#31 — 유리/불리 표현이 결과 카드에 남아 있지 않다", () => {
  it("🔑 A-1: 의제가 낮은 경우에도 「납세자에게 유리」를 쓰지 않는다", () => {
    const { container } = render(<FamilyBusinessImputedComparisonCard detail={fbDetail(false)} />);
    expect(container.textContent ?? "").not.toContain("유리");
  });

  it("🔑 A-2: 의제가 높은 경우에도 「납세자 불리」를 쓰지 않는다", () => {
    const { container } = render(<FamilyBusinessImputedComparisonCard detail={fbDetail(true)} />);
    expect(container.textContent ?? "").not.toContain("불리");
    // 강제 적용이라는 사실 자체는 남는다 — 표현만 걷어낸 것이지 내용을 지운 게 아니다.
    expect(container.textContent ?? "").toContain("강제 적용");
  });
});

describe("#14 — 인과 설명이 「일반 §97의 기준 = 상속개시일 평가액」과 어긋나지 않는다", () => {
  it("🔑 B-1: 안내문이 두 **결정세액**을 비교한다 — 원취득가액과의 대소로 설명하지 않는다", () => {
    const { container } = render(<FamilyBusinessImputedComparisonCard detail={fbDetail(false)} />);
    const text = container.textContent ?? "";
    // 🔑 「의제 결정세액」·「피상속인 원취득가액」은 **표 라벨에도** 있어 구별력이 0이다
    //    (실측 — 되돌려도 통과했다). 안내문이 실제로 무엇을 비교하는지로 고정한다.
    expect(text).toContain("§18의2⑩ 공제는");
    // 종전 안내문의 인과 서술 — 취득가액의 대소로 세액 감소를 설명했다.
    expect(text).not.toContain("낮아 세액이 감소합니다");
    expect(text).not.toContain("와 동일한 세액입니다");
  });
});

/* ── #16 — §102② 결손 통산 행이 결손 자산을 하드코딩하지 않는다 ─────────────── */

const leg = (label: string, income: number, same = 0, other = 0) =>
  ({
    propertyId: label,
    propertyLabel: label,
    income,
    incomeAfterOffset: income + same + other,
    lossOffsetFromSameGroup: same,
    lossOffsetFromOtherGroup: other,
    transferPrice: 0,
    acquisitionPrice: 0,
    necessaryExpense: 0,
    transferGain: income,
    longTermHoldingDeduction: 0,
    taxableIncome: income,
    calculatedTax: 0,
    determinedTax: 0,
    holdingMonths: 0,
    lthdRate: 0,
  }) as never;

const agg3way = (
  land: unknown,
  b1: unknown,
  b2: unknown,
) => ({ properties: [land, b1, b2] }) as never;

describe("#16 — 결손이 토지에서 나도 표가 성립한다", () => {
  it("🔑 C-1: 토지가 결손이면 토지 행에 **기여분(+)** 이 뜬다 — 「-」로 사라지지 않는다", () => {
    render(
      <GeneralBuilding3WayTable
        aggregated={agg3way(
          leg("토지(1001)", -50_000_000),
          leg("건물(3001)", 80_000_000, 0, 30_000_000),
          leg("증축건물(3002)", 40_000_000, 0, 20_000_000),
        )}
      />,
    );
    expect(screen.getByText("+50,000,000")).toBeTruthy();
  });

  it("🔑 C-2: 건물1이 결손인 종전 케이스도 그대로 동작한다", () => {
    render(
      <GeneralBuilding3WayTable
        aggregated={agg3way(
          leg("토지(1001)", 80_000_000, 0, 30_000_000),
          leg("건물(3001)", -50_000_000),
          leg("증축건물(3002)", 40_000_000, 0, 20_000_000),
        )}
      />,
    );
    expect(screen.getByText("+50,000,000")).toBeTruthy();
    expect(screen.getAllByText("△30,000,000").length).toBeGreaterThan(0);
  });
});

/* ── #25 · #28 — 임대 공통 필드 ──────────────────────────────────────────────── */

const rentalValue = {
  registrationDate: "",
  rentalStartDate: "",
  rentIncreaseViolationMode: "",
  rentHistory: [],
  hasVacancyOverGrace: null,
  vacancyPeriods: [],
  isTaxOfficeRegistered: false,
  rentalContinuesToTransfer: null,
  rentalEndDate: "",
} as never;

describe("#25 — 라디오 name이 인스턴스마다 다르다", () => {
  it("🔑 D-1: 같은 폼을 두 번 렌더하면 라디오 그룹이 서로 다른 name을 갖는다", () => {
    const { container } = render(
      <div>
        <RentalCommonFields value={rentalValue} onChange={() => {}} vacancyGraceMonths={3} />
        <RentalCommonFields value={rentalValue} onChange={() => {}} vacancyGraceMonths={3} />
      </div>,
    );
    const names = new Set(
      Array.from(container.querySelectorAll('input[type="radio"]')).map((el) =>
        (el as HTMLInputElement).name,
      ),
    );
    const violation = [...names].filter((n) => n.startsWith("rentIncreaseViolationMode-"));
    // 두 인스턴스가 서로 다른 접두사를 얻어야 자산 간 선택이 서로를 해제하지 않는다.
    expect(violation.length).toBe(2);
  });
});

describe("#28 — 섹션 배지가 원문자로 통일된다", () => {
  it("🔑 E-1: 아라비아 숫자 배지를 쓰지 않는다", () => {
    render(
      <RentalCommonFields
        value={rentalValue}
        onChange={() => {}}
        vacancyGraceMonths={3}
        sectionOffset={3}
      />,
    );
    expect(screen.getByText("③")).toBeTruthy();
    expect(screen.getByText("④")).toBeTruthy();
  });
});

/* ── #34 — 기본공제 배분 옵션에 절감 표현이 없다 ─────────────────────────────── */

describe("#34 — 배분 전략 라벨이 절감·유리 표현을 쓰지 않는다", () => {
  it("🔑 F-1: 「납세자 유리」·「절세 효과」가 화면에 없다", () => {
    const { container } = render(
      <AggregateSettingsPanel
        form={{ ...defaultMultiTransferFormData, properties: [] } as never}
        onChange={() => {}}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("납세자 유리");
    expect(text).not.toContain("절세");
    // 옵션 자체는 남아 있어야 한다 — 문구만 바꾼 것이지 선택지를 지운 게 아니다.
    expect(text).toContain("우선 배분");
  });
});
