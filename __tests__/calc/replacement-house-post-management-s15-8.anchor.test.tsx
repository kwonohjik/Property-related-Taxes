/**
 * S15-8 anchor — 대체주택 특례 입력 카드의 사후관리(추징) 안내는 「소득세법 시행령」 §156의2⑬(<개정 2013.2.15.>) 문언을 따른다.
 *
 * 사유는 「신축주택 양도」가 아니라 ⑤2호 요건(완성 후 N년 내 세대전원 이사 + 1년 이상 계속 거주)을 갖추지 못하게 된 것이고, 기한은
 * 「사유가 발생한 날이 속하는 달의 말일부터 2개월 이내」다. 종전 문구는 2013.2.15. 전 문언(「사유가 발생한 과세연도」)이었다.
 * 문구는 계산기·판정 메뉴 고지와 같은 엔진 leaf(`POST_MANAGEMENT_FILING`)를 읽는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ReplacementHouseSpecialBlock } from "@/app/calc/transfer-tax/steps/step4-sections/ReplacementHouseSpecialBlock";
import { POST_MANAGEMENT_FILING, article89Clause2PostManagementNotice } from "@/lib/tax-engine/transfer-tax-89-2-consequences";
import { TRANSFER } from "@/lib/tax-engine/legal-codes/transfer";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);
const blockText = (transferDate: string) => {
  const form = { transferDate, replacementHouseSpecial: true, replBusinessApprovalDate: "2016-08-08", replCompletionDate: "2023-10-23", replResidenceMonths: "60", replWillResideNewHouse: true } as unknown as TransferFormData;
  const { container } = render(<ReplacementHouseSpecialBlock form={form} onChange={() => {}} />);
  const t = (container.textContent ?? "").replace(/\s+/g, " ");
  return t.slice(t.indexOf("사후관리 주의"));
};

describe("S15-8 사후관리 카드", () => {
  it("기한(2개월)·사유(⑤2호 요건 미충족)를 법문대로 적는다", () => {
    const card = blockText("2024-07-19");
    expect(card).toContain("사유 발생일이 속하는 달의 말일부터 2개월 이내");
    expect(card).toContain("요건(⑤2호)을 갖추지 못하게 되면");
    expect(card).not.toContain("과세연도에 신고");
    expect(card).not.toContain("신축주택을 양도하면");
  });
  it("계산기·판정 메뉴 고지와 같은 문구 leaf를 읽는다", () => {
    expect(blockText("2024-07-19")).toContain(POST_MANAGEMENT_FILING);
    const notice = article89Clause2PostManagementNotice(
      { status: "exception_met", exception: TRANSFER.REPLACEMENT_HOUSE_156_2_5 },
      true,
      new Date("2024-07-19"),
    );
    expect(notice).toContain(POST_MANAGEMENT_FILING);
  });
  it("긍정 짝: 완성 후 기한 N은 양도일 연혁 그대로 — 2022-06-01은 2년, 2024-07-19는 3년", () => {
    expect(blockText("2022-06-01")).toContain("신축주택 완성 후 2년 내");
    expect(blockText("2024-07-19")).toContain("신축주택 완성 후 3년 내");
  });
});
