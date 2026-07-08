import React, { memo, useRef, useMemo, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTheme } from '../../../theme/useTheme';
import type { Video } from '../../../types';
import { convertFileSrc } from '../../../safe-tauri';
import NovelStatusBadge from './NovelStatusBadge';
import { getTagType } from './tagTypeStore';

interface VirtualVideoGridProps {
  videos: Video[];
  cardSize: number;
  hoveredCardId: string | null;
  selectedCardId: string | null;
  dndHoverId: string | null;
  coverDataUrls: Record<string, string>;
  onCardClick: (videoId: string) => void;
  onCardDoubleClick: (video: Video) => void;
  onContextMenu: (e: React.MouseEvent, video: Video) => void;
  onMouseEnter: (videoId: string) => void;
  onMouseLeave: () => void;
  onDragEnter: (e: React.DragEvent, videoId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent, videoId: string) => void;
  onDrop: (e: React.DragEvent, video: Video) => void;
  styles: any;
}

const VirtualVideoGrid: React.FC<VirtualVideoGridProps> = memo(({
  videos,
  cardSize,
  hoveredCardId,
  selectedCardId,
  dndHoverId,
  coverDataUrls,
  onCardClick,
  onCardDoubleClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  styles: s
}) => {
  const { bg, border, accent, text, status } = useTheme();
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(() => Math.max(1, Math.floor(800 / cardSize) || 4));
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => setColumns(Math.max(1, Math.floor((el.clientWidth) / cardSize) || 1));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cardSize]);
  const clickTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(videos.length / columns),
    getScrollElement: () => parentRef.current,
    estimateSize: () => cardSize + 14, // 卡片高度 + gap
    overscan: 2, // 预渲染额外行以提高滚动性能
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div 
      ref={parentRef} 
      style={{ 
        flex: 1, 
        overflow: 'auto',
        position: 'relative'
      }}
    >
      {/* 虚拟滚动的占位容器 */}
      <div 
        style={{ 
          height: `${rowVirtualizer.getTotalSize()}px`, 
          width: '100%', 
          position: 'relative' 
        }}
      >
        {/* 渲染可见的行 */}
        {virtualRows.map(virtualRow => {
          const startIndex = virtualRow.index * columns;
          const endIndex = Math.min(startIndex + columns, videos.length);
          
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: 14,
                padding: '0 1px'
              }}
            >
              {/* 渲染当前行的卡片 */}
              {Array.from({ length: endIndex - startIndex }, (_, i) => {
                const v = videos[startIndex + i];
                if (!v) return null;
                
                const isHovered = hoveredCardId === v.id;
                const isSelected = selectedCardId === v.id;
                const cardStyle = {
                  ...s.vCard,
                  ...(isHovered ? s.vCardHover : {}),
                  ...(isSelected ? s.vCardSelected : {}),
                  outline: dndHoverId === v.id ? `3px dashed ${accent.deep}` : "none",
                  outlineOffset: -3,
                  transition: "outline 0.15s, box-shadow 0.15s",
                };

                return (
                  <div
                    key={v.id}
                    className="video-card"
                    data-video-id={v.id}
                    style={cardStyle}
                    onClick={() => {
                      const timers = clickTimersRef.current;
                      const existing = timers.get(v.id);
                      if (existing) {
                        clearTimeout(existing);
                        timers.delete(v.id);
                        onCardDoubleClick(v);
                        return;
                      }
                      timers.set(v.id, setTimeout(() => {
                        timers.delete(v.id);
                        onCardClick(v.id);
                      }, 250));
                    }}
                    onDoubleClick={() => {
                      const timers = clickTimersRef.current;
                      const existing = timers.get(v.id);
                      if (existing) { clearTimeout(existing); timers.delete(v.id); }
                      onCardDoubleClick(v);
                    }}
                    onContextMenu={(e) => onContextMenu(e, v)}
                    onMouseEnter={() => onMouseEnter(v.id)}
                    onMouseLeave={onMouseLeave}
                    onDragEnter={(e) => onDragEnter(e, v.id)}
                    onDragOver={onDragOver}
                    onDragLeave={(e) => onDragLeave(e, v.id)}
                    onDrop={(e) => onDrop(e, v)}
                  >
                    {/* 卡片内容 */}
                    <div style={{ padding: '10px', fontSize: '10px', color: text.secondary }}>
                      <div style={{ fontWeight: 500, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.filename}</div>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {v.width && v.height ? (
                          <span className="info-chip"><span className="ic-icon">🎬</span><span className="ic-val">{v.width}×{v.height}</span></span>
                        ) : null}
                        {v.duration > 0 ? (
                          <span className="info-chip"><span className="ic-icon">⏱</span><span className="ic-val">{(v.duration / 60).toFixed(0)}分</span></span>
                        ) : null}
                      </div>
                      {v.format && (
                        <div style={{ position: 'absolute', top: 6, left: 6, padding: '2px 7px', background: 'rgba(0,0,0,0.75)', borderRadius: 4, fontSize: 9, fontWeight: 600, color: accent.primary }}>
                          {v.format}
                        </div>
                      )}
                      {v.favorite && (
                        <span className="info-chip" style={{ position: 'absolute', top: 6, right: 6 }}><span className="ic-icon">⭐</span></span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
});

VirtualVideoGrid.displayName = 'VirtualVideoGrid';

export default VirtualVideoGrid;