import React, { useRef, useState, useEffect, useCallback } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  overscan?: number;
  className?: string;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyPlaceholder?: React.ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export function VirtualList<T>({
  items,
  itemHeight,
  overscan = 5,
  className = '',
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
      setContainerHeight(el.clientHeight || 600);
    };

    updateHeight();
    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateHeight);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateHeight);
    };
  }, [containerRef, handleScroll]);

  if (items.length === 0 && emptyPlaceholder) {
    return (
      <div ref={containerRef as any} className={className}>
        {emptyPlaceholder}
      </div>
    );
  }

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight) + 2 * overscan;
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  return (
    <div
      ref={containerRef as any}
      className={className}
      style={{ overflowY: 'auto', position: 'relative' }}
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
