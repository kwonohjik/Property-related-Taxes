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
  exclusionTypes: ["sec10_5"],
  beneficiaryStakePctStr: "",
  intermediaryCorpShareholderId: "",
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
      exclusionTypes: [],
      rulingStakes: [],
    });
  });

  it("[UX-1] §⑩3호를 고른 행에서만 「수혜법인 보유비율」 칸이 렌더된다", () => {
    const set = vi.fn();
    const base = { ...INITIAL_DEEMED } as unknown as DeemedFormState;
    const withType = (t: string) =>
      render(
        <RelatedCorpFields
          form={{ ...base, rcSalesPartners: [{ ...ROW, exclusionTypes: [t], beneficiaryStakePctStr: "" }] } as unknown as DeemedFormState}
          set={set}
        />,
      );
    expect(withType("sec10_3").queryByTestId("rc-sales-benef-stake-0")).not.toBeNull();
    cleanup();
    // 2호는 전액 제외라 곱할 비율이 없다 — 칸이 있으면 «쓰이지 않는 값»을 받게 된다
    expect(withType("sec10_2").queryByTestId("rc-sales-benef-stake-0")).toBeNull();
  });

  it("[UX-0b] 긍정 짝 — 특수관계로 켤 때는 기존 값을 지우지 않는다", () => {
    const { getByLabelText, set } = renderWithRow();
    fireEvent.change(getByLabelText("매출처 1 특수관계"), { target: { value: "y" } });
    const patch = set.mock.calls.at(-1)![0] as { rcSalesPartners: (typeof ROW)[] };
    expect(patch.rcSalesPartners[0]).toMatchObject({
      isRelated: true,
      exclusionTypes: ["sec10_5"],
    });
    expect(patch.rcSalesPartners[0]!.rulingStakes).toHaveLength(1);
  });
});
