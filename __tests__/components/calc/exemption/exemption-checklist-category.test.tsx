import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExemptionChecklist } from "@/components/calc/exemption/ExemptionChecklist";

afterEach(cleanup);

/**
 * 비과세 체크리스트 세목 분기 — 증여세에 상속세 §12·§16·§17 항목이 노출되지 않아야 한다.
 * 버그: ExemptionChecklistPanel이 category 무시하고 inh_* 하드코딩 → 증여에 금양임야 등 노출 + 엔진 차감.
 */
describe("ExemptionChecklist category 분기", () => {
  it("증여세(gift): gift 비과세 항목(§46) 노출, 상속세 §12 항목 미노출", () => {
    render(<ExemptionChecklist category="gift" value={[]} onChange={() => {}} />);
    // 증여 §46 비과세 항목
    expect(screen.getByText("생활비·교육비·치료비")).toBeTruthy();
    expect(screen.getByText("축의금·부의금")).toBeTruthy();
    // 그룹 헤더 §46
    expect(screen.getByText("상증법 §46")).toBeTruthy();
    // 상속세 전용 §12·§16·§17 항목·헤더는 없어야 함
    expect(screen.queryByText("금양임야")).toBeNull();
    expect(screen.queryByText("묘토")).toBeNull();
    expect(screen.queryByText("공익법인 출연")).toBeNull();
    expect(screen.queryByText("상증법 §12")).toBeNull();
    expect(screen.queryByText("상증법 §16·§17")).toBeNull();
  });

  it("상속세(inheritance): inh 비과세 항목(§12·§16·§17) 유지(회귀 0)", () => {
    render(<ExemptionChecklist category="inheritance" value={[]} onChange={() => {}} />);
    expect(screen.getByText("금양임야")).toBeTruthy();
    expect(screen.getByText("묘토")).toBeTruthy();
    expect(screen.getByText("족보·제구")).toBeTruthy();
    expect(screen.getByText("공익법인 출연")).toBeTruthy();
    expect(screen.getByText("상증법 §12")).toBeTruthy();
    expect(screen.getByText("상증법 §16·§17")).toBeTruthy();
    // 증여 전용 항목은 상속에 없어야 함
    expect(screen.queryByText("축의금·부의금")).toBeNull();
  });
});
