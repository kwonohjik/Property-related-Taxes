/**
 * 상속·증여 UI 리뷰 G3 — 입력 위젯 축 anchor (렌더).
 *
 * 여기 모인 결함은 **입력이 store에 어떻게 도착하는가**다 — 0이 삼켜지는가, 빈칸이 0으로
 * 굳는가, 사용자가 친 문자열이 부동소수 왕복에 깨지는가. 소스 문자열로는 잴 수 없고
 * onChange가 실제로 무엇을 올리는지 봐야 한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { CorporateNonBusinessAssetsSection } from "@/components/calc/inheritance/CorporateNonBusinessAssetsSection";
import { NetAssetCalculationTable } from "@/components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable";
import { CorporateHeirFields } from "@/components/calc/inheritance/CorporateHeirFields";
import { ValuationDeltaTable } from "@/components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable";
import { FamilyBusinessHeirSelector } from "@/components/calc/inheritance/family-business/FamilyBusinessHeirSelector";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(cleanup);

// ════════════════════════════════════════════════════
// IG-028 · IG-029 — 5년 현금 칸: 지운 칸은 0이 아니다
// ════════════════════════════════════════════════════

describe("[G3-K] IG-028·IG-029 — 지운 칸은 null, 건너뛴 앞칸도 null", () => {
  const item = (cash?: (number | null)[]): EstateItem =>
    ({
      id: "i1",
      category: "unlisted_stock",
      name: "법인",
      familyBusinessCategory: "corporate_stock",
      corporateTotalAssets: 100_000_000_000,
      corporateNonBusinessAssets: { currentCash: 10_000_000_000, cashByYearEnd: cash ?? [] },
    }) as unknown as EstateItem;

  function cashInputs() {
    return screen
      .getAllByPlaceholderText(/년 전 사업연도 말 현금$/)
      .map((el) => el as HTMLInputElement);
  }

  it("K-1: 🔴 앞칸을 건너뛰고 3번째만 채우면 앞 두 칸이 null이다 (구멍이 아니다)", () => {
    const onUpdate = vi.fn();
    render(
      <CorporateNonBusinessAssetsSection
        item={item()}
        onUpdate={onUpdate}
        deathDate="2026-01-01"
      />,
    );
    fireEvent.change(cashInputs()[2], { target: { value: "500,000,000" } });
    const arr = onUpdate.mock.calls.at(-1)?.[0].corporateNonBusinessAssets.cashByYearEnd;
    expect(arr).toEqual([null, null, 500_000_000]);
    // 희소 배열이면 JSON 왕복에서 null이 되어 Zod가 거절했다 — 명시 null이어야 한다.
    expect(JSON.parse(JSON.stringify(arr))).toEqual([null, null, 500_000_000]);
  });

  it("K-2: 🔴 값을 지우면 0이 아니라 null로 되돌아간다 (5년 평균을 끌어내리지 않는다)", () => {
    const onUpdate = vi.fn();
    render(
      <CorporateNonBusinessAssetsSection
        item={item([1_000_000_000, 2_000_000_000])}
        onUpdate={onUpdate}
        deathDate="2026-01-01"
      />,
    );
    fireEvent.change(cashInputs()[0], { target: { value: "" } });
    const arr = onUpdate.mock.calls.at(-1)?.[0].corporateNonBusinessAssets.cashByYearEnd;
    expect(arr[0]).toBeNull();
    expect(arr[1]).toBe(2_000_000_000);
  });

  it("K-3: 양성 쌍둥이 — 0을 «직접 입력»하면 0이 저장되고 화면에도 0으로 보인다", () => {
    const onUpdate = vi.fn();
    render(
      <CorporateNonBusinessAssetsSection
        item={item([0, 1_000_000_000])}
        onUpdate={onUpdate}
        deathDate="2026-01-01"
      />,
    );
    // 「비어 보이는 0」이 없어야 한다
    expect(cashInputs()[0].value).toBe("0");
  });
});

// ════════════════════════════════════════════════════
// IG-059 — 보험법인 토글은 데이터에서 파생된다
// ════════════════════════════════════════════════════

describe("[G3-L] IG-059 — 이력 교체 후에도 보험 토글이 값을 따라간다", () => {
  const EMPTY = {} as never;
  const WITH_INSURANCE = { insuranceReservePolicy: 5_000_000_000 } as never;
  const TITLE = /보험/;

  function renderTable(raw: never) {
    const onChange = vi.fn();
    const { rerender } = render(
      <NetAssetCalculationTable netAssetValueRaw={raw} onChange={onChange} />,
    );
    return { onChange, rerender };
  }

  it("L-1: 🔴 값이 있는 raw로 «교체»되면 토글이 ON이 된다 (재마운트 없이)", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <NetAssetCalculationTable netAssetValueRaw={EMPTY} onChange={onChange} />,
    );
    const switches = () =>
      screen.getAllByRole("switch").filter((el) => {
        const label = el.closest("label") ?? el.parentElement;
        return label ? TITLE.test(label.textContent ?? "") : false;
      });
    const isOn = (el?: Element) =>
      el?.getAttribute("aria-checked") === "true" || (el as HTMLInputElement | undefined)?.checked === true;

    expect(isOn(switches()[0])).toBe(false);

    rerender(<NetAssetCalculationTable netAssetValueRaw={WITH_INSURANCE} onChange={onChange} />);
    expect(switches()[0]).toBeTruthy();
    expect(isOn(switches()[0])).toBe(true);
  });

  it("L-2: 양성 쌍둥이 — 값이 없으면 기본 OFF다 (회귀 0)", () => {
    renderTable(EMPTY);
    const on = screen
      .getAllByRole("switch")
      .some(
        (el) =>
          TITLE.test((el.closest("label") ?? el.parentElement)?.textContent ?? "") &&
          (el.getAttribute("aria-checked") === "true" || (el as HTMLInputElement).checked),
      );
    expect(on).toBe(false);
  });
});

// ════════════════════════════════════════════════════
// IG-060 — 총액 모드 평가차액은 음수를 받는다
// ════════════════════════════════════════════════════

describe("[G3-M] IG-060 — 평가차손(음수)을 총액 모드로 입력할 수 있다", () => {
  it("M-1: 🔴 「-91,548,350」이 부호 그대로 올라간다 (종전엔 +로 반전)", () => {
    const onFallbackChange = vi.fn();
    render(
      <ValuationDeltaTable
        evaluationDeltaRows={[]}
        fallbackAssetValuationDelta={0}
        onRowsChange={vi.fn()}
        onFallbackChange={onFallbackChange}
      />,
    );
    const input = screen.getByPlaceholderText("평가차액 (자산 − 부채)");
    fireEvent.change(input, { target: { value: "-91548350" } });
    expect(onFallbackChange).toHaveBeenLastCalledWith(-91_548_350);
  });

  it("M-2: 양성 쌍둥이 — 양수도 그대로 올라간다 (회귀 0)", () => {
    const onFallbackChange = vi.fn();
    render(
      <ValuationDeltaTable
        evaluationDeltaRows={[]}
        fallbackAssetValuationDelta={0}
        onRowsChange={vi.fn()}
        onFallbackChange={onFallbackChange}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("평가차액 (자산 − 부채)"), {
      target: { value: "91548350" },
    });
    expect(onFallbackChange).toHaveBeenLastCalledWith(91_548_350);
  });
});

// ════════════════════════════════════════════════════
// IG-031 — ⑩ 지분율은 부동소수 왕복에 깨지지 않는다
// ════════════════════════════════════════════════════

describe("[G3-N] IG-031 — 두 자리 지분율을 입력할 수 있다", () => {
  const heir = (ratio?: number): Heir =>
    ({
      id: "h1",
      relation: "corporate",
      name: "법인",
      shareholders: [{ id: "sh1", name: "주주", shareRatio: ratio }],
    }) as unknown as Heir;

  it("N-1: 🔴 7% 입력 후 표시가 「7」이다 (종전 「7.000000000000001」)", () => {
    const set = vi.fn();
    render(<CorporateHeirFields heir={heir()} set={set} allHeirs={[heir()]} />);
    const input = screen.getByTestId("corp-shareholder-share-ratio") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "7" } });
    expect(input.value).toBe("7");
    expect(set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        shareholders: [expect.objectContaining({ shareRatio: 0.07 })],
      }),
    );
  });

  it("N-2: 🔴 이어서 자릿수를 더 쳐 75%를 입력할 수 있다", () => {
    const set = vi.fn();
    render(<CorporateHeirFields heir={heir()} set={set} allHeirs={[heir()]} />);
    const input = screen.getByTestId("corp-shareholder-share-ratio") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "75" } });
    expect(input.value).toBe("75");
  });

  it("N-3: 🔴 소수점을 치는 도중에도 되돌아가지 않는다", () => {
    const set = vi.fn();
    render(<CorporateHeirFields heir={heir()} set={set} allHeirs={[heir()]} />);
    const input = screen.getByTestId("corp-shareholder-share-ratio") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "7." } });
    expect(input.value).toBe("7.");
    fireEvent.change(input, { target: { value: "7.5" } });
    expect(input.value).toBe("7.5");
  });

  it("N-4: 양성 쌍둥이 — 외부에서 들어온 비율은 퍼센트로 표시된다", () => {
    render(<CorporateHeirFields heir={heir(0.07)} set={vi.fn()} allHeirs={[heir(0.07)]} />);
    const input = screen.getByTestId("corp-shareholder-share-ratio") as HTMLInputElement;
    expect(input.value).toBe("7");
  });
});

// ════════════════════════════════════════════════════
// IG-048 — 자동선택 경로에서도 selectedHeir가 실제 상속인이다
// ════════════════════════════════════════════════════

describe("[G3-O] IG-048 — 생년월일이 이미 있으면 칸을 다시 묻지 않는다", () => {
  const HEIR_WITH_BD: Heir = {
    id: "h1",
    relation: "child",
    name: "자녀",
    birthDate: "1990-01-01",
  } as unknown as Heir;
  const HEIR_NO_BD: Heir = { id: "h1", relation: "child", name: "자녀" } as unknown as Heir;
  const BD_HINT = /생년월일을 입력하면/;

  it("O-1: 🔴 상속인 1명 자동선택 + birthDate 보유 → 생년월일 칸이 뜨지 않는다", () => {
    render(
      <FamilyBusinessHeirSelector
        heirs={[HEIR_WITH_BD]}
        heirId={undefined}
        heirBirthDate={undefined}
        deathDate="2026-01-01"
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(BD_HINT)).toBeNull();
  });

  it("O-2: 양성 쌍둥이 — birthDate가 없으면 여전히 칸이 뜬다", () => {
    render(
      <FamilyBusinessHeirSelector
        heirs={[HEIR_NO_BD]}
        heirId={undefined}
        heirBirthDate={undefined}
        deathDate="2026-01-01"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(BD_HINT)).toBeTruthy();
  });

  it("O-3: 양성 대조군 — 명시 선택 경로는 종전대로 동작한다", () => {
    render(
      <FamilyBusinessHeirSelector
        heirs={[HEIR_WITH_BD, { ...HEIR_NO_BD, id: "h2", name: "차남" } as Heir]}
        heirId="h1"
        heirBirthDate={undefined}
        deathDate="2026-01-01"
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(BD_HINT)).toBeNull();
  });
});
