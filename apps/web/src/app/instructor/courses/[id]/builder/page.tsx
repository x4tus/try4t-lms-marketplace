'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  HelpCircle,
  History,
  Loader2,
  Pencil,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Video,
} from 'lucide-react';
import { CourseStatus, formatDuration, formatVnd, LessonType, Role } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { RoleGuard } from '@/features/auth/role-guard';
import { CourseSettingsModal } from '@/features/course-builder/course-settings-modal';
import { LessonEditorModal } from '@/features/course-builder/lesson-editor-modal';
import type {
  BuilderCourse,
  BuilderLesson,
  BuilderSection,
  MediaStatus,
} from '@/features/course-builder/types';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';

function LessonIcon({ type }: { type: LessonType }) {
  if (type === LessonType.ARTICLE) return <FileText className="h-4 w-4 text-sky-500" />;
  if (type === LessonType.QUIZ) return <HelpCircle className="h-4 w-4 text-amber-500" />;
  return <Video className="h-4 w-4 text-emerald-500" />;
}

function isLessonReady(lesson: BuilderLesson): boolean {
  if (lesson.type === LessonType.VIDEO) return Boolean(lesson.videoStorageKey);
  if (lesson.type === LessonType.ARTICLE) return Boolean(lesson.articleMd && lesson.articleMd.trim().length >= 10);
  if (lesson.type === LessonType.QUIZ) return Boolean(lesson.quiz && lesson.quiz.questions.length > 0);
  return false;
}

interface SortableLessonRowProps {
  lesson: BuilderLesson;
  hasEnrolledStudents: boolean;
  allSections: Array<{ id: string; title: string; index: number }>;
  onEdit: (lesson: BuilderLesson) => void;
  onTogglePreview: (lesson: BuilderLesson) => void;
  onMoveToSection: (lessonId: string, fromSectionId: string, toSectionId: string) => void;
  onDelete: (lesson: BuilderLesson) => void;
}

function SortableLessonRow({
  lesson,
  hasEnrolledStudents,
  allSections,
  onEdit,
  onTogglePreview,
  onMoveToSection,
  onDelete,
}: SortableLessonRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `lesson:${lesson.id}`,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const ready = isLessonReady(lesson);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5 transition-shadow',
        isDragging && 'z-20 opacity-80 shadow-lg ring-2 ring-primary',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Kéo để sắp xếp bài học"
          className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <LessonIcon type={lesson.type} />

        <button
          type="button"
          onClick={() => onEdit(lesson)}
          className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-medium hover:text-primary"
        >
          {lesson.title}
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {lesson.type === LessonType.VIDEO && lesson.videoDurationSec > 0 && (
          <span className="font-mono text-xs text-muted-foreground">
            {formatDuration(lesson.videoDurationSec)}
          </span>
        )}

        {(lesson.versionCount ?? 0) > 0 && (
          <Badge
            variant="outline"
            className="gap-1 font-mono text-[10px] text-primary"
            title={`Có ${lesson.versionCount} phiên bản cũ được lưu song song`}
          >
            <History className="h-3 w-3" /> v{(lesson.versionCount ?? 0) + 1}
          </Badge>
        )}

        <Badge variant={ready ? 'success' : 'warning'} className="text-[10px]">
          {ready ? 'Đã có nội dung' : 'Chưa đủ nội dung'}
        </Badge>

        {allSections.length > 1 && (
          <select
            aria-label={`Chuyển "${lesson.title}" sang chương khác`}
            value={lesson.sectionId}
            onChange={(e) => {
              if (e.target.value !== lesson.sectionId) {
                onMoveToSection(lesson.id, lesson.sectionId, e.target.value);
              }
            }}
            title="Chuyển bài học sang chương khác"
            className="h-7 max-w-[110px] rounded-md border border-border bg-secondary/60 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {allSections.map((s) => (
              <option key={s.id} value={s.id}>
                Ch.{s.index + 1}
              </option>
            ))}
          </select>
        )}

        <Button
          type="button"
          size="sm"
          variant={lesson.isFreePreview ? 'default' : 'ghost'}
          onClick={() => onTogglePreview(lesson)}
          className="h-7 gap-1 px-2 text-[11px]"
          title="Bật/tắt Học thử miễn phí"
        >
          {lesson.isFreePreview ? (
            <>
              <Eye className="h-3 w-3" /> Học thử
            </>
          ) : (
            <>
              <EyeOff className="h-3 w-3" /> Trả phí
            </>
          )}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onEdit(lesson)}
          className="h-7 px-2.5 text-xs"
        >
          <Pencil className="h-3 w-3" /> Soạn
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={hasEnrolledStudents}
          title={
            hasEnrolledStudents
              ? 'Không thể xóa bài học cũ khi khóa học đã có học viên (bạn có thể chỉnh sửa để giữ song song bản cũ & mới)'
              : 'Xóa bài học'
          }
          onClick={() => onDelete(lesson)}
          className="h-7 w-7 text-muted-foreground hover:text-destructive disabled:opacity-35"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

interface SortableSectionCardProps {
  section: BuilderSection;
  index: number;
  hasEnrolledStudents: boolean;
  allSections: Array<{ id: string; title: string; index: number }>;
  onRenameSection: (sectionId: string, title: string) => void;
  onDeleteSection: (section: BuilderSection) => void;
  onAddLesson: (sectionId: string, title: string, type: LessonType) => Promise<void>;
  onEditLesson: (lesson: BuilderLesson) => void;
  onTogglePreview: (lesson: BuilderLesson) => void;
  onMoveLessonToSection: (lessonId: string, fromSectionId: string, toSectionId: string) => void;
  onDeleteLesson: (lesson: BuilderLesson) => void;
  onReorderLessons: (sectionId: string, nextLessons: BuilderLesson[]) => void;
}

function SortableSectionCard({
  section,
  index,
  hasEnrolledStudents,
  allSections,
  onRenameSection,
  onDeleteSection,
  onAddLesson,
  onEditLesson,
  onTogglePreview,
  onMoveLessonToSection,
  onDeleteLesson,
  onReorderLessons,
}: SortableSectionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `section:${section.id}`,
  });

  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(section.title);
  const [newLessonTitle, setNewLessonTitle] = React.useState('');
  const [newLessonType, setNewLessonType] = React.useState<LessonType>(LessonType.VIDEO);
  const [adding, setAdding] = React.useState(false);

  const lessonSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  React.useEffect(() => {
    setTitleDraft(section.title);
  }, [section.title]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function handleLessonDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = section.lessons.findIndex((l) => `lesson:${l.id}` === active.id);
    const newIdx = section.lessons.findIndex((l) => `lesson:${l.id}` === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(section.lessons, oldIdx, newIdx);
    onReorderLessons(section.id, next);
  }

  async function handleQuickAddLesson(e: React.FormEvent) {
    e.preventDefault();
    if (newLessonTitle.trim().length < 2) {
      notify.error('Tên bài học tối thiểu 2 ký tự');
      return;
    }
    setAdding(true);
    try {
      await onAddLesson(section.id, newLessonTitle.trim(), newLessonType);
      setNewLessonTitle('');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-2xl border border-border bg-secondary/25 p-4 transition-shadow',
        isDragging && 'z-20 opacity-85 shadow-xl ring-2 ring-primary',
      )}
    >
      {/* Section Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Kéo để đổi thứ tự chương"
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <Badge variant="outline" className="font-mono text-[10px]">
            Chương {index + 1}
          </Badge>

          {editingTitle ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (titleDraft.trim().length >= 2) {
                  onRenameSection(section.id, titleDraft.trim());
                  setEditingTitle(false);
                }
              }}
              className="flex flex-1 items-center gap-2"
            >
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
              <Button type="submit" size="sm" className="h-8">
                Lưu
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setTitleDraft(section.title);
                  setEditingTitle(false);
                }}
              >
                Hủy
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="cursor-pointer truncate text-left text-sm font-semibold hover:text-primary"
            >
              {section.title}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-2 text-xs text-muted-foreground">
            {section.lessons.length} bài học
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setEditingTitle(true)}
            title="Đổi tên chương"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={hasEnrolledStudents}
            className="h-7 w-7 text-muted-foreground hover:text-destructive disabled:opacity-35"
            onClick={() => onDeleteSection(section)}
            title={
              hasEnrolledStudents
                ? 'Không thể xóa chương học khi đã có học viên đăng ký'
                : 'Xóa chương'
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Sortable Lessons inside Section */}
      <DndContext
        sensors={lessonSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleLessonDragEnd}
      >
        <SortableContext
          items={section.lessons.map((l) => `lesson:${l.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {section.lessons.map((lesson) => (
              <SortableLessonRow
                key={lesson.id}
                lesson={lesson}
                hasEnrolledStudents={hasEnrolledStudents}
                allSections={allSections}
                onEdit={onEditLesson}
                onTogglePreview={onTogglePreview}
                onMoveToSection={onMoveLessonToSection}
                onDelete={onDeleteLesson}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Quick Add Lesson Form */}
      <form
        onSubmit={handleQuickAddLesson}
        className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3"
      >
        <select
          value={newLessonType}
          onChange={(e) => setNewLessonType(e.target.value as LessonType)}
          className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs font-medium"
        >
          <option value={LessonType.VIDEO}>Video</option>
          <option value={LessonType.ARTICLE}>Bài đọc MD</option>
          <option value={LessonType.QUIZ}>Trắc nghiệm Quiz</option>
        </select>
        <Input
          value={newLessonTitle}
          onChange={(e) => setNewLessonTitle(e.target.value)}
          placeholder="Nhập tên bài học mới rồi Enter..."
          className="h-9 flex-1 text-xs"
        />
        <Button type="submit" size="sm" variant="outline" disabled={adding} className="h-9">
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Thêm bài
        </Button>
      </form>
    </div>
  );
}

function CourseBuilderContent() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const queryClient = useQueryClient();

  const [sectionsState, setSectionsState] = React.useState<BuilderSection[]>([]);
  const [newSectionTitle, setNewSectionTitle] = React.useState('');
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [editingLesson, setEditingLesson] = React.useState<BuilderLesson | null>(null);

  const { data: course, isLoading } = useQuery({
    queryKey: ['course-builder', courseId],
    queryFn: () => api.get<BuilderCourse>(`/instructor/courses/${courseId}/builder`),
  });

  const { data: mediaStatus } = useQuery({
    queryKey: ['media-status'],
    queryFn: () => api.get<MediaStatus>('/media/status'),
  });

  React.useEffect(() => {
    if (course?.sections) {
      setSectionsState(course.sections);
    }
  }, [course]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refreshBuilder = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['course-builder', courseId] });
    void queryClient.invalidateQueries({ queryKey: ['instructor-courses'] });
  }, [queryClient, courseId]);

  const reorderMutation = useMutation({
    mutationFn: (nextSections: BuilderSection[]) =>
      api.put(`/instructor/courses/${courseId}/reorder`, {
        sections: nextSections.map((sec, sIdx) => ({
          id: sec.id,
          sortOrder: sIdx,
          lessons: sec.lessons.map((les, lIdx) => ({
            id: les.id,
            sortOrder: lIdx,
          })),
        })),
      }),
    onSuccess: () => {
      notify.success('Đã lưu thứ tự giáo trình');
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Lưu thứ tự thất bại');
      refreshBuilder();
    },
  });

  const submitReviewMutation = useMutation({
    mutationFn: () => api.post(`/instructor/courses/${courseId}/submit-review`),
    onSuccess: () => {
      notify.success('Đã gửi khóa học chờ Admin kiểm duyệt!', {
        description: 'Bạn sẽ nhận phản hồi ngay khi quản trị viên duyệt xong.',
      });
      refreshBuilder();
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Không thể gửi duyệt');
    },
  });

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = sectionsState.findIndex((s) => `section:${s.id}` === active.id);
    const newIdx = sectionsState.findIndex((s) => `section:${s.id}` === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const next = arrayMove(sectionsState, oldIdx, newIdx);
    setSectionsState(next);
    reorderMutation.mutate(next);
  }

  function handleLessonsReordered(sectionId: string, nextLessons: BuilderLesson[]) {
    const nextSections = sectionsState.map((s) =>
      s.id === sectionId ? { ...s, lessons: nextLessons } : s,
    );
    setSectionsState(nextSections);
    reorderMutation.mutate(nextSections);
  }

  function handleMoveLessonToSection(
    lessonId: string,
    fromSectionId: string,
    toSectionId: string,
  ) {
    const sourceSection = sectionsState.find((s) => s.id === fromSectionId);
    const movingLesson = sourceSection?.lessons.find((l) => l.id === lessonId);
    if (!movingLesson) return;

    const nextSections = sectionsState.map((sec) => {
      if (sec.id === fromSectionId) {
        return { ...sec, lessons: sec.lessons.filter((l) => l.id !== lessonId) };
      }
      if (sec.id === toSectionId) {
        return {
          ...sec,
          lessons: [...sec.lessons, { ...movingLesson, sectionId: toSectionId }],
        };
      }
      return sec;
    });

    setSectionsState(nextSections);
    reorderMutation.mutate(nextSections);
  }

  async function handleAddSection(e: React.FormEvent) {
    e.preventDefault();
    if (newSectionTitle.trim().length < 2) {
      notify.error('Tên chương tối thiểu 2 ký tự');
      return;
    }
    try {
      await api.post(`/instructor/courses/${courseId}/sections`, {
        title: newSectionTitle.trim(),
      });
      setNewSectionTitle('');
      notify.success('Đã thêm chương mới');
      refreshBuilder();
    } catch (err) {
      notify.error(err instanceof ApiClientError ? err.message : 'Thêm chương thất bại');
    }
  }

  const toggleVisibilityMutation = useMutation({
    mutationFn: (archived: boolean) =>
      api.patch<{ status: CourseStatus; message: string }>(
        `/instructor/courses/${courseId}/visibility`,
        { archived },
      ),
    onMutate: async (archived) => {
      await queryClient.cancelQueries({ queryKey: ['course-builder', courseId] });
      const prev = queryClient.getQueryData<BuilderCourse>(['course-builder', courseId]);
      if (prev) {
        queryClient.setQueryData<BuilderCourse>(['course-builder', courseId], {
          ...prev,
          status: archived ? CourseStatus.ARCHIVED : CourseStatus.PUBLISHED,
        });
      }
      return { prev };
    },
    onSuccess: (res) => {
      notify.success(res.message);
      void queryClient.invalidateQueries({ queryKey: ['instructor-courses'] });
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['course-builder', courseId], ctx.prev);
      }
      notify.error(err instanceof ApiClientError ? err.message : 'Đổi trạng thái hiển thị thất bại');
    },
  });

  async function handleRenameSection(sectionId: string, title: string) {
    const prevSections = sectionsState;
    // Optimistic 0ms update
    setSectionsState((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, title } : s)),
    );
    try {
      await api.patch(`/instructor/courses/${courseId}/sections/${sectionId}`, { title });
      notify.success('Đã đổi tên chương');
    } catch (err) {
      setSectionsState(prevSections);
      notify.error(err instanceof ApiClientError ? err.message : 'Đổi tên thất bại');
    }
  }

  async function handleDeleteSection(section: BuilderSection) {
    const ok = await confirmAction({
      title: `Xóa chương "${section.title}"?`,
      description: `Toàn bộ ${section.lessons.length} bài học bên trong chương này sẽ bị xóa vĩnh viễn.`,
      confirmLabel: 'Xóa chương',
      destructive: true,
    });
    if (!ok) return;

    const prevSections = sectionsState;
    setSectionsState((prev) => prev.filter((s) => s.id !== section.id));
    try {
      await api.delete(`/instructor/courses/${courseId}/sections/${section.id}`);
      notify.success('Đã xóa chương học');
      void queryClient.invalidateQueries({ queryKey: ['instructor-courses'] });
    } catch (err) {
      setSectionsState(prevSections);
      notify.error(err instanceof ApiClientError ? err.message : 'Xóa chương thất bại');
    }
  }

  async function handleAddLesson(sectionId: string, title: string, type: LessonType) {
    try {
      const created = await api.post<BuilderLesson>(
        `/instructor/courses/${courseId}/sections/${sectionId}/lessons`,
        { title, type, isFreePreview: false },
      );
      notify.success('Đã thêm bài học mới');
      setSectionsState((prev) =>
        prev.map((sec) =>
          sec.id === sectionId ? { ...sec, lessons: [...sec.lessons, created] } : sec,
        ),
      );
      refreshBuilder();
      setEditingLesson(created);
    } catch (err) {
      notify.error(err instanceof ApiClientError ? err.message : 'Thêm bài học thất bại');
    }
  }

  async function handleTogglePreview(lesson: BuilderLesson) {
    const nextValue = !lesson.isFreePreview;
    const prevSections = sectionsState;

    // Optimistic 0ms flip on FE immediately
    const optimisticSections = prevSections.map((sec) => ({
      ...sec,
      lessons: sec.lessons.map((l) =>
        l.id === lesson.id ? { ...l, isFreePreview: nextValue } : l,
      ),
    }));
    setSectionsState(optimisticSections);
    queryClient.setQueryData<BuilderCourse>(['course-builder', courseId], (old) =>
      old ? { ...old, sections: optimisticSections } : old,
    );

    try {
      await api.patch(`/instructor/courses/${courseId}/lessons/${lesson.id}`, {
        isFreePreview: nextValue,
      });
    } catch (err) {
      // Rollback FE cleanly if BE fails
      setSectionsState(prevSections);
      queryClient.setQueryData<BuilderCourse>(['course-builder', courseId], (old) =>
        old ? { ...old, sections: prevSections } : old,
      );
      notify.error('Không thể đổi trạng thái Học thử', {
        description: err instanceof ApiClientError ? err.message : 'Đã khôi phục lại trạng thái cũ.',
      });
    }
  }

  async function handleDeleteLesson(lesson: BuilderLesson) {
    const ok = await confirmAction({
      title: `Xóa bài học "${lesson.title}"?`,
      description: 'Nội dung video, Markdown hoặc Quiz của bài học này sẽ bị xóa.',
      confirmLabel: 'Xóa bài học',
      destructive: true,
    });
    if (!ok) return;

    const prevSections = sectionsState;
    setSectionsState((prev) =>
      prev.map((sec) => ({
        ...sec,
        lessons: sec.lessons.filter((l) => l.id !== lesson.id),
      })),
    );
    try {
      await api.delete(`/instructor/courses/${courseId}/lessons/${lesson.id}`);
      notify.success('Đã xóa bài học');
      void queryClient.invalidateQueries({ queryKey: ['instructor-courses'] });
    } catch (err) {
      setSectionsState(prevSections);
      notify.error(err instanceof ApiClientError ? err.message : 'Xóa thất bại');
    }
  }

  if (isLoading || !course) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const allLessons = sectionsState.flatMap((s) => s.lessons);
  const readyLessonsCount = allLessons.filter(isLessonReady).length;
  const enrolledCount = course.enrolledStudentsCount ?? course.enrollmentCount ?? 0;
  const hasEnrolledStudents = enrolledCount > 0;
  const canSubmit =
    (course.status === CourseStatus.DRAFT || course.status === CourseStatus.REJECTED) &&
    allLessons.length > 0 &&
    readyLessonsCount === allLessons.length;
  const canToggleVisibility =
    course.status === CourseStatus.PUBLISHED || course.status === CourseStatus.ARCHIVED;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      {/* Sticky Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <Link href="/instructor/dashboard">
            <Button variant="ghost" size="icon" aria-label="Quay lại">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight">{course.title}</h1>
              <Badge
                variant={
                  course.status === CourseStatus.PUBLISHED
                    ? 'success'
                    : course.status === CourseStatus.PENDING_REVIEW
                      ? 'warning'
                      : course.status === CourseStatus.REJECTED
                        ? 'destructive'
                        : 'secondary'
                }
              >
                {course.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {sectionsState.length} chương • {allLessons.length} bài học •{' '}
              {formatDuration(course.totalDurationSec)} •{' '}
              {formatVnd(course.salePriceVnd ?? course.priceVnd)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
            Cài đặt &amp; Ảnh bìa 16:9
          </Button>
          {canToggleVisibility && (
            <Button
              variant="outline"
              size="sm"
              disabled={toggleVisibilityMutation.isPending}
              onClick={async () => {
                const isArchiving = course.status === CourseStatus.PUBLISHED;
                const ok = await confirmAction({
                  title: isArchiving
                    ? 'Ẩn khóa học khỏi sàn bán mới?'
                    : 'Mở bán lại khóa học này?',
                  description: isArchiving
                    ? 'Khách mới sẽ không thấy khóa học trong danh mục nữa. Toàn bộ học viên đã mua vẫn sở hữu vĩnh viễn và học bình thường.'
                    : 'Khóa học sẽ hiển thị công khai trở lại trên Try4T.',
                  confirmLabel: isArchiving ? 'Ẩn khóa học' : 'Mở bán lại',
                });
                if (ok) toggleVisibilityMutation.mutate(isArchiving);
              }}
            >
              {course.status === CourseStatus.PUBLISHED ? (
                <>
                  <Archive className="h-4 w-4" /> Ẩn khỏi sàn
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" /> Mở bán lại
                </>
              )}
            </Button>
          )}
          {!canToggleVisibility && (
            <Button
              size="sm"
              disabled={!canSubmit || submitReviewMutation.isPending}
              onClick={() => submitReviewMutation.mutate()}
            >
              {submitReviewMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {course.status === CourseStatus.PENDING_REVIEW
                ? 'Đang chờ Admin duyệt'
                : 'Gửi duyệt xuất bản'}
            </Button>
          )}
        </div>
      </div>

      {/* Enrolled Student Protection Notice */}
      {hasEnrolledStudents && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 text-xs text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-semibold">
              Khóa học đang có {enrolledCount} học viên sở hữu trọn đời
            </p>
            <p className="opacity-90">
              Để bảo vệ quyền lợi người mua: không thể xóa chương/bài học đã tồn tại. Bạn có thể{' '}
              <strong>thêm bài mới</strong>, <strong>cập nhật bài cũ</strong> (hệ thống tự lưu
              song song cả bản cũ và mới) hoặc bấm <strong>Ẩn khỏi sàn</strong> nếu ngừng bán mới.
            </p>
          </div>
        </div>
      )}

      {/* Rejection Notice if REJECTED */}
      {course.status === CourseStatus.REJECTED && course.reviewLogs[0]?.note && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Khóa học bị từ chối — Cần chỉnh sửa trước khi gửi lại:</p>
            <p className="mt-1">{course.reviewLogs[0].note}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* MAIN: DRAG & DROP CURRICULUM */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Giáo trình khóa học (Kéo thả sắp xếp)</h2>
              <p className="text-xs text-muted-foreground">
                Kéo icon chấm dọc để thay đổi thứ tự Chương hoặc Bài học. Bấm vào bài học để mở hộp
                thoại soạn thảo.
              </p>
            </div>
            {reorderMutation.isPending && (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Đang lưu...
              </Badge>
            )}
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSectionDragEnd}
          >
            <SortableContext
              items={sectionsState.map((s) => `section:${s.id}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {sectionsState.map((section, idx) => (
                  <SortableSectionCard
                    key={section.id}
                    section={section}
                    index={idx}
                    hasEnrolledStudents={hasEnrolledStudents}
                    allSections={sectionsState.map((s, i) => ({
                      id: s.id,
                      title: s.title,
                      index: i,
                    }))}
                    onRenameSection={handleRenameSection}
                    onDeleteSection={handleDeleteSection}
                    onAddLesson={handleAddLesson}
                    onEditLesson={(les) => setEditingLesson(les)}
                    onTogglePreview={handleTogglePreview}
                    onMoveLessonToSection={handleMoveLessonToSection}
                    onDeleteLesson={handleDeleteLesson}
                    onReorderLessons={handleLessonsReordered}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Add New Section */}
          <form
            onSubmit={handleAddSection}
            className="flex items-center gap-2 rounded-2xl border border-dashed border-border bg-card p-3"
          >
            <Input
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              placeholder="Tên chương mới (VD: Chương 2: Xây dựng REST API với NestJS)..."
              className="flex-1"
            />
            <Button type="submit" variant="secondary">
              <Plus className="h-4 w-4" />
              Thêm chương
            </Button>
          </form>
        </div>

        {/* SIDEBAR: CHECKLIST & CLOUD STATUS */}
        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Checklist gửi duyệt xuất bản</CardTitle>
              <CardDescription className="text-xs">
                Hoàn tất các mục dưới để bật nút Gửi duyệt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={cn(
                    'h-4 w-4 shrink-0',
                    course.thumbnailUrl ? 'text-emerald-500' : 'text-muted-foreground/40',
                  )}
                />
                <span>Ảnh bìa 16:9 (khuyến nghị)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={cn(
                    'h-4 w-4 shrink-0',
                    allLessons.length > 0 ? 'text-emerald-500' : 'text-muted-foreground/40',
                  )}
                />
                <span>Ít nhất 1 bài học ({allLessons.length} bài)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={cn(
                    'h-4 w-4 shrink-0',
                    allLessons.length > 0 && readyLessonsCount === allLessons.length
                      ? 'text-emerald-500'
                      : 'text-muted-foreground/40',
                  )}
                />
                <span>
                  Nội dung đầy đủ ({readyLessonsCount}/{allLessons.length} bài)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={cn(
                    'h-4 w-4 shrink-0',
                    allLessons.some((l) => l.isFreePreview)
                      ? 'text-emerald-500'
                      : 'text-muted-foreground/40',
                  )}
                />
                <span>Có bài Học thử miễn phí (khuyến nghị)</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Cloud className="h-4 w-4 text-primary" />
                Trạng thái Cloud Storage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cloudinary (Ảnh/Fallback)</span>
                <Badge variant={mediaStatus?.cloudinaryConfigured ? 'success' : 'secondary'}>
                  {mediaStatus?.cloudinaryConfigured ? 'Đã kết nối' : 'Chưa điền .env'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cloudflare R2 (Video)</span>
                <Badge variant={mediaStatus?.r2Configured ? 'success' : 'secondary'}>
                  {mediaStatus?.r2Configured ? 'Đã kết nối' : 'Chưa điền .env'}
                </Badge>
              </div>
              {!mediaStatus?.cloudinaryConfigured && !mediaStatus?.r2Configured && (
                <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Chưa điền key Cloud? Bạn vẫn có thể dán URL ảnh/video trực tiếp trong hộp thoại
                  để test toàn bộ luồng.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Pop-up Modals */}
      <CourseSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        course={course}
        onSaved={refreshBuilder}
      />

      <LessonEditorModal
        open={Boolean(editingLesson)}
        onClose={() => setEditingLesson(null)}
        courseId={course.id}
        lesson={editingLesson}
        hasEnrolledStudents={hasEnrolledStudents}
        onSaved={refreshBuilder}
      />
    </div>
  );
}

export default function CourseBuilderPage() {
  return (
    <RoleGuard allowedRoles={[Role.INSTRUCTOR, Role.ADMIN]}>
      <CourseBuilderContent />
    </RoleGuard>
  );
}
