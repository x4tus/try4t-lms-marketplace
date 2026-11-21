'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  HelpCircle,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import {
  formatDuration,
  LessonType,
  parseVideoSource,
  QuizQuestionType,
} from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UniversalVideoPreview } from '@/components/ui/universal-video-preview';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import {
  readVideoDurationFromUrl,
  readVideoDurationSeconds,
  uploadMediaDirect,
} from './media-upload';
import type { BuilderLesson, QuizQuestionItem } from './types';

interface LessonEditorModalProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  lesson: BuilderLesson | null;
  onSaved: () => void;
}

const DEFAULT_QUESTION = (): QuizQuestionItem => ({
  promptMd: '',
  type: QuizQuestionType.SINGLE_CHOICE,
  explanationMd: '',
  options: [
    { content: '', isCorrect: true },
    { content: '', isCorrect: false },
  ],
});

export function LessonEditorModal({
  open,
  onClose,
  courseId,
  lesson,
  onSaved,
}: LessonEditorModalProps) {
  const [title, setTitle] = React.useState('');
  const [type, setType] = React.useState<LessonType>(LessonType.VIDEO);
  const [isFreePreview, setIsFreePreview] = React.useState(false);

  // Video state
  const [videoStorageKey, setVideoStorageKey] = React.useState('');
  const [playbackUrl, setPlaybackUrl] = React.useState<string | null>(null);
  const [videoDurationSec, setVideoDurationSec] = React.useState(0);
  const [probingDuration, setProbingDuration] = React.useState(false);
  const [uploadingVideo, setUploadingVideo] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);

  // Article state
  const [articleMd, setArticleMd] = React.useState('');

  // Quiz state
  const [passScorePercent, setPassScorePercent] = React.useState(70);
  const [timeLimitMin, setTimeLimitMin] = React.useState<string>('');
  const [shuffleQuestions, setShuffleQuestions] = React.useState(false);
  const [questions, setQuestions] = React.useState<QuizQuestionItem[]>([DEFAULT_QUESTION()]);

  const [saving, setSaving] = React.useState(false);
  const [isDirty, setIsDirty] = React.useState(false);

  React.useEffect(() => {
    if (!lesson || !open) return;
    setIsDirty(false);
    setTitle(lesson.title);
    setType(lesson.type);
    setIsFreePreview(lesson.isFreePreview);
    setVideoStorageKey(lesson.videoStorageKey ?? '');
    setPlaybackUrl(lesson.playbackUrl ?? null);
    setVideoDurationSec(lesson.videoDurationSec ?? 0);
    setArticleMd(lesson.articleMd ?? '');

    if (lesson.quiz) {
      setPassScorePercent(lesson.quiz.passScorePercent);
      setTimeLimitMin(lesson.quiz.timeLimitSec ? String(Math.round(lesson.quiz.timeLimitSec / 60)) : '');
      setShuffleQuestions(lesson.quiz.shuffleQuestions);
      setQuestions(
        lesson.quiz.questions.length > 0
          ? lesson.quiz.questions.map((q) => ({
              promptMd: q.promptMd,
              type: q.type,
              explanationMd: q.explanationMd ?? '',
              options: q.options.map((o) => ({ content: o.content, isCorrect: o.isCorrect })),
            }))
          : [DEFAULT_QUESTION()],
      );
    } else {
      setPassScorePercent(70);
      setTimeLimitMin('');
      setShuffleQuestions(false);
      setQuestions([DEFAULT_QUESTION()]);
    }
  }, [lesson, open]);

  if (!lesson) return null;

  async function handleSafeClose() {
    if (uploadingVideo) {
      notify.warning('Đang tải video lên Cloud', {
        description: 'Vui lòng chờ quá trình tải hoàn tất để tránh hỏng tệp.',
      });
      return;
    }
    if (isDirty) {
      const ok = await confirmAction({
        title: 'Đóng mà chưa lưu bài học?',
        description: 'Nội dung bạn vừa soạn trong bài học này sẽ bị mất nếu chưa bấm Lưu.',
        confirmLabel: 'Vẫn đóng',
        cancelLabel: 'Quay lại soạn tiếp',
      });
      if (!ok) return;
    }
    onClose();
  }

  async function handleVideoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingVideo(true);
    setUploadProgress(5);
    try {
      const localDuration = await readVideoDurationSeconds(file);
      const uploaded = await uploadMediaDirect({
        file,
        kind: 'VIDEO',
        onProgress: setUploadProgress,
      });

      setVideoStorageKey(uploaded.storageKey);
      if (uploaded.publicUrl.startsWith('http')) {
        setPlaybackUrl(uploaded.publicUrl);
      }

      let resolvedDuration = uploaded.durationSec || localDuration;
      if (resolvedDuration <= 0 && uploaded.storageKey) {
        const probed = await api
          .post<{ durationSec: number }>('/media/probe-video-duration', {
            storageKey: uploaded.storageKey,
          })
          .catch(() => ({ durationSec: 0 }));
        resolvedDuration = probed.durationSec;
      }

      if (resolvedDuration > 0) {
        setVideoDurationSec(resolvedDuration);
      }
      setIsDirty(true);
      notify.success(`Đã tải video lên ${uploaded.provider.toUpperCase()}!`, {
        description:
          resolvedDuration > 0
            ? `Tự động đọc thời lượng từ video: ${formatDuration(resolvedDuration)} (${resolvedDuration}s). Bấm "Lưu bài học" để hoàn tất.`
            : 'Đã tải xong video. Bấm "Lưu bài học" để hoàn tất.',
      });
    } catch (err) {
      notify.error('Không thể tải video lên Cloud', {
        description:
          err instanceof ApiClientError || err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUploadingVideo(false);
      e.target.value = '';
    }
  }

  async function handleProbeDurationFromKey(keyOverride?: string) {
    const key = (keyOverride ?? videoStorageKey).trim();
    if (!key) return;
    const parsed = parseVideoSource(key);
    setProbingDuration(true);
    try {
      // 1. Direct MP4: thử đọc nhanh trực tiếp qua trình duyệt
      let sec =
        parsed?.provider === 'DIRECT' && key.startsWith('http')
          ? await readVideoDurationFromUrl(key)
          : 0;
      // 2. YouTube / Vimeo / Cloudinary / Fallback: đọc phía Backend (không cần API key!)
      if (sec <= 0) {
        const res = await api.post<{ durationSec: number }>('/media/probe-video-duration', {
          storageKey: key,
        });
        sec = res.durationSec;
      }
      if (sec > 0) {
        setVideoDurationSec(sec);
        setIsDirty(true);
        notify.success(
          `Đã tự đọc thời lượng ${parsed?.providerLabel ?? 'video'}: ${formatDuration(sec)} (${sec} giây)`,
        );
      } else if (parsed?.provider === 'GOOGLE_DRIVE') {
        notify.info('Google Drive không mở công khai thời lượng — bạn có thể nhập tay số giây ở ô bên cạnh.');
      } else {
        notify.warning('Không đọc được thời lượng từ đường dẫn video này');
      }
    } catch {
      notify.error('Không thể đọc thời lượng từ tệp video');
    } finally {
      setProbingDuration(false);
    }
  }

  function updateQuestion(idx: number, patch: Partial<QuizQuestionItem>) {
    setIsDirty(true);
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function updateOption(
    qIdx: number,
    oIdx: number,
    patch: { content?: string; isCorrect?: boolean },
  ) {
    setIsDirty(true);
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const nextOpts = q.options.map((opt, j) => {
          if (j !== oIdx) {
            if (patch.isCorrect && q.type === QuizQuestionType.SINGLE_CHOICE) {
              return { ...opt, isCorrect: false };
            }
            return opt;
          }
          return { ...opt, ...patch };
        });
        return { ...q, options: nextOpts };
      }),
    );
  }

  async function handleSave() {
    if (!lesson) return;
    if (title.trim().length < 2) {
      notify.error('Tên bài học tối thiểu 2 ký tự');
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/instructor/courses/${courseId}/lessons/${lesson.id}`, {
        title: title.trim(),
        type,
        isFreePreview,
        ...(type === LessonType.VIDEO
          ? {
              videoStorageKey: videoStorageKey.trim() || null,
              videoDurationSec: Math.max(0, Math.round(Number(videoDurationSec) || 0)),
            }
          : {}),
        ...(type === LessonType.ARTICLE ? { articleMd } : {}),
      });

      if (type === LessonType.QUIZ) {
        await api.put(`/instructor/courses/${courseId}/lessons/${lesson.id}/quiz`, {
          passScorePercent,
          timeLimitSec: timeLimitMin.trim() ? Number(timeLimitMin) * 60 : null,
          shuffleQuestions,
          questions: questions.map((q) => ({
            promptMd: q.promptMd.trim(),
            type: q.type,
            explanationMd: q.explanationMd?.trim() || null,
            options: q.options.map((o) => ({
              content: o.content.trim(),
              isCorrect: o.isCorrect,
            })),
          })),
        });
      }

      setIsDirty(false);
      notify.success('Đã lưu nội dung bài học');
      onSaved();
      onClose();
    } catch (err) {
      notify.error(err instanceof ApiClientError ? err.message : 'Lưu bài học thất bại');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => void handleSafeClose()}
      title="Soạn thảo nội dung bài học"
      description="Hỗ trợ Video Cloud (R2/Cloudinary), Bài đọc Markdown và Trắc nghiệm Quiz."
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-5" onInput={() => setIsDirty(true)}>
        {/* Top Metadata */}
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="le-title">Tên bài học</Label>
            <Input
              id="le-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Thiết kế Clean Architecture với NestJS"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Loại bài học</Label>
            <div className="flex rounded-lg border border-border bg-secondary p-1">
              {[
                { val: LessonType.VIDEO, label: 'Video', icon: Video },
                { val: LessonType.ARTICLE, label: 'Markdown', icon: FileText },
                { val: LessonType.QUIZ, label: 'Quiz', icon: HelpCircle },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setType(item.val)}
                    className={cn(
                      'flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                      type === item.val
                        ? 'bg-card text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isFreePreview}
            onChange={(e) => setIsFreePreview(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <Eye className="h-4 w-4 text-primary" />
          <span>Cho phép khách vãng lai xem <strong>Học thử miễn phí (Free Preview)</strong></span>
        </label>

        {/* VIDEO EDITOR */}
        {type === LessonType.VIDEO && (
          <div className="space-y-4 rounded-xl border border-border bg-secondary/25 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Tải video trực tiếp lên Cloud Storage</p>
                <p className="text-xs text-muted-foreground">
                  Hỗ trợ MP4, WEBM, MOV tối đa 500MB • Upload thẳng lên R2/Cloudinary (không qua RAM server).
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90">
                <Upload className="h-3.5 w-3.5" />
                {uploadingVideo ? 'Đang tải lên...' : 'Chọn file Video'}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={handleVideoFileChange}
                  disabled={uploadingVideo}
                  className="hidden"
                />
              </label>
            </div>

            {uploadingVideo && (
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-right font-mono text-xs text-muted-foreground">
                  {uploadProgress}%
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-[1fr_230px]">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="le-vkey">
                    URL Video (YouTube, Vimeo, Google Drive, Cloudinary / R2)
                  </Label>
                  {videoStorageKey.trim() && (
                    <Badge variant="secondary" className="text-[10px]">
                      {parseVideoSource(videoStorageKey)?.providerLabel ?? 'Video'}
                    </Badge>
                  )}
                </div>
                <Input
                  id="le-vkey"
                  value={videoStorageKey}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setVideoStorageKey(nextVal);
                    if (nextVal.trim().startsWith('http')) {
                      setPlaybackUrl(nextVal.trim());
                    }
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text').trim();
                    if (pasted.startsWith('http')) {
                      window.setTimeout(() => void handleProbeDurationFromKey(pasted), 80);
                    }
                  }}
                  onBlur={() => {
                    if (videoStorageKey.trim().length > 8 && videoDurationSec === 0) {
                      void handleProbeDurationFromKey(videoStorageKey);
                    }
                  }}
                  placeholder="Dán link YouTube, Vimeo, Google Drive hoặc tải file MP4..."
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="le-dur" className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-primary" />
                    Thời lượng {parseVideoSource(videoStorageKey)?.provider === 'GOOGLE_DRIVE' ? '(giây)' : 'tự đọc'}
                  </Label>
                  {videoStorageKey.trim() && (
                    <button
                      type="button"
                      disabled={probingDuration}
                      onClick={() => void handleProbeDurationFromKey()}
                      className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      <RefreshCw
                        className={cn('h-3 w-3', probingDuration && 'animate-spin')}
                      />
                      Đọc lại
                    </button>
                  )}
                </div>
                {parseVideoSource(videoStorageKey)?.provider === 'GOOGLE_DRIVE' ? (
                  <Input
                    id="le-dur"
                    type="number"
                    min={0}
                    step={1}
                    value={videoDurationSec}
                    onChange={(e) => setVideoDurationSec(Number(e.target.value))}
                    placeholder="VD: 300"
                    className="font-mono text-xs"
                  />
                ) : (
                  <div className="flex h-10 items-center justify-between rounded-lg border border-input bg-secondary/40 px-3 font-mono text-xs">
                    <span className="font-bold text-primary">
                      {probingDuration
                        ? 'Đang đọc video...'
                        : videoDurationSec > 0
                          ? formatDuration(videoDurationSec)
                          : 'Chưa có video'}
                    </span>
                    {videoDurationSec > 0 && !probingDuration && (
                      <span className="text-[11px] text-muted-foreground">{videoDurationSec}s</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {playbackUrl && (
              <div className="overflow-hidden rounded-xl border border-border bg-black">
                <UniversalVideoPreview
                  url={playbackUrl}
                  className="max-h-[300px]"
                  onDirectDurationDetected={(rounded) => {
                    if (rounded !== videoDurationSec) {
                      setVideoDurationSec(rounded);
                      setIsDirty(true);
                    }
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* ARTICLE MARKDOWN EDITOR */}
        {type === LessonType.ARTICLE && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Nội dung bài đọc (Markdown + Code block)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setArticleMd(
                    (prev) =>
                      prev +
                      '\n\n## Kiến thức trọng tâm\n\n```ts\nconst greeting: string = "Hello Try4T!";\nconsole.log(greeting);\n```\n',
                  )
                }
              >
                + Chèn mẫu Code Block
              </Button>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <textarea
                rows={12}
                value={articleMd}
                onChange={(e) => setArticleMd(e.target.value)}
                placeholder="Viết nội dung bài đọc bằng Markdown..."
                className="w-full rounded-xl border border-input bg-card p-3.5 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="max-h-[300px] overflow-y-auto rounded-xl border border-border bg-secondary/30 p-4 text-sm leading-relaxed [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-950 [&_pre]:p-3 [&_pre]:text-zinc-100">
                {articleMd.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                    {articleMd}
                  </ReactMarkdown>
                ) : (
                  <p className="text-xs italic text-muted-foreground">
                    Bản xem trước Markdown sẽ hiển thị tại đây...
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* QUIZ BUILDER */}
        {type === LessonType.QUIZ && (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-border bg-secondary/30 p-3.5 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Điểm đạt tối thiểu (%)</Label>
                <Input
                  type="number"
                  min={10}
                  max={100}
                  value={passScorePercent}
                  onChange={(e) => setPassScorePercent(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Giới hạn thời gian (phút, trống = không giới hạn)</Label>
                <Input
                  type="number"
                  min={1}
                  max={180}
                  placeholder="VD: 15"
                  value={timeLimitMin}
                  onChange={(e) => setTimeLimitMin(e.target.value)}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 pt-5 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Xáo trộn thứ tự câu hỏi
              </label>
            </div>

            <div className="space-y-4">
              {questions.map((q, qIdx) => (
                <div
                  key={qIdx}
                  className="space-y-3 rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="font-mono">
                      Câu {qIdx + 1}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <select
                        value={q.type}
                        onChange={(e) =>
                          updateQuestion(qIdx, { type: e.target.value as QuizQuestionType })
                        }
                        className="rounded-md border border-input bg-card px-2 py-1 text-xs"
                      >
                        <option value={QuizQuestionType.SINGLE_CHOICE}>1 đáp án đúng</option>
                        <option value={QuizQuestionType.MULTI_CHOICE}>Nhiều đáp án đúng</option>
                      </select>
                      {questions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() =>
                            setQuestions((prev) => prev.filter((_, idx) => idx !== qIdx))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <Input
                    placeholder="Nhập câu hỏi trắc nghiệm..."
                    value={q.promptMd}
                    onChange={(e) => updateQuestion(qIdx, { promptMd: e.target.value })}
                  />

                  <div className="space-y-2">
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateOption(qIdx, oIdx, { isCorrect: !opt.isCorrect })
                          }
                          title="Đánh dấu đáp án đúng"
                          className={cn(
                            'flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors',
                            opt.isCorrect
                              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'border-border text-muted-foreground hover:bg-secondary',
                          )}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <Input
                          placeholder={`Đáp án ${oIdx + 1}`}
                          value={opt.content}
                          onChange={(e) =>
                            updateOption(qIdx, oIdx, { content: e.target.value })
                          }
                        />
                        {q.options.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              updateQuestion(qIdx, {
                                options: q.options.filter((_, idx) => idx !== oIdx),
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {q.options.length < 6 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          updateQuestion(qIdx, {
                            options: [...q.options, { content: '', isCorrect: false }],
                          })
                        }
                      >
                        <Plus className="h-3.5 w-3.5" /> Thêm đáp án
                      </Button>
                    )}
                  </div>

                  <Input
                    placeholder="Giải thích đáp án (hiển thị sau khi học viên nộp bài)..."
                    value={q.explanationMd ?? ''}
                    onChange={(e) => updateQuestion(qIdx, { explanationMd: e.target.value })}
                    className="text-xs"
                  />
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuestions((prev) => [...prev, DEFAULT_QUESTION()])}
              >
                <Plus className="h-4 w-4" /> Thêm câu hỏi mới
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleSafeClose()}
            disabled={saving}
          >
            Hủy
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || uploadingVideo}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu bài học
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
