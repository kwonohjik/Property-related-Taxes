/**
 * anchor — §127⑦ 택일 배너(⑤ 패널)의 라벨 뒤 조사 (1단계 브라우저 확인 2026-11-09)
 *
 * 종전: 「{라벨}」는 고정 — 「§98의2 — 지방 미분양 일반세율」는 · 「§99 — …감면」는 처럼 받침 있는 라벨에서 틀렸다.
 * 라벨이 조문마다 달라 코드베이스 관례(`은(는)`)를 쓴다. ⑧ 메시지 쪽은
 * `__tests__/components/calc/results/transfer/lthd-982-table2-display.anchor.test.ts`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

afterEach(cleanup);

describe("§127⑦ 택일 배너 — 라벨 뒤 조사는 「은(는)」", () => {
  it("§98의2 + §99", () => {
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2010-03-01",
      reductions: [getReductionDefault("unsold_98_2"), getReductionDefault("new_99")] as unknown as AssetReductionForm[],
    } as AssetForm;
    render(<UnifiedReductionPanel asset={asset} transferDate="2024-03-01" onChange={() => {}} />);
    const t = document.body.textContent ?? "";
    expect(t).toContain("조특법 §127⑦ — 두 감면은 택일입니다");
    expect(t).toContain("」은(는) 장기보유특별공제 표2·일반세율 특례");
    expect(t).toContain("」은(는) 양도소득금액 차감 방식입니다");
    expect(t).not.toMatch(/」는 /);
  });
});
