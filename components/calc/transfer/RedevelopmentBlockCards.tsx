"use client";

/**
 * RedevelopmentBlock 보조 입력 카드 모음.
 *
 * 분리 사유: `RedevelopmentBlock.tsx` 800줄 정책(2026-08-13 ⑤ 취득가액 모드 통합 시 805줄 도달).
 * 이음매는 **메인 오케스트레이터(섹션 배치) vs 개별 보조 카드**다 — 각 카드는 자기 완결적이라
 * 렌더 순서 파일에서 떼어내도 응집도 손실이 없다.
 *
 * 포함: 소유권이전 고시일 · 청산금 수령분 단독신고 · 분양가 미리보기 ·
 *       인가일 비과세 자기선언 · 승계조합원 구분.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { clearOutOfScopeRedevPatch } from "@/lib/calc/redev-field-scope";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { PrecedentArticleModal } from "@/components/ui/precedent-article-modal";
import { useMemo } from "react";
import { addDays, subDays, isValid, parseISO, format } from "date-fns";
import { SettlementExemptionGuideCard } from "./SettlementExemptionGuideCard";

// ──────────────────────────────────────────────────────────────────────────────
// 청산금 수령 시 소유권이전 고시일 입력 → 양도일(고시일+1일) 자동 표시
// 폼 저장은 양도일(redevSettlementSaleDate), 사용자 입력은 고시일 (UI 변환).
// ──────────────────────────────────────────────────────────────────────────────

export function SettlementAnnouncementDateField({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  // 폼에 저장된 redevSettlementSaleDate = 양도일. UI 표시는 -1일(고시일).
  const announcementDate = useMemo(() => {
    if (!asset.redevSettlementSaleDate) return "";
    const d = parseISO(asset.redevSettlementSaleDate);
    if (!isValid(d)) return "";
    return format(subDays(d, 1), "yyyy-MM-dd");
  }, [asset.redevSettlementSaleDate]);

  const handleAnnouncementChange = (v: string) => {
    if (!v) {
      onChange({ redevSettlementSaleDate: "" });
      return;
    }
    const d = parseISO(v);
    if (!isValid(d)) {
      onChange({ redevSettlementSaleDate: "" });
      return;
    }
    onChange({ redevSettlementSaleDate: format(addDays(d, 1), "yyyy-MM-dd") });
  };

  return (
    <FieldCard
      label="소유권이전 고시일"
      hint="도시정비법 §86 소유권이전 고시일. 양도일(NTS 집행기준 + 시행령 §162①9호)은 다음날로 자동 산정됩니다."
    >
      <div className="space-y-2">
        <DateInput value={announcementDate} onChange={handleAnnouncementChange} />
        {asset.redevSettlementSaleDate && (
          <div className="rounded-md bg-rose-100/60 border border-rose-200 px-3 py-2 text-caption text-rose-800">
            <span className="font-semibold">자동 산정 양도일</span>:{" "}
            <span className="font-mono font-semibold">{asset.redevSettlementSaleDate}</span>{" "}
            <span className="text-rose-600">(고시일 + 1일)</span>
          </div>
        )}
      </div>
    </FieldCard>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 사례 46 — 청산금 수령분 단독 신고 토글 + 분양가 미리보기 + 비과세 자동산정
// ──────────────────────────────────────────────────────────────────────────────

export function ReceiveOnlyToggleCard({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  return (
    <ToggleCard
      tone="rose"
      checked={asset.redevReceiveOnlyMode === "yes"}
      onCheckedChange={(v) => onChange({ redevReceiveOnlyMode: v ? "yes" : "no" })}
      title="청산금 수령분 단독 신고"
      description="신축APT 양도 없이 청산금 수령분만 신고 — 시행령 §166① 본문 + 제1항 제2호 가목 단독 적용 (NTS 집행기준)"
    >
      <div className="space-y-2 text-caption text-rose-800 leading-relaxed">
        <p>
          본 모드 ON 시 인가전·인가후 양도차익은 신고 대상이 아니며,{" "}
          <span className="font-semibold">청산금 수령액만 양도가액으로 의제</span>됩니다.
          종전부동산 취득가액은 권리가액 대비 청산금 비율로 자동 안분됩니다.
        </p>
        <p>
          ※ <span className="font-semibold">양도일</span>은 소유권이전 고시일의 익일로 입력하세요 (NTS 집행기준).
        </p>
        <p>
          ※ 본 모드에서 자본적지출·양도비·인가후 필요경비 입력은{" "}
          <span className="font-semibold">0으로 처리</span>됩니다 (§97①2·3호 슬롯은 법문상 존재하나
          본 PR 미매핑 — 별도 산정 시 직접 신고 권장).
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <LawArticleModal legalBasis="소득세법 시행령 §166 ① 2호" label="시행령 §166①2호" />
          <PrecedentArticleModal
            citation="기획재정부 재산-439 (2014.06.09)"
            label="재산-439 (LTHD 기간)"
            kind="ruling"
            summary="장기보유특별공제 계산시 취득일~관리처분계획인가일까지가 아닌 취득일부터 양도일까지의 기간에 대하여 공제한다."
          />
        </div>
      </div>
    </ToggleCard>
  );
}

export function SalePriceTotalPreviewCard({ asset }: { asset: AssetForm }) {
  const preview = useMemo(() => {
    const rights = parseAmount(asset.redevRightsValue);
    const settle = parseAmount(asset.redevSettlementAmount);
    if (rights <= 0 || settle <= 0) return null;
    const salePriceTotal = Math.max(0, rights - settle);
    return { rights, settle, salePriceTotal };
  }, [asset.redevRightsValue, asset.redevSettlementAmount]);

  if (!preview) return null;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 text-xs space-y-1">
      <p className="font-semibold text-sky-800">분양가액 (자동 도출, 입력 불요)</p>
      <p className="text-sky-700 font-mono">
        분양가액 = 권리가액 {preview.rights.toLocaleString()} − 청산금 수령액 {preview.settle.toLocaleString()}
      </p>
      <p className="text-sky-700 font-mono">= {preview.salePriceTotal.toLocaleString()}</p>
      <p className="text-caption text-sky-600">
        ※ &ldquo;분양가액&rdquo;은 위와 같이 권리가액·청산금 입력으로 자동 도출되므로 별도로 입력하지 않습니다.
      </p>
    </div>
  );
}

export function ExemptionAtApprovalCard({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  /**
   * 자동 산정 — 취득일 ~ **기간 종료일** ≥ 24개월.
   *
   * 종료일은 원칙적으로 관리처분계획인가일이다(주택 → 입주권 권리변환). 다만 인가일 이후에도
   * 철거되지 않고 **사실상 주거용으로 사용**된 기간은 보유·거주기간에 **합산**하므로
   * (사전-2019-법령해석재산-0739), 사용자가 그 사용 종료일을 선언하면 거기까지 센다.
   *
   * ⚠️ 「양도일까지」가 아니다 — 철거 후 기간은 합산 대상이 아니다.
   */
  const auto = useMemo(() => {
    if (!asset.acquisitionDate || !asset.redevApprovalDate) return null;
    const acq = new Date(asset.acquisitionDate);
    const app = new Date(asset.redevApprovalDate);
    if (Number.isNaN(acq.getTime()) || Number.isNaN(app.getTime())) return null;
    if (acq.getTime() > app.getTime()) return null;
    const declaredEnd =
      asset.redevPostApprovalHousingUse === "yes" && asset.redevPostApprovalHousingUseEndDate
        ? new Date(asset.redevPostApprovalHousingUseEndDate)
        : null;
    const extended =
      declaredEnd && !Number.isNaN(declaredEnd.getTime()) && declaredEnd.getTime() > app.getTime();
    const end = extended ? declaredEnd! : app;
    const y = end.getFullYear() - acq.getFullYear();
    const m = end.getMonth() - acq.getMonth();
    const d = end.getDate() - acq.getDate();
    const months = y * 12 + m - (d < 0 ? 1 : 0);
    return { months, eligible: months >= 24, extended };
  }, [
    asset.acquisitionDate,
    asset.redevApprovalDate,
    asset.redevPostApprovalHousingUse,
    asset.redevPostApprovalHousingUseEndDate,
  ]);

  /**
   * 🔴 **엔진이 읽는 것은 자기선언뿐이다** (2026-09-05 · 코드리뷰 Q16).
   *
   * 종전에는 선언이 비어 있으면 아래 `auto`(취득일~인가일 24개월)를 결론으로 승격시켜
   * 「비과세 해당」이라 단언했다. 그러나 ④는 선언이 빈 값이면 `undefined`를 보내고
   * (`transfer-tax-api-redev.ts:180`), 엔진은 `=== true`일 때만 §89①4호·청산금 비과세를
   * 연다(`transfer-tax-redevelopment-transforms.ts:320`). ⇒ 화면은 「해당」인데 엔진은 미적용.
   *
   * 근거 둘이 자기선언 쪽을 가리킨다:
   *  ① 이 파일의 기존 설계 의도가 명시적으로 자기선언이다(아래 토글 주석).
   *  ② 화면이 인용한 예규 **사전-2019-법령해석재산-0739**의 본문이
   *     「사실상 주거용으로 사용되고 있는지 여부는 **사실판단할 사항**이다」로 끝난다 —
   *     자동 배선은 예규가 사실판단으로 남긴 것을 자동화하는 셈이 된다.
   *
   * ⇒ `auto`는 **참고 제안**으로만 표시하고, 결론 박스는 선언만 반영한다.
   *   선언이 없으면 `null` — 아래 `SettlementExemptionGuideCard`도 함께 렌더되지 않아
   *   「자동 적용」이라는 같은 허위 단언이 사라진다.
   */
  const effective: "yes" | "no" | null =
    asset.redevExemptionEligibleAtApproval === "yes"
      ? "yes"
      : asset.redevExemptionEligibleAtApproval === "no"
        ? "no"
        : null;

  /**
   * 참고 기간 문구 — **결론이 아니라 재료**다(Q16). 종전 접두사는 「자동 판정:」이었다.
   *
   * ⚠️ 「인가일까지」와 「사용 종료일까지」를 구분해 적는다 — 합산이 걸리면 세는 끝점이
   *    인가일이 아니다(사전-2019-법령해석재산-0739은 **철거 전 사용 기간**만 합산한다).
   */
  const labelText =
    auto === null
      ? "취득일 + 관리처분계획인가일을 모두 입력하면 참고 기간이 계산됩니다."
      : `참고 — 취득일부터 ${auto.extended ? "사실상 주거용 사용 종료일" : "관리처분계획인가일"}까지 ` +
        `${Math.floor(auto.months / 12)}년 ${auto.months % 12}개월 → 2년 요건 ` +
        `${auto.eligible ? "충족" : "미충족"}` +
        `${auto.extended ? " (인가일 이후 사실상 주거용 사용 기간 합산)" : ""}. ` +
        "계산에 반영하려면 아래에서 직접 선언하세요.";

  return (
    <ToneCard
      tone="violet"
      sectionNum="ⓘ"
      title="비과세 보유 요건 (관리처분계획인가일 기준 보유 2년)"
      bodyClassName="space-y-2"
      noDark
    >
      <p className="text-caption text-violet-800 leading-relaxed">
        서면2016-법령해석재산-2705 (2016.09.12) — 청산금 수령분 1세대1주택 비과세 판정 시
        보유주택수는 양도일 기준이나 보유·거주요건은 관리처분계획인가일 기준으로 충족 여부를 판단합니다.
      </p>
      <p className="text-caption text-violet-700 leading-relaxed">
        ※ 자동 판정은 <span className="font-semibold">관리처분계획인가일 기준</span>(원칙)입니다.
        인가일 이후에도 철거되지 않고 <span className="font-semibold">사실상 주거용으로 사용</span>한
        기간이 있으면 그 기간을 보유·거주기간에 <span className="font-semibold">합산</span>합니다 —
        아래 토글을 켜고 사용 종료일을 입력하면 자동 판정이 그 기간까지 셉니다.
        사실상 주거용이었는지 여부는 <span className="font-semibold">사실판단할 사항</span>이므로,
        최종 충족 여부는 아래에서 직접 선택할 수 있습니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <LawArticleModal legalBasis="소득세법 시행령 §154 ①" label="시행령 §154①" />
        <PrecedentArticleModal
          citation="서면2016-법령해석재산-2705 (2016.09.12)"
          label="서면2016-2705 (판정 시점)"
          kind="ruling"
          summary="청산금 수령분의 1세대1주택 비과세 판정 시 보유주택수 여부는 양도일 현재 기준으로 판정하고, 보유 및 거주요건은 종전주택을 조합에 제공한 시점(관리처분계획인가일 현재)에 충족해야 한다."
        />
        <PrecedentArticleModal
          citation="사전-2019-법령해석재산-0739 (2021.07.23)"
          label="사전2019-0739 (기간 합산)"
          kind="ruling"
          summary="관리처분계획의 인가일 이후에도 기존주택이 철거되지 않고 사실상 주거용으로 사용되고 있는 경우에는 해당기간을 1세대1주택 비과세 특례 적용을 위한 보유기간 및 거주기간에 합산하는 것이며, 사실상 주거용으로 사용되고 있는지 여부는 사실판단할 사항이다."
        />
      </div>

      {/*
        인가일 이후 철거 전 사실상 주거용 사용 — 자동 제안 기간만 늘린다(표시 전용).
        엔진은 아래 라디오의 자기선언(`redevExemptionEligibleAtApproval`)만 읽는다.
      */}
      <ToggleCard
        variant="card"
        tone="violet"
        title="인가일 이후에도 철거되지 않고 사실상 주거용으로 사용"
        description="사전-2019-법령해석재산-0739 — 그 기간을 보유·거주기간에 합산합니다."
        checked={asset.redevPostApprovalHousingUse === "yes"}
        onCheckedChange={(v: boolean) =>
          onChange(
            v
              ? { redevPostApprovalHousingUse: "yes" }
              : { redevPostApprovalHousingUse: "", redevPostApprovalHousingUseEndDate: "" },
          )
        }
      >
        <FieldCard
          label="사실상 주거용 사용 종료일"
          hint="철거일 또는 주거용 사용을 그만둔 날. 양도일이 아닙니다 — 철거 후 기간은 합산되지 않습니다."
        >
          <DateInput
            value={asset.redevPostApprovalHousingUseEndDate}
            onChange={(v) => onChange({ redevPostApprovalHousingUseEndDate: v })}
          />
        </FieldCard>
      </ToggleCard>

      <div className="rounded-md border border-violet-200 bg-white/70 p-2 text-caption text-violet-900">
        {labelText}
      </div>

      <RadioCardGroup
        name={`redevExemption-${asset.assetId}`}
        value={asset.redevExemptionEligibleAtApproval || ""}
        onChange={(v) =>
          onChange({ redevExemptionEligibleAtApproval: v as "" | "yes" | "no" })
        }
        options={[
          {
            value: "",
            label: "선언 안 함",
            description:
              "비과세 특례를 적용하지 않습니다. 장기보유특별공제는 일반 1세대1주택 판정을 그대로 따릅니다.",
          },
          {
            value: "yes",
            label: "충족으로 선언",
            description: "인가일 현재 비과세 요건을 갖췄음 — 청산금 비과세·표2 적용 대상",
          },
          {
            value: "no",
            label: "미충족으로 선언",
            description: "인가일 현재 요건 미충족 — 장기보유특별공제 표1 강제",
          },
        ]}
        layout="inline"
      />

      {/* 결론 박스는 **선언된 값만** 반영한다 (Q16). 선언이 없으면 무엇이 적용되는지를 그대로 적는다. */}
      {effective === null ? (
        <div className="rounded-md border border-amber-300 bg-amber-100/60 p-2 text-caption text-amber-900">
          <p>
            <span className="font-semibold">선언하지 않음</span> — 청산금 비과세·§89①4호 특례가{" "}
            <span className="font-semibold">적용되지 않습니다</span>. 장기보유특별공제는 일반
            1세대1주택 판정을 따릅니다(표1 강등은 「미충족」을 선언한 경우에만).
          </p>
          <p className="text-muted-foreground">
            위 참고 기간은 계산에 반영되지 않습니다 — 충족 여부는 사실판단 사항입니다
            (사전-2019-법령해석재산-0739).
          </p>
        </div>
      ) : (
        <div
          className={`rounded-md border p-2 text-caption ${
            effective === "yes"
              ? "border-emerald-300 bg-emerald-100/60 text-emerald-900"
              : "border-rose-300 bg-rose-100/60 text-rose-900"
          }`}
        >
          {effective === "yes" ? (
            <p>
              <span className="font-semibold">충족으로 선언됨</span> — LTHD 표2 적용 가능 (1세대1주택 + 12억 초과 시 안분 적용)
            </p>
          ) : (
            <p>
              <span className="font-semibold">미충족으로 선언됨</span> — LTHD 표1 강제 (12억 안분 비활성)
            </p>
          )}
        </div>
      )}

      {/* 사례 47 settlement 비과세 차감 4분기 안내 (receiveOnly=no + receive 동시신고) */}
      {asset.redevReceiveOnlyMode !== "yes" && <SettlementExemptionGuideCard asset={asset} effective={effective} />}
    </ToneCard>
  );
}

// SettlementExemptionGuideCard는 SettlementExemptionGuideCard.tsx로 분리됨 (800줄 정책)

// ─────────────────────────────────────────────────────────────────────────────
// 사례 48 — 승계조합원 신축APT 양도 (관리처분 후 입주권 승계 → 신축APT 양도)
// 사전-2019-법령해석재산-0649 + 시행령 §162①4호
// ─────────────────────────────────────────────────────────────────────────────

export function SuccessorMemberSection({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  // 자동 추정 힌트 3-state (silent 분기 금지 — 안내만)
  const autoSuggestionState = useMemo<"hidden" | "recommend" | "ambiguous">(() => {
    if (asset.redevIsSuccessorMember === "yes") return "hidden"; // 이미 ON
    if (!asset.acquisitionDate || !asset.redevApprovalDate) return "hidden";
    const acq = new Date(asset.acquisitionDate).getTime();
    const apv = new Date(asset.redevApprovalDate).getTime();
    if (isNaN(acq) || isNaN(apv)) return "hidden";
    if (acq > apv) return "recommend"; // 인가 후 취득 → 승계조합원 권장
    if (acq === apv) return "ambiguous"; // 경계값 — 회색지대 경고
    return "hidden";
  }, [asset.acquisitionDate, asset.redevApprovalDate, asset.redevIsSuccessorMember]);

  const isSuccessor = asset.redevIsSuccessorMember === "yes";

  // successor 진입 시 동반 셋팅 (onChange 1회 — useEffect 미러링 금지)
  const handleToggle = (v: "yes" | "no") => {
    if (v === "yes") {
      /**
       * Q20 — 승계조합원 전환은 ③-c 자기선언 축(`exemptionAtApprovalInScope`)도 함께 닫는다
       * (승계조합원이면 범위 밖). 종전에는 그 카드의 3필드가 남아, 「사실상 주거용 사용」
       * 토글이 ON인 채 종료일이 비어 있으면 ⑧이 **채울 칸 없이** 차단했다.
       * 정리 대상은 마이그레이션과 같은 `clearOutOfScopeRedevPatch` 단일 소스를 쓴다.
       */
      const axisPatch = {
        redevIsSuccessorMember: "yes" as const,
        redevSettlementDirection: "pay" as const,
      };
      onChange({
        ...clearOutOfScopeRedevPatch({ ...asset, ...axisPatch }),
        redevIsSuccessorMember: "yes",
        // 명시 셋팅 (display fallback 의존 차단)
        // 3중 패턴 동기화: right_to_move_in → "right", 그 외 → "apt" (buildRedevelopmentPayload 동일)
        redevSubject: asset.redevSubject || (asset.assetKind === "right_to_move_in" ? "right" : "apt"),
        // 본 PR 강제값 (validate에서 차단되는 분기를 사전 ON 차단)
        redevSettlementDirection: "pay",
        redevSettlementAmount: "0",
        redevPreApprovalExpenses: "0",
        redevReceiveOnlyMode: "no",
        useEstimatedAcquisition: false,
        // P6 — 권리가액(§166④) 필드는 승계 모드에서 의미 없음. store 잔재 제거.
        // 엔진은 fixedAcquisitionPrice 자동 미러로 처리.
        redevRightsValue: "",
      });
    } else {
      // U1-02 — 「인가후 필요경비」는 승계 전용 칸이라 되돌리면 화면에서 사라지는데 값은 남아
      //         인가후 양도차익을 조용히 깎는다(시행령 §166①1호). 원조합원에는 그 금액을 지울
      //         칸이 없다. 「예」 분기와 **같은 leaf**로 정리한다(Q20 — 대상 목록 단일 소스).
      const axisPatch = { redevIsSuccessorMember: "no" as const };
      onChange({ ...axisPatch, ...clearOutOfScopeRedevPatch({ ...asset, ...axisPatch }) });
    }
  };

  return (
    <ToneCard
      tone="rose"
      sectionNum="2a"
      title="조합원 구분"
      bodyClassName="space-y-2"
      noDark
    >
      <RadioCardGroup
        name={`redevIsSuccessor-${asset.assetId}`}
        value={(asset.redevIsSuccessorMember as "" | "yes" | "no") || "no"}
        onChange={(v) => handleToggle(v as "yes" | "no")}
        options={[
          {
            value: "no",
            label: "원조합원",
            description: "관리처분계획인가일 이전 종전부동산 취득자",
          },
          {
            value: "yes",
            label: "승계조합원",
            description: "관리처분계획인가일 이후 입주권을 상속·증여·매매로 승계 취득",
          },
        ]}
        layout="stack"
      />

      {/* 자동 추정 안내 — silent 적용 금지 */}
      {autoSuggestionState === "recommend" && (
        <div className="rounded-md border border-violet-200 bg-violet-50 p-2.5 text-caption text-violet-900">
          ⓘ 관리처분 인가일이 취득일보다 이전입니다. 승계조합원 모드 사용을 권장합니다.
        </div>
      )}
      {autoSuggestionState === "ambiguous" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-caption text-amber-900">
          ⚠️ 취득일과 관리처분 인가일이 <span className="font-semibold">동일 날짜</span>입니다.
          원조합원·승계조합원 해석이 갈리는 회색지대로, 사전답변례·NTS 해석을 확인 후 적절한 모드를 선택하세요.
        </div>
      )}

      {isSuccessor && (
        <div className="space-y-2 pt-1">
          <FieldCard
            label="준공일 (사용검사필증 교부일)"
            hint="보유기간·세율의 기산일이 됩니다."
            trailing={
              <LawArticleModal
                legalBasis="소득세법 시행령 §162 ① 4호"
                label="시행령 §162①4호"
              />
            }
          >
            <DateInput
              value={asset.redevCompletionDate}
              onChange={(v) => onChange({ redevCompletionDate: v })}
            />
          </FieldCard>

          {/*
            §95② 표2(시행령 §159의4) 거주기간 — 2026-08-25 신설 (E1-08).

            종전에는 승계조합원 화면에 거주기간 입력이 **하나도 없었다**
            (`RedevelopmentBlock.tsx`가 거주월수 분리 카드를 승계 모드에서 숨겼고, Step4의
            거주기간 섹션은 `primaryKind === "housing"`에서만 렌더된다). 그 상태에서 엔진만
            고치면 표2에 **영원히 도달하지 못한다**(memory `feedback_api_trigger_without_input_path_is_noop`).

            ⚠️ 「신축주택」 거주기간이다 — 이 분기의 보유기간이 **준공일 기산**이라
               그 구간 안의 거주만 §159의4의 「보유기간 중 거주기간」에 해당한다.
               승계 전 종전주택 거주는 타인의 거주라 무관하다.
          */}
          <FieldCard
            label="신축주택 거주기간 (개월)"
            hint="준공일~양도일 사이 신축아파트에 실제 거주한 개월 수. 1세대1주택이고 24개월 이상이면 장기보유특별공제가 표2(보유 4%/년 + 거주 4%/년, 최대 80%)로 적용됩니다."
            trailing={
              <LawArticleModal
                legalBasis="소득세법 시행령 §159의4"
                label="시행령 §159의4"
              />
            }
          >
            <DecimalInput
              value={asset.redevNewHouseResidenceMonths}
              onChange={(v: string) => onChange({ redevNewHouseResidenceMonths: v })}
              placeholder="준공일 이후 실거주 개월 수"
            />
          </FieldCard>

          <div className="rounded-md border border-sky-200 bg-sky-50 p-2.5 text-caption text-sky-900 space-y-1 leading-relaxed">
            <div className="font-semibold">승계조합원 신축APT 양도 분기</div>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>보유기간 = 양도일 − 준공일 (사전-2019-법령해석재산-0649)</li>
              <li>장기보유특별공제·세율의 기산일 = 준공일</li>
              <li>1세대1주택 + 신축주택 거주 2년 이상 → 장특공제 표2 (§95② 단서·시행령 §159의4)</li>
              <li>§166 인가전·인가후 안분 산식 미적용 (단순 차감)</li>
              <li>1세대1주택 비과세는 준공일 기준 2년 보유 충족 시 적용</li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <LawArticleModal
                legalBasis="소득세법 시행령 §162 ① 4호"
                label="시행령 §162①4호"
              />
              <PrecedentArticleModal
                citation="사전-2019-법령해석재산-0649 (2020.02.11)"
                label="사전-2019-법령해석재산-0649"
                kind="ruling"
                summary="관리처분계획인가일 이후 입주권을 승계 취득한 자의 신축아파트 취득시기는 아파트의 사용검사필증 교부일이며, 1세대1주택 비과세·LTHD·세율 적용에 있어 보유기간 기산일은 모두 준공일이다."
              />
            </div>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-caption text-amber-900">
            <div className="font-semibold">현재 지원하지 않는 분기 (자동 차단)</div>
            <ul className="list-disc pl-4 space-y-0.5 mt-1">
              <li>승계조합원 + 청산금 분기 (납부·수령)</li>
              <li>승계조합원 + 12억 초과 안분</li>
              <li>승계조합원 + 환산취득가 모드 (상속·증여 평가액을 직접 입력하세요)</li>
              <li>승계조합원 + 동일세대 상속 §154⑧ 통산</li>
            </ul>
          </div>
        </div>
      )}
    </ToneCard>
  );
}
