import { type HTMLAttributes, type ReactNode, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCardOrder } from '../../hooks/use-card-order';

export interface SortableSection {
  id: string;
  render: (dragHandleProps: HTMLAttributes<HTMLButtonElement>) => ReactNode;
}

interface SortableCardListProps {
  pageKey: string;
  sections: SortableSection[];
  className?: string;
}

function SortableItem({
  id,
  render,
}: {
  id: string;
  render: (dragHandleProps: HTMLAttributes<HTMLButtonElement>) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 10 : ('auto' as const),
  };

  return (
    <div ref={setNodeRef} style={style}>
      {render({ ...attributes, ...listeners } as HTMLAttributes<HTMLButtonElement>)}
    </div>
  );
}

export default function SortableCardList({
  pageKey,
  sections,
  className,
}: SortableCardListProps) {
  const defaultOrder = useMemo(() => sections.map((s) => s.id), [sections]);

  const { orderedIds, setOrderedIds } = useCardOrder(pageKey, defaultOrder);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sectionMap = useMemo(() => {
    const map = new Map<string, SortableSection['render']>();
    for (const s of sections) {
      map.set(s.id, s.render);
    }
    return map;
  }, [sections]);

  // Filter to only IDs that exist in current sections
  const visibleIds = useMemo(
    () => orderedIds.filter((id) => sectionMap.has(id)),
    [orderedIds, sectionMap],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = visibleIds.indexOf(active.id as string);
      const newIndex = visibleIds.indexOf(over.id as string);
      const newOrder = [...visibleIds];
      newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, active.id as string);
      setOrderedIds(newOrder);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={visibleIds}
        strategy={verticalListSortingStrategy}
      >
        <div className={className}>
          {visibleIds.map((id) => {
            const renderFn = sectionMap.get(id);
            if (!renderFn) return null;
            return <SortableItem key={id} id={id} render={renderFn} />;
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
