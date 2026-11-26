import { describe, it, expect } from "vitest";
import {
  FOREIGN_RE_SUPPORT_FROM_TRANSFER_DATE_MS,
  isForeignRealEstateSupportedTransferDate,
} from "@/lib/tax-engine/transfer-foreign-realestate-era";

describe("국외 부동산 지원 개시 양도일 (엔진 Q-9 권고 2020-01-01)", () => {
  it("단일 상수는 2020-01-01 UTC 자정", () => {
    expect(FOREIGN_RE_SUPPORT_FROM_TRANSFER_DATE_MS).toBe(Date.UTC(2020, 0, 1));
  });

  it.each([
    ["2019-12-31", false],
    ["2020-01-01", true],
    ["2020-01-02", true],
    ["2026-07-10", true],
  ])("양도일 %s → %s (경계 당일 포함)", (iso, expected) => {
    expect(isForeignRealEstateSupportedTransferDate(new Date(`${iso}T00:00:00Z`))).toBe(expected);
  });

  it("UTC 달력일 기준 — 2019-12-31 23:59:59.999Z는 미지원, 2020-01-01 00:00:00.000Z는 지원", () => {
    expect(isForeignRealEstateSupportedTransferDate(new Date("2019-12-31T23:59:59.999Z"))).toBe(false);
    expect(isForeignRealEstateSupportedTransferDate(new Date("2020-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("잘못된 날짜는 false", () => {
    expect(isForeignRealEstateSupportedTransferDate(new Date(Number.NaN))).toBe(false);
  });
});
