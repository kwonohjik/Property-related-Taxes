"use client";

/**
 * 주택별 개별주택가격 최초공시일 입력 — 「소득세법 시행령」 §163⑨ 단서 2호 구간의 끝 (자산 단위·D2-4·D1-H 공용).
 *
 * 계획서: docs/00-pm/transfer-house-first-disclosure-per-house.plan.md §5.5 (Q-1 선택 날짜 칸 · Q-2 단독·다가구 명시만 · Q-3 범위)
 * 근거: 영 §164⑦ 「당해 주택에 대하여 … 최초로 공시한 주택가격」 · 부동산거래관리과-364(2005.5.12. 수증 · 2006.4.28. 최초공시).
 *
 * - 값은 기존 `inhHouseValFirstDisclosureDate`(기본 2005-04-30) 하나다. 그대로 두면 종전과 같다(④가 싣지 않는다).
 * - **한 시점에 한 곳에만** 뜬다: 기준일이 2005-04-30 이후이고 그 경로의 카드가 닫혀 있으면 진입 카드(`HouseFirstDisclosureEntryCard`),
 *   카드가 열려 있으면 그 카드의 「최초 공시 시점」 머리(`HouseFirstDisclosureDateField`).
 * - 주택 구분은 **명시 선택**만 읽는다(표시용 파생은 미선택을 단독으로 읽어 「선택된 것처럼 보이는데 ④는 안 보내는」 막다른 화면이 된다).
 * - 구간 판정·송신·검증은 `lib/calc/house-first-disclosure.ts`가 한다(3중 패턴 — 파생값은 store에 쓰지 않는다).
 */
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { houseKindChangePatch } from "./inheritance/InheritanceHouseKindPicker";
import { HOUSE_FIRST_DISCLOSURE_KIND_REQUIRED_MESSAGE } from "@/lib/calc/house-first-disclosure";
import { SEC_163_9_BUILDING_FIRST_DISCLOSURE } from "@/lib/tax-engine/transfer-split-part-cause";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const HOUSE_KIND_OPTIONS = [
  { value: "house_individual", label: "단독·다가구주택 (개별주택가격 공시)" },
  { value: "house_apart", label: "공동주택 — 아파트·연립·다세대 (공동주택가격 공시)" },
];

/** 최초공시 시점 칸들의 조회 기준일 — 저장된 날짜, 비었으면 2005-04-30. */
export function houseFirstDisclosureRefDate(asset: Pick<AssetForm, "inhHouseValFirstDisclosureDate">): string {
  return asset.inhHouseValFirstDisclosureDate || SEC_163_9_BUILDING_FIRST_DISCLOSURE;
}

export function HouseFirstDisclosureDateField(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  const { asset, onChange } = props;
  return (
    <FieldCard
      field="inhHouseValFirstDisclosureDate"
      label="이 주택의 개별주택가격 최초 공시일"
      hint="개별주택가격은 2005.4.30.에 처음 공시됐습니다. 그 뒤 신축 등으로 이 주택이 더 늦게 처음 공시됐다면 그 날짜로 고치세요(홈택스·부동산공시가격알리미의 공시 이력)."
    >
      <DateInput
        value={asset.inhHouseValFirstDisclosureDate}
        onChange={(v) => onChange({ inhHouseValFirstDisclosureDate: v })}
        data-testid="house-first-disclosure-date"
      />
    </FieldCard>
  );
}

/**
 * 진입 카드 — 기준일(상속개시일·증여일·토지를 받은 날)이 2005-04-30 이후라 그 경로의 영 §164⑦ 카드가 닫혀 있을 때만 뜬다.
 * 날짜를 기준일 뒤로 고치면 주택 구분을 묻고, 단독·다가구로 고르면 호출부의 카드가 열리며 이 카드는 사라진다.
 */
export function HouseFirstDisclosureEntryCard(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 그 경로의 기준일 YYYY-MM-DD */
  baseDate: string | undefined;
  /** 기준일의 이름 — 「상속개시일」·「증여일」·「토지를 받은 날」 */
  baseDateLabel: string;
  /** 그 경로의 영 §164⑦ 카드가 이미 열려 있는가(열려 있으면 날짜 칸은 그 카드에 있다) */
  open: boolean;
}) {
  const { asset, onChange, baseDate, baseDateLabel, open } = props;
  const base = baseDate?.slice(0, 10) ?? "";
  if (open || asset.assetKind !== "housing" || !base || base < SEC_163_9_BUILDING_FIRST_DISCLOSURE) return null;
  const d = asset.inhHouseValFirstDisclosureDate?.slice(0, 10) ?? "";
  const widens = !!d && d > base;
  const k = asset.inheritanceAssetKind;
  const kind = k === "house_individual" || k === "house_apart" ? k : "";

  return (
    <div className="space-y-2" data-testid="house-first-disclosure-entry">
      <ToneCard tone="amber">
        <p className="text-xs text-amber-900 dark:text-amber-200">
          {baseDateLabel}({base})에 이 주택의 개별주택가격이 아직 공시되지 않았다면(그 뒤 신축 등으로 처음 공시), 평가액과 최초 공시된
          주택가격으로 환산한 영 §164⑦ 가액 중 <strong>많은 금액</strong>이 취득가액입니다 (소득세법 시행령 §163조 제9항 단서 2호 ·
          부동산거래관리과-364). 그런 주택이면 아래에 최초 공시일을 입력하세요 — 그대로 두면 2005.4.30.에 공시된 것으로 보고 평가액만으로
          계산합니다.
        </p>
      </ToneCard>
      <HouseFirstDisclosureDateField asset={asset} onChange={onChange} />
      {widens && (
        <div className="space-y-1.5" data-field="inheritanceAssetKind">
          <p className="text-caption text-muted-foreground font-medium">주택 구분</p>
          <RadioCardGroup
            name={`house-first-disclosure-kind-${asset.assetId}`}
            tone="amber"
            layout="stack"
            options={HOUSE_KIND_OPTIONS}
            value={kind}
            onChange={(v) => onChange(houseKindChangePatch(asset, v))}
          />
        </div>
      )}
      {widens && kind !== "house_individual" && (
        <ToneCard tone="amber">
          <p className="text-xs text-amber-900 dark:text-amber-200" data-testid="house-first-disclosure-kind-note">
            {HOUSE_FIRST_DISCLOSURE_KIND_REQUIRED_MESSAGE}
          </p>
        </ToneCard>
      )}
    </div>
  );
}
