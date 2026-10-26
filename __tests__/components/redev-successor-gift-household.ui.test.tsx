/**
 * ⑤ 렌더 anchor — 승계조합원 완공APT 증여 승계의 세대 사실 칸(계획서 `docs/00-pm/redev-successor-gift-holding.plan.md` Q-1 a).
 * 증여자 유형 질문은 「같은 세대 = 예」에서, 세대 보유 시작일은 증여자 유형 「예」에서만 열린다 — ④⑧과 같은 술어.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { RedevSuccessorGiftHouseholdSection } from "@/components/calc/transfer/RedevSuccessorGiftHouseholdSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { radioValues, checkedRadioValue } from "./_helpers/radio-values";

afterEach(() => cleanup());

const asset = (over: Record<string, unknown>) =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    redevIsSuccessorMember: "yes",
    acquisitionCause: "gift",
    acquisitionDate: "2020-01-01",
    ...over,
  }) as unknown as AssetForm;

describe("⑤ 증여 승계 세대 사실 칸", () => {
  it("같은 세대 미답 — 증여자 유형·시작일 칸 없음", () => {
    const { container } = render(<RedevSuccessorGiftHouseholdSection asset={asset({})} onChange={() => {}} />);
    expect(radioValues(container, "redevSuccessorGiftSameHousehold")).toEqual(["yes", "no"]);
    expect(container.querySelectorAll('input[name^="redevSuccessorGiftDonorHouseMember"]').length).toBe(0);
    expect(container.textContent).not.toContain("세대가 종전주택 보유를 시작한 날");
  });

  it("같은 세대 = 예 — 증여자 유형 질문(예/아니오) · 시작일은 아직 없음", () => {
    const { container } = render(
      <RedevSuccessorGiftHouseholdSection asset={asset({ redevSuccessorGiftSameHousehold: "yes" })} onChange={() => {}} />,
    );
    expect(radioValues(container, "redevSuccessorGiftDonorHouseMember")).toEqual(["yes", "no"]);
    expect(container.textContent).not.toContain("세대가 종전주택 보유를 시작한 날");
    expect(container.textContent).toContain("증여 전 종전주택 거주기간");
  });

  it("증여자 유형 = 예 — 세대 보유 시작일 칸", () => {
    const { container } = render(
      <RedevSuccessorGiftHouseholdSection
        asset={asset({ redevSuccessorGiftSameHousehold: "yes", redevSuccessorGiftDonorHouseMember: "yes" })}
        onChange={() => {}}
      />,
    );
    expect(checkedRadioValue(container, "redevSuccessorGiftDonorHouseMember")).toBe("yes");
    expect(container.textContent).toContain("세대가 종전주택 보유를 시작한 날");
  });

  it("증여자 유형 = 아니오를 고르면 시작일을 비운다 · 같은 세대 = 아니오면 증여자 유형·시작일도 비운다", () => {
    const onChange = vi.fn();
    const { container } = render(
      <RedevSuccessorGiftHouseholdSection
        asset={asset({ redevSuccessorGiftSameHousehold: "yes", redevSuccessorGiftDonorHouseMember: "yes", redevSuccessorGiftHouseholdStartDate: "2008-01-01" })}
        onChange={onChange}
      />,
    );
    fireEvent.click(container.querySelector('input[name^="redevSuccessorGiftDonorHouseMember"][value="no"]')!);
    expect(onChange).toHaveBeenLastCalledWith({ redevSuccessorGiftDonorHouseMember: "no", redevSuccessorGiftHouseholdStartDate: "" });
    fireEvent.click(container.querySelector('input[name^="redevSuccessorGiftSameHousehold"][value="no"]')!);
    expect(onChange.mock.lastCall?.[0]).toMatchObject({
      redevSuccessorGiftSameHousehold: "no",
      redevSuccessorGiftDonorHouseMember: "",
      redevSuccessorGiftHouseholdStartDate: "",
    });
  });

  it("매매 승계·원조합원 — 아무것도 그리지 않는다", () => {
    expect(render(<RedevSuccessorGiftHouseholdSection asset={asset({ acquisitionCause: "purchase" })} onChange={() => {}} />).container.innerHTML).toBe("");
    cleanup();
    expect(render(<RedevSuccessorGiftHouseholdSection asset={asset({ redevIsSuccessorMember: "no" })} onChange={() => {}} />).container.innerHTML).toBe("");
  });
});
