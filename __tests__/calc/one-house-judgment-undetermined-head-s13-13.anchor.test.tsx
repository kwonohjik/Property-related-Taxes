/**
 * S13-13 anchor — 결과 「판정하지 않은 부분」 카드의 머리 문구가 그 안의 결론형 항목과 모순되지 않는다.
 *
 * 결함: 카드 머리가 「입력만으로 결론을 낼 수 없어 판정을 보류했습니다. 억측으로 결론을 내지 않습니다」인데, 같은 채널에
 * 「모름 = 혜택 불성립 + 확인 필요」 원칙으로 결론을 낸 고지(「…거주자 기준으로 판정했습니다」·「…과세로 판정했습니다(확인 필요)」)가
 * 함께 실린다. 머리 문구는 두 종류를 포괄해야 한다. 결론·세액·배지는 그대로다(표시 항목).
 *
 * 짝: 항목 자체는 화면에 그대로 있다(긍정) — 문구만 바꾸고 항목을 지워 통과시키는 길을 막는다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import cases from "./one-house-rulings/cases/E067.json";

afterEach(cleanup);

function mkCase(today: string, form: Record<string, unknown>): RulingCase {
  return { id: "p", docNo: "-", docDate: "-", basis: "era", today, summary: "", bucket: "match", form } as unknown as RulingCase;
}

async function judgeText(c: RulingCase) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    const form = buildCaseForm(c);
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(buildOneHouseExemptionApiBody(form)),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    const r = render(<OneHouseJudgmentResultView result={json.data} transferDate={form.transferDate} />);
    const text = (r.container.textContent ?? "").replace(/\s+/g, " ");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = (json.data.judgment.undetermined ?? []).map((u: any) => u.id) as string[];
    return { text, ids, isExempt: json.data.judgment.isExempt as boolean };
  } finally {
    vi.useRealTimers();
  }
}

/** 카드 제목 「판정하지 않은 부분」 바로 뒤 머리 문장. */
function cardHead(text: string) {
  const i = text.indexOf("판정하지 않은 부분");
  return i < 0 ? "" : text.slice(i, i + 140);
}
const FALSE_CLAIM = /억측으로 결론을 내지 않습니다|결론을 낼 수 없어 판정을 보류했습니다/;

describe("S13-13 판정하지 않은 부분 카드 머리 문구", () => {
  it("A 2010 전 비거주자 — 「거주자 기준으로 판정했습니다」 항목과 모순되지 않는다 (결론은 그대로 비과세)", async () => {
    const r = await judgeText(
      mkCase("2009-08-01", {
        isOneHousehold: true, transferDate: "2009-07-01", contractTotalPrice: "600000000", transferorNonResident: true,
        asset: { assetKind: "housing", acquisitionDate: "2003-03-15", regionCode: "4311000000", residenceInputMode: "direct", residencePeriodMonthsAsset: "0" },
      }),
    );
    expect(r.ids).toEqual(["121-2-pre2010-non-resident-unverified"]);
    expect(r.isExempt).toBe(true); // 표시 항목 — 판정값 불변
    expect(r.text).toContain("거주자 기준으로 판정했습니다"); // 짝 — 항목은 화면에 있다
    expect(cardHead(r.text)).not.toMatch(FALSE_CLAIM);
    expect(cardHead(r.text)).toContain("판정을 보류했거나, 적힌 기준으로 판정했습니다");
  });

  it("B N-E067 — 「과세로 판정했습니다(확인 필요)」 항목과 모순되지 않는다", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await judgeText((cases as any[]).find((x) => x.id === "N-E067-no-decedent-date"));
    expect(r.ids).toEqual(["89-2-three-year-exception-undeclared"]);
    expect(r.isExempt).toBe(false);
    expect(r.text).toContain("과세로 판정했습니다(확인 필요)");
    expect(cardHead(r.text)).not.toMatch(FALSE_CLAIM);
  });
});
