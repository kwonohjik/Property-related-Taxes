"use client";

/**
 * 부담부증여 ⑤ Phase 3 — 증여세 통합 입력(수증자 정보, 상증법 §53·§56·§57·§69).
 * `BurdenedGiftBlock`에서 800줄 정책으로 분리(2026-10-16, 동작 무변경).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DONOR_RELATION_OPTIONS } from "./burdened-gift-block-options";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function BurdenedGiftDonorTaxBlock({ asset, onChange }: Props) {
  return (
        <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-micro font-bold text-violet-800 select-none">
              §53
            </span>
            <p className="text-xs font-semibold text-violet-800">
              증여세 통합 입력 (수증자 정보 — 상증법 §53·§56·§57·§69)
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <LawArticleModal legalBasis="상속세및증여세법 §53" label="상증법 §53" />
              <LawArticleModal legalBasis="상속세및증여세법 §56" label="상증법 §56" />
              <LawArticleModal legalBasis="상속세및증여세법 §57" label="상증법 §57" />
              <LawArticleModal legalBasis="상속세및증여세법 §69" label="상증법 §69" />
            </div>
          </div>
          <p className="text-caption text-violet-700">
            무상이전분(증여가액 C − 채무액 B)에 대한 증여세 동시 산출. 수증자가 별도 신고·납부.
          </p>
          {/*
            🔴 hint가 「미선택 시 직계비속(성년) 기본값」이라 안내했는데 ⑧은 선택을 **차단**한다
               (`transfer-tax-validate-bg.ts:192`) — 안내를 믿고 넘어간 사용자는 원인 모를 차단을
               만났다 (2026-09-05 · 코드리뷰 Q21).

            저장소 정책 둘이 충돌하는 자리다: 3중 패턴은 「④·엔진 fallback이 있으면 validate도
            인정하라」, 루트 규약은 「미입력은 검증 오류로 차단하라」. **후자를 택했다** —
            상증법 §53 증여재산공제가 관계에 따라 **5천만 ↔ 6억**으로 갈리므로 사용자가 모르고
            지나가면 안 되는 크기다. ⇒ 기본값 문장을 걷고 필수로 표기한다.

            ④·엔진의 기본값은 남긴다 — 마법사를 거치지 않고 조립된 입력(직접 fixture)용 안전망이다.
          */}
          <FieldCard
            stacked
            required
            label="증여자-수증자 관계"
            hint="상증법 §53 증여재산공제가 관계에 따라 5천만 ↔ 6억으로 갈립니다. 반드시 선택하세요."
          >
            <RadioCardGroup
              name={`bgDonorRelation-${asset.assetId ?? "primary"}`} data-field="bgDonorRelation"
              layout="stack"
              columns={3}
              value={asset.bgDonorRelation || ""}
              onChange={(v) =>
                onChange({ bgDonorRelation: v as AssetForm["bgDonorRelation"] })
              }
              options={DONOR_RELATION_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </FieldCard>
          <div className="space-y-2">
            {/* 세대생략 증여 — ON 시 미성년 토글 펼침 (children은 checked일 때만 렌더) */}
            <ToggleCard
              variant="card"
              size="sm"
              tone="violet"
              title="세대생략 증여"
              description="§57 — 30% 또는 미성년 20억 초과 40% 할증"
              checked={asset.bgIsGenerationSkip}
              onCheckedChange={(v) => onChange({ bgIsGenerationSkip: v })}
            >
              <ToggleCard
                variant="card"
                size="sm"
                tone="violet"
                title="수증자 미성년"
                description="세대생략 증여재산가액 20억 초과 시 40% 할증"
                checked={asset.bgIsMinorDonee}
                onCheckedChange={(v) => onChange({ bgIsMinorDonee: v })}
              />
            </ToggleCard>
            <ToggleCard
              variant="card"
              size="sm"
              tone="emerald"
              title="법정신고기한 내 신고"
              description="§69 신고세액공제 3%"
              checked={asset.bgIsFiledOnTime}
              onCheckedChange={(v) => onChange({ bgIsFiledOnTime: v })}
            />
          </div>
        </div>
  );
}
