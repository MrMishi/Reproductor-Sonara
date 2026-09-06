import React from "react";
import { Play, HardDrive, Heart, Trash2 } from "lucide-react";
import { Track } from "../types";

interface HomeViewProps {
  tracks: Track[];
  currentTrackId?: string;
  isPlaying: boolean;
  onPlayTrack: (track: Track, index: number) => void;
  onOpenScanner: () => void;
  onOpenLyricsSearchForTrack: (track: Track) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteTrack?: (track: Track) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  tracks,
  currentTrackId,
  isPlaying,
  onPlayTrack,
  onOpenScanner,
  onToggleFavorite,
  onDeleteTrack,
}) => {
  // Group albums
  const albumsMap = new Map<string, Track[]>();
  tracks.forEach((t) => {
    const alb = t.album || "Álbum Desconocido";
    if (!albumsMap.has(alb)) albumsMap.set(alb, []);
    albumsMap.get(alb)!.push(t);
  });
  const albumsList = Array.from(albumsMap.entries()).slice(0, 8);

  // Group artists
  const artistsMap = new Map<string, Track[]>();
  tracks.forEach((t) => {
    const art = t.artist || "Artista Desconocido";
    if (!artistsMap.has(art)) artistsMap.set(art, []);
    artistsMap.get(art)!.push(t);
  });
  const artistsList = Array.from(artistsMap.entries()).slice(0, 8);

  return (
    <div className="flex flex-col gap-6 sm:gap-8 pb-8 sm:pb-12">
      {/* Quick Picks (Selecciones Rápidas) */}
      <section className="flex flex-col gap-3.5 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[11px] sm:text-xs uppercase tracking-wider font-bold opacity-60">Empieza a escuchar</span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight" style={{ color: "var(--color-text-primary)" }}>
              Selecciones rápidas
            </h2>
          </div>
          <button
            onClick={onOpenScanner}
            className="text-xs font-semibold flex items-center gap-1.5 opacity-80 hover:opacity-100 hover:underline self-start sm:self-auto py-1"
            style={{ color: "var(--color-accent)" }}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Añadir canciones del dispositivo</span>
          </button>
        </div>

        {/* 4-column / 2-column / 1-column Grid of Quick Pick cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
          {tracks.slice(0, 8).map((track, idx) => {
            const isCurrent = track.id === currentTrackId;

            return (
              <div
                key={track.id}
                id={`quick-pick-${track.id}`}
                onClick={() => onPlayTrack(track, idx)}
                className={`flex items-center gap-3 sm:gap-3.5 p-3 sm:p-2.5 rounded-2xl sm:rounded-xl cursor-pointer transition-all border group relative overflow-hidden ${
                  isCurrent
                    ? "bg-white/15 border-white/20 shadow-md"
                    : "hover:bg-white/10 border-white/5"
                }`}
                style={{
                  backgroundColor: isCurrent ? "rgba(255,255,255,0.12)" : "var(--color-surface, #141414)",
                  borderColor: "var(--color-border-subtle)",
                }}
              >
                {/* Artwork with play overlay */}
                <div className="relative w-14 h-14 sm:w-13 sm:h-13 rounded-xl sm:rounded-lg overflow-hidden shrink-0 shadow">
                  <img
                    src={track.coverUrl}
                    alt={track.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div
                    className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                      isCurrent && isPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md"
                      style={{ backgroundColor: "var(--color-accent, #FF0000)" }}
                    >
                      {isCurrent && isPlaying ? (
                        <div className="w-3 h-3 flex items-center justify-center font-mono text-[10px]">❚❚</div>
                      ) : (
                        <Play className="w-4 h-4 fill-white ml-0.5" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1 pr-1">
                  <h4
                    className="text-xs sm:text-sm font-bold truncate leading-snug"
                    style={{ color: isCurrent ? "var(--color-accent)" : "var(--color-text-primary)" }}
                  >
                    {track.title}
                  </h4>
                  <p className="text-[11px] sm:text-xs truncate opacity-70 mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                    {track.artist}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Like trigger */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(track.id);
                    }}
                    title={track.isFavorite ? "Quitar de favoritas" : "Marcar como favorita"}
                    className="p-2 sm:p-1.5 rounded-full hover:bg-white/10 transition-transform opacity-90 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        track.isFavorite ? "fill-red-500 text-red-500 opacity-100" : "text-neutral-400"
                      }`}
                    />
                  </button>

                  {/* Delete trigger */}
                  {onDeleteTrack && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTrack(track);
                      }}
                      title="Eliminar del reproductor"
                      className="p-2 sm:p-1.5 rounded-full hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-transform opacity-90 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Device Albums Carousel */}
      {albumsList.length > 0 && (
        <section className="flex flex-col gap-4">
          <div>
            <span className="text-xs uppercase tracking-wider font-bold opacity-60">Colecciones locales</span>
            <h2 className="text-xl font-black tracking-tight" style={{ color: "var(--color-text-primary)" }}>
              Álbumes en tu dispositivo
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {albumsList.map(([albumName, albumTracks]) => {
              const firstTrack = albumTracks[0];
              return (
                <div
                  key={albumName}
                  id={`album-card-${albumName}`}
                  onClick={() => onPlayTrack(firstTrack, tracks.indexOf(firstTrack))}
                  className="flex flex-col gap-2 p-3 rounded-2xl border cursor-pointer transition-all hover:scale-[1.02] group"
                  style={{
                    backgroundColor: "var(--color-surface, #141414)",
                    borderColor: "var(--color-border-subtle)",
                  }}
                >
                  <div className="relative aspect-square rounded-xl overflow-hidden shadow-md">
                    <img
                      src={firstTrack.coverUrl}
                      alt={albumName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg"
                        style={{ backgroundColor: "var(--color-accent)" }}
                      >
                        <Play className="w-5 h-5 fill-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h5 className="text-xs sm:text-sm font-bold truncate">{albumName}</h5>
                    <p className="text-[11px] opacity-60 truncate">
                      {albumTracks.length} {albumTracks.length === 1 ? "canción" : "canciones"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Artists Avatar Row */}
      {artistsList.length > 0 && (
        <section className="flex flex-col gap-4">
          <div>
            <span className="text-xs uppercase tracking-wider font-bold opacity-60">Descubrimiento</span>
            <h2 className="text-xl font-black tracking-tight" style={{ color: "var(--color-text-primary)" }}>
              Artistas detectados
            </h2>
          </div>

          <div className="flex items-center gap-5 overflow-x-auto pb-2 no-scrollbar">
            {artistsList.map(([artistName, artistTracks]) => {
              const firstTrack = artistTracks[0];
              return (
                <div
                  key={artistName}
                  id={`artist-circle-${artistName}`}
                  onClick={() => onPlayTrack(firstTrack, tracks.indexOf(firstTrack))}
                  className="flex flex-col items-center gap-2 cursor-pointer group shrink-0 w-24 text-center"
                >
                  <div
                    className="relative w-20 h-20 rounded-full overflow-hidden shadow-lg border-2 border-transparent transition-all group-hover:scale-105"
                    style={{ borderColor: "transparent" }}
                  >
                    <img
                      src={firstTrack.coverUrl}
                      alt={artistName}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <span className="text-xs font-bold truncate w-full group-hover:underline">
                    {artistName}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
