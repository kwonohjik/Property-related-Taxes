/**
 * 스냅샷 적용성 게이트 — L-1 anchor.
 * 계획서: docs/00-pm/redev-phd-snapshot-staleness-gate.plan.md
 */
import { describe, it, expect } from "vitest";
import { isBuildingStdSnapshotApplicable } from "@/lib/calc/building-std-snapshot-applicability";

const KEY = "bsp-asset-r-redev-phd";
const inputWith = (over: Record<string, unknown>) => ({
  assets: [{
    assetId: "asset-r",
    useEstimatedAcquisition: true,
    acquisitionDate: "2003-05-10",
    redevFirstDisclosureDate: "2005-04-30",
    ...over,
  }],
});

describe("isBuildingStdSnapshotApplicable — 재개발 §164⑦", () => {
  it("트리거 ON → 적용 가능", () => {
    expect(isBuildingStdSnapshotApplicable(KEY, inputWith({}))).toBe(true);
  });

  it("취득일 정정으로 트리거 OFF → 적용 불가", () => {
    expect(isBuildingStdSnapshotApplicable(KEY, inputWith({ acquisitionDate: "2010-03-01" }))).toBe(false);
  });

  it("실가 모드 복귀 → 적용 불가", () => {
    expect(isBuildingStdSnapshotApplicable(KEY, inputWith({ useEstimatedAcquisition: false }))).toBe(false);
  });

  it("UUID assetId도 환원된다", () => {
    const id = "3f9a1c2e-7b40-4d55-9f11-8ac2e6d0b7aa";
    const input = { assets: [{ assetId: id, useEstimatedAcquisition: true, acquisitionDate: "2003-05-10", redevFirstDisclosureDate: "2005-04-30" }] };
    expect(isBuildingStdSnapshotApplicable(`bsp-${id}-redev-phd`, input)).toBe(true);
  });
});

describe("🔴 다건 양도(multi-transfer) 폼 모양 — 저장 경로 no-op 방지", () => {
  /**
   * 다건은 `{ __multiTransfer: true, ...MultiTransferFormData }`로 저장되고 자산은
   * `properties[].form.assets`에 있다. 이 모양을 못 찾으면 게이트가 **저장 경로에서만**
   * 조용히 통과해, 화면에서는 사라진 계산서가 IndexedDB·서버 PDF에는 남는다.
   */
  const multiInput = (over: Record<string, unknown>) => ({
    __multiTransfer: true,
    taxYear: 2026,
    properties: [
      { id: "p0", form: { assets: [{ assetId: "other-asset" }] } },
      {
        id: "p1",
        form: {
          assets: [{
            assetId: "asset-r",
            useEstimatedAcquisition: true,
            acquisitionDate: "2003-05-10",
            redevFirstDisclosureDate: "2005-04-30",
            assetKind: "redevelopment_apt",
            ...over,
          }],
        },
      },
    ],
  });

  it("다건 — 트리거 ON이면 적용 가능", () => {
    expect(isBuildingStdSnapshotApplicable(KEY, multiInput({}))).toBe(true);
  });

  it("다건 — 취득일 정정으로 트리거 OFF면 차단 (종전에는 통과했다)", () => {
    expect(isBuildingStdSnapshotApplicable(KEY, multiInput({ acquisitionDate: "2010-03-01" }))).toBe(false);
  });

  it("다건 — 승계조합원 전환도 차단", () => {
    expect(isBuildingStdSnapshotApplicable(KEY, multiInput({ redevIsSuccessorMember: "yes" }))).toBe(false);
  });

  it("다건 — properties 구조가 아니면 통과(판정 불능)", () => {
    expect(isBuildingStdSnapshotApplicable(KEY, { properties: "nope" })).toBe(true);
    expect(isBuildingStdSnapshotApplicable(KEY, { properties: [{ id: "p" }] })).toBe(true);
  });
});

describe("섹션 가시성 조건도 반영한다 (트리거만으로는 절반만 막힌다)", () => {
  it("승계조합원(완공APT) 전환 → 차단", () => {
    expect(isBuildingStdSnapshotApplicable(KEY, inputWith({
      assetKind: "redevelopment_apt", redevIsSuccessorMember: "yes",
    }))).toBe(false);
  });

  it("자산 종류를 재개발 계열 밖으로 바꾸면 → 차단", () => {
    expect(isBuildingStdSnapshotApplicable(KEY, inputWith({ assetKind: "housing" }))).toBe(false);
  });

  it("단독주택 출자 §166③ 분기로 전환 → 차단", () => {
    expect(isBuildingStdSnapshotApplicable(KEY, inputWith({
      assetKind: "right_to_move_in",
      redevOriginalAssetType: "housing",
      redevSubject: "right",
      redevSettlementDirection: "receive",
    }))).toBe(false);
  });
});

describe("판정 불능·비대상은 현행 유지(true) — 과잉 차단 방지", () => {
  it("판정 대상이 아닌 키는 전부 true", () => {
    for (const k of [
      "bsp-a1-gb-acq", "bsp-a1-cb-transfer", "bsp-a1-phd-first",
      "bsp-a1-red-phd", "bsp-a1-split-both", "bsp-a1-mx-commercial", "bsp-estate-item-7",
    ]) {
      expect(isBuildingStdSnapshotApplicable(k, inputWith({ acquisitionDate: "2010-03-01" }))).toBe(true);
    }
  });

  /**
   * ⚠️ 이 입력은 **앱 경로가 만들 수 없는 모양**이다 — 마이그레이션·팩토리가 모든 자산에
   * `redevFirstDisclosureDate: ""`를 백필하므로 결과뷰를 거친 폼에는 키가 항상 있다
   * (2026-08-24 리뷰 실측). 그래서 이 케이스는 「구버전 이력 방어가 동작한다」의 증거가
   * **아니다** — 저장된 input_data를 직접 받는 경로(서버 PDF·외부 주입)에서만 의미가 있다.
   * 가드의 계약을 문서화·고정하는 용도로 남긴다.
   */
  it("판정 근거 키가 아예 없으면 true (스토어를 거치지 않는 input_data 경로 계약)", () => {
    expect(isBuildingStdSnapshotApplicable(KEY, { assets: [{ assetId: "asset-r" }] })).toBe(true);
  });

  it("빈 문자열은 키 부재와 다르다 — 최초공시일을 지우면 차단된다", () => {
    expect(
      isBuildingStdSnapshotApplicable(KEY, inputWith({ redevFirstDisclosureDate: "" })),
    ).toBe(false);
  });

  it("assets가 없거나 id가 안 맞으면 true (이력 복원분·구조 상이 방어)", () => {
    expect(isBuildingStdSnapshotApplicable(KEY, {})).toBe(true);
    expect(isBuildingStdSnapshotApplicable(KEY, { assets: "not-an-array" })).toBe(true);
    expect(isBuildingStdSnapshotApplicable(KEY, { assets: [{ assetId: "other" }] })).toBe(true);
    expect(isBuildingStdSnapshotApplicable(KEY, { estateItems: [] })).toBe(true);
  });
});
