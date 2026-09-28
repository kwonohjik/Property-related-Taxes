/** @vitest-environment jsdom */
/**
 * L-12 ⑤ — 「청산금분 양도일 현재 1세대1주택」 입력 경로
 *
 * 세대 입력(`isOneHouseSingle`)은 **신축주택 양도일**의 사실이다. 동시신고에서 청산금분 양도일
 * (소유권이전 고시일 다음날)이 그와 다르면 그 날의 1주택 여부를 따로 물어야 하고
 * (사전-2022-법규재산-1282), 세대 입력이 1주택이 아니어도 청산금분은 그 날 1주택일 수 있으므로
 * ③-c 카드가 열려야 한다(열리지 않으면 입력 경로가 없다 — `feedback_ui_gate_removes_sole_input_path`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function simultaneous(o: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    acquisitionDate: "2001-01-01",
    redevApprovalDate: "2014-02-01",
    redevRightsValue: "800000000",
    redevSettlementDirection: "receive",
    redevSettlementAmount: "200000000",
    redevSettlementSaleDate: "2020-06-01",
    redevReceiveOnlyMode: "",
    ...o,
  };
}

const TID = "redev-one-house-at-settlement-sale";

describe("L-12 · 청산금분 양도일 1세대1주택 입력", () => {
  it("🔑 세대 입력이 1주택이 아니어도(신축 양도일 2주택) 두 날이 다르면 카드와 질문이 열린다", () => {
    render(
      <RedevelopmentBlock asset={simultaneous()} onChange={() => {}} isOneHouseSingle={false} transferDate="2022-03-01" />,
    );
    expect(screen.queryByTestId(TID)).not.toBeNull();
  });

  it("부정 짝 — 두 날이 같고 세대 입력이 1주택이 아니면 카드가 닫힌다(종전 동작)", () => {
    render(
      <RedevelopmentBlock
        asset={simultaneous({ redevSettlementSaleDate: "2022-03-01" })}
        onChange={() => {}}
        isOneHouseSingle={false}
        transferDate="2022-03-01"
      />,
    );
    expect(screen.queryByTestId(TID)).toBeNull();
  });

  it("단독신고는 묻지 않는다 — 양도일이 곧 청산금분 양도일이다", () => {
    render(
      <RedevelopmentBlock
        asset={simultaneous({ redevReceiveOnlyMode: "yes" })}
        onChange={() => {}}
        isOneHouseSingle={true}
        transferDate="2020-06-01"
      />,
    );
    expect(screen.queryByTestId(TID)).toBeNull();
  });

  it("선택하면 그 필드 하나만 patch한다", () => {
    const onChange = vi.fn();
    render(
      <RedevelopmentBlock asset={simultaneous()} onChange={onChange} isOneHouseSingle={true} transferDate="2022-03-01" />,
    );
    const group = screen.getByTestId(TID);
    const yes = group.querySelector('input[type="radio"][value="yes"]') as HTMLInputElement;
    fireEvent.click(yes);
    expect(onChange).toHaveBeenCalledWith({ redevOneHouseAtSettlementSale: "yes" });
  });
});
