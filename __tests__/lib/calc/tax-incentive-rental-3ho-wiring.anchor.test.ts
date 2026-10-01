/**
 * anchor — 소령 §167의3①3호 감면대상장기임대주택의 ⑤ 게이트 · ④ 전송 · ⑧ 검증이 **같은 술어**를 본다.
 *
 * 세액 축(폼 → route → 엔진)은 `__tests__/api/transfer.route.tax-incentive-rental-3ho.anchor.test.ts`.
 * 여기서는 그 앞단의 규약을 고정한다:
 *   · 미선언이면 키를 만들지 않는다(종전 페이로드 불변).
 *   · 후단 4사실은 미입력이면 undefined 그대로(엔진의 「모름」 = 판정 보류). false로 채우지 않는다.
 *   · 양도 주택은 2호 선언이 켜져 있으면 임대기간·아파트(나목이면 국민주택규모까지)를 2호 칸에서 쓴다.
 *   · 명부 행은 임대기간·국민주택을 2호와 같은 행 칸으로 싣는다(2호 미선언이어도).
 */
import { describe, it, expect } from "vitest";
// 스키마 모듈 순환 초기화(TDZ)를 정상 순서로 풀기 위해 route를 먼저 적재한다(f14 테스트와 같은 이유).
import "@/app/api/calc/transfer/route";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import { sellingHouseTaxIncentiveRentalVisible } from "@/lib/calc/tax-incentive-rental-scope";
import { houseSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapHousesToEngine } from "@/lib/api/transfer-route-multi-house";
import type { HouseEntry, TaxIncentiveRentalFacts } from "@/lib/stores/calc-wizard-asset-nbl";
import type { RentalDeclaration, TransferFormData } from "@/lib/stores/calc-wizard-store";

type Payload = Record<string, unknown>;

const ROW: HouseEntry = {
  id: "h1",
  region: "capital",
  acquisitionDate: "2012-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};

function form(tir?: TaxIncentiveRentalFacts, ltr?: RentalDeclaration, rows: HouseEntry[] = [ROW]): TransferFormData {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01" };
  f.houses = rows;
  f.householdHousingCount = "2";
  f.sellingHouseExclusion = { taxIncentiveRental: tir, longTermRental: ltr };
  return f;
}
const rowsOf = (f: TransferFormData) =>
  buildHousesPayload(f.assets[0], f.houses, 0, f.sellingHouseExclusion) as Payload[];
const sellingOf = (f: TransferFormData) => rowsOf(f).find((r) => r.id === "selling")!;

const TIR: TaxIncentiveRentalFacts = {
  isTaxIncentiveRental: true,
  rentalPeriodYears: "6",
  isNationalSizeHousing: true,
  isApartment: true,
};
const REG_2HO: RentalDeclaration = {
  isLongTermRental: true,
  isRegisteredRental: true,
  rentalRegistrationDate: "2017-01-01",
  businessRegistrationDate: "2017-01-01",
  rentalPeriodYears: "8",
  isApartment: false,
};

describe("④ 양도 주택 — 3호 선언", () => {
  it("TI-1 미선언이면 3호 키를 만들지 않는다 (종전과 동일)", () => {
    const s = sellingOf(form());
    expect(s).not.toHaveProperty("isTaxIncentiveRental");
    expect(s.isApartment).toBe(false);
    expect(s.rentalPeriodYears).toBeUndefined();
    // 토글 OFF면 남은 값도 싣지 않는다
    expect(sellingOf(form({ ...TIR, isTaxIncentiveRental: false }))).not.toHaveProperty("isTaxIncentiveRental");
  });

  it("TI-2 선언 → 3호 기본 사실 + 아파트, 후단 미입력은 undefined(모름)", () => {
    const s = sellingOf(form(TIR));
    expect(s).toMatchObject({
      isTaxIncentiveRental: true,
      rentalPeriodYears: 6,
      isNationalSizeHousing: true,
      isApartment: true,
      isLongTermRental: false,
    });
    expect(s.isTaxIncentiveRentalPurchase).toBeUndefined();
    expect(s.taxIncentiveRentalRegistrationType).toBeUndefined();
    expect(s.isUrbanLifeHousingApartment).toBeUndefined();
    expect(s.taxIncentiveRentalAptDeadlineExtension).toBeUndefined();
  });

  it("TI-3 후단 사실·⑪ 연장 기산일이 실린다 (빈 칸은 버린다)", () => {
    const s = sellingOf(
      form({
        ...TIR,
        isTaxIncentiveRentalPurchase: true,
        taxIncentiveRentalRegistrationType: "short_term",
        isUrbanLifeHousingApartment: false,
        taxIncentiveRentalAptDeadlineExtension: {
          dutyPeriodEndCancellationDate: "",
          relocationAnnouncementDate: "2027-06-01",
        },
      }),
    );
    expect(s).toMatchObject({
      isTaxIncentiveRentalPurchase: true,
      taxIncentiveRentalRegistrationType: "short_term",
      isUrbanLifeHousingApartment: false,
      taxIncentiveRentalAptDeadlineExtension: {
        dutyPeriodEndCancellationDate: undefined,
        newRegulatedAreaAnnouncementDate: undefined,
        relocationAnnouncementDate: "2027-06-01",
      },
    });
  });

  it("TI-4 2호도 켜져 있으면 임대기간·아파트는 2호 칸 값이다 (같은 주택의 같은 사실)", () => {
    const s = sellingOf(form(TIR, REG_2HO));
    expect(s.isLongTermRental).toBe(true);
    expect(s.isTaxIncentiveRental).toBe(true);
    expect(s.rentalPeriodYears).toBe(8);
    expect(s.isApartment).toBe(false);
    // 국민주택규모는 2호가 나목(B)일 때만 2호 칸을 쓴다
    expect(s.isNationalSizeHousing).toBe(true);
    const b = sellingOf(form(TIR, { ...REG_2HO, rentalType: "B", isNationalSizeHousing: false }));
    expect(b.isNationalSizeHousing).toBe(false);
  });

  it("TI-5 「합산 계산」 경로도 같은 빌더로 싣는다", () => {
    const body = buildPropertyPayload(form(TIR)) as Payload;
    const s = (body.houses as Payload[]).find((r) => r.id === "selling")!;
    expect(s.isTaxIncentiveRental).toBe(true);
    expect(s.rentalPeriodYears).toBe(6);
  });
});

describe("④ 명부 행 — 3호 선언", () => {
  it("TI-6 2호 미선언이어도 임대기간·국민주택이 실린다 (같은 행 칸)", () => {
    const row = rowsOf(
      form(undefined, undefined, [{ ...ROW, isTaxIncentiveRental: true, rentalPeriodYears: "6", isNationalSizeHousing: true }]),
    ).find((r) => r.id === "h1")!;
    expect(row).toMatchObject({ isTaxIncentiveRental: true, rentalPeriodYears: 6, isNationalSizeHousing: true });
    expect(row.isLongTermRental).toBe(false);
  });

  it("TI-7 OFF면 남은 값을 싣지 않는다 (2호 미선언 → 임대기간도 미전송)", () => {
    const row = rowsOf(
      form(undefined, undefined, [{ ...ROW, isTaxIncentiveRental: false, rentalPeriodYears: "6", isNationalSizeHousing: true }]),
    ).find((r) => r.id === "h1")!;
    expect(row).not.toHaveProperty("isTaxIncentiveRental");
    expect(row.rentalPeriodYears).toBeUndefined();
    expect(row.isNationalSizeHousing).toBeUndefined();
  });
});

describe("⑫⑭ — Zod가 벗기지 않고 매퍼가 Date로 옮긴다", () => {
  it("TI-8 후단 4사실이 엔진 HouseInfo까지 도달한다", () => {
    const parsed = houseSchema.parse({
      id: "selling",
      region: "capital",
      acquisitionDate: "2015-01-01",
      officialPrice: 1,
      isInherited: false,
      isLongTermRental: false,
      isTaxIncentiveRental: true,
      isTaxIncentiveRentalPurchase: true,
      taxIncentiveRentalRegistrationType: "long_term_general",
      isUrbanLifeHousingApartment: false,
      taxIncentiveRentalAptDeadlineExtension: { relocationAnnouncementDate: "2027-06-01" },
    });
    const [h] = mapHousesToEngine([parsed])!;
    expect(h.isTaxIncentiveRental).toBe(true);
    expect(h.isTaxIncentiveRentalPurchase).toBe(true);
    expect(h.taxIncentiveRentalRegistrationType).toBe("long_term_general");
    expect(h.isUrbanLifeHousingApartment).toBe(false);
    expect(h.taxIncentiveRentalAptDeadlineExtension?.relocationAnnouncementDate).toEqual(new Date("2027-06-01"));
    expect(h.taxIncentiveRentalAptDeadlineExtension?.dutyPeriodEndCancellationDate).toBeUndefined();
  });

  it("TI-9 enum 밖 등록 유형은 400 (Zod 거부)", () => {
    const r = houseSchema.safeParse({
      id: "x",
      region: "capital",
      acquisitionDate: "2015-01-01",
      officialPrice: 1,
      isInherited: false,
      isLongTermRental: false,
      taxIncentiveRentalRegistrationType: "public",
    });
    expect(r.success).toBe(false);
  });
});

describe("⑤ 노출 게이트 — 2호와 같은 2채", () => {
  it("TI-10 2채면 뜨고 1채면 안 뜬다 · 켜 둔 뒤 1채로 낮춰도 남는다", () => {
    const f = form();
    expect(sellingHouseTaxIncentiveRentalVisible(f)).toBe(true);
    f.householdHousingCount = "1";
    expect(sellingHouseTaxIncentiveRentalVisible(f)).toBe(false);
    const on = form(TIR);
    on.householdHousingCount = "1";
    expect(sellingHouseTaxIncentiveRentalVisible(on)).toBe(true);
  });
});

describe("⑧ 검증 — 임대기간 미입력은 막는다 (엔진은 0년으로 읽어 조용히 불적용)", () => {
  const messages = (f: TransferFormData) => collectStep1Issues(f).map((i) => i.message);

  it("TI-11 양도 주택 — 임대기간 미입력이면 차단, 입력하면 통과", () => {
    expect(messages(form({ ...TIR, rentalPeriodYears: undefined }))).toContain(
      "양도 주택 조특법 감면 임대주택: 임대기간(년)을 입력하세요.",
    );
    expect(messages(form(TIR)).some((m) => m.includes("조특법 감면 임대주택"))).toBe(false);
  });

  it("TI-12 양도 주택 — 2호가 켜져 있으면 2호 칸의 임대기간으로 판정한다", () => {
    const shared = form({ isTaxIncentiveRental: true }, REG_2HO);
    expect(messages(shared).some((m) => m.includes("조특법 감면 임대주택"))).toBe(false);
    const empty2ho = form({ ...TIR }, { ...REG_2HO, rentalPeriodYears: undefined });
    expect(messages(empty2ho)).toContain("양도 주택 조특법 감면 임대주택: 임대기간(년)을 입력하세요.");
  });

  it("TI-13 명부 행 — 3호 선언 + 임대기간 미입력이면 차단", () => {
    const f = form(undefined, undefined, [{ ...ROW, isTaxIncentiveRental: true }]);
    expect(messages(f)).toContain("보유 주택 1: 조특법 감면 임대주택이면 임대기간(년)을 입력하세요.");
  });
});
