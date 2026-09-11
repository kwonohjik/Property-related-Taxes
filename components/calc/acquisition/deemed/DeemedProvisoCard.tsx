"use client";

/**
 * 간주취득 §15② 단서 — 사치성 재산(§13⑤) 해당 여부
 *
 * 「지방세법」 §15② 본문은 간주취득 세율을 **중과기준세율(2%)** 로 확정하고, 단서가
 * 「취득**물건이** … 제13조제5항에 해당하는 경우에는 중과기준세율의 **100분의 500**」
 * 이라 정한다 ⇒ **10%**.
 *
 * ## 왜 별도 카드인가 — 일반취득 카드를 재사용하지 않는다
 *
 * 수는 같아도 **조문이 다르다**. 일반취득 카드(`Step1.tsx`)는 「표준세율 + 8%p (§13⑤)」로
 * 설명하는데, 간주취득에는 §11·§12 표준세율이 아예 등장하지 않는다(§15② 본문이 치환).
 * 문구를 복사하면 화면의 근거가 틀린다.
 *
 * ## 종전에는 이 칸이 화면에 없었다
 *
 * `Step1.tsx`가 간주취득에서 **조기 반환**해 사치성 토글(그 아래)에 닿지 못했고, 법인 중과는
 * Step 4인데 간주취득은 2단계에서 끝난다. 그래서 ①**켤 수 없고**(골프장 보유 법인의
 * 과점주주가 2%로 계산) ②**끌 수도 없었다**(매매 단계에서 켠 값이 ④로 그대로 실려 감).
 * 계획서: `docs/00-pm/acquisition-deemed-15-2-proviso.plan.md`
 *
 * ⚠️ §13①(중과기준세율 ×300% = 6%) 축은 **넣지 않는다**. §13①은 「신축·증축」·「공장
 *    신설·증설」이라는 **행위** 요건이라 간주취득에 어떻게 대응되는지 미확정이다(계획서 U-1).
 *    6%는 2%의 3배라 근거 없이 적용하면 법 근거 없는 불리 적용이 된다.
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { TaxHelp } from "@/components/calc/inputs/TaxHelp";
import {
  deemedProvisoRate,
  type DeemedProviso,
} from "@/lib/tax-engine/acquisition-deemed-proviso";
import type { FormState } from "../shared";

/** 간주취득 유형별 컨텍스트 — 사치성 유형 선택지를 물건에 맞게 좁힌다 */
export type DeemedProvisoContext = "major_shareholder" | "land_category" | "renovation";

const LUXURY_OPTIONS = [
  { value: "golf_course", label: "골프장 (회원제 — 구분등록 대상 토지·건축물·입목)" },
  { value: "luxury_housing", label: "고급주택 (§13⑤3호)" },
  { value: "luxury_entertainment", label: "고급오락장 (도박장·유흥주점·특수목욕장 등)" },
  { value: "luxury_vessel", label: "고급선박 (비업무용 자가용)" },
  { value: "villa", label: "별장 (2023.3.14 이전 취득분에만 적용 — §13⑤1호 삭제)" },
] as const;

/**
 * 물건 종류에 맞지 않는 선택지는 감춘다.
 * · 지목변경(§7④)은 **토지**, 개수는 **건축물**이라 고급선박이 성립하지 않는다.
 * · 과점주주는 법인이 보유한 **부동산등** 전부가 대상이라 5종 모두 남긴다.
 */
function optionsFor(context: DeemedProvisoContext) {
  if (context === "major_shareholder") return [...LUXURY_OPTIONS];
  return LUXURY_OPTIONS.filter((o) => o.value !== "luxury_vessel");
}

const PROVISO_RATE_LABEL = `${(deemedProvisoRate("luxury") * 100).toFixed(0)}%`;
const BASE_RATE_LABEL = `${(deemedProvisoRate("none" as DeemedProviso) * 100).toFixed(0)}%`;

interface Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  context: DeemedProvisoContext;
  /** 물건별 구분 모드에서는 행마다 판정하므로 이 카드를 잠근다 */
  disabled?: boolean;
  disabledReason?: string;
}

export function DeemedProvisoCard({ form, set, context, disabled, disabledReason }: Props) {
  const checked = form.isLuxuryProperty ?? false;

  return (
    <ToggleCard
      tone="rose"
      title={`사치성 재산(§13⑤)에 해당 — 세율 ${PROVISO_RATE_LABEL}`}
      description={`「지방세법」 §15② 단서: 취득물건이 §13⑤(골프장·고급주택·고급오락장·고급선박)에 해당하면 중과기준세율의 100분의 500(${PROVISO_RATE_LABEL})을 적용합니다. 해당 없으면 본문 ${BASE_RATE_LABEL}입니다.`}
      checked={checked}
      disabled={disabled}
      disabledReason={disabledReason}
      onCheckedChange={(v) => {
        set("isLuxuryProperty", v);
        if (!v) set("luxuryType", "");
      }}
      data-testid="deemed-proviso-toggle"
      trailing={
        <TaxHelp
          title="간주취득의 세율 — 지방세법 §15②"
          summary="간주취득 세율은 중과기준세율 2%. 취득물건이 사치성(§13⑤)이면 그 500%인 10%."
          details={`## 본문 — 중과기준세율

> ② 다음 각 호의 어느 하나에 해당하는 취득에 대한 취득세는 **중과기준세율을 적용**하여
> 계산한 금액을 그 세액으로 한다.
> 1. **개수**로 인한 취득 …
> 2. 제7조제4항에 따른 … **토지의 가액 증가** …
> 3. 제7조제5항에 따른 **과점주주의 취득** …

§11·§12의 표준세율(토지 4%·주택 1~3% 등)은 간주취득에 **등장하지 않습니다**.
본문이 표준세율을 중과기준세율로 통째 치환하기 때문입니다.

## 단서 — 취득물건이 §13⑤이면 500%

> 다만, 취득물건이 제13조제1항에 해당하는 경우에는 중과기준세율의 100분의 300을,
> 같은 조 **제5항**에 해당하는 경우에는 중과기준세율의 **100분의 500**을 각각 적용한다.

기준이 「취득**물건이**」이므로 **물건 단위**로 갈립니다. 법인이 골프장과 일반 토지를
함께 보유하면 골프장만 10%, 나머지는 2%입니다(과점주주는 아래 「물건별 구분 입력」).

## 지방교육세는 없습니다
§151①1 본문 괄호가 §15② 해당분을 지방교육세 과세대상에서 제외합니다.`}
          legalBasis="지방세법 제15조 제2항"
        />
      }
    >
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          §13⑤ 사치성 재산 유형을 선택하세요 (별장은 2023.3.14 이후 취득분 중과 폐지).
        </p>
        <RadioCardGroup
          tone="rose"
          layout="stack"
          name={`deemedLuxuryType-${context}`}
          value={form.luxuryType ?? ""}
          onChange={(v) => set("luxuryType", v)}
          options={optionsFor(context)}
          data-testid="deemed-proviso-type"
        />
      </div>
    </ToggleCard>
  );
}
