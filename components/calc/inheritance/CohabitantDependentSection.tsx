"use client";

/**
 * CohabitantDependentSection — 동거가족 인적공제 입력 (§20 P1, 시령 §18①)
 *
 * Step 0 HeirComposition 하단. 비상속인 부양 직계존비속·형제자매.
 * 배열 단위 추가/삭제 (3-state: undefined OFF / [...] 데이터).
 * 위젯 패턴은 HeirComposition 재사용 (RadioCardGroup·DateInput·ToggleCard violet).
 */

import { differenceInYears } from "date-fns";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { CohabitantDependent } from "@/lib/tax-engine/types/inheritance-gift.types";

const RELATION_OPTIONS = [
  { value: "lineal_descendant", label: "직계비속(손자녀)" },
  { value: "lineal_ascendant", label: "직계존속(부모·조부모·장인·장모)" },
  { value: "sibling", label: "형제자매" },
];

interface Props {
  value: CohabitantDependent[] | undefined;
  onChange: (next: CohabitantDependent[] | undefined) => void;
  deathDate: string;
}

export function CohabitantDependentSection({
  value,
  onChange,
  deathDate,
}: Props) {
  const deps = value ?? [];

  const add = () =>
    onChange([
      ...deps,
      {
        id: `cohabitant-${Date.now()}-${deps.length}`,
        relation: "lineal_descendant",
      },
    ]);

  const update = (id: string, patch: Partial<CohabitantDependent>) =>
    onChange(deps.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const remove = (id: string) => {
    const next = deps.filter((d) => d.id !== id);
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-950/20 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
          👨‍👩‍👧 동거가족 (인적공제 대상 부양가족) — §20·시령 §18①
        </p>
        <button
          type="button"
          onClick={add}
          className="shrink-0 rounded-md border border-sky-300 bg-sky-100 px-2.5 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-200 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200"
        >
          + 동거가족 추가
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        상속인이 아니지만 피상속인이 상속개시일 현재 <strong>사실상 부양</strong>한
        직계존비속(배우자의 직계존속 포함)·형제자매. 미성년·연로자·장애인공제 대상입니다
        (자녀공제 제외). 수유자·영리법인은 대상이 아닙니다.
      </p>

      {deps.length === 0 ? (
        <p className="text-[11px] text-sky-600 dark:text-sky-400">
          동거가족이 있으면 “+ 동거가족 추가”를 눌러 입력하세요.
        </p>
      ) : (
        deps.map((d, i) => {
          const age =
            d.birthDate && deathDate
              ? differenceInYears(new Date(deathDate), new Date(d.birthDate))
              : null;
          return (
            <div
              key={d.id}
              className="rounded-md border border-sky-200 bg-white/60 dark:border-sky-800 dark:bg-sky-950/30 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                  [{i + 1}] 동거가족
                </span>
                <button
                  type="button"
                  onClick={() => remove(d.id)}
                  className="text-[11px] font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
                >
                  🗑 삭제
                </button>
              </div>

              {/* 관계 (시령 §18① — 직계존비속·형제자매) */}
              <RadioCardGroup
                name={`cohabitant-relation-${d.id}`}
                tone="sky"
                layout="stack"
                value={d.relation}
                onChange={(v) =>
                  update(d.id, {
                    relation: v as CohabitantDependent["relation"],
                  })
                }
                options={RELATION_OPTIONS}
              />

              {/* 성명 (선택) */}
              <input
                type="text"
                value={d.name ?? ""}
                onChange={(e) =>
                  update(d.id, { name: e.target.value || undefined })
                }
                placeholder="성명 (선택)"
                className="w-full rounded-md border border-sky-200 bg-background px-2.5 py-1.5 text-sm dark:border-sky-800"
              />

              {/* 생년월일 (미성년·연로자 판정) */}
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  생년월일{" "}
                  {age !== null && (
                    <span className="text-sky-600 dark:text-sky-400">
                      (상속개시일 현재 만 {age}세)
                    </span>
                  )}
                </p>
                <DateInput
                  value={d.birthDate ?? ""}
                  onChange={(v) => update(d.id, { birthDate: v || undefined })}
                />
              </div>

              {/* 장애인 + 성별 (§20①4호) */}
              <ToggleCard
                tone="violet"
                size="sm"
                title="장애인"
                description="성별·연령별 기대여명(년) × 1,000만원 (§20①4호, 2023 생명표)"
                checked={d.isDisabled ?? false}
                onCheckedChange={(v) =>
                  update(d.id, { isDisabled: v, gender: v ? d.gender : undefined })
                }
              />
              {d.isDisabled === true && (
                <div className="ml-4 rounded-lg border border-violet-200 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-900/20 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                    장애인 성별 (§20①4호 — 성별·연령별 기대여명 기준)
                  </p>
                  <RadioCardGroup
                    name={`cohabitant-gender-${d.id}`}
                    tone="violet"
                    layout="inline"
                    value={d.gender ?? ""}
                    onChange={(v) =>
                      update(d.id, { gender: v as "male" | "female" })
                    }
                    options={[
                      { value: "male", label: "남성" },
                      { value: "female", label: "여성" },
                    ]}
                  />
                  {!d.gender && (
                    <p className="text-[11px] text-violet-600 dark:text-violet-400">
                      성별을 선택해야 장애인공제 기대여명을 계산합니다.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
