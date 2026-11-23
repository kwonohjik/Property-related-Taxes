// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-② — ⑤ 위젯 anchor: 토글(기본 꺼짐 · OFF에서도 tone 유지) · 개시일 FieldCard 단일 인스턴스 이동 · 연도 행(연도 키 희소 목록 · onChange 쓰기만) · 읽지 않는 해 안내 · 폐업 후 유예 안내 · 기존 라벨 불변(UV-10 힌트).
 * 계획서: docs/01-plan/features/nbl-state-history-e3-2-business-period.ui.plan.md §4 · §9
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_PAST_YEARS_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_REVENUE_START_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";

afterEach(cleanup);

const T = "2024-06-30";
const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land", acquisitionDate: "2014-01-01", acquisitionArea: "1000", addressJibun: "서울 강남구 테스트동 1",
    nblUseDetailedJudgment: true, nblLandType: "other_land", nblOtherPropertyTaxType: "comprehensive", nblOtherStateHistoryMode: "unchanged",
    nblRevenueBusinessType: "parking_operation",
    ...over,
  }) as AssetForm;
const mount = (a: AssetForm, onChange = vi.fn(), transferDate: string | undefined = T) =>
  render(<OtherLandDetailSection asset={a} onAssetChange={onChange} transferDate={transferDate} />);
const fields = (key: string) => document.querySelectorAll(`[data-field="${key}"]`);
const body = () => document.body.textContent?.replace(/\s+/g, " ") ?? "";

describe("토글 — 기본 꺼짐 = 현행(기존 칸·라벨 불변)", () => {
  it("OFF: 토글만 보이고 영위 기간·표는 없다 · 기존 라벨 5개 + 개시일 FieldCard 1개(기존 위치) + 직전 영위일수 칸", () => {
    mount(asset());
    const toggle = screen.getByTestId("nbl-revenue-period-toggle");
    expect(toggle.textContent).toContain("소유기간 중 이 업종을 개시했거나 폐업했습니다");
    expect(screen.queryByTestId("nbl-revenue-period")).toBeNull();
    for (const label of ["당해 토지가액 (양도일 기준시가)", "직전 토지가액", "당해 과세기간 연환산 (§168의11③3호)", "당해 사업개시일", "직전 과세기간 영위일수"]) {
      expect(body(), label).toContain(label);
    }
    expect(fields("nblRevenueCurrentBusinessStartDate")).toHaveLength(1);
  });

  it("OFF에서도 tone(violet) 배경 유지 — 회색 배경이 아니다", () => {
    mount(asset());
    expect(screen.getByTestId("nbl-revenue-period-toggle").className).toMatch(/bg-violet-50\/70/);
  });

  it("켜면 onAssetChange로 저장값만 바꾼다(다른 칸을 쓰지 않는다 — useEffect 미러링 없음)", () => {
    const onChange = vi.fn();
    mount(asset(), onChange);
    fireEvent.click(within(screen.getByTestId("nbl-revenue-period-toggle")).getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ nblRevenuePeriodOn: true });
  });

  it("업종을 고르지 않으면 토글도 없다", () => {
    mount(asset({ nblRevenueBusinessType: "" }));
    expect(screen.queryByTestId("nbl-revenue-period-toggle")).toBeNull();
  });

  it("UV-10: 기존 «당해 사업개시일» 힌트는 «당해연도 중 …만 입력»이 아니다(DM-01은 어느 해든 개시일을 쓴다) · 라벨은 불변", () => {
    mount(asset());
    expect(body()).not.toContain("당해연도 중 사업을 개시한 경우만 입력");
    expect(body()).toContain("어느 해든 입력 가능");
    // e2e(`transfer-nbl-revenue-autofetch`)가 `getByText("당해 사업개시일")`을 단일 요소로 찾는다 — 힌트에 같은 어구가 들어가면 strict mode 위반
    const hits = [...document.querySelectorAll("*")].filter((el) => el.children.length === 0 && (el.textContent ?? "").includes("당해 사업개시일"));
    expect(hits).toHaveLength(1);
  });
});

describe("ON — 영위 기간 · 개시일 단일 인스턴스 · 연도 행", () => {
  const on = (over: Partial<AssetForm> = {}) => asset({ nblRevenuePeriodOn: true, ...over });

  it("개시일 FieldCard는 한 시점에 한 인스턴스 — ON이면 영위 기간 블록으로 이동(기존 «당해 사업개시일»·«직전 영위일수» 칸은 사라진다) · DM-01 고지는 숨는다", () => {
    mount(on({ nblOtherStateHistoryMode: "changed", nblOtherHasBuilding: true, nblOtherStateEvents: [{ kind: "building_built", date: "2016-01-01", propertyTaxTypeBefore: "" }] }));
    expect(fields("nblRevenueCurrentBusinessStartDate")).toHaveLength(1);
    expect(within(screen.getByTestId("nbl-revenue-period")).getByTestId("nbl-revenue-period-start")).toBeTruthy();
    expect(body()).toContain("사업 개시일");
    expect(body()).not.toContain("당해 사업개시일");
    expect(body()).not.toContain("직전 과세기간 영위일수");
    expect(screen.queryByTestId("nbl-state-history-revenue-start-notice"), "ON이면 DM-01 고지는 쓰지 않는다").toBeNull();
    expect(fields("nblRevenueBusinessEndDate")).toHaveLength(1);
  });

  it("OFF에서 건축물 이력이 있으면 DM-01 고지가 그대로 보인다(불변)", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherHasBuilding: true, nblOtherStateEvents: [{ kind: "building_built", date: "2016-01-01", propertyTaxTypeBefore: "" }] }));
    expect(screen.getByTestId("nbl-state-history-revenue-start-notice").textContent).toBe(NBL_STATE_HISTORY_REVENUE_START_NOTICE);
  });

  it("행 = 표가 받는 연도(T−2 이전 영위 연도) · 각 행에 수입금액·토지가액 칸 + 앵커 `nblRevenueYearRows.{year}.revenue|landValue` · 과거 연도 고지(상수)", () => {
    mount(on({ nblRevenueCurrentBusinessStartDate: "2019-06-01" }));
    for (const y of [2019, 2020, 2021, 2022]) {
      expect(fields(`nblRevenueYearRows.${y}.revenue`), `${y} 수입금액`).toHaveLength(1);
      expect(fields(`nblRevenueYearRows.${y}.landValue`), `${y} 토지가액`).toHaveLength(1);
    }
    expect(fields("nblRevenueYearRows.2018.revenue")).toHaveLength(0);
    expect(fields("nblRevenueYearRows.2023.revenue"), "T−1은 기존 직전 칸").toHaveLength(0);
    expect(screen.getByTestId("nbl-revenue-period-row-2019-days").textContent).toContain("영위 214일 / 365일"); // 2019-06-01 ~ 12-31
    expect(screen.getByTestId("nbl-revenue-period-past-years-notice").textContent).toBe(NBL_REVENUE_HISTORY_PAST_YEARS_NOTICE);
  });

  it("개시가 직전·당해 연도면 표 대신 «입력할 해가 없다» 안내", () => {
    mount(on({ nblRevenueCurrentBusinessStartDate: "2023-03-01" }));
    expect(screen.getByTestId("nbl-revenue-period-rows-empty")).toBeTruthy();
    expect(screen.queryByTestId("nbl-revenue-period-fetch")).toBeNull();
  });

  it("행 입력은 연도 키로 저장한다 — 다른 연도 값은 그대로 · 둘 다 비우면 그 행을 지운다 · 빈 입력에는 가정값을 채우지 않는다", () => {
    const onChange = vi.fn();
    mount(on({ nblRevenueCurrentBusinessStartDate: "2021-01-01", nblRevenueYearRows: [{ year: "2020", revenue: "9", landValue: "9" }, { year: "2021", revenue: "", landValue: "" }] }), onChange);
    fireEvent.change(screen.getByTestId("nbl-revenue-period-row-2021-revenue"), { target: { value: "600000" } });
    expect(onChange).toHaveBeenLastCalledWith({
      nblRevenueYearRows: [{ year: "2020", revenue: "9", landValue: "9" }, { year: "2021", revenue: "600000", landValue: "" }],
    });
    onChange.mockClear();
    cleanup();
    mount(on({ nblRevenueCurrentBusinessStartDate: "2021-01-01", nblRevenueYearRows: [{ year: "2021", revenue: "5", landValue: "" }] }), onChange);
    fireEvent.change(screen.getByTestId("nbl-revenue-period-row-2021-revenue"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ nblRevenueYearRows: [] });
  });

  it("행 판정은 엔진 leaf 그대로 — 빈 행은 «모름 — 불통과» + 확인 필요 고지, 값이 있으면 비율·기준·충족(M9′ 2022: 3.00% 이상)", () => {
    mount(on({ nblRevenueCurrentBusinessStartDate: "2022-12-01", nblRevenueCurrentRevenue: "2600000", nblRevenueCurrentLandValue: "100000000" }));
    expect(screen.getByTestId("nbl-revenue-period-row-2022-judgment").textContent).toContain("모름");
    expect(screen.getByTestId("nbl-revenue-period-unknown-notice").textContent).toBe(NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE);
    cleanup();
    mount(on({ nblRevenueCurrentBusinessStartDate: "2022-12-01", nblRevenueYearRows: [{ year: "2022", revenue: "600000", landValue: "100000000" }] }));
    const j = screen.getByTestId("nbl-revenue-period-row-2022-judgment").textContent ?? "";
    expect(j).toContain("당해 비율 7.06%"); // 600,000 × 365/31 ÷ 100,000,000
    expect(j).toContain("기준 비율 3%");
    expect(j).toContain("충족");
    expect(screen.queryByTestId("nbl-revenue-period-unknown-notice")).toBeNull();
  });
});

describe("폐업 — 칸을 숨기지 않고 읽지 않는 해만 알린다 · 10호 유예는 안내만(자동 생성 없음)", () => {
  const closed = (end: string, over: Partial<AssetForm> = {}) => asset({ nblRevenuePeriodOn: true, nblRevenueBusinessEndDate: end, ...over });

  it("폐업 T−2 이전: 직전·당해 안내가 «영위일이 없는 해라 판정에 쓰지 않습니다» · 기존 당해·직전 칸은 그대로 보인다(숨기지 않음)", () => {
    mount(closed("2021-06-01"));
    expect(screen.getByTestId("nbl-revenue-period-current-year").textContent).toContain("영위일이 없는 해라 판정에 쓰지 않습니다");
    expect(screen.getByTestId("nbl-revenue-period-prior-year").textContent).toContain("영위일이 없는 해라 판정에 쓰지 않습니다");
    expect(fields("nblRevenueCurrentRevenue")).toHaveLength(1);
    expect(fields("nblRevenuePriorLandValue")).toHaveLength(1);
  });

  it("폐업이 T(2024) 안: 당해·직전 모두 영위일이 있어 입력 안내 + 판정 요약(칸을 읽는다)", () => {
    mount(closed("2024-03-01", { nblRevenueCurrentRevenue: "2600000", nblRevenueCurrentLandValue: "100000000" }));
    expect(screen.getByTestId("nbl-revenue-period-current-year").textContent).not.toContain("영위일이 없는 해");
    expect(screen.getByTestId("nbl-revenue-period-current-year").textContent).toContain("영위");
  });

  it("폐업일이 있고 10호 유예 행이 없으면 안내 상수(자동 생성하지 않는다) · 행이 있으면 안내 없음", () => {
    mount(closed("2021-06-01"));
    expect(screen.getByTestId("nbl-revenue-period-closure-grace-notice").textContent).toBe(NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE);
    cleanup();
    mount(closed("2021-06-01", { nblGracePeriods: [{ reasonCode: "business_closure_relocation", anchorDate: "2021-06-01", endDate: "", description: "" } as never] }));
    expect(screen.queryByTestId("nbl-revenue-period-closure-grace-notice")).toBeNull();
  });

  it("폐업일이 없으면 안내 없음", () => {
    mount(asset({ nblRevenuePeriodOn: true }));
    expect(screen.queryByTestId("nbl-revenue-period-closure-grace-notice")).toBeNull();
  });
});

describe("영위 구간 표시 · 입력 도움말(의미)", () => {
  it("소유기간 중 영위 구간 = 엔진 leaf(폐업일 전날까지)", () => {
    mount(asset({ nblRevenuePeriodOn: true, nblRevenueBusinessEndDate: "2021-06-01" }));
    expect(screen.getByTestId("nbl-revenue-period-operating").textContent).toBe("소유기간 중 영위 기간: 2014-01-02 ~ 2021-05-31 (2,707일)");
  });
  it("개시일·폐업일 도움말에 의미(처음 영업한 날 · 영업을 하지 않게 된 첫날)가 있다", () => {
    mount(asset({ nblRevenuePeriodOn: true }));
    expect(body()).toContain("처음 영업한 날");
    expect(body()).toContain("영업을 하지 않게 된 첫날");
  });
  it("placeholder에 숫자 예시가 없다(형식 설명은 hint)", () => {
    mount(asset({ nblRevenuePeriodOn: true, nblRevenueCurrentBusinessStartDate: "2019-06-01" }));
    const sec = screen.getByTestId("nbl-revenue-period");
    for (const input of sec.querySelectorAll("input")) expect(input.getAttribute("placeholder") ?? "", input.outerHTML).not.toMatch(/\d{3}/);
  });
});

describe("당해 연환산 미리보기 — ON이면 영위 기간(폐업일 전날까지)에서 계산한 영위일수", () => {
  const base = { nblRevenueCurrentRevenue: "2600000", nblRevenueCurrentLandValue: "100000000" };
  const preview = () => document.body.textContent?.replace(/\s+/g, "") ?? "";
  it("OFF: 양도일(2024-06-30)까지 182일 · ON + 폐업 2024-03-01: 2024-01-01~02-29 = 60일(엔진 leaf와 같은 값)", () => {
    mount(asset(base));
    expect(preview()).toContain("182일");
    cleanup();
    mount(asset({ ...base, nblRevenuePeriodOn: true, nblRevenueBusinessEndDate: "2024-03-01" }));
    expect(preview()).toContain("60일");
    expect(preview()).not.toContain("영위182일");
  });
  it("ON + 폐업이 양도연도 이전: 이 해는 영위일이 없어 연환산 미리보기를 보이지 않는다", () => {
    mount(asset({ ...base, nblRevenuePeriodOn: true, nblRevenueBusinessEndDate: "2021-06-01" }));
    expect(preview()).toContain("연환산금액이표시됩니다");
    expect(preview()).not.toContain("연간환산수입금액");
  });
});
