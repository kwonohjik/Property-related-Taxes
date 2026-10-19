// @vitest-environment jsdom
/**
 * 무조건 사업용 의제 「종중 소유」 — 선언 하나 · 근거 조문은 지목·도시지역 · 종중 취득일 = 자산 취득일 (2026-10-20)
 * 계획서: docs/00-pm/nbl-jongjoong-toggle-merge.plan.md
 *
 * 1. 매퍼: 종중 취득일 = 자산 취득일(옛 별도 칸 무시) · 옛 ③4호 토글은 선언으로 읽지 않는다(Q-3 a).
 * 2. 배지: 지목·도시지역에 따라 근거 조문을 고른다(엔진 종중 분기와 같은 기준).
 * 3. 화면: 「종중 소유」 토글 하나 · 날짜 칸 없음 · 명의신탁 환원 안내(서면인터넷방문상담5팀-219).
 * 세액 결과는 route anchor `__tests__/api/transfer.route.nbl-jongjoong-toggle-merge.anchor.test.ts`가 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { buildUnconditionalExemption, hasDeclaredUnconditionalExemption } from "@/lib/tax-engine/non-business-land/form-mapper-helpers";
import { UnconditionalExemptionSection } from "@/components/calc/transfer/nbl/UnconditionalExemptionSection";
import { evaluateUnconditionalExemption, jongjoongLegalBadge } from "@/lib/calc/nbl-unconditional-exemption-status";
import { NBL_ACQUISITION_DEPENDENT_EXEMPT_FLAGS } from "@/lib/calc/non-business-land-request";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const pd = (s: string) => (s ? new Date(s) : undefined);

describe("매퍼 — 종중 취득일은 자산 취득일, 옛 값은 읽지 않는다", () => {
  it("종중 선언: 취득일 = 자산 취득일(옛 별도 칸 2015는 무시)", () => {
    const u = buildUnconditionalExemption(
      { acquisitionCause: "purchase", acquisitionDate: "2000-01-01", nblExemptJongjoongOwned: true, nblExemptJongjoongAcqDate: "2015-01-01" },
      pd,
    )!;
    expect([u.isJongjoongOwned, u.jongjoongAcquisitionDate]).toEqual([true, new Date("2000-01-01")]);
  });

  it("옛 ③4호 토글만 켜져 있으면 선언이 아니다 — 의제 입력 자체가 없다", () => {
    const a = { acquisitionCause: "purchase", acquisitionDate: "2000-01-01", nblExemptUrbanFarmlandJongjoong: true, nblExemptJongjoongAcqDate: "2000-01-01" };
    expect(hasDeclaredUnconditionalExemption(a)).toBe(false);
    expect(buildUnconditionalExemption(a, pd)).toBeUndefined();
  });

  it("축 B 지분에서 끄는 취득 경위 의존 선언 목록에 옛 ③4호 토글이 없다", () => {
    expect(NBL_ACQUISITION_DEPENDENT_EXEMPT_FLAGS).not.toContain("nblExemptUrbanFarmlandJongjoong");
    expect(NBL_ACQUISITION_DEPENDENT_EXEMPT_FLAGS).toContain("nblExemptJongjoongOwned");
  });
});

describe("배지 — 지목·도시지역에 따른 근거 조문", () => {
  it.each([
    ["farmland", "general_residential", "소득령 §168의14③4호가목", "소득세법시행령 §168조의14"],
    ["farmland", "agriculture_forest", "소득령 §168의8③6호", "소득세법시행령 §168조의8"],
    ["farmland", "", "소득령 §168의8③6호", "소득세법시행령 §168조의8"],
    ["forest", "general_residential", "소득령 §168의9③8호", "소득세법시행령 §168조의9"],
    ["pasture", "general_residential", "소득령 §168의10②2호", "소득세법시행령 §168조의10"],
    ["", "", "소득령 §168의8③6호 등", "소득세법시행령 §168조의8"],
  ] as const)("%s · %s → %s", (nblLandType, nblZoneType, label, legalBasis) => {
    expect(jongjoongLegalBadge({ nblLandType, nblZoneType })).toEqual({ label, legalBasis });
  });

  it.each([
    ["farmland", "general_residential", "소득세법 시행령 §168조의14 ③ 4호 가목"],
    ["farmland", "agriculture_forest", "소득세법 시행령 §168조의8 ③ 6호"],
    ["forest", "general_residential", "소득세법 시행령 §168조의9 ③ 8호"],
    ["pasture", "general_residential", "소득세법 시행령 §168조의10 ② 2호"],
  ] as const)("배지와 엔진 인용이 같은 조문이다: %s · %s", (nblLandType, nblZoneType, engineBasis) => {
    const asset = { ...makeDefaultAsset(1), nblLandType, nblZoneType, acquisitionDate: "2000-01-01", nblExemptJongjoongOwned: true } as AssetForm;
    const badge = jongjoongLegalBadge(asset).label.replace("소득령 ", "");
    const m = /§(\d+)의(\d+)(.)(\d+)호(가목)?/.exec(badge)!;
    expect(engineBasis).toBe(`소득세법 시행령 §${m[1]}조의${m[2]} ${m[3]} ${m[4]}호${m[5] ? " 가목" : ""}`);
    expect(evaluateUnconditionalExemption(asset, "2024-06-03").matched?.legalBasis).toBe(engineBasis);
  });
});

describe("화면 — 「종중 소유」 토글 하나 · 날짜 칸 없음", () => {
  const show = (o: Partial<AssetForm>) => {
    const asset = { ...makeDefaultAsset(1), nblLandType: "farmland", nblZoneType: "general_residential", acquisitionDate: "2000-01-01", ...o } as AssetForm;
    return render(
      <UnconditionalExemptionSection asset={asset} onAssetChange={() => {}} status={evaluateUnconditionalExemption(asset, "2024-06-03")} />,
    );
  };

  it("토글은 하나 — 옛 ③4호 토글 제목이 없다", () => {
    const { container } = show({});
    expect(screen.getAllByText("종중 소유 (2005.12.31. 이전 취득)")).toHaveLength(1);
    expect(container.textContent).not.toContain("도시지역 농지 — 종중 소유");
    expect(container.textContent).not.toContain("종중 소유 + 2005.12.31. 이전 취득");
  });

  it("켜도 날짜 칸이 열리지 않고, 명의신탁 환원 안내와 「요건 충족」이 보인다", () => {
    const { container } = show({ nblExemptJongjoongOwned: true });
    expect(screen.queryByText("취득일")).toBeNull();
    expect(container.textContent).toContain("명의신탁 해지로 종중 명의로 되돌린 토지는 취득일에 종중이 처음 취득한 날을 넣으세요(서면인터넷방문상담5팀-219)");
    expect(container.textContent).toContain("요건 충족");
    expect(container.textContent).toContain("소득령 §168의14③4호가목");
  });

  it("자산 취득일 2006 → 「요건 미충족」 · 임야면 배지가 §168의9③8호", () => {
    const { container } = show({ nblExemptJongjoongOwned: true, nblLandType: "forest", acquisitionDate: "2006-01-01" });
    expect(container.textContent).toContain("요건 미충족");
    expect(container.textContent).toContain("자산 취득일이 2005.12.31. 이전");
    expect(container.textContent).toContain("소득령 §168의9③8호");
  });

  it("옛 ③4호 저장값만 있으면 배지·배너가 없다", () => {
    const { container } = show({ nblExemptUrbanFarmlandJongjoong: true, nblExemptJongjoongAcqDate: "2000-01-01" });
    expect(container.textContent).not.toContain("요건 충족");
    expect(container.textContent).not.toContain("엔진이 무조건 사업용으로 판정합니다");
  });
});
