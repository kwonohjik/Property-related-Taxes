/**
 * X2-2 anchor — 3년 경과 예외 카드·⑧ 메시지의 인용은 **권리 종류**를 따른다.
 *
 * 「소득세법 시행령」 §156의2④는 조합원입주권, §156의3③은 분양권이다(MST 290841 원문). 엔진(`timingFrom`)은 권리 종류로
 * `RIGHT_3YR_EXCEPTION_156_2_4` / `PRESALE_3YR_EXCEPTION_156_3_3`을 가르는데 카드·⑧은 §156의2④만 적어, 같은 판정의
 * 결과 고지(§156의3③)와 어긋났다. 상속 분양권 카드 설명도 §156의2⑥·⑦만 적었다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RightThreeYearExceptionSection } from "@/components/calc/transfer/RightThreeYearExceptionSection";
import { InheritedRightExceptionSection } from "@/components/calc/transfer/InheritedRightExceptionSection";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { buildCaseForm } from "./one-house-rulings/harness";
import { mkCase } from "./_one-house-pr3a-judge-route";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

type RightSeed = Record<string, unknown>;
const formOf = (rights: RightSeed[], extra: Record<string, unknown> = {}) =>
  buildCaseForm(
    mkCase("2024-06-02", {
      isOneHousehold: true,
      transferDate: "2024-06-01",
      contractTotalPrice: "800000000",
      asset: { assetKind: "housing", acquisitionDate: "2015-01-01" },
      houses: [],
      presaleRights: rights as never,
      rightThreeYearExceptionKind: "new_house",
      rightNewHouseCompletionDate: "",
      ...extra,
    }),
  );
const presale = { id: "P1", type: "presale_right", acquisitionDate: "2021-02-01", region: "capital" };
const redev = { id: "R1", type: "redevelopment_right", acquisitionDate: "2020-02-01", region: "capital", memberOrigin: "successor" };
const completionMsg = (f: ReturnType<typeof formOf>) =>
  validateAllSteps(f).find((e) => e.field === "rightNewHouseCompletionDate")?.message ?? "";
const cardText = (f: ReturnType<typeof formOf>) => {
  const { container } = render(<RightThreeYearExceptionSection form={f as unknown as TransferFormData} onChange={() => {}} />);
  return { container, text: (container.textContent ?? "").replace(/\s+/g, " ") };
};

describe("X2-2 분양권 — §156의3③", () => {
  it("⑧ 메시지가 §156의3③을 인용하고 §156의2④는 없다", () => {
    const m = completionMsg(formOf([presale]));
    expect(m).toContain("시행령 §156의3③");
    expect(m).not.toContain("§156의2④");
  });
  it("카드 법령 칩·선택지 설명이 §156의3③이고 §156의2④는 없다", () => {
    const { container, text } = cardText(formOf([presale]));
    expect(text).toContain("시행령 §156의3③1호·2호 후단");
    expect(text).toContain("시행령 §156의3③2호 전단");
    expect(text).not.toContain("§156의2④");
    const chips = [...container.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(chips.some((c) => c.includes("시행령 §156의3③"))).toBe(true);
    expect(chips.some((c) => c.includes("시행령 §156의2④"))).toBe(false);
    // 시행규칙 §75①은 두 권리에 함께 걸린다 — 그대로 유지
    expect(chips.some((c) => c.includes("시행규칙 §75①"))).toBe(true);
  });
});

describe("X2-2 긍정 짝 — 승계 입주권은 §156의2④ 그대로", () => {
  it("⑧ 메시지·카드", () => {
    const f = formOf([redev]);
    expect(completionMsg(f)).toContain("시행령 §156의2④");
    expect(completionMsg(f)).not.toContain("§156의3");
    const { text } = cardText(f);
    expect(text).toContain("시행령 §156의2④1호·2호 후단");
    expect(text).not.toContain("§156의3③");
  });
});

describe("X2-2 입주권·분양권이 함께 있으면 둘 다 적는다", () => {
  it("⑧ 메시지·카드 칩", () => {
    const f = formOf([redev, presale]);
    expect(completionMsg(f)).toContain("시행령 §156의2④·§156의3③");
    const { container, text } = cardText(f);
    expect(text).toContain("§156의2④·§156의3③의 1호·2호 후단");
    const chips = [...container.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(chips.some((c) => c.includes("시행령 §156의2④"))).toBe(true);
    expect(chips.some((c) => c.includes("시행령 §156의3③"))).toBe(true);
  });
});

describe("X2-2 상속 분양권 카드 설명", () => {
  it("§156의3④·⑤를 함께 적는다", () => {
    const f = formOf([{ ...presale, isInherited: true }], { rightThreeYearExceptionKind: undefined });
    const { container } = render(<InheritedRightExceptionSection form={f as unknown as TransferFormData} onChange={() => {}} />);
    const t = container.textContent ?? "";
    // 결정 #8 — 선언 토글을 없앤 자리의 안내문이 같은 조문(분양권 §156의3④·⑤)을 적는다
    const desc = container.querySelector('[data-testid="inherited-right-held-by-date-notice"]')?.textContent ?? t;
    expect(desc).toMatch(/§156의3\s?④·⑤/);
  });
});
