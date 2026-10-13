/** @vitest-environment jsdom */
/**
 * G3-4 ⑤ — 토지만 출자한 원조합원의 완공APT는 ② 「출자 자산」 카드에 **사용승인일(사용승인서 교부일)** 칸이 열린다.
 * #12 — 「조합원 분양계약일」 칸은 없다: 입주권 전환일은 관리처분계획 인가일이다(원조합원에게 분양계약일 개념이 없다 — 2026-10-13).
 *
 * 칸이 없으면 ⑧·⑫가 필수로 막는데 채울 곳이 없다(`feedback_ui_gate_removes_sole_input_path`). 승계조합원의 같은 이름
 * 칸(`SuccessorMemberSection`)과 겹쳐 두 개가 뜨지 않는지도 본다 — 한 필드(`redevCompletionDate`)를 두 곳에서 받는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

// #12 — 칸 이름이 「사용승인일 (… 임시사용승인·사실상 사용이 먼저면 그날)」로 바뀌었다(취득시기 §162①4호 단서).
const LABEL = "사용승인일 (사용승인서 교부일";
const CONTRACT_LABEL = "조합원 분양계약일";
const SUCCESSOR_LABEL = "준공일 (사용검사필증 교부일)";

function apt(o: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    acquisitionDate: "2007-02-01",
    redevApprovalDate: "2014-01-23",
    redevSettlementDirection: "pay",
    redevOriginalAssetType: "land",
    redevIsSuccessorMember: "no",
    ...o,
  };
}

const has = (c: HTMLElement, text: string) => (c.textContent ?? "").includes(text);

describe("G3-4 ⑤ — 준공일 칸의 노출 게이트", () => {
  it("🔑 토지 출자 + 원조합원 완공APT — 칸이 열린다", () => {
    const { container } = render(<RedevelopmentBlock asset={apt()} onChange={() => {}} isOneHouseSingle={true} />);
    expect(has(container, LABEL)).toBe(true);
    expect(has(container, SUCCESSOR_LABEL)).toBe(false); // 승계 전용 칸과 중복되지 않는다
  });

  it("부정 짝 — 주택 출자 원조합원에는 칸이 없다(§154⑧1호 통산 — 종전주택 취득일 기산)", () => {
    const { container } = render(
      <RedevelopmentBlock asset={apt({ redevOriginalAssetType: "housing" })} onChange={() => {}} isOneHouseSingle={true} />,
    );
    expect(has(container, LABEL)).toBe(false);
  });

  it("부정 짝 — 입주권 양도에는 칸이 없다(완공 전 권리 양도)", () => {
    const { container } = render(
      <RedevelopmentBlock
        asset={apt({ assetKind: "right_to_move_in", redevSubject: "right" })}
        onChange={() => {}}
        isOneHouseSingle={true}
      />,
    );
    expect(has(container, LABEL)).toBe(false);
  });

  it("부정 짝 — 청산금 단독신고에는 칸이 없다(신축주택을 양도하지 않는다)", () => {
    const { container } = render(
      <RedevelopmentBlock
        asset={apt({ redevSettlementDirection: "receive", redevReceiveOnlyMode: "yes", redevSettlementSaleDate: "2024-06-01" })}
        onChange={() => {}}
        isOneHouseSingle={true}
      />,
    );
    expect(has(container, LABEL)).toBe(false);
  });

  it("승계조합원은 종전 칸(사용검사필증)만 — 새 칸과 겹치지 않는다", () => {
    const { container } = render(
      <RedevelopmentBlock asset={apt({ redevIsSuccessorMember: "yes" })} onChange={() => {}} isOneHouseSingle={true} />,
    );
    expect(has(container, SUCCESSOR_LABEL)).toBe(true);
    expect(has(container, LABEL)).toBe(false);
  });
});

describe("#12 ⑤ — 조합원 분양계약일 칸은 어느 축에도 없다 (전환일 = 인가일)", () => {
  it("🔑 토지 출자 원조합원 완공APT에도, 그 밖의 축에도 뜨지 않는다", () => {
    for (const o of [
      {},
      { redevOriginalAssetType: "housing" as const },
      { assetKind: "right_to_move_in" as const, redevSubject: "right" as const },
      { redevSettlementDirection: "receive" as const, redevReceiveOnlyMode: "yes" as const, redevSettlementSaleDate: "2024-06-01" },
      { redevIsSuccessorMember: "yes" as const },
    ]) {
      const { container, unmount } = render(<RedevelopmentBlock asset={apt(o)} onChange={() => {}} isOneHouseSingle={true} />);
      expect(has(container, CONTRACT_LABEL)).toBe(false);
      unmount();
    }
  });
});

describe("#12 ⑤ — 거주 분리 입력: 토지 출자는 종전주택 거주 칸이 없다 (엔진이 신축 거주만 읽는다)", () => {
  it("🔑 토지 출자 + 원조합원 완공APT — 신축주택 거주만, 종전주택 거주 칸 없음", () => {
    const { container } = render(<RedevelopmentBlock asset={apt()} onChange={() => {}} isOneHouseSingle={true} />);
    // 거주 그룹마다 「입주일」 칸이 하나씩 — 종전 그룹이 빠지면 1개(신축)만 남는다.
    expect(screen.getAllByText("입주일").length).toBe(1);
    expect(has(container, "신축주택 거주기간")).toBe(true);
  });
  it("긍정 짝 — 주택 출자 원조합원은 종전주택 거주 칸이 그대로 있다(§154⑧1호 통산)", () => {
    const { container } = render(
      <RedevelopmentBlock asset={apt({ redevOriginalAssetType: "housing" })} onChange={() => {}} isOneHouseSingle={true} />,
    );
    expect(screen.getAllByText("입주일").length).toBe(2);
  });
});
