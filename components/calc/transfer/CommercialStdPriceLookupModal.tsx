"use client";

/**
 * CommercialStdPriceLookupModal — 상가·오피스텔 호별 기준시가 자동조회 런처 + 모달.
 *
 * PNU로 국세청 고시분에서 해당 필지의 호 목록을 받아 사용자가 호를 고르면
 * ㎡당 고시가·전용면적·공유면적을 **단일 배치 onChange**로 폼에 채운다.
 *
 * 배치 A(환산, `variant="estimated"`)  : 양도시 + (취득시 | 최초고시 2005) 2시점
 * 배치 B(상속 §164⑥, `variant="inheritance"`): 최초고시 2005-01-01 1시점
 *   ⚠️ 배치 B에는 `cbUnitPriceAtTransfer` 입력이 렌더되지 않으므로 채우지 않는다.
 *
 * 정책:
 *  - 시점별 독립 처리 — `prices[date] === null`이면 그 필드를 채우지 않는다(0 적용 금지).
 *  - 인접 호·유사 면적 자동 대체 금지(`feedback_no_silent_apportion_fallback`).
 *  - `useEffect → store` 미러링 금지 — "적용" 클릭 시에만 onChange.
 *  - 다중키는 **patch 하나로** 전달(`feedback_multikey_patch_stale_spread_overwrite`).
 *
 * UI 설계: docs/02-design/features/commercial-officetel-standard-price-lookup.ui.design.md
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { HorizontalScrollContainer } from "@/components/calc/shared/HorizontalScrollContainer";
import { guessNoticeDate, pickNoticeDate } from "@/lib/stdprice/pick-notice-date";
import { useCommercialStdPriceSnapshotStore } from "@/lib/stores/commercial-stdprice-snapshot-store";
import type {
  CommercialStdPriceResponse,
  CommercialStdPriceUnitEntry,
} from "@/app/api/address/commercial-standard-price/route";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  variant: "estimated" | "inheritance";
}

/** 조회 시점 1개 — 기준일과 확정 고시일자. */
interface TimePoint {
  id: "firstOrAcq" | "transfer";
  label: string;
  refDate: string;
  noticeDate: string | null;
}

const RENDER_LIMIT = 200;
const SEARCH_THRESHOLD = 200;

export function CommercialStdPriceLookupModal({ asset, onChange, transferDate, variant }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<CommercialStdPriceResponse | null>(null);
  const [points, setPoints] = useState<TimePoint[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [areaOverride, setAreaOverride] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const snapshotKey = `cbsp-${asset.assetId}-${variant === "inheritance" ? "cbinh" : "cb"}`;
  const saveSelection = useCommercialStdPriceSnapshotStore((s) => s.saveSelection);
  const savedSelection = useCommercialStdPriceSnapshotStore((s) => s.selections[snapshotKey]);

  /** 조회할 기준일 — 배치·`cbEra`에 따라 다르다(UI 설계 §1·§5). */
  const refPoints = useMemo<Omit<TimePoint, "noticeDate">[]>(() => {
    if (variant === "inheritance") {
      return [{ id: "firstOrAcq", label: "최초고시(2005)", refDate: "2005-01-01" }];
    }
    const out: Omit<TimePoint, "noticeDate">[] = [];
    if (asset.cbEra === "pre_disclosure") {
      out.push({ id: "firstOrAcq", label: "최초고시(2005)", refDate: "2005-01-01" });
    } else if (asset.acquisitionDate) {
      out.push({ id: "firstOrAcq", label: "취득시", refDate: asset.acquisitionDate });
    }
    if (transferDate) out.push({ id: "transfer", label: "양도시", refDate: transferDate });
    return out;
  }, [variant, asset.cbEra, asset.acquisitionDate, transferDate]);

  const runLookup = useCallback(async () => {
    if (!asset.addressPnu || refPoints.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const call = async (dates: string[]) => {
        const q = new URLSearchParams({ pnu: asset.addressPnu!, dates: dates.join(",") });
        const r = await fetch(`/api/address/commercial-standard-price?${q}`);
        return (await r.json()) as CommercialStdPriceResponse;
      };

      // 1차: 기준일 연도의 1/1(전 고시가 1/1 시행). 그 해 고시분이 없으면 응답의
      // availableDates로 직전 고시분을 다시 계산해 1회만 재조회한다(§164③).
      const guessed = refPoints.map((p) => guessNoticeDate(p.refDate)).filter((d): d is string => !!d);
      let body = await call([...new Set(guessed)]);

      const resolved = refPoints.map((p) => pickNoticeDate(body.availableDates, p.refDate));
      const wanted = [...new Set(resolved.filter((d): d is string => !!d))];
      if (wanted.length > 0 && wanted.join(",") !== [...new Set(guessed)].join(",")) {
        body = await call(wanted);
      }

      setRes(body);
      setPoints(refPoints.map((p, i) => ({ ...p, noticeDate: resolved[i] })));
      setShowAll(false);
      setAreaOverride(false);
      // 이전 선택 복원 — 목록에 그대로 있을 때만(임의 대체 금지)
      const restored =
        savedSelection && body.units.some((u) => u.key === savedSelection.unitKey)
          ? savedSelection.unitKey
          : null;
      setSelectedKey(restored);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회에 실패했습니다.");
      setRes(null);
    } finally {
      setLoading(false);
    }
  }, [asset.addressPnu, refPoints, savedSelection]);

  const openModal = () => {
    setOpen(true);
    void runLookup();
  };

  const selected = res?.units.find((u) => u.key === selectedKey) ?? null;

  const filtered = useMemo(() => {
    if (!res) return [];
    const q = search.trim();
    if (!q) return res.units;
    return res.units.filter(
      (u) =>
        u.buildingName.includes(q) ||
        u.ho.includes(q) ||
        u.floor.includes(q) ||
        u.dong.includes(q),
    );
  }, [res, search]);

  const visible = showAll ? filtered : filtered.slice(0, RENDER_LIMIT);

  /** 적용 — 시점별로 값이 있는 필드만, patch 하나로. */
  const apply = () => {
    if (!selected) return;
    const patch: Partial<AssetForm> = {};

    for (const p of points) {
      const price = p.noticeDate ? selected.prices[p.noticeDate] : null;
      if (!price) continue;
      if (p.id === "transfer") {
        // 배치 B에는 양도시 입력이 렌더되지 않는다 — 화면에 없는 필드를 채우지 않는다
        if (variant === "estimated") patch.cbUnitPriceAtTransfer = String(price.price);
      } else {
        patch.cbUnitPriceAtFirstOrAcq = String(price.price);
      }
    }

    const area = areaSource(selected, points);
    if (area && (!hasAreaValue(asset) || areaOverride)) {
      patch.cbExclusiveArea = String(area.ea);
      patch.cbSharedArea = String(area.sa);
    }

    if (Object.keys(patch).length > 0) onChange(patch);
    saveSelection(snapshotKey, { unitKey: selected.key, label: unitLabel(selected) });
    setOpen(false);
  };

  const disabledReasonText = !asset.addressPnu
    ? "소재지를 다시 선택하면 조회할 수 있습니다"
    : refPoints.length === 0
      ? "취득일·양도일을 입력하면 조회할 수 있습니다"
      : undefined;

  const area = selected ? areaSource(selected, points) : null;
  const areaConflict =
    !!area && hasAreaValue(asset) && (asset.cbExclusiveArea !== String(area.ea) || asset.cbSharedArea !== String(area.sa));
  const filledCount = points.filter(
    (p) => p.noticeDate && selected?.prices[p.noticeDate],
  ).length;

  return (
    <>
      <Button
        type="button"
        variant="modalLauncher"
        size="xs"
        disabled={!!disabledReasonText}
        title={disabledReasonText}
        data-testid="cb-stdprice-lookup-open"
        onClick={openModal}
      >
        호별 고시가 조회
      </Button>
      {disabledReasonText && (
        <p className="text-caption text-muted-foreground">{disabledReasonText}</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[88vh] overflow-y-auto sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full shadow-2xl"
          overlayClassName="bg-black/60"
          forceOverlay
        >
          <DialogHeader>
            <DialogTitle>호별 고시가 조회</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <ToneCard tone="sky" title="조회 대상" noDark>
              <p className="text-xs text-sky-800">
                {asset.addressJibun || asset.addressRoad || "소재지 미상"}
              </p>
              <p className="text-caption text-sky-700">
                {points.length > 0
                  ? points
                      .map((p) => `${p.label} ${p.noticeDate ?? "고시분 없음"}`)
                      .join(" · ")
                  : "조회 시점을 계산하는 중…"}
              </p>
            </ToneCard>

            <StatusBox loading={loading} error={error} res={res} points={points} />

            {res && res.units.length > 0 && (
              <ToneCard tone="emerald" sectionNum="1" title="호 목록" noDark>
                {filtered.length > SEARCH_THRESHOLD && (
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="건물명·동·층·호로 좁히기"
                    className="w-full rounded border border-emerald-200 px-2 py-1 text-xs"
                  />
                )}
                <HorizontalScrollContainer hint="← → 좌우 스크롤">
                  <div
                    ref={listRef}
                    role="radiogroup"
                    aria-label="호 목록"
                    className="min-w-[36rem]"
                    onKeyDown={(e) => handleListKeyDown(e, visible, selectedKey, setSelectedKey)}
                  >
                    <div className="grid grid-cols-[1fr_5rem_5rem_4rem_5rem_5rem_4rem] gap-x-2 border-b border-emerald-200 pb-1 text-caption font-medium text-emerald-700">
                      <span>건물명</span>
                      <span>동</span>
                      <span>층</span>
                      <span>호</span>
                      <span className="text-right">전용㎡</span>
                      <span className="text-right">공유㎡</span>
                      <span>구분</span>
                    </div>
                    {visible.map((u) => {
                      const first = firstPrice(u);
                      const isSel = u.key === selectedKey;
                      return (
                        <button
                          key={u.key}
                          type="button"
                          role="radio"
                          aria-checked={isSel}
                          data-testid={`cb-stdprice-unit-${fcCode(u.floorClass)}__${u.floor}__${u.ho}`}
                          onClick={() => setSelectedKey(u.key)}
                          className={`grid w-full grid-cols-[1fr_5rem_5rem_4rem_5rem_5rem_4rem] gap-x-2 rounded px-1 py-1 text-left text-xs ${
                            isSel ? "bg-emerald-100 ring-1 ring-emerald-300" : "hover:bg-emerald-50"
                          }`}
                        >
                          <span className="truncate">
                            {u.buildingName || "—"}
                            {u.linkedBy === "position" && (
                              <span className="ml-1 rounded bg-amber-100 px-1 text-micro text-amber-800">
                                표기 상이
                              </span>
                            )}
                            {u.ambiguous && (
                              <span className="ml-1 rounded bg-rose-100 px-1 text-micro text-rose-800">
                                중복
                              </span>
                            )}
                          </span>
                          <span className="truncate">{u.dong || "—"}</span>
                          <span>
                            {u.floorClass} {u.floor}층
                          </span>
                          <span>{u.ho}</span>
                          <span className="text-right font-mono tabular-nums whitespace-nowrap">
                            {first ? first.ea.toLocaleString() : "—"}
                          </span>
                          <span className="text-right font-mono tabular-nums whitespace-nowrap">
                            {first ? first.sa.toLocaleString() : "—"}
                          </span>
                          <span>{u.kind}</span>
                        </button>
                      );
                    })}
                  </div>
                </HorizontalScrollContainer>
                {!showAll && filtered.length > RENDER_LIMIT && (
                  <Button type="button" variant="modalLauncher" size="xs" onClick={() => setShowAll(true)}>
                    나머지 {(filtered.length - RENDER_LIMIT).toLocaleString()}건 더 보기
                  </Button>
                )}
              </ToneCard>
            )}

            {selected && (
              <ToneCard tone="amber" sectionNum="2" title="선택한 호 — 시점별 고시가" noDark>
                <p className="text-caption text-amber-700">{unitLabel(selected)}</p>
                {selected.linkedBy === "position" && selected.buildingNameByDate && (
                  <p className="text-caption text-amber-800">
                    건물명 표기가 시점마다 다릅니다 —{" "}
                    {Object.entries(selected.buildingNameByDate)
                      .map(([d, n]) => `${d.slice(0, 4)}년 "${n}"`)
                      .join(" · ")}
                    . 동·층·호가 일치해 같은 물건으로 연결했습니다. 확인해 주세요.
                  </p>
                )}
                <div className="space-y-1">
                  {points.map((p) => {
                    const price = p.noticeDate ? selected.prices[p.noticeDate] : null;
                    return (
                      <div key={p.id} className="grid grid-cols-[6rem_7rem_1fr_6rem] gap-2 text-xs">
                        <span className="text-amber-700">{p.label}</span>
                        <span className="text-muted-foreground">{p.noticeDate ?? "—"}</span>
                        <span className="text-right font-mono tabular-nums whitespace-nowrap">
                          {price ? `${price.price.toLocaleString()} 원/㎡` : "해당 고시분에 이 호가 없습니다"}
                        </span>
                        <span className="text-right font-mono tabular-nums whitespace-nowrap">
                          {price ? `${price.ea.toLocaleString()} ㎡` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {areaConflict && (
                  <div className="space-y-1 rounded border border-amber-300 bg-amber-50 p-2 text-caption text-amber-900">
                    이미 입력된 면적(전용 {asset.cbExclusiveArea} · 공유 {asset.cbSharedArea})이 조회값과
                    다릅니다. 기본적으로 덮어쓰지 않습니다.
                    <div>
                      <Button
                        type="button"
                        variant="modalLauncher"
                        size="xs"
                        onClick={() => setAreaOverride(true)}
                        disabled={areaOverride}
                      >
                        {areaOverride ? "조회값으로 덮어씁니다" : "조회값으로 덮어쓰기"}
                      </Button>
                    </div>
                  </div>
                )}
                <p className="text-caption text-muted-foreground">
                  대지면적은 고시 자료에 없습니다 — 등기부에서 직접 입력하세요.
                </p>
                {variant === "inheritance" && (
                  <p className="text-caption text-amber-800">
                    §164⑥ 적용에는 <b>대지면적 · 취득시·최초고시 개별공시지가 · 취득시·최초고시 건물
                    기준시가</b>를 추가로 입력해야 합니다. 일부만 입력하면 계산이 차단됩니다.
                  </p>
                )}
              </ToneCard>
            )}
          </div>

          <DialogFooter>
            {selected && filledCount < points.length && (
              <p className="text-caption text-amber-700">
                {points.length}개 시점 중 {filledCount}개만 채워집니다
              </p>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!selected || filledCount === 0}
              data-testid="cb-stdprice-apply"
              onClick={apply}
            >
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusBox({
  loading,
  error,
  res,
  points,
}: {
  loading: boolean;
  error: string | null;
  res: CommercialStdPriceResponse | null;
  points: TimePoint[];
}) {
  let message: string | null = null;
  let tone: "rose" | "amber" | "sky" = "sky";

  if (loading) message = "조회 중…";
  else if (error) {
    message = error;
    tone = "rose";
  } else if (res) {
    if (res.parcelReason === "unjoinable_parcel") {
      message = "이 지번은 고시 자료 형식상 자동조회할 수 없습니다 — 수기 입력하세요";
      tone = "amber";
    } else if (res.parcelReason === "invalid_pnu") {
      message = "소재지를 다시 선택해 주세요";
      tone = "rose";
    } else if (res.parcelReason === "data_unavailable") {
      message = res.error ?? "기준시가 데이터가 준비되지 않았습니다";
      tone = "amber";
    } else if (res.units.length === 0) {
      const statuses = points.map((p) => (p.noticeDate ? res.dateStatus[p.noticeDate] : "no_notice"));
      message = statuses.every((s) => s === "no_notice" || s === undefined)
        ? "미고시 물건입니다 — 수기 입력하세요"
        : statuses.some((s) => s === "partial_data")
          ? "해당 연도 자료가 아직 확보되지 않았습니다"
          : statuses.some((s) => s === "partition_missing")
            ? "해당 연도 자료가 준비되지 않았습니다"
            : "미고시 물건입니다 — 수기 입력하세요";
      tone = "amber";
    }
  }

  if (!message) return null;
  return (
    <ToneCard tone={tone} noDark>
      <p className="text-xs" data-testid="cb-stdprice-status">
        {message}
      </p>
    </ToneCard>
  );
}

/** 면적 출처 — 양도시 고시분 우선(환산 분모가 양도시 호별총액이므로). 없으면 다른 시점. */
function areaSource(
  u: CommercialStdPriceUnitEntry,
  points: readonly TimePoint[],
): { ea: number; sa: number } | null {
  const ordered = [...points].sort((a, b) => (a.id === "transfer" ? -1 : b.id === "transfer" ? 1 : 0));
  for (const p of ordered) {
    const price = p.noticeDate ? u.prices[p.noticeDate] : null;
    if (price) return { ea: price.ea, sa: price.sa };
  }
  return null;
}

function firstPrice(u: CommercialStdPriceUnitEntry): { price: number; ea: number; sa: number } | null {
  for (const v of Object.values(u.prices)) if (v) return v;
  return null;
}

function hasAreaValue(asset: AssetForm): boolean {
  return !!(asset.cbExclusiveArea?.trim() || asset.cbSharedArea?.trim());
}

function unitLabel(u: CommercialStdPriceUnitEntry): string {
  return `${u.buildingName || "건물명 없음"} ${u.dong || ""} ${u.floorClass} ${u.floor}층 ${u.ho}호`.replace(
    /\s+/g,
    " ",
  );
}

function fcCode(label: "지하" | "지상" | "옥탑"): 1 | 4 | 5 {
  return label === "지하" ? 1 : label === "옥탑" ? 5 : 4;
}

/** 목록 키보드 이동 — ↑↓로 선택 이동(Enter/Space는 button 기본 동작이 처리). */
function handleListKeyDown(
  e: React.KeyboardEvent,
  visible: readonly CommercialStdPriceUnitEntry[],
  selectedKey: string | null,
  setSelectedKey: (k: string) => void,
) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  if (visible.length === 0) return;
  const idx = visible.findIndex((u) => u.key === selectedKey);
  const next =
    e.key === "ArrowDown"
      ? Math.min(visible.length - 1, idx + 1)
      : Math.max(0, (idx === -1 ? 0 : idx) - 1);
  const target = visible[next];
  if (!target) return;
  setSelectedKey(target.key);
  const el = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(
    `[data-testid="cb-stdprice-unit-${fcCode(target.floorClass)}__${target.floor}__${target.ho}"]`,
  );
  el?.focus();
}
