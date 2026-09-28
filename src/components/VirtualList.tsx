import React, { useRef, useState, useEffect, useCallback } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  overscan?: number;
  className?: string;
  style?: React.CSSProperties;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyPlaceholder?: React.ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export function VirtualList<T>({
  items,
  itemHeight,
  overscan = 5,
  className = '',
  style,
  renderItem,
  emptyPlaceholder,
  scrollRef: externalScrollRef
}: VirtualListProps<T>) {
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalScrollRef || internalRef;
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (el.clientHeight > 0) {
        setContainerHeight(el.clientHeight);
      }
    };

    updateHeight();
    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateHeight);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateHeight());
      ro.observe(el);
    }

    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateHeight);
      if (ro) ro.disconnect();
    };
  }, [containerRef, handleScroll]);

  if (items.length === 0 && emptyPlaceholder) {
    return (
      <div ref={containerRef as any} className={className} style={{ position: 'relative', ...style }}>
        {emptyPlaceholder}
      </div>
    );
  }

  const totalHeight = items.length * itemHeight;
  const safeScrollTop = Math.max(0, scrollTop);
  const startIndex = Math.max(0, Math.floor(safeScrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight) + 2 * overscan;
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  return (
    <div
      ref={containerRef as any}
      className={className}
      style={{ overflowY: 'auto', position: 'relative', ...style }}
    >
      <div style={{ height: totalHeight, width: '100%', position: 'relative' }}>
        <div
          style={{
            transform: `translate3d(0, ${offsetY}px, 0)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map((item, i) => renderItem(item, startIndex + i))}
        </div>
      </div>
    </div>
  );
}
