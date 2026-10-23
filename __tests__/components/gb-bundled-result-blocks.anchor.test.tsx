/**
 * 함께 양도 일반건물 — 결과 카드 블록 7종 자산별 표시 (2026-10-23)
 *
 * 계획서: `docs/00-pm/gb-bundled-result-blocks.plan.md` (Q-1 a 자산별 묶음 · Q-2 a 3-way 결손 통산 합계 계산 · Q-3 a 함께 양도만).
 * 폼 → ④ → route POST(mock 세율) → `BundledAllocationCard` 렌더.
 *
 * - 함께 양도 일반건물 블록 6종이 「일반건물 — {자산}」 소제목 아래 **단건과 같은 문장·금액**으로 뜬다(종전: 전부 미표시).
 *   일반건물이 첫 자산이든 둘째 자산이든 같다.
 * - §163⑨ 파트 값은 그 자산의 파트 카드 값이다 — 안분 표 행은 함께 양도에서 자산 단위라 파트 값이 아니다(C-2).
 * - 3-way 표: 결손이 다른 자산으로 넘어가면 통산 합계 칸이 실제 합(+90,227,707)이고 각주가 바뀐다(C-4). 단건은 0 그대로.
 * - 신고서 표·상세명세서의 구분 기재 미입력 안내도 함께 양도에서 나온다.
 * - 결정세액·수정신고 판별 불변 · 지분 분할(축 B)에는 실가 블록 echo를 싣지 않는다(Q-3 a).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { collectSaleSplitUnenteredNotices } from "@/components/calc/results/transfer/sale-split-unentered-notice";
import { classifyAmendableTransfer } from "@/lib/calc/transfer-amendment-entry";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  GB_SAMPLES,
  LAND,
  T,
  asset,
  bundledForm,
  form,
  run,
  singleForm,
  type GbSample,
  type RunResult,
} from "./_helpers/gb-bundled-blocks-fixtures";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const renderCard = (r: RunResult, f: TransferFormData) =>
  render(<BundledAllocationCard apportionment={r.apportionment} aggregated={r.aggregated} formData={f} />);
/** 그 자산의 블록 묶음 텍스트 — 소제목을 떼어 단건과 비교한다. */
const blocksText = (testId: string, heading?: string) => {
  const t = screen.getByTestId(testId).textContent ?? "";
  return heading ? t.replace(heading, "") : t;
};
const threeWay = () => screen.getByText(/일반건물 3-자산 요약/).closest("div.rounded-lg") as HTMLElement;

const BLOCK_SAMPLES: GbSample[] = ["S100-est", "S100-act", "INH", "INH-C2", "PRE", "CONV", "UNENT-act", "SWAP"];

describe("블록 6종 — 함께 양도 자산별 묶음 = 단건", () => {
  it.each(BLOCK_SAMPLES)("%s — 일반건물이 첫 자산이든 둘째 자산이든 단건 블록과 같은 텍스트", async (s) => {
    const sf = singleForm(s);
    renderCard(await run(sf), sf);
    const single = blocksText("gb-result-blocks");
    expect(single.length).toBeGreaterThan(0);
    cleanup();

    const f1 = bundledForm(s, true);
    renderCard(await run(f1), f1);
    expect(screen.getByText("일반건물 — 주 자산")).toBeInTheDocument();
    expect(blocksText("gb-result-blocks-primary", "일반건물 — 주 자산")).toBe(single);
    cleanup();

    const f2 = bundledForm(s, false);
    const r2 = await run(f2);
    renderCard(r2, f2);
    const id = f2.assets[1].assetId;
    const label = r2.apportionment.apportioned.find((a) => a.assetId === id)!.assetLabel;
    expect(blocksText(`gb-result-blocks-${id}`, `일반건물 — ${label}`)).toBe(single);
  });

  it("§163⑨ 파트 값은 파트 카드 값 — 주 자산 안분 행 값(300,000,000 한 줄)이 아니다", async () => {
    const f = bundledForm("INH");
    const r = await run(f);
    expect(r.apportionment.apportioned.find((a) => a.assetId === "primary")!.assetKind).toBe("land");
    renderCard(r, f);
    const block = within(screen.getByTestId("gb-result-blocks-primary"));
    expect(block.getByText(/토지분 취득가액/).closest("li")!.textContent).toBe("토지분 취득가액(상속개시일 평가액)300,000,000");
    expect(block.getByText(/건물분 취득가액/).closest("li")!.textContent).toBe("건물분 취득가액(상속개시일 평가액)150,000,000");
  });

  it("§97②2호 단서 — 자산별 비교값 269,553,853 < 510,000,000", async () => {
    const f = bundledForm("SWAP");
    const r = await run(f);
    expect(r.aggregated.swapApplied).toBeUndefined();
    expect(r.aggregated.generalBuildingDetailsByAsset?.primary.swapComparison).toEqual({
      estimatedSide: 269_553_853, directSide: 510_000_000, chosen: "direct",
    });
  });

  it("일반건물 둘 + 토지 → 블록이 자산별로 섞이지 않는다", async () => {
    const f = form(T * 2 + 300_000_000, [asset(1, ...GB_SAMPLES["EXT-LOSS"][0]), asset(2, ...GB_SAMPLES.INH[0]), asset(3, LAND)], {
      assetSplitMode: "companion", bundledSaleMode: "actual",
    } as Partial<TransferFormData>);
    const r = await run(f);
    expect(r.status).toBe(200);
    renderCard(r, f);
    const second = f.assets[1].assetId;
    expect(screen.queryByTestId("gb-result-blocks-primary")).toBeNull(); // 주 자산(증축 실가 매매)은 블록 6종 해당 없음
    expect(screen.getByTestId(`gb-result-blocks-${second}`).textContent).toContain("§163⑨");
    expect(screen.getAllByText(/일반건물 3-자산 요약/)).toHaveLength(1); // 증축은 주 자산뿐
    expect(threeWay().textContent).toContain("— 주 자산");
  });
});

describe("3-way 표 — 자산별 · 결손 통산 합계(Q-2 a)", () => {
  it("증축 → 통산 전 행까지는 단건 표와 같다 · 증축분 결손 7,513,329 중 1,455,530이 함께 양도 토지로 넘어간다", async () => {
    const sf = singleForm("EXT3");
    renderCard(await run(sf), sf);
    const single = threeWay().textContent!;
    cleanup();
    const f = bundledForm("EXT3");
    renderCard(await run(f), f);
    const bundled = threeWay().textContent!.replace(" — 주 자산", "");
    const beforeOffset = (t: string) => t.slice(0, t.indexOf("결손 통산 (영§102②)"));
    expect(beforeOffset(bundled)).toBe(beforeOffset(single));
    expect(single).toContain("결손 통산 (영§102②)△6,944,851△568,478+7,513,3290통산 후");
    // 5,599,450 + 458,349 + 1,455,530 = 7,513,329
    expect(bundled).toContain("결손 통산 (영§102②)△5,599,450△458,349+7,513,329+1,455,530통산 후");
  });

  it("단건 결손 → 통산 합계 0 · 「통산 전후 동일」 각주 그대로", async () => {
    const sf = singleForm("EXT-LOSS");
    renderCard(await run(sf), sf);
    const t = threeWay().textContent!;
    expect(t).toContain("+429,821,909+7,513,3290통산 후");
    expect(t).toContain("양도소득금액 합계는 통산 전후 동일하지만");
  });

  it("🔴 함께 양도 결손이 다른 자산으로 넘어감 → 합계 +90,227,707 · 각주 교체(종전 하드코딩 0은 거짓)", async () => {
    const f = bundledForm("EXT-LOSS");
    renderCard(await run(f), f);
    const t = threeWay().textContent!;
    expect(t).toContain("결손 통산 (영§102②)△347,107,531+429,821,909+7,513,329+90,227,707");
    expect(t).toContain("결손 중 90,227,707은 함께 양도한 다른 자산의 양수 소득에 흡수되어");
    expect(t).not.toContain("통산 전후 동일");
  });
});

describe("구분 기재 미입력 안내 — 신고서 표·상세명세서(모음 함수)", () => {
  it("함께 양도 일반건물 → 자산 라벨을 붙여 한 줄", async () => {
    const f = bundledForm("UNENT-act");
    const r = await run(f);
    expect(collectSaleSplitUnenteredNotices({ formData: f, aggregate: { properties: r.aggregated.properties, aggregated: r.aggregated } })).toEqual([
      "주 자산: 구분 기재를 선택했으나 토지·건물 양도가액이 입력되지 않아 양도시 기준시가 비율로 안분했습니다 (소득세법 시행령 §166 ⑥)",
    ]);
  });

  it("구분 기재를 고르지 않았으면 echo가 있어도 안 뜬다(그 자산의 폼을 본다)", async () => {
    const f = bundledForm("UNENT-act");
    f.assets[0].saleSplitMode = "apportioned";
    const r = await run(f);
    expect(r.aggregated.generalBuildingDetailsByAsset?.primary.saleApportionBasisKind).toBe("std_price");
    expect(collectSaleSplitUnenteredNotices({ formData: f, aggregate: { properties: r.aggregated.properties, aggregated: r.aggregated } })).toEqual([]);
  });
});

describe("불변", () => {
  it("결정세액 · 수정신고 판별 \"bundled\"", async () => {
    const taxes: Partial<Record<GbSample, number>> = { "S100-act": 322_530_000, INH: 366_630_000, SWAP: 147_621_100, EXT3: 298_063_320 };
    for (const [s, tax] of Object.entries(taxes) as [GbSample, number][]) {
      const f = bundledForm(s);
      const r = await run(f);
      expect(r.aggregated.determinedTax).toBe(tax);
      expect(r.aggregated.generalBuildingValuationDetail).toBeUndefined();
      expect(classifyAmendableTransfer({ taxType: "transfer", resultData: r.data, inputData: f } as never)).toBe("bundled");
    }
  });

  it("지분 분할(축 B) 실가 → 판정·상속 표지를 싣지 않는다(Q-3 a — 지분마다 다르다)", async () => {
    for (const s of ["S100-act", "INH"] as const) {
      const over = GB_SAMPLES[s][0];
      const f = form(T, [asset(1, ...over, { ownershipNumerator: "50" }), asset(2, ...over, { ownershipNumerator: "50", acquisitionDate: "1990-05-01", landAcquisitionDate: "1990-05-01" })], {
        assetSplitMode: "fractional",
      } as Partial<TransferFormData>);
      const r = await run(f);
      expect(r.status).toBe(200);
      const d = r.aggregated.generalBuildingValuationDetail!;
      expect(d.assetCards.map((c) => c.propertyId)).toEqual(["land#0", "building#0", "land#1", "building#1"]);
      expect(d.saleSplitJudgment).toBeUndefined();
      expect(d.acquisitionByInheritance).toBeUndefined();
      expect(d.buildingAcquisitionByInheritance).toBeUndefined();
    }
  });
});
