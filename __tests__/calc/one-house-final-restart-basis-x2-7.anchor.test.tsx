/**
 * X2-7 anchor — 재기산 단서(「소득세법 시행령」 §154⑤ 단서)는 2022.5.31. 삭제됐다.
 *
 * 2022.2.18.본(MST 240685)에는 「2주택 이상을 보유한 1세대가 1주택 외의 주택을 모두 처분한 경우 … 처분 후 1주택을 보유하게 된 날부터
 * 보유기간을 기산한다」가 있고, 2022.5.31.본(MST 242735)부터 없다 — 현행 §154⑤ 단서는 용도변경(2024.2.29.)이다.
 * 결과 화면이 이 단서를 현행 조문 링크(「영 §154⑤ 단서 ↗」)로 걸면 모달이 무관한 용도변경 단서를 강조한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { mkCase } from "./_one-house-pr3a-judge-route";
import { judgeAndRender } from "./_one-house-pr12a-judge-view";
import { TRANSFER } from "@/lib/tax-engine/legal-codes/transfer";

afterEach(cleanup);

const restartCase = (restart: boolean) =>
  mkCase("2022-03-15", {
    isOneHousehold: true,
    transferDate: "2022-03-01",
    contractTotalPrice: "500000000",
    finalHouseRestartHistory: restart ? "yes" : "no",
    ...(restart ? { finalHouseRestartDisposals: [{ id: "a", kind: "transfer", date: "2021-06-01", temporaryTwoHouse: "no" }] } : {}),
    asset: { assetKind: "housing", acquisitionDate: "2015-03-01", regionCode: "4311000000", residenceInputMode: "direct", residencePeriodMonthsAsset: "0" },
  });

describe("X2-7 재기산 카드의 근거 표기", () => {
  it("엔진 legalBasis가 삭제 사실을 밝힌다", async () => {
    const r = await judgeAndRender(restartCase(true), true);
    expect(r.j.finalOneHouseRestart?.applied).toBe(true);
    expect(r.j.finalOneHouseRestart.legalBasis).toBe(TRANSFER.FINAL_HOUSE_RESTART_PRE_DELETION);
    expect(r.j.finalOneHouseRestart.legalBasis).toContain("2022.5.31. 삭제 전");
    expect(r.j.finalOneHouseRestart.description).toContain("2022.5.31. 삭제 전");
  });
  it("카드에 현행 조문을 여는 링크(button)가 없고 삭제 표기가 보인다", async () => {
    await judgeAndRender(restartCase(true), true, true);
    const card = screen.getByTestId("one-house-final-house-restart");
    expect(card.querySelector("button")).toBeNull();
    expect(screen.getByTestId("one-house-final-house-restart-basis").textContent).toContain("2022.5.31. 삭제 전");
  });
  it("대조: 처분 없음(재기산 안 함) 카드도 같은 근거 표기 — 링크 없음", async () => {
    await judgeAndRender(restartCase(false), true, true);
    const card = screen.getByTestId("one-house-final-house-restart");
    expect(card.querySelector("button")).toBeNull();
  });
  it("긍정 짝: 현행 용도변경 단서 상수는 삭제 표기가 없다(두 단서를 한 이름으로 합치지 않는다)", () => {
    expect(TRANSFER.CONVERSION_EXEMPTION_HOLDING).not.toContain("삭제");
  });
});
