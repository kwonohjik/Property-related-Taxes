/**
 * G5-7 anchor — 자기선언 비과세(§156의2④ · §156의3③ · ⑤ 대체주택)의 판정 메뉴 결과에도 사후관리(추징) 고지가 남는다.
 *
 * 「소득세법 시행령」 §156의2⑬(분양권 §156의3⑩): 요건을 갖추지 못하게 된 때에는 사유가 발생한 날이 속하는 달의 말일부터 2개월 이내에
 * 신고·납부해야 한다. 「완성 전 양도」로 받은 비과세는 장래 요건이 걸린 조건부인데, 고지가 계산기 경고(`article89Clause2Notices`)에만
 * 있고 판정 메뉴 결과·이력에는 없었다. 이제 같은 leaf(`article89Clause2PostManagementNotice`)가 만든 같은 문장을 결과에 싣는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { mkCase } from "./_one-house-pr3a-judge-route";
import { judgeAndRender } from "./_one-house-pr12a-judge-view";
import { article89Clause2Notices, article89Clause2PostManagementNotice } from "@/lib/tax-engine/transfer-tax-89-2-consequences";
import { revokeOneHouseExemption } from "@/lib/tax-engine/one-house/revoke-exemption";
import g106 from "./one-house-rulings/cases/G106.json";
import g125 from "./one-house-rulings/cases/G125.json";

afterEach(cleanup);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pick = (arr: any[], id: string) => arr.find((x) => x.id === id);
const redevBeforeCompletion = () => {
  const c = pick(g106 as never[], "G106-era");
  return mkCase(c.today, c.form);
};
const presaleBeforeCompletion = () =>
  mkCase("2025-03-16", {
    isOneHousehold: true, transferDate: "2025-03-15", contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2015-03-15" },
    presaleRights: [{ id: "P", type: "presale_right", acquisitionDate: "2021-06-15", region: "capital" }],
    rightThreeYearExceptionKind: "before_completion", rightMovedInWithin3Years: true, rightResidedOneYearOrMore: true,
  });

describe("G5-7 판정 메뉴 결과의 사후관리(추징) 고지", () => {
  it("입주권 §156의2④ 완성 전 양도 — 응답·결과 화면 모두 ⑬·2개월·추징", async () => {
    const o = await judgeAndRender(redevBeforeCompletion(), true, true);
    expect(o.isExempt).toBe(true);
    expect(o.j.postManagementNotices).toHaveLength(1);
    const text = screen.getByTestId("one-house-post-management-notice").textContent ?? "";
    expect(text).toContain("§156의2⑬(분양권은 §156의3⑩)");
    expect(text).toContain("2개월 이내");
    expect(text).toContain("(추징)");
    // 근거 조문이 비지 않는다 — 검토표가 「1주택 단독 양도」로만 보이지 않게 ④를 싣는다.
    expect(o.j.legalBasis).toContain("소득세법 시행령 §156의2 ④");
  });
  it("분양권 §156의3③ 완성 전 양도", async () => {
    const o = await judgeAndRender(presaleBeforeCompletion(), true, true);
    expect(o.isExempt).toBe(true);
    expect(o.j.postManagementNotices?.[0]).toContain("소득세법 시행령 §156의3 ③");
    expect(o.j.legalBasis).toContain("소득세법 시행령 §156의3 ③");
  });
  it("⑤ 대체주택(G125-era)도 같은 고지", async () => {
    const c = pick(g125 as never[], "G125-era");
    const o = await judgeAndRender(mkCase(c.today, c.form));
    expect(o.isExempt).toBe(true);
    expect(o.j.postManagementNotices?.[0]).toContain("소득세법 시행령 §156의2 ⑤");
  });
  it("계산기 경고와 같은 leaf·같은 문장이다 — 문구 복제가 없다", async () => {
    const o = await judgeAndRender(redevBeforeCompletion());
    const calcNotices = article89Clause2Notices(o.j.article89Clause2, true, new Date("2016-09-20"), {
      coreWouldPass: true, surchargeDeclarationMatters: false,
    });
    expect(calcNotices).toEqual(o.j.postManagementNotices);
  });
  it("긍정 짝(부정형): 「해당 없음」 선언 — 과세라 고지도 카드도 없다", async () => {
    const c = pick(g106 as never[], "N-G106-none");
    const o = await judgeAndRender(mkCase(c.today, c.form), true, true);
    expect(o.isExempt).toBe(false);
    expect(o.j.postManagementNotices).toBeUndefined();
    expect(screen.queryByTestId("one-house-post-management-notice")).toBeNull();
  });
  it("권리 없는 일반 1주택 비과세는 고지가 없다", async () => {
    const o = await judgeAndRender(
      mkCase("2024-06-02", {
        isOneHousehold: true, transferDate: "2024-06-01", contractTotalPrice: "800000000",
        asset: { assetKind: "housing", acquisitionDate: "2015-01-01", regionCode: "4311000000", residenceInputMode: "direct", residencePeriodMonthsAsset: "0" },
      }),
    );
    expect(o.isExempt).toBe(true);
    expect(o.j.postManagementNotices).toBeUndefined();
  });
  it("비과세를 거두면(revokeOneHouseExemption) 고지도 함께 거둔다", async () => {
    const o = await judgeAndRender(redevBeforeCompletion());
    expect(revokeOneHouseExemption(o.j).postManagementNotices).toBeUndefined();
  });
  it("leaf: settled가 아니면 고지가 없다", () => {
    expect(article89Clause2PostManagementNotice({ status: "exception_met", exception: "소득세법 시행령 §156의2 ④" }, false, new Date("2024-06-01"))).toBeUndefined();
  });
});
