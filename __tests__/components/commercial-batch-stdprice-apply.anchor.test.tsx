/**
 * P3 anchor — 상업용건물 §164⑥ 3시점 일괄 계산 배선
 *
 * 계획서: docs/02-design/features/building-std-price-modal-multipoint.plan.md §4.3·§4.4·§5 P3
 *
 * 고정 계약:
 *  A. 배치 적용은 **단일 배치 patch** — 최대 4키(건물 기준시가 3시점 + §164⑤ 준용 확인)를
 *     한 번의 `onChange`로 반영한다(단일키 setter 연속 호출은 stale spread를 부른다,
 *     memory `feedback_multikey_patch_stale_spread_overwrite`).
 *  B. 취득 ≤2000의 모달 공시지가는 **2001.1.1 기준(위치지수 전용)**이라 취득당시 토지값
 *     (`cbLandPricePerSqmAtAcq`)에 넣지 않는다 — 넣으면 §164⑥ 환산이 오염된다.
 *  C. Q-1 — 계산기가 취득시 금액을 §164⑤ 준용으로 산정하면 확인 토글 자동 체크,
 *     사용자가 그 금액을 **직접 수정**하면 해제(같은 patch에 실어 단일 배치로).
 *  D. 게이트가 막으면 배치 런처 대신 사유를 표시한다(§164⑧ 동일연도 등).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CommercialBuildingBlock } from "../../components/calc/transfer/CommercialBuildingBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function cbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "commercial_building",
    acquisitionCause: "purchase",
    useEstimatedAcquisition: true,
    acquisitionDate: "2000-12-07", // ≤2000 → §164⑥ 단서(§164⑤ 준용) 구간 + cbEra 자동 pre_disclosure
    cbExclusiveArea: "36",
    cbSharedArea: "33.52",
    cbLandArea: "12.57",
    ...over,
  } as AssetForm;
}

describe("D — 게이트 연동", () => {
  it("정상(취득 2000 · 양도 2026) → 배치 런처가 노출된다", () => {
    render(
      <CommercialBuildingBlock asset={cbAsset()} onChange={() => {}} transferDate="2026-05-01" />,
    );
    expect(screen.getByTestId("cb-building-std-batch-open")).toBeTruthy();
  });

  it("취득연도 == 양도연도(§164⑧) → 배치 런처 대신 사유를 표시한다", () => {
    render(
      <CommercialBuildingBlock
        asset={cbAsset({ acquisitionDate: "2024-03-02", cbEra: "pre_disclosure" })}
        onChange={() => {}}
        transferDate="2024-11-01"
      />,
    );
    expect(screen.queryByTestId("cb-building-std-batch-open")).toBeNull();
    expect(screen.getByText(/제164조 제8항/)).toBeTruthy();
  });

  it("게이트가 막아도 시점별 계산기(종전 런처)는 남는다 — dead-end 금지", () => {
    render(
      <CommercialBuildingBlock
        asset={cbAsset({ acquisitionDate: "2024-03-02", cbEra: "pre_disclosure" })}
        onChange={() => {}}
        transferDate="2024-11-01"
      />,
    );
    expect(screen.getAllByText("건물 기준시가 계산").length).toBeGreaterThan(0);
  });

  it("게이트 통과 시에도 시점별 계산기를 보조로 유지한다 (기계식주차·공동주택 환산 경로 보존)", () => {
    render(
      <CommercialBuildingBlock asset={cbAsset()} onChange={() => {}} transferDate="2026-05-01" />,
    );
    expect(screen.getByTestId("cb-building-std-batch-open")).toBeTruthy();
    expect(screen.getAllByText("건물 기준시가 계산").length).toBeGreaterThan(0);
  });
});

describe("C — Q-1 §164⑤ 준용 확인 토글", () => {
  it("취득시 금액을 직접 수정하면 확인이 해제된다 — 같은 patch 1회", () => {
    const onChange = vi.fn();
    render(
      <CommercialBuildingBlock
        asset={cbAsset({ cbAcqBuildingStdBy164_5: true, cbBuildingStdPriceAtAcq: "28096229" })}
        onChange={onChange}
        transferDate="2026-05-01"
      />,
    );
    const input = screen.getByDisplayValue("28,096,229");
    fireEvent.change(input, { target: { value: "30000000" } });
    expect(onChange).toHaveBeenCalledTimes(1); // 연속 호출 금지
    expect(onChange.mock.calls[0][0]).toEqual({
      cbBuildingStdPriceAtAcq: "30000000",
      cbAcqBuildingStdBy164_5: false,
    });
  });

  it("확인이 꺼져 있으면 해제 키를 덧붙이지 않는다 (불필요한 patch 금지)", () => {
    const onChange = vi.fn();
    render(
      <CommercialBuildingBlock
        asset={cbAsset({ cbAcqBuildingStdBy164_5: false, cbBuildingStdPriceAtAcq: "1000000" })}
        onChange={onChange}
        transferDate="2026-05-01"
      />,
    );
    fireEvent.change(screen.getByDisplayValue("1,000,000"), { target: { value: "2000000" } });
    expect(onChange.mock.calls[0][0]).toEqual({ cbBuildingStdPriceAtAcq: "2000000" });
  });
});

// ── A·B: patch 조립 순수 함수 (UI 없이 계약 고정) ──────────────────────────
import {
  buildCommercialBatchPatch,
  buildAcqBuildingStdEditPatch,
} from "@/lib/calc/building-std-batch-apply";

/** 배치 3시점 산출 결과(P0 anchor 실측값) */
const batchResult = {
  acquisition: { housing: 28_096_229 },
  firstDisclosure: { housing: 35_663_760 },
  transfer: { housing: 48_872_560 },
};

describe("A — 4키 단일 배치 patch", () => {
  it("3시점 + §164⑤ 준용 확인이 **한 patch**에 담긴다 (취득 ≤2000)", () => {
    const patch = buildCommercialBatchPatch(batchResult, {
      acquisitionDate: "2000-12-07",
      cbEra: "",
    });
    expect(patch).toEqual({
      cbBuildingStdPriceAtAcq: "28096229",
      cbBuildingStdPriceAtFirst: "35663760",
      cbBuildingStdPriceAtTransfer: "48872560",
      cbAcqBuildingStdBy164_5: true, // Q-1 자동 체크
    });
  });

  it("취득 2001 이후는 §164⑥ 단서 구간이 아니라 확인 키를 넣지 않는다", () => {
    const patch = buildCommercialBatchPatch(batchResult, {
      acquisitionDate: "2003-05-10",
      cbEra: "pre_disclosure",
    });
    expect(patch.cbAcqBuildingStdBy164_5).toBeUndefined();
    expect(patch.cbBuildingStdPriceAtAcq).toBe("28096229");
  });

  it("미산출 시점은 patch에 넣지 않는다 (기존 값 보존)", () => {
    const patch = buildCommercialBatchPatch(
      { transfer: { housing: 48_872_560 } },
      { acquisitionDate: "2000-12-07", cbEra: "" },
    );
    expect(patch).toEqual({ cbBuildingStdPriceAtTransfer: "48872560" });
  });
});

describe("B — 취득 공시지가 트랙 오염 방지", () => {
  it("취득 ≤2000: 모달 공시지가(2001.1.1 기준)를 취득당시 토지값에 넣지 않는다", () => {
    const patch = buildCommercialBatchPatch(
      {
        ...batchResult,
        landPrices: { acquisition: "3978096", firstDisclosure: "11060632", transfer: "15000000" },
      },
      { acquisitionDate: "2000-12-07", cbEra: "" },
    );
    expect(patch.cbLandPricePerSqmAtAcq).toBeUndefined(); // 🔴 오염 금지
    expect(patch.cbLandPricePerSqmAtFirst).toBe("11060632");
    expect(patch.cbLandPricePerSqmAtTransfer).toBe("15000000");
  });

  it("취득 ≥2001: 두 트랙이 같은 값이라 취득 공시지가도 반영한다", () => {
    const patch = buildCommercialBatchPatch(
      { ...batchResult, landPrices: { acquisition: "5000000" } },
      { acquisitionDate: "2008-04-01", cbEra: "pre_disclosure" },
    );
    expect(patch.cbLandPricePerSqmAtAcq).toBe("5000000");
  });
});

describe("C — 직접 수정 patch", () => {
  it("확인이 켜져 있으면 해제를 같은 patch에 싣는다", () => {
    expect(buildAcqBuildingStdEditPatch("30000000", { cbAcqBuildingStdBy164_5: true })).toEqual({
      cbBuildingStdPriceAtAcq: "30000000",
      cbAcqBuildingStdBy164_5: false,
    });
  });

  it("확인이 꺼져 있으면 금액만 바꾼다", () => {
    expect(buildAcqBuildingStdEditPatch("30000000", { cbAcqBuildingStdBy164_5: false })).toEqual({
      cbBuildingStdPriceAtAcq: "30000000",
    });
  });
});

describe("E — 취득 공시지가 자동입력 제외 안내 (2026-08-04)", () => {
  it("취득 ≤2000: 트랙이 다르다는 hint를 표시한다", () => {
    render(
      <CommercialBuildingBlock asset={cbAsset()} onChange={() => {}} transferDate="2026-05-01" />,
    );
    expect(screen.getByText(/2001.1.1 기준 공시지가는 위치지수 산정용/)).toBeTruthy();
  });

  it("취득 ≥2001: 두 트랙이 같은 값이라 안내하지 않는다", () => {
    render(
      <CommercialBuildingBlock
        asset={cbAsset({ acquisitionDate: "2008-04-01", cbEra: "pre_disclosure" })}
        onChange={() => {}}
        transferDate="2026-05-01"
      />,
    );
    expect(screen.queryByText(/2001.1.1 기준 공시지가는 위치지수 산정용/)).toBeNull();
  });
});
