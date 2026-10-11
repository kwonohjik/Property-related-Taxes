"use client";

/**
 * 동거봉양 합가의 **직계존속 연령 요건** 선택 칸 — 결정 #9 (리뷰 G6-2).
 *
 * 「소득세법 시행령」 §155④는 「60세 이상의 직계존속(배우자의 직계존속 포함)을 동거봉양하기 위하여 세대를 합침으로써」 2주택이 된 경우에
 * 합친 날부터 N년 이내 먼저 양도하는 주택을 1세대1주택으로 본다. §156의2⑧2호(입주권·분양권 합가)도 60세 요건이 있다. 종전에는 합가일만
 * 넣으면 연령과 무관하게 비과세였다(합가일 입력 = 요건 충족 선언이라는 가정). 이제 선택해야 하며 고르지 않으면 모름 = 불성립이다.
 *
 * - 합가일 현재 **만 나이**로 판정한다(재산세과-291 · 서면법규과-820 · 사전-2015-법령해석재산-0424).
 * - 직계존속 중 1명이라도 만 60세 이상이면 되고, 그분이 주택 보유자가 아니어도 되며, 조부모·배우자의 직계존속(장인·장모)을 포함한다.
 * - 요양급여 받는 60세 미만 갈래는 §155④3호에만 있다 — 입주권·분양권(§156의2⑧2호)·상속주택(§155② 단서)에는 없다.
 * - 2009.2.3. 이전에 합가한 경우 여자는 55세 기준이었다(엔진은 이 옛 연혁을 판정하지 않는다 — 문구로만 안내).
 *
 * 양도세 계산기·판정 메뉴·증여세 부담부 양도 경로가 같은 컴포넌트를 쓴다(`MergeDateSection` · `MergedHouseholdRightSection`) —
 * 값은 `parentalCareParentAge` 하나다(진실 하나).
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";

export type ParentalCareParentAgeValue = "" | "over_60" | "care_benefit" | "none";

export function ParentalCareParentAgeField({
  value,
  onChange,
}: {
  value: ParentalCareParentAgeValue | undefined;
  onChange: (v: ParentalCareParentAgeValue) => void;
}) {
  return (
    <FieldCard
      field="parentalCareParentAge"
      label="합가일 현재 직계존속의 연령"
      required
      hint="합가일 현재 만 나이 기준입니다. 직계존속(조부모, 배우자의 직계존속인 장인·장모 포함) 중 1명이라도 만 60세 이상이면 되고, 그분이 주택을 보유하지 않아도 됩니다. 2009년 2월 3일 이전에 합가했다면 여자는 55세 기준이 적용되었으니 별도로 확인하세요."
    >
      <RadioCardGroup
        name="parental-care-parent-age"
        data-testid="parental-care-parent-age"
        tone="violet"
        value={value ?? ""}
        onChange={(v: string) => onChange(v as ParentalCareParentAgeValue)}
        options={[
          {
            value: "over_60",
            testId: "parental-care-age-over-60",
            label: "직계존속 중 1명 이상이 합가일 현재 만 60세 이상",
            description: "시행령 §155④ 본문 · §156의2⑧2호 · §155② 단서 모두 이 갈래입니다.",
          },
          {
            value: "care_benefit",
            testId: "parental-care-age-care-benefit",
            label: "요양급여를 받는 만 60세 미만 직계존속",
            description: "시행령 §155④3호 — 입주권·분양권 합가(§156의2⑧2호)와 상속주택(§155② 단서)에는 이 갈래가 없습니다.",
          },
          {
            value: "none",
            testId: "parental-care-age-none",
            label: "해당 없음",
            description: "60세 미만이고 요양급여 대상도 아닙니다 — 동거봉양 합가 특례를 적용하지 않습니다.",
          },
        ]}
      />
    </FieldCard>
  );
}
