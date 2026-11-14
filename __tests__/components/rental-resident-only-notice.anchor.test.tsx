/**
 * @vitest-environment jsdom
 *
 * anchor — §97의3·§97의5 적용 주체 「거주자 전제」 안내 (사용자 결정 2026-11-14 · 거주 여부 칸은 만들지 않는다)
 *
 * 조특법 §97의3① 「대통령령으로 정하는 거주자가」 · §97의5① 「거주자가」 · §97의4① 「거주자 또는 비거주자가」.
 * 세액 변경 없음 — 문구 존재·위치만 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";
import { Rental974InputForm } from "@/components/calc/transfer/rental/Rental974InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

afterEach(cleanup);

const common = { onChange: () => {}, acquisitionDate: "2016-03-10", transferDate: "2029-12-01", assetContractDate: "" };

describe("거주자 전제 안내", () => {
  it("§97의3 폼 ① 등록·신분 카드 안에 §97의3① 거주자 안내", () => {
    render(<Rental973InputForm value={getReductionDefault("rental_97_3") as Parameters<typeof Rental973InputForm>[0]["value"]} {...common} />);
    const note = screen.getByTestId("rental-resident-only-notice-973");
    expect(note.textContent).toContain("조특법 §97의3①의 적용 대상은 거주자");
    expect(note.textContent).toContain("§97의4");
    // ① 카드 첫 입력(단기→장기 변경신고 질문)보다 앞에 둔다
    const firstQuestion = screen.getByText("단기민간임대주택 → 장기일반 변경신고");
    expect(note.compareDocumentPosition(firstQuestion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("§97의5 폼 ① 등록·신분 카드 안에 §97의5① 거주자 안내", () => {
    render(<Rental975InputForm value={getReductionDefault("rental_97_5") as Parameters<typeof Rental975InputForm>[0]["value"]} {...common} />);
    const note = screen.getByTestId("rental-resident-only-notice-975");
    expect(note.textContent).toContain("조특법 §97의5①의 적용 대상은 거주자");
    expect(note.textContent).toContain("거주 여부를 묻지 않습니다");
  });

  it("§97의4 폼(거주자 또는 비거주자)에는 안내가 없다", () => {
    render(<Rental974InputForm value={{ type: "rental_97_4" } as never} onChange={() => {}} transferDate="2025-01-01" />);
    expect(screen.queryByTestId(/rental-resident-only-notice/)).toBeNull();
  });
});
