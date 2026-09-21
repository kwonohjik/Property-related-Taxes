"use client";

/**
 * HouseEntryOneHouseFactsSection — 이 주택의 **1세대1주택 비과세 특례 사실** (D-6 · 영 §155)
 *
 * ## 왜 ④ 「특수 배제 사유」에 넣지 않았나
 *
 * ④(`HouseEntrySpecialExclusionSection`)는 영 §167의3·§167의10 **중과 배제** 축이다.
 * 설계 문서(ui.design §3.5)는 ④를 「특례·배제 사유(비과세·중과 공용)」로 넓히자고 했으나,
 * 같은 카드에 두 축을 섞으면 **요건이 다른 사실이 한 덩어리로 읽힌다** — 이 저장소가 반복해서
 * 다친 자리다([[feedback_one_field_serving_two_legal_axes]]). 축을 카드로 가른다.
 *
 * ## §155⑥1호 (법제처 실독 2026-09-21 · MST 286211)
 *
 * > ⑥ 다음 각 호의 어느 하나에 해당하는 주택과 그밖의 주택(이하 이 항에서 "일반주택"이라 한다)을
 * >   국내에 **각각 1개씩** 소유하고 있는 1세대가 일반주택을 양도하는 경우에는 국내에 1개의 주택을
 * >   소유하고 있는 것으로 보아 제154조제1항을 적용한다.
 * >   1. 「문화유산의 보존 및 활용에 관한 법률」에 따른 지정문화유산, 「근현대문화유산의 보존 및
 * >      활용에 관한 법률」에 따른 국가등록문화유산 및 「자연유산의 보존 및 활용에 관한 법률」에
 * >      따른 천연기념물등
 *
 * ⇒ 문화유산주택은 **보유 중인 다른 주택**이다. 양도 대상이 아니므로 명부 행의 속성이다.
 *
 * 정책: ToggleCard 전용 · OFF 시 `onUpdate`로 직접 정리(useEffect 미러링 금지).
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { HouseEntryRuralHouseBlock } from "@/components/calc/transfer/HouseEntryRuralHouseBlock";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

interface Props {
  house: HouseEntry;
  onUpdate: (patch: Partial<HouseEntry>) => void;
}

export function HouseEntryOneHouseFactsSection({ house, onUpdate }: Props) {
  return (
    <ToneCard
      tone="violet"
      sectionNum="⑤"
      bodyClassName="space-y-2.5"
      title="1세대1주택 비과세 특례 사실 (§155)"
      noDark
    >
      <p className="text-xs text-muted-foreground leading-relaxed">
        이 주택을 <b>보유</b>한 상태에서 <b>다른 주택(일반주택)을 양도</b>할 때 1세대1주택으로 보는
        특례입니다. 중과 배제(④)와는 요건이 다르므로 따로 받습니다.
      </p>

      {/* §155⑥1호 국가유산주택 */}
      <ToggleCard
        variant="card"
        tone="violet"
        data-testid="house-row-cultural-heritage"
        checked={house.oneHouseCulturalHeritage ?? false}
        onCheckedChange={(v) => onUpdate({ oneHouseCulturalHeritage: v || undefined })}
        title="지정문화유산·국가등록문화유산·천연기념물등 주택 (§155⑥1호)"
        description="이 주택과 일반주택을 각각 1개씩 보유한 상태에서 일반주택을 양도하면 1세대1주택으로 봅니다. 조합원입주권·분양권을 함께 보유한 경우에는 §156의2⑩·§156의3⑦이 준용합니다."
      >
        <div className="pt-1">
          <LawArticleModal
            legalBasis={TRANSFER.CULTURAL_HERITAGE_HOUSE}
            label="소득세법 시행령 §155⑥1호"
          />
        </div>
      </ToggleCard>

      {/* §155⑦ 농어촌주택 (3b) */}
      <HouseEntryRuralHouseBlock house={house} onUpdate={onUpdate} />
    </ToneCard>
  );
}
