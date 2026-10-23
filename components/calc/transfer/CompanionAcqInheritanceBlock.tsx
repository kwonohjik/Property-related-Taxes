"use client";

/**
 * 상속 취득 입력 통합 셸 (B1 통합 — P2b)
 *
 * 상속 취득가액 입력을 단일 흐름으로 통합:
 *   1. 헤더: 상속개시일·피상속인 취득일
 *   2. §154⑧3호 동일세대 통산 토글 (주택 전용)
 *   3. 자산 구분 (토지/개별주택/공동주택)
 *   4. 취득가액 산정 — InheritedAcquisitionDeemedSection (의제취득일 전후 자동 분기)
 *
 * 기존 auto/manual 토글·상단 공시가격/직접입력(fixedAcquisitionPrice)을 제거하고,
 * 취득가액은 하단 평가방법 축(post-deemed)·환산(pre-deemed)으로 일원화한다.
 * 토지 신고가액은 총액(publishedValueAtInheritance) 단일 의미로 통일 (route 경로 통일, R0″).
 *
 * inheritanceValuationMode는 항상 "auto"(factory 기본·migration 전환) — UI에 토글 없음.
 */

import { mixedSec163_9CompareOf } from "@/lib/calc/mixed-use-sec163-9";
import { isBgPreDeemedAsset } from "@/lib/calc/bg-pre-deemed";
import { gbBgThreeWayParts } from "@/lib/calc/bg-pre-deemed-mode";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { InheritedAcquisitionDeemedSection } from "./InheritedAcquisitionDeemedSection";
import { InheritedCohabitationCard } from "./InheritedCohabitationCard";
import { buildingDatePatch } from "@/lib/calc/transfer-land-part-cause";
import { sec164LandLatchClearPatch } from "@/lib/calc/transfer-163-9-base-date";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 — 의제분기 섹션의 환산 계산에 전달 */
  transferDate?: string;
  /** 상속개시일 칸의 검증 오류 이동 앵커 키(기본 `acquisitionDate`) — `CompanionAcqPurchaseBlock.types.ts`의 같은 prop */
  fieldAcquisitionDate?: string;
}

export function CompanionAcqInheritanceBlock({ asset, onChange, transferDate, fieldAcquisitionDate = "acquisitionDate" }: Props) {
  // 겸용주택 모드: 취득가액은 §163⑨ 상속개시일 평가액을 ② 주택·③ 상가 기준시가 섹션에서
  // 직접 산정(MixedUseAssetMajorStdPrice) — 여기의 자산 구분·취득가액 의제 특례는 겸용 엔진이
  // 소비하지 않는 dead 입력이라 숨긴다(CompanionAcqPurchaseBlock.tsx의 기존 isMixedUse 파생 패턴 재사용).
  const isMixedUse = !!asset.isMixedUseHouse;
  const mixedCmp = mixedSec163_9CompareOf(asset);
  /**
   * 🔴 **부담부증여는 취득가액 축이 통째로 무효다** (2026-08-08 · 계획서 §10-5).
   *
   * 「소득세법 시행령」 제159조가 「양도로 보는 부분」의 취득가액을 **채무비율 × 자산별 기준시가**로
   * 정하고, 엔진이 그 값으로 `acquisitionPrice`를 **덮어쓴다**(`transfer-tax-burdened-gift-step.ts`).
   * 실측: 취득가액에 50억을 넣어도 세액이 변하지 않는다 — 일반건물·주택·토지·상가 **전 자산종류**
   * 동일하다. ⑧ validate도 요구하지 않는다(부담부증여 분기가 조기 종결).
   *
   * ⇒ 띄우면 「입력했는데 세액이 그대로」인 칸이 된다(`feedback_ui_engine_dual_truth_avoidance`).
   *   매매 경로는 이미 같은 판단이다(`CompanionAcqPurchaseBlock.tsx:262` 산정방식 게이트).
   *
   * ⚠️ **날짜 축은 남긴다.** 상속개시일은 취득일(= 보유기간 기산일, §95④)이고 피상속인 취득일은
   *    §104②1호 단기보유 통산에 쓰인다 — 둘 다 부담부증여에서도 소비된다.
   * ⚠️ 부담부증여 K-4(실지취득가 안분)의 입력은 `bgActualAcquisition*` **전용 필드**이고
   *    `BurdenedGiftBlock`에 따로 있다 — 여기서 숨겨도 입력 경로가 사라지지 않는다.
   */
  // 의제취득일 전 토지·주택은 예외다 — §159①1호 A가 ①②③(시가)·의제취득일 기준시가(기준시가)로 정해져 그 입력이 계산에 쓰인다(계획서 §18).
  const isBurdenedGift = asset.transferType === "burdened_gift" && !isBgPreDeemedAsset(asset);
  return (
    <div className="space-y-3 rounded-md border border-border bg-background py-3 px-2 sm:px-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">상속개시일</label>
          <DateInput
            data-field={fieldAcquisitionDate}
            value={asset.acquisitionDate}
            onChange={(v) =>
              onChange({
                ...buildingDatePatch("inheritance", v),
                // 의제취득일 前 → 後로 넘어가면 「환산」 토글이 화면에서 사라져 켜짐 래치를 끌 방법이 없다(별건 B3 잔여).
                // 날짜를 고치는 중간 상태(빈 값)에서는 걸지 않는다 — 연도를 덮어쓰는 동안 토글이 풀리면 안 된다.
                ...(v ? sec164LandLatchClearPatch({ ...asset, acquisitionDate: v, inheritanceStartDate: v }) : {}),
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">피상속인 취득일</label>
          <DateInput
            data-field="decedentAcquisitionDate"
            value={asset.decedentAcquisitionDate}
            onChange={(v) => onChange({ decedentAcquisitionDate: v })}
          />
          <p className="text-caption text-muted-foreground">단기보유 통산용 (소득세법 §104②1호)</p>
        </div>
      </div>

      {/*
        수유자 — 취득일·취득가액은 상속 그대로이고 상속 특례만 갈린다. 세율 보유기간 통산(§104②1호)은 모든 자산이 읽으므로
        자산 종류와 관계없이 띄운다(계획서 docs/00-pm/non-heir-bequest-followups.plan.md §4-2).
      */}
      <ToggleCard
        variant="card"
        tone="violet"
        data-testid="acq-non-heir-bequest"
        checked={asset.nonHeirBequest ?? false}
        onCheckedChange={(v) => onChange({ nonHeirBequest: v || undefined })}
        title="상속인이 아닌 사람이 유증·사인증여로 받음"
        description="민법상 상속인(선순위·대습상속인 포함)이 아닌 사람이 유언이나 사인증여로 받았으면 켜세요. 상속인이 유증·사인증여로 받은 것은 상속이므로 켜지 않습니다."
      >
        <p className="text-caption text-muted-foreground pt-1">
          취득일(상속개시일)과 취득가액은 상속과 같습니다. 다음 상속 특례를 적용하지 않습니다: 세율 보유기간을 피상속인 취득일부터
          세는 것(소득세법 §104②1호), 상속주택 다주택 중과 배제(소득령 §167의3①7호), 비사업용 토지의 상속 특례(소득령 §168의14③ 등),
          자경농지 감면의 피상속인 자경기간 합산(조특령 §66⑪·⑫), 수용 감면의 피상속인 취득일 소급(조특법 §77⑨·§77의3③).
        </p>
      </ToggleCard>

      {/* §154⑧3호 상속주택 자체 양도 — 동일세대 보유기간 통산 (주택 전용) */}
      {asset.assetKind === "housing" && (
        <InheritedCohabitationCard asset={asset} onChange={onChange}>
          {/* §155② 단서 예외 — 동일세대 상속은 중과 배제(7호)가 원칙적으로 서지 않는다 */}
          <ToggleCard
            variant="chip"
            tone="violet"
            checked={asset.parentalCareMergeInheritedHouse ?? false}
            onCheckedChange={(v) =>
              onChange({ parentalCareMergeInheritedHouse: v || undefined })
            }
            title="양도 주택이 동거봉양 합가 전 피상속인 보유분"
            description="60세 이상 직계존속 동거봉양으로 세대를 합쳐 2주택이 된 경우로서 합치기 이전부터 피상속인이 보유하던 주택이면 특례가 적용됩니다 (§155② 단서 예외)."
          />
          <p className="text-caption text-muted-foreground">
            동일세대 상속은 §155② 단서로 상속주택 특례가 원칙 배제되고, 그에 따라 이 주택을 양도할
            때 <b>다주택 중과 배제(영 §167의3①7호)도 서지 않습니다</b>. 위 예외에 해당하면 켜세요.
          </p>
        </InheritedCohabitationCard>
      )}

      {/* §155②1~4호 순위 — 피상속인 2주택↑ 중 선순위가 아니면 「상속받은 주택」이 아니다 */}
      {asset.assetKind === "housing" && (
        <ToggleCard
          variant="card"
          tone="violet"
          checked={asset.isRankingDisqualifiedInheritedHouse ?? false}
          onCheckedChange={(v) =>
            onChange({ isRankingDisqualifiedInheritedHouse: v || undefined })
          }
          title="양도 주택이 선순위 상속주택이 아님 (피상속인 2주택 이상)"
          description="선순위가 아니면 「상속받은 주택」으로 보지 않아 중과 배제가 서지 않습니다 (§155②1~4호)."
        >
          <p className="text-caption text-muted-foreground pt-1">
            순위는 ① 피상속인 보유기간이 가장 긴 주택 → ② 거주기간이 가장 긴 주택 → ③ 상속개시 당시
            거주한 주택 → ④ 기준시가가 가장 높은 주택 순입니다. 피상속인이 1주택만 보유했다면 끄세요.
          </p>
        </ToggleCard>
      )}

      {/* 부담부증여 — §159가 취득가액을 정하므로 아래 취득가액 축을 숨긴다(위 주석). 일반건물 · 시가 · 의제취득일 전 토지는 ①을 같은 카드의
          「① 상증법 평가액」 칸에서 받으므로(PR-7b-6b) 「입력란을 표시하지 않습니다」 안내를 띄우지 않는다. */}
      {isBurdenedGift && !gbBgThreeWayParts(asset).land && (
        <ToneCard
          tone="amber"
          title="취득가액 — 부담부증여 §159 자동 산정"
          titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §159" label="§159 부담부증여" />}
        >
          <p className="text-xs text-amber-800 dark:text-amber-200">
            부담부증여에서 <strong>양도로 보는 부분</strong>의 취득가액은 취득당시 기준시가에
            <strong> 채무비율</strong>을 곱해 산정합니다. 상속개시일 평가액을 따로 적어도 계산에
            쓰이지 않으므로 입력란을 표시하지 않습니다. 위 <strong>상속개시일</strong>은 보유기간
            기산일로, <strong>피상속인 취득일</strong>은 단기보유 통산에 계속 사용됩니다.
          </p>
        </ToneCard>
      )}

      {/* 상가건물·오피스텔 상속 — 자산구분(토지/주택) 무의미(상증법 §60~66 평가액 직접). 안내만.
          의제취득일 전 부담부증여는 §159가 정한다(부담부증여 블록의 안내 — PR-7b-1). */}
      {asset.transferType !== "burdened_gift" && !isMixedUse && asset.assetKind === "commercial_building" && (
        <ToneCard
          tone="amber"
          title="취득가액 — 상속개시일 상증법 평가액"
          titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}
        >
          <p className="text-xs text-amber-800 dark:text-amber-200">
            상업용건물·오피스텔은 상속개시일 현재 상증법 §60~66 평가액(상속세 신고가액)을 취득가액으로 봅니다.
            아래에 신고가액을 직접 입력하세요. (2005.1.1 전 상속은 §164⑥ 취득당시 기준시가와 비교하여 큰 금액 적용 —
            아래 취득 정보의 §164⑥ 섹션 참조.)
          </p>
        </ToneCard>
      )}

      {/* 자산 구분(토지/개별주택/공동주택)은 상단 라디오를 폐지하고, 취득가액이 실제 필요로 하는
          맥락에서만 노출한다: 토지/주택 판정은 상단 assetKind로 파생하고, 주택 개별/공동 선택은
          보충적평가 보조계산·§164⑦ 환산 섹션 내부(InheritanceHouseKindPicker)에서만 물어본다.
          핵심 입력은 아래 "평가방법 + 신고가액". */}

      {/* 취득가액 산정 — 의제취득일(1985.1.1.) 전후 자동 분기 (pre/post, 비-겸용 전용) */}
      {!isBurdenedGift && !isMixedUse && (
        <InheritedAcquisitionDeemedSection asset={asset} onChange={onChange} transferDate={transferDate} />
      )}

      {/* 겸용주택 안내 — 자산 구분·취득가액 의제 특례 대신 §163⑨ 직접 산정 경로로 유도 */}
      {!isBurdenedGift && isMixedUse && (
        mixedCmp ? (
          // §163⑨ 단서 자산 합계 비교 구간(PR-6) — 상속개시일 평가액을 「그대로」 쓰지 않는다.
          <ToneCard
            tone="violet"
            title={mixedCmp.era === "pre_deemed" ? "취득가액 — 겸용주택 ①②③ 합계 비교 (의제취득일 전)" : "취득가액 — 겸용주택 ①② 합계 비교 (개별주택가격 공시 전)"}
            titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}
          >
            <p className="text-xs text-violet-800 dark:text-violet-200">
              주택분·상가분 ① 상속세 신고가액 합계, ② §164 기준시가 합계
              {mixedCmp.era === "pre_deemed" ? ", ③ 환산취득가액 합계" : ""} 중 가장 큰 금액을 취득가액으로 씁니다.
              아래 &ldquo;주택 기준시가&rdquo;·&ldquo;상가 기준시가&rdquo; 섹션에서 입력하므로, 이 화면의 자산 구분·취득가액 의제
              특례 입력은 표시하지 않습니다.
            </p>
          </ToneCard>
        ) : (
          <ToneCard
            tone="violet"
            title="취득가액 — 겸용주택 상속개시일 평가액 자동 적용"
            titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}
          >
            <p className="text-xs text-violet-800 dark:text-violet-200">
              겸용주택(주택+상가)은 상속개시일 현재 상증법 §60~66 평가액을 취득가액으로 직접
              사용합니다. 아래 &ldquo;주택 기준시가&rdquo;·&ldquo;상가 기준시가&rdquo; 섹션의
              &ldquo;상속개시일&rdquo; 입력에서 산정하므로, 이 화면의 자산 구분·취득가액 의제
              특례 입력은 표시하지 않습니다.
            </p>
          </ToneCard>
        )
      )}
    </div>
  );
}
