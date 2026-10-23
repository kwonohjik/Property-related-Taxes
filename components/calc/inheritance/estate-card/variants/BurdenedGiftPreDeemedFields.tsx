"use client";

/**
 * 의제취득일(1985.1.1.) 전 상속 자산 × 부담부증여 양도세 — 취득가액 안내·① 칸·「확인할 수 없음」 선언 (PR-7b-3).
 *
 * 시가 평가(담보 패)는 ①②③ 3자 max × 채무비율이라 산정방식 라디오 대신 이 블록을 보인다(Q-24·Q-32). 기준시가 평가(담보 승 포함)는
 * 의제취득일 기준시가 × 채무비율 안내만(Q-25). 술어는 ④·⑧과 같은 `lib/calc/gift-burdened-pre-deemed.ts`.
 * 분리 이유: `BurdenedGiftValuationModeSection` 516줄 — 추가분을 따로 둔다.
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import {
  giftBgPreDeemedClauseAFilled,
  giftBgPreDeemedInScope,
  giftBgPreDeemedUsesThreeWay,
} from "@/lib/calc/gift-burdened-pre-deemed";

interface Props {
  item: EstateItem;
  bgt: BurdenedGiftTransferTaxInput;
  set: (patch: Partial<BurdenedGiftTransferTaxInput>) => void;
  isLandType: boolean;
  /** 증여일(= 양도일) — 토지 등급 환산(②) 성립 판정 */
  transferDate?: string;
}

export function BurdenedGiftPreDeemedFields({ item, bgt, set, isLandType, transferDate }: Props) {
  if (!giftBgPreDeemedInScope(bgt)) return null;
  if (!giftBgPreDeemedUsesThreeWay(item)) {
    return (
      <ToneCard tone="violet" title="의제취득일(1985.1.1.) 전 상속 — 취득가액 = 의제취득일 기준시가 × 채무비율" className="py-2">
        <p data-testid="bg-pre-deemed-std-notice" className="text-xs">
          1984.12.31. 이전에 상속받은 자산은 취득시기가 1985.1.1.로 의제됩니다. 양도가액을 기준시가로 산정하므로 취득가액도 의제취득일 현재
          기준시가에 채무비율을 곱한 금액입니다(상증법 평가액·환산취득가액과 비교하지 않음 — 소득세법 시행령 §159①1호 괄호).
        </p>
      </ToneCard>
    );
  }
  const clauseAFilled = giftBgPreDeemedClauseAFilled(item, transferDate);
  return (
    <div className="space-y-2" data-testid="bg-pre-deemed-three-way">
      <ToneCard tone="violet" title="의제취득일(1985.1.1.) 전 상속 — 취득가액 = ①②③ 중 큰 금액 × 채무비율" className="py-2">
        <p className="text-xs">
          ① 상속개시일 현재 상증법 평가액
          {isLandType ? " · ② §164④ 기준시가(토지등급 환산)" : ""} · ③ 환산취득가액(증여가액 ×{" "}
          <Frac top="의제취득일 기준시가" bottom="양도시 기준시가" />) 중 큰 금액에 채무비율을 곱합니다. 취득가액 산정방식은 고르지 않습니다
          (소득세법 시행령 §159①1호 · §163⑨ · §176조의2④).
        </p>
        {!isLandType && (
          <p data-testid="bg-pre-deemed-no-sec164" className="text-xs">
            ② §164⑤~⑦ 가액(건물 기준시가 고시 전 상속 건물 — 소득세법 시행령 §163⑨2호)은 이 화면에서 입력할 수 없어 비교에서 빠집니다.
            해당되면 양도소득세 계산기에서 계산하세요.
          </p>
        )}
      </ToneCard>
      <FieldCard
        label="① 상속개시일 현재 상증법 평가액 (원)"
        hint="상속개시일 현재 「상속세 및 증여세법」 §60~§66에 따라 평가한 가액(세무서장이 결정·경정했으면 그 가액). 이 금액(또는 ②)이 채택되면 실지거래가액으로 보아 아래 자본적지출·양도비에 채무비율을 곱해 공제합니다."
      >
        <CurrencyInput
          label="상속개시일 평가액"
          value={bgt.reportedValueAtInheritance && bgt.reportedValueAtInheritance > 0 ? String(bgt.reportedValueAtInheritance) : ""}
          onChange={(v) => set({ reportedValueAtInheritance: parseAmount(v) || undefined })}
          hideLabel
          hideUnit
          data-testid="bg-pre-deemed-reported"
        />
      </FieldCard>
      {!clauseAFilled && (
        <ToggleCard
          tone="amber"
          size="sm"
          title="상증법 평가액을 확인할 수 없음"
          description={`①${isLandType ? "·②" : ""}를 모두 확인할 수 없으면 ③ 환산취득가액으로 계산합니다 — 선택해야 계산할 수 있습니다.`}
          checked={bgt.preDeemedClauseAUnconfirmed === true}
          onCheckedChange={(v) => set({ preDeemedClauseAUnconfirmed: v || undefined })}
          data-testid="bg-pre-deemed-unconfirmed"
        />
      )}
      <FieldCard label="자본적 지출 (원)" hint="①·②가 채택되면 채무비율을 곱해 공제합니다. ③이 채택되면 「③ + 개산공제」보다 클 때만 그 대신 씁니다(소득세법 §97②2호 단서). 미입력 시 0.">
        <CurrencyInput
          label="자본적 지출"
          value={bgt.capitalExpenditure && bgt.capitalExpenditure > 0 ? String(bgt.capitalExpenditure) : ""}
          onChange={(v) => set({ capitalExpenditure: parseAmount(v) || undefined })}
          hideLabel
          hideUnit
          data-testid="bg-capital-expenditure"
        />
      </FieldCard>
      <FieldCard label="양도비용 (원)" hint="①·②가 채택되면 채무비율을 곱해 공제합니다. ③이 채택되면 「③ + 개산공제」보다 클 때만 그 대신 씁니다(소득세법 §97②2호 단서). 미입력 시 0.">
        <CurrencyInput
          label="양도비용"
          value={bgt.transferExpense && bgt.transferExpense > 0 ? String(bgt.transferExpense) : ""}
          onChange={(v) => set({ transferExpense: parseAmount(v) || undefined })}
          hideLabel
          hideUnit
          data-testid="bg-transfer-expense"
        />
      </FieldCard>
    </div>
  );
}
