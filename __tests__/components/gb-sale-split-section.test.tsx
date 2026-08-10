/**
 * anchor — 일반건물 양도가액 결정 방식 **입력 위젯** (Phase 2-E · ⑤)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §5 · §6
 *
 * ## 노출 규칙
 *
 * | 상황 | 화면 |
 * |---|---|
 * | 일괄양도(기본) | 라디오만 — 양도가액 2칸은 숨긴다 |
 * | 구분양도 | 2칸 + §166⑧ 예외 카드 |
 * | 부담부증여(S-11) | **입력 대신 사유 안내** — 칸을 띄우고 validate에서 막으면 dead-end다 |
 * | 증축(S-10) | 🔴 **차단이 아니라 안내**(Q-4 확정) — 건물 구분값을 본체·증축에 기준시가 비율로 나눈다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GeneralBuildingSaleSplitSection } from "@/components/calc/transfer/GeneralBuildingSaleSplitSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

let lastPatch: Partial<AssetForm> = {};

function Harness({
  init,
  blockedReason,
  hasExtension,
}: {
  init?: Partial<AssetForm>;
  blockedReason?: string;
  hasExtension?: boolean;
}) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    ...init,
  } as AssetForm);

  return (
    <GeneralBuildingSaleSplitSection
      asset={asset}
      onChange={(patch) => {
        lastPatch = patch;
        setAsset((a) => ({ ...a, ...patch }));
      }}
      sectionNum="③"
      {...(blockedReason ? { blockedReason } : {})}
      {...(hasExtension ? { hasExtension } : {})}
    />
  );
}

describe("⑤-1 — 모드에 따라 입력 칸이 갈린다", () => {
  it("일괄양도(기본)에서는 양도가액 2칸이 없다", () => {
    render(<Harness />);
    expect(screen.getByTestId("gb-sale-split-mode")).toBeTruthy();
    expect(screen.queryByTestId("gb-land-transfer-price")).toBeNull();
    expect(screen.queryByTestId("gb-building-transfer-price")).toBeNull();
  });

  it("구분양도를 고르면 2칸이 나온다", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} />);
    expect(screen.getByTestId("gb-land-transfer-price")).toBeTruthy();
    expect(screen.getByTestId("gb-building-transfer-price")).toBeTruthy();
  });

  it("라디오를 바꾸면 폼에 반영된다", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /계약서에 구분 기재/ }));
    expect(lastPatch.saleSplitMode).toBe("actual");
  });

  it("§166⑧ 예외 카드는 구분양도에서만 보인다 — 판정 자체가 그때만 돈다", () => {
    render(<Harness />);
    expect(screen.queryByTestId("sale-split-exemption-toggle")).toBeNull();
    cleanup();
    render(<Harness init={{ saleSplitMode: "actual" }} />);
    expect(screen.getByTestId("sale-split-exemption-toggle")).toBeTruthy();
  });

  it("30% 규칙과 잔액 도출을 화면에서 안내한다", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} />);
    expect(screen.getByText(/30% 이상 차이/)).toBeTruthy();
    expect(screen.getByText(/한쪽만 입력하면 나머지는 총액에서 자동 계산/)).toBeTruthy();
  });
});

/**
 * ⑤-3 — **계약 변경 (2026-08-07)**: 감정평가는 이제 **라디오의 한 선택지**다.
 *
 * 종전에는 라디오 2개(일괄/구분) 밖에 「감정평가가액으로 안분」 토글이 따로 있었다. 그 구조는
 * 「일괄양도 (양도시 **기준시가 비율로** 안분)」을 고른 채 토글을 켜면 실제로는 감정평가액으로
 * 안분되어(부가령 §64① 서열) **라벨이 거짓이 되는** 모순이 있었다(사용자 보고).
 *
 * ⇒ 3-way 라디오(구분양도 · 감정평가 · 기준시가 안분)로 합쳤다. 구분양도에서는 감정평가액이
 *   안분 basis가 아니라 §100③ **30% 판정의 비교 대상**이므로, 그쪽 입력 경로는 전용 토글로 남는다.
 */
describe("⑤-3 — 감정평가는 라디오의 선택지이고, 구분양도에서는 비교 기준이다", () => {
  it("기준시가 안분(기본)에서는 감정평가 입력이 없다 — 라벨과 동작이 일치한다", () => {
    render(<Harness />);
    expect(screen.queryByTestId("gb-sale-appraisal-basis")).toBeNull();
    expect(screen.getByTestId("gb-sale-apportioned-note")).toBeTruthy();
  });

  it("「감정평가」를 고르면 금액 칸이 열린다 — 여기서는 안분 basis 자체다", () => {
    render(<Harness init={{ saleSplitMode: "appraisal" }} />);
    expect(screen.getByTestId("gb-sale-appraisal-basis")).toBeTruthy();
    expect(screen.getByTestId("sale-appraisal-land")).toBeTruthy();
  });

  it("구분양도에서는 30% 판정 비교 기준으로 입력할 수 있다 (§100③)", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} />);
    expect(screen.getByText(/30% 판정 비교 기준으로 감정평가가액 사용/)).toBeTruthy();
  });

  it("모드를 바꾸면 쓰지 않는 쪽 값을 비운다 — 화면에 없는 값이 basis를 가르지 않게", () => {
    const onChange = vi.fn();
    render(
      <GeneralBuildingSaleSplitSection
        asset={{ ...makeDefaultAsset(1), saleSplitMode: "appraisal", landAppraisalAtTransfer: "100000000" } as AssetForm}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText(/양도시 기준시가 비율/));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        saleSplitMode: "apportioned",
        landAppraisalAtTransfer: "",
        buildingAppraisalAtTransfer: "",
      }),
    );
  });

  it("차단 조합에서는 감정 칸도 숨는다 — 3-way 배분 근거가 없는 것은 basis도 마찬가지다", () => {
    render(<Harness blockedReason="증축이 있는 건물은 …" />);
    expect(screen.queryByTestId("gb-sale-appraisal-basis")).toBeNull();
    expect(screen.queryByTestId("sale-appraisal-toggle")).toBeNull();
  });
});

describe("⑤-2 — 차단 조합은 칸을 열지 않고 이유를 말한다", () => {
  it("차단 사유가 있으면 입력 대신 안내가 뜬다 (부담부증여 — S-11)", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} blockedReason="부담부증여는 … 성립하지 않습니다." />);
    expect(screen.getByTestId("gb-sale-split-blocked")).toBeTruthy();
    expect(screen.queryByTestId("gb-sale-split-mode")).toBeNull();
    expect(screen.queryByTestId("gb-land-transfer-price")).toBeNull();
  });

  it("안내에는 대신 무엇으로 계산되는지가 들어간다 — 막기만 하면 사용자가 다음 행동을 모른다", () => {
    render(<Harness blockedReason="부담부증여는 …" />);
    expect(screen.getByText(/양도시 기준시가 비율로 안분합니다/)).toBeTruthy();
  });
});

describe("⑤-4 — 증축은 **차단이 아니라 안내**다 (Q-4 확정)", () => {
  it("🔴 증축이 있어도 구분 기재 칸이 열린다", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} hasExtension />);
    expect(screen.getByTestId("gb-land-transfer-price")).toBeTruthy();
    expect(screen.queryByTestId("gb-sale-split-blocked")).toBeNull();
  });

  it("건물 구분값이 본체·증축에 기준시가 비율로 나뉜다고 안내한다", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} hasExtension />);
    const note = screen.getByTestId("gb-split-extension-note");
    expect(note.textContent).toContain("양도 당시 기준시가 비율");
    expect(note.textContent).toContain("합계");
  });

  it("증축분이 미미하면 자본적 지출로 처리하라고 권한다 — 사용자 판단 사항이다", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} hasExtension />);
    expect(screen.getByTestId("gb-split-extension-note").textContent).toContain("자본적 지출");
  });

  it("증축이 없으면 그 안내는 뜨지 않는다", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} />);
    expect(screen.queryByTestId("gb-split-extension-note")).toBeNull();
  });
});
