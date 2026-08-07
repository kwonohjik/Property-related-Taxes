/**
 * anchor S-1~S-4 — 안분 방식 전환 patch는 **두 경로가 공유하는 단일 소스**다 (2026-08-08)
 *
 * 일반건물(`GeneralBuildingSaleSplitSection`)과 주택·건물(`LandBuildingSaleSplitSection`)이
 * 같은 `saleSplitModePatch`를 쓴다. 각자 구현하면 「어느 값을 비우는가」가 갈려 같은 화면이
 * 다르게 동작한다(`feedback_ui_engine_dual_truth_avoidance`).
 *
 * ## 왜 값을 비워야 하는가
 *
 * 엔진 스위치는 `saleSplitMode`가 **아니라** payload에 값이 실리는지 여부다
 * (`transfer-tax-api-split.ts:75` 실측). 모드만 바꾸고 값을 남기면 **화면에 없는 값이 basis를
 * 조용히 가른다** — 종전 「일괄양도 + 감정평가 토글」의 라벨-동작 모순이 바로 그 형태였다.
 */
import { describe, it, expect } from "vitest";
import { saleSplitModePatch } from "@/lib/calc/transfer-tax-split-acq-mode";

describe("S-1 — 기준시가 안분: 감정평가·구분 양도가액을 모두 비운다", () => {
  const p = saleSplitModePatch("apportioned");

  it("모드가 기록된다", () => {
    expect(p.saleSplitMode).toBe("apportioned");
  });

  it("🔴 감정평가 3필드를 비운다 — 남기면 basis 서열상 감정평가가 이겨 라벨이 거짓이 된다", () => {
    expect(p.landAppraisalAtTransfer).toBe("");
    expect(p.buildingAppraisalAtTransfer).toBe("");
    expect(p.appraisalDateAtTransfer).toBe("");
  });

  it("구분 양도가액 2필드도 비운다 — 구분 기재를 철회한 것이다", () => {
    expect(p.landTransferPrice).toBe("");
    expect(p.buildingTransferPrice).toBe("");
  });
});

describe("S-2 — 감정평가: 구분 양도가액만 비운다", () => {
  const p = saleSplitModePatch("appraisal");

  it("감정평가액은 **건드리지 않는다** — 이 모드에서 쓸 값이다", () => {
    expect(p).not.toHaveProperty("landAppraisalAtTransfer");
    expect(p).not.toHaveProperty("buildingAppraisalAtTransfer");
  });

  it("구분 양도가액은 비운다", () => {
    expect(p.landTransferPrice).toBe("");
    expect(p.buildingTransferPrice).toBe("");
  });
});

describe("S-3 — 구분양도: 아무것도 비우지 않는다", () => {
  const p = saleSplitModePatch("actual");

  it("모드만 바꾼다", () => {
    expect(p).toEqual({ saleSplitMode: "actual" });
  });

  it("🔑 감정평가액을 보존한다 — §100③ 30% 판정의 **비교 대상**이라 여전히 유효하다", () => {
    expect(p).not.toHaveProperty("landAppraisalAtTransfer");
  });
});

describe("S-4 — patch는 한 덩어리다", () => {
  it("모드와 정리가 **하나의 객체**로 나온다 (stale spread 방지)", () => {
    // 나눠 호출하면 뒤 patch가 앞을 덮는다 — memory `feedback_multikey_patch_stale_spread_overwrite`
    const p = saleSplitModePatch("apportioned");
    expect(Object.keys(p).length).toBe(6);
    expect(Object.keys(p)).toContain("saleSplitMode");
  });
});
