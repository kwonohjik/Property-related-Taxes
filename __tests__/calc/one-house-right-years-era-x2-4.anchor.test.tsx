/**
 * X2-4 anchor — 「권리 취득일부터 N년」 문구의 N은 양도일 연혁이다.
 *
 * 「소득세법 시행령」 §156의2③·④: 2006.1.1.~2008.11.27. 양도분 1년 · 2008.11.28.~2012.6.28. 2년 · 이후 3년(MST 77490·111695·290841 원문).
 * 「소득세법 시행규칙」 §75①의 「N년이 되는 날 현재」도 같은 N이다(2007.1.1.본 1년 · 2011.3.28.본 2년 · 현행 3년 — 원문 확인).
 * 엔진은 이미 N으로 판정(`resolve1562Clause3Years`)하는데 사용자 문구가 3년 고정이었다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RightThreeYearExceptionSection } from "@/components/calc/transfer/RightThreeYearExceptionSection";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { buildCaseForm } from "./one-house-rulings/harness";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";
import { article89Clause2Notices } from "@/lib/tax-engine/transfer-tax-89-2-consequences";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const redev = { id: "r", type: "redevelopment_right", acquisitionDate: "2009-03-02", region: "capital", memberOrigin: "successor", managementDisposalApprovalDate: "2008-06-01" };
const formOf = (td: string, extra: Record<string, unknown> = {}) =>
  buildCaseForm(
    mkCase(`${td.slice(0, 7)}-15`, {
      isOneHousehold: true,
      transferDate: td,
      contractTotalPrice: "600000000",
      asset: { assetKind: "housing", acquisitionDate: "2005-01-03", regionCode: "4311000000", residenceInputMode: "direct", residencePeriodMonthsAsset: "0" },
      houses: [],
      presaleRights: [redev] as never,
      ...extra,
    }),
  );
const cardText = (td: string, extra: Record<string, unknown> = {}) => {
  const { container } = render(<RightThreeYearExceptionSection form={formOf(td, extra) as unknown as TransferFormData} onChange={() => {}} />);
  return (container.textContent ?? "").replace(/\s+/g, " ");
};

describe("X2-4 판정 메뉴 — 2008.11.28.~2012.6.28. 양도분은 2년", () => {
  it("판정 보류 문구가 「2년이 지나」다", async () => {
    const o = await observeRaw(
      mkCase("2011-06-15", {
        isOneHousehold: true, transferDate: "2011-06-01", contractTotalPrice: "600000000",
        asset: { assetKind: "housing", acquisitionDate: "2005-01-03", regionCode: "4311000000", residenceInputMode: "direct", residencePeriodMonthsAsset: "0" },
        presaleRights: [redev],
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reason = (o.j?.undetermined ?? []).find((u: any) => u.id === "89-2-three-year-exception-undeclared")?.reason ?? "";
    expect(reason).toContain("권리 취득일부터 2년이 지나");
    expect(reason).not.toContain("3년이 지나");
  });
  it("카드: 2년으로 일관 — 같은 카드에 2년과 3년이 섞이지 않는다", () => {
    const t = cardText("2011-06-01");
    expect(t).toContain("권리 취득 후 2년이 지나 양도");
    expect(t).toContain("취득한 날부터 2년 이내에 양도하면 예외");
    expect(t).toContain("2년을 넘긴 경우");
    expect(t).not.toMatch(/3년/);
  });
  it("카드: 경매·공매 갈래의 「N년이 되는 날 현재」(시행규칙 §75①)도 2년", () => {
    const t = cardText("2011-06-01", { rightThreeYearExceptionKind: "delay" });
    expect(t).toContain("경매·공매 등으로 2년 내 양도하지 못했다");
    expect(t).toContain("2년이 되는 날 현재의 사유");
    expect(t).not.toMatch(/3년/);
  });
  it("⑧ 사유 미선택 메시지도 2년", () => {
    const f = formOf("2011-06-01", { rightThreeYearExceptionKind: "delay", rightDisposalDelayReason: "" });
    const m = validateAllSteps(f).find((e) => e.field === "rightDisposalDelayReason")?.message ?? "";
    expect(m).toContain("2년이 되는 날 현재의 사유");
  });
});

describe("X2-4 긍정 짝 — 현행(2012.6.29. 이후)은 3년", () => {
  it("카드·⑧", () => {
    const t = cardText("2024-06-01", { presaleRights: [{ ...redev, acquisitionDate: "2020-03-02" }] });
    expect(t).toContain("권리 취득 후 3년이 지나 양도");
    expect(t).not.toMatch(/2년이 지나|2년 이내에 양도하면/);
  });
});

describe("X2-4 계산기 고지 leaf — 양도일 연혁", () => {
  const clause2 = { status: "excluded", undeclaredArticles: ["소득세법 시행령 §156의2 ④", "소득세법 시행규칙 §75 ①"] } as never;
  const gate = { coreWouldPass: true, surchargeDeclarationMatters: false };
  it("2011-06-01 → 2년", () => {
    expect(article89Clause2Notices(clause2, false, new Date("2011-06-01"), gate)[0]).toContain("취득일부터 2년이 지나");
  });
  it("2007-06-01 → 1년", () => {
    expect(article89Clause2Notices(clause2, false, new Date("2007-06-01"), gate)[0]).toContain("취득일부터 1년이 지나");
  });
  it("2024-06-01 → 3년", () => {
    expect(article89Clause2Notices(clause2, false, new Date("2024-06-01"), gate)[0]).toContain("취득일부터 3년이 지나");
  });
});
