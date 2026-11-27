/**
 * ⑭ 국외 부동산 route의 엔진 input 매핑 — API body(Zod 출력, 날짜는 string|Date) → 엔진 `ForeignRealEstateInput`(Date).
 *
 * 날짜는 전부 `toDate`로 바꾼다(`lib/api/date-coerce.ts` — JSON을 거치면 string이라 `Date < string`이 조용히 false가 되는 함정 차단).
 * 필드를 하나씩 옮기므로 엔진 타입에 필드가 늘면 컴파일이 여기서 막는다. Zod 쪽 loss-gain refine도 이 함수를 쓴다(같은 변환).
 * 엔진에 칸이 없는 입력(`acquisitionCause`·`foreignBorrowAcquired`)은 옮기지 않는다 — Zod가 매매·false만 통과시킨다.
 */
import { toDate } from "@/lib/api/date-coerce";
import type { ForeignMoneyItem, ForeignRealEstateInput } from "@/lib/tax-engine/foreign-realestate/types";
import type { ForeignRealEstateBaseInput } from "./transfer-foreign-schema";

type ApiMoney = ForeignRealEstateBaseInput["assets"][number]["transfer"];

function money(m: ApiMoney, field: string): ForeignMoneyItem {
  return { amountForeign: m.amountForeign, currency: m.currency, date: toDate(m.date, `${field}.date`), exchangeRate: m.exchangeRate };
}

export function toForeignRealEstateEngineInput(data: ForeignRealEstateBaseInput): ForeignRealEstateInput {
  return {
    domesticResidenceYears: data.domesticResidenceYears,
    assets: data.assets.map((a, i) => {
      const p = `assets[${i}]`;
      return {
        id: a.id,
        kind: a.kind,
        transferDate: toDate(a.transferDate, `${p}.transferDate`),
        acquisitionDate: toDate(a.acquisitionDate, `${p}.acquisitionDate`),
        transfer: money(a.transfer, `${p}.transfer`),
        acquisition: money(a.acquisition, `${p}.acquisition`),
        capitalExpenditures: a.capitalExpenditures.map((m, j) => money(m, `${p}.capitalExpenditures[${j}]`)),
        transferCosts: a.transferCosts.map((m, j) => money(m, `${p}.transferCosts[${j}]`)),
      };
    }),
    ...(data.foreignTax
      ? {
          foreignTax: {
            method: data.foreignTax.method,
            items: data.foreignTax.items.map((m, i) => ({ assetId: m.assetId, ...money(m, `foreignTax.items[${i}]`) })),
          },
        }
      : {}),
  };
}
