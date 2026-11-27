/**
 * 국외전출세 이력 dedup 키 (14지점 점검 F4)
 *
 * 키는 `sec:{종목명}|{extractStockTransferDate}`인데 날짜는 `transferDate`만 읽는다.
 * 국외전출세 폼의 기준일은 `etDepartureDate`(출국일)다 — 같은 사례명·다른 출국일이 같은 키가 되는가.
 */
import { describe, it, expect } from "vitest";
import { extractBusinessKey } from "@/lib/storage/business-key";
import { recomputeRecordBusinessKey } from "@/lib/storage/migrations/business-key-recompute";
import { generateTitle } from "@/lib/storage/title-generator";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";

const CREATED = "2027-03-01T00:00:00.000Z";
const exit = (over: Record<string, unknown>) =>
  ({
    ...createInitialStockFormData(),
    marketType: "exit_tax",
    securityName: "갑 사례",
    ...over,
  }) as unknown as Record<string, unknown>;

describe("F4 국외전출세 businessKey", () => {
  it("같은 사례명·다른 출국일 → 다른 키", () => {
    const a = extractBusinessKey("stock_transfer", exit({ etDepartureDate: "2027-03-10" }));
    const b = extractBusinessKey("stock_transfer", exit({ etDepartureDate: "2027-09-10" }));
    expect(a).not.toBeNull();
    expect(a).not.toBe(b);
  });

  it("같은 사례명·같은 출국일 → 같은 키(갱신 dedup 유지)", () => {
    const a = extractBusinessKey("stock_transfer", exit({ etDepartureDate: "2027-03-10", etYearsResidentLast10: "8" }));
    const b = extractBusinessKey("stock_transfer", exit({ etDepartureDate: "2027-03-10", etYearsResidentLast10: "9" }));
    expect(a).toBe(b);
  });

  it("출국일이 비어 있으면 종전 키(`sec:{이름}|`) 그대로 — 기존 저장 이력 호환", () => {
    expect(extractBusinessKey("stock_transfer", exit({ etDepartureDate: "" }))).toBe("sec:갑 사례|");
  });

  it("제목도 출국일을 보인다(키와 같은 추출기)", () => {
    const t = generateTitle("stock_transfer", exit({ etDepartureDate: "2027-03-10" }), CREATED);
    expect(t).toContain("2027.03.10");
  });

  it("일반 주식 양도 키는 불변", () => {
    const f = { ...createInitialStockFormData(), marketType: "kospi", securityName: "삼성전자", transferDate: "2026-02-20" };
    expect(extractBusinessKey("stock_transfer", f as unknown as Record<string, unknown>)).toBe("sec:삼성전자|2026.02.20");
  });

  it("기존 저장 이력 호환 — 구 키(`sec:이름|`) record는 v9 재계산으로 새 키를 받는다(삭제·증가 없음)", () => {
    const rec: { taxType: string; businessKey?: string; inputData: Record<string, unknown> } = {
      taxType: "stock_transfer",
      businessKey: "sec:갑 사례|",
      inputData: exit({ etDepartureDate: "2027-03-10" }),
    };
    expect(recomputeRecordBusinessKey(rec)).toBe(true);
    expect(rec.businessKey).toBe(extractBusinessKey("stock_transfer", rec.inputData));
    // 이미 새 키면 변화 없음(멱등)
    expect(recomputeRecordBusinessKey(rec)).toBe(false);
  });

  it("국외전출세 키는 같은 이름·같은 날짜의 일반 주식 양도 키와 겹치지 않는다", () => {
    const e = extractBusinessKey("stock_transfer", exit({ etDepartureDate: "2027-03-10" }));
    const f = extractBusinessKey("stock_transfer", {
      ...createInitialStockFormData(),
      marketType: "kospi",
      securityName: "갑 사례",
      transferDate: "2027-03-10",
    } as unknown as Record<string, unknown>);
    expect(e).not.toBe(f);
  });

  it("다종목 합산(__multiStock)도 대표 종목이 국외전출세면 출국일을 본다", () => {
    const a = extractBusinessKey("stock_transfer", { __multiStock: true, items: [exit({ etDepartureDate: "2027-03-10" })] });
    const b = extractBusinessKey("stock_transfer", { __multiStock: true, items: [exit({ etDepartureDate: "2027-09-10" })] });
    expect(a).not.toBe(b);
  });
});
