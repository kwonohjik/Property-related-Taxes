/**
 * §101② 증여 후 우회양도 판정 화면 — 카드 공용 타입·헬퍼
 *
 * 폼 상태는 `lib/calc/gift-resale-101-2-form.ts`(①②)가 정본이다. 여기는 입력 칸 변환과 오류 조회만 둔다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import type { GiftResaleFormState } from "@/lib/calc/gift-resale-101-2-form";
import type { GiftResaleIssue } from "@/lib/calc/gift-resale-101-2-validate";

export interface GiftResaleCardProps {
  form: GiftResaleFormState;
  onPatch: (p: Partial<GiftResaleFormState>) => void;
  issues: GiftResaleIssue[];
}

/** 금액 칸(문자열) ← 폼 값. 빈 칸은 `null`로 둔다 — 0으로 보정하지 않는다(⑧이 미입력으로 막는다). */
export const amountToText = (n: number | null): string => (n === null ? "" : String(n));
export const textToAmount = (s: string): number | null => (s === "" ? null : parseAmount(s));

/** 한 칸의 첫 오류 문구 — 없으면 undefined */
export const issueOf = (issues: GiftResaleIssue[], field: keyof GiftResaleFormState): string | undefined =>
  issues.find((i) => i.field === field)?.message;

/** 금액 칸 정렬 규약 — 모든 금액 표시는 이 클래스 한 쌍(font-mono tabular-nums) */
export const AMOUNT_CLASS = "text-right font-mono tabular-nums whitespace-nowrap";

/** 이력에서 불러온 결정세액 칸 두 개(P4) — 1호 수증자·2호 증여자 */
export type GiftResaleHistoryField = "doneeTransferDeterminedTax" | "donorTransferDeterminedTax";

/** 출처 이력 표시용 — 화면 로컬 state로만 두고 API body에는 싣지 않는다 */
export interface GiftResaleHistorySource {
  id: string;
  title: string;
}

export interface GiftResaleHistoryProps {
  historySources: Partial<Record<GiftResaleHistoryField, GiftResaleHistorySource>>;
  onPickHistory: (field: GiftResaleHistoryField, source: GiftResaleHistorySource, determinedTax: number) => void;
}
