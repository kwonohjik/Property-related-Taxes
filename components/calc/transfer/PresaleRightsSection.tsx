"use client";

/**
 * PresaleRightsSection — 세대 보유 분양권·입주권 입력 (다주택 중과 주택 수 산입)
 *
 * 소령 §167의11·§167의3①: 2021.1.1 이후 취득한 분양권·조합원입주권은 주택 수에 포함.
 * 항목별 3필드(종류·취득일·지역)뿐이므로 모달 없이 인라인 편집.
 *
 * 정책: RadioCardGroup/DateInput 전용 · useEffect→store 미러링 금지(onChange 직접 set).
 */

import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";

interface Props {
  rights: PresaleRightEntry[];
  onChange: (rights: PresaleRightEntry[]) => void;
  /** #2b 혼인합가일 입력 시 "배우자 단독 보유" chip 노출 (§167의4⑤) */
  showSpouseOwned?: boolean;
}

export function PresaleRightsSection({ rights, onChange, showSpouseOwned }: Props) {
  function add() {
    const entry: PresaleRightEntry = {
      id: `presale_${Date.now()}`,
      type: "presale_right",
      acquisitionDate: "",
      region: "capital",
    };
    onChange([...rights, entry]);
  }

  function update(id: string, patch: Partial<PresaleRightEntry>) {
    onChange(rights.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function remove(id: string) {
    onChange(rights.filter((r) => r.id !== id));
  }

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-sky-700">분양권·입주권</p>
        <button type="button" onClick={add} className="text-xs text-primary hover:underline">
          + 추가
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground/80">
        2021.1.1 이후 취득한 분양권·조합원입주권은 주택 수 산정에 포함됩니다 (소령 §167의11).
      </p>

      {rights.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70">없음</p>
      ) : (
        <div className="space-y-2.5">
          {rights.map((r, idx) => (
            <div key={r.id} className="rounded-md border border-border bg-background/60 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                  {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  className="text-[11px] text-destructive hover:underline"
                  aria-label={`분양권·입주권 ${idx + 1} 삭제`}
                >
                  삭제
                </button>
              </div>
              <div className="space-y-1">
                <span className="block text-[11px] text-muted-foreground font-medium">종류</span>
                <RadioCardGroup
                  name={`presale-type-${r.id}`}
                  layout="inline"
                  tone="sky"
                  value={r.type}
                  onChange={(v) => update(r.id, { type: v as PresaleRightEntry["type"] })}
                  options={[
                    { value: "presale_right", label: "분양권" },
                    { value: "redevelopment_right", label: "조합원입주권" },
                  ]}
                />
              </div>
              <div className="space-y-1">
                <span className="block text-[11px] text-muted-foreground font-medium">취득일</span>
                <DateInput
                  value={r.acquisitionDate}
                  onChange={(v) => update(r.id, { acquisitionDate: v })}
                />
              </div>
              <div className="space-y-1">
                <span className="block text-[11px] text-muted-foreground font-medium">지역 구분</span>
                <RadioCardGroup
                  name={`presale-region-${r.id}`}
                  layout="inline"
                  tone="rose"
                  value={
                    r.region === "capital"
                      ? "capital"
                      : r.regionCriteria === "REGION"
                        ? "metro"
                        : "local"
                  }
                  onChange={(v) =>
                    update(
                      r.id,
                      v === "capital"
                        ? { region: "capital", regionCriteria: "REGION" }
                        : v === "metro"
                          ? { region: "non_capital", regionCriteria: "REGION" }
                          : { region: "non_capital", regionCriteria: "VALUE" },
                    )
                  }
                  options={[
                    { value: "capital", label: "수도권" },
                    { value: "metro", label: "광역시·세종" },
                    { value: "local", label: "그 외 지방" },
                  ]}
                />
              </div>
              <CurrencyInput
                label="가액(공급가격)"
                value={r.rightValue ?? ""}
                onChange={(v) => update(r.id, { rightValue: v })}
                hint="분양권 공급가격/입주권 종전주택가격 — 그 외 지방 3억 이하 시 주택 수 제외 (원)"
              />
              {/* #2b 혼인합가 — 배우자 단독 보유 (혼인합가일 입력 시) */}
              {showSpouseOwned && (
                <ToggleCard
                  variant="chip"
                  tone="violet"
                  checked={r.isSpouseOwned ?? false}
                  onCheckedChange={(v) => update(r.id, { isSpouseOwned: v })}
                  title="배우자 단독 보유"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
