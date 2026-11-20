/**
 * 2026-11 리뷰 I-19 — §154①2호 나·다목 「출국일 현재 1주택」 요건 시행(대통령령 제20618호 · 2008.2.22.) 경계 당일 ⑧ 단언.
 * ⑧(`OVERSEAS_DEPARTURE_ONE_HOUSE_TRANSFER_START`)과 엔진(`transfer-tax-exemption-holding.ts`)이 같은 날을 따로 들고 있다 — 단일화는
 * 그 파일을 열 때 하고, 그 전까지 이 경계가 drift를 잡는다(리뷰 probe: 경계 5날짜 동작 일치).
 */
import { describe, it, expect } from "vitest";
import { collectExemptionProvisoErrors } from "@/lib/calc/exemption-proviso-validate";

const asks = (transferDate: string) =>
  collectExemptionProvisoErrors({ reason: "overseas_migration", departureDate: "2007-06-01", transferDate, departureOnlyHouse: "" }).some((e) =>
    e.includes("출국일 현재 이 주택 1채만 보유했는지"),
  );

describe("I-19 출국일 현재 1주택 — ⑧ 경계", () => {
  it("2008-02-22 양도부터 묻는다 · 전날은 묻지 않는다", () => {
    expect(asks("2008-02-21")).toBe(false);
    expect(asks("2008-02-22")).toBe(true);
  });
});
