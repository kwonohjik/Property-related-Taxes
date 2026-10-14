/** @vitest-environment jsdom */
/**
 * G1 — 「주택을 첫 자산으로 바꾸기」 Step1 배선(RTL): 노출 조건 · 클릭 시 순서·주 자산 배지·미등기·결과 비움·카드 재마운트 · 가드별 숨김·사유 · 교환 직후 안내.
 * 순수 헬퍼의 분기·parity는 `__tests__/calc/g1-reverse-appurtenant-swap.anchor.test.ts`.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { Step1 } from "@/app/calc/transfer-tax/steps/Step1";
import { useCalcWizardStore, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { HOUSE, LAND, form } from "../calc/_helpers/g1-reverse-appurtenant-fixtures";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

type F = TransferFormData;
const BTN = "reverse-appurtenant-swap-button";
const NOTICE = "reverse-appurtenant-swap-notice";
const REASON = "reverse-appurtenant-swap-reason";
const AFTER = "reverse-appurtenant-swap-after-note";

/** 폼 상태를 들고 Step1에 연결하는 최소 호스트 — onChange 패치 기록 + 결과 무효화 호출 기록 */
function Host({
  init,
  embedded = false,
  patches,
  invalidate,
}: {
  init: F;
  embedded?: boolean;
  patches?: Partial<F>[];
  invalidate?: () => void;
}) {
  const [f, setF] = useState<F>(init);
  return (
    <Step1
      form={f}
      onChange={(p) => {
        patches?.push(p);
        setF((prev) => ({ ...prev, ...p }));
      }}
      onInvalidateResult={invalidate}
      embeddedInMulti={embedded}
    />
  );
}

const cardIds = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-asset-card-index]")).map((c) => c.querySelector("span.font-medium")?.textContent ?? "");
const section1Expanded = (cardIndex: number) =>
  document
    .querySelector(`[data-asset-card-index="${cardIndex}"] [data-asset-section="1"] > button`)
    ?.getAttribute("aria-expanded");
const primaryBadgeIn = (cardIndex: number) =>
  within(document.querySelector<HTMLElement>(`[data-asset-card-index="${cardIndex}"]`)!).queryByText("주 자산");

describe("노출 조건", () => {
  it("첫 자산 부수토지 + 함께 양도 주택 1건 — 안내 카드와 버튼이 보인다", () => {
    render(<Host init={form(LAND("l1", 300), HOUSE(0))} />);
    expect(screen.queryByTestId(NOTICE)).not.toBeNull();
    expect(screen.queryByTestId(BTN)).not.toBeNull();
    expect(screen.queryByTestId(REASON)).toBeNull();
  });

  it.each([
    ["주택 먼저", () => form(HOUSE(0), LAND("l1", 300))],
    ["토지 성격 독립 나대지", () => form({ ...LAND("l1", 300), landNature: "standalone" }, HOUSE(0))],
    ["주택 2건", () => form(LAND("l1", 300), HOUSE(0), { ...HOUSE(0), assetId: "h2" })],
    ["겸용주택", () => form(LAND("l1", 300), { ...HOUSE(0), isMixedUseHouse: true })],
    ["단건", () => form(LAND("l1", 300))],
  ])("%s — 카드 없음", (_n, mk) => {
    render(<Host init={mk()} />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it("다건 임베드 모드에서는 숨긴다", () => {
    render(<Host init={form(LAND("l1", 300), HOUSE(0))} embedded />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it("지분 분할(축 B) 모드에서는 숨긴다", () => {
    const half = { ownershipNumerator: "1", ownershipDenominator: "2" };
    render(<Host init={form({ ...LAND("l1", 300), ...half }, { assetKind: "housing", assetId: "s2", ...half })} />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it.each([
    ["nblUseDetailedJudgment", { nblUseDetailedJudgment: true }, "비사업용 토지 정밀판정"],
    ["parcelMode", { parcelMode: true }, "다필지"],
    ["isSalesCaseAcquisition", { isSalesCaseAcquisition: true }, "매매사례가액"],
    ["familyBusinessInheritance", { familyBusinessInheritance: { decedentAcquisitionPrice: "1" } }, "가업상속"],
  ])("첫 자산 전용 입력(%s) — 버튼 없이 사유 한 줄", (_n, patch, label) => {
    render(<Host init={form({ ...LAND("l1", 300), ...patch }, HOUSE(0))} />);
    expect(screen.queryByTestId(BTN)).toBeNull();
    expect(screen.getByTestId(REASON).textContent).toContain(label);
  });
});

describe("클릭 — 순서·주 자산 배지·미등기·결과 비움·카드 재마운트", () => {
  it("🔑 한 번의 onChange({assets, isUnregistered}) · 주택이 맨 앞 · 주 자산 배지 이동 · 결과 비움 1회", () => {
    const patches: Partial<F>[] = [];
    const invalidate = vi.fn();
    render(<Host init={{ ...(form(LAND("l1", 300), HOUSE(0)) as object), isUnregistered: true } as F} patches={patches} invalidate={invalidate} />);
    expect(primaryBadgeIn(0)).not.toBeNull();
    expect(invalidate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId(BTN));

    expect(patches).toHaveLength(1);
    expect(Object.keys(patches[0]).sort()).toEqual(["assets", "isUnregistered"]);
    expect(patches[0].assets!.map((a) => a.assetId)).toEqual(["h1", "l1"]);
    expect(patches[0].isUnregistered).toBe(false);
    expect(patches[0].assets!.find((a) => a.assetId === "l1")!.isUnregistered).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
    // 교환 후 같은 구성이 아니다 — 카드가 사라지고 첫 카드(주택)가 주 자산 배지를 갖는다.
    expect(screen.queryByTestId(NOTICE)).toBeNull();
    expect(primaryBadgeIn(0)).not.toBeNull();
    expect(primaryBadgeIn(1)).toBeNull();
  });

  it("토지 2건 + 주택 — 회전(토지 상대 순서 보존)", () => {
    const patches: Partial<F>[] = [];
    render(<Host init={form(LAND("l1", 200), LAND("l2", 150), HOUSE(0))} patches={patches} />);
    fireEvent.click(screen.getByTestId(BTN));
    expect(patches[0].assets!.map((a) => a.assetId)).toEqual(["h1", "l1", "l2"]);
  });

  it("🔑 카드 재마운트(swapEpoch) — 새 첫 카드(주택)의 ①이 펼쳐지고 토지 카드의 ①은 접힌다", () => {
    render(<Host init={form(LAND("l1", 300), HOUSE(0))} />);
    expect(section1Expanded(0)).toBe("true");
    expect(section1Expanded(1)).toBe("false");
    fireEvent.click(screen.getByTestId(BTN));
    expect(section1Expanded(0)).toBe("true"); // 재마운트 없으면 접힌 채 남는다(주택 카드가 접힌 채 index 0으로 이동)
    expect(section1Expanded(1)).toBe("false");
  });

  it("카드 제목 번호가 새 위치를 따른다 — 입력값(주소)은 보존", () => {
    render(<Host init={form(LAND("l1", 300), HOUSE(0))} />);
    expect(cardIds()[0]).toContain("자산 1");
    fireEvent.click(screen.getByTestId(BTN));
    expect(cardIds()).toHaveLength(2);
    expect(cardIds()[0]).toContain("자산 1");
    expect(cardIds()[1]).toContain("자산 2");
  });
});

describe("교환 직후 안내 — 처음 반영되는 입력이 있을 때만", () => {
  it("없으면 아무것도 띄우지 않는다", () => {
    render(<Host init={form(LAND("l1", 300), HOUSE(0))} />);
    fireEvent.click(screen.getByTestId(BTN));
    expect(screen.queryByTestId(AFTER)).toBeNull();
  });
  it("승격 주택에 신축·증축 입력이 있으면 한 줄", () => {
    render(<Host init={form(LAND("l1", 300), { ...HOUSE(0), isSelfBuilt: true })} />);
    fireEvent.click(screen.getByTestId(BTN));
    expect(screen.getByTestId(AFTER).textContent).toContain("신축·증축");
  });
});

describe("스토어 clearResult — 결과만 비우고 입력은 그대로", () => {
  beforeEach(() => useCalcWizardStore.getState().reset());
  it("result는 null · formData·currentStep 불변", () => {
    const f = form(LAND("l1", 300), HOUSE(0)) as F;
    useCalcWizardStore.setState({ formData: f, result: { mode: "single" } as never, currentStep: 0 });
    useCalcWizardStore.getState().clearResult();
    const s = useCalcWizardStore.getState();
    expect(s.result).toBeNull();
    expect(s.formData).toBe(f);
  });
});
