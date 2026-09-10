"use client";

/**
 * AcquisitionStdModeRadio — 상장 환산 «기준시가 산정 방식» 단일 축 (S3)
 *
 * 계획서 `docs/00-pm/stock-listed-conversion-unification.plan.md` **Q-2 3안**.
 *
 * ## 왜 축이 하나인가
 *
 * 종전에는 ToggleCard 3개(취득 후 상장 · 양도일 거래정지 · 취득일 거래정지)의 **조합**이었다.
 * 조합 중 둘은 **법령상 양립 불가**라 ⑧·⑫가 런타임으로 막고 있었는데,
 * 그러면 「UI는 통과시키고 validate가 막는」 모순이 된다.
 *
 * 네 갈래는 실제로 **배타적 4상태**다 — 엔진 if-체인이 이미 그렇게 갈라져 있고
 * (`stock-acquisition-basis.ts:128·165·257·303`), 양도일 거래정지 분기는
 * `calcUnlistedValuation`으로 양·취 양쪽을 함께 처리해 취득일 정지 정보를 쓰지 않는다.
 * ⇒ 축을 합쳐도 **표현력 손실이 없다**.
 *
 * ## 네 번째만 «분모»까지 바꾼다
 *
 * 양도일 거래정지는 분자뿐 아니라 **분모(양도 당시 기준시가)도** 보충 평가로 대체한다
 * (소령 §165③). 그래서 그 선택지에만 「①의 분모까지 대체합니다」를 달고,
 * `TransferStdPriceSection`이 안내로 치환된다.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { AcquisitionStdMode } from "@/lib/stores/calc-wizard-stock-store";

interface AcquisitionStdModeRadioProps {
  value: AcquisitionStdMode;
  onChange: (mode: AcquisitionStdMode) => void;
}

export function AcquisitionStdModeRadio({ value, onChange }: AcquisitionStdModeRadioProps) {
  return (
    <FieldCard
      label="기준시가 산정 방식"
      hint="취득 당시 기준시가(환산비율의 분자)를 무엇으로 구할지 정합니다."
    >
      <RadioCardGroup
        name="acquisitionStdMode"
        value={value}
        onChange={(v) => onChange(v as AcquisitionStdMode)}
        tone="emerald"
        layout="stack"
        options={[
          {
            value: "monthly_avg",
            label: "취득일 이전 1개월 종가평균",
            description: "일반 — 「소득세법」 제99조 제1항 제3호",
          },
          {
            value: "halt_acquisition",
            label: "취득일 거래정지·관리종목 → 보충 평가",
            description: "취득일 이전 1개월에 거래정지 구간이 있어 종가평균이 무효인 경우 (소령 §165③)",
          },
          {
            value: "post_listing",
            label: "취득 후 상장 → 상장일 이후 1개월 종가평균 환산",
            description: "취득 당시 비상장이었으나 양도 시점에 상장된 주식 (소령 §165⑤)",
          },
          {
            value: "halt_transfer",
            label: "양도일 거래정지·관리종목 → 양·취 모두 보충 평가",
            description: "이 방식만 «양도 당시 기준시가(분모)»까지 보충 평가로 대체합니다 (소령 §165③)",
          },
        ]}
      />
    </FieldCard>
  );
}
