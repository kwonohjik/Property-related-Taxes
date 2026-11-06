/**
 * anchor — 재개발 완공 APT의 «양도시·취득시 기준시가» 칸은 공동주택가격 총액 칸이다
 * (계획서 `docs/02-design/features/redev-companion-apportion-key-std-widget.plan.md` Q-1 a · Q-2 a).
 *
 * 종전: `CompanionSaleModeBlock.toPropertyKind`가 재개발 APT를 «비주거 건물»로 돌려줘 ㎡당 단가 × 면적 × 총액 칸이 떴고,
 *       공시가격 조회가 개별공시지가(`propertyType=land`) 경로로 갔다. 엔진은 총액만 읽는다.
 * 대조군: 주택(총액 칸) · 상업용 건물·토지(단가 × 면적 — 맞다).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import { AssetSectionTransfer } from "@/components/calc/transfer/asset-sections/AssetSectionTransfer";
import { BurdenedGiftTrancheBasisBlock } from "@/components/calc/transfer/BurdenedGiftTrancheBasisBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Kind = AssetForm["assetKind"];
const BG: Partial<AssetForm> = { transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", acquisitionCause: "purchase", acquisitionDate: "2015-03-01" };

function mk(kind: Kind, over: Partial<AssetForm> = {}): AssetForm {
  return { ...makeDefaultAsset(1), assetKind: kind, addressJibun: "서울특별시 강남구 테스트동 1-1", ...over } as AssetForm;
}

function section(a: AssetForm, mode: "apportioned" | "actual") {
  return render(
    <AssetSectionTransfer asset={a} onChange={() => {}} bundledSaleMode={mode} transferDate="2025-06-01" isCompanionBundle contractTotalPrice="1000000000" />,
  );
}

/** 입력 칸 라벨 중 «㎡당 단가»·«면적» 칸 개수 — 위젯 모양(총액 vs 단가×면적)의 지문. */
function areaModeCells(container: HTMLElement): { unit: number; area: number } {
  const labels = Array.from(container.querySelectorAll("label")).map((l) => l.textContent ?? "");
  return { unit: labels.filter((t) => t.includes("㎡당 단가")).length, area: labels.filter((t) => /^면적 \(㎡\)/.test(t.trim())).length };
}

describe("① 함께 양도 안분 — 양도시 기준시가 칸", () => {
  it.each([
    ["재개발 APT", "redevelopment_apt", { unit: 0, area: 0 }],
    ["주택", "housing", { unit: 0, area: 0 }],
    ["상업용 건물(대조)", "commercial_building", { unit: 1, area: 1 }],
    ["토지(대조)", "land", { unit: 1, area: 1 }],
  ] as const)("%s", (_n, kind, want) => {
    const { container } = section(mk(kind), "apportioned");
    expect(areaModeCells(container)).toEqual(want);
  });
});

describe("② 부담부증여 기준시가 평가 — 양도시·취득시 기준시가 칸", () => {
  it.each([
    ["재개발 APT", "redevelopment_apt", { unit: 0, area: 0 }],
    ["주택", "housing", { unit: 0, area: 0 }],
    ["상업용 건물(대조)", "commercial_building", { unit: 2, area: 2 }],
  ] as const)("%s", (_n, kind, want) => {
    const { container } = section(mk(kind, BG), "actual");
    expect(container.querySelectorAll('[data-field="standardPriceAtAcq"]').length).toBeGreaterThan(0);
    expect(areaModeCells(container)).toEqual(want);
  });
});

describe("③ 공시가격 조회 — 재개발 APT는 공동주택(housing) 경로", () => {
  async function lookupType(kind: Kind): Promise<string | null> {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      urls.push(String(u));
      return { ok: true, json: async () => ({ success: true, price: 1, data: { price: 1 } }) } as unknown as Response;
    }));
    const { container } = section(mk(kind), "apportioned");
    const btn = Array.from(container.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes("공시가격 조회"));
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    return new URL(urls[0], "http://x").searchParams.get("propertyType");
  }
  it("재개발 APT → housing", async () => expect(await lookupType("redevelopment_apt")).toBe("housing"));
  it("주택(대조) → housing", async () => expect(await lookupType("housing")).toBe("housing"));
  it("상업용 건물(대조) → land", async () => expect(await lookupType("commercial_building")).toBe("land"));
});

describe("④ 지분별 취득시 기준시가 칸(BurdenedGiftTrancheBasisBlock)", () => {
  it("재개발 APT → 단가·면적 칸 없음 / 상업용 건물(대조) → 있음", () => {
    const run = (kind: Kind) => {
      const { container, unmount } = render(
        <BurdenedGiftTrancheBasisBlock asset={mk(kind, BG)} primaryAsset={mk(kind, BG)} onChange={() => {}} />,
      );
      const r = { std: container.querySelectorAll('[data-field="standardPriceAtAcq"]').length, ...areaModeCells(container) };
      unmount();
      return r;
    };
    const redev = run("redevelopment_apt");
    expect(redev.std).toBeGreaterThan(0);
    expect(redev.unit + redev.area).toBe(0);
    expect(run("commercial_building").unit).toBeGreaterThan(0);
  });
});
void screen;
