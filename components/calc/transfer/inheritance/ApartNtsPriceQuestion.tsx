"use client";

/**
 * 자산 단위 공동주택 — 「상속개시일·증여일 당시 국세청장이 고시한 공동주택 기준시가가 있었는가」 (영 §163⑨ 단서 2호).
 *
 * 계획서: docs/00-pm/transfer-163-9-apart-nts-price-question.plan.md (Q-1~Q-3 A — 2026-10-19 「권고대로」)
 * - 답은 있었음/없었음 둘뿐이다. **「모름」은 없다**(사용자 지시) — 기본 미선택이고 ⑧이 답을 요구한다.
 * - 있었음 → 「건물의 기준시가가 고시되기 전」이 아니다 ⇒ 평가액만(② 카드를 열지 않는다).
 * - 없었음 → 첫 가격 기관(영 §164⑥ 국세청 고시 / ⑦ 국토교통부 공시 — Q-1)과 날짜(Q-2)를 받고, 호출부가 ② 카드를 연다.
 * - 판정·송신·검증은 `lib/calc/apart-nts-price.ts`(3중 패턴 — 파생값은 store에 쓰지 않는다).
 */
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { apartNtsQuestionRelevant, isApartSec163_9Asset } from "@/lib/calc/apart-nts-price";
import { deriveSec163_9BaseDate } from "@/lib/calc/transfer-163-9-base-date";
import { SEC_163_9_BUILDING_FIRST_DISCLOSURE } from "@/lib/tax-engine/transfer-split-part-cause";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const EXISTED_OPTIONS = [
  {
    value: "yes" as const,
    label: "있었음 — 국세청 고시 공동주택 기준시가가 있었다",
    description: "평가액만으로 계산합니다 (영 §163⑨ 본문 — 단서 2호 비교 대상이 아님)",
    testId: "apart-nts-existed-yes",
  },
  {
    value: "no" as const,
    label: "없었음 — 그 뒤에 처음 가격이 매겨졌다",
    description: "평가액과 첫 가격으로 환산한 영 §164⑥·⑦ 가액 중 많은 금액 (영 §163⑨ 단서 2호)",
    testId: "apart-nts-existed-no",
  },
];

const AGENCY_OPTIONS = [
  {
    value: "nts" as const,
    label: "국세청장 고시 공동주택 기준시가",
    description: "영 §164⑥ — 국세청이 이 공동주택에 처음 고시한 기준시가로 환산",
    testId: "apart-first-price-nts",
  },
  {
    value: "molit" as const,
    label: "국토교통부장관 공시 공동주택가격",
    description: "영 §164⑦ — 국토교통부가 이 공동주택에 처음 공시한 공동주택가격으로 환산",
    testId: "apart-first-price-molit",
  },
];

function ApartFirstPriceDateField({ asset, onChange, baseDateLabel }: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  baseDateLabel: string;
}) {
  return (
    <FieldCard
      field="inhApartFirstPriceDate"
      label="이 공동주택의 첫 가격 고시·공시일"
      required
      hint={`${baseDateLabel} 뒤부터 양도일까지의 날짜 — 국세청 고시면 그 고시일, 국토교통부 공시면 그 공시일입니다.`}
    >
      <DateInput
        value={asset.inhApartFirstPriceDate}
        onChange={(v) => onChange({ inhApartFirstPriceDate: v })}
        data-testid="apart-first-price-date"
      />
    </FieldCard>
  );
}

/** 질문 — 질문이 필요한 공동주택(`apartNtsQuestionRelevant`)에서만 뜬다. 호출부는 「없었음」일 때 아래에 ② 카드를 연다. */
export function ApartNtsPriceQuestion({ asset, onChange, baseDateLabel }: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 「상속개시일」·「증여일」 */
  baseDateLabel: string;
}) {
  if (!apartNtsQuestionRelevant(asset)) return null;
  const existed = asset.inhApartNtsPriceExisted;
  // 2005.4.30. 뒤에 받은 공동주택은 첫 가격 날짜가 이 질문을 열었다 — 답과 무관하게 그 칸을 보여 되돌릴 수 있게 한다.
  const openedByDate = deriveSec163_9BaseDate(asset).slice(0, 10) >= SEC_163_9_BUILDING_FIRST_DISCLOSURE;

  return (
    <div className="space-y-2" data-testid="apart-nts-price-question">
      <div className="space-y-1.5">
        <p className="text-caption text-muted-foreground font-medium">
          {baseDateLabel} 당시 이 공동주택에 국세청장이 고시한 공동주택 기준시가가 있었습니까?
        </p>
        <p className="text-caption text-muted-foreground">
          국세청은 아파트·연립주택 등 공동주택 기준시가를 주택·유형마다 다른 시점부터 고시했습니다(예: 1992.1.1. 처음 고시된 아파트 —
          사전-2018-법령해석재산-0183 · 1997.5.1. 처음 일괄 고시된 연립주택 — 재일46014-1228). 고시 가액이 있었으면 「건물의 기준시가가
          고시되기 전」이 아닙니다.
        </p>
        <RadioCardGroup
          name={`apart-nts-existed-${asset.assetId}`}
          tone="amber"
          layout="stack"
          options={EXISTED_OPTIONS}
          value={existed}
          onChange={(v) => onChange({ inhApartNtsPriceExisted: v })}
          data-field="inhApartNtsPriceExisted"
        />
      </div>

      {existed === "yes" && (
        <ToneCard tone="amber">
          <p className="text-xs text-amber-900 dark:text-amber-200" data-testid="apart-nts-existed-note">
            {baseDateLabel} 당시 국세청 고시 공동주택 기준시가가 있었으므로 영 §164⑥·⑦ 가액과 비교하지 않고 평가액을 취득가액으로
            합니다(소득세법 시행령 §163⑨ 본문).
          </p>
        </ToneCard>
      )}

      {existed === "no" && (
        <div className="space-y-1.5">
          <p className="text-caption text-muted-foreground font-medium">이 공동주택에 처음 매겨진 가격</p>
          <RadioCardGroup
            name={`apart-first-price-agency-${asset.assetId}`}
            tone="amber"
            layout="stack"
            options={AGENCY_OPTIONS}
            value={asset.inhApartFirstPriceAgency}
            onChange={(v) => onChange({ inhApartFirstPriceAgency: v })}
            data-field="inhApartFirstPriceAgency"
          />
        </div>
      )}
      {(existed === "no" || openedByDate) && (
        <ApartFirstPriceDateField asset={asset} onChange={onChange} baseDateLabel={baseDateLabel} />
      )}
    </div>
  );
}

/**
 * 진입 카드 — 2005.4.30. 이후에 받은 자산 단위 공동주택. 그 뒤에 첫 가격이 매겨졌으면(신축 등) 날짜를 받아 위 질문을 연다.
 * 단독·다가구의 진입 카드(`HouseFirstDisclosureEntryCard`)를 대신한다(한 곳에만).
 */
export function ApartFirstPriceEntryCard({ asset, onChange, baseDate, baseDateLabel }: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  baseDate: string | undefined;
  baseDateLabel: string;
}) {
  const base = baseDate?.slice(0, 10) ?? "";
  if (!isApartSec163_9Asset(asset) || apartNtsQuestionRelevant(asset) || !base || base < SEC_163_9_BUILDING_FIRST_DISCLOSURE) return null;
  return (
    <div className="space-y-2" data-testid="apart-first-price-entry">
      <ToneCard tone="amber">
        <p className="text-xs text-amber-900 dark:text-amber-200">
          {baseDateLabel}({base})에 이 공동주택에 아직 가격(국세청 고시 기준시가·국토교통부 공시 공동주택가격)이 없었다면(그 뒤 신축 등으로
          처음 매겨짐), 평가액과 첫 가격으로 환산한 영 §164⑥·⑦ 가액 중 <strong>많은 금액</strong>이 취득가액입니다(소득세법 시행령
          §163조 제9항 단서 2호). 그런 공동주택이면 아래에 첫 가격 고시·공시일을 입력하세요 — 비워 두면 평가액만으로 계산합니다.
        </p>
      </ToneCard>
      <ApartFirstPriceDateField asset={asset} onChange={onChange} baseDateLabel={baseDateLabel} />
    </div>
  );
}
