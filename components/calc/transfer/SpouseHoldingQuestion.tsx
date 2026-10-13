"use client";

/**
 * 「양도일 현재도 배우자 쪽이 보유하나요」 — 계산기 명부 행·분양권·입주권 행 공용 질문 (결정 #47)
 *
 * 「소득세법 시행령」 §167의3⑨ · §167의4⑤는 혼인 5년 안 양도에서 **양도일 현재** 양도자의 배우자가 보유한 주택·분양권·입주권을
 * 주택 수에서 뺀다. 「혼인 전 보유자」(§155⑤ 합가 의제)와 **다른 사실**이라 칩 하나로 두지 않고 사실 질문으로 묻는다 — 「차감 적용」
 * 토글이 아니다(⑨는 신청 없이 적용되는 규정).
 *
 * 답하지 않은 값을 「아니오」로 읽지 않는다: 미응답·「모름」은 차감하지 않고 계산하며 결론을 가를 때만 확인 필요가 따른다
 * (엔진 `multi-house-surcharge-spouse-notice.ts`). 노출·필수 여부는 호출부가 `lib/calc/spouse-holding-scope.ts`로 정한다.
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { MULTI_HOUSE } from "@/lib/tax-engine/legal-codes/transfer-house";
import type { SpouseHoldingAnswer } from "@/lib/tax-engine/spouse-holding-at-transfer";

type Props = {
  /** 라디오 name 접두 — 행 id를 넣는다 */
  idPrefix: string;
  value: SpouseHoldingAnswer | undefined;
  onChange: (v: SpouseHoldingAnswer) => void;
  /** spouse_side: 예/아니오/모름 필수 · other: 예/아니오 선택(빈칸 = 아니오) · right: 권리 행 예/아니오/모름(미응답 = 모름) */
  role: "spouse_side" | "other" | "right";
};

export function SpouseHoldingQuestion({ idPrefix, value, onChange, role }: Props) {
  const withUnknown = role !== "other";
  // 주택 행은 §167의3⑨(주택 수), 분양권·입주권 행은 §167의4⑤(주택+권리 수)
  const basis = role === "right" ? MULTI_HOUSE.MARRIAGE_SUBTRACT_RIGHT_BASIS : MULTI_HOUSE.MARRIAGE_SUBTRACT_3HOUSE_BASIS;
  const subject = role === "right" ? "이 분양권·입주권" : "이 주택";
  return (
    <div data-testid={`spouse-holding-${role}`}>
      <ToneCard
        tone="violet"
        bodyClassName="space-y-2"
        title={role === "other" ? "양도일 현재 배우자가 보유하나요 (선택)" : "양도일 현재도 배우자 쪽이 보유하나요"}
        noDark
      >
        <p className="text-caption text-muted-foreground">
          혼인 5년 안에 양도하는 3주택 이상 세대는 <b>양도일 현재</b> 양도자의 배우자가 보유한 주택·분양권·입주권을 수에서 뺍니다({basis}).
          혼인 전 보유자와는 다른 사실입니다 — 혼인 뒤 배우자와 주고받아 지금 누가 보유하는지로 답하세요.
          {role === "spouse_side" &&
            ` 배우자 쪽 세대원(예: 배우자의 자녀)이 보유한 경우도 「예」로 답하세요(${MULTI_HOUSE.MARRIAGE_SUBTRACT_SPOUSE_HOUSEHOLD_RULING} — 배우자 세대 소유 주택 모두 제외).`}
          {role === "right" &&
            ` 배우자 쪽 세대원(예: 배우자의 자녀)이 보유한 경우도 「예」로 답하세요. 세대원 보유분까지 빼는 해석(${MULTI_HOUSE.MARRIAGE_SUBTRACT_SPOUSE_HOUSEHOLD_RULING})은 주택에 관한 것이며 분양권·입주권을 직접 다룬 해석례는 확인하지 못했습니다.`}
          {role === "other" && " 비워 두면 「아니오」로 봅니다. 「예」로 답하면 차감하지만 이 경우를 다룬 해석례를 확인하지 못해 확인 필요로 알립니다."}
        </p>
        <RadioCardGroup
          name={`spouse-holding-${idPrefix}`}
          tone="violet"
          layout="inline"
          value={value ?? ""}
          onChange={onChange}
          options={[
            { value: "yes", label: "예", description: `${subject}을(를) 양도일 현재 배우자 쪽이 보유`, testId: `spouse-holding-yes-${idPrefix}` },
            { value: "no", label: "아니오", description: `${subject}을(를) 양도일 현재 배우자 쪽이 보유하지 않음`, testId: `spouse-holding-no-${idPrefix}` },
            ...(withUnknown
              ? [{
                  value: "unknown" as const,
                  label: "모름",
                  description: "차감하지 않고 계산하며, 결과를 가를 때 확인 필요로 알립니다",
                  testId: `spouse-holding-unknown-${idPrefix}`,
                }]
              : []),
          ]}
        />
      </ToneCard>
    </div>
  );
}
