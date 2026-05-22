/**
 * 영농상속공제 UI anchor (PR-H, 2026-05-21)
 *
 * 범위:
 *  - FC-UI-1~3: FarmingCategorySection (F-4)
 *  - FE-UI-1~2: FarmingEligibilitySection (F-5)
 *  - RD-UI-1~7: FarmingDeductionDetailRow (F-6)
 *
 * 계획서: docs/00-pm/inheritance-farming-remaining-prs.plan.md §3
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FarmingCategorySection } from "@/components/calc/inheritance/FarmingCategorySection";
import { FarmingEligibilitySection } from "@/components/calc/inheritance/FarmingEligibilitySection";
import { FarmingDeductionDetailRow } from "@/components/calc/results/InheritanceTaxResultView";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FarmingDeductionDetail } from "@/lib/tax-engine/types/inheritance-farming.types";

afterEach(() => cleanup());

// ============================================================
// 헬퍼
// ============================================================

function makeItem(over: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "a1",
    category: "real_estate_apartment",
    name: "테스트 자산",
    marketValue: 1_000_000_000,
    ...over,
  };
}

// ============================================================
// FC-UI-1~3 — FarmingCategorySection (F-4)
// ============================================================

describe("[FC-UI] FarmingCategorySection — 영농 자산 분류 (F-4)", () => {
  it("FC-UI-1: 토글 OFF default — 라디오 미렌더, 토글만 노출", () => {
    render(
      <FarmingCategorySection item={makeItem()} onUpdate={() => {}} />,
    );
    // 토글 OFF 시 RadioCardGroup 미렌더 (라디오 0개)
    expect(screen.queryAllByRole("radio").length).toBe(0);
    // 토글 라벨 노출
    expect(screen.queryByText(/영농상속 재산/)).not.toBeNull();
  });

  it("FC-UI-1b: 토글 ON (farmingCategory='farmland') → 8 라디오 노출, farmland checked", () => {
    render(
      <FarmingCategorySection
        item={makeItem({ farmingCategory: "farmland" })}
        onUpdate={() => {}}
      />,
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    // 8 옵션 (영농 카테고리만, none 폐지)
    expect(radios.length).toBe(8);
    const farmlandRadio = radios.find((r) => r.value === "farmland");
    expect(farmlandRadio).toBeDefined();
    expect(farmlandRadio!.checked).toBe(true);
  });

  it("FC-UI-2: listed_stock + 토글 ON → corporate_stock만 활성, 나머지 disabled", () => {
    render(
      <FarmingCategorySection
        item={makeItem({
          category: "listed_stock",
          farmingCategory: "corporate_stock",
        })}
        onUpdate={() => {}}
      />,
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];

    const farmland = radios.find((r) => r.value === "farmland");
    const pasture = radios.find((r) => r.value === "pasture");
    const corporateStock = radios.find((r) => r.value === "corporate_stock");

    expect(farmland?.disabled).toBe(true);
    expect(pasture?.disabled).toBe(true);
    expect(corporateStock?.disabled).toBe(false);
  });

  it("FC-UI-3: financial 카테고리 → 컴포넌트 미렌더", () => {
    const { container } = render(
      <FarmingCategorySection
        item={makeItem({ category: "financial" })}
        onUpdate={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ============================================================
// FE-UI-1~2 — FarmingEligibilitySection (F-5)
// ============================================================

describe("[FE-UI] FarmingEligibilitySection — 자격 입력 (F-5)", () => {
  it("FE-UI-1: farming=undefined → 토글 OFF + 하단 폼 미렌더", () => {
    render(
      <FarmingEligibilitySection
        farming={undefined}
        estateItems={[]}
        onChange={() => {}}
      />,
    );
    // 토글 자체는 노출
    expect(
      screen.queryByText(/영농상속공제 요건 입력/),
    ).not.toBeNull();
    // 하단 폼(피상속인 요건 헤더)은 미렌더
    expect(screen.queryByText(/피상속인 요건/)).toBeNull();
    expect(screen.queryByText(/상속인 요건/)).toBeNull();
  });

  it("FE-UI-3: isEmptyFarming=true (빈 폼) 시 토글 OFF → Dialog 없이 즉시 onChange(undefined)", () => {
    const calls: Array<unknown> = [];
    const EMPTY = {
      type: "personal" as const,
      decedentEightYearFarming: false,
      decedentResidenceMet: false,
      heirIsAdult: false,
      heirTwoYearFarming: false,
      heirResidenceMet: false,
    };
    const { container } = render(
      <FarmingEligibilitySection
        farming={EMPTY}
        estateItems={[]}
        onChange={(v) => calls.push(v)}
      />,
    );
    // 토글 자체의 input[type="checkbox"] (Switch 내부 native)
    const toggleInput = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    expect(toggleInput).not.toBeNull();
    // 토글 OFF (현재 ON 상태에서 OFF로)
    act(() => {
      fireEvent.click(toggleInput!);
    });
    // Dialog 미렌더 — confirm 단계 건너뜀
    expect(screen.queryByText(/입력한 자격 요건 데이터가 모두 삭제/)).toBeNull();
    // onChange(undefined) 호출
    expect(calls).toContain(undefined);
  });

  it("FE-UI-3b: 데이터 입력된 폼 토글 OFF → Dialog 노출 (즉시 폐기 안 함)", () => {
    const calls: Array<unknown> = [];
    const FILLED = {
      type: "personal" as const,
      decedentEightYearFarming: true, // 데이터 있음
      decedentResidenceMet: false,
      heirIsAdult: false,
      heirTwoYearFarming: false,
      heirResidenceMet: false,
    };
    const { container } = render(
      <FarmingEligibilitySection
        farming={FILLED}
        estateItems={[]}
        onChange={(v) => calls.push(v)}
      />,
    );
    const toggleInput = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    act(() => {
      fireEvent.click(toggleInput);
    });
    // Dialog 노출 — 데이터 폐기 확인 필요
    expect(screen.queryByText(/입력한 자격 요건 데이터가 모두 삭제/)).not.toBeNull();
    // onChange(undefined) 미호출 (사용자 확인 대기)
    expect(calls).not.toContain(undefined);
  });

  it("FE-UI-2: farming 충족 + 65세 미만 사망 → 미리보기 '모든 요건 충족' 노출", () => {
    render(
      <FarmingEligibilitySection
        farming={{
          type: "personal",
          decedentEightYearFarming: true,
          decedentResidenceMet: true,
          heirIsAdult: true,
          heirTwoYearFarming: false,
          heirResidenceMet: true,
          decedentEarlyDeath: true,
        }}
        estateItems={[]}
        onChange={() => {}}
      />,
    );
    // 하단 폼 노출 확인 (피상속인 요건 헤더)
    expect(screen.queryAllByText(/피상속인 요건/).length).toBeGreaterThan(0);
    // 자격 충족 미리보기 (정확한 문구는 컴포넌트 내부 정의 따름 — "충족" 포함)
    const previewMatches = screen.queryAllByText(/충족/);
    expect(previewMatches.length).toBeGreaterThan(0);
  });
});

// ============================================================
// RD-UI-1~7 — FarmingDeductionDetailRow (F-6)
// ============================================================

describe("[RD-UI] FarmingDeductionDetailRow — 5-way 분기 (F-6)", () => {
  it("RD-UI-1: 정상 공제 (capped=20억, applied=20억) → emerald 안내·30억 내", () => {
    const detail: FarmingDeductionDetail = {
      evaluated: true,
      eligible: true,
      ineligibleReasons: [],
      appliedAssetValue: 2_000_000_000,
      cappedDeduction: 2_000_000_000,
    };
    const { container } = render(<FarmingDeductionDetailRow detail={detail} />);
    expect(container.firstChild).not.toBeNull();
    expect(screen.queryByText(/영농자산/)).not.toBeNull();
    // 30억 한도 미적용 → "한도 적용" 텍스트 없음
    expect(screen.queryByText(/한도 적용/)).toBeNull();
  });

  it("RD-UI-2: 30억 cap 적용 (applied=50억, capped=30억) → '한도 적용' 노출", () => {
    const detail: FarmingDeductionDetail = {
      evaluated: true,
      eligible: true,
      ineligibleReasons: [],
      appliedAssetValue: 5_000_000_000,
      cappedDeduction: 3_000_000_000,
    };
    render(<FarmingDeductionDetailRow detail={detail} />);
    expect(screen.queryByText(/한도 적용/)).not.toBeNull();
  });

  it("RD-UI-3: evaluated=true + capped=0 + applied=0 → gray '영농 자산 미입력'", () => {
    const detail: FarmingDeductionDetail = {
      evaluated: true,
      eligible: true,
      ineligibleReasons: [],
      appliedAssetValue: 0,
      cappedDeduction: 0,
    };
    render(<FarmingDeductionDetailRow detail={detail} />);
    expect(screen.queryByText(/영농 자산 미입력/)).not.toBeNull();
  });

  it("RD-UI-4: 자격 미충족 + 사용자 입력(applied>0) → amber + reasons 목록", () => {
    const detail: FarmingDeductionDetail = {
      evaluated: true,
      eligible: false,
      ineligibleReasons: ["§16②1호가 — 8년 영농 미충족", "§16⑭ — 피상속인 결격소득"],
      appliedAssetValue: 1_000_000_000,
      cappedDeduction: 0,
    };
    render(<FarmingDeductionDetailRow detail={detail} />);
    expect(screen.queryByText(/자격 미충족으로 공제 0원/)).not.toBeNull();
    expect(screen.queryByText(/8년 영농 미충족/)).not.toBeNull();
    expect(screen.queryByText(/결격소득/)).not.toBeNull();
  });

  it("RD-UI-5: 미충족 + applied=0 → gray '자격 미충족 + 자산 미입력'", () => {
    const detail: FarmingDeductionDetail = {
      evaluated: true,
      eligible: false,
      ineligibleReasons: ["§16②1호가 — 8년 영농 미충족"],
      appliedAssetValue: 0,
      cappedDeduction: 0,
    };
    render(<FarmingDeductionDetailRow detail={detail} />);
    expect(screen.queryByText(/자격 미충족 \+ 자산 미입력/)).not.toBeNull();
  });

  it("RD-UI-6: evaluated=false (legacy) → violet 안내", () => {
    const detail: FarmingDeductionDetail = {
      evaluated: false,
      eligible: true,
      ineligibleReasons: [],
      appliedAssetValue: 1_000_000_000,
      cappedDeduction: 1_000_000_000,
    };
    render(<FarmingDeductionDetailRow detail={detail} />);
    expect(screen.queryByText(/legacy 모드/)).not.toBeNull();
  });

  it("RD-UI-7: detail=undefined → 미렌더 (null)", () => {
    const { container } = render(<FarmingDeductionDetailRow detail={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  // 부록 A — 자격자 N명 / 전체 M명 노출
  it("RD-UI-8: heirAssessments 메타 입력 시 '부록 A — 자격 충족 상속인 N명 / 전체 M명' 노출", () => {
    const detail: FarmingDeductionDetail = {
      evaluated: true,
      eligible: true,
      ineligibleReasons: [],
      appliedAssetValue: 1_000_000_000,
      cappedDeduction: 1_000_000_000,
      qualifiedHeirCount: 1,
      totalHeirCount: 3,
    };
    render(<FarmingDeductionDetailRow detail={detail} />);
    expect(screen.queryByText(/부록 A — 자격 충족 상속인/)).not.toBeNull();
    expect(screen.queryByText(/1명/)).not.toBeNull();
    expect(screen.queryByText(/전체 3명/)).not.toBeNull();
  });

  it("RD-UI-9: heirAssessments 메타 미입력 → '부록 A' 안내 미렌더", () => {
    const detail: FarmingDeductionDetail = {
      evaluated: true,
      eligible: true,
      ineligibleReasons: [],
      appliedAssetValue: 1_000_000_000,
      cappedDeduction: 1_000_000_000,
    };
    render(<FarmingDeductionDetailRow detail={detail} />);
    expect(screen.queryByText(/부록 A/)).toBeNull();
  });

  // ============================================================
  // v4.1.1 Phase 5 — residence echo 산식 인용 (옵션 C, D8)
  // ============================================================

  it("RD-UI-10: residence.matchKind=same_district → 산식 인용 라인 노출", () => {
    const detail: FarmingDeductionDetail = {
      evaluated: true,
      eligible: true,
      ineligibleReasons: [],
      appliedAssetValue: 1_000_000_000,
      cappedDeduction: 1_000_000_000,
      residence: {
        decedentMatchKind: "same_district",
        heirMatchKind: "same_district",
        decedentAutoMet: true,
        heirAutoMet: true,
        decedentMinDistanceKm: 0,
        heirMinDistanceKm: 0,
      },
    };
    render(<FarmingDeductionDetailRow detail={detail} />);
    expect(screen.queryByText(/§16②1호나 거주지 자동 검증/)).not.toBeNull();
    expect(screen.queryAllByText(/동일 시·군·구/).length).toBeGreaterThanOrEqual(2);
  });

  it("RD-UI-11: residence=undefined (corporate 트랙) → 산식 인용 라인 미렌더", () => {
    const detail: FarmingDeductionDetail = {
      evaluated: true,
      eligible: true,
      ineligibleReasons: [],
      appliedAssetValue: 1_000_000_000,
      cappedDeduction: 1_000_000_000,
      // residence 미생성
    };
    render(<FarmingDeductionDetailRow detail={detail} />);
    expect(screen.queryByText(/§16②1호나 거주지 자동 검증/)).toBeNull();
  });

  it("RD-UI-12: residence.matchKind=null (좌표 미입력) → '사용자 명시' 안내 라인", () => {
    const detail: FarmingDeductionDetail = {
      evaluated: true,
      eligible: true,
      ineligibleReasons: [],
      appliedAssetValue: 1_000_000_000,
      cappedDeduction: 1_000_000_000,
      residence: {
        decedentMatchKind: null,
        heirMatchKind: null,
        decedentAutoMet: null,
        heirAutoMet: null,
        decedentMinDistanceKm: null,
        heirMinDistanceKm: null,
      },
    };
    render(<FarmingDeductionDetailRow detail={detail} />);
    expect(screen.queryByText(/자동 거주지 검증 미수행/)).not.toBeNull();
  });
});

// vi unused 가드
void vi;
