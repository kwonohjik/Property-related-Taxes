/**
 * anchor — 판정 메뉴 조정대상지역: 법정동코드 없이 주소 문자열만 있을 때 계산기와 같은 판정.
 * 계획서: `docs/00-pm/judgment-menu-regulated-area-address.plan.md` §4 J-1~J-9 · H-1 (Q-1~Q-4 a).
 *
 * 판정 메뉴 ④·⑧·⑤가 토글 저장값만 읽어, 같은 사실을 계산기로 넘기면 결론이 뒤집혔다(§1 P-1~P-3).
 * 지금은 계산기 leaf(`calcStoredRegulatedFlags`)를 같이 쓰고, 토글이 「직접 만짐」 표지를 세운다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { runJudgment, handoff } from "./_one-house-pr6a-routes";
import {
  createInitialOneHouseJudgmentForm,
  normalizeOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { buildMultiHouseSurchargeApiBody } from "@/lib/calc/multi-house-surcharge-api";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { POST } from "@/app/api/calc/transfer/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

const GANGNAM = "서울특별시 강남구 역삼동 1";
const NAMYANGJU_HWADO = "경기도 남양주시 화도읍 1";
const JEJU = "제주특별자치도 제주시 1";

type Opt = {
  acq?: string;
  was?: boolean;
  isReg?: boolean;
  wasTouched?: boolean;
  isRegTouched?: boolean;
  code?: string;
  kind?: string;
};

function jf(addr: string, o: Opt = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2026-06-01",
    contractTotalPrice: "1000000000",
    wasRegulatedAtAcquisition: o.was ?? false,
    isRegulatedArea: o.isReg ?? false,
    wasRegulatedAtAcquisitionTouched: o.wasTouched ?? false,
    isRegulatedAreaTouched: o.isRegTouched ?? false,
    assets: [
      {
        ...f.assets[0],
        assetKind: o.kind ?? "housing",
        acquisitionCause: "purchase",
        acquisitionDate: o.acq ?? "2018-06-01",
        addressJibun: addr,
        regionCode: o.code ?? "",
        residencePeriods: [],
        residencePeriodMonthsAsset: "0",
        rentalHousingException: { ...f.assets[0].rentalHousingException, phrp154_10Answer: "no" },
      },
    ],
  } as OneHouseJudgmentFormData;
}

const flags = (b: { isRegulatedArea?: boolean; wasRegulatedAtAcquisition?: boolean }) => [b.isRegulatedArea, b.wasRegulatedAtAcquisition];

/** 판정 메뉴 → 핸드오프 → 계산기 ④(fetch 가로채기) → 계산기 route. 취득가액 3억은 계산기에서 넣는다. */
async function calcAfterHandoff(form: OneHouseJudgmentFormData) {
  const base = handoff(form);
  const c = { ...base, assets: [{ ...base.assets[0], fixedAcquisitionPrice: "300000000" }] } as TransferFormData;
  const issues = [0, 1, 2, 3].map((st) => validateStepDetailed(st, c)?.message).filter(Boolean);
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  try {
    await callTransferTaxAPI(c);
  } finally {
    vi.unstubAllGlobals();
  }
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(cap.body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  return { issues, body: cap.body as Record<string, boolean>, status: res.status, result: j?.data?.result };
}

describe("판정 메뉴 조정대상지역 — 주소 문자열 판정이 계산기와 같다", () => {
  it("[J-1] 강남 문자열 · 토글 안 만짐 → 판정 메뉴도 조정대상지역(과세) = 계산기 230,967,000", async () => {
    const f = jf(GANGNAM);
    const m = await runJudgment(f);
    expect(m.ve).toEqual([]);
    expect(flags(m.body)).toEqual([true, true]);
    expect(m.data.judgment.isExempt).toBe(false);
    const c = await calcAfterHandoff(f);
    expect(c.issues).toEqual([]);
    expect(flags(c.body)).toEqual([true, true]);
    expect(c.result.isExempt).toBe(false);
    expect(c.result.totalTax).toBe(230_967_000);
  });

  it("[J-2·H-1] J-1 + 취득 당시 토글을 직접 「아니오」 → 판정 메뉴 비과세 · 표지가 계산기로 넘어가 계산기도 비과세", async () => {
    const f = jf(GANGNAM, { was: false, wasTouched: true });
    const m = await runJudgment(f);
    expect(m.body.wasRegulatedAtAcquisition).toBe(false);
    expect(m.data.judgment.isExempt).toBe(true);
    const patch = toTransferFormPatch(f);
    expect(patch.wasRegulatedAtAcquisitionTouched).toBe(true);
    expect(patch.isRegulatedAreaTouched).toBe(false);
    const c = await calcAfterHandoff(f);
    expect(c.body.wasRegulatedAtAcquisition).toBe(false);
    expect(c.result.isExempt).toBe(true);
    expect(c.result.totalTax).toBe(0);
  });

  it("[J-3] 남양주 화도읍(시군구 단위 · medium) · 안 만짐 → 본문 [아니오, 조정] · 두 메뉴 같은 결론", async () => {
    const f = jf(NAMYANGJU_HWADO, { acq: "2020-12-01" });
    const m = await runJudgment(f);
    expect(flags(m.body)).toEqual([false, true]);
    expect(m.data.judgment.isExempt).toBe(false);
    const c = await calcAfterHandoff(f);
    expect(flags(c.body)).toEqual([false, true]);
    expect(c.result.isExempt).toBe(false);
    expect(c.result.totalTax).toBe(250_371_000);
  });

  it("[J-4] 제주(데이터 미수록) · 사용자가 두 토글을 직접 「예」 → 판정 메뉴 과세 = 계산기 과세", async () => {
    const f = jf(JEJU, { was: true, isReg: true, wasTouched: true, isRegTouched: true });
    const m = await runJudgment(f);
    expect(flags(m.body)).toEqual([true, true]);
    expect(m.data.judgment.isExempt).toBe(false);
    const c = await calcAfterHandoff(f);
    expect(flags(c.body)).toEqual([true, true]);
    expect(c.result.isExempt).toBe(false);
    expect(c.result.totalTax).toBeGreaterThan(0);
  });

  it("[J-5] 법정동코드 있음 → 코드 판정 그대로(만진 저장값도 무시)", () => {
    const f = jf(GANGNAM, { code: "1168010100", was: false, wasTouched: true });
    expect(flags(buildOneHouseExemptionApiBody(f))).toEqual([true, true]);
  });

  it("[J-6] 주소 없음 → 토글 저장값(기본 아니오) — D-6 그대로", () => {
    expect(flags(buildOneHouseExemptionApiBody(jf("")))).toEqual([false, false]);
    expect(flags(buildOneHouseExemptionApiBody(jf("", { was: true, isReg: true })))).toEqual([true, true]);
  });

  it("[J-7] 입주권 양도 + 강남 문자열 → 표지를 보지 않고 주소 판정(계산기 leaf와 같다)", () => {
    const f = jf(GANGNAM, { kind: "right_to_move_in", was: false, isReg: false, wasTouched: true, isRegTouched: true });
    expect(flags(buildOneHouseExemptionApiBody(f))).toEqual([true, true]);
  });

  it("[J-8] 옛 판정 기록 — 값 true·표지 false는 사용자 선택으로 보고 표지를 세운다, false는 그대로", () => {
    const raw = { ...jf(JEJU), wasRegulatedAtAcquisition: true, isRegulatedArea: false } as unknown as Record<string, unknown>;
    const n = normalizeOneHouseJudgmentForm(raw);
    expect(n.wasRegulatedAtAcquisitionTouched).toBe(true);
    expect(n.isRegulatedAreaTouched).toBe(false);
    expect(flags(buildOneHouseExemptionApiBody(n))).toEqual([false, true]);
  });

  it("[J-9] 다주택 중과 메뉴 본문도 같은 값 — 강남 문자열 안 만짐 → 양도 당시 조정대상지역", () => {
    const s = buildMultiHouseSurchargeApiBody(jf(GANGNAM)) as { property: { isRegulatedArea?: boolean } };
    expect(s.property.isRegulatedArea).toBe(true);
  });
});
