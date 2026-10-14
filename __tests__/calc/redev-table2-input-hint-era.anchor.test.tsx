/**
 * @vitest-environment jsdom
 *
 * 재개발 입력 화면의 장기보유특별공제 표2 안내 — 양도일의 표2 연혁대로 말한다(#2176 이후 엔진은 이미 연혁을 따른다).
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | H-1 | leaf | 양도일 → 연혁 · 비었거나 읽을 수 없으면 현행 식 문구 |
 * | H-2 | leaf | 2009~2019 보유 8% 단일축·거주 요건 없음 / 2020 보유 8% + 거주 24개월 / 2021~ 현행 / 2009 전 미지원 고지 |
 * | H-3 | 위젯 | 승계조합원 승계 카드의 거주월수 힌트·진입 조건 한 줄이 양도일을 따른다 |
 * | H-4 | 배선 | 재개발 블록이 양도일을 승계 카드까지 넘긴다 |
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { table2EntryBullet, table2EraOfTransferDate, table2ResidenceMonthsHint } from "@/lib/calc/lthd-table2-hint";
import { SuccessorMemberSection } from "@/components/calc/transfer/RedevelopmentBlockCards";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

const CURRENT = "표2(보유 4%/년 + 거주 4%/년, 최대 80%)";

describe("H-1 양도일 → 연혁", () => {
  it("경계일", () => {
    expect(table2EraOfTransferDate("2008-12-31")).toBe("unsupported");
    expect(table2EraOfTransferDate("2009-01-01")).toBe("holding_8pct");
    expect(table2EraOfTransferDate("2019-12-31")).toBe("holding_8pct");
    expect(table2EraOfTransferDate("2020-01-01")).toBe("holding_8pct_residence_2y");
    expect(table2EraOfTransferDate("2020-12-31")).toBe("holding_8pct_residence_2y");
    expect(table2EraOfTransferDate("2021-01-01")).toBe("holding_residence_split");
  });
  it("비었거나 읽을 수 없으면 undefined", () => {
    expect(table2EraOfTransferDate(undefined)).toBeUndefined();
    expect(table2EraOfTransferDate("")).toBeUndefined();
    expect(table2EraOfTransferDate("not-a-date")).toBeUndefined();
  });
});

describe("H-2 문구", () => {
  it("현행(2021~) · 양도일 미입력은 현행 식", () => {
    expect(table2ResidenceMonthsHint("2025-06-01")).toContain(CURRENT);
    expect(table2ResidenceMonthsHint(undefined)).toContain(CURRENT);
    expect(table2ResidenceMonthsHint("")).toContain(CURRENT);
  });
  it("2009~2019 — 보유 8% 단일축 · 거주 요건 없음 · 현행 식 문구가 아니다", () => {
    const t = table2ResidenceMonthsHint("2015-06-01");
    expect(t).toContain("보유 8%/년, 최대 80%");
    expect(t).toContain("거주 요건이 없어");
    expect(t).not.toContain("거주 4%/년");
    expect(t).not.toContain("24개월 이상이면");
  });
  it("2020 — 보유 8% + 거주 24개월 이상이 요건", () => {
    const t = table2ResidenceMonthsHint("2020-06-01");
    expect(t).toContain("24개월 이상이면");
    expect(t).toContain("보유 8%/년, 최대 80%");
    expect(t).not.toContain("거주 4%/년");
  });
  it("2009 전 — 미지원 고지 + 현행 식으로 계산", () => {
    const t = table2ResidenceMonthsHint("2008-06-01");
    expect(t).toContain("지원하지 않아 현행 식");
  });
  it("진입 조건 한 줄 — 2009~2019만 거주 요건 없음, 나머지는 거주 2년 이상", () => {
    expect(table2EntryBullet("2015-06-01")).toContain("거주 요건 없음");
    expect(table2EntryBullet("2015-06-01")).not.toContain("거주 2년 이상");
    for (const d of ["2020-06-01", "2025-06-01", undefined, "2008-06-01"]) {
      expect(table2EntryBullet(d), String(d)).toContain("거주 2년 이상");
    }
  });
});

describe("H-3 위젯 — 승계조합원 카드", () => {
  const asset = () => ({ ...makeDefaultAsset(1), assetKind: "redevelopment_apt" as const, redevSubject: "apt" as const, redevIsSuccessorMember: "yes" as const });
  const show = (transferDate?: string) => render(<SuccessorMemberSection asset={asset()} onChange={() => {}} transferDate={transferDate} />);
  const text = () => document.body.textContent ?? "";

  it("2015 양도 — 보유 8% 문구 · 거주 요건 없음 줄", () => {
    show("2015-06-01");
    expect(text()).toContain(table2ResidenceMonthsHint("2015-06-01"));
    expect(text()).toContain(table2EntryBullet("2015-06-01"));
    expect(text()).not.toContain(CURRENT);
  });
  it("[짝] 2025 양도 · 양도일 미입력 — 현행 식 문구", () => {
    show("2025-06-01");
    expect(text()).toContain(CURRENT);
    cleanup();
    show(undefined);
    expect(text()).toContain(CURRENT);
    expect(screen.getAllByText(/거주 2년 이상 → 장특공제 표2/).length).toBe(1);
  });
});

describe("H-4 배선 — RedevelopmentBlock → SuccessorMemberSection", () => {
  const asset = () => ({ ...makeDefaultAsset(1), assetKind: "redevelopment_apt" as const, redevSubject: "apt" as const, redevIsSuccessorMember: "yes" as const });
  const show = (transferDate?: string) =>
    render(<RedevelopmentBlock asset={asset()} onChange={() => {}} isOneHouseSingle={true} judgmentLoaded={false} transferDate={transferDate} />);

  it("양도일이 연혁 문구로 이어진다 — 2015 양도는 현행 식이 아니다", () => {
    show("2015-06-01");
    const t = document.body.textContent ?? "";
    expect(t).toContain(table2ResidenceMonthsHint("2015-06-01"));
    expect(t).not.toContain(CURRENT);
  });
  it("[짝] 2025 양도는 현행 식", () => {
    show("2025-06-01");
    expect(document.body.textContent ?? "").toContain(CURRENT);
  });
});
