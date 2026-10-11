/**
 * S02-6 anchor — 양도일 현재 비거주자는 본체 판정이 과세여도 「이 날짜 이후 양도하면 비과세」 안내가 없고 §121② 사유가 붙는다.
 *
 * 「소득세법」 제121조제2항 단서 · 「소득세법 시행령」 제180조의2제1항: 2010.1.1. 이후 양도하는 비거주자에게는 §89①3호(와 §155 특례)를
 * 적용하지 않는다 — 예외는 §154①2호 나·다목 요건을 충족한 경우뿐이다. 그래서 본체가 보유 미달로 과세(pending: 보유 2년 경과일)여도
 * 「그 날 양도하면 비과세」는 비거주자에게 성립하지 않는다. 결론(과세)은 종전에도 맞았다.
 * 경로: 판정 메뉴 ⑧→④→⑫⑭ + 배지 술어. 판정 메뉴 전용 입력이다(계산기는 이 입력을 보내지 않는다).
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { observeCase, buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { oneHouseVerdictOf } from "@/lib/calc/one-house-judgment-verdict";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

type Over = { nonResident: boolean; acq: string; transfer?: string; proviso?: Record<string, unknown> };
const mk = (o: Over): RulingCase => ({
  id: "S02-6",
  docNo: "-",
  docDate: "-",
  basis: "current",
  today: o.transfer ?? "2024-06-15",
  summary: "",
  bucket: "match",
  form: {
    isOneHousehold: true,
    transferDate: o.transfer ?? "2024-06-15",
    contractTotalPrice: "500000000",
    transferorNonResident: o.nonResident,
    asset: {
      assetKind: "housing",
      acquisitionDate: o.acq,
      regionCode: "4377037000", // 충북 음성 — 취득 당시 조정 이력 없음(거주요건 잡음 없음)
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "0",
    },
    ...(o.proviso ?? {}),
  } as RulingCase["form"],
});

async function rawJudgment(c: RulingCase) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(buildOneHouseExemptionApiBody(buildCaseForm(c, "form"))),
      }),
    );
    return (await res.json())?.data?.judgment;
  } finally {
    vi.useRealTimers();
  }
}

describe("S02-6 — 비거주자 + 본체 과세", () => {
  it("보유 미달(취득 2023-03-01 · 양도 2024-06-15): pending 비움 · non-resident-121-2 · 배지에 「양도일을 조정하면」 없음", async () => {
    const o = await observeCase(mk({ nonResident: true, acq: "2023-03-01" }));
    expect(o.status).toBe(200);
    expect(o.isExempt).toBe(false);
    expect(o.pending).toEqual([]);
    expect(o.unmetExceptions).toContain("non-resident-121-2");
    const j = await rawJudgment(mk({ nonResident: true, acq: "2023-03-01" }));
    expect(j.pending ?? []).toEqual([]);
    expect(oneHouseVerdictOf(j).detail).not.toContain("양도일을 조정하면");
  });

  it("(긍정 짝) 같은 사실의 거주자는 종전대로 보유 2년 pending이 남는다", async () => {
    const o = await observeCase(mk({ nonResident: false, acq: "2023-03-01" }));
    expect(o.isExempt).toBe(false);
    expect(o.pending).toContain("154-1-holding-years");
    expect(o.unmetExceptions).not.toContain("non-resident-121-2");
  });

  it("(짝) 보유를 채운 비거주자 — 비과세를 거둔다(종전과 같은 경로)", async () => {
    const o = await observeCase(mk({ nonResident: true, acq: "2020-03-01" }));
    expect(o.isExempt).toBe(false);
    expect(o.pending).toEqual([]);
    expect(o.unmetExceptions).toContain("non-resident-121-2");
  });

  it("2010.1.1. 전 양도분은 이 규정이 없다 — 본체 pending을 그대로 둔다 (범위 밖 고정)", async () => {
    const o = await observeCase(mk({ nonResident: true, acq: "2008-03-01", transfer: "2009-06-15" }));
    expect(o.isExempt).toBe(false);
    expect(o.unmetExceptions).not.toContain("non-resident-121-2");
  });
});
