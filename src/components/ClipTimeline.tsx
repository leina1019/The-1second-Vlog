import React from "react";
import { VideoClip } from "@/types";
import { ClipItem } from "./ClipItem";
import { motion, AnimatePresence } from "motion/react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

interface ClipTimelineProps {
  clips: VideoClip[];
  onUpdate: (id: string, updates: Partial<VideoClip>) => void;
  onRemove: (id: string) => void;
  onReorder: (newClips: VideoClip[]) => void;
}

export function ClipTimeline({ clips, onUpdate, onRemove, onReorder }: ClipTimelineProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: {
            delay: 250, // Long press (250ms) to start dragging
            tolerance: 5, // Allow slight movement during long press
        },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = clips.findIndex((clip) => clip.id === active.id);
      const newIndex = clips.findIndex((clip) => clip.id === over.id);
      onReorder(arrayMove(clips, oldIndex, newIndex));
    }
  };

  if (clips.length === 0) return null;

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext items={clips.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {clips.map((clip, index) => (
                <motion.div
                  key={clip.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
                  <ClipItem
                    clip={clip}
                    index={index}
                    onUpdate={onUpdate}
                    onRemove={onRemove}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
