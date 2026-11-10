/**
 * 재개발 · 입주권 부담부증여 — §163⑨ 안내가 계산에 쓰이는 칸을 가리킨다(계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §27 · §28 · D-3l · Q-20 a).
 *
 * 종전: 부담부증여에서도 「위 “상속개시일 평가액” 입력값」·「③ 취득정보의 “증여 신고가액”」을 가리켰다 — 그 칸은 이 페이지에 없고,
 *   부담부증여(의제취득일 이후)는 ③의 평가액을 쓰지 않는다(§159①1호 A = 「(종전 부동산) 실지취득가액」 칸 · §27.2 실측).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RedevelopmentDeemedAcquisitionNotice } from "@/components/calc/transfer/RedevelopmentDeemedAcquisitionNotice";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { bgActualFieldSec163_9Cause, sec163_9Hint } from "@/lib/calc/bg-share-own-acquisition";

afterEach(cleanup);
const a = (o: Record<string, unknown>) => Object.assign({ ...makeDefaultAsset(1) }, o) as unknown as AssetForm;
const RTMI = { assetKind: "right_to_move_in", redevSubject: "right", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", isSuccessorRightToMoveIn: false, acquisitionDate: "2012-01-01" };
const REDEV = { assetKind: "redevelopment_apt", redevSubject: "apt", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgAcquisitionMethod: "actual", acquisitionDate: "2012-01-01" };

describe("leaf bgActualFieldSec163_9Cause", () => {
  it("입주권 원조합원 · 재개발 시가 K-4 × 상속 · 증여 → 원인", () => {
    expect(bgActualFieldSec163_9Cause(a({ ...RTMI, acquisitionCause: "inheritance" }))).toBe("inheritance");
    expect(bgActualFieldSec163_9Cause(a({ ...RTMI, acquisitionCause: "gift" }))).toBe("gift");
    expect(bgActualFieldSec163_9Cause(a({ ...REDEV, acquisitionCause: "inheritance" }))).toBe("inheritance");
  });
  it("매매 · 일반 양도 · 승계 입주권 · 재개발 기준시가 · 환산 · 다른 종류 → null", () => {
    expect(bgActualFieldSec163_9Cause(a({ ...RTMI, acquisitionCause: "purchase" }))).toBeNull();
    expect(bgActualFieldSec163_9Cause(a({ ...RTMI, acquisitionCause: "inheritance", transferType: "regular" }))).toBeNull();
    expect(bgActualFieldSec163_9Cause(a({ ...RTMI, acquisitionCause: "inheritance", isSuccessorRightToMoveIn: true }))).toBeNull();
    expect(bgActualFieldSec163_9Cause(a({ ...REDEV, acquisitionCause: "inheritance", bgValuationMode: "sangjeungbeop_standard" }))).toBeNull();
    expect(bgActualFieldSec163_9Cause(a({ ...REDEV, acquisitionCause: "inheritance", bgAcquisitionMethod: "converted" }))).toBeNull();
    expect(bgActualFieldSec163_9Cause(a({ ...REDEV, acquisitionCause: "inheritance", assetKind: "housing" }))).toBeNull();
  });
  it("재개발 의제취득일 전 상속 → null (3자 max 경로)", () => {
    expect(bgActualFieldSec163_9Cause(a({ ...REDEV, acquisitionCause: "inheritance", acquisitionDate: "1980-01-01", redevOriginalAssetType: "housing" }))).toBeNull();
  });
  it("hint — 원인별 문구 · null은 undefined", () => {
    expect(sec163_9Hint("inheritance")).toContain("상속개시일 현재 상증법 평가액");
    expect(sec163_9Hint("gift")).toContain("증여일 현재 상증법 평가액");
    expect(sec163_9Hint(null)).toBeUndefined();
  });
});

describe("RedevelopmentDeemedAcquisitionNotice — 부담부증여", () => {
  it("상속 · 단건 → 「② 양도정보 ‘부담부증여’ 카드의 실지취득가액 칸」 · 없는 칸을 가리키지 않는다", () => {
    render(<RedevelopmentDeemedAcquisitionNotice acquisitionCause="inheritance" isBurdenedGift bgActualFieldCause="inheritance" />);
    const p = screen.getByTestId("redev-bg-sec163-9-notice");
    expect(p.textContent).toContain("② 양도정보 ‘부담부증여’ 카드의 실지취득가액 칸");
    expect(p.textContent).toContain("상속개시일 현재");
    expect(document.body.textContent).not.toContain("상속개시일 평가액”");
    expect(document.body.textContent).not.toContain("실거래가로는 계산하지 않습니다");
  });
  it("증여 · 지분 카드 → 이 카드 위 지분 토글 · 「증여 신고가액」 칸을 가리키지 않는다", () => {
    render(<RedevelopmentDeemedAcquisitionNotice acquisitionCause="gift" isBurdenedGift bgActualFieldCause="gift" shareCard />);
    expect(screen.getByTestId("redev-bg-sec163-9-notice").textContent).toContain("이 카드 위 「이 지분의 취득가액을 자산 1과 따로 입력」");
    expect(document.body.textContent).not.toContain("증여 신고가액”");
  });
  it("부담부증여 · 실지 칸이 쓰이지 않는 방식 → 띄우지 않는다", () => {
    const { container } = render(<RedevelopmentDeemedAcquisitionNotice acquisitionCause="inheritance" isBurdenedGift bgActualFieldCause={null} />);
    expect(container.textContent).toBe("");
  });
  it("부담부증여 · 의제취득일 전 · 일반 양도 → 종전 문구 그대로", () => {
    render(<RedevelopmentDeemedAcquisitionNotice acquisitionCause="inheritance" isBurdenedGift bgPreDeemed />);
    expect(document.body.textContent).toContain("의제취득일 전 상속이면");
    document.body.innerHTML = "";
    render(<RedevelopmentDeemedAcquisitionNotice acquisitionCause="gift" />);
    expect(document.body.textContent).toContain("③ 취득정보의");
  });
});
