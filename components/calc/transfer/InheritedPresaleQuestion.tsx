"use client";

/**
 * 상속받은 §98의3·§98의5·§98의7 주택 — 「상속 당시 분양권이었고 상속인(본인)이 잔금을 내고 취득했나요?」 (US-07 · US-06)
 *
 * 완공된 주택을 상속받으면 특례가 적용되지 않는다(부동산거래관리과-337 · 조심 2017중1433 · 대법원 2014두35126).
 * 분양권을 상속받아 상속인이 잔금을 내고 취득한 주택은 적용된다(§98의3 — 기획재정부 조세법령운용과-1103, §98의5·§98의7 같은 문언).
 * 「모름」은 적용하지 않고 확인 필요로 안내한다. 감면 카드(자산)와 명부 행 ⑥이 같은 질문을 쓴다.
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";

export type InheritedPresaleAnswer = "yes" | "no" | "unknown";

export function InheritedPresaleQuestion({
  name,
  value,
  onChange,
  testIdPrefix,
}: {
  name: string;
  value: InheritedPresaleAnswer | "" | undefined;
  onChange: (v: InheritedPresaleAnswer) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="space-y-1.5" data-testid={`${testIdPrefix}-inherited-presale`}>
      <p className="text-sm font-medium">상속 당시 분양권이었고, 상속인(본인)이 잔금을 내고 취득했나요?</p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        완공된 주택을 상속받았으면 이 특례가 적용되지 않습니다. 분양권을 상속받아 본인이 잔금을 치르고 취득한 경우에만 적용됩니다.
      </p>
      <RadioCardGroup<InheritedPresaleAnswer>
        name={name}
        tone="violet"
        layout="inline"
        value={value ?? ""}
        onChange={onChange}
        options={[
          { value: "yes", label: "예 — 분양권 상속 후 잔금 취득", testId: `${testIdPrefix}-inherited-presale-yes` },
          { value: "no", label: "아니오 — 완공 주택 상속", testId: `${testIdPrefix}-inherited-presale-no` },
          { value: "unknown", label: "모름", testId: `${testIdPrefix}-inherited-presale-unknown` },
        ]}
      />
    </div>
  );
}
