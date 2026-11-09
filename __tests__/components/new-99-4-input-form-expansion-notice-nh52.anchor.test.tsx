/**
 * 리뷰 NH-52 — §99의4 입력 폼에 «양도일까지의 증축·부수토지 추가 취득분 포함» 안내가 뜬다
 * (조특령 §99의4⑪ 면적·가액 포함 · ⑫·⑬1호 당초 취득일 기준). 계산은 바꾸지 않는다 — 안내 문구만.
 * 계획서 docs/00-pm/new-994-expansion-notice-nh52.plan.md (Q-1 a · Q-2 a · Q-3 a).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { New994InputForm } from "@/components/calc/transfer/New994InputForm";

afterEach(cleanup);

const view = (type: "new_99_4_rural" | "new_99_4_hometown", transfer: string | undefined) =>
  render(
    <New994InputForm
      value={{ type, ruralHouseAcquisitionDate: "2015-03-01", ruralHouseStdPrice: "", isRegisteredHanok: false } as never}
      onChange={() => {}}
      transferDate={transfer}
    />,
  );

const text = (id: string) => screen.queryByTestId(id)?.textContent ?? null;

describe("NH-52 — 증축·추가 취득분 안내", () => {
  it.each([
    ["new_99_4_rural" as const, "농어촌주택"],
    ["new_99_4_hometown" as const, "고향주택"],
  ])("%s: 가액 칸 안내 — 늘어난 건물·토지의 기준시가도 합계에 포함 + ⑪ 인용 + 평가 시점 확인 필요", (type, label) => {
    view(type, "2024-06-01");
    const t = text("new994-expansion-price-hint");
    expect(t).toContain(label);
    expect(t).toContain("늘어난 건물·토지의 기준시가도 이 합계에 포함");
    expect(t).toContain("조특령 §99의4⑪");
    expect(t).toContain("조문에 적혀 있지 않아 확인이 필요");
  });

  it.each(["new_99_4_rural" as const, "new_99_4_hometown" as const])(
    "%s: 취득일 칸 안내 — 당초 취득일 기준 + ⑫·⑬1호 인용",
    (type) => {
      view(type, "2024-06-01");
      const t = text("new994-expansion-date-hint");
      expect(t).toContain("당초 취득일 기준");
      expect(t).toContain("조특령 §99의4⑫·⑬1호");
    },
  );

  it("면적 칸 안내 — 종전 면적 요건 범위(대지 2021.1.1. 전 · 주택 2017.1.1. 전 양도)일 때만", () => {
    view("new_99_4_rural", "2016-06-01");
    expect(text("new994-expansion-area-hint")).toContain("늘어난 면적도 포함");
    expect(text("new994-expansion-area-hint")).toContain("조특령 §99의4⑪");
    cleanup();
    // 대조 — 범위 밖(2024 양도)에서는 면적 칸이 없으므로 면적 안내도 없다(가액·취득일 안내는 그대로)
    view("new_99_4_rural", "2024-06-01");
    expect(screen.queryByTestId("new994-size-fields")).toBeNull();
    expect(text("new994-expansion-area-hint")).toBeNull();
    expect(text("new994-expansion-price-hint")).not.toBeNull();
  });

  it("양도일 미입력이어도 가액·취득일 안내는 뜬다(안내는 양도일에 의존하지 않는다)", () => {
    view("new_99_4_rural", undefined);
    expect(text("new994-expansion-price-hint")).not.toBeNull();
    expect(text("new994-expansion-date-hint")).not.toBeNull();
  });
});
