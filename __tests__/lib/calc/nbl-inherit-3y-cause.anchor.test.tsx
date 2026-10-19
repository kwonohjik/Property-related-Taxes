// @vitest-environment jsdom
/**
 * 임야·목장 「상속 3년 이내」(「소득세법 시행령」 §168의9③7호·§168의10②1호) — 취득원인·상속개시일 단일 소스 (2026-10-19)
 * 계획서: docs/00-pm/nbl-forest-pasture-inherit-3y-cause.plan.md
 *
 * 1. 서버 매퍼: 상속이면 상속 3년 입력 = 취득일(상속개시일), 그 밖의 취득원인은 없음. 옛 토글·상속일 저장값은 읽지 않는다.
 * 2. 화면: 별도 입력칸(임야 토글·상속일, 목장 상속일)은 없고, 상속 자산에만 자동 판정 안내가 뜬다.
 * 세액 결과는 route anchor `__tests__/api/transfer.route.nbl-forest-pasture-inherit-3y.anchor.test.ts`가 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { mapAssetToNblInput } from "@/lib/tax-engine/non-business-land/form-mapper";
import { ForestDetailSection } from "@/components/calc/transfer/nbl/ForestDetailSection";
import { PastureDetailSection } from "@/components/calc/transfer/nbl/PastureDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const ACQ = new Date("2022-01-01");
const map = (land: "forest" | "pasture", cause: string, old: Record<string, unknown> = {}) =>
  mapAssetToNblInput(
    { nblUseDetailedJudgment: true, nblLandType: land, nblZoneType: "agriculture_forest", acquisitionCause: cause, ...old },
    { acquisitionDate: ACQ, transferDate: new Date("2024-06-03"), parseDate: (s) => (s ? new Date(s) : undefined), parseNumber: () => undefined },
  );
const OLD = { nblForestInheritedWithin3Years: true, nblForestInheritanceDate: "2020-01-01", nblPastureInheritanceDate: "2020-01-01" };

describe("서버 매퍼 — 상속 3년 입력은 취득원인·취득일에서", () => {
  it("상속: 임야 표지·상속일 = 취득일, 목장 상속일 = 취득일 (옛 저장값 2020은 무시)", () => {
    const f = map("forest", "inheritance", OLD)!.forestDetail!;
    expect([f.inheritedForestWithin3Years, f.forestInheritanceDate]).toEqual([true, ACQ]);
    expect(map("pasture", "inheritance", OLD)!.pasture!.inheritanceDate).toEqual(ACQ);
  });

  it.each(["purchase", "gift", "carryover_gift", "burdened_gift", "newConstruction", ""])("%s: 옛 토글·상속일이 있어도 없음", (cause) => {
    const f = map("forest", cause, OLD)!.forestDetail!;
    expect([f.inheritedForestWithin3Years, f.forestInheritanceDate]).toEqual([false, undefined]);
    expect(map("pasture", cause, OLD)!.pasture!.inheritanceDate).toBeUndefined();
  });
});

describe("화면 — 입력칸 없음 · 상속 자산에만 자동 판정 안내", () => {
  const asset = (o: Partial<AssetForm>) => ({ ...makeDefaultAsset(1), ...o }) as AssetForm;
  const sections = [
    ["임야", (a: AssetForm) => <ForestDetailSection asset={a} onAssetChange={() => {}} />, "§168조의9 ③ 7호"],
    ["목장용지", (a: AssetForm) => <PastureDetailSection asset={a} onAssetChange={() => {}} />, "§168조의10 ② 1호"],
  ] as const;

  it.each(sections)("%s · 상속: 상속개시일과 조문을 밝힌다", (label, el, cite) => {
    render(el(asset({ acquisitionCause: "inheritance", acquisitionDate: "2022-01-01" })));
    const n = screen.getByTestId("nbl-inherit-3y-notice").textContent!;
    expect(n).toContain(`상속받은 ${label}입니다. 상속개시일(2022-01-01)부터 3년이 지나지 않은 날`);
    expect(n).toContain(cite);
  });

  it.each(sections)("%s · 매매: 안내 없음", (_l, el) => {
    render(el(asset({ acquisitionCause: "purchase", acquisitionDate: "2022-01-01" })));
    expect(screen.queryByTestId("nbl-inherit-3y-notice")).toBeNull();
  });

  it.each(sections)("%s: 옛 입력칸(상속 3년 이내 양도 토글 · 상속일)이 없다", (_l, el) => {
    const { container } = render(el(asset({ acquisitionCause: "inheritance", acquisitionDate: "2022-01-01" })));
    expect(container.textContent).not.toContain("상속 3년 이내 양도");
    expect(screen.queryByText("상속일")).toBeNull();
    expect(container.textContent).not.toContain("상속 3년 내 해당 시 입력");
  });
});
