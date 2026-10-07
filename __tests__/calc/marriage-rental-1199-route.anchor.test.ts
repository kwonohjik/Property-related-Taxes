/**
 * 혼인합가 1199 — route 경유 **사유·요건 검토** (판정 메뉴 결과 화면에 나가는 설명).
 *
 * 결론(과세)은 평가셋 `E132-*`가 고정하지만, 그 결론은 §155⑳ 세대 구성 경로로도 나와 사유·요건 검토 배선이 끊겨도
 * 결론 단언은 통과한다(뮤테이션 실측). 그래서 결과 화면에 실리는 두 설명을 직접 본다.
 *
 * | # | 주장 |
 * |---|---|
 * | RT-1 | 불성립 사유(`unmetExceptions` 155-5)가 1199와 양쪽 주택 수를 말한다 |
 *
 * 요건 검토(`requirementReview`)도 같은 술어(`marriageRentalSidesOf`)로 합가 구성을 보지만, 명부 밖 임대주택이 판정에
 * 들어오는 경우는 §155⑳ 선언뿐이고 그때 ⑳ 세대 구성도 같은 이유로 불충족이라 판정 철회(`revokeOneHouseExemption`)가
 * 요건 검토를 지운다 — 지금은 화면에 나가지 않아 단언하지 않는다(술어 일치를 위해 배선은 둔다).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import type { OneHouseJudgment } from "@/lib/tax-engine/one-house/types";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";

afterEach(() => vi.useRealTimers());

const cases: RulingCase[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, "one-house-rulings/cases/E132.json"), "utf8"),
);

async function judgment(id: string): Promise<OneHouseJudgment> {
  const c = cases.find((x) => x.id === id)!;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  const res = await POST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(buildCaseForm(c))),
    }),
  );
  return (await res.json()).data.judgment;
}

describe("혼인합가 1199 — 결과 설명", () => {
  it("RT-1 E132-current: 불성립 사유가 1199와 양쪽 주택 수(3·2)를 말한다", async () => {
    const j = await judgment("E132-current");
    const reasons = j.unmetExceptions?.find((u) => u.id === "155-5-marriage-merge")?.reasons ?? [];
    expect(reasons.join(" ")).toMatch(/양도자 쪽 3주택 · 배우자 쪽 2주택.*조세정책과-1199/);
  });
  it("짝 — 한쪽이 1주택(1062 구조)이면 1199 사유가 없다", async () => {
    const j = await judgment("P-E132-1062");
    expect(j.isExempt).toBe(true);
    expect(JSON.stringify(j.unmetExceptions ?? [])).not.toMatch(/조세정책과-1199/);
  });
});
