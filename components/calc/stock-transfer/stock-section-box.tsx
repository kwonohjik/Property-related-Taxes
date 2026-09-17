"use client";

/**
 * 주식 마법사 — **섹션 상자 래퍼** 공용 단일 소스
 *
 * 계획서: `docs/00-pm/exit-tax-wizard-step-realign.plan.md` Q-2
 *
 * 해외주식(`ForeignStock*Block`)과 국외전출세(`ExitTax*Block`)가 **같은 구현을 각자 복제**하고
 * 있었다(주석까지 동일). 두 트랙이 함께 쓰므로 `foreign-stock-*` 이름 아래 두면 오해를 남긴다.
 *
 * 🔑 **섹션 번호(`n`)는 각 마법사 «단계» 안에서 1부터**다 — 단계가 갈린 뒤 연번은 의미가 없다.
 */

import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { Tone } from "@/components/calc/shared/tones";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

/** 단계 블록 공통 props — 해외주식·국외전출세가 함께 쓴다 */
export interface StockStepBlockProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function SectionBox({
  n,
  label,
  tone,
  children,
}: {
  /**
   * 섹션 번호. **생략 가능**하다 — 이 블록이 상위 단계의 «한 섹션 안»에 들어갈 때는
   * 바깥 `SectionTitle` 이 번호를 갖고, 안쪽까지 번호를 달면 화면에 번호 체계가 둘이 된다
   * (계획서 `exit-tax-wizard-step-realign.plan.md` §13 — 번호 공백 회귀에서 배운 것).
   */
  n?: number;
  label: string;
  tone: Tone;
  children: React.ReactNode;
}) {
  // 톤은 <ToneCard>(tones.ts 정적 소스) — 기존 동적 `${tone}` 제거(JIT purge 위험).
  // p-4·space-y-3는 기존 레이아웃 보존. noDark: 이 폼은 원래 dark 미대응(light 전용)이라
  // dark 변형을 새로 입히지 않아 양 모드 모두 회귀 0.
  return (
    <ToneCard tone={tone} sectionNum={n} title={label} className="p-4" bodyClassName="space-y-3" noDark>
      {children}
    </ToneCard>
  );
}
