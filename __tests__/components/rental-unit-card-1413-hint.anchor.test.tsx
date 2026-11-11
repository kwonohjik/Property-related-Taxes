/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — 임대 호 카드 문구: 재산세제과-1413 힌트 · 단기→장기 변경신고 「2020.7.11. 이후」
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
      unit={{ ...makeDefaultRentalUnit(), ...over }}
      index={0}
      onChange={vi.fn()}
      onRemove={() => {}}
      canRemove={false}
    />,
  );

describe("임대 호 카드 문구", () => {
  it("지자체 등록신청일 칸에 재산세제과-1413(2023.12.22.) 힌트가 보인다", () => {
    renderCard({});
    expect(screen.getByText(/재산세제과-1413, 2023\.12\.22\./)).toBeTruthy();
  });

  it("마목(신청일 2020-08-01)의 변경신고 토글 제목에 「2020.7.11. 이후」", () => {
    renderCard({ businessRegistrationDate: "2020-08-01", rentalRegistrationDate: "2020-08-01" });
    expect(screen.getByText("단기임대를 2020.7.11. 이후 장기일반으로 변경신고한 주택입니다.")).toBeTruthy();
  });
});
