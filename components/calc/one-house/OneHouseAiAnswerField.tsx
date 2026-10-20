"use client";

/**
 * 「원문에 없어 확인할 사실」 질문 옆의 입력 칸 — 질문이 가리키는 판정 메뉴 칸 하나(`answerTargetOf`).
 *
 * 위젯은 판정 메뉴 화면과 같은 공용 입력(라디오·날짜·금액·숫자)이고, 값도 그 화면이 넣는 모양 그대로다
 * (참/거짓은 boolean, 나머지는 문자열).
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import type { AnswerTarget } from "@/lib/one-house-ai/question-answer";

type Props = {
  target: AnswerTarget;
  value: unknown;
  onChange: (value: unknown) => void;
};

const YES_NO = [
  { value: "true", label: "예" },
  { value: "false", label: "아니오" },
];

export function OneHouseAiAnswerField({ target, value, onChange }: Props) {
  const { spec, path } = target;
  const testId = `one-house-ai-answer-${path}`;
  const text = typeof value === "string" ? value : "";

  const widget = (() => {
    switch (spec.kind) {
      case "boolean":
        return (
          <RadioCardGroup
            name={testId}
            layout="inline"
            options={YES_NO}
            value={value === true ? "true" : value === false ? "false" : ""}
            onChange={(v) => onChange(v === "true")}
          />
        );
      case "enum": {
        const options = spec.values ?? [];
        return (
          <RadioCardGroup
            name={testId}
            layout={options.length <= 3 ? "inline" : "stack"}
            options={options}
            value={text}
            onChange={onChange}
          />
        );
      }
      case "date":
        return <DateInput value={text} onChange={onChange} data-testid={testId} />;
      case "amount":
        return <CurrencyInput label={spec.label} hideLabel value={text} onChange={onChange} data-testid={testId} />;
      case "intString":
        return <DecimalInput value={text} onChange={(v) => onChange(v.replace(/\./g, ""))} data-testid={testId} />;
      default:
        return <DecimalInput value={text} onChange={onChange} data-testid={testId} />;
    }
  })();

  return (
    <div className="mt-1" data-testid={`${testId}-field`}>
      {widget}
    </div>
  );
}
