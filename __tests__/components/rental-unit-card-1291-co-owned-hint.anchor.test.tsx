/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — 임대 호 카드 「판정 기준」의 공동소유 안내(기획재정부 재산세제과-1291, 2024.11.06.).
 *
 * 회신: 별도세대와 1/2씩 보유해 세대 기준 0.5호만 임대하는 장기일반민간임대주택도 §167의3①2호 마목(질의1)·
 * 사목(질의2) 장기임대주택에 해당한다. 엔진은 지분을 묻지 않고 호를 그대로 1호로 받는다(가·마·사목에 호수 게이트 없음)
 * — 이 안내는 그 입력 방법과 근거를 화면에 적는다(세액 무변경).
 *
 * | # | 주장 |
 * |---|---|
 * | CO-1 | 마목(장기일반·매입·신청일 2020-08-01)이면 안내가 보인다 |
 * | CO-2 | 가목(장기일반·매입·2018-01-02 등록)이면 안 보인다 — 1291은 가목 「1호 이상 임대하고 있는 거주자」를 답하지 않았다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const renderCard = (over: Record<string, unknown>) =>
  render(
    <RentalUnitCard
      unit={{ ...makeDefaultRentalUnit(), rentalCategory: "long_general", rentalAcquisitionType: "purchase", ...over }}
      index={0}
      onChange={vi.fn()}
      onRemove={() => {}}
      canRemove={false}
    />,
  );

describe("임대 호 카드 — 공동소유 안내(재산세제과-1291)", () => {
  it("CO-1 ★ 마목이면 안내와 근거가 보인다", () => {
    renderCard({ businessRegistrationDate: "2020-08-01", rentalRegistrationDate: "2020-08-01" });
    expect(screen.getByTestId("rental-verdict-badge-0").textContent).toContain("마목");
    const t = (screen.getByTestId("rental-co-owned-1291-0").textContent ?? "").replace(/\s+/g, " ");
    expect(t).toContain("별도세대와 지분으로 공동소유한 임대주택(세대 기준 1호 미만)도 이 카드에 1호로 입력합니다");
    expect(t).toContain("기획재정부 재산세제과-1291, 2024.11.06.");
  });

  it("CO-2 가목이면 띄우지 않는다", () => {
    renderCard({ businessRegistrationDate: "2018-01-02", rentalRegistrationDate: "2018-01-02" });
    expect(screen.getByTestId("rental-verdict-badge-0").textContent).toContain("가목");
    expect(screen.queryByTestId("rental-co-owned-1291-0")).toBeNull();
  });
});
