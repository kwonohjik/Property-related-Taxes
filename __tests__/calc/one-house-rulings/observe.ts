/** [S05-7] 판정 메뉴 전 구간(폼 → ④ buildOneHouseExemptionApiBody → ⑫ → route ⑭ → 엔진) + ⑧ + oneRightExemption 관측. */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildCaseForm, type RulingCase } from "./harness";

export async function observe(c: RulingCase) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    const form = buildCaseForm(c);
    const ve = validateAllSteps(form).filter((e) => e.severity === "error").map((e) => `${e.field}: ${e.message}`);
    const body = buildOneHouseExemptionApiBody(form);
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any;
    const j = json?.data?.judgment;
    const ids = (xs: { id?: string }[] | undefined) => (xs ?? []).map((x) => x.id ?? "?");
    return {
      status: res.status,
      ex: j?.isExempt,
      partial: j?.isPartialExempt,
      applied: ids(j?.appliedExceptions),
      und: ids(j?.undetermined),
      pend: ids(j?.pending),
      ve,
      clause: json?.data?.oneRightExemption?.clause ?? null,
      reasons: (json?.data?.oneRightExemption?.reasons ?? []) as string[],
      bodyNaDate: (body as { oneRightExemptionFacts?: { otherHouseAcquisitionDate?: string } }).oneRightExemptionFacts?.otherHouseAcquisitionDate,
      err: res.status !== 200 ? JSON.stringify(json).slice(0, 300) : undefined,
    };
  } finally {
    vi.useRealTimers();
  }
}
