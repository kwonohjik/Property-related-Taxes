/**
 * RedevelopmentValuationSection — §164⑦ PHD 기준시가 입력 **항목축 재편** + 건물 계산기 배선.
 * 계획서: docs/00-pm/redev-phd-stdprice-section-regroup.plan.md
 *
 * - 종전: 「취득시(Sum_A)」·「최초공시 당시(Sum_F)」 **시점축** 2박스가 각각 토지·건물을 담았다.
 * - 현행: 「토지 기준시가」(2시점)·「건물 기준시가」(2시점 + 계산기 런처 1개) **항목축**.
 * - 건물 칸은 종전에 계산기 진입점이 아예 없었다("수동 입력") — 감면 PHD와 같은 모달을 배선.
 */
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { RedevelopmentValuationSection } from "@/components/calc/transfer/RedevelopmentValuationSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** §164⑦ 본문 발동 상태 — 취득일(2003) < 최초공시일(2005-04-30) */
function phdTriggeredAsset(): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    useEstimatedAcquisition: true,
    acquisitionDate: "2003-05-10",
    redevFirstDisclosureDate: "2005-04-30",
    redevApprovalDate: "2009-06-01",
    redevRightsValue: "300000000",
    redevManagementDisposalHousingPrice: "132000000",
    redevFirstDisclosureHousingPrice: "86000000",
    redevLandArea: "83.2",
    redevLandPricePerSqmAtAcq: "1400000",
    redevLandPricePerSqmAtFirst: "1400000",
    redevBuildingStdPriceAtAcq: "6507200",
    redevBuildingStdPriceAtFirst: "6507200",
  };
}

describe("RedevelopmentValuationSection — 항목축 재편", () => {
  it("토지·건물 2섹션으로 묶이고 시점축 헤더는 사라진다", () => {
    render(<RedevelopmentValuationSection asset={phdTriggeredAsset()} onChange={vi.fn()} />);

    // 신규 항목축 헤더
    expect(screen.getByText("토지 기준시가")).toBeTruthy();
    expect(screen.getByText("건물 기준시가")).toBeTruthy();
    // 종전 시점축 헤더는 없다
    expect(screen.queryByText(/취득시 \(Sum_A 산정\)/)).toBeNull();
    expect(screen.queryByText(/최초공시 당시 \(Sum_F 산정\)/)).toBeNull();
  });

  it("4개 입력 칸(토지 2 · 건물 2)이 모두 남아 있다 — 재편은 입력 경로를 줄이지 않는다", () => {
    render(<RedevelopmentValuationSection asset={phdTriggeredAsset()} onChange={vi.fn()} />);
    expect(screen.getByText("취득시 개별공시지가 (원/㎡)")).toBeTruthy();
    expect(screen.getByText("최초공시 당시 개별공시지가 (원/㎡)")).toBeTruthy();
    expect(screen.getByText("취득시 건물 기준시가")).toBeTruthy();
    expect(screen.getByText("최초공시 당시 건물 기준시가")).toBeTruthy();
  });

  it("두 시점 합계 기준시가는 미리보기 박스가 값과 함께 계속 보여준다 (헤더 제거로 인한 정보 손실 없음)", () => {
    render(<RedevelopmentValuationSection asset={phdTriggeredAsset()} onChange={vi.fn()} />);
    expect(screen.getByText(/취득시 합계 기준시가 =/)).toBeTruthy();
    expect(screen.getByText(/최초공시 당시 합계 기준시가 =/)).toBeTruthy();
  });

  /**
   * 산식 표기 정책 가드 — 결과 산식은 한국어 풀어쓰기이며 변수 약어(`P_A`·`Sum_A`)와
   * `floor()`를 쓰지 않는다(`components/calc/CLAUDE.md`). 엔진 쪽에는 이미 같은 가드가
   * 있었는데(`__tests__/tax-engine/inheritance-house-valuation.test.ts`) UI에는 없어
   * 이 섹션이 정책 밖에 남아 있었다.
   */
  it("미리보기 산식에 변수 약어·floor()가 없다", () => {
    const { container } = render(
      <RedevelopmentValuationSection asset={phdTriggeredAsset()} onChange={vi.fn()} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Sum_[A-Z]/);
    expect(text).not.toMatch(/P_[A-Z]/);
    expect(text).not.toMatch(/floor\(/);
  });
});

describe("RedevelopmentValuationSection — 건물 기준시가 계산기", () => {
  it("§164⑦ 발동 시 계산 런처가 **1개** 노출된다 (2시점 동시 산출)", () => {
    render(<RedevelopmentValuationSection asset={phdTriggeredAsset()} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole("button", { name: /건물 기준시가 계산/ });
    expect(buttons.length).toBe(1);
  });

  it("onApplyBoth는 두 필드를 **단일 배치 patch**로 적용한다 (stale spread 덮어쓰기 방지)", async () => {
    // 모달 본체(무거운 계산 폼) 대신 런처를 스텁해 onApplyBoth 계약만 검증한다.
    vi.resetModules();
    vi.doMock("@/components/calc/building-std-price/BuildingStdPriceModalButton", () => ({
      BuildingStdPriceModalButton: ({
        onApplyBoth,
      }: {
        onApplyBoth?: (acq: number, first: number) => void;
      }) => (
        <button type="button" onClick={() => onApplyBoth?.(6507200, 7100000)}>
          건물 기준시가 계산
        </button>
      ),
    }));
    const { RedevelopmentValuationSection: Stubbed } = await import(
      "@/components/calc/transfer/RedevelopmentValuationSection"
    );
    const onChange = vi.fn();
    render(<Stubbed asset={phdTriggeredAsset()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /건물 기준시가 계산/ }));

    // 🔑 호출은 **1회**여야 한다 — 두 번 나눠 부르면 뒤 patch가 앞 값을 stale spread로 덮는다.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      redevBuildingStdPriceAtAcq: "6507200",
      redevBuildingStdPriceAtFirst: "7100000",
    });
    vi.doUnmock("@/components/calc/building-std-price/BuildingStdPriceModalButton");
  });

  it("§164⑦ 미발동(취득일 ≥ 최초공시일)이면 건물 섹션·런처가 없다", () => {
    const asset: AssetForm = {
      ...phdTriggeredAsset(),
      acquisitionDate: "2010-03-01", // 최초공시일 이후 취득 → 단일 라목값 입력 경로
      redevAcquisitionHousingPrice: "100000000",
    };
    render(<RedevelopmentValuationSection asset={asset} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /건물 기준시가 계산/ })).toBeNull();
    expect(screen.queryByText("건물 기준시가")).toBeNull();
    // 대신 취득당시 단일 라목값 칸이 열린다
    expect(screen.getByText("취득당시 개별주택공시가격")).toBeTruthy();
  });
});
