import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { FolderPlus, Plus, Search, Trash2, Play, Star, Pencil, X, Music, Film } from "lucide-react";
import { useApp } from "../state/useApp";
import { bridge } from "../bridge";
import { controllerRef } from "../state/AppProvider";
import { PageHeader, Title, Subtitle, Card, Button, Row, Muted } from "../components/ui";
import { LicenseBadge } from "../components/LicenseBadge";
import { useT } from "../i18n";
import type { AudioAsset, AssetCategory } from "@core/library/AudioAsset";
import type { Rule } from "@core/rules/Rule";

type SortKey = "recentAdded" | "recentPlayed" | "mostPlayed" | "title";
/** Category chip filter, plus a favorites-only view (§14). */
type LibraryFilter = "all" | "favorites" | AudioAsset["category"];

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Every asset id referenced by a rule's action (single or grouped). */
function referencedAssetIds(rule: Rule): string[] {
  const action = rule.action;
  return action.type === "PLAY_AUDIO" ? [action.assetId] : (action.assetIds ?? []);
}

/**
 * Cover thumbnail for a track. Resolves the local image path through the
 * privileged `appmedia://` protocol (serves any local file); shows a music
 * glyph placeholder until/unless a cover has been set (§14 "Cover").
 */
function TrackCover({ coverPath, size = 40 }: { coverPath?: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!coverPath) {
      setUrl(null);
      return;
    }
    bridge.toMediaUrl(coverPath).then((u) => {
      if (live) setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [coverPath]);

  if (!coverPath || !url) {
    return (
      <CoverFallback $size={size} data-testid="cover-fallback">
        <Music size={size * 0.5} />
      </CoverFallback>
    );
  }
  return <img data-testid="cover-thumb" src={url} width={size} height={size} alt="" style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />;
}

export function LibraryPage() {
  const t = useT();
  const assets = useApp((s) => s.assets);
  const rules = useApp((s) => s.rules);
  const importFiles = useApp((s) => s.importFiles);
  const importFromVideo = useApp((s) => s.importFromVideo);
  const pushNotice = useApp((s) => s.pushNotice);
  const updateAsset = useApp((s) => s.updateAsset);
  const removeAsset = useApp((s) => s.removeAsset);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [sort, setSort] = useState<SortKey>("recentAdded");
  const [editing, setEditing] = useState<AudioAsset | null>(null);

  const recencyText = (ts: number): string => {
    const mins = Math.max(1, Math.round((Date.now() - ts) / 60_000));
    if (mins < 60) return t("library.minAgo", { n: mins });
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return t("library.hoursAgo", { n: hrs });
    const d = Math.round(hrs / 24);
    return d === 1 ? t("library.yesterday") : t("library.daysAgo", { n: d });
  };

  const usedByCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rules) {
      for (const id of referencedAssetIds(r)) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [rules]);

  const list = useMemo(() => {
    let l = assets;
    if (filter !== "all") {
      l = filter === "favorites" ? l.filter((a) => a.favorite) : l.filter((a) => a.category === filter);
    }
    if (q.trim()) l = l.filter((a) => a.title.toLowerCase().includes(q.toLowerCase()));
    switch (sort) {
      case "recentPlayed":
        return [...l].sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
      case "mostPlayed":
        return [...l].sort((a, b) => b.playCount - a.playCount);
      case "title":
        return [...l].sort((a, b) => a.title.localeCompare(b.title));
      default:
        return [...l].sort((a, b) => b.addedAt - a.addedAt);
    }
  }, [assets, rules, q, filter, sort]);

  const countByCategory = (c: AudioAsset["category"] | "favorites") =>
    c === "favorites" ? assets.filter((a) => a.favorite).length : assets.filter((a) => a.category === c).length;

  const onImport = async () => {
    const files = await bridge.openAudioFiles();
    if (files.length) await importFiles(files);
  };

  const onImportFolder = async () => {
    const dir = await bridge.pickDirectory();
    if (!dir) return;
    const files = await bridge.scanDirectory(dir);
    if (files.length) await importFiles(files);
  };

  const onImportVideo = async () => {
    const { ok, failed } = await importFromVideo();
    if (failed.length) {
      pushNotice({
        kind: "error",
        text: t("library.videoImportFail", { names: failed.join(", ") }),
      });
    }
    if (ok > 0) {
      pushNotice({ kind: "info", text: t("library.videoImportOk", { n: ok }) });
    }
  };

  const toggleFavorite = (a: AudioAsset) => updateAsset(a.id, { favorite: !a.favorite });

  return (
    <div>
      <PageHeader>
        <div>
          <Title>{t("library.title")}</Title>
          <Subtitle>{t("library.subtitle")}</Subtitle>
        </div>
        <Row>
          <Button variant="ghost" onClick={onImportFolder}><FolderPlus />{t("library.importFolder")}</Button>
          <Button variant="ghost" onClick={onImportVideo}><Film />{t("library.importVideo")}</Button>
          <Button onClick={onImport}><Plus />{t("library.importFiles")}</Button>
        </Row>
      </PageHeader>

      <Toolbar>
        <SearchBox>
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("library.searchPlaceholder")} />
        </SearchBox>
        <Chips>
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>{t("library.all", { n: assets.length })}</Chip>
          <Chip active={filter === "favorites"} onClick={() => setFilter("favorites")}>{t("library.favorites", { n: countByCategory("favorites") })}</Chip>
          <Chip active={filter === "music"} onClick={() => setFilter("music")}>{t("library.music", { n: countByCategory("music") })}</Chip>
          <Chip active={filter === "sfx"} onClick={() => setFilter("sfx")}>{t("library.sfx", { n: countByCategory("sfx") })}</Chip>
          <Chip active={filter === "voice"} onClick={() => setFilter("voice")}>{t("library.voice", { n: countByCategory("voice") })}</Chip>
          <Chip active={filter === "imported"} onClick={() => setFilter("imported")}>{t("library.imported", { n: countByCategory("imported") })}</Chip>
        </Chips>
        <SortSelect aria-label={t("library.sortAria")} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="recentAdded">{t("library.sortAdded")}</option>
          <option value="recentPlayed">{t("library.sortPlayed")}</option>
          <option value="mostPlayed">{t("library.sortMostPlayed")}</option>
          <option value="title">{t("library.sortAlphabet")}</option>
        </SortSelect>
      </Toolbar>

      <Card>
        <Table>
          <thead>
            <tr>
              <th></th>
              <th>{t("library.hName")}</th>
              <th>{t("library.hCategory")}</th>
              <th>{t("library.hDur")}</th>
              <th>{t("library.hArtist")}</th>
              <th>{t("library.hUsed")}</th>
              <th>{t("library.hTags")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td>
                  <StarBtn $active={a.favorite} onClick={() => toggleFavorite(a)}>
                    <Star size={14} fill={a.favorite ? "currentColor" : "none"} />
                  </StarBtn>
                </td>
                <td>
                  <TitleTd>
                    <TrackCover coverPath={a.coverPath} />
                    <PlayBtn onClick={() => quickPlay(a.id)}><Play size={13} /></PlayBtn>
                    <span className="nowrap">
                      {a.title}
                      <StatLine>
                        {a.lastPlayedAt
                          ? t("library.playedX", { n: a.playCount, recency: recencyText(a.lastPlayedAt) })
                          : t("library.notPlayed")}
                      </StatLine>
                    </span>
                    <LicenseBadge asset={a} />
                  </TitleTd>
                </td>
                <td><Muted>{a.category}</Muted></td>
                <td><Muted>{typeof a.duration === "number" ? fmtDuration(a.duration) : "—"}</Muted></td>
                <td><Muted>{a.artist || "—"}</Muted></td>
                <td><Muted>{usedByCount.get(a.id) ?? 0}</Muted></td>
                <td><Tags>{a.tags.length ? a.tags.map((t) => <Tag key={t}>{t}</Tag>) : <Muted>—</Muted>}</Tags></td>
                <td>
                  <Row style={{ gap: 6 }}>
                    <IconBtn onClick={() => setEditing(a)}><Pencil size={14} /></IconBtn>
                    <IconBtn danger onClick={() => removeAsset(a.id)}><Trash2 size={14} /></IconBtn>
                  </Row>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {list.length === 0 && <Empty>{t("library.empty")}</Empty>}
      </Card>

      {editing && (
        <ModalOverlay onClick={() => setEditing(null)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <div>
              <Title>{t("library.editTitle", { name: editing.title })}</Title>
              <Subtitle>{t("library.editSubtitle", { path: editing.filePath })}</Subtitle>
            </div>
            <CloseBtn onClick={() => setEditing(null)}><X size={16} /></CloseBtn>
          </ModalHeader>

          <ModalBody>
            <RowGrid>
              <Field label={t("library.fTitle")}>
                <TextInput value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </Field>
              <Field label={t("library.fArtist")}>
                <TextInput value={editing.artist || ""} placeholder={t("library.phArtist")} onChange={(e) => setEditing({ ...editing, artist: e.target.value })} />
              </Field>
              <Field label={t("library.fAlbum")}>
                <TextInput value={editing.album || ""} placeholder={t("library.phAlbum")} onChange={(e) => setEditing({ ...editing, album: e.target.value })} />
              </Field>
              <Field label={t("library.fGenre")}>
                <TextInput value={editing.genre || ""} placeholder={t("library.phGenre")} onChange={(e) => setEditing({ ...editing, genre: e.target.value })} />
              </Field>
              <Field label={t("library.fCategory")}>
                <CatSelect value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as AssetCategory })}>
                  <option value="music">{t("library.catMusic")}</option>
                  <option value="sfx">{t("library.catSfx")}</option>
                  <option value="voice">{t("library.catVoice")}</option>
                  <option value="imported">{t("library.catImported")}</option>
                </CatSelect>
              </Field>
              <Field label={t("library.fDefaultVolume", { n: Math.round(editing.volume * 100) })}>
                <Slider
                  type="range" min="0" max="1" step="0.01"
                  value={editing.volume} onChange={(e) => setEditing({ ...editing, volume: Number(e.target.value) })}
                />
              </Field>
              <Field label={t("library.fFadeIn")}>
                <TextInput
                  type="number" min="0" step="100"
                  value={editing.fadeInMs ?? ""}
                  placeholder={t("library.phFade")}
                  onChange={(e) => setEditing({ ...editing, fadeInMs: e.target.value ? Number(e.target.value) : undefined })}
                />
              </Field>
              <Field label={t("library.fFadeOut")}>
                <TextInput
                  type="number" min="0" step="100"
                  value={editing.fadeOutMs ?? ""}
                  placeholder={t("library.phFade")}
                  onChange={(e) => setEditing({ ...editing, fadeOutMs: e.target.value ? Number(e.target.value) : undefined })}
                />
              </Field>
              <Field label={t("library.fCover")}>
                <Row style={{ gap: 6 }}>
                  <TextInput
                    style={{ flex: 1 }}
                    value={editing.coverPath || ""}
                    placeholder={t("library.phCover")}
                    data-testid="cover-path"
                    onChange={(e) => setEditing({ ...editing, coverPath: e.target.value || undefined })}
                  />
                  <Button
                    data-testid="cover-browse"
                    onClick={async () => {
                      const picked = await bridge.pickImage();
                      if (picked) setEditing({ ...editing, coverPath: picked });
                    }}
                  >
                    {t("library.browse")}
                  </Button>
                </Row>
              </Field>
              <Field label={t("library.fTags")}>
                <TextInput
                  value={(editing.tags ?? []).join(", ")}
                  placeholder={t("library.phTags")}
                  onChange={(e) => {
                    const tags = e.target.value.split(/\s*,\s*/).filter((s) => s);
                    setEditing({ ...editing, tags });
                  }}
                />
              </Field>
            </RowGrid>
            <SaveRow>
              <Button variant="ghost" onClick={() => setEditing(null)}>{t("library.cancel")}</Button>
              <Button onClick={async () => {
                await updateAsset(editing.id, {
                  title: editing.title,
                  artist: editing.artist,
                  album: editing.album,
                  genre: editing.genre,
                  category: editing.category,
                  volume: editing.volume,
                  fadeInMs: editing.fadeInMs,
                  fadeOutMs: editing.fadeOutMs,
                  coverPath: editing.coverPath,
                  tags: editing.tags,
                });
                setEditing(null);
              }}>{t("library.saveChanges")}</Button>
            </SaveRow>
          </ModalBody>
        </ModalContent>
      </ModalOverlay>
      )}
    </div>
  );

  async function quickPlay(id: string) {
    const ra = controllerRef.current?.resolveAsset(id);
    if (!ra) return;
    await controllerRef.current?.audio.play([{ action: { type: "PLAY_AUDIO", assetId: ra.mediaUrl }, priority: 50, route: "SELF_ONLY" }]);
  }
}

const Toolbar = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px 16px; gap: 16px; flex-wrap: wrap;
`;

const SearchBox = styled.div`
  display: flex; align-items: center; gap: 8px;
  background: ${({ theme }) => theme.bgElev2}; border: 1px solid ${({ theme }) => theme.border};
  padding: 9px 13px; border-radius: ${({ theme }) => theme.radiusSm}; width: 280px; color: ${({ theme }) => theme.textDim};
  input { background: transparent; border: none; outline: none; color: ${({ theme }) => theme.text}; width: 100%; font-size: 13px; }
`;

const Chips = styled.div`display: flex; gap: 6px; flex-wrap: wrap;`;

const SortSelect = styled.select`
  background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.textSoft};
  border: 1px solid ${({ theme }) => theme.border}; border-radius: ${({ theme }) => theme.radiusSm};
  padding: 8px 11px; font-size: 12px; font-weight: 600; outline: none; cursor: pointer;
`;

const Chip = styled.button<{ active?: boolean }>`
  padding: 6px 13px; border-radius: 99px; font-size: 12px; font-weight: 600;
  background: ${({ theme, active }) => (active ? theme.accent : theme.bgElev2)};
  color: ${({ theme, active }) => (active ? "#fff" : theme.textSoft)};
  border: 1px solid ${({ theme, active }) => (active ? theme.accent : theme.border)};
  transition: all .15s;
`;

const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: 13px;
  th { text-align: left; color: ${({ theme }) => theme.textDim}; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; padding: 8px 12px; border-bottom: 1px solid ${({ theme }) => theme.border}; }
  td { padding: 10px 12px; border-bottom: 1px solid ${({ theme }) => theme.borderSoft}; vertical-align: middle; }
  tr:hover td { background: ${({ theme }) => theme.bgElev2}; }
`;

const TitleTd = styled.div`display: flex; align-items: center; gap: 10px; font-weight: 600;`;

const CoverFallback = styled.div<{ $size: number }>`
  width: ${(p) => p.$size}px; height: ${(p) => p.$size}px; border-radius: 6px; flex-shrink: 0;
  display: grid; place-items: center;
  background: ${({ theme }) => theme.bgElev2};
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.textDim};
`;

const StatLine = styled.div`
  font-size: 11px; font-weight: 400; color: ${({ theme }) => theme.textDim}; margin-top: 2px;
`;

const PlayBtn = styled.button`
  width: 28px; height: 28px; border-radius: 50%; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.accent};
  display: grid; place-items: center; transition: all .15s;
  &:hover { background: ${({ theme }) => theme.accent}; color: #fff; }
`;

const StarBtn = styled.button<{ $active: boolean }>`
  background: none; border: none; padding: 4px; display: grid; place-items: center; cursor: pointer;
  color: ${({ theme, $active }) => ($active ? theme.accentWarm : theme.textDim)};
  opacity: ${({ $active }) => ($active ? 1 : 0.5)};
  transition: all .15s;
  &:hover { opacity: 1; transform: scale(1.15); }
`;

const IconBtn = styled.button<{ danger?: boolean }>`
  background: none; border: none; color: ${({ theme, danger }) => (danger ? theme.danger : theme.textDim)};
  opacity: .6; transition: opacity .15s; &:hover { opacity: 1; }
`;

const Tags = styled.div`display: flex; gap: 4px; flex-wrap: wrap;`;
const Tag = styled.span`
  background: ${({ theme }) => theme.bgElev2}; border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.textSoft}; border-radius: 6px; padding: 1px 6px; font-size: 11px;
`;

const Empty = styled.div`
  padding: 30px; text-align: center; color: ${({ theme }) => theme.textDim}; font-size: 13px;
`;

const ModalOverlay = styled.div`
  position: fixed; inset: 0; z-index: 100; display: grid; place-items: center;
  background: rgba(0, 0, 0, .55); backdrop-filter: blur(2px);
`;
const ModalContent = styled(Card)`
  width: min(620px, 92vw); max-height: 84vh; overflow: auto;
`;
const ModalHeader = styled.div`display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;`;
const CloseBtn = styled.button`
  background: none; border: none; color: ${({ theme }) => theme.textDim}; cursor: pointer; padding: 4px;
  &:hover { color: ${({ theme }) => theme.text}; }
`;
const ModalBody = styled.div`margin-top: 16px;`;
const RowGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px;`;
const FieldLabel = styled.label`display: block; font-size: 11px; color: ${({ theme }) => theme.textDim}; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px;`;
function Field({ label, children }: any) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>;
}
const TextInput = styled.input`
  background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.text};
  border: 1px solid ${({ theme }) => theme.border}; border-radius: ${({ theme }) => theme.radiusSm};
  padding: 9px 11px; font-size: 13px; outline: none; width: 100%;
  &:focus { border-color: ${({ theme }) => theme.accent}; }
`;
const CatSelect = styled.select`
  background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.text};
  border: 1px solid ${({ theme }) => theme.border}; border-radius: ${({ theme }) => theme.radiusSm};
  padding: 9px 11px; font-size: 13px; outline: none; width: 100%;
  &:focus { border-color: ${({ theme }) => theme.accent}; }
`;
const Slider = styled.input`
  width: 100%; accent-color: ${({ theme }) => theme.accent}; cursor: pointer;
`;
const SaveRow = styled.div`display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;`;