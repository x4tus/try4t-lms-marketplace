'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  HelpCircle,
  History,
  Loader2,
  RotateCcw,
  Send,
  Trophy,
  XCircle,
} from 'lucide-react';
import { QuizQuestionType } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';

interface QuizPayload {
  id: string;
  lessonId: string;
  passScorePercent: number;
  timeLimitSec: number | null;
  shuffleQuestions: boolean;
  questions: Array<{
    id: string;
    promptMd: string;
    type: QuizQuestionType;
    options: Array<{ id: string; content: string }>;
  }>;
  attempts: Array<{
    id: string;
    scorePercent: number;
    correctCount: number;
    totalQuestions: number;
    passed: boolean;
    submittedAt: string;
  }>;
  bestScorePercent: number;
  hasPassed: boolean;
}

interface QuizSubmitResponse {
  attempt: {
    id: string;
    scorePercent: number;
    correctCount: number;
    totalQuestions: number;
    passScorePercent: number;
    passed: boolean;
    submittedAt: string;
  };
  feedback: Array<{
    questionId: string;
    isCorrect: boolean;
    selectedOptionIds: string[];
    correctOptionIds: string[];
    explanationMd: string | null;
  }>;
  enrollmentProgress: {
    progressPercent: number;
    completedLessonsCount: number;
    totalLessons: number;
    certificate: {
      certCode: string;
      verifyPath: string;
      pdfPath: string;
      issuedAt: string;
    } | null;
  } | null;
  certificate: {
    certCode: string;
    verifyPath: string;
    pdfPath: string;
    issuedAt: string;
  } | null;
}

interface QuizRunnerProps {
  lessonId: string;
  onPassed: (res: QuizSubmitResponse) => void;
}

export function QuizRunner({ lessonId, onPassed }: QuizRunnerProps) {
  const queryClient = useQueryClient();
  const [selectedMap, setSelectedMap] = React.useState<Record<string, string[]>>({});
  const [result, setResult] = React.useState<QuizSubmitResponse | null>(null);
  const [remainingSec, setRemainingSec] = React.useState<number | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);

  const { data: quiz, isLoading, error } = useQuery({
    queryKey: ['lesson-quiz', lessonId],
    queryFn: () => api.get<QuizPayload>(`/quizzes/lessons/${lessonId}`),
    retry: false,
  });

  // Reset khi đổi bài Quiz
  React.useEffect(() => {
    setSelectedMap({});
    setResult(null);
    setShowHistory(false);
    setRemainingSec(quiz?.timeLimitSec ?? null);
  }, [lessonId, quiz?.id, quiz?.timeLimitSec]);

  const submitMutation = useMutation({
    mutationFn: () => {
      const answers = (quiz?.questions ?? []).map((q) => ({
        questionId: q.id,
        selectedOptionIds: selectedMap[q.id] ?? [],
      }));
      return api.post<QuizSubmitResponse>(`/quizzes/lessons/${lessonId}/submit`, { answers });
    },
    onSuccess: (res) => {
      setResult(res);
      void queryClient.invalidateQueries({ queryKey: ['lesson-quiz', lessonId] });
      if (res.attempt.passed) {
        notify.success(`Xuất sắc! Bạn đạt ${res.attempt.scorePercent}% và vượt qua bài Quiz!`, {
          description: res.certificate
            ? 'Bạn đã đạt 100% khóa học và nhận Chứng chỉ QR!'
            : 'Bài học đã được đánh dấu hoàn thành.',
        });
        onPassed(res);
      } else {
        notify.warning(
          `Chưa đạt điểm chuẩn (${res.attempt.scorePercent}% / yêu cầu ${res.attempt.passScorePercent}%)`,
          { description: 'Xem lại giải thích chi tiết và thử làm lại nhé.' },
        );
      }
    },
    onError: (err) => {
      notify.error(err instanceof ApiClientError ? err.message : 'Nộp bài Quiz thất bại');
    },
  });

  // Đồng hồ đếm ngược tự nộp bài nếu có timeLimitSec
  React.useEffect(() => {
    if (remainingSec === null || result || submitMutation.isPending) return;
    if (remainingSec <= 0) {
      if (Object.keys(selectedMap).length > 0) {
        submitMutation.mutate();
      }
      return;
    }
    const timer = window.setInterval(() => {
      setRemainingSec((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec, result, submitMutation.isPending]);

  if (isLoading) {
    return <Skeleton className="h-80 w-full rounded-2xl" />;
  }

  if (error || !quiz) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {error instanceof ApiClientError
            ? error.message
            : 'Không thể tải bài kiểm tra Quiz này.'}
        </CardContent>
      </Card>
    );
  }

  const answeredCount = quiz.questions.filter((q) => (selectedMap[q.id]?.length ?? 0) > 0).length;
  const feedbackMap = new Map(result?.feedback.map((f) => [f.questionId, f]) ?? []);

  function toggleOption(questionId: string, optionId: string, type: QuizQuestionType) {
    if (result) return;
    setSelectedMap((prev) => {
      if (type === QuizQuestionType.SINGLE_CHOICE) {
        return { ...prev, [questionId]: [optionId] };
      }
      const curr = prev[questionId] ?? [];
      const exists = curr.includes(optionId);
      return {
        ...prev,
        [questionId]: exists ? curr.filter((id) => id !== optionId) : [...curr, optionId],
      };
    });
  }

  function handleRetry() {
    setResult(null);
    setSelectedMap({});
    setRemainingSec(quiz?.timeLimitSec ?? null);
  }

  const formatTimer = (sec: number) =>
    `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HelpCircle className="h-5 w-5 text-amber-500" />
              Bài kiểm tra kiến thức ({quiz.questions.length} câu hỏi)
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Điểm đạt yêu cầu: <strong className="font-mono">{quiz.passScorePercent}%</strong>
              {quiz.hasPassed && ' • Bạn đã vượt qua bài kiểm tra này'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {quiz.hasPassed && (
              <Badge variant="success" className="gap-1">
                <Trophy className="h-3.5 w-3.5" /> Cao nhất: {quiz.bestScorePercent}%
              </Badge>
            )}
            {remainingSec !== null && !result && (
              <Badge
                variant={remainingSec <= 60 ? 'destructive' : 'warning'}
                className="gap-1 font-mono"
              >
                <Clock className="h-3.5 w-3.5" />
                {formatTimer(remainingSec)}
              </Badge>
            )}
            {quiz.attempts.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowHistory((v) => !v)}
                className="gap-1.5 text-xs"
              >
                <History className="h-3.5 w-3.5" />
                Lịch sử ({quiz.attempts.length})
              </Button>
            )}
          </div>
        </CardHeader>

        {showHistory && quiz.attempts.length > 0 && (
          <CardContent className="border-t border-border pt-4">
            <div className="space-y-2 text-xs">
              {quiz.attempts.map((a, idx) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2"
                >
                  <span>
                    Lần #{quiz.attempts.length - idx} •{' '}
                    {new Date(a.submittedAt).toLocaleString('vi-VN')}
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span>
                      {a.correctCount}/{a.totalQuestions} câu ({a.scorePercent}%)
                    </span>
                    <Badge variant={a.passed ? 'success' : 'destructive'} className="text-[10px]">
                      {a.passed ? 'ĐẠT' : 'CHƯA ĐẠT'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Result Banner */}
      {result && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5',
            result.attempt.passed
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-destructive/40 bg-destructive/10',
          )}
        >
          <div className="flex items-center gap-3">
            {result.attempt.passed ? (
              <CheckCircle2 className="h-9 w-9 shrink-0 text-emerald-500" />
            ) : (
              <XCircle className="h-9 w-9 shrink-0 text-destructive" />
            )}
            <div>
              <h3 className="text-base font-bold">
                {result.attempt.passed
                  ? `Chúc mừng! Bạn đạt ${result.attempt.scorePercent}%`
                  : `Bạn đạt ${result.attempt.scorePercent}% (Yêu cầu ${result.attempt.passScorePercent}%)`}
              </h3>
              <p className="text-xs text-muted-foreground">
                Đúng {result.attempt.correctCount}/{result.attempt.totalQuestions} câu hỏi. Xem giải
                thích chi tiết từng câu bên dưới.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={handleRetry} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Làm lại bài Quiz
          </Button>
        </div>
      )}

      {/* Questions List */}
      <div className="space-y-4">
        {quiz.questions.map((question, qIdx) => {
          const chosen = selectedMap[question.id] ?? [];
          const fb = feedbackMap.get(question.id);
          const isMulti = question.type === QuizQuestionType.MULTI_CHOICE;

          return (
            <Card
              key={question.id}
              className={cn(
                fb &&
                  (fb.isCorrect
                    ? 'border-emerald-500/40'
                    : 'border-destructive/40'),
              )}
            >
              <CardContent className="space-y-3.5 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        Câu {qIdx + 1}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {isMulti ? 'Chọn nhiều đáp án đúng' : 'Chọn 1 đáp án đúng'}
                      </span>
                    </div>
                    <div className="text-sm font-semibold leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                        {question.promptMd}
                      </ReactMarkdown>
                    </div>
                  </div>
                  {fb && (
                    <Badge variant={fb.isCorrect ? 'success' : 'destructive'}>
                      {fb.isCorrect ? 'Đúng' : 'Sai'}
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  {question.options.map((opt) => {
                    const isSelected = chosen.includes(opt.id);
                    const isCorrectOpt = fb?.correctOptionIds.includes(opt.id) ?? false;
                    const isWrongSelected = Boolean(fb && isSelected && !isCorrectOpt);

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={Boolean(result)}
                        onClick={() => toggleOption(question.id, opt.id, question.type)}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all disabled:cursor-default',
                          fb
                            ? isCorrectOpt
                              ? 'border-emerald-500 bg-emerald-500/15 font-medium'
                              : isWrongSelected
                                ? 'border-destructive bg-destructive/15'
                                : 'border-border opacity-70'
                            : isSelected
                              ? 'border-primary bg-primary/10 font-medium ring-1 ring-primary'
                              : 'border-border hover:bg-secondary/50',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center border text-[10px]',
                            isMulti ? 'rounded-sm' : 'rounded-full',
                            isSelected || isCorrectOpt
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/50',
                          )}
                        >
                          {(isSelected || (fb && isCorrectOpt)) && '✓'}
                        </span>
                        <span className="flex-1">{opt.content}</span>
                      </button>
                    );
                  })}
                </div>

                {fb?.explanationMd && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed">
                    <p className="mb-1 font-semibold text-primary">Giải thích đáp án:</p>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                      {fb.explanationMd}
                    </ReactMarkdown>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Submit Bar */}
      {!result && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            Đã trả lời{' '}
            <strong className="font-mono text-foreground">
              {answeredCount}/{quiz.questions.length}
            </strong>{' '}
            câu hỏi
          </p>
          <Button
            size="lg"
            disabled={answeredCount === 0 || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
            className="gap-2"
          >
            {submitMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Nộp bài &amp; Chấm điểm ngay
          </Button>
        </div>
      )}
    </div>
  );
}
