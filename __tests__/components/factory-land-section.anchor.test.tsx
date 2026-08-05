/**
 * anchor — 공장용지 UI 섹션 (Phase D ⑤)
 *
 * 계획: docs/02-design/features/factory-site-standard-area-nbl.plan.md
 *
 * ## 이 테스트가 지키는 것
 *
 * 1. **미리보기 = 엔진** — 미리보기는 `computeFactoryStandardArea`(엔진과 같은 순수 함수)를
 *    쓴다. 화면에 뜨는 기준면적·초과비율이 실제 판정과 갈리면 사용자가 계산 전에 본 숫자와
 *    결과가 달라진다(memory `feedback_ui_engine_dual_truth_avoidance`).
 * 2. **경로별 필드 노출** — 두 경로는 서로 다른 면적을 요구한다(연면적 vs 바닥면적).
 *    한 화면에 둘 다 띄우면 사용자가 잘못된 칸에 넣는다.
 * 3. **토글 OFF면 아무것도 안 보인다** — 기존 사용자 흐름 불변.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FactoryLandSection } from "@/components/calc/transfer/nbl/FactoryLandSection";
import { computeFactoryStandardArea } from "@/lib/tax-engine/non-business-land/factory-land-standard-area";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    nblZoneType: "general_residential",
    nblFactoryEnabled: true,
    nblFactoryLocationCategory: "eup_myeon_or_complex",
    nblFactoryTotalLandArea: "20000",
    nblFactorySegments: [{ id: "s1", floorArea: "1200", ratePercent: "12", industryLabel: "" }],
    nblFactoryIsRestrictedZone: false,
    nblFactoryAdditionalRecognizedArea: "",
    nblFactoryFootprintArea: "",
    nblFactoryIsUnregistered: false,
    ...over,
  } as unknown as AssetForm;
}

/** 기본 양도일은 현행 고시 시행(2026-02-25) 이후 — 자동조회 가능 상태 */
const view = (over: Partial<AssetForm> = {}, transferDate = "2026-06-01") =>
  render(<FactoryLandSection asset={asset(over)} onAssetChange={vi.fn()} transferDate={transferDate} />);

describe("토글 — OFF면 입력이 열리지 않는다", () => {
  it("UI-1: 토글 OFF에서는 소재 지역·면적 입력이 없다", () => {
    view({ nblFactoryEnabled: false } as Partial<AssetForm>);
    expect(screen.queryByTestId("nbl-factory-total-land-area")).toBeNull();
    expect(screen.queryByTestId("nbl-factory-segment-add")).toBeNull();
  });

  it("UI-2: 토글 ON이면 공장 전체 면적 입력이 열린다", () => {
    view();
    expect(screen.getByTestId("nbl-factory-total-land-area")).toBeTruthy();
  });
});

describe("경로별 필드 노출 — 연면적과 바닥면적을 섞지 않는다", () => {
  it("UI-3: 별표6 경로는 업종(연면적·면적률)을 보이고 바닥면적은 감춘다", () => {
    view({ nblFactoryLocationCategory: "eup_myeon_or_complex" } as Partial<AssetForm>);
    expect(screen.getByTestId("nbl-factory-segment-floor-0")).toBeTruthy();
    expect(screen.getByTestId("nbl-factory-segment-rate-0")).toBeTruthy();
    expect(screen.queryByTestId("nbl-factory-footprint")).toBeNull();
  });

  it("UI-4: §101①1호 경로는 바닥면적만 보이고 업종은 감춘다", () => {
    view({
      nblFactoryLocationCategory: "urban_other",
      nblFactoryFootprintArea: "1000",
    } as Partial<AssetForm>);
    expect(screen.getByTestId("nbl-factory-footprint")).toBeTruthy();
    expect(screen.queryByTestId("nbl-factory-segment-add")).toBeNull();
  });

  it("UI-5: 지역 미선택이면 어느 쪽 면적 입력도 열리지 않는다", () => {
    view({ nblFactoryLocationCategory: "" } as Partial<AssetForm>);
    expect(screen.queryByTestId("nbl-factory-segment-add")).toBeNull();
    expect(screen.queryByTestId("nbl-factory-footprint")).toBeNull();
  });
});

describe("미리보기 — 엔진과 같은 값을 보여준다 (이중 진실 방지)", () => {
  it("PREVIEW-1: 별표6 경로 기준면적이 엔진 산출과 일치한다", () => {
    view();
    // 엔진: 연면적 1,200 ÷ 12% = 10,000 + 3호가2 인정 2,000 = 12,000
    const engine = computeFactoryStandardArea([{ floorArea: 1200, ratePercent: 12 }], 20000);
    expect(engine.standardArea).toBe(12000);
    expect(screen.getByTestId("nbl-factory-preview-standard").textContent).toBe(
      engine.standardArea.toLocaleString("ko-KR", { maximumFractionDigits: 2 }),
    );
  });

  it("PREVIEW-2: 초과분과 비율을 표시한다 (20,000 − 12,000 = 8,000 · 40%)", () => {
    view();
    const t = screen.getByTestId("nbl-factory-preview-excess").textContent ?? "";
    expect(t).toContain("8,000");
    expect(t).toContain("40.00%");
  });

  it("PREVIEW-3: 한도 이내면 「전량 사업용」을 명시한다", () => {
    view({ nblFactoryTotalLandArea: "9000" } as Partial<AssetForm>);
    expect(screen.getByTestId("nbl-factory-preview-within")).toBeTruthy();
    expect(screen.queryByTestId("nbl-factory-preview-excess")).toBeNull();
  });

  it("PREVIEW-4: §101①1호 경로는 바닥면적 × 용도지역 배율로 계산한다 (1,000 × 4배)", () => {
    view({
      nblFactoryLocationCategory: "urban_other",
      nblFactoryFootprintArea: "1000",
    } as Partial<AssetForm>);
    expect(screen.getByTestId("nbl-factory-preview-standard").textContent).toBe("4,000");
  });

  it("PREVIEW-5: 제한지역 토글이 추가 인정한도를 10%로 바꾼다 (12,000 → 11,000)", () => {
    view({ nblFactoryIsRestrictedZone: true } as Partial<AssetForm>);
    expect(screen.getByTestId("nbl-factory-preview-standard").textContent).toBe("11,000");
  });

  it("PREVIEW-6: 값이 모자라면 미리보기를 띄우지 않는다 (추정 표시 금지)", () => {
    view({ nblFactorySegments: [] } as Partial<AssetForm>);
    expect(screen.queryByTestId("nbl-factory-preview")).toBeNull();
  });

  it("PREVIEW-7: §101②표에 없는 용도지역이면 미리보기를 띄우지 않는다", () => {
    view({
      nblFactoryLocationCategory: "urban_other",
      nblFactoryFootprintArea: "1000",
      nblZoneType: "residential", // 세분 전 — 배율 결정 불가
    } as Partial<AssetForm>);
    expect(screen.queryByTestId("nbl-factory-preview")).toBeNull();
  });
});

describe("단서 — 허가·사용승인 미이행", () => {
  it("PREVIEW-8: 면적 미리보기 대신 「전량 비사업용」을 표시한다", () => {
    view({ nblFactoryIsUnregistered: true } as Partial<AssetForm>);
    const t = screen.getByTestId("nbl-factory-preview").textContent ?? "";
    expect(t).toContain("전량이 비사업용");
    expect(screen.queryByTestId("nbl-factory-preview-standard")).toBeNull();
  });
});

describe("문구 — 오입력을 부르는 표현을 쓰지 않는다", () => {
  it("COPY-1: 전체 면적 칸은 「양도하는 토지 면적이 아님」을 명시한다", () => {
    view();
    expect(screen.getByText(/양도하는 토지 면적이 아닙니다/)).toBeTruthy();
  });

  it("COPY-2: 바닥면적 칸은 「건축면적이 아님」을 명시한다 (조심 2025지0451)", () => {
    view({
      nblFactoryLocationCategory: "urban_other",
      nblFactoryFootprintArea: "1000",
    } as Partial<AssetForm>);
    expect(screen.getByText(/건축면적이 아닙니다/)).toBeTruthy();
  });

  it("COPY-3: 단서 토글은 「확인되는 경우에만」으로 좁게 안내한다 (입증부담 — 조심 2025서2489)", () => {
    view();
    expect(screen.getByText(/받지 않은 것이 확인되는 경우에만/)).toBeTruthy();
  });

  /**
   * 별표6 3호 각 목의 문언 구조가 다르다 (2026-08-06 실측 · 계획서 0-6):
   *   나·다·라·바 — "…는 공장입지기준면적에 **포함되는 것으로 한다**"  → 한도를 늘린다
   *   마          — "…합한 면적을 해당 공장의 **부속토지로 보아** …산정" → 판정 대상을 넓힌다
   *
   * 마목을 「추가 인정면적」에 넣도록 안내하면 한도가 부당하게 커져 초과분이 과소해진다
   * (납세자에게 유리한 방향의 오류). 종전 hint가 마목을 「나~바」로 묶고 있었다.
   */
  it("COPY-4: 「추가 인정면적」 안내에서 마목(오염피해 인접토지)을 제외한다", () => {
    view();
    const label = screen.getByText(/추가 인정면적/);
    expect(label.textContent).toContain("나·다·라·바");
    expect(label.textContent).not.toContain("나~바");
  });

  it("COPY-5: 마목분의 귀속처를 「공장 전체 부속토지 면적」으로 지목한다", () => {
    view();
    // 추가 인정면적 칸: 여기가 아니라고 안내
    expect(
      screen.getByText(/오염피해 인접토지\(마목\)는 여기가 아니라/),
    ).toBeTruthy();
    // 전체 부속토지 칸: 여기에 합산하라고 안내
    expect(screen.getByText(/인접토지가 있으면 그 면적도 여기에 합산합니다/)).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────
describe("업종 자동완성 + 버전 게이트 (별표1)", () => {
  it("RATE-1: 업종명으로 검색하면 코드·면적률이 보인다", () => {
    view();
    fireEvent.change(screen.getByTestId("nbl-factory-industry-search"), {
      target: { value: "합성섬유" },
    });
    const opt = screen.getByTestId("nbl-factory-industry-option-20501");
    expect(opt.textContent).toContain("20501");
    expect(opt.textContent).toContain("12%");
    expect((opt as HTMLButtonElement).disabled).toBe(false);
  });

  it("RATE-2: 빈 질의는 목록을 열지 않는다", () => {
    view();
    expect(screen.queryByTestId("nbl-factory-industry-options")).toBeNull();
  });

  // 🔴 2026-02-25 개정이 KSIC를 10차→11차로 교체했다. 그 이전 양도에 현행 표를 쓰면
  // 같은 코드가 다른 업종을 가리켜 면적률이 조용히 틀어진다.
  it("RATE-3: 양도일이 시행일 이전이면 자동 채움 버튼이 비활성이고 사유가 보인다", () => {
    view({}, "2026-01-01");
    fireEvent.change(screen.getByTestId("nbl-factory-industry-search"), {
      target: { value: "합성섬유" },
    });
    expect((screen.getByTestId("nbl-factory-industry-option-20501") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("nbl-factory-rate-gate").textContent).toContain("2026-02-25");
  });

  it("RATE-4: 시행일 이후면 게이트 안내가 뜨지 않는다", () => {
    view({}, "2026-06-01");
    expect(screen.queryByTestId("nbl-factory-rate-gate")).toBeNull();
  });

  it("RATE-5: 양도일 미상이면 자동 채움을 막는다 (추정 금지)", () => {
    view({}, "");
    expect(screen.getByTestId("nbl-factory-rate-gate")).toBeTruthy();
  });

  it("RATE-6: 검색은 게이트와 무관하다 — 자기 업종 코드는 확인할 수 있어야 한다", () => {
    view({}, "2026-01-01");
    fireEvent.change(screen.getByTestId("nbl-factory-industry-search"), {
      target: { value: "합성섬유" },
    });
    expect(screen.getByTestId("nbl-factory-industry-option-20501")).toBeTruthy();
  });
});
