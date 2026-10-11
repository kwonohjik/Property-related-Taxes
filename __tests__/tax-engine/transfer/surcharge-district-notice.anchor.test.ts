/**
 * S02-7(계산기 쪽) — 양도일 조정 여부가 실제로 세율을 가르는 곳은 계산기 다주택 중과다. 양도 주택이 「동 안 일부 지구만 조정대상지역」인 동이고
 * 지구 안·밖을 고르지 않아 중과가 적용됐으면 그 확인 필요를 알린다(1세대1주택 판정 쪽 고지는 결론을 가를 때만 — 별도 anchor).
 *
 * 대화동(고양시 일산서구 4128710400)은 2019.11.8.~2020.6.18.에 킨텍스1단계 도시개발지구만 조정대상지역이었다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";

const DAEHWA = "4128710400";
const NOTICE = "다주택 중과를 적용했습니다(확인 필요)";

function household(transferDate: string, sellingExtra: Record<string, unknown> = {}, houseCount = 2): TransferTaxInput {
  const mk = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    acquisitionDate: new Date("2015-01-01"),
    officialPrice: 300_000_000,
    region: "capital",
    regionCode: DAEHWA,
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...extra,
  });
  const houses = [mk("selling", sellingExtra), ...(houseCount > 1 ? [mk("other", { regionCode: "1168010100" })] : [])];
  return baseTransferInput({
    transferPrice: 800_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2015-01-01"),
    transferDate: new Date(transferDate),
    isRegulatedArea: true,
    regionCode: DAEHWA,
    isOneHousehold: false,
    householdHousingCount: houseCount,
    houses: houses as TransferTaxInput["houses"],
    sellingHouseId: "selling",
  } as Partial<TransferTaxInput>);
}
const run = (i: TransferTaxInput) => calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
const warned = (i: TransferTaxInput) => (run(i).warnings ?? []).some((w) => w.includes(NOTICE));

describe("S02-7 계산기 — 중과가 양도일 지구 미선언에 달려 있으면 확인 필요를 알린다", () => {
  it("2020-05-15 양도 · 2주택 · 지구 미선언 → 중과 적용 + 확인 필요", () => {
    const r = run(household("2020-05-15"));
    expect(r.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(true);
    expect(warned(household("2020-05-15"))).toBe(true);
  });
  it("긍정 짝 — 지구 밖 선언이면 중과가 빠지고 고지도 없다", () => {
    const i = household("2020-05-15", { inDesignatedDistrict: false });
    expect(run(i).multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(false);
    expect(warned(i)).toBe(false);
  });
  it("긍정 짝 — 지구 안 선언이면 중과가 적용되고 고지는 없다(확정)", () => {
    const i = household("2020-05-15", { inDesignatedDistrict: true });
    expect(run(i).multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(true);
    expect(warned(i)).toBe(false);
  });
  it("지구 한정 구간 밖 양도(2020-07-01 — 시 전역 지정)는 묻지 않는다", () => {
    expect(warned(household("2020-07-01"))).toBe(false);
  });
  it("1주택(중과 대상 아님)이면 묻지 않는다", () => {
    const i = household("2020-05-15", {}, 1);
    expect(run(i).multiHouseSurchargeEvaluation?.surchargeApplicable ?? false).toBe(false);
    expect(warned(i)).toBe(false);
  });
});
