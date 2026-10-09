/**
 * D2 Pre-Do (⑤ 렌더) — 「건물 상속·증여 + 토지 매매」 설계 전 현행 화면 고정 (2026-10-09)
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d2.ui.design.md §2·§5
 * 짝(④⑥⑧ 값): __tests__/calc/transfer-land-part-cause.d2.predo.test.ts
 *
 * ## 이 파일이 하는 일
 * 1. **현행**: 건물 취득원인이 상속·증여일 때 「토지는 다른 원인으로 취득」 토글이 **없다**(입력 경로 0)는 사실과,
 *    상속 블록이 D2에서 숨겨야 할 칸(동일세대·평가방법·신고가액)을 **지금은 그대로 렌더**한다는 사실을 고정한다.
 * 2. **불변식**: 매매 호스트(D1)의 토글은 그대로다.
 * 3. D2-2 후 기대(C)는 활성이다 — 토글 노출, 상속 블록 대체, 건물 원인 모드, 상호 잠금, 호스트 전환.
 *
 * ⚠️ 렌더 가능성 자체가 이 테스트의 전제다 — `CompanionAcquisitionCauseSection`이 jsdom에서 mount된다(실측).
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { D2_UI_ANCHORS } from "./_d2-ui-anchors";

afterEach(cleanup); // RTL 자동 cleanup 미설정 — 수동

const noop = () => {};

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionDate: "2025-05-01",
    inheritanceStartDate: "2025-05-01",
    inheritanceDate: "2025-05-01",
    decedentAcquisitionDate: "2000-01-01",
    ...over,
  } as AssetForm;
}

function mount(a: AssetForm) {
  return render(
    <CompanionAcquisitionCauseSection asset={a} onChange={noop} transferDate="2026-06-30" isNewConstruction={a.acquisitionCause === "newConstruction"} />,
  );
}

/** D1·D0 토글 testid — D2는 새 testid(`land-part-cause-building-cause`)를 쓴다(설계 §2.4). */
const TOGGLE_IDS = ["land-part-cause-purchase", "newconstruction-land-acq"] as const;

describe("A. 불변식 — D2 후에도 유지", () => {
  it("A1 매매 호스트: D1 토글(land-part-cause-purchase)이 그대로 있다", () => {
    const { container } = mount(asset({ acquisitionCause: "purchase" }));
    expect(container.querySelector('[data-testid="land-part-cause-purchase"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="newconstruction-land-acq"]')).toBeNull();
  });

  it("A2 신축 호스트: D0 토글(newconstruction-land-acq)이 그대로 있다", () => {
    const { container } = mount(asset({ acquisitionCause: "newConstruction", occupancyApprovalDate: "2020-06-01" }));
    expect(container.querySelector('[data-testid="newconstruction-land-acq"]')).not.toBeNull();
  });

  it("A3 이월과세(증여) 호스트: 토지 원인 토글이 없다 — D2는 이월과세 건물을 열지 않는다(계획서 §5)", () => {
    const { container } = mount(asset({ acquisitionCause: "carryover_gift" }));
    for (const id of TOGGLE_IDS) expect(container.querySelector(`[data-testid="${id}"]`)).toBeNull();
  });

  it("A4 비주택·토지 자산(assetKind land)은 어느 호스트에서도 토글이 없다", () => {
    for (const cause of ["purchase", "inheritance", "gift"] as const) {
      const { container, unmount } = mount(asset({ acquisitionCause: cause, assetKind: "land" }));
      for (const id of TOGGLE_IDS) expect(container.querySelector(`[data-testid="${id}"]`)).toBeNull();
      unmount();
    }
  });
});

const TID = "land-part-cause-building-cause";
const q = (c: HTMLElement, sel: string) => c.querySelector(sel);
/** D2 토글 스위치 — 패널 안에 동일세대 토글이 함께 있어 첫 스위치가 D2 토글이다. */
/** Base UI 스위치는 `disabled` 속성 대신 aria/data 속성을 쓴다. */
const isDisabled = (el: HTMLElement) =>
  el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled");
const d2Switch = () => within(screen.getByTestId(TID)).getAllByRole("switch")[0];

/** 실제 patch를 상태에 적용하는 하네스 — 원인 라디오 패치·토글 패치가 함께 작동하는 전환 시나리오용. */
function Harness({ initial }: { initial: AssetForm }) {
  const [a, setA] = useState(initial);
  return (
    <CompanionAcquisitionCauseSection
      asset={a}
      onChange={(p) => setA((prev) => ({ ...prev, ...p }))}
      transferDate="2026-06-30"
      isNewConstruction={a.acquisitionCause === "newConstruction"}
    />
  );
}

/** D2 토글 ON 상태 — 건물 상속(2025-05-01) + 토지 매매(2025-01-10), 파트 실가 */
function d2(host: "inheritance" | "gift", over: Partial<AssetForm> = {}): AssetForm {
  return asset({
    acquisitionCause: host,
    landAcquisitionCause: "purchase",
    landCauseHost: host,
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2025-01-10",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "400,000,000",
    ...(host === "gift" ? { inheritanceStartDate: "", inheritanceDate: "", decedentAcquisitionDate: "" } : {}),
    ...over,
  });
}

describe("B. D2-2 — 토글 노출 (종전 pin 뒤집힘)", () => {
  it("B1 상속 호스트: 「토지는 다른 원인으로 취득」 토글이 있다(OFF · amber) — D1 testid는 없다", () => {
    const { container } = mount(asset({ acquisitionCause: "inheritance" }));
    const block = q(container, `[data-testid="${TID}"]`) as HTMLElement;
    expect(block).not.toBeNull();
    for (const id of TOGGLE_IDS) expect(q(container, `[data-testid="${id}"]`)).toBeNull();
    expect(q(container, '[data-field="landAcquisitionCause"]')).not.toBeNull();
    expect(within(block).getAllByRole("switch")[0]).not.toBeChecked();
    expect(block.querySelector('[data-tone="amber"], .bg-amber-50\\/70, [class*="amber"]')).not.toBeNull();
    expect(within(block).getByText("건물은 상속, 토지는 매수")).toBeTruthy();
  });

  it("B2 증여 호스트: 같은 토글", () => {
    const { container } = mount(asset({ acquisitionCause: "gift" }));
    expect(q(container, `[data-testid="${TID}"]`)).not.toBeNull();
    expect(screen.getByText("건물은 증여, 토지는 매수")).toBeTruthy();
  });

  it("B3 토글 OFF 상속 호스트는 종전 화면 그대로: 피상속인 취득일·동일세대·선순위·평가방법", () => {
    mount(asset({ acquisitionCause: "inheritance" }));
    expect(screen.queryAllByText("피상속인 취득일").length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/상속개시 당시 피상속인과 동일세대/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/양도 주택이 선순위 상속주택이 아님/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("상속세 신고 시 평가방법").length).toBeGreaterThan(0);
  });

  it("B4 토글 OFF 증여 호스트는 종전 화면 그대로: 증여일·증여자 취득일", () => {
    mount(asset({ acquisitionCause: "gift" }));
    expect(screen.queryAllByText("증여일").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("증여자 취득일").length).toBeGreaterThan(0);
  });

  it("B5 토글 OFF + 개별주택가격 미공시 구간: §164⑦ 환산 칸이 자산 단위로 렌더된다 (종전 그대로)", () => {
    const { container } = mount(
      asset({ acquisitionCause: "inheritance", acquisitionDate: "2003-05-01", inheritanceStartDate: "2003-05-01", inheritanceDate: "2003-05-01" }),
    );
    expect(q(container, '[data-field="inhHouseValLandArea"]')).not.toBeNull();
  });
});

describe("C. D2-2 — 토글 ON 화면 (상속 블록 대체 · 건물 원인 모드)", () => {
  it("C1 상속 ON: 상속 블록의 평가방법·선순위·결합 공시·신고가액 칸이 없고, 건물 고정 칩·평가액·토지 4종·피상속인·동일세대가 있다", () => {
    const { container } = mount(d2("inheritance"));
    expect(screen.queryByText("상속세 신고 시 평가방법")).toBeNull();
    expect(screen.queryByText(/양도 주택이 선순위 상속주택이 아님/)).toBeNull();
    expect(q(container, '[data-field="publishedValueAtInheritance"]')).toBeNull();
    expect(q(container, '[data-field="inhHouseValLandArea"]')).toBeNull();
    expect(screen.queryByText(/동거봉양 합가 전 피상속인 보유분/)).toBeNull(); // §155② 예외 — 미적용
    // 건물 파트
    expect(screen.getByTestId("part-acq-mode-building-fixed").textContent).toContain("상속개시일 평가액");
    expect(screen.queryByTestId("part-acq-mode-building")).toBeNull();
    expect(q(container, '[data-field="buildingAcquisitionPrice"]')?.textContent).toContain("건물 상속개시일 평가액");
    // 토지 파트 = 매매 4종 라디오
    expect(screen.getByTestId("part-acq-mode-land")).toBeTruthy();
    expect(screen.queryByTestId("part-acq-mode-land-fixed")).toBeNull();
    // 건물 파트에 속하는 유지 칸
    expect(q(container, '[data-field="decedentAcquisitionDate"]')).not.toBeNull();
    expect(screen.queryAllByText(/상속개시 당시 피상속인과 동일세대/).length).toBe(1); // §154⑧3호 유지(D2-Q3)
    expect(screen.getByTestId("building-cause-155-2-note").textContent).toContain("확인 필요");
  });

  it("C2 날짜 2열: 건물 칸 라벨 상속개시일 · 토지 칸 「토지 취득일」 · 「취득일 다름」 강제 ON·잠금 · 의제취득 배지 없음", () => {
    const { container } = mount(d2("inheritance", { acquisitionDate: "1985-01-01", inheritanceStartDate: "1985-01-01", inheritanceDate: "1985-01-01" }));
    expect(q(container, '[data-field="acquisitionDate"]')?.textContent).toContain("건물 상속개시일");
    expect(q(container, '[data-field="landAcquisitionDate"]')?.textContent).toContain("토지 취득일");
    const sep = screen.getByText("토지·건물 취득일 다름").closest("[data-variant]") as HTMLElement;
    const sw = within(sep).getByRole("switch");
    expect(sw).toBeChecked();
    expect(isDisabled(sw)).toBe(true);
    // 1985-01-01은 의제취득 배지 대상이지만 건물 칸(상속개시일)은 사실값이라 배지·클램프가 없다 — 토지 칸에는 그대로 있다
    const building = q(container, '[data-field="acquisitionDate"]') as HTMLElement;
    expect(building.textContent).not.toContain("의제취득");
  });

  it("C3 증여 ON: 건물 증여 신고가액 라벨 · 이월과세 고지 · 증여자 취득일(선택) · 피상속인·동일세대 없음", () => {
    const { container } = mount(d2("gift"));
    expect(q(container, '[data-field="buildingAcquisitionPrice"]')?.textContent).toContain("건물 증여 신고가액");
    expect(screen.getByTestId("building-gift-carryover-notice").textContent).toContain("이월과세");
    expect(q(container, '[data-field="donorAcquisitionDate"]')).not.toBeNull();
    expect(q(container, '[data-field="decedentAcquisitionDate"]')).toBeNull();
    expect(screen.queryByText(/동일세대/)).toBeNull();
    expect(screen.getByTestId("part-acq-mode-building-fixed").textContent).toContain("증여 신고가액");
  });

  it("C4 PHD 토글·신축/증축 특례·자산 단위 취득가액 축이 없다 (경계일 전 시드로도 PHD 토글 미렌더)", () => {
    const { container } = mount(d2("inheritance", { acquisitionDate: "2003-05-01", landAcquisitionDate: "2002-01-10", usePreHousingDisclosure: true }));
    expect(screen.queryByText(/취득 당시 개별주택가격 미공시/)).toBeNull();
    expect(q(container, '[data-field="useEstimatedAcquisition"]')).toBeNull(); // 상단 자산 단위 축(라디오 4종)
    expect(screen.queryByText("본인이 신축 또는 증축한 건물입니까?")).toBeNull();
    // 토지 취득일을 아직 안 넣은 상태(별개 취득 미성립)에서도 상단 축이 열리지 않는다 — 상속 호스트에 4종 라디오가 뜨면 안 된다
    cleanup();
    const early = mount(d2("inheritance", { landAcquisitionDate: "" }));
    expect(q(early.container, '[data-field="useEstimatedAcquisition"]')).toBeNull();
    // 긍정 짝: 매매 호스트(분리 OFF)에는 상단 자산 단위 축과 신축·증축 특례가 있다
    cleanup();
    const plain = mount(asset({ acquisitionCause: "purchase" }));
    expect(q(plain.container, '[data-field="useEstimatedAcquisition"]')).not.toBeNull();
    expect(screen.queryByText("본인이 신축 또는 증축한 건물입니까?")).not.toBeNull();
  });

  it("C5 ⑧ 이동 앵커: 토지 취득일·건물 취득일·토지 가액·건물 가액·자본적지출 2칸·토글이 각 1개", () => {
    const { container } = mount(d2("inheritance"));
    for (const f of [
      "landAcquisitionCause", "landAcquisitionDate", "acquisitionDate", "landAcquisitionPrice", "buildingAcquisitionPrice",
      "decedentAcquisitionDate", "landDirectExpenses", "buildingDirectExpenses",
    ]) expect(container.querySelectorAll(`[data-field="${f}"]`).length, f).toBe(1);
  });

  it("C6 경계일 전(2003)·같은 날 안내가 날짜 아래에 뜬다 — 긍정 짝: 정상 날짜는 안내 없음", () => {
    mount(d2("inheritance", { acquisitionDate: "2003-05-01", landAcquisitionDate: "2002-01-10" }));
    expect(screen.getByTestId("building-cause-date-notice").textContent).toContain("2005.4.30.");
    cleanup();
    mount(d2("inheritance", { landAcquisitionDate: "2025-05-01" }));
    expect(screen.getByTestId("building-cause-date-notice").textContent).toContain("취득일이 같으면");
    cleanup();
    mount(d2("inheritance"));
    expect(screen.queryByTestId("building-cause-date-notice")).toBeNull();
  });

  it("C7 소유자 다름 ↔ D2 토글 상호 잠금(켜는 방향만)", () => {
    // D2 ON → 소유자 다름 켜기 비활성
    const { unmount } = mount(d2("inheritance"));
    expect(isDisabled(within(screen.getByTestId("asset-ownership-split")).getByRole("switch"))).toBe(true);
    expect(isDisabled(d2Switch())).toBe(false); // 끄는 방향은 막지 않는다
    unmount();
    // 소유자 다름 ON(D2 OFF) → D2 켜기 비활성
    mount(asset({ acquisitionCause: "inheritance", selfOwns: "building_only" }));
    expect(isDisabled(d2Switch())).toBe(true);
  });

  it("C8 노출하지 않는 경우: 부담부증여 · 가업상속 입력 · 이월과세 — 토글 없음 / 켜진 채면 가업상속 안내가 뜬다", () => {
    mount(asset({ acquisitionCause: "gift", transferType: "burdened_gift" }));
    expect(screen.queryByTestId(TID)).toBeNull();
    cleanup();
    const fb = { decedentAcquisitionPrice: 1, inheritanceMarketValue: 2, fbDeductionAppliedRate: 0.5, inheritanceDate: "2025-05-01" };
    mount(asset({ acquisitionCause: "inheritance", familyBusinessInheritance: fb }));
    expect(screen.queryByTestId(TID)).toBeNull();
    cleanup();
    mount(d2("inheritance", { familyBusinessInheritance: fb }));
    expect(screen.getByTestId("building-cause-fb-note")).toBeTruthy();
  });

  it("C9 토글 클릭 patch: ON은 단일 배치(overlay purchase · 호스트 태그 · 분리 · 토지 실가 기본 · 건물 실가) / OFF는 전부 되돌린다", () => {
    const calls: Partial<AssetForm>[] = [];
    const a = asset({ acquisitionCause: "inheritance", landAcqMode: "" });
    render(<CompanionAcquisitionCauseSection asset={a} onChange={(p) => calls.push(p)} transferDate="2026-06-30" isNewConstruction={false} />);
    fireEvent.click(d2Switch());
    expect(calls).toEqual([
      { landAcquisitionCause: "purchase", landCauseHost: "inheritance", hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual" },
    ]);
    cleanup();
    calls.length = 0;
    render(<CompanionAcquisitionCauseSection asset={d2("gift", { landAcqMode: "estimated" })} onChange={(p) => calls.push(p)} transferDate="2026-06-30" isNewConstruction={false} />);
    fireEvent.click(d2Switch());
    expect(calls).toEqual([
      { landAcquisitionCause: "", landCauseHost: "", hasSeperateLandAcquisitionDate: false, landAcqMode: "", buildingAcqMode: "" },
    ]);
    // 기존 토지 방식(환산)은 켤 때 보존된다
    cleanup();
    calls.length = 0;
    render(<CompanionAcquisitionCauseSection asset={asset({ acquisitionCause: "gift", landAcqMode: "estimated" })} onChange={(p) => calls.push(p)} transferDate="2026-06-30" isNewConstruction={false} />);
    fireEvent.click(d2Switch());
    expect(calls[0].landAcqMode).toBe("estimated");
  });

  it("C10 호스트 전환(하네스): 상속 ON → 증여는 토글 OFF(값 보존) → 매매는 D1 토글 OFF → 상속으로 돌아와 켜면 값 복원", () => {
    render(<Harness initial={d2("inheritance")} />);
    expect(d2Switch()).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "증여" }));
    expect(d2Switch()).not.toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "매매" }));
    expect(screen.queryByTestId(TID)).toBeNull();
    expect(within(screen.getByTestId("land-part-cause-purchase")).getByRole("switch")).not.toBeChecked();
    // D2 잔재(overlay purchase)가 D1 의미로 읽히지 않는다 — 토지 방식 칩 고정 없음
    expect(screen.queryByTestId("part-acq-mode-land-fixed")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "상속" }));
    expect(d2Switch()).not.toBeChecked();
    fireEvent.click(d2Switch());
    expect(d2Switch()).toBeChecked();
    expect((screen.getByTestId("split-land-acq-price") as HTMLInputElement).value).toContain("300,000,000");
  });

  it("C11 ⑧ 이동 앵커 목록(D2_UI_ANCHORS)이 D2 렌더(상속 · 토지 4방식)의 data-field 합집합에 모두 있다 — 칸 없는 차단 방지", () => {
    const found = new Set<string>();
    const collect = (a: AssetForm, extra: Partial<AssetForm> = {}) => {
      const { container, unmount } = mount({ ...a, ...extra } as AssetForm);
      container.querySelectorAll("[data-field]").forEach((el) => found.add(el.getAttribute("data-field")!));
      unmount();
    };
    for (const mode of ["actual", "estimated", "appraisal", "salesCase"] as const) {
      collect(d2("inheritance"), { landAcqMode: mode });
    }
    collect(d2("inheritance"), { decedentSameHouseholdBeforeInheritance: true });
    collect(d2("gift"));
    const missing = D2_UI_ANCHORS.filter((f) => !found.has(f));
    expect(missing, `화면에 없는 앵커: ${missing.join(", ")}`).toEqual([]);
  });

  it("C12 건물 상속개시일 칸은 의제취득 클램프가 없다(blur해도 1985-01-01로 덮지 않음) — 긍정 짝: 매매 호스트의 건물 취득일은 덮는다", () => {
    const blurBuilding = (a: AssetForm) => {
      const calls: Partial<AssetForm>[] = [];
      render(<CompanionAcquisitionCauseSection asset={a} onChange={(p) => calls.push(p)} transferDate="2026-06-30" isNewConstruction={false} />);
      const year = within(screen.getByTestId("acq-date-building")).getByLabelText("연도");
      fireEvent.blur(year);
      cleanup();
      return calls;
    };
    const mixed = blurBuilding(d2("inheritance", { acquisitionDate: "1984-05-01", inheritanceStartDate: "1984-05-01", inheritanceDate: "1984-05-01", landAcquisitionDate: "1984-01-10" }));
    expect(mixed.find((p) => p.acquisitionDate)).toBeUndefined();
    const plain = blurBuilding(asset({ acquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true, acquisitionDate: "1984-05-01", landAcquisitionDate: "1984-01-10" }));
    expect(plain.find((p) => p.acquisitionDate)?.acquisitionDate).toBe("1985-01-01");
  });

  it("C13 건물 방식 stale 환산이 남아도 건물 기준시가 카드(환산 입력)가 열리지 않는다 — 긍정 짝: 매매 호스트 건물 환산은 연다", () => {
    mount(d2("inheritance", { buildingAcqMode: "estimated" }));
    expect(screen.queryByTestId("split-building-std-acq-card")).toBeNull();
    expect(screen.queryByTestId("split-building-estimated-note")).toBeNull();
    cleanup();
    mount(asset({ acquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true, acquisitionDate: "2025-05-01", landAcquisitionDate: "2025-01-10", landAcqMode: "actual", buildingAcqMode: "estimated" }));
    expect(screen.queryByTestId("split-building-estimated-note")).not.toBeNull();
  });

  it("C14 상속 호스트의 건물 상속개시일 입력은 3키(acquisitionDate·inheritanceStartDate·inheritanceDate)를 한 patch로 쓴다 — 증여는 1키", () => {
    const typeDate = (a: AssetForm) => {
      const calls: Partial<AssetForm>[] = [];
      render(<CompanionAcquisitionCauseSection asset={{ ...a, acquisitionDate: "" }} onChange={(p) => calls.push(p)} transferDate="2026-06-30" isNewConstruction={false} />);
      const root = screen.getByTestId("acq-date-building");
      fireEvent.change(within(root).getByLabelText("연도"), { target: { value: "2025" } });
      fireEvent.change(within(root).getByLabelText("월"), { target: { value: "05" } });
      fireEvent.change(within(root).getByLabelText("일"), { target: { value: "01" } });
      cleanup();
      return calls.filter((p) => p.acquisitionDate === "2025-05-01");
    };
    expect(typeDate(d2("inheritance"))[0]).toEqual({ acquisitionDate: "2025-05-01", inheritanceStartDate: "2025-05-01", inheritanceDate: "2025-05-01" });
    expect(typeDate(d2("gift"))[0]).toEqual({ acquisitionDate: "2025-05-01" });
  });

  it("C15 PHD 자동 ON effect는 건물 원인 모드에서 돌지 않는다 — D2 ON(2003 취득) → OFF 뒤에도 usePreHousingDisclosure가 켜지지 않는다 / 긍정 짝: 매매 호스트는 자동 ON", () => {
    let latest: AssetForm | null = null;
    function Probe({ initial }: { initial: AssetForm }) {
      const [a, setA] = useState(initial);
      latest = a;
      return (
        <CompanionAcquisitionCauseSection asset={a} onChange={(p) => setA((prev) => ({ ...prev, ...p }))} transferDate="2026-06-30" isNewConstruction={false} />
      );
    }
    const pre = { acquisitionDate: "2003-05-01", landAcquisitionDate: "2002-01-10" };
    render(<Probe initial={d2("inheritance", pre)} />);
    expect(latest!.usePreHousingDisclosure).toBe(false);
    fireEvent.click(d2Switch()); // OFF
    expect(latest!.landCauseHost).toBe("");
    expect(latest!.usePreHousingDisclosure).toBe(false);
    cleanup();
    // 토글 ON 직전 상태(상속 호스트, 2003)에서 켜도 마찬가지
    render(<Probe initial={asset({ acquisitionCause: "gift", acquisitionDate: "2003-05-01", inheritanceStartDate: "", inheritanceDate: "" })} />);
    fireEvent.click(d2Switch());
    expect(latest!.landCauseHost).toBe("gift");
    expect(latest!.usePreHousingDisclosure).toBe(false);
    cleanup();
    // 긍정 짝: 매매 호스트 + 2003 → 자동 ON(종전)
    render(<Probe initial={asset({ acquisitionCause: "purchase", acquisitionDate: "2003-05-01" })} />);
    expect(latest!.usePreHousingDisclosure).toBe(true);
  });
});
