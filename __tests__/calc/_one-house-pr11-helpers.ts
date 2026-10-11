/** PR11 anchor 공용 — 판정 메뉴(observeCase)와 계산기(④ callTransferTaxAPI 본문 가로채기 → route ⑫⑭) 관측. */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as POST_TRANSFER } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";

/** 판정 메뉴 1건 관측 — 조정 지역(강남)·9억·거주 0이 기본. */
export function judge(o: {
  regionCode?: string;
  acq: string;
  transfer: string;
  residence?: string;
  asset?: Record<string, unknown>;
  top?: Record<string, unknown>;
}) {
  const c: RulingCase = {
    id: "probe", docNo: "-", docDate: "-", basis: "era", today: o.transfer, summary: "pr11", bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: o.transfer,
      contractTotalPrice: "900000000",
      ...(o.top ?? {}),
      asset: {
        assetKind: "housing",
        acquisitionDate: o.acq,
        regionCode: o.regionCode ?? "1168010100",
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: o.residence ?? "0",
        ...(o.asset ?? {}),
      },
    } as RulingCase["form"],
  };
  return observeCase(c);
}

export function calcForm(o: {
  regionCode?: string; acq: string; transfer: string;
  asset?: Record<string, unknown>; top?: Record<string, unknown>;
}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = o.transfer;
  f.isOneHousehold = true;
  f.contractTotalPrice = "900000000";
  f.householdNoPresaleRightsConfirmed = true;
  f.householdNoOtherHousesConfirmed = true;
  f.residencePeriodMonths = "0";
  Object.assign(f.assets[0], {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: o.acq,
    actualSalePrice: "900000000", fixedAcquisitionPrice: "300000000",
    addressJibun: "테스트 주소 1", regionCode: o.regionCode ?? "1168010100",
    residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
    ...(o.asset ?? {}),
  });
  Object.assign(f, o.top ?? {});
  return f;
}

export async function runCalc(form: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(form); } catch { /* 본문만 본다 */ }
  vi.unstubAllGlobals();
  const res = await POST_TRANSFER(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
    body: JSON.stringify(cap.body),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  const result = json?.data?.result;
  return { status: res.status, result, isExempt: result?.isExempt as boolean | undefined, totalTax: result?.totalTax as number | undefined, warnings: (result?.warnings ?? []) as string[] };
}
