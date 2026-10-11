/**
 * S09-1 anchor — 판정 메뉴 ⑧이 공용 ⑫ refine(명부 장기임대 9유형·부득이 사유·날짜 순서)의 거울을 갖는다.
 *
 * 결함: 판정 ⑧은 명부 장기임대 유형별 칸·부득이 사유 칸·`>=` 날짜 순서를 보지 않아 ⑧ 통과 → route 400이었고, ⑬은 message만 던져
 * 화면에는 「입력값이 올바르지 않습니다」만 남았다(판정 메뉴 anchor VD-1 규약 「Zod가 400을 내기 전에 ⑧이 잡는다」 위반).
 *
 * 전제 단언(`status 400`)이 이 anchor의 구별력이다 — ⑫가 막지 않는 입력에는 ⑧도 막지 않는다(대조 200).
 */
import { describe, it, expect, vi } from "vitest";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { runJudgment, withToday } from "./_one-house-pr6a-routes";
import { houseRentalTypeIssue, houseUnavoidableIssue } from "@/lib/calc/house-row-required-issues";
import { callOneHouseExemptionAPI } from "@/lib/calc/one-house-exemption-api";

const TODAY = "2026-06-01";
const mk = (form: RulingCase["form"]): RulingCase =>
  ({ id: "p", docNo: "", docDate: "", basis: "current", today: TODAY, summary: "", bucket: "match", form }) as RulingCase;
const BASE = { isOneHousehold: true, transferDate: "2026-05-01", contractTotalPrice: "900000000", asset: { assetKind: "housing", acquisitionDate: "2016-01-01" } };
const H = { id: "h1", acquisitionDate: "2018-01-01", officialPrice: "300000000" };
const RENTAL = { ...H, isLongTermRental: true, rentalRegistrationDate: "2018-02-01", rentalStartDate: "2018-02-01" };
const CASES: [string, RulingCase["form"], boolean][] = [
  ["rental-typeA-no-startprice", { ...BASE, houses: [{ ...RENTAL, rentalType: "A" } as never] }, false],
  ["rental-typeA-filled", { ...BASE, houses: [{ ...RENTAL, rentalType: "A", rentalStartOfficialPrice: "300000000" } as never] }, true],
  ["rental-typeC-no-area", { ...BASE, houses: [{ ...RENTAL, rentalType: "C", rentalStartOfficialPrice: "300000000" } as never] }, false],
  ["rental-typeC-filled", { ...BASE, houses: [{ ...RENTAL, rentalType: "C", rentalStartOfficialPrice: "300000000", rentalLandArea: "100", rentalTotalFloorArea: "80" } as never] }, true],
  ["unavoidable-unresolved-no-years-no-price", { ...BASE, houses: [{ ...H, isUnavoidableReason: true, unavoidableReasonUnresolved: true } as never] }, false],
  ["unavoidable-filled", { ...BASE, houses: [{ ...H, isUnavoidableReason: true, unavoidableReasonUnresolved: true, unavoidableResidenceYears: "2", acquisitionOfficialPrice: "200000000" } as never] }, true],
  ["decedent-date-equals-inheritance", { ...BASE, asset: { ...BASE.asset, acquisitionCause: "inheritance", decedentAcquisitionDate: "2016-01-01" } }, false],
  ["decedent-date-before", { ...BASE, asset: { ...BASE.asset, acquisitionCause: "inheritance", decedentAcquisitionDate: "2010-01-01" } }, true],
  ["transfer-equals-acquisition", { ...BASE, transferDate: "2016-01-01" }, false],
];

describe("S09-1 anchor — 판정 메뉴 ⑧이 ⑫ 400보다 먼저 잡는다(VD-1 규약)", () => {
  for (const [name, f, ok] of CASES) {
    it(`${name} → ${ok ? "⑧ 통과·200" : "⑫ 400 이고 ⑧ error ≥1"}`, async () => {
      await withToday(TODAY, async () => {
        const r = await runJudgment(buildCaseForm(mk(f)));
        const v8 = r.ve.filter((x) => x.startsWith("error"));
        if (ok) {
          expect(v8).toEqual([]);
          expect(r.status).toBe(200);
        } else {
          expect(r.status).toBe(400); // 전제: ⑫는 막는다
          expect(v8.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe("S09-1 anchor — leaf (계산기 ⑧과 공유)", () => {
  it("houseRentalTypeIssue: 유형별 필수 칸 — 비면 그 칸 이름과 사용자 문구를 낸다", () => {
    expect(houseRentalTypeIssue({ isLongTermRental: true, rentalType: "A" })).toEqual({
      field: "rentalStartOfficialPrice",
      message: "임대개시 당시 공시가격을 입력하세요.",
    });
    expect(houseRentalTypeIssue({ isLongTermRental: true, rentalType: "B" })?.field).toBe("acquisitionOfficialPrice");
    expect(houseRentalTypeIssue({ isLongTermRental: true, rentalType: "G" })?.field).toBe("rentalCancellationDate");
    // 긍정 짝 — 임대 토글이 꺼져 있거나 유형이 없으면 요구하지 않는다
    expect(houseRentalTypeIssue({ isLongTermRental: false, rentalType: "A" })).toBeNull();
    expect(houseRentalTypeIssue({ isLongTermRental: true })).toBeNull();
  });
  it("houseUnavoidableIssue: 거주기간 → 취득 당시 기준시가 순", () => {
    expect(houseUnavoidableIssue({ isUnavoidableReason: true })?.field).toBe("unavoidableResidenceYears");
    expect(houseUnavoidableIssue({ isUnavoidableReason: true, unavoidableResidenceYears: "2" })?.field).toBe("acquisitionOfficialPrice");
    expect(houseUnavoidableIssue({ isUnavoidableReason: true, unavoidableResidenceYears: "2", acquisitionOfficialPrice: "1" })).toBeNull();
    expect(houseUnavoidableIssue({ isUnavoidableReason: false })).toBeNull();
  });
});

describe("S09-1 anchor — ⑬ fieldErrors를 사용자 문구로 낸다", () => {
  it("400 응답의 fieldErrors가 화면 문구에 칸 이름과 사유로 실린다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: "INVALID_INPUT",
            message: "입력값이 올바르지 않습니다",
            fieldErrors: { "houses.1.rentalStartOfficialPrice": ["장기임대 A유형: 임대개시 당시 공시가격이(가) 필요합니다"] },
          },
        }),
      })),
    );
    try {
      const form = buildCaseForm(mk(BASE as RulingCase["form"]));
      await expect(callOneHouseExemptionAPI(form)).rejects.toThrow(/임대개시 당시 공시가격/);
      // 긍정 짝 — fieldErrors가 없으면 종전 message 그대로
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: { message: "서버 오류" } }) })));
      await expect(callOneHouseExemptionAPI(form)).rejects.toThrow("서버 오류");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
