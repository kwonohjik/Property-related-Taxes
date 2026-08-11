"use client";

/**
 * ⑤ 특수 상황 — 중과·배제 트리거 (「보유 상황」 단계 최하단)
 *
 * `Step4.tsx`에서 분리했다(2026-08-11 — 일반건물 미등기 2토글 추가로 812줄 초과, 800줄 정책).
 * 이 섹션은 「보유 중의 자산 상태가 세율을 통째로 갈아치우는가」를 묻는 곳이라 이음매가 자연스럽다.
 *
 * 두 축이 들어 있고 **서로 다른 법령**이다 — 이름이 닮아 혼동하기 쉬우니 주의:
 *   · 미등기 양도       — 「소득세법」 §104③·§104①10호 (70% 단일세율)
 *   · 비사업용 토지     — 「소득세법」 §104의3 (기본세율 +10%p)
 * (자산 카드 안의 「허가·사용승인 미이행 건축물」은 또 다른 축이다 —
 *  「지방세법 시행령」 §101① 단서, 부속토지 전량 비사업용.)
 */

import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { NblSectionContainer } from "@/components/calc/transfer/nbl/NblSectionContainer";

interface Props {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
  primaryKind: string;
  /** 폼-전역 단일 「미등기 양도」 토글을 띄울 자산 종류인지 (Step4가 판정해 주입) */
  showFormLevelUnregistered: boolean;
}

export function SpecialSituationSection({
  form,
  onChange,
  primaryKind,
  showFormLevelUnregistered,
}: Props) {
  const primary = form.assets?.[0];

  /** 첫 자산에만 패치를 적용한다 — 이 섹션은 주 자산 전용이다. */
  const patchPrimary = (patch: Partial<NonNullable<typeof primary>>) =>
    onChange({ assets: form.assets.map((a, i) => (i === 0 ? { ...a, ...patch } : a)) });

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50/30 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
      <SectionHeader
        title="⑤ 특수 상황"
        description="미등기·비사업용 토지·다주택 중과 해당 여부를 확인하세요"
      />
      <div className="space-y-2">
        {/* 미등기 양도 — §94①1호(토지·건물) 자산이면 종류 무관. 제외는 UNREGISTERED_EXCLUDED_KINDS */}
        {showFormLevelUnregistered && (
          <ToggleCard
            checked={form.isUnregistered}
            onCheckedChange={(v) => onChange({ isUnregistered: v })}
            title="미등기 양도"
            description="70% 단일세율 적용 — 장기보유공제·기본공제 전액 배제"
            tone="rose"
          />
        )}

        {/* 일반건물 — 토지·건물은 **별개 부동산이고 등기부도 별도**라 축을 나눈다.
            건물만 미등기(무허가 신축)이고 토지는 등기된 조합이 실무에서 흔하다.
            증축분(건물2)은 건물 축을 따른다(민법 §256 부합 — 표시변경등기). */}
        {primaryKind === "general_building" && primary && (
          <>
            <ToggleCard
              checked={primary.gbLandUnregistered}
              onCheckedChange={(v) => patchPrimary({ gbLandUnregistered: v })}
              title="토지 미등기 양도"
              description="토지분에 70% 단일세율 — 장기보유공제·기본공제 배제, 개산공제 0.3%"
              tone="rose"
            />
            <ToggleCard
              checked={primary.gbBuildingUnregistered}
              onCheckedChange={(v) => patchPrimary({ gbBuildingUnregistered: v })}
              title="건물 미등기 양도"
              description="건물분(증축분 포함)에 70% 단일세율 — 장기보유공제·기본공제 배제, 개산공제 0.3%"
              tone="rose"
            />
            {(primary.gbLandUnregistered || primary.gbBuildingUnregistered) && (
              <div className="rounded-md border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-800">
                <p className="font-medium">미등기 파트만 70%가 적용됩니다</p>
                <p className="mt-0.5 text-caption leading-relaxed text-rose-700">
                  토지·건물은 별개 부동산이므로 한쪽만 미등기이면 그 파트만 「소득세법」
                  §104①10호(70%)로 계산하고, 나머지 파트는 원래 세율을 유지합니다.
                </p>
              </div>
            )}
          </>
        )}

        {primaryKind === "land" && primary && (
          <ToggleCard
            checked={primary.isNonBusinessLand ?? false}
            onCheckedChange={(v) =>
              patchPrimary({
                isNonBusinessLand: v,
                // 체크 해제 시 상세 판정도 끔. 체크 시는 현재 상태 유지(라디오로 선택).
                nblUseDetailedJudgment: v ? primary.nblUseDetailedJudgment : false,
              })
            }
            title="비사업용 토지 여부 검토"
            description="해당 시 기본세율 +10%p 중과 대상"
            tone="rose"
          >
            {/* P3: 재촌 요건 안내 */}
            <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground/70">
                농지·임야 재촌(在村) 요건 — 아래 중 하나 충족 시 사업용
              </p>
              <ul className="space-y-0.5 pl-2">
                <li>• 토지 소재지와 <strong>동일 시·군·구</strong>에 거주</li>
                <li>• 토지 소재지와 <strong>연접한 시·군·구</strong>에 거주</li>
                <li>• 토지 소재지와 거주지 사이 <strong>직선거리 30km 이내</strong></li>
              </ul>
              <p className="text-muted-foreground/70 text-micro mt-1">
                소득세법 시행령 §168조의8 — 정밀 판정을 원하시면 세무사 확인 권장
              </p>
            </div>

            {/* 판정 상태 라디오 */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground/70">판정 상태</p>
              <RadioCardGroup
                name={`nbl-mode-${primary.assetId}`}
                tone="rose"
                value={primary.nblUseDetailedJudgment ? "detailed" : "completed"}
                onChange={(v) => patchPrimary({ nblUseDetailedJudgment: v === "detailed" })}
                options={[
                  {
                    value: "completed",
                    label: "이미 비사업용으로 판정 완료",
                    description: "바로 +10%p 중과세 적용",
                  },
                  {
                    value: "detailed",
                    label: "판정 도움 필요",
                    description: "지목·재촌·자경 입력으로 엔진이 자동 판정",
                  },
                ]}
              />
            </div>
          </ToggleCard>
        )}
      </div>

      {/* 비사업용 토지 상세 판정 — "판정 도움" 모드 선택 시만 표시 */}
      {primaryKind === "land" && primary?.isNonBusinessLand && primary?.nblUseDetailedJudgment && (
        <NblSectionContainer
          asset={primary}
          transferDate={form.transferDate}
          onAssetChange={(patch) => patchPrimary(patch)}
        />
      )}
    </section>
  );
}
