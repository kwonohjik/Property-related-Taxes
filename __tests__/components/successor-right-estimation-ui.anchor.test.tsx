/**
 * R-12 ⑤ — 승계 입주권 추계 3종 입력 UI (2026-08-23)
 *
 * ## 무엇이 열렸나
 *
 * 종전에는 승계 입주권에 **실지거래가액 2칸만** 있었다. 사유는 「입주권의 §99①2호 기준시가
 * 산정 경로가 없다」였는데 **사실이 아니었다** — 영 **§165①**이 「취득일 또는 양도일까지 납입한
 * 금액 + 그 시점의 프리미엄」으로 명문 규정하고, 환산 산식(영 §176의2②**2호**)도
 * 「법 §94①2호**가목** … 부동산을 취득할 수 있는 권리」를 명시 대상으로 삼는다.
 *
 * ⇒ 산정 방식 라디오(§176의2③ 순서) + 모드별 입력칸을 연다.
 *
 * ## 모드별로 무엇을 묻는가
 *
 * | 모드 | 입력 | 근거 |
 * |---|---|---|
 * | 실거래가 | 승계취득가액 + 추가분담금 | §97①1호 가목 · 기준-2025-법규재산-0057 |
 * | 매매사례 | 매매사례가액 + §165① **취득** 2칸 | §176의2③1호 · §163⑥ 개산공제 base |
 * | 감정 | 감정가액 + §165① **취득** 2칸 | §176의2③2호 |
 * | 환산 | §165① **4칸** | §176의2②2호 (분자·분모) |
 *
 * **양도당시 기준시가는 환산에서만 묻는다** — 감정·매매사례는 쓰지 않는 값이므로 물으면
 * 입력할 수 없는 값을 요구하는 셈이 된다(N-04가 봉인).
 *
 * ⛔ **원조합원에는 이 UI가 없다.** §166③ 환산이 전속이다(R-9). 원조합원은 이 컴포넌트
 *    자체가 렌더되지 않고 `RedevelopmentBlock`이 뜬다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SuccessorRightAcquisitionBlock } from "@/components/calc/transfer/SuccessorRightAcquisitionBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// RTL cleanup은 프로젝트 규약상 수동 등록 (memory feedback_rtl_manual_cleanup_required)
afterEach(() => cleanup());

function successorAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "right_to_move_in",
    isSuccessorRightToMoveIn: true,
    acquisitionDate: "2020-03-10",
    ...over,
  } as AssetForm;
}

function renderBlock(asset: AssetForm, onChange = vi.fn()) {
  render(<SuccessorRightAcquisitionBlock asset={asset} onChange={onChange} />);
  return onChange;
}

describe("R-12 ⑤ — 승계 입주권 추계 입력 UI", () => {
  it("[N-01] 실거래가(기본) → 승계 2칸이 보이고 §165① 기준시가는 없다", () => {
    renderBlock(successorAsset());

    expect(screen.getByText("승계취득가액")).toBeTruthy();
    expect(screen.getByText("취득 후 납입 추가분담금")).toBeTruthy();
    expect(screen.queryByText("취득일까지 납입한 금액")).toBeNull();
  });

  it("[N-02] 환산 → §165① 4칸 전부 · 승계 2칸은 사라진다 (배타)", () => {
    renderBlock(successorAsset({ useEstimatedAcquisition: true }));

    expect(screen.getByText("취득일까지 납입한 금액")).toBeTruthy();
    expect(screen.getByText("취득일 현재 프리미엄")).toBeTruthy();
    expect(screen.getByText("양도일까지 납입한 금액")).toBeTruthy();
    expect(screen.getByText("양도일 현재 프리미엄")).toBeTruthy();
    // 실가 2칸은 다른 축이다 — 함께 보이면 어느 값이 쓰이는지 알 수 없다.
    expect(screen.queryByText("승계취득가액")).toBeNull();
  });

  it("[N-03] 감정 → 감정가액 + §165① 취득 2칸", () => {
    renderBlock(successorAsset({ isAppraisalAcquisition: true }));

    // ⚠️ 「감정가액」은 라디오 옵션 라벨과 FieldCard 라벨 **양쪽**에 있다(정당한 중복).
    //    입력칸의 존재는 그 칸에만 있는 hint로 확인한다 — 셀렉터가 2곳에 걸리면 판별력이 없다.
    expect(screen.getByText(/2 이상의 감정평가법인등이 평가한 가액의 평균액/)).toBeTruthy();
    expect(screen.getByText("취득일까지 납입한 금액")).toBeTruthy();
  });

  it("[N-04] 감정 → **양도당시** 기준시가는 묻지 않는다 (환산 전용)", () => {
    renderBlock(successorAsset({ isAppraisalAcquisition: true }));

    expect(screen.queryByText("양도일까지 납입한 금액")).toBeNull();
    expect(screen.queryByText("양도일 현재 프리미엄")).toBeNull();
  });

  it("[N-05] 매매사례 → 매매사례가액 + §165① 취득 2칸 · 양도당시 없음", () => {
    renderBlock(successorAsset({ isSalesCaseAcquisition: true }));

    expect(screen.getByText(/동일하거나 유사한 자산의 매매사례가액/)).toBeTruthy();
    expect(screen.getByText("취득일까지 납입한 금액")).toBeTruthy();
    expect(screen.queryByText("양도일까지 납입한 금액")).toBeNull();
  });

  it("[N-06] §165① 미리보기는 두 칸의 합이다 (④ 변환과 같은 헬퍼)", () => {
    renderBlock(
      successorAsset({
        useEstimatedAcquisition: true,
        successorRightStdPaidAtAcq: "250000000",
        successorRightStdPremiumAtAcq: "50000000",
      }),
    );

    expect(screen.getByText(/취득당시 = 300,000,000/)).toBeTruthy();
  });

  /**
   * 개산공제율은 자산 종류로 갈린다 — 입주권은 §94①2호 **가목**이라 §163⑥**4호 1%**다.
   * 화면에 그 율을 명시해야 사용자가 결과를 검산할 수 있다(PR #1257에서 3%→1% 정정).
   */
  it("[N-07] 미리보기가 개산공제 1%(§163⑥4호)를 명시한다", () => {
    renderBlock(
      successorAsset({
        useEstimatedAcquisition: true,
        successorRightStdPaidAtAcq: "300000000",
      }),
    );

    // ⚠️ `/4호/`는 아래 §89①4호 비과세 안내와도 매칭되고, `1%`·`4호`는 <b>로 노드가 쪼개진다.
    //    이 문장에만 있는 평문 구간으로 잡는다.
    expect(screen.getByText(/개산공제는 취득당시 기준시가의/)).toBeTruthy();
    expect(screen.getByText(/7%인 3호는 지상권·전세권만 열거/)).toBeTruthy();
  });
});
