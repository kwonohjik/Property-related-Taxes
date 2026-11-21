/**
 * 결과뷰 리뷰 2026-11-21 R-c07-03 (MAJOR) — 일반건물 §163⑨ 상속 블록(`GbResultBlocks`)의 파트 라벨이 카드 echo `sec1639Basis.adopted`를 따른다.
 *
 * 종전: 라벨을 추계 여부(`converted`)만 보고 골라, 영 §163⑨ 단서(영 §164④ 토지 · §164⑤ 건물 가액)가 채택된 파트도
 * 「(상속개시일 평가액)」으로 적었다 — INH 시료(1988 상속 · 건물 평가액 1억 < §164⑤ 가액 1.5억)에서 「건물분 취득가액(상속개시일 평가액) 150,000,000」.
 * 같은 값을 상세명세서는 「§164⑤ 가액 — 같은 영 §163⑨ 단서 2호」로 적는다(#2508). 폼 → ④ → route(mock 세율) → 블록 렌더.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { GbResultBlocks } from "@/components/calc/results/transfer/GbResultBlocks";
import { gbBlockViewsOf } from "@/components/calc/results/transfer/gb-result-block-views";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { GB_SAMPLES, T, asset, form, run, singleForm } from "./_helpers/gb-bundled-blocks-fixtures";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

async function block(f: TransferFormData) {
  const r = await run(f);
  expect(r.status).toBe(200);
  const [view] = gbBlockViewsOf(r.aggregated, r.apportionment, f);
  const { container } = render(<GbResultBlocks view={view} />);
  return { text: container.textContent ?? "", rows: [...container.querySelectorAll("li")].map((li) => li.textContent) };
}

describe("R-c07-03 — §163⑨ 블록 라벨 = 카드 echo 채택", () => {
  it("단건 INH — 토지 평가액(본문) · 건물 영 §164 가액(단서 2호) · 단서 문장은 2호만 인용", async () => {
    const { text, rows } = await block(singleForm("INH"));
    expect(rows).toEqual(["토지분 취득가액(상속개시일 평가액)300,000,000", "건물분 취득가액(영 §164 가액)150,000,000"]);
    expect(text).toContain(`평가액과 영 §164 가액(취득당시 기준시가) 중 많은 금액으로 합니다(${TRANSFER.INHERITED_AFTER_DEEMED_BUILDING_MAX}).`);
    expect(text).not.toContain(TRANSFER.INHERITED_AFTER_DEEMED_LAND_MAX);
  });

  it("축 B 지분 50%+50% — 지분 파트 카드 echo로 · 건물 지분 7,500만(= 1.5억 × 50%)은 영 §164 가액", async () => {
    const half = { ownershipNumerator: "50", ownershipDenominator: "100" };
    const INH = GB_SAMPLES.INH[0][0];
    const { rows } = await block(form(T, [asset(1, INH, half), asset(2, INH, half)]));
    expect(rows).toEqual([
      "자산 1 (지분 50%) 토지분 취득가액(상속개시일 평가액)150,000,000",
      "자산 1 (지분 50%) 건물분 취득가액(영 §164 가액)75,000,000",
      "자산 2 (지분 50%) 토지분 취득가액(상속개시일 평가액)150,000,000",
      "자산 2 (지분 50%) 건물분 취득가액(영 §164 가액)75,000,000",
    ]);
  });

  it("(긍정 짝) 평가액이 이기면 「(상속개시일 평가액)」 · 단서 문장 없음", async () => {
    const { text, rows } = await block(form(T, [asset(1, GB_SAMPLES.INH[0][0], { gbBuildingInheritedValue: "300000000" })]));
    expect(rows).toEqual(["토지분 취득가액(상속개시일 평가액)300,000,000", "건물분 취득가액(상속개시일 평가액)300,000,000"]);
    expect(text).not.toContain("영 §164 가액(취득당시 기준시가)");
  });
});
