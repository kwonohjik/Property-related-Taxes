/**
 * anchor — 소령 §167의3①2호 바목 9억 상한 · 아·자목 2025.6.4. 하한의 기준일 = 지자체 민간임대주택 등록(신청)일 (V-5).
 *
 * 근거: 대통령령 제35349호(2025.2.28.) 부칙 제15조
 *   ① 「제167조의3제1항제2호바목의 개정규정은 이 영 시행 이후 민간임대주택으로 등록한 장기일반민간임대주택등을 양도하는 경우부터 적용한다.」
 *   ② 「제167조의3제1항제2호아목 및 자목의 개정규정은 2025년 6월 4일 이후 민간임대주택으로 등록한 단기민간임대주택을 양도하는 경우부터 적용한다.」
 * 「사업자등록등」(세무서 §168 + 민특법 §5)이 아니라 민간임대주택 등록이다. 종전 코드는 max(세무서, 지자체)로 판정해, 지자체 등록이 경계 전이고
 * 세무서 등록만 경계 뒤인 주택에 9억 상한·아·자목을 적용했다(유리 방향 오적용). 화면 칸은 「지자체 임대사업자등록신청일」 — 신청일 ≤ 등록일이라
 * 신청일 대용은 두 게이트 모두 불리 방향이다(2020.7.11. 컷오프의 R-1 결정과 같은 축).
 *
 * | # | 주장 |
 * |---|---|
 * | B-1 | 바목: 지자체 2025-01-15 · 세무서 2025-03-10 · 임대개시 기준시가 7억 → 6억 상한 · 불성립 |
 * | B-2 | [짝] 지자체 2025-03-10 · 세무서 2025-01-15 → 9억 · 성립 / 지자체 2025-02-28(시행일 당일) → 9억 |
 * | B-3 | 아목: 지자체 2025-05-01 · 세무서 2025-07-01 → REG_DATE_GATE / [짝] 지자체 2025-06-04 · 세무서 2025-05-01 → 성립 |
 * | B-4 | ⑤ 임대 구분 활성(`deriveCategoryAvailability`)도 같은 기준일 — 아·자 단기 6년 |
 */
import { describe, it, expect } from "vitest";
import { checkRentalArticle, type NormalizedRentalUnit } from "@/lib/tax-engine/rental-article/check";
import { deriveCategoryAvailability } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";

const d = (s: string) => new Date(s);
const unit = (rent: string, biz: string, over: Partial<NormalizedRentalUnit> = {}): NormalizedRentalUnit =>
  ({
    isCapitalArea: true,
    isApartment: false,
    acquisitionOfficialPrice: 0,
    rentalYears: 10,
    landAreaM2: 200,
    totalFloorAreaM2: 100,
    hasMinimum2Units: true,
    rentIncreaseUnder5Pct: true,
    rentalStartOfficialPrice: 700_000_000,
    rentalRegistrationDate: d(rent),
    businessRegistrationDate: d(biz),
    ...over,
  }) as NormalizedRentalUnit;

describe("바목 9억 상한 — 부칙 제35349호 §15①", () => {
  it("B-1 지자체 등록이 2025.2.28. 전이면 세무서 등록이 뒤여도 6억", () => {
    const r = checkRentalArticle("바", unit("2025-01-15", "2025-03-10"));
    expect(r.stdPriceCap).toBe(600_000_000);
    expect(r.passed).toBe(false);
    expect(r.failCodes).toContain("STANDARD_PRICE_EXCEEDED");
  });

  it("B-2 [짝] 지자체 등록이 시행일 당일·이후면 9억", () => {
    const after = checkRentalArticle("바", unit("2025-03-10", "2025-01-15"));
    expect(after.stdPriceCap).toBe(900_000_000);
    expect(after.passed).toBe(true);
    expect(checkRentalArticle("바", unit("2025-02-28", "2025-01-15")).stdPriceCap).toBe(900_000_000);
  });
});

describe("아·자목 2025.6.4. 하한 — 부칙 제35349호 §15②", () => {
  const short = (rent: string, biz: string) => unit(rent, biz, { rentalYears: 6, rentalStartOfficialPrice: 300_000_000 });

  it("B-3 지자체 등록이 6.4. 전이면 세무서 등록이 뒤여도 불성립 · [짝] 6.4. 당일은 성립", () => {
    expect(checkRentalArticle("아", short("2025-05-01", "2025-07-01")).failCodes).toContain("REG_DATE_GATE");
    const ok = checkRentalArticle("아", short("2025-06-04", "2025-05-01"));
    expect(ok.failCodes).not.toContain("REG_DATE_GATE");
    expect(ok.passed).toBe(true);
  });

  it("B-4 ⑤ 임대 구분 활성도 지자체 등록일 기준", () => {
    expect(deriveCategoryAvailability(d("2025-07-01"), d("2025-05-01")).short_6y.available).toBe(false);
    expect(deriveCategoryAvailability(d("2025-05-01"), d("2025-06-04")).short_6y.available).toBe(true);
  });
});
