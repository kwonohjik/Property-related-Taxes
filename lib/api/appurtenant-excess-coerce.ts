/**
 * ⑭ `appurtenantExcessFacts`(⑫ 운반 스키마의 문자열 날짜) → 엔진 입력(UTC 자정 Date). 단건·다건·함께 양도 컴패니언이 **같은 함수**를 쓴다
 * (경로마다 변환을 복제하면 한쪽이 string 날짜를 엔진에 흘려 `Date < string` silent false가 난다 — `date-coerce.ts` 규약).
 */
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { toDate } from "./date-coerce";

export interface AppurtenantExcessFactsWire {
  expropriationNoticeDate?: string;
  graceIntervals?: { startDate: string; endDate: string }[];
}

export function toEngineAppurtenantExcessFacts(
  raw: AppurtenantExcessFactsWire | undefined,
): TransferTaxInput["appurtenantExcessFacts"] {
  if (!raw) return undefined;
  const intervals = raw.graceIntervals?.map((g, i) => ({
    startDate: toDate(g.startDate, `appurtenantExcessFacts.graceIntervals.${i}.startDate`),
    endDate: toDate(g.endDate, `appurtenantExcessFacts.graceIntervals.${i}.endDate`),
  }));
  return {
    ...(raw.expropriationNoticeDate ? { expropriationNoticeDate: toDate(raw.expropriationNoticeDate, "appurtenantExcessFacts.expropriationNoticeDate") } : {}),
    ...(intervals && intervals.length > 0 ? { graceIntervals: intervals } : {}),
  };
}
