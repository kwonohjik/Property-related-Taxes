/**
 * 공고 전 매매계약 중과 배제 — 엔진 anchor (계획서 `docs/00-pm/regulated-area-region-code-match.plan.md` §6.2).
 * route 관측은 `__tests__/api/transfer.route.pre-designation-contract.anchor.test.ts`.
 *
 * 법문(소득세법 시행령 MST 286211 실독 2026-09-29 — §167의3①11호 · §167의4③5호 · §167의10①11호 · §167의11①10호 동일):
 * 「조정대상지역의 공고가 있은 날 이전에 해당 지역의 주택을 양도하기 위하여 매매계약을 체결하고 계약금을
 *   지급받은 사실이 증빙서류에 의하여 확인되는 주택」
 *
 * 판정 규칙(계획서 §4·§8.1):
 * - 「공고」 = **양도일에 효력이 있는 지정 구간을 연 공고**(Q-1 — 재지정·동 단위 편입 지역). 11호에 대한 직접 해석은 미확보.
 * - 「이전」 = **당일 포함**(Q-2 — 서면-2021-부동산-0624 §154①5호 같은 문구 차용). 11호 직접 해석은 미확보.
 * - 2017.8.3. 지정분의 공고일 = **2017.11.10.**(재산세제과-73 · 서면-2019-법규재산-4276).
 * - 2018-12-31 · 2020-02-21 · 2021-08-30 차수는 **사용자 결정 Q-5**로 공고일 = 지정 효력일(법적 확인 아님).
 * - 계약금 사실은 **양도 측**(「지급받은」) — 장기임대 아목·마목의 `hasContractDepositProof`(「지급한」)가 아니다(D-3).
 *
 * 시료: 양도가액 20억 · 취득가액 3억 · 2013-06-01 취득 · 2주택(다른 주택 강남 2014) · 세율 = 양도일 기준 프로덕션 fallback.
 * 「종전」 = 이 수정 전 엔진 실측(계획서 §2.2 · §6.2 「현행」).
 *
 * ⚠️ 계획서 §6.2의 RC-6 기대 582,598,500 · RC-7 기대 666,765,000은 **정정**했다 — 계획서가 쓴 대체 입력
 *    (5자리 `41290` 계약 2017-07-01 · 5자리 `41117` 계약 2018-01-01)을 **수정 전 엔진**에 그대로 넣으면
 *    548,938,500 · 635,349,000이 나온다(2026-09-29 origin/master `25a12d99` 실측). 2020-07-01 양도는 보유 7년
 *    (장특 14%)이라 5년(10%)인 RC-1의 666,765,000과 같을 수 없다. 배제 여부 판정은 계획서와 같다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const D = (s: string) => new Date(s);
const GN = "1168010100"; // 강남(시군구 5자리 명부 11680)
const MAPO = "1144010100"; // 마포(명부에 서울 전역 "11"뿐)
const ANYANG = "4117310100"; // 안양 동안(2018-08-28 지정)
const GWACHEON = "4129010100"; // 과천(2023.1.5. 해제 → 2025.10.16. 재지정)
const YEONGTONG = "4111710500"; // 영통 — 광교택지 4개 동 밖(2020-02-21 편입)

const house = (id: string, acq: string, regionCode: string, extra: Partial<HouseInfo> = {}): HouseInfo => ({
  id,
  acquisitionDate: D(acq),
  officialPrice: 300_000_000,
  region: "capital",
  regionCode,
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...extra,
});

/** 양도 주택(`regionCode`) + 다른 주택 강남 2014 · 2주택 */
function calc(regionCode: string, transfer: string, selling: Partial<HouseInfo> = {}) {
  const i: TransferTaxInput = baseTransferInput({
    transferPrice: 2_000_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: D("2013-06-01"),
    transferDate: D(transfer),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    residencePeriodMonths: 0,
    regionCode,
    sellingHouseId: "selling",
    householdHousingCount: 2,
    houses: [house("selling", "2013-06-01", regionCode, selling), house("n", "2014-01-01", GN)],
  });
  const r = calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
  const mh = r.multiHouseSurchargeEvaluation;
  return {
    totalTax: r.totalTax,
    reasons: (mh?.exclusionReasons ?? []).map((e) => e.type).join(","),
    detail: mh?.exclusionReasons?.[0]?.detail ?? "",
  };
}
/** 양도 매매계약 사실(계약일 + 계약금 수령) */
const sale = (contract: string): Partial<HouseInfo> => ({ contractDate: D(contract), saleDepositReceived: true });

/** 2주택 원시 중과(2018.4.1.~2021.5.31. 세율) */
const RAW_2019 = 932_030_000;

describe("공고일 당일·다음날 경계 (±1일 — Q-2 당일 포함)", () => {
  it("RC-4 강남 10자리 · 2019-06-01 양도 · 계약 2017-11-10(2017년 차수 공고일 당일) → 배제 651,057,000 (종전 932,030,000)", () => {
    const r = calc(GN, "2019-06-01", sale("2017-11-10"));
    expect(r).toMatchObject({ totalTax: 651_057_000, reasons: "pre_designation_contract" });
    expect(r.detail).toContain("2017-11-10");
    expect(r.detail).toContain("소득세법 시행령 §167의10①11호");
  });
  it("RC-4p [짝] 계약 2017-11-11 → 중과 932,030,000 (종전 932,030,000)", () => {
    expect(calc(GN, "2019-06-01", sale("2017-11-11"))).toMatchObject({ totalTax: RAW_2019, reasons: "" });
  });

  it("RC-5 안양 동안 10자리 · 계약 2018-08-28(공고일 당일) → 배제 651,057,000 (종전 932,030,000)", () => {
    expect(calc(ANYANG, "2019-06-01", sale("2018-08-28"))).toMatchObject({ totalTax: 651_057_000, reasons: "pre_designation_contract" });
  });
  it("RC-5p [짝] 계약 2018-08-29 → 중과 932,030,000", () => {
    expect(calc(ANYANG, "2019-06-01", sale("2018-08-29"))).toMatchObject({ totalTax: RAW_2019, reasons: "" });
  });
});

describe("재지정·동 단위 편입 — 양도일에 효력이 있는 지정 구간을 연 공고 (Q-1)", () => {
  it("RC-6 과천 · 2026-08-01 양도 · 계약 2025-10-16(재지정 공고일 당일) → 배제 548,938,500 (종전 1,141,178,500)", () => {
    const r = calc(GWACHEON, "2026-08-01", sale("2025-10-16"));
    expect(r).toMatchObject({ totalTax: 548_938_500, reasons: "pre_designation_contract" });
    expect(r.detail).toContain("2025-10-16");
  });
  it("RC-6p [짝] 계약 2025-10-17 → 중과 1,141,178,500", () => {
    expect(calc(GWACHEON, "2026-08-01", sale("2025-10-17"))).toMatchObject({ totalTax: 1_141_178_500, reasons: "" });
  });

  it("RC-7 영통(광교 4개 동 밖) · 2020-07-01 양도 · 계약 2019-06-01 → 배제 635,349,000 (종전 932,030,000) — 이 동은 2020-02-21 편입", () => {
    const r = calc(YEONGTONG, "2020-07-01", sale("2019-06-01"));
    expect(r).toMatchObject({ totalTax: 635_349_000, reasons: "pre_designation_contract" });
    expect(r.detail).toContain("2020-02-21");
  });
  it("RC-7b 영통 · 계약 2020-02-21(편입 공고일 당일 — Q-5 사용자 결정) → 배제 635,349,000 · RC-7p 2020-02-22 → 중과 932,030,000", () => {
    expect(calc(YEONGTONG, "2020-07-01", sale("2020-02-21"))).toMatchObject({ totalTax: 635_349_000, reasons: "pre_designation_contract" });
    expect(calc(YEONGTONG, "2020-07-01", sale("2020-02-22"))).toMatchObject({ totalTax: RAW_2019, reasons: "" });
  });

  it("RC-2e 마포(명부 \"11\" 폴백) 10자리 · 2019-06-01 · 계약 2017-07-01 → 배제 651,057,000 (종전 932,030,000)", () => {
    expect(calc(MAPO, "2019-06-01", sale("2017-07-01"))).toMatchObject({ totalTax: 651_057_000, reasons: "pre_designation_contract" });
  });
});

describe("호 시행 전 · 계약금 사실 부재", () => {
  it("RC-8 2018-08-27 양도(호 시행 전 — 제29242호 부칙 제5조) → 중과 932,030,000 · 2018-08-28 → 배제 666,765,000", () => {
    expect(calc(GN, "2018-08-27", sale("2017-07-01"))).toMatchObject({ totalTax: RAW_2019, reasons: "" });
    expect(calc(GN, "2018-08-28", sale("2017-07-01"))).toMatchObject({ totalTax: 666_765_000, reasons: "pre_designation_contract" });
  });

  it("RC-1n [짝] 계약일만 있고 계약금 수령 사실 없음 → 중과 932,030,000", () => {
    expect(calc(GN, "2018-09-01", { contractDate: D("2017-07-01") })).toMatchObject({ totalTax: RAW_2019, reasons: "" });
    expect(calc(GN, "2018-09-01", sale("2017-07-01"))).toMatchObject({ totalTax: 666_765_000, reasons: "pre_designation_contract" });
  });

  it("RC-3e [두 축 분리 — D-3] 장기임대 아목 「계약금 지급 증빙」(hasContractDepositProof)은 11호 사실이 아니다 → 중과 932,030,000", () => {
    expect(
      calc(GN, "2018-09-01", { contractDate: D("2017-07-01"), hasContractDepositProof: true }),
    ).toMatchObject({ totalTax: RAW_2019, reasons: "" });
  });
});
