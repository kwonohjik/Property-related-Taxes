"use client";

/**
 * §155⑳ 생애 한 차례·직전거주주택보유주택 1주택 한정 구간(OH-40) 입력 블록 — 판정 메뉴 전용.
 *
 * 대통령령 제29523호(2019.2.12) 부칙 제7조①: 이후 취득한 거주주택은 ⑳ 두 괄호가 적용되고, 제35349호 부칙
 * 제14조로 2025.2.28 이후 양도분부터 삭제됐다. 부칙 제7조② 경과조치는 사유(D11)까지 받아야 괄호를 푼다 —
 * 2호(계약금) 경로는 2019.2.12. 전 등록 임대주택 소유가 해석상 요건이다(엔진 `isAddendumTransitionEffective`).
 *
 * `RentalHousingExceptionSection.tsx`에서 800줄 정책에 따라 분리(2026-10-06).
 *
 * §154⑩ 표준 경로(B · 임대 0호 — `path154_10`)는 경과조치가 거주요건(종전: §154① 원칙, 신규정: 등록일 이후 2년 준용)을 가르므로
 * 생애 1회·1주택 한정 안내·이력 칸 없이 **선언 + 사유**만 따로 둔다(결정 #21 S16-5 — 양도일과 무관하게 열린다).
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isAddendumTransitionEffective } from "@/lib/tax-engine/data/rental-155-20-era";

type Rh = AssetForm["rentalHousingException"];

interface RentalLifetimeLimitBlockProps {
  rh: Rh;
  assetId?: string;
  /**
   * §154⑩ 표준 경로(B · 임대 0호) — 양도일 구간과 무관하게 **경과조치 선언 + 사유**를 연다(S16-4·S16-5). 적용 범위 제한 안내(생애 1회·
   * 1주택 한정)와 생애 1회 이력은 ⑳ 본문 괄호의 축이라 싣지 않는다.
   */
  path154_10?: boolean;
  onChange: (patch: Partial<Rh>) => void;
}

export function RentalLifetimeLimitBlock({ rh, assetId, path154_10 = false, onChange }: RentalLifetimeLimitBlockProps) {
  const transitionEffective = isAddendumTransitionEffective(
    rh.residenceTransitionUnderAddendum === true,
    rh.residenceTransitionBasis,
  );
  if (path154_10) {
    return (
      <div className="space-y-2" data-testid="rental-lifetime-limit-block">
        <ToneCard tone="amber" title="2019.2.12 이후 취득 — 경과조치에 따라 거주요건이 달라집니다">
          <p className="text-caption">
            2019.2.12 이후 취득한 직전거주주택보유주택은 사업자·임대사업자 등록일 이후 거주기간 2년으로 판정합니다(소령 §155⑳1호 괄호
            준용). 경과조치(대통령령 제29523호 부칙 제7조②)에 해당하면 종전 규정에 따라 소령 §154① 원칙의 거주요건을 적용합니다.
          </p>
        </ToneCard>
        <ToggleCard
          variant="card"
          size="sm"
          tone="emerald"
          data-testid="rental-residence-transition"
          title="2019.2.12 당시 이 주택에 거주하고 있었거나, 그 전에 매매계약을 체결하고 계약금을 지급했습니다."
          description="증빙서류로 확인되면 종전 규정을 따라 2019.2.12 전 취득 주택과 같이 소령 §154① 원칙의 거주요건을 적용합니다(대통령령 제29523호 부칙 제7조②)."
          checked={rh.residenceTransitionUnderAddendum === true}
          onCheckedChange={(v) =>
            onChange({ residenceTransitionUnderAddendum: v, ...(v ? {} : { residenceTransitionBasis: "" }) })
          }
        />
        {rh.residenceTransitionUnderAddendum === true && (
          <TransitionBasisField rh={rh} assetId={assetId} onChange={onChange} />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2" data-testid="rental-lifetime-limit-block">
      <ToneCard tone="amber" title="2019.2.12 이후 취득 · 2025.2.27 이전 양도 — 적용 범위 제한">
        <p className="text-caption">
          이 구간의 양도는{" "}
          {rh.scenario === "B"
            ? "임대주택을 거주주택으로 전환한 경우 1주택 외의 주택을 모두 양도한 후 1주택을 보유하게 된 때에만"
            : "장기임대주택을 보유한 채 생애 한 차례만 거주주택을 최초로 양도하는 경우에만"}{" "}
          특례가 적용됩니다(소령 §155⑳ 괄호, 대통령령 제29523호 부칙 제7조①).
        </p>
      </ToneCard>
      <ToggleCard
        variant="card"
        size="sm"
        tone="emerald"
        data-testid="rental-residence-transition"
        title="2019.2.12 당시 이 주택에 거주하고 있었거나, 그 전에 매매계약을 체결하고 계약금을 지급했습니다."
        description="증빙서류로 확인되면 종전 규정을 따라 위 제한이 적용되지 않습니다(대통령령 제29523호 부칙 제7조②)."
        checked={rh.residenceTransitionUnderAddendum === true}
        // 체크를 끄면 사유도 함께 비운다(한 patch — 다중키 stale spread 방지).
        onCheckedChange={(v) =>
          onChange({ residenceTransitionUnderAddendum: v, ...(v ? {} : { residenceTransitionBasis: "" }) })
        }
      />
      {rh.residenceTransitionUnderAddendum === true && (
        <TransitionBasisField rh={rh} assetId={assetId} onChange={onChange} />
      )}
      {rh.scenario === "A" && !transitionEffective && (
        <FieldCard label="장기임대주택 보유 중 거주주택 양도 이력" required>
          <RadioCardGroup
            name={`rental-prior-history-${assetId ?? "primary"}`}
            data-testid="rental-prior-history"
            tone="amber"
            layout="stack"
            options={[
              {
                value: "none",
                label: "없음 — 이번이 최초의 거주주택 양도입니다",
                testId: "rental-prior-history-none",
              },
              {
                value: "used",
                label: "있음 — 이미 거주주택을 양도해 이 특례를 적용받았습니다",
                description: "생애 한 차례 제한으로 이번 양도에는 적용되지 않습니다.",
                testId: "rental-prior-history-used",
              },
            ]}
            value={rh.priorRentalExemptionHistory ?? ""}
            onChange={(v) => onChange({ priorRentalExemptionHistory: v })}
          />
        </FieldCard>
      )}
    </div>
  );
}

/** 경과조치 사유 라디오 — ⑳ 본문 구간 블록과 §154⑩ 블록이 같은 칸을 쓴다(사유가 판정을 가른다 — D11 · S16-5). */
function TransitionBasisField({
  rh,
  assetId,
  onChange,
}: {
  rh: Rh;
  assetId?: string;
  onChange: (patch: Partial<Rh>) => void;
}) {
  return (
    <FieldCard label="경과조치 사유" required>
      <RadioCardGroup
        name={`rental-transition-basis-${assetId ?? "primary"}`}
        data-testid="rental-transition-basis"
        tone="emerald"
        layout="stack"
        options={[
          {
            value: "residing",
            label: "2019.2.12 당시 이 주택에 거주하고 있었습니다",
            testId: "rental-transition-basis-residing",
          },
          {
            value: "contract_with_prior_rental",
            label: "그 전에 계약금을 지급했고, 2019.2.12 전에 지자체·세무서에 등록한 임대주택을 소유하고 있었습니다",
            description: "계약 당시 임대주택이 이미 등록돼 있어야 하는 것은 아닙니다(서면-2021-법령해석재산-1409).",
            testId: "rental-transition-basis-contract-with-rental",
          },
          {
            value: "contract_without_prior_rental",
            label: "그 전에 계약금을 지급했지만, 2019.2.12 전에 등록한 임대주택은 없었습니다",
            description:
              "이 경우 종전 규정을 적용받지 못합니다(서면-2020-법령해석재산-1464 · 서면-2021-법규재산-4760).",
            testId: "rental-transition-basis-contract-without-rental",
          },
        ]}
        value={rh.residenceTransitionBasis ?? ""}
        onChange={(v) => onChange({ residenceTransitionBasis: v })}
      />
    </FieldCard>
  );
}
