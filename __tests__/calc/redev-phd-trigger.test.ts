/**
 * §164⑦ 본문 발동 술어 — 단일 소스 anchor.
 * 계획서: docs/00-pm/redev-phd-snapshot-staleness-gate.plan.md
 */
import { describe, it, expect } from "vitest";
import { isRedevPhdTriggered, isRedevPhdSectionActive } from "@/lib/calc/redev-phd-trigger";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { shouldShowRedevValuationSection } from "@/components/calc/transfer/asset-sections/AssetAreaRedevelopment";
import { isSuccessorRightTransfer } from "@/lib/calc/transfer-successor-right";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const base = {
  useEstimatedAcquisition: true,
  acquisitionDate: "2003-05-10",
  redevFirstDisclosureDate: "2005-04-30",
};

describe("isRedevPhdTriggered", () => {
  it("환산 모드 + 취득일 < 최초공시일 → 발동", () => {
    expect(isRedevPhdTriggered(base)).toBe(true);
  });

  it("취득일 ≥ 최초공시일 → 미발동 (같은 날 포함 — 그날은 이미 고시분이 있다)", () => {
    expect(isRedevPhdTriggered({ ...base, acquisitionDate: "2010-03-01" })).toBe(false);
    expect(isRedevPhdTriggered({ ...base, acquisitionDate: "2005-04-30" })).toBe(false);
  });

  it("실가 모드면 날짜와 무관하게 미발동 — 이 축 자체가 닫힌다", () => {
    expect(isRedevPhdTriggered({ ...base, useEstimatedAcquisition: false })).toBe(false);
    expect(isRedevPhdTriggered({ ...base, useEstimatedAcquisition: undefined })).toBe(false);
  });

  it("날짜 한쪽이라도 비면 판정 불능 → 미발동 (필수입력 검증이 별도로 차단한다)", () => {
    expect(isRedevPhdTriggered({ ...base, acquisitionDate: "" })).toBe(false);
    expect(isRedevPhdTriggered({ ...base, redevFirstDisclosureDate: "" })).toBe(false);
    expect(isRedevPhdTriggered({ useEstimatedAcquisition: true })).toBe(false);
  });
});

describe("isRedevPhdSectionActive — 섹션 가시성 5중 게이트", () => {
  const open = {
    ...base,
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
  };

  it("5중 게이트를 모두 통과하면 활성", () => {
    expect(isRedevPhdSectionActive(open)).toBe(true);
  });

  it("① 자산 종류가 재개발 계열이 아니면 블록 자체가 없다", () => {
    expect(isRedevPhdSectionActive({ ...open, assetKind: "housing" })).toBe(false);
    expect(isRedevPhdSectionActive({ ...open, assetKind: "general_building" })).toBe(false);
    // 입주권도 재개발 계열이다
    expect(isRedevPhdSectionActive({ ...open, assetKind: "right_to_move_in" })).toBe(true);
  });

  it("② 승계조합원 입주권 → 전용 블록으로 간다", () => {
    expect(
      isRedevPhdSectionActive({
        ...open,
        assetKind: "right_to_move_in",
        isSuccessorRightToMoveIn: true,
      }),
    ).toBe(false);
  });

  it("③ 승계조합원(완공APT) → ⑤ 섹션 전체가 숨는다", () => {
    expect(isRedevPhdSectionActive({ ...open, redevIsSuccessorMember: "yes" })).toBe(false);
    expect(isRedevPhdSectionActive({ ...open, redevIsSuccessorMember: "no" })).toBe(true);
  });

  it("⑤ 단독주택 출자 §164⑤ 2-point 분기 → §164⑦이 아니다", () => {
    expect(
      isRedevPhdSectionActive({
        ...open,
        redevOriginalAssetType: "housing",
        redevSubject: "right",
        redevSettlementDirection: "receive",
      }),
    ).toBe(false);
    // 청산금 지급(pay)이면 그 분기가 아니다
    expect(
      isRedevPhdSectionActive({
        ...open,
        redevOriginalAssetType: "housing",
        redevSubject: "right",
        redevSettlementDirection: "pay",
      }),
    ).toBe(true);
  });

  it("⑥ 토지 출자 → §166③ 단가 카드가 대신 뜬다(§164⑦ 블록 자체가 없다)", () => {
    // RedevelopmentValuationSection.tsx의 `isLand ?` 삼항이 §164⑦ 블록과 계산서 런처를
    // 통째로 LandContribValuationContent로 바꾼다 — 화면에 없는 계산서가 결과탭·이력·PDF에
    // 남는 것을 막는다(P2-04).
    expect(isRedevPhdSectionActive({ ...open, redevOriginalAssetType: "land" })).toBe(false);
    // 주택 출자는 §164⑦ 경로 그대로
    expect(isRedevPhdSectionActive({ ...open, redevOriginalAssetType: "housing" })).toBe(true);
  });

  it("🔑 미확인 필드는 차단하지 않는다 — 구버전·부분 input_data 방어", () => {
    // assetKind 부재 → 판단 보류(트리거만으로 판정)
    expect(isRedevPhdSectionActive(base)).toBe(true);
    // assetKind가 문자열이 아닌 쓰레기 값이어도 차단하지 않는다
    expect(isRedevPhdSectionActive({ ...base, assetKind: 42 })).toBe(true);
  });
});

/**
 * 🔴 게이트가 다른 파일의 가시성 술어와 **같은 판정**인지 고정한다.
 *
 * `isRedevPhdSectionActive`는 `Record<string, unknown>`(저장 input_data)도 받아야 해서
 * 조건을 직접 표현한다 — 저쪽 술어를 그대로 호출하지 못한다. 그래서 드리프트를 막는 것은
 * 타입이 아니라 **이 anchor**다. 저쪽 조건이 바뀌면 여기가 먼저 빨개진다.
 */
describe("가시성 술어 동기화 — 저쪽이 닫으면 게이트도 닫힌다", () => {
  const redevAsset = (over: Partial<AssetForm>): AssetForm => ({
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    useEstimatedAcquisition: true,
    acquisitionDate: "2003-05-10",
    redevFirstDisclosureDate: "2005-04-30",
    ...over,
  });

  it("shouldShowRedevValuationSection가 false면 게이트도 false", () => {
    for (const over of [
      { redevIsSuccessorMember: "yes" as const },
      {
        redevOriginalAssetType: "housing" as const,
        redevSubject: "right" as const,
        redevSettlementDirection: "receive" as const,
      },
    ]) {
      const asset = redevAsset(over);
      expect(shouldShowRedevValuationSection(asset)).toBe(false);
      expect(isRedevPhdSectionActive(asset)).toBe(false);
    }
  });

  it("isSuccessorRightTransfer가 true면 게이트는 false", () => {
    const asset = redevAsset({ assetKind: "right_to_move_in", isSuccessorRightToMoveIn: true });
    expect(isSuccessorRightTransfer(asset)).toBe(true);
    expect(isRedevPhdSectionActive(asset)).toBe(false);
  });

  it("⑥ 토지 출자는 **섹션 안쪽** 게이트다 — 섹션은 열려 있어도 §164⑦ 블록은 없다", () => {
    // `shouldShowRedevValuationSection`는 섹션 자체의 렌더만 판정한다. 토지 출자를 가르는 것은
    // `RedevelopmentValuationSection.tsx`의 `isLand ?` 삼항 — 그 안에서 §164⑦ 블록과
    // 계산서 런처(`snapshotKey=bsp-*-redev-phd`)가 통째로 §166③ 단가 카드로 바뀐다.
    // 두 술어가 갈리는 유일한 지점이므로 여기서 명시적으로 고정한다(P2-04).
    const asset = redevAsset({ redevOriginalAssetType: "land" });
    expect(shouldShowRedevValuationSection(asset)).toBe(true);
    expect(isRedevPhdSectionActive(asset)).toBe(false);
  });

  it("둘 다 열려 있으면 게이트도 열린다 (과잉 차단 방지)", () => {
    const asset = redevAsset({});
    expect(shouldShowRedevValuationSection(asset)).toBe(true);
    expect(isSuccessorRightTransfer(asset)).toBe(false);
    expect(isRedevPhdSectionActive(asset)).toBe(true);
  });
});
