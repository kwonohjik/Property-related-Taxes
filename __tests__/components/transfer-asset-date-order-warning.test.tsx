/**
 * @vitest-environment jsdom
 *
 * 자산 카드 날짜 순서 실시간 경고 anchor (ui-upgrade, 2026-06-12)
 *
 * getAssetDateOrderError — 차단 검증(validateAssetEntry)과 실시간 경고(CompanionAssetCard)가
 * 공유하는 단일 진실. UI는 입력 직후 amber 경고, "다음" 클릭 시 같은 규칙으로 rose 차단.
 *
 * 검증 항목:
 *  T-01: 취득일 ≥ 양도일 → 경고 메시지 반환
 *  T-02: 취득일 < 양도일 → null
 *  T-03: 양도일 미입력 → null (불완전 입력 중 경고 금지)
 *  T-04: 상속 — 피상속인 취득일 ≥ 상속개시일 → 경고
 *  T-05: 증여 — 증여자 취득일 ≥ 증여일 → 경고
 *  T-06: 다필지 모드 — 자산-수준 취득일 비교 스킵 (필지별 별도 검증)
 *  T-07: 카드 렌더 — 취득일 ≥ 양도일이면 amber 경고 텍스트 표시
 *  T-08: 카드 렌더 — 차단 배너(errorMessage)와 동시면 차단 배너만 (중복 금지)
 *  T-09: validateAssetEntry 차단 메시지와 실시간 경고 메시지 동일 (단일 진실)
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  getAssetDateOrderError,
  validateAssetEntry,
} from "@/lib/calc/transfer-tax-validate-asset";
import { CompanionAssetCard } from "@/components/calc/transfer/CompanionAssetCard";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function housingAsset(overrides: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  const a = makeDefaultAsset(1);
  a.assetKind = "housing";
  a.acquisitionDate = "2020-01-01";
  a.fixedAcquisitionPrice = "50000000";
  return Object.assign(a, overrides);
}

describe("getAssetDateOrderError — 순수 규칙", () => {
  it("T-01: 취득일 ≥ 양도일 → 경고", () => {
    const a = housingAsset({ acquisitionDate: "2024-06-01" });
    expect(getAssetDateOrderError(a, "2024-06-01")).toContain("취득일은 양도일보다 이전");
  });

  it("T-02: 취득일 < 양도일 → null", () => {
    const a = housingAsset();
    expect(getAssetDateOrderError(a, "2024-06-01")).toBeNull();
  });

  it("T-03: 양도일 미입력 → null (불완전 입력 중 경고 금지)", () => {
    const a = housingAsset({ acquisitionDate: "2024-06-01" });
    expect(getAssetDateOrderError(a, "")).toBeNull();
    expect(getAssetDateOrderError(a, undefined)).toBeNull();
  });

  it("T-04: 상속 — 피상속인 취득일 ≥ 상속개시일 → 경고", () => {
    const a = housingAsset({
      acquisitionCause: "inheritance",
      acquisitionDate: "2020-01-01",
      decedentAcquisitionDate: "2021-01-01",
    });
    expect(getAssetDateOrderError(a, "2024-06-01")).toContain("피상속인 취득일");
  });

  it("T-05: 증여 — 증여자 취득일 ≥ 증여일 → 경고", () => {
    const a = housingAsset({
      acquisitionCause: "gift",
      acquisitionDate: "2020-01-01",
      donorAcquisitionDate: "2020-01-01",
    });
    expect(getAssetDateOrderError(a, "2024-06-01")).toContain("증여자 취득일");
  });

  it("T-06: 다필지 모드 — 자산-수준 취득일 비교 스킵", () => {
    const a = housingAsset({
      assetKind: "land",
      parcelMode: true,
      acquisitionDate: "2024-06-01",
    });
    expect(getAssetDateOrderError(a, "2024-06-01")).toBeNull();
  });

  it("T-09: validateAssetEntry 차단 메시지 = `자산: ` + 실시간 경고 (단일 진실)", () => {
    const form = createDefaultTransferFormData();
    form.transferDate = "2024-06-01";
    form.contractTotalPrice = "100000000";
    form.assets[0] = housingAsset({ acquisitionDate: "2024-06-01" });

    const realtime = getAssetDateOrderError(form.assets[0], form.transferDate);
    const blocking = validateAssetEntry(form.assets[0], 0, form);
    expect(realtime).not.toBeNull();
    expect(blocking).toBe(`자산: ${realtime}`);
  });
});

describe("CompanionAssetCard — 실시간 경고 렌더", () => {
  it("T-07: 취득일 ≥ 양도일이면 amber 경고 표시", () => {
    render(
      <CompanionAssetCard
        index={0}
        asset={housingAsset({ acquisitionDate: "2024-06-01" })}
        bundledSaleMode="apportioned"
        onChange={() => {}}
        singleMode
        transferDate="2024-06-01"
        splitMode="none"
        onFractionalToggle={() => {}}
        hasSiblings={false}
      />,
    );
    expect(
      screen.getByText(/취득일은 양도일보다 이전이어야 합니다/),
    ).toBeTruthy();
  });

  it("T-08: 차단 배너(errorMessage) 존재 시 실시간 경고 미표시 (중복 금지)", () => {
    render(
      <CompanionAssetCard
        index={0}
        asset={housingAsset({ acquisitionDate: "2024-06-01" })}
        bundledSaleMode="apportioned"
        onChange={() => {}}
        singleMode
        transferDate="2024-06-01"
        errorMessage="자산: 취득일은 양도일보다 이전이어야 합니다."
        splitMode="none"
        onFractionalToggle={() => {}}
        hasSiblings={false}
      />,
    );
    // 차단 배너 1건만 — 실시간 경고("날짜를 확인해 주세요" 꼬리표)는 미렌더
    expect(screen.queryByText(/날짜를 확인해 주세요/)).toBeNull();
    expect(
      screen.getByText("자산: 취득일은 양도일보다 이전이어야 합니다."),
    ).toBeTruthy();
  });
});
