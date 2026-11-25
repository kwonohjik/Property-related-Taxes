"use client";

/**
 * 재산세 별도합산 — 철거ㆍ멸실 부속토지 «한시 특례 사실 확인» 블록 (PSA-U1 · 계획서 `property-separate-demolished-requirements.ui.plan.md` §4 · 엔진 §5.9).
 *
 * `Step2SeparateAggregate`가 철거 토글·철거일 바로 뒤에 그린다(PSA-S2 재배치 — 토글이 토지 면적·공장용지 바로 뒤). **엄격 순차 노출(PSA-S1)**: 엔진 사슬 `chain.order`(= 답이 있는 칸 + 첫 미답 칸) 순서대로 그리고 그 뒤 칸은 그리지 않는다.
 *   종류(`order`에 있을 때만 — 날짜만으로 접힘이 확정되면 묻지 않는다) → [빈집정비 관문 — 주택 ∧ 철거일이 일반 한시 기간 밖·빈집 기간 안] → 허가·사용승인 → 철거 후 건축 외 용도
 *   → [빈집정비 단서 하위 — 건축 외 «예» ∧ 주택, 관문에서 이미 물었으면 생략] → 국가 등 공용·공공용 사용 → 유료.
 *   철거 전 바닥면적·용도지역은 이 블록 밖 사슬 끝의 `SeparateAggregateAreaBasis`가 그린다(`Step2SeparateAggregate`가 `chain.asked.buildingFloorArea`일 때만 — PSA-S2).
 * 어느 칸이 보이는가는 엔진 사슬(`propertyDemolishedChain`)을 어댑터 `demolishedChainOf`가 한 곳에서 부른 값이다(= ④ 전송 = ⑧ 차단 = ⑫ 400 — 노출 ≡ 필수). UI는 날짜·시행본·답을 비교하지 않는다.
 * 선택지 값 `""`은 «미선택» — 가정값 없음(노출된 칸의 미선택은 ⑧이 막고, 명시 «모름»·«아니오»는 막지 않고 엔진이 혜택 불성립 + 확인 필요로 접는다).
 * `useEffect → store` 미러링 없음: 전부 렌더 파생이고 쓰기는 onChange뿐이다. 칸이 사라져도 저장값은 지우지 않는다(숨은 값 보존 — ④가 보내지 않고 ⑧이 묻지 않는다).
 */
import type { ReactNode } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { CollapsibleHintCard } from "@/components/calc/shared/CollapsibleHintCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { demolishedChainOf } from "@/lib/calc/property-separate-requirements";
import { demolishedFactIssueOf } from "@/lib/calc/property-separate-requirements";
import { demolishedPeriodTextOf } from "@/lib/calc/property-separate-requirements";
import { PROPERTY_SEPARATE } from "@/lib/tax-engine/legal-codes";
import { PROPERTY_DEMOLISHED_ISSUE_MESSAGE } from "@/lib/tax-engine/property-separate-requirements";
import { resolvePropertyTaxBaseDate } from "@/lib/tax-engine/property-separate-requirements";
import type { PropertyDemolishedAskField } from "@/lib/tax-engine/property-separate-requirements";
import { PrevAnswerMark } from "./SeparateAggregateSequenceNotes";
import { SettledNotice } from "./SeparateAggregateSequenceNotes";
import { demolishedFormValues } from "./request-body";
import { DEMOLISHED_DATE_NOTICE } from "./separate-sequence";
import { demolishedSettledOf } from "./separate-sequence";
import type { SequenceField } from "./separate-sequence";
import type { FormState } from "./shared";

type Answer = "yes" | "no" | "unknown";
type Kind = "house" | "building";

const LABELS: Record<Answer, string> = { yes: "예", no: "아니오", unknown: "모름" };

/** 3지선다 선택지 — 값은 `yes`·`no`·`unknown`, 뜻은 칸마다 다르다. 순서는 «혜택 쪽 답이 먼저»가 아니라 질문 문장 순서다. */
function answerOptions(key: string, order: readonly Answer[]): RadioCardOption<Answer>[] {
  return order.map((v) => ({ value: v, label: LABELS[v], testId: `pt-sa-demolished-${key}-${v}` }));
}

const KIND_OPTIONS: RadioCardOption<Kind>[] = [
  { value: "house", label: "주택", testId: "pt-sa-demolished-kind-house" },
  { value: "building", label: "주택이 아닌 건축물", testId: "pt-sa-demolished-kind-building" },
];

/** 칸 질문 — `FieldCard` 라벨이자 라디오 그룹 이름(`aria-label`)이다 */
const Q = {
  kind: "철거된 것은 주택입니까, 주택이 아닌 건축물입니까?",
  permit: "철거된 건축물(주택)이 건축 관계 법령상 허가·사용승인을 받은 것이었습니까?",
  otherUse: "철거 후 그 토지를 건축을 위한 용도 외의 다른 용도로 사용했습니까?",
  vacantHouse: "철거된 주택이 빈집정비사업 등으로 철거된 빈집이었습니까?",
  publicUse: "과세기준일 현재 그 부속토지를 국가·지방자치단체·지방자치단체조합이 1년 이상 공용 또는 공공용으로 사용하고 있습니까?",
  publicUsePaid: "그 사용이 유료이거나, 소유권 유상이전을 약정하고 취득 전에 미리 사용한 경우였습니까?",
} as const;

interface Props {
  form: FormState;
  /** 철거 사슬 칸 중 «이전에 고른 답» 표식을 붙일 칸(`Step2SeparateAggregate`가 파생) */
  prev: ReadonlySet<SequenceField>;
  onConfirm: (field: SequenceField) => void;
  onChange: (d: Partial<FormState>) => void;
}

export function SeparateAggregateDemolishedFacts({ form, prev, onConfirm, onChange }: Props) {
  const values = demolishedFormValues(form);
  const taxBaseDate = resolvePropertyTaxBaseDate();
  const chain = demolishedChainOf(values, taxBaseDate);
  const period = demolishedPeriodTextOf(taxBaseDate);
  const year = taxBaseDate.getUTCFullYear();

  const kindChosen = form.saDemolishedKind === "house" || form.saDemolishedKind === "building";
  // 철거일·과세기준일·공장용지와 종류가 서로 모순이면 한 줄로 알린다(차단은 ⑧·⑫가 한다 — 같은 `propertyDemolishedFactIssue`의 문구).
  const issue = demolishedFactIssueOf(values, taxBaseDate);
  const contradiction =
    issue && (issue.message === PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedAfterBaseDate || issue.message === PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedFactoryHouse)
      ? issue.message
      : null;

  // 접힘 확정이면 «왜 더 묻지 않는지» 안내 — 사유 문장은 엔진 사슬이 낸다(UI가 날짜를 비교하거나 법률 문장을 짓지 않는다). 날짜만으로 확정된 접힘(종류를 묻지 않는 구간)도 같은 안내다.
  const settled = demolishedSettledOf(form);
  // 성립(holds)인데 묻는 칸이 하나도 없는 시행본 — 접힘 확정 안내가 아니라 «확인할 요건 칸이 없다»는 한 줄
  const factCards = chain.order.filter((f) => f !== "demolishedKind" && f !== "buildingFloorArea");
  const noFactsNotice = chain.resolved?.kind === "holds" && factCards.length === 0 && !contradiction
    ? "이 과세기준일 시행본에는 확인할 요건 칸이 없습니다 — 판정 사유는 계산 후 결과 화면에서 확인하세요."
    : null;
  const mark = (field: SequenceField) => (prev.has(field) ? <PrevAnswerMark field={field} onConfirm={onConfirm} /> : null);

  const cards: Record<PropertyDemolishedAskField, ReactNode> = {
    demolishedKind: (
      <FieldCard
        key="demolishedKind"
        label={Q.kind}
        required
        hint="빈집정비사업 3년은 주택(빈집)에만, 철거 전 바닥면적 × 용도지역 배율 범위는 건축물에만 적용되어 묻습니다. 위 «공장용지»를 켰다면 공장용 건축물이므로 «주택이 아닌 건축물»입니다."
      >
        <RadioCardGroup
          name="saDemolishedKind"
          aria-label={Q.kind}
          tone="sky"
          layout="inline"
          options={KIND_OPTIONS}
          value={form.saDemolishedKind}
          onChange={(v) => onChange({ saDemolishedKind: v })}
          data-testid="pt-sa-demolished-kind"
          data-field="demolishedKind"
        />
      </FieldCard>
    ),
    demolishedPermit: (
      <FieldCard
        key="demolishedPermit"
        label={Q.permit}
        required
        hint="건축 관계 법령에 따라 허가 등을 받아야 하는데 받지 않았거나 사용승인(임시사용승인 포함)을 받아야 하는데 받지 않은 건축물 또는 주택의 부속토지는 한시 별도합산에서 제외됩니다. 건축물대장·허가대장으로 확인하세요 — 모름은 인정하지 않고 확인 필요로 표시합니다."
      >
        <RadioCardGroup
          name="saDemolishedPermit"
          aria-label={Q.permit}
          tone="amber"
          layout="inline"
          options={answerOptions("permit", ["yes", "no", "unknown"])}
          value={form.saDemolishedPermit}
          onChange={(v) => onChange({ saDemolishedPermit: v })}
          data-field="demolishedPermit"
        />
      </FieldCard>
    ),
    demolishedOtherUse: (
      <FieldCard
        key="demolishedOtherUse"
        label={Q.otherUse}
        required
        hint={`주차장·야적장·경작 등 건축을 위한 용도 외로 사용했으면 «예»이고 한시 별도합산에서 제외됩니다(그 용도가 무엇인지는 묻지 않습니다). 나대지로 둔 것은 건축 외 용도가 아닙니다. 일부만 그렇게 썼으면 그 부분만 제외되지만 이 계산기는 면적을 안분하지 않으므로 «예»로 답하고 전체를 종합합산으로 계산한 뒤 확인 필요로 표시합니다. 모름도 인정하지 않고 확인 필요로 표시합니다.${form.saDemolishedKind === "house" ? " «예»이면 철거된 것이 빈집정비사업 빈집인지 이어서 묻고, 빈집이면 국가 등 공용·공공용 사용 예외를 추가로 묻습니다." : ""}`}
      >
        <RadioCardGroup
          name="saDemolishedOtherUse"
          aria-label={Q.otherUse}
          tone="amber"
          layout="inline"
          options={answerOptions("otheruse", ["no", "yes", "unknown"])}
          value={form.saDemolishedOtherUse}
          onChange={(v) => onChange({ saDemolishedOtherUse: v })}
          data-field="demolishedOtherUse"
        />
      </FieldCard>
    ),
    demolishedVacantHouse: (
      <FieldCard
        key="demolishedVacantHouse"
        label={Q.vacantHouse}
        required
        hint={`${chain.vacantHousePosition === "gate" ? `철거일이 일반 한시 기간(${period.general ?? "—"})을 넘고 빈집정비사업 철거 빈집 기간(${period.vacantHouse ?? "3년"}) 안이라, 이 답이 한시 기간 안인지를 정해 먼저 묻습니다. ` : ""}「빈집 및 소규모주택 정비에 관한 특례법」 빈집정비사업 또는 「농어촌정비법」 생활환경정비사업(빈집의 정비에 관한 사업만)으로 철거했으면 «예»입니다. «예»는 철거일부터 ${period.vacantHouse ?? "3년"}, «아니오»·«모름»은 일반 한시 기간(${period.general ?? "—"})만 인정하고 3년 연장은 확인 필요로 표시합니다(${PROPERTY_SEPARATE.DEMOLISHED_VACANT_HOUSE}).`}
      >
        <RadioCardGroup
          name="saDemolishedVacantHouse"
          aria-label={Q.vacantHouse}
          tone="amber"
          layout="inline"
          options={answerOptions("vacanthouse", ["yes", "no", "unknown"])}
          value={form.saDemolishedVacantHouse}
          onChange={(v) => onChange({ saDemolishedVacantHouse: v })}
          data-field="demolishedVacantHouse"
        />
      </FieldCard>
    ),
    demolishedPublicUse: (
      <ToneCard key="demolishedPublicUse" tone="violet" title={`국가 등 공용·공공용 사용 예외(${PROPERTY_SEPARATE.DEMOLISHED_VACANT_HOUSE_PUBLIC_USE})`}>
        <div className="space-y-3" data-testid="pt-sa-demolished-publicuse">
          <CollapsibleHintCard tone="violet" summary="예외의 요건과 이 계산기의 처리">
            <ul className="list-disc space-y-1 pl-4 leading-snug">
              <li>건축을 위한 용도 외로 쓴 부속토지는 원래 한시 별도합산에서 제외되지만, 빈집정비사업으로 철거한 빈집의 부속토지는 국가·지방자치단체·지방자치단체조합이 1년 이상 공용 또는 공공용으로 사용하고 재산세가 부과되면(위 제목의 조문) 그 사용 기간 동안 포함됩니다.</li>
              <li>일부만 사용했으면 «아니오»입니다 — 이 계산기는 면적을 안분하지 않습니다.</li>
              <li>무상으로 쓰면 재산세가 부과되지 않을 수 있습니다(비과세 가능성). 이 계산기는 비과세를 판정하지 않으므로 «유료 아님»은 종합합산으로 계산하고 확인 필요로 표시합니다.</li>
            </ul>
          </CollapsibleHintCard>

          <FieldCard
            label={`${year}년 ${Q.publicUse}`}
            required
            hint="1년 이상 사용할 것이 계약서 등으로 입증되면 «예»입니다. 부속토지 전부를 사용한 경우만 «예»이고, «아니오»·«모름»은 인정하지 않고 확인 필요로 표시합니다."
          >
            <RadioCardGroup
              name="saDemolishedPublicUse"
              aria-label={`${year}년 ${Q.publicUse}`}
              tone="violet"
              layout="inline"
              options={answerOptions("publicuse", ["yes", "no", "unknown"])}
              value={form.saDemolishedPublicUse}
              onChange={(v) => onChange({ saDemolishedPublicUse: v })}
              data-field="demolishedPublicUse"
            />
          </FieldCard>

          {chain.asked.demolishedPublicUsePaid && (
            <div className="space-y-1">
              {mark("demolishedPublicUsePaid")}
              <FieldCard
                label={Q.publicUsePaid}
                required
                hint="무상 사용이면 재산세가 비과세될 수 있어 «아니오»입니다 — 이 계산기는 비과세를 판정하지 않아 종합합산으로 계산하고 확인 필요로 표시합니다. 재산세 과세내역(고지서)으로 확인하세요."
              >
                <RadioCardGroup
                  name="saDemolishedPublicUsePaid"
                  aria-label={Q.publicUsePaid}
                  tone="violet"
                  layout="inline"
                  options={answerOptions("publicusepaid", ["yes", "no", "unknown"])}
                  value={form.saDemolishedPublicUsePaid}
                  onChange={(v) => onChange({ saDemolishedPublicUsePaid: v })}
                  data-field="demolishedPublicUsePaid"
                />
              </FieldCard>
            </div>
          )}
        </div>
      </ToneCard>
    ),
    // 유료 칸은 공용 사용 카드 안에 그린다(위) · 면적 쌍은 사슬 끝 `SeparateAggregateAreaBasis`가 그린다(Step2)
    demolishedPublicUsePaid: null,
    buildingFloorArea: null,
  };

  return (
    <div data-testid="pt-sa-demolished-facts">
      <ToneCard tone="amber" title="철거 후 한시 별도합산 사실 확인" bodyClassName="space-y-3">
        <p className="text-caption leading-snug text-muted-foreground" data-testid="pt-sa-demolished-intro">
          철거ㆍ멸실된 건축물·주택의 부속토지는 한시 기간 안이고 아래 요건을 모두 충족해야 {year}년 과세기준일(6월 1일)에 별도합산으로 봅니다(
          {PROPERTY_SEPARATE.DEMOLISHED_GRACE}). 요건은 철거일·종류와 앞 답에 따라 필요한 것만 순서대로 묻습니다.
        </p>

        {chain.order.map((field) =>
          cards[field] ? (
            <div key={field} className="space-y-1">
              {mark(field)}
              {cards[field]}
            </div>
          ) : null,
        )}

        {settled && !contradiction && <SettledNotice settled={settled} />}

        {contradiction && (
          <p className="text-xs font-medium text-destructive" role="alert" data-testid="pt-sa-demolished-contradiction">
            {contradiction}
          </p>
        )}

        {(!form.saDemolishedDate || (chain.next === "demolishedKind" && !kindChosen)) && (
          <p className="text-caption leading-snug" data-testid="pt-demolished-dates-notice">
            {DEMOLISHED_DATE_NOTICE}
          </p>
        )}

        {noFactsNotice && (
          <p className="text-caption leading-snug" data-testid="pt-sa-demolished-no-facts">
            {noFactsNotice}
          </p>
        )}
      </ToneCard>
    </div>
  );
}
