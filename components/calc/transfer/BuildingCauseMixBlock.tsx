"use client";

/**
 * 「토지는 다른 원인으로 취득」 — **건물을 상속·증여로, 토지를 매매로** 취득한 주택·건물 (Phase D2-2).
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §12 · UI 설계 transfer-acq-cause-mixed-d2.ui.design.md §2
 * D1 토글(`LandPartCauseBlock`)은 토지가 상속·증여인 신축·매매 호스트용이고 이 토글은 **반대 방향**(상속·증여 호스트, 토지 = 매매 고정)이다 —
 * 원인 라디오가 없고 술어도 분리돼 있다(`effectiveBuildingCauseMix`; D1 `effectiveLandAcquisitionCause`는 `purchase`를 읽지 않는다).
 *
 * ## 구성 (R안)
 * 토글을 켜면 상속·증여 블록 대신 **매매 블록을 건물 원인 모드로 재사용**한다(`CompanionAcquisitionCauseSection`이 마운트 조건을 넓히고
 * `buildingCause`를 내린다) — 날짜 2열 [토지 취득일 | 건물 상속개시일·증여일], 건물 파트 고정 칩 + 평가액, 토지 매매 4방식은 거기서 나온다.
 * 이 컴포넌트는 토글과 **건물 파트에만 속하는 칸**만 둔다: 피상속인 취득일(§104②1호 통산) · 동일세대 통산(§154⑧3호 — 건물만 상속에도 적용,
 * 계획서 D2-Q3) · 증여자 취득일(선택) · 이월과세 고지.
 *
 * ## 노출하지 않는 경우
 * 부담부증여(엔진이 §159로 취득가액을 덮는다) · 가업상속공제 입력이 남은 자산(D2에서 그 칸을 숨기는데 ⑧이 막는다) · 이월과세·재개발 등
 * 비-호스트 취득원인. 켜진 채 조건이 생겨도 토글은 남겨 끌 수 있게 한다(끄는 방향은 막지 않는다).
 *
 * ## 전환 patch
 * 호스트 전환·OFF의 stale은 **읽는 쪽 파생**이 처리한다(`effectiveBuildingCauseMix` — 태그 불일치면 무효). 원인 라디오(D1-2 F2)가
 * 이미 태그를 비우므로 여기서 전환 patch를 만들지 않는다. 토글 OFF만 `hasSeperate…`를 되돌린다 — 상속·증여 호스트엔 「취득일 다름」을
 * 따로 켤 UI가 없어 남기면 입력 칸 없는 분리 계산 진입이 된다.
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DateInput } from "@/components/ui/date-input";
import { InheritedCohabitationCard } from "./InheritedCohabitationCard";
import { effectiveSelfOwns } from "@/lib/calc/self-owns-scope";
import { buildingCauseMixApplicable, effectiveBuildingCauseMix } from "@/lib/calc/transfer-land-part-cause";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function BuildingCauseMixBlock(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  const { asset, onChange } = props;
  // 상속·증여 건물 + 주택·건물(겸용 아님) — ④·⑥·⑧과 같은 술어.
  if (!buildingCauseMixApplicable(asset)) return null;

  // 토글 상태 = ④가 실제로 보내는 유효 상태 — 다른 호스트에서 켠 잔재나 분리가 꺼진 상태를 「켜짐」으로 그리지 않는다.
  const mix = effectiveBuildingCauseMix(asset);
  const active = !!mix;
  const isInheritance = asset.acquisitionCause === "inheritance";
  const hasFamilyBusiness = asset.familyBusinessInheritance !== undefined;
  const isBurdenedGift = asset.transferType === "burdened_gift";
  // 부담부증여·가업상속 입력이 있으면 켜는 길 자체를 열지 않는다(켜진 쪽은 위 `active`라 끌 수 있다).
  if (!active && (isBurdenedGift || hasFamilyBusiness)) return null;

  // Q-5(D1 U-3) — 소유자 분리와 상호 잠금: 엔진은 소유자 분리에서 토지 원인을 읽지 않는다. 켜는 방향만 막는다.
  const ownerSplit = (effectiveSelfOwns(asset) ?? "both") !== "both";

  return (
    <div className="space-y-2" data-testid="land-part-cause-building-cause">
      <ToggleCard
        data-field="landAcquisitionCause"
        variant="chip"
        tone="amber"
        title="토지는 다른 원인으로 취득"
        description={isInheritance ? "건물은 상속, 토지는 매수" : "건물은 증여, 토지는 매수"}
        disabled={ownerSplit && !active}
        disabledReason="토지·건물 소유자가 다르면 쓸 수 없습니다 — 「토지·건물 소유자 다름」을 끄면 켤 수 있습니다"
        checked={active}
        onCheckedChange={(checked) => {
          // 다중 키 **단일 배치 update**(feedback_multikey_patch_stale_spread_overwrite). 취득일 분리를 함께 켜야 엔진이 파트별 경로로
          // 흐른다. 건물은 평가액(= 실지거래가액) 고정, 토지 방식은 이미 고른 값을 보존하되 없으면 실거래가.
          onChange(
            checked
              ? {
                  landAcquisitionCause: "purchase",
                  landCauseHost: isInheritance ? "inheritance" : "gift",
                  hasSeperateLandAcquisitionDate: true,
                  landAcqMode: asset.landAcqMode || "actual",
                  buildingAcqMode: "actual",
                }
              : {
                  landAcquisitionCause: "",
                  landCauseHost: "",
                  hasSeperateLandAcquisitionDate: false,
                  landAcqMode: "",
                  buildingAcqMode: "",
                },
          );
        }}
      />

      {active && (
        <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
          <ToneCard tone="amber" noDark>
            <p className="text-xs text-amber-900">
              건물은 <strong>{isInheritance ? "상속" : "증여"}</strong>, 토지는 <strong>매매</strong>로 취득한 자산입니다. 취득가액·보유기간을
              토지·건물 <strong>각각</strong> 산정합니다 (소득세법 §95④·§104②, 같은 법 시행령 §163⑨).
            </p>
            <p className="text-caption text-amber-800" data-testid="building-cause-guide">
              건물 {isInheritance ? "상속개시일" : "증여일"}과 토지 취득일은 아래 <strong>날짜 두 칸</strong>에, 건물 평가액은{" "}
              <strong>취득가액 산정 방식</strong>의 건물 칸에, 토지 취득가액은 토지 칸(실거래가·환산·감정·매매사례 선택)에 입력합니다.
              건물은 실거래가(평가액)로 고정되고 개별주택가격 미공시 3-시점 환산(소득세법 시행령 §164⑦)은 적용되지 않습니다.
            </p>
          </ToneCard>

          {isInheritance ? (
            <>
              <FieldCard
                label="건물 피상속인 취득일"
                field="decedentAcquisitionDate"
                hint="건물의 세율 판정 보유기간을 피상속인이 취득한 날부터 통산합니다 (「소득세법」 제104조 제2항 제1호)."
              >
                <DateInput
                  value={asset.decedentAcquisitionDate}
                  onChange={(v) => onChange({ decedentAcquisitionDate: v })}
                  data-testid="building-decedent-acq-date"
                />
              </FieldCard>

              {/* §154⑧3호 — 건물만 상속받은 주택에도 적용한다(계획서 §12.1 D2-Q3, 「상속받은 주택」 = 건물). 법령 적용 범위는 확인 필요. */}
              {asset.assetKind === "housing" && (
                <div data-testid="building-cause-cohabitation">
                  <InheritedCohabitationCard asset={asset} onChange={onChange} />
                  <p className="mt-1 text-caption text-muted-foreground" data-testid="building-cause-155-2-note">
                    건물만 상속받은 주택에도 동일세대 통산(영 §154⑧3호)을 적용합니다 — 적용 범위는 <b>확인 필요</b>입니다. 상속주택 특례(영
                    §155②)와 5년 내 상속주택 중과 배제(영 §167의3①7호)는 <b>적용하지 않습니다</b>.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <FieldCard
                label="증여자 취득일"
                field="donorAcquisitionDate"
                hint="선택 입력 — 단순 증여의 세율 보유기간은 증여받은 날부터입니다 (소득세법 §104② 본문). 통산이 필요하면 취득원인을 「이월과세(증여)」로 선택하세요."
              >
                <DateInput
                  value={asset.donorAcquisitionDate}
                  onChange={(v) => onChange({ donorAcquisitionDate: v })}
                  data-testid="building-donor-acq-date"
                />
              </FieldCard>
            </>
          )}

          {/* 증여 — 배우자·직계존비속 10년 내 증여는 이월과세(§97의2①) 대상이다. 이 화면은 그 계산을 지원하지 않는다는 고지. */}
          {!isInheritance && (
            <ToneCard tone="amber" noDark>
              <p className="text-xs text-amber-900" data-testid="building-gift-carryover-notice">
                양도일부터 소급하여 10년 이내에 <strong>배우자·직계존비속</strong>으로부터 증여받은 건물은 취득가액·보유기간을 증여자 기준으로
                계산하는 이월과세 대상인지 확인하세요(소득세법 §97의2①). 이 화면은 그 계산을 지원하지 않으며, 건물은 일반 증여(증여일
                평가액·증여일 취득)로 계산됩니다. 이월과세 대상이면 취득 원인을 「이월과세(증여)」로 선택하세요.
              </p>
            </ToneCard>
          )}

          {hasFamilyBusiness && (
            <ToneCard tone="amber" noDark>
              <p className="text-xs text-amber-900" data-testid="building-cause-fb-note">
                가업상속공제 입력이 남아 있어 계산할 수 없습니다 — 이 토글을 끄고 가업상속공제를 해제하세요.
              </p>
            </ToneCard>
          )}
        </div>
      )}
    </div>
  );
}
