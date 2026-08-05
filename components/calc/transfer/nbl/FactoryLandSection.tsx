"use client";

/**
 * 공장용 건축물 부속토지 기준면적 입력 (기타토지) — OtherLandDetailSection에서 분리(800줄 정책).
 *
 * 「소득세법」 §104의3①4호나목이 비사업용에서 제외하는 것은 재산세 별도합산·분리과세 대상
 * 토지인데, 공장 부속토지는 **소재 지역에 따라 두 경로로 배타 분기**하고 각 경로에 면적 한도가
 * 있다. 한도 초과분은 §106①1호 종합합산으로 떨어져 비사업용이 된다.
 *
 *   읍·면(군 포함)·산업단지·공업지역 → 「지방세법 시행령」 §102①1호 + 시행규칙 §50 [별표6]
 *                                      연면적 × 100 ÷ 업종별 기준공장면적률
 *   그 밖의 시지역 등                 → 「지방세법 시행령」 §101①1호
 *                                      **바닥면적** × §101② 용도지역별 적용배율
 *
 * ⚠️ 입력 면적은 전부 **1구의 공장 전체값**이다(양도 대상 필지 면적이 아님 — 조심 2023지0373).
 * ⚠️ 용도지역은 이 섹션에 두지 않는다 — 자산의 `nblZoneType`을 그대로 쓴다(단일 소스).
 */

import { useMemo, useState } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TONE } from "@/components/calc/shared/tones";
import { getZoneAreaMultiplier } from "@/lib/tax-engine/local-tax-zone-multiplier";
import {
  computeFactoryStandardArea,
  KNOWLEDGE_INDUSTRY_CENTER_RATE_PERCENT,
} from "@/lib/tax-engine/non-business-land/factory-land-standard-area";
import {
  isCurrentFactoryAreaRateApplicable,
  searchFactoryAreaRates,
  type FactoryAreaRateEntry,
} from "@/lib/tax-engine/data/factory-area-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { NblFactorySegmentFormItem } from "@/lib/stores/calc-wizard-asset-nbl-other";

export interface FactoryLandSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /** 폼-전역 양도일 — 「공장입지 기준고시」 별표1 버전 게이트 판정 기준 */
  transferDate?: string;
}

/**
 * 업종 자동완성 — 별표1에서 면적률을 채운다.
 *
 * 🔴 **버전 게이트**: 2026-02-25 개정이 KSIC를 10차 → 11차로 교체했으므로, 양도일이 그 이전이면
 * 현행 표를 채우지 않는다(같은 코드가 다른 업종을 가리켜 면적률이 조용히 틀어진다).
 * 검색·목록 열람은 막지 않는다 — 자기 업종 코드조차 못 보게 하면 과잉이다.
 */
function IndustryAutocomplete({
  applicable,
  onPick,
}: {
  applicable: boolean;
  onPick: (e: FactoryAreaRateEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const hits = useMemo(() => searchFactoryAreaRates(query), [query]);

  return (
    <div className="space-y-1">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="업종명 또는 KSIC 코드로 검색"
        data-testid="nbl-factory-industry-search"
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
      />
      {hits.length > 0 && (
        <ul
          data-testid="nbl-factory-industry-options"
          className="max-h-40 overflow-y-auto rounded-md border border-input divide-y divide-border"
        >
          {hits.map((h) => (
            <li key={h.code}>
              <button
                type="button"
                disabled={!applicable}
                data-testid={`nbl-factory-industry-option-${h.code}`}
                onClick={() => {
                  onPick(h);
                  setQuery("");
                }}
                className="w-full px-2 py-1 text-left text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="font-mono text-muted-foreground">{h.code}</span> {h.name}{" "}
                <span className="font-semibold">{h.ratePercent}%</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type LocationCategory = AssetForm["nblFactoryLocationCategory"];

const LOCATION_OPTIONS: RadioCardOption<Exclude<LocationCategory, "">>[] = [
  {
    value: "eup_myeon_or_complex",
    label: "읍·면지역(군 지역 포함) · 산업단지 · 공업지역",
    description:
      "분리과세 — 기준면적 = 공장건축물 연면적 × 100 ÷ 업종별 기준공장면적률 (「지방세법 시행령」 §102①1호 · 시행규칙 별표6)",
    testId: "nbl-factory-loc-complex",
  },
  {
    value: "urban_other",
    label: "그 밖의 특별시·광역시·특별자치시·특별자치도·시지역",
    description:
      "별도합산 — 기준면적 = 공장용 건축물 바닥면적 × 용도지역별 적용배율 (「지방세법 시행령」 §101①1호·②)",
    testId: "nbl-factory-loc-urban",
  },
];

function newSegment(): NblFactorySegmentFormItem {
  return { id: crypto.randomUUID(), floorArea: "", ratePercent: "", industryLabel: "" };
}

const fmtArea = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });

export function FactoryLandSection({ asset, onAssetChange, transferDate }: FactoryLandSectionProps) {
  const enabled = asset.nblFactoryEnabled;
  const loc = asset.nblFactoryLocationCategory;
  // useMemo 의존성 안정화 — `?? []`를 인라인으로 두면 매 렌더 새 배열이라 미리보기가 매번 재계산된다.
  const segments = useMemo(() => asset.nblFactorySegments ?? [], [asset.nblFactorySegments]);

  // 별표1 자동조회 가능 여부 — 양도일이 현행 고시 시행일(2026-02-25) 이후일 때만.
  const rateApplicable = useMemo(
    () => isCurrentFactoryAreaRateApplicable(transferDate ? new Date(transferDate) : undefined),
    [transferDate],
  );

  function updateSegment(i: number, patch: Partial<NblFactorySegmentFormItem>) {
    onAssetChange({ nblFactorySegments: segments.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  }

  /**
   * 미리보기 — 계산 전에 초과 여부를 보여준다. **엔진과 같은 순수 함수**(`computeFactoryStandardArea`)
   * 를 쓰므로 UI와 엔진이 갈릴 수 없다(단일 진실).
   */
  const preview = useMemo(() => {
    if (!enabled) return undefined;
    const total = parseDecimal(asset.nblFactoryTotalLandArea) ?? 0;
    if (total <= 0) return undefined;

    if (loc === "eup_myeon_or_complex") {
      const segs = segments
        .map((s) => ({ floorArea: parseDecimal(s.floorArea) ?? 0, ratePercent: parseDecimal(s.ratePercent) ?? 0 }))
        .filter((s) => s.floorArea > 0 && s.ratePercent > 0);
      if (segs.length === 0) return undefined;
      const std = computeFactoryStandardArea(segs, total, {
        isRestrictedZone: asset.nblFactoryIsRestrictedZone,
        additionalRecognizedArea: parseDecimal(asset.nblFactoryAdditionalRecognizedArea),
      });
      const excess = Math.max(0, total - std.standardArea);
      return { standardArea: std.standardArea, total, excess, ratio: excess / total, detail: std };
    }

    if (loc === "urban_other") {
      const fp = parseDecimal(asset.nblFactoryFootprintArea) ?? 0;
      const zone = getZoneAreaMultiplier(asset.nblZoneType);
      if (fp <= 0 || !zone) return undefined;
      const standardArea = fp * zone.multiplier;
      const excess = Math.max(0, total - standardArea);
      return { standardArea, total, excess, ratio: excess / total, zoneLabel: zone.detail };
    }
    return undefined;
  }, [
    enabled,
    loc,
    segments,
    asset.nblFactoryTotalLandArea,
    asset.nblFactoryIsRestrictedZone,
    asset.nblFactoryAdditionalRecognizedArea,
    asset.nblFactoryFootprintArea,
    asset.nblZoneType,
  ]);

  return (
    <div data-testid="nbl-factory-section">
    <ToneCard
      tone="violet"
      title="공장용 건축물 부속토지 기준면적"
      className="p-3"
      titleExtra={
        <>
          <LawArticleModal legalBasis="지방세법 시행령 §102" label="§102①1호" />
          <LawArticleModal legalBasis="지방세법 시행령 §101" label="§101①1호" />
        </>
      }
    >
      <ToggleCard
        tone="violet"
        title="공장용 건축물의 부속토지"
        description="공장 부속토지는 기준면적 한도가 있고, 초과분은 종합합산으로 떨어져 비사업용이 됩니다. 소재 지역에 따라 한도 산식이 달라집니다."
        checked={enabled}
        onCheckedChange={(c) => onAssetChange({ nblFactoryEnabled: c })}
      />

      {enabled && (
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">공장 소재 지역</p>
            <RadioCardGroup
              name="nblFactoryLocationCategory"
              options={LOCATION_OPTIONS}
              value={loc}
              onChange={(v) => onAssetChange({ nblFactoryLocationCategory: v })}
            />
          </div>

          <FieldCard
            label="공장 전체 부속토지 면적"
            unit="㎡"
            hint="하나의 울타리 안 공장 전체 면적입니다 — 양도하는 토지 면적이 아닙니다. 초과 비율은 공장 전체로 계산해 양도분에 적용합니다. 오염피해로 소유자 요구에 따라 취득한 인접토지가 있으면 그 면적도 여기에 합산합니다(별표6 3호마)."
          >
            <DecimalInput
              value={asset.nblFactoryTotalLandArea}
              onChange={(v) => onAssetChange({ nblFactoryTotalLandArea: v })}
              data-testid="nbl-factory-total-land-area"
            />
          </FieldCard>

          {loc === "eup_myeon_or_complex" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  업종별 연면적·기준공장면적률 (별표6)
                </p>
                <LawArticleModal legalBasis="지방세법 시행규칙 §50" label="시행규칙 §50 [별표6]" />
              </div>

              <IndustryAutocomplete
                applicable={rateApplicable}
                onPick={(e) =>
                  onAssetChange({
                    nblFactorySegments: [
                      ...segments,
                      {
                        id: crypto.randomUUID(),
                        floorArea: "",
                        ratePercent: String(e.ratePercent),
                        industryLabel: e.name,
                      },
                    ],
                  })
                }
              />
              {!rateApplicable && (
                <p
                  data-testid="nbl-factory-rate-gate"
                  className={`text-xs rounded-md border px-3 py-2 ${TONE.amber.card} ${TONE.amber.title}`}
                >
                  양도일이 <b>2026-02-25</b>(현행 「공장입지 기준고시」 시행일) 이전이면 자동
                  채움을 쓰지 않습니다 — 그 시점에는 <b>구 고시(KSIC 10차)</b>가 적용법이라 같은
                  코드가 다른 업종을 가리킬 수 있습니다. 면적률은 직접 입력하세요.
                </p>
              )}
              {segments.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  등록된 업종이 없습니다. 업종을 추가하세요. (2개 이상이면 업종별로 산출해 합산합니다)
                </p>
              )}
              {segments.map((s, i) => (
                <div
                  key={s.id}
                  data-testid={`nbl-factory-segment-${i}`}
                  className={`space-y-2 rounded-lg border px-3 py-2 ${TONE.violet.card}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      업종 {i + 1}
                      {s.industryLabel ? ` — ${s.industryLabel}` : ""}
                    </span>
                    <button
                      type="button"
                      data-testid={`nbl-factory-segment-remove-${i}`}
                      onClick={() =>
                        onAssetChange({ nblFactorySegments: segments.filter((_, idx) => idx !== i) })
                      }
                      className="text-xs text-destructive hover:text-destructive/80 px-2 py-0.5 rounded border border-destructive/30 hover:bg-destructive/10 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <FieldCard
                      label="공장건축물 연면적"
                      unit="㎡"
                      hint="경계구역 안 모든 공장용 건축물 연면적(부대시설 포함) + 옥외 기계장치·저장시설 수평투영면적. 무허가·위법시공 건축물은 제외합니다."
                    >
                      <DecimalInput
                        value={s.floorArea}
                        onChange={(v) => updateSegment(i, { floorArea: v })}
                        data-testid={`nbl-factory-segment-floor-${i}`}
                      />
                    </FieldCard>
                    <FieldCard
                      label="기준공장면적률"
                      unit="%"
                      hint={`「공장입지 기준고시」 별표1의 업종별 값입니다. 지식산업센터는 같은 고시 §4로 ${KNOWLEDGE_INDUSTRY_CENTER_RATE_PERCENT}%입니다.`}
                    >
                      <DecimalInput
                        value={s.ratePercent}
                        onChange={(v) => updateSegment(i, { ratePercent: v })}
                        data-testid={`nbl-factory-segment-rate-${i}`}
                      />
                    </FieldCard>
                  </div>
                </div>
              ))}
              <button
                type="button"
                data-testid="nbl-factory-segment-add"
                onClick={() => onAssetChange({ nblFactorySegments: [...segments, newSegment()] })}
                className="text-xs text-primary hover:text-primary/80 px-3 py-1.5 rounded border border-primary/30 hover:bg-primary/10 transition-colors"
              >
                + 업종 추가
              </button>

              <ToggleCard
                variant="chip"
                tone="amber"
                title="공장 신설 제한지역 소재"
                description="「산업집적활성화 및 공장설립에 관한 법률」 §20① 본문 — 해당하면 추가 인정한도가 10%(3,000㎡ 이내), 그 밖이면 20%입니다. (별표6 3호가)"
                checked={asset.nblFactoryIsRestrictedZone}
                onCheckedChange={(c) => onAssetChange({ nblFactoryIsRestrictedZone: c })}
              />

              <FieldCard
                label="추가 인정면적 (별표6 3호 나·다·라·바)"
                unit="㎡"
                hint="녹지지역·활주로·철로·6m 이상 도로·접도구역 / 대규모 저수지·침전지 / 경사도 30도 이상 사면용지 / 종업원용 체육시설(기준면적의 10% 이내)의 합계입니다. 오염피해 인접토지(마목)는 여기가 아니라 위 「공장 전체 부속토지 면적」에 포함시키세요. 해당분이 없으면 비워 두세요."
              >
                <DecimalInput
                  value={asset.nblFactoryAdditionalRecognizedArea}
                  onChange={(v) => onAssetChange({ nblFactoryAdditionalRecognizedArea: v })}
                  data-testid="nbl-factory-additional-area"
                />
              </FieldCard>
            </div>
          )}

          {loc === "urban_other" && (
            <FieldCard
              label="공장용 건축물 바닥면적"
              unit="㎡"
              hint="각 층 중 최대 바닥면적입니다(건축면적이 아닙니다). 건축물 외 시설은 수평투영면적. 위 별표6 경로의 연면적과는 다른 값입니다."
            >
              <DecimalInput
                value={asset.nblFactoryFootprintArea}
                onChange={(v) => onAssetChange({ nblFactoryFootprintArea: v })}
                data-testid="nbl-factory-footprint"
              />
            </FieldCard>
          )}

          <ToggleCard
            variant="chip"
            tone="rose"
            title="허가·사용승인을 받지 않은 공장용 건축물"
            description="받지 않은 것이 확인되는 경우에만 선택하세요. 해당하면 기준면적과 무관하게 부속토지 전량이 비사업용이 됩니다. 용도변경 허가 미이행도 포함됩니다(법제처 25-0823)."
            checked={asset.nblFactoryIsUnregistered}
            onCheckedChange={(c) => onAssetChange({ nblFactoryIsUnregistered: c })}
          />

          {asset.nblFactoryIsUnregistered ? (
            <p
              data-testid="nbl-factory-preview"
              className={`text-xs rounded-md border px-3 py-2 ${TONE.rose.card} ${TONE.rose.title}`}
            >
              허가·사용승인 미이행 — 기준면적과 무관하게 부속토지 <b>전량이 비사업용</b>입니다.
              (「지방세법 시행령」 §102①1호 단서 · §101① 단서)
            </p>
          ) : preview ? (
            <div
              data-testid="nbl-factory-preview"
              className={`text-xs rounded-md border px-3 py-2 space-y-1 ${TONE.violet.card} ${TONE.violet.title}`}
            >
              <p>
                기준면적 <b data-testid="nbl-factory-preview-standard">{fmtArea(preview.standardArea)}</b>㎡
                {" · "}공장 전체 {fmtArea(preview.total)}㎡
              </p>
              {preview.excess > 0 ? (
                <p data-testid="nbl-factory-preview-excess">
                  초과 <b>{fmtArea(preview.excess)}</b>㎡ (<b>{(preview.ratio * 100).toFixed(2)}%</b>) — 양도분의 이
                  비율만큼 비사업용으로 판정됩니다.
                </p>
              ) : (
                <p data-testid="nbl-factory-preview-within">기준면적 이내 — 부속토지 전량이 사업용입니다.</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </ToneCard>
    </div>
  );
}
