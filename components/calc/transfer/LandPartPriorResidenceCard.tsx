"use client";

/**
 * 건물 증여 전 동일세대 거주 — 분리취득 부수토지의 표2 거주기간 공제율 (서면-2025-법규재산-4289).
 *
 * 「건물은 증여, 토지는 매수」(D2 증여) 호스트에서 건물 증여자와 증여일부터 양도일까지 계속 같은 세대일 때, 건물 증여 전
 * 토지를 보유한 동안 건물 소유자와 같은 세대로 거주한 개월 수를 **토지 파트**의 표2 거주기간 공제율과 표2 대상 판정(거주 2년)에 더한다.
 * 건물 파트·비과세 거주요건에는 쓰지 않는다. 상속 D2의 `InheritedCohabitationCard`와 같은 모양(토글 1개 + 자식 칸).
 *
 * `PriorHouseholdResidenceField`는 쓰지 않는다 — 그 칸은 비과세 거주요건·표2 대상 판정에 통산하고 공제율에는 통산하지 않는다(의미가 반대).
 *
 * ⑤ 표시 조건 = ④ 전송 조건 = ⑧ 검증 조건 — `lib/calc/transfer-split-land-residence-scope.ts` 한 leaf. 이 컴포넌트는 호스트일 때만 마운트된다
 * (호출부가 `landPartResidenceHost`로 게이트 — 컴패니언·상속·부담부증여·소유자 분리는 칸이 없다).
 *
 * §155⑳ 선언 중에는 칸을 숨기지 않고 **잠근다**(막다른 길 금지): 꺼져 있으면 켤 수 없고 사유를 보이며, 켜진 채면 ⑧이 막으므로 끄는 길(토글)이 열려 있다.
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { CollapsibleHintCard } from "@/components/calc/shared/CollapsibleHintCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { parsePriorResidenceMonths } from "@/lib/calc/gift-household-payload";
import { landPartResidenceRentalDeclared } from "@/lib/calc/transfer-split-land-residence-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function LandPartPriorResidenceCard(props: { asset: AssetForm; onChange: (patch: Partial<AssetForm>) => void }) {
  const { asset, onChange } = props;
  const on = asset.landPartDonorSameHousehold === true;
  const rentalDeclared = landPartResidenceRentalDeclared(asset);
  const parsed = parsePriorResidenceMonths(asset.landPartPriorHouseholdResidenceMonths);

  return (
    <div className="space-y-2" data-testid="land-part-prior-residence">
      <ToggleCard
        data-field="landPartDonorSameHousehold"
        data-testid="land-part-donor-same-household"
        variant="card"
        tone="violet"
        title="건물 증여자와 증여일부터 양도일까지 계속 같은 세대"
        description="건물 증여 전 이 집에서 건물 소유자와 함께 거주한 기간을 토지 파트 거주기간별 공제율에 더합니다 (서면-2025-법규재산-4289)"
        disabled={rentalDeclared && !on}
        disabledReason="장기임대주택 거주주택 특례(§155⑳)를 선언한 자산에서는 쓸 수 없습니다 — 특례 선언을 해제하면 켤 수 있습니다"
        checked={on}
        onCheckedChange={(v) =>
          // 다중 키 단일 배치 update — OFF는 개월 수도 비운다(잔재가 ⑧·④에 닿지 않게)
          onChange(v ? { landPartDonorSameHousehold: true } : { landPartDonorSameHousehold: false, landPartPriorHouseholdResidenceMonths: "" })
        }
      >
        <FieldCard
          label="건물 증여 전 같은 세대 거주 개월 수"
          field="landPartPriorHouseholdResidenceMonths"
          unit="개월"
          hint="건물 증여 전, 토지를 보유한 동안 건물 소유자와 같은 세대로 이 집에 거주한 개월 수 — 거주하지 않았으면 0을 입력하세요."
        >
          <div data-testid="land-part-prior-residence-months">
            <IntegerInput
              ariaLabel="건물 증여 전 같은 세대 거주 개월 수"
              allowEmpty
              value={parsed === undefined || !Number.isInteger(parsed) ? undefined : parsed}
              onChange={(v) => onChange({ landPartPriorHouseholdResidenceMonths: v === undefined ? "" : String(v) })}
            />
          </div>
        </FieldCard>
      </ToggleCard>

      {rentalDeclared && on && (
        <ToneCard tone="rose">
          <p className="text-xs text-rose-900 dark:text-rose-200" data-testid="land-part-prior-residence-rental-notice">
            장기임대주택 거주주택 특례(§155⑳)를 선언한 자산에서는 이 입력을 쓸 수 없어 계산이 막힙니다 — 위 토글을 끄거나 특례 선언을 해제하세요.
          </p>
        </ToneCard>
      )}

      <CollapsibleHintCard tone="violet" summary="이 입력이 쓰이는 곳">
        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
          <li>토지 파트의 장기보유특별공제 표2 거주기간별 공제율과 표2 대상 판정(거주 2년)에만 더합니다. 건물 파트의 거주기간은 증여일부터 센 본인 거주만 씁니다(사전-2025-법규재산-1126).</li>
          <li>비과세 거주요건(§154①)과 §155⑳ 특례 요건에는 쓰지 않습니다.</li>
          <li>증여일 이후 본인 거주는 「보유 상황」 단계의 거주기간에 입력합니다.</li>
          <li>양도일 현재 증여자와 같은 세대인지는 확인이 필요합니다(조심 2025서3843). 계산 결과에 확인 필요가 함께 표시됩니다.</li>
        </ul>
      </CollapsibleHintCard>
    </div>
  );
}
