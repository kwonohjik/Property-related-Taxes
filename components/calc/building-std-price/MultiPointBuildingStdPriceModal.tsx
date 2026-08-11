"use client";

/**
 * 건물 기준시가 **N시점 일괄 계산** 모달 (양도 — 「소득세법 시행령」 제164조)
 *
 * 같은 건물의 부분(층/구역)별 구조·용도·연면적을 1회 입력해, 호출부가 지정한 **시점 수만큼**
 * (`points` 배열 — 1~3) 건물 기준시가를 한 번에 산출한다. 시점 라벨·연도·공시지가 prefill은
 * 전부 호출부가 주입한다.
 *
 * ## 맥락별 시점 구성 (호출부가 `points`로 결정)
 *  - PHD §164⑤ · 겸용 · 상속 주택평가: 취득 · 최초공시 · 양도 3시점
 *  - 상가 §164⑥(호별 고시 전 취득): 취득 · **최초고시(2005)** · 양도 3시점
 *  - 일반건물 환산: 취득 · 양도 2시점
 *
 * 겸용(`enableCommercial`)은 부분별 주택/상가 카테고리를 구분해 주택분 전 시점 + 상가분
 * 양도시(및 Case A의 취득·최초공시)를 함께 산출한다.
 *
 * 산출 규칙: `lib/calc/phd-building-std-batch.ts` (≤2000·당시 주택 용도 상가는 미산출·수동 유지).
 * 사용 가능 여부 판정: `lib/calc/building-std-multipoint-gate.ts` (호출부가 게이트를 거쳐 렌더).
 * 계획서: `docs/02-design/features/building-std-price-modal-multipoint.plan.md`
 *
 * ⚠️ 이 모달이 지원하지 않는 계산 경로(기계식주차·공동주택 환산·§164⑧ 동일연도·상증 조정률)는
 *    `BuildingStdPriceModalButton`(범용 폼)이 담당한다 — 호출부는 그 런처를 **보조로 유지**한다.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { AddressSearch } from "@/components/ui/address-search";
import type { AddressValue } from "@/components/ui/address-search";
import { BuildingRegisterLookupField } from "./BuildingRegisterLookupField";
import { buildAddressPatch } from "@/lib/calc/building-std-price-form";
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";
import { BuildingStructureSelect } from "./BuildingStructureSelect";
import { BuildingUsageSelect } from "./BuildingUsageSelect";
import {
  computePhdThreePointStdPrice,
  type PhdBatchResult,
  type PhdBatchPart,
  type PhdBatchInput,
  type PhdPartCategory,
} from "@/lib/calc/phd-building-std-batch";
import { phdBatchToSnapshots } from "@/lib/calc/phd-batch-snapshots";
import { useBuildingStdSnapshotStore } from "@/lib/stores/building-std-snapshot-store";

/** 시점별 적용 결과 — 산출된 카테고리만 채워짐(원 정수) */
export interface MultiPointStdPriceApply {
  acquisition?: { housing?: number; commercial?: number };
  firstDisclosure?: { housing?: number; commercial?: number };
  transfer?: { housing?: number; commercial?: number };
  /**
   * 시점별 입력 공시지가(원/㎡, 문자열) — 외부 3시점 섹션 되돌려쓰기용.
   * 값 입력된 시점만 포함. 취득≤2000 2001값 게이팅은 소비 측(applyBatch)에서 처리.
   */
  landPrices?: { acquisition?: string; firstDisclosure?: string; transfer?: string };
}

export interface StdPricePointSpec {
  key: "acquisition" | "firstDisclosure" | "transfer";
  /**
   * 화면 라벨 — 맥락에 따라 같은 `key`도 다르게 부른다.
   * 예) `firstDisclosure`: PHD §164⑤ "최초공시일" / 상가 §164⑥ "최초고시(2005)".
   * 미지정 시 `POINT_LABEL` 기본값으로 대체한다.
   */
  label: string;
  year: number | undefined;
  /** ㎡당 공시지가 prefill(문자열) */
  landPricePerM2: string;
  /**
   * 공시지가 **기준연도** — 라벨·조회에 쓰는 연도. `year`와 **다른 축**이다.
   *
   * `year`는 건물기준시가 고시 체계 연도(구조·용도 코드표가 그 해 체계를 따른다)인 반면,
   * 개별공시지가는 매년 5/31 공시라 그 이전 날짜의 기준연도는 **전년도**다
   * (`recommendLandPriceYear` — 상위 화면 `LandPriceLookupField`가 쓰는 규칙과 동일).
   * 예) 양도일 2026-02-19 → `year` 2026 · `landPriceYear` 2025.
   *
   * 미지정 시 `year`로 대체(종전 동작).
   */
  landPriceYear?: number;
  /**
   * 공시지가 칸을 Vworld 조회 필드(`LandPriceLookupField`)로 연다 — 기준연도는
   * `landPriceYear ?? year`로 고정. 상위 화면 값을 그대로 쓸 수 없어 prefill을 비운 시점에
   * 켠다(빈 칸만 남기면 사용자가 그 연도 공시지가를 구할 경로가 없다).
   */
  lookupLandPrice?: boolean;
  /** `lookupLandPrice` 시 칸 위에 표시할 사유 안내. 미지정 시 미표시. */
  landPriceHint?: string;
}

interface Props {
  /** 표시·계산할 시점 목록(1~3). 연도 미상 시점은 계산에서 제외된다. */
  points: StdPricePointSpec[];
  onApply: (v: MultiPointStdPriceApply) => void;
  buttonLabel?: string;
  /** 겸용주택 — 부분별 주택/상가 카테고리 입력 노출. 미설정=주택 단일(단독). */
  enableCommercial?: boolean;
  /**
   * Case A(용도변경 house_to_commercial + 최초공시<용도변경) — 취득·최초공시 상가건물도
   * 당시 주택 용도로 자동 산출. 상가 부분에 주택 대표 usageNo(acqFirstUsageNo) 주입.
   * 미설정(Case B·단독)=취득·최초공시 상가 미산출(수동).
   */
  commercialAcqFirstMode?: boolean;
  /**
   * 건물 기준시가 스냅샷 저장 접두(예: `bsp-${assetId}-phd`). 주입 시 "모두 적용" 시점에
   * 각 시점·카테고리를 스냅샷으로 재구성 저장 → 결과탭 「건물 기준시가 계산서」 재유도.
   * 미주입 시 스냅샷 저장 생략(종전 동작).
   */
  snapshotPrefix?: string;
  /**
   * 지번 주소 — 취득시(≤2000, 2001.1.1 기준) 개별공시지가 Vworld 조회 활성화 조건.
   * 미주입 시 조회 버튼만 비활성, 수동 입력은 유지.
   */
  jibun?: string;
  /**
   * 소재지 전체(자산 카드 ① 기본정보) — 모달 열 때 소재지 검색창에 시드한다.
   * `jibun`(지번 문자열)만으로는 **pnu가 없어 건축물대장 조회가 비활성**되므로,
   * 1시점 계산기(`BuildingStdPriceModalButton initialAddress`)와 같은 값을 받는다.
   * 미주입 시 빈 검색창(종전 동작) — 사용자가 모달에서 직접 검색한다.
   */
  initialAddress?: AddressValue;
  /**
   * 첫 부분(주택) 연면적 자동채움(문자열) — 겸용주택 주택분 등에서 상위 화면의 주택 연면적을
   * 모달 열 때 첫 행에 시드. 미주입 시 빈 값(종전 동작). 사용자 수정 가능.
   */
  housingFloorAreaPrefill?: string;
  /**
   * 상가 연면적 자동채움(문자열) — 겸용(enableCommercial)에서 모달 열 때 상가 행을
   * 이 값으로 함께 시드. 미주입·비겸용 시 주택 행만 시드(종전 동작). 사용자 수정 가능.
   */
  commercialFloorAreaPrefill?: string;
  /** 런처 버튼 `data-testid`(E2E 셀렉터). 미주입 시 미부여. */
  dataTestId?: string;
  /**
   * 연면적 입력 칸을 숨긴다 — 상위 자산 폼(① 기본정보 면적·규모)이 연면적의 단일 입력
   * 자리인 호출부 전용(GB·CB). 값은 `housingFloorAreaPrefill`이 실어 나른다.
   *
   * ⚠️ **행이 1개일 때만** 숨긴다. 「+ 부분 추가」로 층/구역을 나누면 행마다 자기 연면적이
   *    필요한데(구조·용도별 ㎡당 가액) 상위에는 건물 **전체** 연면적 하나뿐이라 대체할 값이
   *    없다 — 그대로 숨기면 2행부터 연면적 0으로 조용히 오산된다.
   * ⛔ 상위에 연면적 필드가 없는 호출부(겸용 3시점·PHD·상속)에는 켜지 말 것.
   */
  hideFloorAreaInput?: boolean;
}

/** 편집 중 부분 행 — 시점별 구조·용도(연도 체계 상이) + 공통 연면적 */
interface PartRow {
  floorArea: string;
  category: PhdPartCategory;
  acqStructureKey: string;
  acqUsageNo: string;
  firstStructureKey: string;
  firstUsageNo: string;
  transferStructureKey: string;
  transferUsageNo: string;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const POINT_LABEL: Record<StdPricePointSpec["key"], string> = {
  acquisition: "취득시",
  firstDisclosure: "최초공시일",
  transfer: "양도시",
};
const emptyRow = (category: PhdPartCategory = "housing"): PartRow => ({
  floorArea: "",
  category,
  acqStructureKey: "",
  acqUsageNo: "",
  firstStructureKey: "",
  firstUsageNo: "",
  transferStructureKey: "",
  transferUsageNo: "",
});

export function MultiPointBuildingStdPriceModal({
  points,
  onApply,
  buttonLabel,
  enableCommercial = false,
  commercialAcqFirstMode = false,
  snapshotPrefix,
  jibun,
  initialAddress,
  housingFloorAreaPrefill,
  commercialFloorAreaPrefill,
  dataTestId,
  hideFloorAreaInput,
}: Props) {
  const [open, setOpen] = useState(false);
  const [builtYear, setBuiltYear] = useState("");
  const [rows, setRows] = useState<PartRow[]>([emptyRow()]);
  // 시점별 공시지가(원/㎡)
  const [landPrices, setLandPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(points.map((p) => [p.key, p.landPricePerM2])),
  );
  const [result, setResult] = useState<PhdBatchResult | null>(null);
  // 마지막 계산에 쓴 입력 — "모두 적용" 시 스냅샷 재구성용
  const [computedInput, setComputedInput] = useState<PhdBatchInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const replaceSnapshotsByPrefix = useBuildingStdSnapshotStore((s) => s.replaceSnapshotsByPrefix);

  // 시점별 구조·용도 옵션 기준 연도 — 각 시점의 연도 체계. ≤2000은 2001 체계(엔진 acqBase가 2001표 사용).
  const yearOf = (k: StdPricePointSpec["key"]) => points.find((p) => p.key === k)?.year;
  const schemeYear = (y: number | undefined) => (y != null && y <= 2000 ? 2001 : y);
  const acqOptionYear = schemeYear(yearOf("acquisition"));
  const firstOptionYear = schemeYear(yearOf("firstDisclosure"));
  const transferOptionYear = schemeYear(yearOf("transfer"));

  /**
   * 시점 라벨 — 호출부 `points[].label` 우선, 없으면 기본값(`POINT_LABEL`).
   * 같은 `key`라도 맥락에 따라 부르는 이름이 다르다(§상가 "최초고시(2005)" ↔ PHD "최초공시일").
   */
  const labelOf = (k: StdPricePointSpec["key"]) =>
    points.find((p) => p.key === k)?.label || POINT_LABEL[k];
  /** 실제로 화면·계산에 등장하는 시점 목록 — 결과·문구가 모두 이 배열을 따른다. */
  const activePoints = points.length > 0 ? points : [];
  const pointCount = activePoints.length;

  const label =
    buttonLabel ??
    (enableCommercial
      ? `${pointCount}시점 주택·상가 건물기준시가 일괄 계산`
      : `${pointCount}시점 건물기준시가 일괄 계산`);
  // 단독은 상가 구분이 없어 "주택건물"이 아닌 "건물"로 표기(겸용만 주택/상가 구분).
  const housingNoun = enableCommercial ? "주택건물" : "건물";

  function updateRow(idx: number, patch: Partial<PartRow>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function handleCalc() {
    setError(null);
    setResult(null);
    setComputedInput(null);
    // Case A(commercialAcqFirstMode)는 취득·최초공시 상가를 주택 행에서 주입(재일46014-2396)
    // — 주택 행 부재 시 양도 상가만 silent 산출되므로 구성 단계에서 차단.
    if (commercialAcqFirstMode && !rows.some((r) => r.category === "housing")) {
      setError(
        "취득·최초공시 상가분은 당시 실제 용도(주택)의 구조·용도로 산출합니다. " +
          "주택 부분 행이 필요합니다 — \"+ 부분 추가\" 후 주택을 선택하세요. " +
          "주택 행 없이 계산하면 양도시 상가만 산출되어 3시점 환산이 불완전합니다.",
      );
      return;
    }
    const built = Math.floor(parseDecimal(builtYear));
    if (built <= 0) {
      setError("신축연도를 입력하세요.");
      return;
    }
    const at = (sk: string, uno: string) =>
      sk && uno ? { structureKey: sk, usageNo: Number(uno) } : undefined;
    const parts: PhdBatchPart[] = [];
    for (const r of rows) {
      const area = parseDecimal(r.floorArea);
      const transfer = at(r.transferStructureKey, r.transferUsageNo);
      if (!transfer || area <= 0) {
        setError("각 부분의 양도당시 구조·용도·연면적을 입력하세요.");
        return;
      }
      // 취득·최초공시 구조·용도는 주택 부분에서만(상가는 UI 숨김 → Case A 자동주입/Case B 미산출).
      // 카테고리 전환 시 잔존값 누수 방지.
      const isHousing = r.category === "housing";
      parts.push({
        floorArea: area,
        category: r.category,
        transfer,
        acquisition: isHousing ? at(r.acqStructureKey, r.acqUsageNo) : undefined,
        firstDisclosure: isHousing ? at(r.firstStructureKey, r.firstUsageNo) : undefined,
      });
    }
    // Case A: 취득·최초공시 상가 = 당시 주택 구조·용도(주된 주택 행) 주입 → 자동 산출 활성
    if (commercialAcqFirstMode) {
      const firstHousing = parts.find((p) => p.category === "housing");
      if (firstHousing) {
        for (const p of parts) {
          if (p.category === "commercial") {
            p.acquisition = firstHousing.acquisition;
            p.firstDisclosure = firstHousing.firstDisclosure;
          }
        }
      }
    }
    const pt = (key: StdPricePointSpec["key"]) => {
      const p = points.find((x) => x.key === key);
      if (!p || !p.year) return undefined;
      const land = parseAmount(landPrices[key] ?? "") ?? 0;
      if (land <= 0) return undefined;
      return { year: p.year, landPricePerM2: land };
    };
    // 최초공시 ≤2000 산정기준율 환산용 2001 기준 공시지가 — 취득 ≤2000이면 취득시 공시지가 필드가
    // 2001.1.1 기준(LandPriceLookupField fixedYear=2001)이므로 그 값을 전달. 취득 ≥2001이면 미전달
    // (배치가 unsupported 사유로 안내 — 자동 fallback 금지).
    const acqYear = yearOf("acquisition");
    const lp2001 =
      acqYear != null && acqYear <= 2000 ? (parseAmount(landPrices.acquisition ?? "") ?? 0) : 0;
    try {
      const input: PhdBatchInput = {
        building: { builtYear: built, parts },
        acquisition: pt("acquisition"),
        firstDisclosure: pt("firstDisclosure"),
        transfer: pt("transfer"),
        ...(lp2001 > 0 ? { landPrice2001PerM2: lp2001 } : {}),
      };
      setComputedInput(input);
      setResult(computePhdThreePointStdPrice(input));
    } catch (e) {
      setError(e instanceof Error ? e.message : "계산 실패");
    }
  }

  function handleApplyAll() {
    if (!result) return;
    // 산출 근거 스냅샷 저장(재구성) — 결과탭 「건물 기준시가 계산서」 재유도용. prefix 미주입 시 생략.
    if (snapshotPrefix && computedInput) {
      replaceSnapshotsByPrefix(snapshotPrefix, phdBatchToSnapshots(computedInput, snapshotPrefix));
    }
    // 입력된 시점 공시지가만 외부 섹션으로 되돌려쓰기(빈값은 외부 미변경).
    const lp: NonNullable<MultiPointStdPriceApply["landPrices"]> = {};
    if ((landPrices.acquisition ?? "").trim()) lp.acquisition = landPrices.acquisition;
    if ((landPrices.firstDisclosure ?? "").trim()) lp.firstDisclosure = landPrices.firstDisclosure;
    if ((landPrices.transfer ?? "").trim()) lp.transfer = landPrices.transfer;
    onApply({
      acquisition: result.acquisition,
      firstDisclosure: result.firstDisclosure,
      transfer: result.transfer,
      landPrices: lp,
    });
    setOpen(false);
    setResult(null);
  }

  // 적용 대상 개수 — **호출부가 요구한 시점만** 센다(하드코딩 3시점 아님).
  const computedCount = result
    ? activePoints.flatMap((p) => [result[p.key]?.housing, result[p.key]?.commercial]).filter(
        (v) => v != null,
      ).length
    : 0;

  /**
   * L-4 이식 — 소재지·건축물대장 자동조회 (계획서 §4.5).
   *
   * 종전에는 이 두 블록이 범용 폼 모달(`BuildingStdPriceForm`)에만 있어, 배치로 교체하면
   * 신축연도·연면적 자동채움 경로가 사라졌다. 폼 상태 타입을 그대로 빌려 `buildAddressPatch`를
   * 재사용한다(주소 파싱 재작성 금지 — 단일 소스).
   */
  const [addr, setAddr] = useState<Partial<BuildingStdPriceFormState>>({});
  /** 지번 — 모달에서 검색한 값 우선, 없으면 호출부 주입값(§4.5). */
  const effJibun = addr.addressJibun || jibun;

  /**
   * 건축물대장 patch → 배치 모달 로컬 state 어댑터.
   *
   * 배치의 신축연도·연면적은 로컬 state(`builtYear`·`PartRow.floorArea`)라 폼 patch를 그대로
   * 쓸 수 없다. 구조·용도는 **양도 시점 연도로 조회**한 값이므로 양도 칸에만 넣는다 —
   * 취득·최초공시는 연도 체계가 달라(2001 #21 ↔ 2005 #22 ↔ 2026 #28 = 같은 오피스텔)
   * 자동채움하면 잘못된 지수가 들어간다.
   */
  function applyRegisterPatch(patch: Partial<BuildingStdPriceFormState>) {
    if (patch.builtYear) setBuiltYear(patch.builtYear);
    setRows((rs) =>
      rs.map((r, i) =>
        i === 0
          ? {
              ...r,
              ...(patch.floorArea ? { floorArea: patch.floorArea } : {}),
              ...(patch.transStructureKey ? { transferStructureKey: patch.transStructureKey } : {}),
              ...(patch.transUsageNo ? { transferUsageNo: patch.transUsageNo } : {}),
            }
          : r,
      ),
    );
  }

  // 모달 열 때 현재 위젯 공시지가로 재시드(지연 초기화는 최초 1회뿐 → 신규 입력 stale 방지).
  function handleOpen() {
    setLandPrices(Object.fromEntries(points.map((p) => [p.key, p.landPricePerM2])));
    // 소재지는 상위 화면(자산 카드 ① 기본정보) 값으로 다시 시드 — pnu까지 들어와야
    // 건축물대장 조회가 활성된다. **값이 실제로 있을 때만** 덮는다: 상위가 비어 있는데
    // 시드하면 사용자가 모달에서 직접 검색한 주소가 재오픈 시 지워진다(종전 동작 보존).
    if (initialAddress?.jibun || initialAddress?.road) {
      setAddr(buildAddressPatch(initialAddress));
    }
    // 첫 부분(주택)에 상위 화면 주택 연면적 자동채움(있으면). 사용자 수정 가능.
    // 겸용은 상가 행도 상가 연면적으로 함께 시드 — 상가 런처 진입 후 chip 전환 시
    // 주택 면적이 상가에 남는 혼란 방지(각 행이 자기 자산 면적을 갖고 시작).
    const seed: PartRow[] = [{ ...emptyRow(), floorArea: housingFloorAreaPrefill ?? "" }];
    if (enableCommercial && commercialFloorAreaPrefill)
      seed.push({ ...emptyRow("commercial"), floorArea: commercialFloorAreaPrefill });
    setRows(seed);
    setBuiltYear("");
    setResult(null);
    setComputedInput(null);
    setError(null);
    setOpen(true);
  }

  return (
    <>
      <Button type="button" variant="modalLauncher" size="xs" onClick={handleOpen} data-testid={dataTestId}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[88vh] overflow-y-auto sm:max-w-[min(46rem,calc(100%-2rem))] w-full shadow-2xl"
          overlayClassName="bg-black/60"
          forceOverlay
        >
          <DialogHeader>
            <DialogTitle>{pointCount}시점 건물 기준시가 일괄 계산</DialogTitle>
            <DialogDescription>
              {`같은 건물의 층/구역별 구조·용도·연면적을 입력하면 ${activePoints
                .map((p) => p.label || POINT_LABEL[p.key])
                .join("·")} ${pointCount}시점 건물기준시가를 함께 산출합니다.`}
              {enableCommercial && " 겸용은 주택분 전 시점과 상가분을 함께 냅니다."}{" "}
              계산 후 “모두 적용”을 누르면 각 시점 필드에 채워집니다.
            </DialogDescription>
          </DialogHeader>

          {/* 소재지 + 건축물대장 자동조회 (L-4 이식 — 계획서 §4.5) */}
          <div className="space-y-1.5 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
            <p className="text-sm font-semibold text-rose-700">소재지 (공시지가·건축물대장 조회용)</p>
            <p className="text-caption text-rose-600/90">
              주소를 입력하면 아래 공시지가를 연도별로 자동 조회하고, 건축물대장에서 신축연도·연면적을
              불러올 수 있습니다. 미입력 시 직접 입력하세요.
            </p>
            <AddressSearch
              value={{
                road: addr.addressRoad ?? "",
                jibun: addr.addressJibun ?? "",
                building: addr.buildingName ?? "",
                detail: addr.addressDetail ?? "",
                lng: addr.longitude ?? "",
                lat: addr.latitude ?? "",
                pnu: addr.pnu ?? "",
              }}
              onChange={(v) => setAddr((prev) => ({ ...prev, ...buildAddressPatch(v) }))}
            />
            <BuildingRegisterLookupField
              pnu={addr.pnu ?? ""}
              year={String(yearOf("transfer") ?? "")}
              taxType="transfer"
              disabled={false}
              isCollectiveUnit={!!addr.unitDong || !!addr.unitHo}
              dong={addr.unitDong}
              ho={addr.unitHo}
              onAutoFill={applyRegisterPatch}
            />
            {(!!addr.unitDong || !!addr.unitHo) && (
              <p className="text-caption text-rose-600/90">
                집합건물 세대는 건축물대장 조회 시 전유+공용 연면적이 첫 부분의 연면적으로 자동
                입력됩니다(국세청 「건물 기준시가 계산방법 고시」상 건물면적 기준). 조회되지 않으면
                전유+공용 연면적을 직접 입력하세요.
              </p>
            )}
          </div>

          {/* 신축연도(건물 공통) */}
          <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
            <p className="text-xs font-semibold text-sky-700">건물 정보 ({pointCount}시점 공통)</p>
            <FieldCard label="신축연도" hint="준공연도 4자리">
              <DecimalInput value={builtYear} onChange={setBuiltYear} placeholder="신축연도 (4자리)" />
            </FieldCard>
          </div>

          {/* 부분(층/구역) 목록 */}
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-amber-700">
                {enableCommercial ? "부분(층/구역) — 구조·용도·연면적·구분" : "부분(층/구역) — 구조·용도·연면적"}
              </p>
              <Button type="button" variant="outline" size="xs" onClick={() => setRows((rs) => [...rs, emptyRow(rs.length ? rs[rs.length - 1].category : "housing")])}>
                + 부분 추가
              </Button>
            </div>
            {rows.map((row, idx) => (
              <div key={idx} className="space-y-2 rounded-md border border-amber-200/60 bg-white/50 p-2">
                {(enableCommercial || rows.length > 1) && (
                  <div className="flex items-center justify-between gap-2">
                    {enableCommercial ? (
                      <div className="inline-flex overflow-hidden rounded-md border border-amber-300 text-xs">
                        {(["housing", "commercial"] as const).map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => updateRow(idx, { category: cat })}
                            className={`px-3 py-1 ${row.category === cat ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-800"}`}
                          >
                            {cat === "housing" ? "주택" : "상가"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-caption font-medium text-amber-700">부분 {idx + 1}</span>
                    )}
                    {rows.length > 1 && (
                      <Button type="button" variant="ghost" size="xs" onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}>
                        삭제
                      </Button>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  {/* 취득당시 (취득 연도 체계) — 주택만. 상가 취득·최초공시는 Case A 주택값 자동/Case B 미산출 → 숨김 */}
                  {row.category === "housing" && acqOptionYear != null && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2 space-y-2">
                      <p className="text-caption font-semibold text-amber-700">취득당시 (구조·용도 — {acqOptionYear}년 체계)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <FieldCard label="구조">
                          <BuildingStructureSelect year={acqOptionYear} value={row.acqStructureKey} onChange={(v) => updateRow(idx, { acqStructureKey: v })} />
                        </FieldCard>
                        <FieldCard label="용도">
                          <BuildingUsageSelect year={acqOptionYear} value={row.acqUsageNo} onChange={(v) => updateRow(idx, { acqUsageNo: v })} />
                        </FieldCard>
                      </div>
                    </div>
                  )}
                  {/* 최초공시 (최초공시 연도 체계) — 주택만(상가 사유 위와 동일) */}
                  {row.category === "housing" && firstOptionYear != null && (
                    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2 space-y-2">
                      <p className="text-caption font-semibold text-violet-700">최초공시 (구조·용도 — {firstOptionYear}년 체계)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <FieldCard label="구조">
                          <BuildingStructureSelect year={firstOptionYear} value={row.firstStructureKey} onChange={(v) => updateRow(idx, { firstStructureKey: v })} />
                        </FieldCard>
                        <FieldCard label="용도">
                          <BuildingUsageSelect year={firstOptionYear} value={row.firstUsageNo} onChange={(v) => updateRow(idx, { firstUsageNo: v })} />
                        </FieldCard>
                      </div>
                    </div>
                  )}
                  {/* 양도당시 (양도 연도 체계) — 항상 */}
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 space-y-2">
                    <p className="text-caption font-semibold text-emerald-700">양도당시 (구조·용도 — {transferOptionYear}년 체계)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <FieldCard label="구조">
                        <BuildingStructureSelect year={transferOptionYear} value={row.transferStructureKey} onChange={(v) => updateRow(idx, { transferStructureKey: v })} />
                      </FieldCard>
                      <FieldCard label="용도">
                        <BuildingUsageSelect year={transferOptionYear} value={row.transferUsageNo} onChange={(v) => updateRow(idx, { transferUsageNo: v })} />
                      </FieldCard>
                    </div>
                  </div>
                  {/* 연면적 — 상위 폼이 단일 입력 자리인 호출부(GB·CB)에서는 **행 1개일 때만** 숨긴다.
                      층/구역을 나눈 뒤에는 행마다 자기 연면적이 필요하다(상위엔 전체 연면적 하나뿐). */}
                  {hideFloorAreaInput && rows.length === 1 ? (
                    !(parseDecimal(row.floorArea) > 0) && (
                      <p className="rounded-md bg-amber-100/60 px-2.5 py-1.5 text-caption text-amber-800">
                        연면적이 비어 있습니다 — ① 기본정보 「면적·규모」에서 입력하면 이 계산기에 자동 반영됩니다.
                      </p>
                    )
                  ) : (
                    <FieldCard label="연면적" unit="㎡">
                      <DecimalInput value={row.floorArea} onChange={(v) => updateRow(idx, { floorArea: v })} placeholder="연면적" />
                    </FieldCard>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 시점별 공시지가 */}
          <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
            <p className="text-xs font-semibold text-violet-700">위치지수 산정 공시지가</p>
            {points.map((p) => {
              // 공시지가 기준연도 — 고시 체계 연도(`year`)와 별개 축(landPriceYear 주석 참조).
              const lpYear = p.landPriceYear ?? p.year;
              // 취득시 ≤2000 = 2001.1.1 기준(§164⑤ 산정기준율) → Vworld 2001 자동조회 행
              const isAcqPre2001 =
                p.key === "acquisition" && p.year != null && p.year <= 2000;
              // 조회 필드로 열 연도 — pre2001은 2001 고정, 그 외는 호출부가 켠 시점만.
              const lookupYear = isAcqPre2001 ? 2001 : p.lookupLandPrice ? lpYear : undefined;
              if (lookupYear != null) {
                return (
                  <div key={p.key} className="space-y-2 rounded-lg border bg-card px-4 py-3">
                    {/* 시점 식별 라벨 — 박스 내부 상단(최초공시일 FieldCard와 동일 위치·스타일).
                        「기준」은 연도가 **법정 고정**인 §164⑤ 2001 행에만 붙인다 — 일반 조회 행은
                        아래 FieldCard 행과 같은 문구여야 시점 라벨이 위젯 종류에 흔들리지 않는다. */}
                    <p className="text-sm font-medium leading-tight">
                      {labelOf(p.key)} ({lookupYear}년{isAcqPre2001 ? " 기준" : ""}) 공시지가
                    </p>
                    {p.landPriceHint && !isAcqPre2001 && (
                      <p className="text-caption text-muted-foreground">{p.landPriceHint}</p>
                    )}
                    <LandPriceLookupField
                      fixedYear={lookupYear}
                      hideLandStdPrice
                      jibun={effJibun}
                      pricePerSqm={landPrices[p.key] ?? ""}
                      onPricePerSqmChange={(v) =>
                        setLandPrices((s) => ({ ...s, [p.key]: v }))
                      }
                      placeholder={isAcqPre2001 ? "2001.1.1. 현재 공시지가" : "원/㎡"}
                    />
                  </div>
                );
              }
              // 최초공시 ≤2000: 건물분은 2001 기준시가 × 산정기준율 환산(§164⑤ 준용) —
              // 이 연도 공시지가는 토지분·외부 3시점 섹션용(건물 산출 미사용) 안내.
              const isFirstPre2001 =
                p.key === "firstDisclosure" && p.year != null && p.year <= 2000;
              return (
                <FieldCard
                  key={p.key}
                  label={`${labelOf(p.key)}${
                    lpYear ? ` (${lpYear}년)` : " (연도 미상)"
                  } 공시지가`}
                  unit="원/㎡"
                  hint={
                    !p.year
                      ? // 어디를 채워야 하는지 알려준다 — 종전 문구는 "계산 제외"만 알리고 해소
                        // 방법을 숨겨, 겸용주택에서 취득일 2열 중 앞 칸(토지)만 채운 사용자가
                        // 취득 시점이 빠진 것을 알아채지도 고치지도 못했다(계획서 D-C).
                        (
                          <span data-testid="phd-point-excluded-note">
                            해당 시점 날짜 미입력 — 계산 제외
                            {p.key === "acquisition" && (
                              <> (③ 취득 정보의 「건물 취득일」을 입력하면 취득시점도 함께 산출됩니다)</>
                            )}
                          </span>
                        )
                      : isFirstPre2001
                        ? "고시(2001년~) 전 최초공시일의 건물분은 2001년 기준시가 × 산정기준율로 환산 — 이 공시지가는 토지분 계산에 사용"
                        : undefined
                  }
                >
                  <CurrencyInput
                    label=""
                    hideUnit
                    value={landPrices[p.key] ?? ""}
                    onChange={(v) => setLandPrices((s) => ({ ...s, [p.key]: v }))}
                    placeholder="원/㎡"
                  />
                </FieldCard>
              );
            })}
          </div>

          <Button type="button" size="sm" onClick={handleCalc}>
            {pointCount}시점 계산하기
          </Button>

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {result && (
            <div className="space-y-2 border-t pt-3">
              {activePoints.map(({ key: k }) => {
                const pr = result[k];
                return (
                  <div key={k} className="space-y-0.5">
                    <div className="flex justify-between text-sm">
                      <span>{labelOf(k)} {housingNoun} 기준시가</span>
                      <span className="font-mono tabular-nums font-semibold">
                        {pr?.housing != null ? `${fmt(pr.housing)} 원` : "—"}
                      </span>
                    </div>
                    {enableCommercial && (k === "transfer" || commercialAcqFirstMode) && (
                      <div className="flex justify-between text-sm">
                        <span>{labelOf(k)} 상가건물 기준시가</span>
                        <span className="font-mono tabular-nums font-semibold">
                          {pr?.commercial != null ? `${fmt(pr.commercial)} 원` : "—"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              {result.unsupported.map((u, i) => (
                <p key={i} className="rounded bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800">
                  {labelOf(u.point)} {u.category === "commercial" ? "상가건물" : housingNoun} 미산출 — {u.reason}
                </p>
              ))}
              <Button type="button" size="sm" onClick={handleApplyAll} disabled={computedCount === 0}>
                모두 적용 ({computedCount}개)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
