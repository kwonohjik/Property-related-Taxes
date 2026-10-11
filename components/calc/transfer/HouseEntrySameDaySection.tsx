"use client";

/**
 * HouseEntrySameDaySection — 이 주택도 **현재 양도하는 주택과 같은 날 양도**하는가 (소득세법 시행령 §154⑨ · 판정 메뉴·계산기·다건 공용)
 *
 * 같은 날 판 주택 2채를 서로의 명부에 넣으면 둘 다 과세로 나오고, 서로 비우면 둘 다 비과세로 나온다. 법문은 어느 쪽도 아니다:
 * 「2개 이상의 주택을 같은 날에 양도하는 경우에는 당해 거주자가 선택하는 순서에 따라 주택을 양도한 것으로 본다」(중과는
 * 영 §167의3⑥이 준용). 순서는 **거주자가 고르는 사실**이므로 입력으로 받는다.
 *
 * 두 단계다 — 「같은 날 양도함」을 표시한 뒤 순서를 고른다. 순서를 고르지 않은 상태를 따로 알아야 결론을 가를 때 고지할 수 있다
 * (`lib/calc/same-day-transfer-order.ts`). 「먼저 양도」만 주택 수에서 뺀다 — 선택하지 않은 사실을 유리하게 읽지 않는다.
 *
 * ⚠️ 같은 날 **증여**한 주택은 이 규정의 대상이 아니다(법문이 「양도」) — 국세청 회신 본문은 확인하지 못했다(확인 필요).
 * 🔑 토글을 끄면 순서 선택도 함께 지운다(onChange 직접 set — useEffect 미러링 금지).
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

interface Props {
  house: HouseEntry;
  onUpdate: (patch: Partial<HouseEntry>) => void;
}

export function HouseEntrySameDaySection({ house, onUpdate }: Props) {
  return (
    <div data-testid="house-same-day-section">
      <ToggleCard
        variant="card"
        tone="emerald"
        checked={house.soldSameDay === true}
        onCheckedChange={(v) =>
          onUpdate(v ? { soldSameDay: true } : { soldSameDay: undefined, sameDayTransferOrder: undefined })
        }
        title="이 주택도 현재 양도하는 주택과 같은 날 양도합니다"
        description={`${TRANSFER.SAME_DAY_TRANSFER_ORDER} — 2개 이상의 주택을 같은 날 양도하면 거주자가 선택하는 순서대로 양도한 것으로 봅니다(중과는 ${TRANSFER.SAME_DAY_TRANSFER_ORDER_SURCHARGE}이 준용). 같은 날 증여한 주택에는 쓰지 않습니다.`}
        data-testid="house-same-day-toggle"
      >
        <div className="space-y-2">
          <p className="text-caption text-muted-foreground">
            이 주택과 현재 양도하는 주택 중 <b>어느 쪽을 먼저 양도한 것으로 할지</b> 고르세요. 고르지 않으면 이 주택을 양도일
            현재 보유 주택으로 세고, 결론이 달라질 수 있을 때 안내합니다.
          </p>
          <RadioCardGroup
            name={`same-day-order-${house.id}`}
            tone="emerald"
            layout="stack"
            columns={2}
            value={house.sameDayTransferOrder ?? ""}
            onChange={(v) => onUpdate({ sameDayTransferOrder: v })}
            data-testid="house-same-day-order"
            options={[
              {
                value: "first",
                label: "이 주택을 먼저 양도한 것으로 선택",
                description: "현재 양도하는 주택을 양도할 때 이 주택은 이미 양도한 뒤라 주택 수에서 뺍니다",
                testId: "house-same-day-first",
              },
              {
                value: "later",
                label: "이 주택을 나중에 양도한 것으로 선택",
                description: "현재 양도하는 주택을 양도할 때 이 주택은 아직 보유 중이라 주택 수에 넣습니다",
                testId: "house-same-day-later",
              },
            ]}
          />
        </div>
      </ToggleCard>
    </div>
  );
}
