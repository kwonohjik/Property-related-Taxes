/**
 * 판례 생사 확인 화면 — scan_incomplete 를 「후속 인용 없음」·「신호 미감지」로 그리지 않는다.
 * StatusBadge 는 마지막 분기가 「후속 인용 없음」이라, 새 상태를 빠뜨리면 그쪽으로 떨어진다.
 * 근거: cite-check-deadline.anchor.test.ts
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CitePrecedentStatus } from "@/app/law/_components/CitePrecedentStatus";
import type { CiteCheckResult } from "@/lib/korean-law/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function respond(result: Partial<CiteCheckResult>) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        result: { caseNo: "2018두100", citingCount: 6, scannedCount: 2, unscannedCount: 0, signals: [], enBancUnscanned: [], ...result },
      }),
      { status: 200 }
    )
  );
}

describe("UI — 확인 미완료", () => {
  it("UI-1: scan_incomplete → 「확인 미완료」 + 못 읽은 건수, 초록 「신호 미감지」·「후속 인용 없음」 아님", async () => {
    respond({ status: "scan_incomplete", unscannedCount: 4 });
    render(<CitePrecedentStatus caseNo="2018두100" />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(/확인 미완료/)).toBeTruthy();
    expect(screen.getByText(/4건 못 읽음/)).toBeTruthy();
    expect(screen.queryByText("변경·폐기 신호 미감지")).toBeNull();
    expect(screen.queryByText("후속 인용 없음")).toBeNull();
  });

  it("UI-2(긍정 짝): no_signal 은 종전대로 「신호 미감지」, 못 읽음 문구 없음", async () => {
    respond({ status: "no_signal", scannedCount: 6 });
    render(<CitePrecedentStatus caseNo="2018두100" />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("변경·폐기 신호 미감지")).toBeTruthy();
    expect(screen.queryByText(/못 읽음/)).toBeNull();
  });
});

describe("UI — 본문 미제공 대법원 판결 (cite-check-source-gap.anchor.test.ts)", () => {
  const nts = (i: number) => ({
    caseNo: `대법원-2024-두-${i}`, title: "", court: "국세법령정보시스템", date: "2024.05.30", isEnBanc: false,
    id: String(i), hasFullText: false, sourceUrl: `https://www.law.go.kr/LSW/precInfoP.do?precSeq=${i}`,
  });

  it("UI-3: 목록·원문 링크·건수를 띄운다 (5건 넘으면 「외 n건」)", async () => {
    respond({ status: "no_signal", scannedCount: 1, supremeNoText: [1, 2, 3, 4, 5, 6, 7].map(nts) });
    render(<CitePrecedentStatus caseNo="2018두100" />);
    fireEvent.click(screen.getByRole("button"));
    const box = await screen.findByTestId("cite-supreme-no-text");
    expect(box.textContent).toContain("대법원-2024-두-1");
    expect(box.querySelector("a")?.getAttribute("href")).toBe("https://www.law.go.kr/LSW/precInfoP.do?precSeq=1");
    expect(box.textContent).toContain("외 2건");
    expect(screen.getByText(/대법원 7건 본문 미제공/)).toBeTruthy();
  });

  it("UI-4(긍정 짝): 없으면 목록도 건수 문구도 없다 (필드가 없는 옛 응답 포함)", async () => {
    respond({ status: "no_signal", scannedCount: 6 });
    render(<CitePrecedentStatus caseNo="2018두100" />);
    fireEvent.click(screen.getByRole("button"));
    await screen.findByText("변경·폐기 신호 미감지");
    expect(screen.queryByTestId("cite-supreme-no-text")).toBeNull();
    expect(screen.queryByText(/본문 미제공/)).toBeNull();
  });
});
