/**
 * @vitest-environment jsdom
 *
 * anchor: 비상장주식 사업연도표(FiscalYearAdjustmentTable)의 날짜 표시가 브라우저 시간대와 무관하다.
 *
 * 결함: 화면 날짜는 UTC 자정 Date(`new Date("YYYY-MM-DD")`)로 들고 다니는데, Date → "YYYY-MM-DD" 변환이 로컬 getter를 써서
 * UTC 서쪽(미주) 브라우저에서는 2024-12-31을 입력하면 2024-12-30으로 다시 그려졌다(입력 → 저장 → 표시 왕복이 하루 어긋남).
 * 정답 = UTC 달력. 이 파일은 `process.env.TZ`를 바꾼다 → node-isolated로 분류된다.
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FiscalYearAdjustmentTable } from "@/components/calc/inheritance/unlisted-stock-v2/FiscalYearAdjustmentTable";
import type { FiscalYearAdjustment } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

const ORIGINAL_TZ = process.env.TZ;
afterEach(cleanup);
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const fy = (label: string, end: string, start?: string): FiscalYearAdjustment =>
  ({
    fiscalYearLabel: label,
    fiscalYearEndDate: new Date(`${end}T00:00:00.000Z`),
    ...(start ? { fiscalYearStartDate: new Date(`${start}T00:00:00.000Z`) } : {}),
    taxableIncome: 0,
  }) as unknown as FiscalYearAdjustment;

describe("FiscalYearAdjustmentTable — 날짜 표시는 UTC 달력", () => {
  for (const tz of ["UTC", "Asia/Seoul", "America/New_York", "America/Los_Angeles", "Pacific/Auckland"]) {
    it(`[${tz}] 종료일 2024-12-31 · 2023-01-01 · 2022-06-30, 개시일 2024-01-01이 그대로 보인다`, () => {
      process.env.TZ = tz;
      const { getAllByLabelText } = render(
        <FiscalYearAdjustmentTable
          fiscalYears={[fy("2024", "2024-12-31", "2024-01-01"), fy("2023", "2023-01-01"), fy("2022", "2022-06-30")]}
          onChange={() => {}}
        />,
      );
      const read = (label: string) => getAllByLabelText(label).map((el) => (el as HTMLInputElement).value);
      // 행마다 [개시일, 종료일] 순 → 6칸
      expect(read("연도")).toEqual(["2024", "2024", "", "2023", "", "2022"]);
      expect(read("월")).toEqual(["1", "12", "", "1", "", "6"]);
      expect(read("일")).toEqual(["1", "31", "", "1", "", "30"]);
    });
  }
});
