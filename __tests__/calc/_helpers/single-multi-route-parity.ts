/**
 * 단건 ↔ 다건 계산기 route parity 헬퍼 — 같은 폼을 단건 ④→⑫→⑭, 다건 ④→⑫→⑭로 각각 돌려 결과를 대조한다.
 *
 * 쓰는 쪽은 `vi.mock("@/lib/db/tax-rates")`(preloadTaxRates → loadFallbackTransferRates)와
 * `vi.mock("@/lib/api/rate-limit")`을 직접 건다(vi.mock은 호이스팅되므로 헬퍼 안에서 걸 수 없다).
 * 기대값은 하드코딩하지 않고 **단건 route 결과**로 정한다 — 두 route가 같은 엔진을 쓰므로 어긋나면 배관(⑭) 결함이다.
 */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

type Obj = Record<string, unknown>;

/** 클라이언트 ④ 변환이 fetch로 보내는 본문을 가로챈다(서버는 호출하지 않는다). */
async function captureBody(send: () => Promise<unknown>): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  try {
    await send();
  } catch {
    /* 본문만 필요하다 */
  } finally {
    vi.unstubAllGlobals();
  }
  return body as Obj;
}

const post = (h: (r: NextRequest) => Promise<Response>, url: string, body: unknown) =>
  h(new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

/** 단건 폼 → ④ → 단건 route(⑫→⑭→엔진). */
export async function runSingle(form: TransferFormData) {
  const body = await captureBody(() => callTransferTaxAPI(form));
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as Obj;
  const r = ((json.data as Obj | undefined)?.result ?? {}) as Obj;
  return { status: res.status, isExempt: r.isExempt as boolean | undefined, totalTax: r.totalTax as number | undefined, exemptReason: r.exemptReason as string | undefined, body, json, r };
}

/** 같은 폼들 → 다건 ④ 본문. */
export async function buildMultiBody(forms: TransferFormData[]): Promise<Obj> {
  const mf = { taxYear: Number(forms[0].transferDate.slice(0, 4)), annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  return captureBody(() =>
    callMultiTransferTaxAPI(
      mf,
      forms.map((form, i) => ({ propertyId: `p${i + 1}`, propertyLabel: `p${i + 1}`, form, completionPercent: 100 })),
    ),
  );
}

/** 다건 본문 → 다건 route(⑫→⑭→엔진). */
export async function postMulti(body: Obj) {
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  const json = (await res.json()) as Obj;
  const d = (json.data ?? {}) as Obj;
  const props = (d.properties ?? []) as Obj[];
  return { status: res.status, totalTax: d.totalTax as number | undefined, props, json };
}

/** 같은 폼 1건을 다건 route로 돌린다. */
export async function runMulti(forms: TransferFormData[]) {
  return postMulti(await buildMultiBody(forms));
}
