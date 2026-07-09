"use client";

/**
 * 간주상속재산 분류 + 신탁 유형 선택 (R3)
 *
 * 법령:
 *   - 본법 §8 보험금 / §9 신탁재산 / §10 퇴직금
 *   - 시행령 §19① 금융재산 정의 — 신탁은 금전신탁만 §22 대상
 *
 * UI 진입점: PropertyValuationForm·StockValuationForm 카드 내부 (상속세 모드 전용).
 * 사용자가 deemedCategory를 선택하면 안내 카드 + (trust 시) trustType 라디오 노출.
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { RadioOptionVisibility } from "@/lib/calc/asset-toggle-visibility";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

export interface DeemedCategorySectionProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  /**
   * §10 퇴직금 옵션 노출 여부 (asset-toggle-visibility resolver 출력 직접 전달).
   * "hidden" 시 부동산 카테고리 등에서 퇴직금 옵션 라디오 미렌더.
   * 활성 우선 정책: 이미 deemedCategory="retirement"이면 resolver가 "visible" 자동 반환.
   * 미전달 시 "visible" (기존 동작 호환).
   */
  retirementOptionVisibility?: RadioOptionVisibility;
}

const DEEMED_OPTIONS = [
  { value: "none", label: "일반 상속재산", description: "본래상속재산 (§7)" },
  { value: "insurance", label: "보험금 (§8)", description: "피상속인이 보험계약자인 생명·손해보험" },
  { value: "trust", label: "신탁재산 (§9)", description: "피상속인 신탁재산. 금전신탁만 §22 적용" },
  { value: "retirement", label: "퇴직금 등 (§10)", description: "퇴직금·퇴직수당·공로금·연금" },
] as const;

const TRUST_TYPE_OPTIONS = [
  { value: "cash_trust", label: "금전신탁", description: "§22 적용 (상증령 §19①)" },
  { value: "real_estate", label: "부동산신탁", description: "§22 미적용" },
  { value: "security", label: "증권신탁", description: "§22 미적용" },
  { value: "other", label: "기타", description: "§22 미적용" },
] as const;

export function DeemedCategorySection({
  item,
  onUpdate,
  retirementOptionVisibility = "visible",
}: DeemedCategorySectionProps) {
  const current = item.deemedCategory ?? "none";

  // 퇴직금 옵션 필터링: 부동산 카테고리 등에서 hidden. 단, 이미 retirement 선택값이면 무력 (활성 우선 정책 — resolver가 "visible" 반환)
  const visibleOptions =
    retirementOptionVisibility === "hidden"
      ? DEEMED_OPTIONS.filter((o) => o.value !== "retirement")
      : DEEMED_OPTIONS;

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800 p-2 space-y-2">
      <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
        간주상속재산 분류 (§8·§9·§10)
      </p>
      <div className="flex flex-wrap gap-1.5">
        <LawArticleModal legalBasis="상증법 §8" label="§8 보험금" />
        <LawArticleModal legalBasis="상증법 §9" label="§9 신탁재산" />
        <LawArticleModal legalBasis="상증법 §10" label="§10 퇴직금" />
        <LawArticleModal legalBasis="상증령 §19" label="상증령 §19① 금융재산" />
      </div>
      <RadioCardGroup<"none" | "insurance" | "trust" | "retirement">
        name={`deemed-${item.id}`}
        layout="inline"
        tone="violet"
        value={current as "none" | "insurance" | "trust" | "retirement"}
        options={[...visibleOptions]}
        onChange={(v) => {
          if (v === "none") {
            onUpdate({ ...item, deemedCategory: undefined, trustType: undefined });
          } else {
            onUpdate({
              ...item,
              deemedCategory: v,
              // 신탁이 아니면 trustType 초기화
              trustType: v === "trust" ? item.trustType : undefined,
            });
          }
        }}
      />

      {/* deemedCategory별 안내 */}
      {item.deemedCategory === "insurance" && (
        <p className="text-caption text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30 rounded p-2">
          ⓘ §8① 피상속인이 보험계약자인 생명·손해보험. §8② 실질 납부자가 피상속인이면 포함.
        </p>
      )}
      {item.deemedCategory === "trust" && (
        <>
          <p className="text-caption text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30 rounded p-2">
            ⓘ §22 금융재산공제는 <strong>금전신탁만 적용</strong> (상증령 §19①). 부동산·증권신탁은 미적용.
            <br />
            §33① 수익자 분 신탁이익은 상속재산 제외.
          </p>
          <div className="space-y-1">
            <p className="text-micro font-semibold text-violet-700 dark:text-violet-300">
              신탁 유형 선택
            </p>
            <RadioCardGroup<"cash_trust" | "real_estate" | "security" | "other">
              name={`trust-type-${item.id}`}
              layout="inline"
              tone="violet"
              value={item.trustType ?? ""}
              options={[...TRUST_TYPE_OPTIONS]}
              onChange={(v) => onUpdate({ ...item, trustType: v })}
            />
            {!item.trustType && (
              <p className="text-micro text-amber-700 dark:text-amber-300">
                ⚠️ 신탁 유형 미선택 — §22 미적용으로 처리됩니다.
              </p>
            )}
          </div>
        </>
      )}
      {item.deemedCategory === "retirement" && (
        <p className="text-caption text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30 rounded p-2">
          <strong>제외 항목 (§10 1~6호)</strong>: 국민연금·공무원연금·사립학교교직원연금·군인연금 유족급여,
          산재 유족보상, 업무상 사망 유족보상금 등은 간주상속재산 아님. §22 미적용.
        </p>
      )}
    </div>
  );
}
