/**
 * anchor: 2022.1.1. 전 양도 겸용 차단 오류(`field: "isMixedUseHouse"`)가 이동할 입력칸 앵커가 «겸용주택 분리계산» 토글에 있다.
 *
 * 계획서: `docs/00-pm/transfer-nbl-deferral-derived-followups.plan.md` F-3. 오류의 해법이 «토글을 끄라»이므로 그 토글로 보낸다 —
 * 앵커가 없으면 오류 목록의 «입력칸으로 이동»이 아무 데도 가지 않는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MixedUseToggleRow } from "@/components/calc/transfer/MixedUseSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

describe("겸용주택 분리계산 토글 — 입력칸 앵커", () => {
  it('data-field="isMixedUseHouse"가 토글 루트에 하나 있다', () => {
    const asset = { ...makeDefaultAsset(1), assetKind: "housing", isMixedUseHouse: true } as AssetForm;
    const { container } = render(<MixedUseToggleRow asset={asset} onChange={() => {}} />);
    const anchors = container.querySelectorAll('[data-field="isMixedUseHouse"]');
    expect(anchors).toHaveLength(1);
    expect(anchors[0].textContent).toContain("겸용주택 분리계산");
  });
});
