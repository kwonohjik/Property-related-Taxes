/**
 * anchor — 일반건물(GB) 부수토지 배율의 곱셈 대상 정정
 *
 * U-13(`buildingFootprintArea` ↔ `gbBuildingFootprintArea` 법령 개념 대조)을 확인하다
 * 발견한 **세액 결함 + 잘못된 법령 인용**을 고정한다.
 *
 * ## 법령 — 「건축법 시행령」 제119조 제1항은 두 면적을 구분한다
 *
 *   제2호 **건축면적**: 건축물 외벽 중심선으로 둘러싸인 부분의 **수평투영면적** (건물 전체 1개)
 *   제3호 **바닥면적**: 건축물의 **각 층** 또는 그 일부의 수평투영면적 (층별)
 *
 * ## 조심 2025지0451 (2026.03.20, **기각**) — 이 쟁점을 정면으로 다뤘다
 *
 * 청구인: "「지방세법」은 별도합산 면적 산정 시 '건축물의 바닥면적'에 배율을 곱하도록
 *   규정하면서 명확한 정의를 두지 않았으므로, **건축면적**(건축물대장)을 기준으로 해야 한다"
 *   — 본부동의 연결 다리·발코니, 실내체육관의 관람석 등이 건축면적에는 포함되나
 *     바닥면적 계산에서는 제외돼 두 값이 유의미하게 다르다고 주장.
 *
 * 재결: **기각**.
 *   "「지방세법」상 바닥면적에 대한 별도의 규정이 없다면 「건축법」에서 정하는 바닥면적의
 *    산정방법에 따라야 하며, 여기서 바닥면적은 **지하층을 포함한 각 층의 바닥면적 중
 *    가장 넓은 것**으로 보아야 한다"
 *   (대법원 2015.6.24. 2012두7073 · 대법원 1994.5.13. 93누18242 · 조심 2011지505 같은 뜻)
 *
 * ## 🔴 현행 결함
 *
 * 코드 3곳이 **건축면적**을 요구한다 — 재결이 배척한 그 기준이다:
 *   `calc-wizard-asset-gb.ts:23`          "건축물대장 건축면적(= 바닥면적)"
 *   `GeneralBuildingBlock.tsx:313` hint   "건축물대장 '건축면적' 또는 1층 바닥면적"
 *   `general-building-valuation.ts:72`    "건축물대장 건축면적 또는 1층 바닥면적"
 *
 * 사용자가 안내대로 건축면적을 넣으면 허용면적이 틀린다. 방향은 건물 형태 의존이다 —
 * 지하층이 더 넓으면 건축면적 < 최대 바닥면적이라 **과다과세**, 처마·발코니가 크면
 * 건축면적 > 최대 바닥면적이라 **과소과세**(재결 사안이 후자였다).
 *
 * ## Phase D 잔재
 *
 * Phase D(2026-07-30)가 배율을 「지방세법 시행령」 제101조 제2항으로 정정했으나
 * GB UI의 hint·배지·법조문 링크에 **「소득세법 시행령」 제168의12**가 남았다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { AssetAreaGeneralBuilding } from "@/components/calc/transfer/asset-sections/AssetAreaGeneralBuilding";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => cleanup());

/**
 * 면적 입력 위젯이 ① 기본정보로 이전됐으므로(2026-08-04) **두 컴포넌트를 함께** 렌더한다.
 * 사용자가 한 화면에서 보는 것과 같은 구성이며, 바닥면적 안내가 입력 라벨(①)과
 * 비사업용토지 산식 설명(③) 양쪽에 걸려 있다는 계약은 그대로 유지된다.
 */
function renderGb(over: Partial<AssetForm> = {}) {
  const asset: AssetForm = {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    ...over,
  } as AssetForm;
  render(
    <>
      <AssetAreaGeneralBuilding asset={asset} onChange={vi.fn()} />
      <GeneralBuildingBlock asset={asset} onChange={vi.fn()} />
    </>,
  );
}

// ══════════════════════════════════════════════════════════
describe("법령 제약 고정 — 「건축법 시행령」 제119조 제1항의 두 면적", () => {
  it("건축면적(제2호)과 바닥면적(제3호)은 다른 개념이다", () => {
    /**
     * 실제 사례(조심 2025지0451): 13개 동 중 본부동은 연결 다리·발코니가 건축면적에
     * 포함되나 바닥면적에서는 제외된다 → 건축면적 > 각 층 최대 바닥면적.
     * 반대로 지하층이 지상층보다 넓으면 건축면적 < 최대 바닥면적이다
     * (대법원 2012두7073의 사안).
     */
    const 건축면적 = 18_500;
    const 각층바닥면적 = [16_412.35, 15_800, 14_200, 12_000]; // 지하층 포함
    const 최대바닥면적 = Math.max(...각층바닥면적);
    expect(최대바닥면적).toBe(16_412.35);
    expect(건축면적).not.toBe(최대바닥면적);

    // 허용면적 차이 (녹지 7배 — 재결 사안의 배율)
    expect(건축면적 * 7).toBe(129_500);
    expect(최대바닥면적 * 7).toBeCloseTo(114_886.45, 2);
    // 14,613.55㎡ 차이 → 그만큼이 종합합산(비사업용)으로 갈리거나 반대가 된다
    expect(건축면적 * 7 - 최대바닥면적 * 7).toBeCloseTo(14_613.55, 2);
  });

  it("지하층을 포함한다 — 지하가 가장 넓으면 그 값이 기준이다", () => {
    const 층별 = { 지하1층: 9_000, 지상1층: 7_500, 지상2층: 7_000 };
    expect(Math.max(...Object.values(층별))).toBe(9_000);
    // 1층 건축면적(7,500)을 쓰면 허용면적이 과소 → 과다과세
    expect(층별.지상1층).toBeLessThan(9_000);
  });
});

// ══════════════════════════════════════════════════════════
describe("GB UI — 바닥면적 정의 안내", () => {
  it("라벨이 「건축물 바닥면적」이고 각 층 중 최대임을 안내한다", () => {
    renderGb();
    // 입력 라벨 + ④ 섹션 산식 설명 두 곳에 반영된다(정정이 양쪽에 걸렸다는 증거)
    expect(screen.getAllByText(/건축물 바닥면적/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/각 층.*가장 넓은/)).toBeInTheDocument();
    expect(screen.getByText(/지하층/)).toBeInTheDocument();
  });

  it("🔴 종전 오안내 「건축면적」 요구가 제거됐다", () => {
    renderGb();
    // 조심 2025지0451이 배척한 기준을 요구하면 안 된다
    expect(screen.queryByText(/건축물대장 '건축면적'/)).not.toBeInTheDocument();
    expect(screen.queryByText(/건축면적' 또는 1층 바닥면적/)).not.toBeInTheDocument();
  });

  it("Phase D 잔재 — 「소득세법 시행령」 제168의12 인용이 GB 경로에서 제거됐다", () => {
    renderGb();
    // GB 부수토지 배율은 「지방세법 시행령」 제101조 제2항 소관이다(Phase D 정정).
    expect(screen.queryByText(/168의12/)).not.toBeInTheDocument();
  });

  it("정확한 근거를 인용한다 — 「지방세법 시행령」 제101조", () => {
    renderGb();
    expect(screen.getAllByText(/제101조|§101/).length).toBeGreaterThan(0);
  });
});
