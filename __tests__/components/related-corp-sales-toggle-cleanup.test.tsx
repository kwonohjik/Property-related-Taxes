/**
 * anchor(W9 · RC-E): 매출처 「특수관계 여부」를 비특수관계로 되돌리면
 * 언마운트되는 두 블록(⑩ 과세제외유형 · §⑭3호 보유비율)의 값을 **같은 patch에서** 비운다.
 *
 * 이 정리가 없으면 화면에 없는 값이 폼에 남고, ④ 게이트가 사라지는 순간 다시 엔진에 도달한다.
 * (엔진·④ 쪽 고정은 `related-corp-exclusion-sales.test.ts` · `gift-deemed-rc-exclusion-pipeline.test.ts`)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { RelatedCorpFields } from "@/components/calc/deemed-gift/related-corp-form";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/deemed-form-state";

afterEach(cleanup);

const ROW = {
  id: "s1",
  name: "D법인",
  salesAmountStr: "14000000000",
  isRelated: true,
  exclusionType: "sec10_5",
  rulingStakes: [{ shareholderId: "gap", ratioPctStr: "30" }],
};

function renderWithRow() {
  const set = vi.fn();
  const form = { ...INITIAL_DEEMED, rcSalesPartners: [ROW] } as unknown as DeemedFormState;
  const utils = render(<RelatedCorpFields form={form} set={set} />);
  return { ...utils, set };
}

describe("매출처 특수관계 토글 되돌리기", () => {
  it("[UX-0] 비특수관계로 되돌리면 exclusionType·rulingStakes가 비워진다", () => {
    const { getByLabelText, set } = renderWithRow();
    fireEvent.change(getByLabelText("매출처 1 특수관계"), { target: { value: "n" } });
    const patch = set.mock.calls.at(-1)![0] as { rcSalesPartners: (typeof ROW)[] };
    expect(patch.rcSalesPartners[0]).toMatchObject({
      isRelated: false,
      exclusionType: "",
      rulingStakes: [],
    });
  });

  it("[UX-0b] 긍정 짝 — 특수관계로 켤 때는 기존 값을 지우지 않는다", () => {
    const { getByLabelText, set } = renderWithRow();
    fireEvent.change(getByLabelText("매출처 1 특수관계"), { target: { value: "y" } });
    const patch = set.mock.calls.at(-1)![0] as { rcSalesPartners: (typeof ROW)[] };
    expect(patch.rcSalesPartners[0]).toMatchObject({
      isRelated: true,
      exclusionType: "sec10_5",
    });
    expect(patch.rcSalesPartners[0]!.rulingStakes).toHaveLength(1);
  });
});
