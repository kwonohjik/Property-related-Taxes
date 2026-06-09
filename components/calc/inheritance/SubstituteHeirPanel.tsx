"use client";

/**
 * SubstituteHeirPanel — 대습상속인(민법 §1001·§1003②) 입력 패널.
 * HeirComposition에서 분리(800줄 정책). relation==="other" 전용.
 *
 * 3필드: substituteGroupId(그룹) · substituteForRelation(원래순위) · substituteRole(역할).
 * 설계: docs/02-design/features/inheritance-substitute-heir.ui.design.md
 */

import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { useMemo } from "react";

let _nextSubstGroup = 1;
function generateSubstituteGroupId() {
  return `subst-${Date.now()}-${_nextSubstGroup++}`;
}

interface SubstituteHeirPanelProps {
  heir: Heir;
  index: number;
  /** 기존 대습 그룹 목록 도출용 (내부 id 미노출·파생 라벨) */
  allHeirs: Heir[];
  set: (patch: Partial<Heir>) => void;
}

export function SubstituteHeirPanel({
  heir,
  index,
  allHeirs,
  set,
}: SubstituteHeirPanelProps) {
  const substituteGroups = useMemo(() => {
    const seen = new Map<string, { id: string; forRelation?: string }>();
    for (const h of allHeirs) {
      if (h.substituteGroupId && !seen.has(h.substituteGroupId)) {
        seen.set(h.substituteGroupId, {
          id: h.substituteGroupId,
          forRelation: h.substituteForRelation,
        });
      }
    }
    return Array.from(seen.values());
  }, [allHeirs]);

  return (
    <ToggleCard
      tone="rose"
      title="대습상속인 (민법 §1001·§1003②)"
      description="사망·결격된 자녀·형제를 갈음하여 상속하는 손자녀·며느리·사위. ON 시 실제 상속인으로 법정상속분(§1010) 배분."
      checked={!!heir.substituteGroupId}
      onCheckedChange={(v) =>
        set(
          v
            ? { substituteGroupId: generateSubstituteGroupId() }
            : {
                substituteGroupId: undefined,
                substituteForRelation: undefined,
                substituteRole: undefined,
              },
        )
      }
    >
      {heir.substituteGroupId && (
        <div className="space-y-3" data-testid={`heir-substitute-panel-${index}`}>
          {/* ① 원래순위 (§1001: 1순위 직계비속·3순위 형제자매만) */}
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
              피대습자의 원래 상속순위 (§1001)
            </p>
            <RadioCardGroup
              name={`subst-relation-${heir.id}`}
              tone="rose"
              layout="inline"
              value={heir.substituteForRelation ?? ""}
              onChange={(v) =>
                set({ substituteForRelation: v as "child" | "sibling" })
              }
              options={[
                { value: "child", label: "사망한 자녀 (1순위)" },
                { value: "sibling", label: "사망한 형제자매 (3순위)" },
              ]}
            />
          </div>

          {/* ② 대습 그룹 — 같은 피대습자를 갈음하는 대습상속인끼리 묶음 */}
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
              대습 그룹 (같은 피대습자끼리 묶음)
            </p>
            <RadioCardGroup
              name={`subst-group-${heir.id}`}
              tone="rose"
              layout="stack"
              value={heir.substituteGroupId}
              onChange={(v) =>
                set({
                  substituteGroupId:
                    v === "__new__" ? generateSubstituteGroupId() : v,
                })
              }
              options={[
                ...substituteGroups.map((g, i) => ({
                  value: g.id,
                  label: `대습 그룹 #${i + 1} · 사망 ${
                    g.forRelation === "sibling" ? "형제자매" : "자녀"
                  }`,
                })),
                { value: "__new__", label: "+ 새 대습 그룹" },
              ]}
            />
          </div>

          {/* ③ 역할 (§1010②/§1009 재분배: spouse 1.5 : descendant 1) */}
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
              대습 그룹 내 역할 (§1010②)
            </p>
            <RadioCardGroup
              name={`subst-role-${heir.id}`}
              tone="rose"
              layout="inline"
              value={heir.substituteRole ?? ""}
              onChange={(v) =>
                set({ substituteRole: v as "spouse" | "descendant" })
              }
              options={[
                {
                  value: "spouse",
                  label: "피대습자의 배우자 (며느리·사위·형수·매부, §1003②)",
                },
                { value: "descendant", label: "피대습자의 직계비속 (손자녀·조카)" },
              ]}
            />
          </div>
        </div>
      )}
    </ToggleCard>
  );
}
