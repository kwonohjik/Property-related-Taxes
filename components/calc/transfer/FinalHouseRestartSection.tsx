"use client";

/**
 * §154⑤ 단서 최종 1주택 보유기간 재기산 — 처분 이력 입력 (OH-22 · I-1).
 *
 * 2021-01-01~2022-05-09 양도 · 1세대 1주택일 때만 그린다(노출은 호출부가 `finalHouseRestartInScope` 계열로 정한다
 * — ④ 본문·⑧ 검증과 같은 술어). 판정은 엔진 leaf 하나다 — 아래 미리보기도 그 leaf의 문장을 그대로 보여 준다.
 *
 * 🔑 「처분한 적이 있나요」와 행별 「일시적 2주택 관계」는 3-state 라디오다(미선택 = 미입력).
 *    이력 미답은 판정 보류(재기산 없음으로 추정하지 않는다), 행별 미답은 ⑧이 막는다.
 */
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { FinalHouseDisposalRow } from "@/lib/stores/calc-wizard-form.types";
import {
  asksTemporaryTwoHouse,
  buildFinalHouseRestartPayload,
  readFinalHouseDisposals,
  readFinalHouseRestartHistory,
  type FinalHouseRestartFormSlice,
} from "@/lib/calc/final-house-restart";
import { toEngineFinalHouseRestart } from "@/lib/api/final-house-restart-coerce";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { describeFinalOneHouseRestart } from "@/lib/tax-engine/one-house/final-house-restart";

type Kind = Exclude<FinalHouseDisposalRow["kind"], "">;
type YesNo = "yes" | "no";

interface Props {
  value: Partial<FinalHouseRestartFormSlice>;
  /** 양도 주택 취득일 — 미리보기(재기산일이 취득일 이전이면 재기산 없음)에만 쓴다 */
  acquisitionDate: string | undefined;
  onChange: (patch: Partial<Omit<FinalHouseRestartFormSlice, "transferDate">>) => void;
}

const KIND_OPTIONS: RadioCardOption<Kind>[] = [
  { value: "transfer", label: "양도", testId: "final-house-kind-transfer" },
  { value: "gift", label: "증여", testId: "final-house-kind-gift" },
  { value: "conversion", label: "용도변경", testId: "final-house-kind-conversion" },
  { value: "other", label: "그 밖(멸실 등)", testId: "final-house-kind-other" },
];

const yesNo = (prefix: string): RadioCardOption<YesNo>[] => [
  { value: "yes", label: "예", testId: `${prefix}-yes` },
  { value: "no", label: "아니오", testId: `${prefix}-no` },
];

export function FinalHouseRestartSection({ value, acquisitionDate, onChange }: Props) {
  const history = readFinalHouseRestartHistory(value.finalHouseRestartHistory);
  const rows = readFinalHouseDisposals(value.finalHouseRestartDisposals);
  const setRows = (next: FinalHouseDisposalRow[]) => onChange({ finalHouseRestartDisposals: next });
  const update = (id: string, patch: Partial<FinalHouseDisposalRow>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // 미리보기 — 엔진 leaf의 문장 그대로(재계산하지 않는다). 날짜가 갖춰졌을 때만.
  const transferAt = toOptionalDate(value.transferDate);
  const acquiredAt = toOptionalDate(acquisitionDate);
  const payload = buildFinalHouseRestartPayload(value, true).finalOneHouseRestart;
  const preview =
    transferAt && acquiredAt && payload
      ? describeFinalOneHouseRestart({
          transferDate: transferAt,
          acquisitionDate: acquiredAt,
          finalOneHouseRestart: toEngineFinalHouseRestart(payload),
        })
      : undefined;

  // ToneCard는 data-testid를 전달하지 않는다 — 감싸는 div에 단다.
  return (
    <div data-testid="final-house-restart-section">
      <ToneCard tone="violet" title="최종 1주택 보유기간 재기산 (§154⑤ 단서)" bodyClassName="space-y-2.5">
        <p className="text-caption text-violet-800">
          2021.1.1.~2022.5.9. 양도분은 2주택 이상을 보유하다 다른 주택을 모두 처분했으면 처분 후 1주택이 된 날부터
          보유기간(거주기간 포함)을 다시 셉니다.
        </p>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            이 주택을 보유하는 동안 세대가 다른 주택(조합원입주권 포함)을 처분한 적이 있나요?
          </label>
          <RadioCardGroup<YesNo>
            name="finalHouseRestartHistory"
            layout="inline"
            tone="violet"
            value={history}
            onChange={(v) =>
              // 「있음」으로 처음 바꾸면 빈 행 하나를 함께 연다 — 같은 onChange 한 번(useEffect 미러링 금지)
              onChange(
                v === "yes" && rows.length === 0
                  ? { finalHouseRestartHistory: v, finalHouseRestartDisposals: [emptyRow()] }
                  : { finalHouseRestartHistory: v },
              )
            }
            options={[
              { value: "yes", label: "있음", testId: "final-house-history-yes" },
              { value: "no", label: "없음", testId: "final-house-history-no" },
            ]}
          />
          {history === "" && (
            <p className="text-caption text-muted-foreground">
              답하지 않으면 이 요건은 판정하지 않고 결과에 판정 보류로 안내합니다.
            </p>
          )}
        </div>

        {history === "yes" && (
          <div className="space-y-2.5">
            {rows.map((r, idx) => (
              <div
                key={r.id}
                className="space-y-2 rounded-md border border-border bg-background/60 p-2.5"
                data-testid={`final-house-row-${idx}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-caption font-medium text-muted-foreground tabular-nums">처분 {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
                    className="text-caption text-destructive hover:underline"
                    aria-label={`처분 ${idx + 1} 삭제`}
                  >
                    삭제
                  </button>
                </div>
                <div className="space-y-1">
                  <span className="block text-caption font-medium text-muted-foreground">처분 유형</span>
                  <RadioCardGroup<Kind>
                    data-field={`finalHouseRestartDisposals.${idx}.kind`}
                    name={`final-house-kind-${r.id}`}
                    layout="inline"
                    tone="violet"
                    value={r.kind}
                    onChange={(v) => update(r.id, { kind: v, ...(asksTemporaryTwoHouse(v) ? {} : { temporaryTwoHouse: "" }) })}
                    options={KIND_OPTIONS}
                  />
                  {r.kind === "other" && (
                    <p className="text-caption text-muted-foreground">
                      멸실 등은 단서의 「처분」(양도·증여·용도변경)이 아니어서 재기산일이 되지 않습니다.
                    </p>
                  )}
                </div>
                <div className="space-y-1" data-testid={`final-house-date-${idx}`}>
                  <span className="block text-caption font-medium text-muted-foreground">
                    처분일 <span className="font-normal">(양도는 잔금일 등 양도시기 · 증여일 · 용도변경일)</span>
                  </span>
                  <DateInput
                    data-field={`finalHouseRestartDisposals.${idx}.date`}
                    value={r.date}
                    onChange={(v) => update(r.id, { date: v })}
                  />
                </div>
                {asksTemporaryTwoHouse(r.kind) && (
                  <div className="space-y-1">
                    <span className="block text-caption font-medium text-muted-foreground">
                      처분 당시 이 주택과 일시적 2주택(§155·§155의2·§156의2·§156의3 특례) 관계였나요?
                    </span>
                    <RadioCardGroup<YesNo>
                      data-field={`finalHouseRestartDisposals.${idx}.temporaryTwoHouse`}
                      name={`final-house-temp-${r.id}`}
                      layout="inline"
                      tone="violet"
                      value={r.temporaryTwoHouse}
                      onChange={(v) => update(r.id, { temporaryTwoHouse: v })}
                      options={yesNo(`final-house-temp-${idx}`)}
                    />
                    <p className="text-caption text-muted-foreground">
                      다른 주택을 모두 처분해 1주택이 된 뒤 새로 취득해 일시적 2주택이 된 경우는 「아니오」입니다.
                    </p>
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRows([...rows, emptyRow()])}
              className="text-sm font-medium text-primary hover:underline"
              data-field="finalHouseRestartDisposals"
              data-testid="final-house-add"
            >
              + 처분 주택 추가
            </button>
          </div>
        )}

        {preview && (
          <p
            className={preview.applied ? "text-sm font-medium text-rose-700" : "text-sm text-violet-900"}
            data-testid="final-house-restart-preview"
          >
            {preview.description}
          </p>
        )}
      </ToneCard>
    </div>
  );
}

function emptyRow(): FinalHouseDisposalRow {
  return { id: `fhr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, kind: "", date: "", temporaryTwoHouse: "" };
}
