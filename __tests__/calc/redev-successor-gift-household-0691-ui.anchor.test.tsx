/** @vitest-environment jsdom */
/**
 * ⑤ UI — 승계조합원 카드의 「증여자와 계속 같은 세대」 선언과 종전주택 거주 칸 (사전-2020-법령해석재산-0691).
 *
 * 선언은 **증여 승계**에서만 묻는다(매매·상속 승계에는 증여자의 세대라는 사실이 없다). 종전주택 거주 칸은 선언이 「예」일 때만 열린다 —
 * 그 칸이 있어야 ④가 보내는 값이 실제로 채워진다(입력 경로 없이 엔진만 고치면 no-op).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { SuccessorMemberSection } from "@/components/calc/transfer/RedevelopmentBlockCards";
import { RedevSplitResidenceNotice, SuccessorResidenceDirectHint } from "@/components/calc/transfer/RedevAptResidenceNotices";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(() => cleanup());

const succ = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    acquisitionCause: "gift",
    acquisitionDate: "2019-06-01",
    redevSubject: "apt",
    redevApprovalDate: "2017-09-01",
    redevCompletionDate: "2020-01-01",
    redevIsSuccessorMember: "yes",
    ...over,
  }) as AssetForm;

const has = (c: HTMLElement, text: string) => (c.textContent ?? "").includes(text);

describe("⑤ 선언 노출 범위", () => {
  it("🔑 증여 승계: 선언 라디오가 보이고 종전주택 거주 칸은 아직 없다", () => {
    const { container } = render(<SuccessorMemberSection asset={succ()} onChange={() => {}} />);
    expect(has(container, "증여자와 계속 같은 세대")).toBe(true);
    expect(has(container, "증여 전 종전주택 거주기간")).toBe(false);
  });
  it("선언 「예」: 종전주택 거주 칸이 열린다", () => {
    const { container } = render(<SuccessorMemberSection asset={succ({ redevSuccessorGiftSameHousehold: "yes" })} onChange={() => {}} />);
    expect(has(container, "증여 전 종전주택 거주기간")).toBe(true);
  });
  it("선언 「아니오」: 종전주택 거주 칸은 닫힌다", () => {
    const { container } = render(<SuccessorMemberSection asset={succ({ redevSuccessorGiftSameHousehold: "no" })} onChange={() => {}} />);
    expect(has(container, "증여 전 종전주택 거주기간")).toBe(false);
  });
  it("부정 짝 — 매매·상속 승계에는 선언을 묻지 않는다", () => {
    for (const cause of ["purchase", "inheritance"] as const) {
      const { container, unmount } = render(<SuccessorMemberSection asset={succ({ acquisitionCause: cause })} onChange={() => {}} />);
      expect(has(container, "증여자와 계속 같은 세대")).toBe(false);
      unmount();
    }
  });
});

describe("⑤ 선택 patch", () => {
  it("「예」를 고르면 선언만 바뀐다", () => {
    const onChange = vi.fn();
    const { container } = render(<SuccessorMemberSection asset={succ()} onChange={onChange} />);
    const yes = container.querySelector('input[name^="redevSuccessorGiftSameHousehold-"][value="yes"]') as HTMLInputElement;
    fireEvent.click(yes);
    expect(onChange).toHaveBeenCalledWith({ redevSuccessorGiftSameHousehold: "yes" });
  });
  it("🔑 「아니오」를 고르면 통산용 종전주택 거주 값도 함께 비운다(원조합원 입력으로 조용히 이어지지 않게)", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SuccessorMemberSection asset={succ({ redevSuccessorGiftSameHousehold: "yes", redevPriorHouseResidenceMonths: "240" })} onChange={onChange} />,
    );
    const no = container.querySelector('input[name^="redevSuccessorGiftSameHousehold-"][value="no"]') as HTMLInputElement;
    fireEvent.click(no);
    expect(onChange).toHaveBeenCalledWith({
      redevSuccessorGiftSameHousehold: "no",
      redevPriorHouseResidenceMonths: "",
      redevPriorResidenceStartDate: "",
      redevPriorResidenceEndDate: "",
      redevSuccessorGiftDonorHouseMember: "",
      redevSuccessorGiftHouseholdStartDate: "",
    });
  });
});

describe("⑤ 조합원 구분 전환", () => {
  it("🔑 원조합원 → 승계조합원: 원조합원으로 입력해 둔 종전주택 거주를 비운다(증여 승계 통산에 조용히 섞이지 않게)", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SuccessorMemberSection
        asset={succ({ redevIsSuccessorMember: "no", redevPriorHouseResidenceMonths: "240", redevPriorResidenceStartDate: "2000-01-01", redevPriorResidenceEndDate: "2012-01-01" })}
        onChange={onChange}
      />,
    );
    fireEvent.click(container.querySelector('input[name^="redevIsSuccessor-"][value="yes"]') as HTMLInputElement);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        redevIsSuccessorMember: "yes",
        redevPriorHouseResidenceMonths: "",
        redevPriorResidenceStartDate: "",
        redevPriorResidenceEndDate: "",
      }),
    );
  });
});

describe("Step4 안내 — 증여 승계는 통산한다고 말한다", () => {
  it("대체 안내: giftCarry면 통산 문구 · 아니면 신축 거주만이라는 종전 문구", () => {
    const a = render(<RedevSplitResidenceNotice isSuccessor giftCarry />);
    expect(a.container.textContent).toContain("증여자와 같은 세대로서 한 종전주택 거주기간");
    expect(a.container.textContent).toContain("1세대1주택 비과세 거주요건에 쓰입니다");
    expect(a.container.textContent).toContain("장기보유특별공제 표2(대상 판정·공제율)는 본인의 신축주택 거주만 반영합니다 (대법원 2025두34935)");
    a.unmount();
    const b = render(<RedevSplitResidenceNotice isSuccessor />);
    expect(b.container.textContent).toContain("신축주택 거주기간만");
    expect(b.container.textContent).not.toContain("종전주택 거주기간과");
  });
  it("직접 입력 안내: giftCarry면 종전 거주는 ① 카드에 따로 입력한다 · 아니면 통산하지 않는다는 종전 문구", () => {
    const a = render(<SuccessorResidenceDirectHint completionDate="2020-01-01" giftCarry />);
    expect(a.container.textContent).toContain("① 재개발 카드에 따로 입력");
    a.unmount();
    const b = render(<SuccessorResidenceDirectHint completionDate="2020-01-01" />);
    expect(b.container.textContent).toContain("통산하지 않습니다");
  });
});

describe("Step4 호출부 — 두 안내 모두에 같은 술어를 넘긴다 (정적 가드)", () => {
  it("RedevSplitResidenceNotice · SuccessorResidenceDirectHint 둘 다 giftCarry={successorGiftHouseholdApplies(primary)}", () => {
    const src = readFileSync(join(process.cwd(), "app/calc/transfer-tax/steps/Step4.tsx"), "utf8");
    expect(src.match(/giftCarry=\{successorGiftHouseholdApplies\(primary\)\}/g)).toHaveLength(2);
  });
});
