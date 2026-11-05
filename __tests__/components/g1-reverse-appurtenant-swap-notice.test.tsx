/** @vitest-environment jsdom */
/**
 * G1 — 「주택을 첫 자산으로 바꾸기」 Step1 배선(RTL): 노출 조건 · 클릭 시 순서·주 자산 배지·미등기·결과 비움·카드 재마운트 · 가드별 숨김·사유 · 교환 직후 안내.
 * 순수 헬퍼의 분기·parity는 `__tests__/calc/g1-reverse-appurtenant-swap.anchor.test.ts`.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useState } from "react";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import { Step1 } from "@/app/calc/transfer-tax/steps/Step1";
import { useCalcWizardStore, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { HOUSE, LAND, form } from "../calc/_helpers/g1-reverse-appurtenant-fixtures";
import { reverseAppurtenantHouseAssetId } from "@/lib/calc/reverse-appurtenant-house";

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
  apiRef,
}: {
  init: F;
  embedded?: boolean;
  patches?: Partial<F>[];
  invalidate?: () => void;
  /** 테스트가 마운트 뒤 폼을 외부에서 고치는 통로(사용자가 다른 칸을 편집한 것과 같다) */
  apiRef?: { current: ((p: (prev: F) => F) => void) | null };
}) {
  const [f, setF] = useState<F>(init);
  useEffect(() => {
    if (apiRef) apiRef.current = setF;
  }, [apiRef]);
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

  it("조문 인용은 «판정 입력은 주택이 첫 자산일 때 열린다» 문장에 붙고, 순서 바꾸기 문장에는 붙지 않는다(리뷰 S5)", () => {
    render(<Host init={form(LAND("l1", 300), HOUSE(0))} />);
    const text = screen.getByTestId(NOTICE).textContent ?? "";
    const cite = text.indexOf("§89");
    expect(cite).toBeGreaterThan(-1);
    expect(cite).toBeLessThan(text.indexOf("주택을 첫 자산으로 바꾸면"));
    expect(text.slice(text.indexOf("주택을 첫 자산으로 바꾸면"))).not.toContain("§89");
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

  it("🔑 지분 분할(축 B) 모드에서는 숨긴다 — 리프는 지분율이 채워진 뒤 함께 양도와 구분하지 못하므로(⑧은 그대로 막는다) 이 숨김이 유일한 막이다", () => {
    const half = { ownershipNumerator: "1", ownershipDenominator: "2" };
    const f = form({ ...LAND("l1", 300), ...half }, { assetKind: "housing", assetId: "s2", ...half }) as F;
    expect(reverseAppurtenantHouseAssetId(f.assets)).toBe("s2"); // 데이터만 보는 리프는 형제를 짝 주택으로 읽는다
    render(<Host init={f} />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it("🔑 지분 분할 모드에서 형제 지분을 100%로 고쳐도(리프가 역방향으로 읽는다) 카드가 뜨지 않는다 — splitMode는 마운트 때 정해진 state다", () => {
    const half = { ownershipNumerator: "1", ownershipDenominator: "2" };
    const api: { current: ((p: (prev: F) => F) => void) | null } = { current: null };
    const init = form({ ...LAND("l1", 300), ...half }, { assetKind: "housing", assetId: "s2", ...half }) as F;
    const edit = (prev: F): F => ({
      ...prev,
      assets: prev.assets.map((a) => (a.assetId === "s2" ? { ...a, ownershipNumerator: "100", ownershipDenominator: "100" } : a)),
    });
    expect(reverseAppurtenantHouseAssetId(edit(init).assets)).toBe("s2"); // 편집 뒤 리프는 역방향으로 읽는다
    render(<Host init={init} apiRef={api} />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
    act(() => api.current!(edit));
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it.each([
    ["nblUseDetailedJudgment", { nblUseDetailedJudgment: true }, "비사업용 토지 정밀판정"],
    ["parcelMode", { parcelMode: true }, "다필지"],
    ["isSalesCaseAcquisition", { isSalesCaseAcquisition: true }, "매매사례가액"],
    ["familyBusinessInheritance", { familyBusinessInheritance: { decedentAcquisitionPrice: "1" } }, "가업상속"],
    [
      "pre1990Enabled(매매 · 1990.8.30. 이전)",
      { acquisitionDate: "1985-03-01", pre1990Enabled: true, useEstimatedAcquisition: true, fixedAcquisitionPrice: "" },
      "토지등급 환산",
    ],
  ])("첫 자산 전용 입력(%s) — 버튼 없이 사유 한 줄", (_n, patch, label) => {
    render(<Host init={form({ ...LAND("l1", 300), ...patch }, HOUSE(0))} />);
    expect(screen.queryByTestId(BTN)).toBeNull();
    expect(screen.getByTestId(REASON).textContent).toContain(label);
  });
});

describe("증환지 증가분 (리뷰 S3)", () => {
  it("버튼 없이 사유 한 줄 — ⑧ 안내를 따르면 증가분 기준시가가 깨진다", () => {
    render(<Host init={form(LAND("l1", 300), HOUSE(0), { ...LAND("l2", 100), isReplotIncrement: true })} />);
    expect(screen.queryByTestId(BTN)).toBeNull();
    expect(screen.getByTestId(REASON).textContent).toContain("증환지 증가분");
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

describe("교환 직후 안내 — 처음 반영되는 입력이 있을 때만(렌더마다 현재 폼에서 파생)", () => {
  // HOUSE 시료는 거주기간(120개월)이 입력돼 있어 그 자체로 «처음 반영되는 입력»이다 — 없음 기준은 비운다.
  const BARE = { ...HOUSE(0), residencePeriodMonthsAsset: "" };
  it("없으면 아무것도 띄우지 않는다", () => {
    render(<Host init={form(LAND("l1", 300), BARE)} />);
    fireEvent.click(screen.getByTestId(BTN));
    expect(screen.queryByTestId(AFTER)).toBeNull();
  });
  it("승격 주택에 신축·증축 입력이 있으면 한 줄", () => {
    render(<Host init={form(LAND("l1", 300), { ...BARE, isSelfBuilt: true })} />);
    fireEvent.click(screen.getByTestId(BTN));
    expect(screen.getByTestId(AFTER).textContent).toContain("신축·증축");
  });
  it("자산별 거주기간(기본 시료 120개월)도 처음 반영되는 입력이다", () => {
    render(<Host init={form(LAND("l1", 300), HOUSE(0))} />);
    fireEvent.click(screen.getByTestId(BTN));
    expect(screen.getByTestId(AFTER).textContent).toContain("자산별 거주기간");
  });
  it("🔑 안내는 스냅샷이 아니다 — 교환 후 그 입력을 해제하면 스스로 거둔다", () => {
    const api: { current: ((p: (prev: F) => F) => void) | null } = { current: null };
    render(<Host init={form(LAND("l1", 300), { ...BARE, isSelfBuilt: true })} apiRef={api} />);
    fireEvent.click(screen.getByTestId(BTN));
    expect(screen.queryByTestId(AFTER)).not.toBeNull();
    act(() => api.current!((prev) => ({ ...prev, assets: prev.assets.map((a) => (a.assetId === "h1" ? { ...a, isSelfBuilt: false } : a)) })));
    expect(screen.queryByTestId(AFTER)).toBeNull();
    act(() => api.current!((prev) => ({ ...prev, assets: prev.assets.map((a) => (a.assetId === "h1" ? { ...a, isSelfBuilt: true } : a)) })));
    expect(screen.queryByTestId(AFTER)).not.toBeNull();
  });
});

describe("교환 직후 안내의 수명", () => {
  it("승격 주택이 더 이상 첫 자산이 아니면(첫 자산 삭제) 안내를 거둔다", () => {
    render(<Host init={form(LAND("l1", 300), { ...HOUSE(0), isSelfBuilt: true })} />);
    fireEvent.click(screen.getByTestId(BTN));
    expect(screen.queryByTestId(AFTER)).not.toBeNull();
    const firstCard = document.querySelector<HTMLElement>('[data-asset-card-index="0"]')!;
    fireEvent.click(within(firstCard).getByRole("button", { name: "삭제" }));
    expect(screen.queryByTestId(AFTER)).toBeNull();
  });
});

describe("교환 직후 안내는 «승격한 그 주택»에만 붙는다", () => {
  it("첫 자산이 다른 자산으로 바뀌면(승격 주택 삭제) 새 첫 자산에 처음 반영되는 입력이 있어도 안내를 띄우지 않는다", () => {
    render(<Host init={form({ ...LAND("l1", 300), isAppraisalAcquisition: true }, { ...HOUSE(0), isSelfBuilt: true })} />);
    fireEvent.click(screen.getByTestId(BTN));
    expect(screen.getByTestId(AFTER).textContent).toContain("신축·증축");
    const firstCard = document.querySelector<HTMLElement>('[data-asset-card-index="0"]')!;
    fireEvent.click(within(firstCard).getByRole("button", { name: "삭제" }));
    expect(screen.queryByTestId(AFTER)).toBeNull();
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
