/**
 * ⑭ §154⑤ 단서 최종 1주택 재기산 처분 이력 — JSON 본문(문자열 날짜) → 엔진 입력(Date) (OH-22 · I-1).
 *
 * 단건(`engine-input.ts` — 계산기·판정 메뉴 공용)·다건(`multi/route.ts`) route와 Step4 거주요건 안내
 * (`transfer-tax-api-residence.ts`)가 **같은 변환**을 쓴다. 날짜는 `date-coerce`로만 바꾼다
 * (`Date < string` 비교가 조용히 false가 되는 함정 — CLAUDE.md API Date 직렬화).
 */
import type { FinalHouseDisposalKind, FinalOneHouseRestartFacts } from "@/lib/tax-engine/types/transfer.types";
import { toDate } from "./date-coerce";

/** ⑬ 본문 형태 — ⑫ Zod(`transfer-tax-schema-base-shape.ts`)와 같은 키 */
export interface FinalHouseRestartApiPayload {
  hadOtherHouseDisposal: boolean;
  disposals: { kind: FinalHouseDisposalKind; date: string; temporaryTwoHouseSpecial: boolean }[];
}

export function toEngineFinalHouseRestart(
  raw: FinalHouseRestartApiPayload | undefined,
): FinalOneHouseRestartFacts | undefined {
  if (!raw) return undefined;
  return {
    hadOtherHouseDisposal: raw.hadOtherHouseDisposal,
    disposals: raw.disposals.map((p, i) => ({
      kind: p.kind,
      date: toDate(p.date, `finalOneHouseRestart.disposals[${i}].date`),
      temporaryTwoHouseSpecial: p.temporaryTwoHouseSpecial,
    })),
  };
}
