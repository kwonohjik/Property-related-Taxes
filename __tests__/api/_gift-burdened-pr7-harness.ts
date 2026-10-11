/** 1h-PR7(부담부증여 → 양도 경로) anchor 공용 하네스 — 증여 ④ buildGiftBurdenedTransferBody → POST /api/calc/transfer(⑫·⑭). */
import { vi, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

export type Obj = Record<string, unknown>;

export const giftForm = (giftDate: string): FormState =>
  ({ giftDate, donor: "father", donorRelation: "lineal_ascendant_adult", priorGifts: [] }) as unknown as FormState;

export function giftItem(
  bgt: Partial<BurdenedGiftTransferTaxInput>,
  opts: { standardPrice?: number; debt?: number; pnu?: string } = {},
): EstateItem {
  const debt = opts.debt ?? 150_000_000;
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: opts.standardPrice ?? 300_000_000,
    leaseDeposit: debt,
    mortgageAmount: 0,
    assumedDebtForGift: debt,
    monthlyRent: 0,
    ...(opts.pnu ? { estateAddress: { jibun: "서울특별시 강남구 역삼동 12-34", pnu: opts.pnu } } : {}),
    burdenedGiftTransferTax: {
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      isUnregistered: false,
      ...bgt,
    },
  } as EstateItem;
}

export const post = (body: unknown) =>
  SINGLE(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

export async function run(body: unknown): Promise<Obj> {
  const res = await post(body);
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 600)).toBe(200);
  return json.data.result;
}

export const giftBody = (
  giftDate: string,
  bgt: Partial<BurdenedGiftTransferTaxInput>,
  opts?: { standardPrice?: number; debt?: number; pnu?: string },
) => buildGiftBurdenedTransferBody(giftItem(bgt, opts), giftForm(giftDate)) as Obj;

export const gift = (
  giftDate: string,
  bgt: Partial<BurdenedGiftTransferTaxInput>,
  opts?: { standardPrice?: number; debt?: number; pnu?: string },
) => run(giftBody(giftDate, bgt, opts));

export async function bodyOf(send: () => Promise<unknown>): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as Obj;
}
export const transfer = async (f: TransferFormData) => run(await bodyOf(() => callTransferTaxAPI(f)));

export const pick = (r: Obj, keys: string[]) => Object.fromEntries(keys.map((k) => [k, r[k]]));

