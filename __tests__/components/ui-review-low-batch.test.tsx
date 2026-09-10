/**
 * @vitest-environment jsdom
 *
 * anchor: 양도세 UI 리뷰 대장 **낮음 7건** (L1·L3~L7). 세액은 어느 것도 바뀌지 않는다 —
 * 고쳐진 것은 **이정표가 가리키는 축**, **같은 행의 단위 표기**, **0%의 사유**,
 * **섹션 번호**, **산식 칸의 코드 토큰**이다.
 *
 * ⚠️ 라이브러리 함수만 단언하면 컴포넌트 수정을 증명하지 못한다
 *    ([[feedback_library_anchor_does_not_prove_component_uses_it]]) — 여기서는 전부
 *    **렌더 결과**로 고정한다. L2는 순수 함수라 `ui-review-low-validate.anchor.test.ts`에 있다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GeneralBuildingConversionSection } from "@/components/calc/transfer/GeneralBuildingConversionSection";
import { AmendmentBlock } from "@/components/calc/transfer/AmendmentBlock";
import { New993InputForm } from "@/components/calc/transfer/New993InputForm";
import { RedevelopmentValuationSection } from "@/components/calc/transfer/RedevelopmentValuationSection";
import { fmtMonths } from "@/components/calc/results/transfer/FilingFormTableRedevRows";
import {
  buildRedevTransferFormula,
  buildRedevAcquisitionFormula,
  buildRedevExpenseFormula,
} from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

/* ────────────────────────────────────────────────────────────────────────
 * L1 — 환산주택가격 이정표의 게이트가 «파트 축»이다
 * ──────────────────────────────────────────────────────────────────────── */

const SIGNPOST = /환산주택가격/;

function conversionAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-06-01",
    gbHouseToCommercialConversion: true,
    ...over,
  } as AssetForm;
}

function renderConversion(over: Partial<AssetForm> = {}) {
  return render(
    <GeneralBuildingConversionSection
      asset={conversionAsset(over)}
      onChange={() => {}}
      transferDate="2025-05-01"
    />,
  );
}

describe("L1 — 환산주택가격 위치 안내는 파트 축을 따른다", () => {
  it("🔑 A-1: 분리 취득 + 건물 파트만 환산 — 플래그가 false여도 이정표가 뜬다", () => {
    renderConversion({
      useEstimatedAcquisition: false,
      hasSeperateLandAcquisitionDate: true,
      buildingAcqMode: "estimated",
      landAcqMode: "actual",
    });
    expect(screen.getByText(SIGNPOST)).toBeTruthy();
  });

  it("A-2: 토지 파트만 환산도 같다 — 「하나라도 환산」이 술어다", () => {
    renderConversion({
      useEstimatedAcquisition: false,
      hasSeperateLandAcquisitionDate: true,
      landAcqMode: "estimated",
      buildingAcqMode: "actual",
    });
    expect(screen.getByText(SIGNPOST)).toBeTruthy();
  });

  it("🔑 A-3: 두 파트 모두 실거래가면 뜨지 않는다 — 게이트를 지운 게 아니다", () => {
    renderConversion({
      useEstimatedAcquisition: false,
      hasSeperateLandAcquisitionDate: true,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
    });
    expect(screen.queryByText(SIGNPOST)).toBeNull();
  });

  it("A-4: 종전 경로(분리 OFF + 환산 플래그)는 그대로 뜬다 — 상위 개념이다", () => {
    renderConversion({ useEstimatedAcquisition: true });
    expect(screen.getByText(SIGNPOST)).toBeTruthy();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * L3 — 신고서 표의 기간 단위 표기
 * ──────────────────────────────────────────────────────────────────────── */

describe("L3 — 재개발 분기 열도 「N년 M월」을 쓴다", () => {
  it("🔑 B-1: 「개월」로 찍지 않는다 — 합계 열(fmtPeriod)과 같은 규약", () => {
    expect(fmtMonths(24)).toBe("2년 0월");
    expect(fmtMonths(30)).toBe("2년 6월");
    expect(fmtMonths(30, 5)).toBe("2년 6월 5일");
    expect(fmtMonths(24)).not.toContain("개월");
  });

  it("B-2: 0·미입력은 종전대로 「-」", () => {
    expect(fmtMonths(undefined)).toBe("-");
    expect(fmtMonths(0)).toBe("-");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * L4 — 감면 0%의 사유
 * ──────────────────────────────────────────────────────────────────────── */

function amendmentForm(over: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    applyUnderReportingPenalty: true,
    underReductionMode: "auto_48_2",
    statutoryFilingDeadline: "2024-05-31",
    ...over,
  } as TransferFormData;
}

function renderAmendment(over: Partial<TransferFormData> = {}) {
  return render(<AmendmentBlock form={amendmentForm(over)} onChange={() => {}} />);
}

describe("L4 — 경정 예고 후 수정신고의 0%는 「2년 초과」가 아니다", () => {
  it("🔑 C-1: 토글 ON + 기한 다음 날 — §48② 배제라고 말한다", () => {
    renderAmendment({ amendedFilingDate: "2024-06-01", priorAssessmentNotified: true });
    expect(screen.getByText(/국세기본법 §48② 감면 배제 \(0%\)/)).toBeTruthy();
    expect(screen.queryByText(/2년 초과 경과/)).toBeNull();
  });

  it("🔑 C-2: 토글 OFF + 2년 초과 — 종전 문구가 그대로 산다", () => {
    renderAmendment({ amendedFilingDate: "2027-01-01", priorAssessmentNotified: false });
    expect(screen.getByText(/2년 초과 경과 → 감면 없음 \(0%\)/)).toBeTruthy();
  });

  it("C-3: 감면율이 있는 구간은 종전 문구", () => {
    renderAmendment({ amendedFilingDate: "2024-06-01", priorAssessmentNotified: false });
    expect(screen.getByText(/신고불성실가산세 \d+% 감면/)).toBeTruthy();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * L5 — §99의3 폼의 섹션 번호
 * ──────────────────────────────────────────────────────────────────────── */

describe("L5 — §99의3 폼도 「색상 카드 + 섹션 번호」를 쓴다", () => {
  it("🔑 D-1: ①·② 번호 배지와 제목이 렌더된다", () => {
    render(
      <New993InputForm
        value={
          {
            type: "new_99_3",
            acquisitionType993: "from_builder",
            region993: "outside_speculation",
          } as never
        }
        onUpdate={() => {}}
        onUpdateMany={() => {}}
      />,
    );
    expect(screen.getByText("①")).toBeTruthy();
    expect(screen.getByText("②")).toBeTruthy();
    expect(screen.getByText("취득 유형 · 소재지")).toBeTruthy();
    expect(screen.getByText("기준시가 · 전용면적")).toBeTruthy();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * L6 — ⑤ 안의 중첩 배지
 * ──────────────────────────────────────────────────────────────────────── */

function redevAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    acquisitionDate: "2010-06-01",
    useEstimatedAcquisition: true,
    ...over,
  } as AssetForm;
}

describe("L6 — ⑤ 카드 안의 하위 배지는 「5」가 아니다", () => {
  it("🔑 E-1: 환산 기준시가 분기 배지가 «5a»", () => {
    render(<RedevelopmentValuationSection asset={redevAsset()} onChange={() => {}} />);
    expect(screen.getByText("환산 기준시가")).toBeTruthy();
    expect(screen.getAllByText("5a").length).toBeGreaterThan(0);
    expect(screen.queryByText("5")).toBeNull();
  });

  it("🔑 E-2: 토지 출자 분기(사례 37)도 «5a»", () => {
    render(
      <RedevelopmentValuationSection
        asset={redevAsset({ redevOriginalAssetType: "land" })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/토지 출자/)).toBeTruthy();
    expect(screen.getAllByText("5a").length).toBeGreaterThan(0);
    expect(screen.queryByText("5")).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * L7 — 산식 칸의 코드 토큰
 * ──────────────────────────────────────────────────────────────────────── */

describe("L7 — 사례 46의 0 산식은 법령 근거 한국어다", () => {
  const redev = { receiveOnlyMode: true } as never;

  it("🔑 F-1: 양도가액·취득가액·필요경비 3곳 모두 receiveOnly를 노출하지 않는다", () => {
    const out = [
      buildRedevTransferFormula("preApproval", redev, 0),
      buildRedevAcquisitionFormula("preApproval", redev),
      buildRedevExpenseFormula("preApproval", redev),
    ];
    for (const s of out) {
      expect(s).not.toContain("receiveOnly");
      expect(s).toContain("§166①2호 가목");
      expect(s.startsWith("0 ")).toBe(true);
    }
  });
});
