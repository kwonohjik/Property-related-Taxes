/**
 * ⑤ 「상증법」§4의2①·③ 공통 토글 — 상세 입력 모달 (7-12).
 *
 * 라이브러리 anchor(`commonForProfitDoneeGateApplies`)는 모달이 그 술어를 **실제로 쓰는지**
 * 증명하지 못한다. 모달이 노출을 따로 판단하면 엔진·API와 두 개의 진실이 생긴다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DeemedDetailModal } from "@/components/calc/deemed-gift/DeemedDetailModal";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

afterEach(cleanup);

const renderFor = (type: DeemedFormState["type"], set = vi.fn()) => {
  render(<DeemedDetailModal open onOpenChange={() => {}} form={{ ...INITIAL_DEEMED, type } as DeemedFormState} set={set} />);
  return set;
};

describe("⑤ 상세 입력 모달 — 영리법인 수증자 공통 토글", () => {
  it.each(["bargain_transfer", "insurance", "acquisition_fund_presumption"] as DeemedFormState["type"][])(
    "[FPU-1] %s — 토글이 보인다",
    (type) => {
      renderFor(type);
      expect(screen.getByTestId("deemed-donee-for-profit-corp")).toBeTruthy();
    },
  );

  it.each(["merger", "nominee_trust", "specific_corp", "capital_increase"] as DeemedFormState["type"][])(
    "[FPU-2] 긍정 짝: %s — 공통 토글이 없다 (명부형·§4의2②·자체 규정·자체 토글)",
    (type) => {
      renderFor(type);
      expect(screen.queryByTestId("deemed-donee-for-profit-corp")).toBeNull();
    },
  );

  it("[FPU-3] 토글을 누르면 공통 필드가 켜진다 — §39 축(ci*)을 건드리지 않는다", () => {
    const set = renderFor("bargain_transfer");
    fireEvent.click(screen.getByRole("switch", { name: /수증자가 영리법인/ }));
    expect(set).toHaveBeenCalledWith({ doneeIsForProfitCorp: true });
  });
});
