/**
 * I-26 판정 보류 고지 계약 — **판정 메뉴 route 단위** 행 형식(묶음 F).
 *
 * 묶음 A~E는 `checkExemption`을 직접 부른다. 묶음 F의 고지는 그 밖에서 붙는다 — `checkExemption`의 `undetermined` 배열에 덧붙는 §89② 계열
 * 함수와, 판정 route 파이프라인(`judgment-pipeline.ts` · `judgment-request.ts`)이 판정 뒤에 붙이는 단계(비거주자 · 잔금 전 멸실 · 토지만 ·
 * 같은 날 권리 · 합가 상대 쪽 임대). 그래서 셀은 판정 메뉴 폼이고, 폼 → ④ → Zod → route → 엔진 전체를 탄다. `body`는 화면 ④가 싣지 않는
 * 칸을 직접 API로 더할 때만 쓴다.
 */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildCaseForm, type RulingCase } from "../../../calc/one-house-rulings/harness";
import { handoff, withToday } from "../../../calc/_one-house-pr6a-routes";
import { runCalc } from "../../../calc/_one-house-pr3a-calc-route";

export type PipelineCell = {
  form: NonNullable<RulingCase["form"]>;
  /** 판정 기준일(오늘) — route가 지난 기한을 거른다 */
  today: string;
  /** 화면 ④가 싣지 않는 칸 — 직접 API 본문에 덧붙인다 */
  body?: Record<string, unknown>;
};

export type PipelineContractRow = {
  /** 끝이 `*`면 접두 묶음(`89-2-confirm:<n>` 등) */
  id: string;
  /** 결론을 가르는 셀 — route로 닿을 수 없으면 null(`decidesWhy`에 이유) */
  decides: PipelineCell | null;
  decidesWhy: string;
  /** 같은 미확정 사실을 두고 다른 사유로 결론이 정해진 셀 */
  silent: PipelineCell | null;
  silentWhy: string;
  /** 계산기 경고에 같은 문장이 없는 이유(판정 메뉴 전용 단계 · 계산기는 다른 문장으로 묶음 등). 생략 = 본다 */
  calcParitySkip?: string;
  /** 계산기 쪽 결론 불변 셀 — `silent`가 판정 메뉴 전용 단계(비거주자 등)로 결론을 정할 때만 따로 둔다. 생략 = `silent` */
  calcSilent?: PipelineCell;
};

const caseOf = (cell: PipelineCell): RulingCase =>
  ({ id: "contract", docNo: "-", docDate: "-", basis: "current", today: cell.today, summary: "-", bucket: "match", form: cell.form }) as RulingCase;

export async function judgeCellViaRoute(cell: PipelineCell): Promise<{ status: number; undetermined: { id: string; reason: string }[] }> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${cell.today}T03:00:00Z`));
  try {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify({ ...buildOneHouseExemptionApiBody(buildCaseForm(caseOf(cell))), ...cell.body }),
      }),
    );
    const json = await res.json();
    return { status: res.status, undetermined: json?.data?.judgment?.undetermined ?? [] };
  } finally {
    vi.useRealTimers();
  }
}

/** 같은 폼을 계산기로 넘겨(넘기기 ④) 받은 경고 */
export async function calcWarningsViaRoute(cell: PipelineCell): Promise<string[]> {
  const out = await withToday(cell.today, async () => runCalc(handoff(buildCaseForm(caseOf(cell)))));
  return (out.warnings as string[] | undefined) ?? [];
}

/** 표 행 id가 고지 id를 덮는가 — 끝이 `*`면 접두 묶음. */
export const covers = (rowId: string, id: string) => (rowId.endsWith("*") ? id.startsWith(rowId.slice(0, -1)) : id === rowId);
