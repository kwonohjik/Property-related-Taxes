"use client";

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { CollapsibleHintCard } from "@/components/calc/shared/CollapsibleHintCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { KNOWLEDGE_INDUSTRY_CENTER_RATE_PERCENT } from "@/lib/tax-engine/data/factory-area-rates";
import { LIVESTOCK_LABELS } from "@/lib/tax-engine/livestock-standard-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SEPARATED_TYPE_OPTIONS, ZONING_DISTRICT_LABELS, type FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

/**
 * 「지방세법 시행령」 §102①1호는 분리과세 공장용지를 §101①1호 **각 목**(읍·면지역 / 산업단지 /
 * 공업지역)으로 한정한다. 시지역의 그 밖 공장용지는 §101①1호 **본문** → **별도합산**이다.
 *
 * 두 조문은 배타 분기이므로 `urban`은 분리과세가 될 수 없다 — 선택지로 남겨 두되(사용자가
 * 자기 상황을 고를 수 있어야 한다) 고르면 「별도합산으로 가라」고 안내하고 차단한다.
 */
const FACTORY_LOCATION_OPTIONS = [
  {
    value: "industrial_zone" as const,
    label: "산업단지·지정 공업지역 내",
    description: "「지방세법 시행령」 §102①1호 → 분리과세 0.2% (공장입지기준면적 이내)",
  },
  {
    value: "other" as const,
    label: "읍·면지역 (군 지역 포함) · 도시지역 외",
    description: "「지방세법 시행령」 §102①1호 → 분리과세 0.2% (공장입지기준면적 이내)",
  },
  {
    value: "urban" as const,
    label: "그 밖의 특별시·광역시·특별자치시·특별자치도·시지역",
    description: "분리과세가 아닙니다 — 「지방세법 시행령」 §101①1호 별도합산 대상입니다",
  },
];

export function Step2Separated({ form, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">분리과세 토지 유형</h2>
      <p className="text-sm text-muted-foreground">
        해당하는 분리과세 토지 유형을 선택하세요.
      </p>
      <LawArticleModal legalBasis="지방세법 시행령 §102" label="시행령 §102" />

      <RadioCardGroup
        name="stSeparatedType"
        tone="sky"
        layout="stack"
        options={SEPARATED_TYPE_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label,
          trailing: `세율 ${opt.rate}`,
          hint: opt.hint,
        }))}
        value={form.stSeparatedType}
        onChange={(v) => onChange({ stSeparatedType: v })}
      />

      {/* 목장용지 면적 한도 (「지방세법 시행령」 §102①3호 [표]) */}
      {form.stSeparatedType === "livestock" && (
        <ToneCard
          tone="sky"
          title="가축별 기준면적 (「지방세법 시행령」 §102①3호 [표])"
          className="p-3"
        >
          <p className="text-xs text-sky-800">
            §102①3호는 <b>가축별 기준면적으로 계산한 토지면적의 범위</b>만 분리과세로 정합니다.
            초과분은 종합합산과세대상으로 이관됩니다.
          </p>

          <ToggleCard
            variant="chip"
            tone="rose"
            title="도시지역 소재"
            description="도시지역 안의 개발제한구역·녹지지역 목장용지는 1989년 12월 31일 이전부터 소유한 것으로 한정됩니다 (「지방세법 시행령」 §102⑨1호)."
            checked={form.stPastureIsUrbanArea}
            onCheckedChange={(c) => onChange({ stPastureIsUrbanArea: c })}
          />

          {form.stPastureIsUrbanArea && (
            <ToggleCard
              variant="chip"
              tone="violet"
              title="1989.12.31 이전부터 소유"
              description="1990년 1월 1일 이후에 상속받거나 법인합병으로 취득한 경우를 포함합니다."
              checked={form.stPastureOwnedBefore1990}
              onCheckedChange={(c) => onChange({ stPastureOwnedBefore1990: c })}
            />
          )}

          {!(form.stPastureIsUrbanArea && !form.stPastureOwnedBefore1990) && (
            <>
              <FieldCard label="목장용지 전체 면적" unit="㎡">
                <DecimalInput
                  value={form.stPastureTotalLandArea}
                  onChange={(v) => onChange({ stPastureTotalLandArea: v })}
                  data-testid="pt-pasture-total-area"
                />
              </FieldCard>

              <FieldCard
                label="축종·사업"
                hint="「지방세법 시행령」 §102①3호 [표]의 9종입니다. 비고의 포함 축종(말·노새·당나귀 / 친칠라 / 개 / 여우)도 해당 항목을 고르세요."
              >
                <Select
                  value={form.stPastureLivestockType || undefined}
                  onValueChange={(v) => onChange({ stPastureLivestockType: v ?? "" })}
                >
                  <SelectTrigger data-testid="pt-pasture-livestock-type">
                    <SelectValue placeholder="축종을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LIVESTOCK_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldCard>


              <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
                <p className="text-xs font-semibold text-sky-700">보유 시설 (해당하는 것을 모두 선택)</p>
                <p className="text-caption text-sky-800">
                  표의 4개 열은 <b>항목별 인정 한도</b>입니다. 없는 시설의 몫은 기준면적에 더하지
                  않습니다. 축사는 축산업의 전제이므로 항상 포함됩니다.
                </p>
                <ToggleCard
                  variant="chip"
                  tone="sky"
                  title="부대시설"
                  checked={form.stPastureHasFacility}
                  onCheckedChange={(c) => onChange({ stPastureHasFacility: c })}
                />
                <ToggleCard
                  variant="chip"
                  tone="emerald"
                  title="초지 (방목)"
                  checked={form.stPastureHasGrassland}
                  onCheckedChange={(c) => onChange({ stPastureHasGrassland: c })}
                />
                <ToggleCard
                  variant="chip"
                  tone="amber"
                  title="사료포·사료밭 (사료 재배)"
                  checked={form.stPastureHasFodder}
                  onCheckedChange={(c) => onChange({ stPastureHasFodder: c })}
                />
              </div>
              <FieldCard
                label="가축 마릿수"
                unit="마리"
                hint="과세기준일이 속하는 해의 **직전 연도** 기준 **연중 최고** 마릿수입니다. 양도소득세의 과세기간 평균 방식과 다릅니다."
              >
                <DecimalInput
                  value={form.stPastureLivestockCount}
                  onChange={(v) => onChange({ stPastureLivestockCount: v })}
                  data-testid="pt-pasture-livestock-count"
                />
              </FieldCard>
            </>
          )}
        </ToneCard>
      )}

      {/* 공장 입지 유형 (공장용지 선택 시) */}
      {form.stSeparatedType === "factory" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">공장 입지 유형</label>
          <RadioCardGroup
            name="stFactoryLocation"
            tone="sky"
            layout="stack"
            options={FACTORY_LOCATION_OPTIONS}
            value={form.stFactoryLocation}
            onChange={(v) => onChange({ stFactoryLocation: v })}
          />
          {/* ⚠️ ToneCard는 `...props`를 spread하지 않는다 — `data-testid`를 달아도 DOM에
              도달하지 않는다(하이픈 JSX 속성이라 TS는 통과시킨다). 테스트는 텍스트로 조회한다. */}
          {form.stFactoryLocation === "urban" && (
            <ToneCard tone="rose">
              <p className="text-xs text-rose-800">
                이 지역의 공장용지는 <b>분리과세 대상이 아닙니다</b>. 「지방세법 시행령」
                §101①1호에 따라 <b>별도합산과세대상</b>이며 기준면적은 공장용 건축물{" "}
                <b>바닥면적 × 용도지역별 적용배율</b>입니다. 앞 단계에서 「토지 과세 유형」을{" "}
                <b>별도합산</b>으로 바꾸어 입력하세요.
              </p>
            </ToneCard>
          )}

          {form.stFactoryLocation && form.stFactoryLocation !== "urban" && (
            <ToneCard
              tone="sky"
              title="공장입지기준면적 (「지방세법 시행규칙」 §50 [별표6])"
              className="p-3"
            >
              <p className="text-xs text-sky-800">
                §102①1호는 <b>공장입지기준면적 범위의 토지</b>만 분리과세로 정합니다. 초과분은
                종합합산과세대상으로 이관됩니다.
              </p>

              <ToggleCard
                variant="chip"
                tone="rose"
                title="허가·사용승인 미이행"
                description="「지방세법 시행령」 §102①1호 단서 — 해당하면 기준면적과 무관하게 부속토지 전량이 분리과세에서 제외됩니다."
                checked={form.stFactoryIsUnpermitted}
                onCheckedChange={(c) => onChange({ stFactoryIsUnpermitted: c })}
              />

              {!form.stFactoryIsUnpermitted && (
                <>
                  <FieldCard
                    label="공장 전체 부속토지 면적"
                    unit="㎡"
                    hint="하나의 울타리 안 공장 전체 면적입니다. 오염피해로 소유자 요구에 따라 취득한 인접토지가 있으면 그 면적도 여기에 합산합니다(별표6 3호마)."
                  >
                    <DecimalInput
                      value={form.stFactoryTotalLandArea}
                      onChange={(v) => onChange({ stFactoryTotalLandArea: v })}
                      data-testid="pt-factory-total-area"
                    />
                  </FieldCard>

                  <FieldCard
                    label="공장건축물 연면적"
                    unit="㎡"
                    hint="경계구역 안 모든 공장용 건축물 연면적(부대시설 포함) + 옥외 기계장치·저장시설 수평투영면적. 바닥면적이 아닙니다. 무허가·위법시공 건축물은 제외합니다."
                  >
                    <DecimalInput
                      value={form.stFactoryFloorArea}
                      onChange={(v) => onChange({ stFactoryFloorArea: v })}
                      data-testid="pt-factory-floor-area"
                    />
                  </FieldCard>

                  <FieldCard
                    label="기준공장면적률"
                    unit="%"
                    hint={`「공장입지 기준고시」 별표1의 업종별 값입니다. 지식산업센터는 같은 고시 §4로 ${KNOWLEDGE_INDUSTRY_CENTER_RATE_PERCENT}%입니다.`}
                  >
                    <DecimalInput
                      value={form.stFactoryAreaRatePercent}
                      onChange={(v) => onChange({ stFactoryAreaRatePercent: v })}
                      data-testid="pt-factory-rate"
                    />
                  </FieldCard>

                  <ToggleCard
                    variant="chip"
                    tone="amber"
                    title="공장 신설 제한지역 소재"
                    description="「산업집적활성화 및 공장설립에 관한 법률」 §20① 본문 — 해당하면 추가 인정한도가 10%(3,000㎡ 이내), 그 밖이면 20%입니다. (별표6 3호가)"
                    checked={form.stFactoryIsRestrictedZone}
                    onCheckedChange={(c) => onChange({ stFactoryIsRestrictedZone: c })}
                  />

                  <FieldCard
                    label="추가 인정면적 (별표6 3호 나·다·라)"
                    unit="㎡"
                    hint="녹지지역·활주로·철로·6m 이상 도로·접도구역 / 대규모 저수지·침전지 / 경사도 30도 이상 사면용지의 합계입니다. 종업원용 체육시설(바목)은 아래 칸에, 오염피해 인접토지(마목)는 부속토지 면적에 넣으세요. 해당분이 없으면 비워 두세요."
                  >
                    <DecimalInput
                      value={form.stFactoryAdditionalRecognizedArea}
                      onChange={(v) => onChange({ stFactoryAdditionalRecognizedArea: v })}
                      data-testid="pt-factory-additional-area"
                    />
                  </FieldCard>

                  {/*
                    별표6 3호**바** 종업원용 체육시설용지 (E4-06 → 표 자동화 2026-09-03).
                    바목만 10% 상한이 있고(나·다·라에는 없다), 표(종업원수 × 운동장·코트·실내)도
                    엔진이 산출한다 — 종전에는 사용자가 직접 계산해 넣게 했다.
                    비고 1(운동경기 가능 시설·영구 시설물·탁구대 2면 이상)은 사실 판단이라
                    엔진이 검증하지 않는다.
                  */}
                  <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-800 p-3 space-y-3">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      종업원용 체육시설용지 (별표6 3호 바)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      표(종업원수 × 실외 운동장·코트 / 실내체육시설)의 기준면적과 「공장입지기준면적의
                      100분의 10 이내」 상한을 엔진이 자동 적용합니다. 운동장·코트는 운동경기가 가능한
                      시설이, 실내체육시설은 영구 시설물이면서 탁구대 2면 이상을 둘 수 있어야 합니다
                      (별표6 3호바 비고 1). 해당분이 없으면 비워 두세요.
                    </p>

                    <FieldCard
                      label="종업원수"
                      unit="명"
                      hint="그 사업장에 근무하는 종업원을 기준으로 합니다 (비고 2-가). 시설 면적을 입력하면 필수입니다."
                    >
                      <DecimalInput
                        value={form.stFactorySportsEmployeeCount}
                        onChange={(v) => onChange({ stFactorySportsEmployeeCount: v })}
                        data-testid="pt-factory-sports-employee-count"
                      />
                    </FieldCard>

                    {/*
                      비고 2-나는 「50명 이하인 **법인**」에만 적용된다 — 개인사업자에 적용하면
                      코트만 인정돼 기준면적이 줄어 법 근거 없이 불리해진다.
                    */}
                    {(parseDecimal(form.stFactorySportsEmployeeCount) ?? 0) > 0 &&
                      (parseDecimal(form.stFactorySportsEmployeeCount) ?? 0) <= 50 && (
                        <FieldCard
                          label="사업주체"
                          hint="종업원 50명 이하인 「법인」은 코트면적만 기준면적으로 인정됩니다 (비고 2-나). 개인사업자는 이 제한을 받지 않습니다."
                        >
                          <RadioCardGroup
                            name="stFactorySportsEntityType"
                            tone="amber"
                            options={[
                              { value: "corporation", label: "법인", description: "코트면적만 인정 (비고 2-나)" },
                              { value: "individual", label: "개인", description: "운동장·코트·실내 모두 인정" },
                            ]}
                            value={form.stFactorySportsEntityType}
                            onChange={(v) => onChange({ stFactorySportsEntityType: v })}
                          />
                        </FieldCard>
                      )}

                    <FieldCard label="실외체육시설 — 운동장 용지 면적" unit="㎡">
                      <DecimalInput
                        value={form.stFactorySportsPlaygroundArea}
                        onChange={(v) => onChange({ stFactorySportsPlaygroundArea: v })}
                        data-testid="pt-factory-sports-playground-area"
                      />
                    </FieldCard>

                    <FieldCard label="실외체육시설 — 테니스·정구코트 용지 면적" unit="㎡">
                      <DecimalInput
                        value={form.stFactorySportsCourtArea}
                        onChange={(v) => onChange({ stFactorySportsCourtArea: v })}
                        data-testid="pt-factory-sports-court-area"
                      />
                    </FieldCard>

                    <FieldCard
                      label="실내체육시설 건축물 바닥면적"
                      unit="㎡"
                      hint="바닥면적이 표 기준면적 이하이면 바닥면적이 기준면적이 되고(비고 2-다), 거기에 §101② 용도지역별 적용배율을 곱한 면적이 산입됩니다(비고 2-라). 용지 면적이 아니라 **건축물 바닥면적**입니다."
                    >
                      <DecimalInput
                        value={form.stFactorySportsIndoorFloorArea}
                        onChange={(v) => onChange({ stFactorySportsIndoorFloorArea: v })}
                        data-testid="pt-factory-sports-indoor-floor-area"
                      />
                    </FieldCard>

                    {(parseDecimal(form.stFactorySportsIndoorFloorArea) ?? 0) > 0 && (
                      <FieldCard
                        label="실내체육시설 부속토지 용도지역 (§101②)"
                        hint="비고 2-라의 용도지역별 적용배율을 결정합니다. 미선택 시 실내체육시설분은 기준면적에 산입되지 않습니다(추정 배율 적용 금지)."
                      >
                        <RadioCardGroup
                          name="stFactorySportsZoningDistrict"
                          tone="amber"
                          layout="inline"
                          options={ZONING_DISTRICT_LABELS.map(([value, label]) => ({ value, label }))}
                          value={form.stFactorySportsZoningDistrict}
                          onChange={(v) => onChange({ stFactorySportsZoningDistrict: v })}
                        />
                      </FieldCard>
                    )}
                  </div>
                </>
              )}
            </ToneCard>
          )}
        </div>
      )}

      <CollapsibleHintCard
        tone="amber"
        summary="대중형·간이 골프장 부속토지 분리과세 제외 안내"
      >
        <div className="space-y-1 text-amber-800">
          <p>
            대중형·간이 골프장 부속토지는 분리과세 대상이 아닙니다 (회원제
            골프장만 해당). 영업용 건축물 부속토지 요건을 충족하면 &ldquo;토지
            분류&rdquo; 단계에서 별도합산과세대상으로 입력하세요.
          </p>
          <LawArticleModal legalBasis="지방세법 §106" label="§106①3호" />
        </div>
      </CollapsibleHintCard>
    </div>
  );
}
