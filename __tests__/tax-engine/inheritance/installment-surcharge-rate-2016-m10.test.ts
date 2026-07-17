/**
 * Anchor — M-10 연부연납 가산율 2016 시행일 경계 (국기칙 §19의3)
 *
 * 기획재정부령 제543호(2016.3.7 공포·시행)로 국세환급가산금 이자율이 연 1천분의 25 → 1천분의 18로
 * 인하(국가법령정보센터 제·개정이유 확인). 따라서 2016-03-06까지는 2.5%, 2016-03-07부터 1.8%.
 * 종전 코드는 { from: "2016-03-06", rate: 0.018 }로 하루 이르게 적용했음.
 */
import { describe, it, expect } from "vitest";
import { lookupSurchargeRate } from "@/lib/tax-engine/data/installment-surcharge-rates";

describe("M-10 가산율 2016 시행일 (제543호 2016.3.7)", () => {
  it("[M10-A] 2016-03-06 → 2.5% (제543호 시행 전, 종전 제473호 유지)", () => {
    expect(lookupSurchargeRate(new Date("2016-03-06"))).toBe(0.025);
  });

  it("[M10-B] 2016-03-07 → 1.8% (제543호 시행일)", () => {
    expect(lookupSurchargeRate(new Date("2016-03-07"))).toBe(0.018);
  });

  it("[M10-C] 2016-03-05 → 2.5%", () => {
    expect(lookupSurchargeRate(new Date("2016-03-05"))).toBe(0.025);
  });

  it("[M10-D] 인접 경계 불변 — 2015-03-06 2.5% · 2017-03-15 1.6%", () => {
    expect(lookupSurchargeRate(new Date("2015-03-06"))).toBe(0.025);
    expect(lookupSurchargeRate(new Date("2017-03-15"))).toBe(0.016);
  });
});
