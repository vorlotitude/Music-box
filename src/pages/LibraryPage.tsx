import { useMemo, useState } from "react";
import styled from "styled-components";
import { FolderPlus, Plus, Search, Trash2, Play } from "lucide-react";
import { useApp } from "../state/useApp";
import { bridge } from "../bridge";
import { controllerRef } from "../state/AppProvider";
import { PageHeader, Title, Subtitle, Card, Button, Row, Muted } from "../components/ui";
import type { AudioAsset } from "@core/library/AudioAsset";

export function LibraryPage() {
  const assets = useApp((s) => s.assets);
  const importFiles = useApp((s) => s.importFiles);
  const removeAsset = useApp((s) => s.removeAsset);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | AudioAsset["category"]>("all");

  const list = useMemo(() => {
    let l = assets;
    if (filter !== "all") l = l.filter((a) => a.category === filter);
    if (q.trim()) l = l.filter((a) => a.title.toLowerCase().includes(q.toLowerCase()));
    return [...l].sort((a, b) => b.addedAt - a.addedAt);
  }, [assets, q, filter]);

  const countByCategory = (c: AudioAsset["category"]) => assets.filter((a) => a.category === c).length;

  const onImport = async () => {
    const files = await bridge.openAudioFiles();
    if (files.length) await importFiles(files);
  };

  const onImportFolder = async () => {
    const dir = await bridge.pickDirectory();
    if (!dir) return;
    // Folder import resolves paths in main before files arrive; MVP uses single-file dialog.
    await importFiles([]);
  };

  return (
    <div>
      <PageHeader>
        <div>
          <Title>Library</Title>
          <Subtitle>Your local audio — music, SFX, voice. Only local file references are stored; nothing is uploaded.</Subtitle>
        </div>
        <Row>
          <Button variant="ghost" onClick={onImportFolder}><FolderPlus />Folder</Button>
          <Button onClick={onImport}><Plus />Import Files</Button>
        </Row>
      </PageHeader>

      <Toolbar>
        <SearchBox>
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your library…" />
        </SearchBox>
        <Chips>
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>All ({assets.length})</Chip>
          <Chip active={filter === "music"} onClick={() => setFilter("music")}>Music ({countByCategory("music")})</Chip>
          <Chip active={filter === "sfx"} onClick={() => setFilter("sfx")}>SFX ({countByCategory("sfx")})</Chip>
          <Chip active={filter === "voice"} onClick={() => setFilter("voice")}>Voice ({countByCategory("voice")})</Chip>
          <Chip active={filter === "imported"} onClick={() => setFilter("imported")}>Imported ({countByCategory("imported")})</Chip>
        </Chips>
      </Toolbar>

      <Card>
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Artist</th>
              <th>Tags</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td>
                  <TitleTd>
                    <PlayBtn onClick={() => quickPlay(a.id)}><Play size={13} /></PlayBtn>
                    <span className="nowrap">{a.title}</span>
                  </TitleTd>
                </td>
                <td><Muted>{a.category}</Muted></td>
                <td><Muted>{a.artist || "—"}</Muted></td>
                <td><Tags>{a.tags.length ? a.tags.map((t) => <Tag key={t}>{t}</Tag>) : <Muted>—</Muted>}</Tags></td>
                <td><IconBtn danger onClick={() => removeAsset(a.id)}><Trash2 size={14} /></IconBtn></td>
              </tr>
            ))}
          </tbody>
        </Table>
        {list.length === 0 && <Empty>Library is empty. Import your local music or audio files to get started.</Empty>}
      </Card>
    </div>
  );

  async function quickPlay(id: string) {
    const ra = controllerRef.current?.resolveAsset(id);
    if (!ra) return;
    await controllerRef.current?.audio.play([{ action: { type: "PLAY_AUDIO", assetId: ra.mediaUrl }, priority: 50 }]);
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

const PlayBtn = styled.button`
  width: 28px; height: 28px; border-radius: 50%; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.accent};
  display: grid; place-items: center; transition: all .15s;
  &:hover { background: ${({ theme }) => theme.accent}; color: #fff; }
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