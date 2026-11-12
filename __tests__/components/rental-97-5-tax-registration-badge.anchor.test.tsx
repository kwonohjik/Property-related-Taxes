/**
 * @vitest-environment jsdom
 *
 * anchor — §97의5 세무서 사업자등록일 3개월 배지 (rental-97-5-textbook-gaps.plan.md §3.2 · 2026-11-12 리뷰 D-3)
 *
 * 엔진 `TAX_REGISTRATION_AFTER_3_MONTHS`(사용자 정책 — 법령 문언에는 없는 요건)와 **같은 기한**을 화면이 미리 보인다.
 * 기한 = 취득일 + 3개월(`addMonths` 말일 clamp — 지자체 등록 배지와 같은 헬퍼). 법령 문언에 없는 요건이라 배지에 호를 적지 않는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

afterEach(cleanup);

type Value = Parameters<typeof Rental975InputForm>[0]["value"];

const value = (patch: Partial<Value>): Value =>
  ({
    ...(getReductionDefault("rental_97_5") as Value),
    registrationDate: "2016-12-15",
    isPurchaseRental: true,
    isTaxRegistered: true,
    ...patch,
  }) as Value;

const renderForm = (patch: Partial<Value>, acquisitionDate = "2016-11-30") =>
  render(<Rental975InputForm value={value(patch)} onChange={() => {}} acquisitionDate={acquisitionDate} transferDate="2030-06-01" />);

describe("세무서 사업자등록일 3개월 배지", () => {
  it("말일 clamp — 취득 2016-11-30 · 사업자등록 2017-02-28 → 3개월 내", () => {
    renderForm({ taxRegistrationDate: "2017-02-28" });
    expect(screen.getByText("✓ 취득 후 3개월 내 사업자등록")).toBeTruthy();
  });

  it("2017-03-01 → 3개월 초과 배지 (호 표기 없음)", () => {
    renderForm({ taxRegistrationDate: "2017-03-01" });
    const badge = screen.getByText("취득 후 3개월 초과 — 감면 요건 불충족");
    expect(badge.className).toContain("bg-amber-100");
    expect(badge.textContent).not.toMatch(/①|1호|§/);
  });

  it("취득 전 사업자등록 → 3개월 내", () => {
    renderForm({ taxRegistrationDate: "2014-05-01" });
    expect(screen.getByText("✓ 취득 후 3개월 내 사업자등록")).toBeTruthy();
  });

  it("세무서 사업자등록 토글 OFF·날짜 미입력·취득일 미입력이면 배지 없음", () => {
    renderForm({ isTaxRegistered: false, taxRegistrationDate: "2017-03-01" });
    expect(screen.queryByText(/사업자등록$/)).toBeNull();
    expect(screen.queryByText("취득 후 3개월 초과 — 감면 요건 불충족")).toBeNull();
    cleanup();
    renderForm({ taxRegistrationDate: "" });
    expect(screen.queryByText("✓ 취득 후 3개월 내 사업자등록")).toBeNull();
    cleanup();
    renderForm({ taxRegistrationDate: "2017-03-01" }, "");
    expect(screen.queryByText("취득 후 3개월 초과 — 감면 요건 불충족")).toBeNull();
  });

  it("지자체 등록 배지는 그대로 — 등록 2016-12-15는 3개월 내", () => {
    renderForm({ taxRegistrationDate: "2017-02-28" });
    expect(screen.getByText("✓ 취득 후 3개월 내 등록")).toBeTruthy();
  });
});
