'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { formatDuration } from '@try4t/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, getApiBaseUrl } from '@/lib/api-client';
import { notify } from '@/lib/notify';

interface VerifiedCertificate {
  verified: boolean;
  certCode: string;
  recipientName: string;
  courseTitle: string;
  instructorName: string;
  issuedAt: string;
  pdfPath: string;
  verifyUrl: string;
  course: {
    id: string;
    slug: string;
    thumbnailUrl: string | null;
    totalDurationSec: number;
    totalLessons: number;
    category: { name: string } | null;
  };
}

export default function VerifyCertificatePage() {
  const params = useParams<{ certCode: string }>();
  const certCode = decodeURIComponent(params.certCode ?? '');
  const [copied, setCopied] = React.useState(false);

  const { data: cert, isLoading, error } = useQuery({
    queryKey: ['public-verify-cert', certCode],
    queryFn: () =>
      api.get<VerifiedCertificate>(`/certificates/verify/${encodeURIComponent(certCode)}`),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-12 sm:px-6">
        <Skeleton className="h-12 w-72 rounded-xl" />
        <Skeleton className="h-[460px] w-full rounded-3xl" />
      </div>
    );
  }

  if (error || !cert) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <XCircle className="h-9 w-9" />
        </div>
        <h1 className="text-xl font-bold">Chứng chỉ không tồn tại hoặc không hợp lệ</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Không tìm thấy dữ liệu xác thực cho mã{' '}
          <span className="font-mono font-semibold text-foreground">{certCode}</span> trên hệ thống
          Try4T.
        </p>
        <Link href="/courses" className="mt-6">
          <Button>Khám phá khóa học trên Try4T</Button>
        </Link>
      </div>
    );
  }

  const pdfDownloadUrl = `${getApiBaseUrl()}/certificates/${encodeURIComponent(cert.certCode)}/pdf?download=1`;
  const pdfPreviewUrl = `${getApiBaseUrl()}/certificates/${encodeURIComponent(cert.certCode)}/pdf`;

  function handleCopyLink() {
    const url = typeof window !== 'undefined' ? window.location.href : cert?.verifyUrl ?? '';
    void navigator.clipboard.writeText(url);
    setCopied(true);
    notify.success('Đã sao chép đường dẫn xác thực chứng chỉ');
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      {/* Verification Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              Chứng chỉ đã được Try4T xác thực hợp lệ
            </p>
            <p className="text-xs text-muted-foreground">
              Mã định danh duy nhất:{' '}
              <span className="font-mono font-bold text-foreground">{cert.certCode}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handleCopyLink} className="gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            Sao chép link
          </Button>
          <a href={pdfPreviewUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              Xem bản PDF
            </Button>
          </a>
          <a href={pdfDownloadUrl} target="_blank" rel="noreferrer">
            <Button size="sm" className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Tải PDF + QR
            </Button>
          </a>
        </div>
      </div>

      {/* Coursera-style Framed Certificate Showcase */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-emerald-700/40 bg-gradient-to-br from-[#f4fbf7] via-white to-[#ecfdf5] p-8 text-slate-900 shadow-xl sm:p-12 dark:border-emerald-500/40">
        {/* Left Emerald Ribbon */}
        <div className="absolute inset-y-0 left-0 w-4 bg-emerald-800" />
        <div className="absolute inset-y-0 left-4 w-1.5 bg-emerald-400" />

        <div className="ml-4 space-y-7 text-center">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-extrabold tracking-tight text-emerald-900">Try4T</span>
              <span className="text-xs font-medium text-emerald-600">
                | PRACTICAL CERTIFICATION
              </span>
            </div>
            <Badge className="bg-emerald-100 font-mono text-xs font-bold text-emerald-900 hover:bg-emerald-100">
              {cert.certCode}
            </Badge>
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-xs font-bold tracking-[0.22em] text-emerald-700 uppercase">
              CHỨNG CHỈ HOÀN THÀNH KHÓA HỌC
            </p>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-4xl">
              CERTIFICATE OF COMPLETION
            </h1>
            <div className="mx-auto h-1 w-28 rounded-full bg-emerald-500" />
          </div>

          <div className="space-y-2">
            <p className="text-sm text-slate-600">Trân trọng chứng nhận học viên</p>
            <p className="text-3xl font-extrabold text-emerald-950 sm:text-4xl">
              {cert.recipientName}
            </p>
            <p className="text-sm text-slate-600">
              đã hoàn thành xuất sắc 100% chương trình đào tạo và bài đánh giá của khóa học
            </p>
          </div>

          <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-200 bg-white/90 px-6 py-4 shadow-xs">
            <p className="text-lg font-bold text-slate-900 sm:text-xl">{cert.courseTitle}</p>
          </div>

          <div className="grid gap-6 pt-4 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="font-bold text-slate-900">{cert.instructorName}</p>
              <div className="mx-auto h-px w-36 bg-slate-300" />
              <p className="text-xs text-slate-500">Giảng viên hướng dẫn</p>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Award className="h-7 w-7" />
              </span>
              <p className="mt-1 text-xs font-semibold text-emerald-800">Try4T Verified Seal</p>
            </div>
            <div className="space-y-1">
              <p className="font-mono font-bold text-slate-900">
                {new Date(cert.issuedAt).toLocaleDateString('vi-VN')}
              </p>
              <div className="mx-auto h-px w-36 bg-slate-300" />
              <p className="text-xs text-slate-500">Ngày cấp chứng chỉ</p>
            </div>
          </div>
        </div>
      </div>

      {/* Course Metadata Card */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-4">
            {cert.course.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cert.course.thumbnailUrl}
                alt={cert.courseTitle}
                className="h-16 w-28 rounded-xl object-cover"
              />
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {cert.course.category && <Badge variant="secondary">{cert.course.category.name}</Badge>}
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 100% Hoàn thành
                </span>
              </div>
              <p className="font-bold">{cert.courseTitle}</p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" /> {cert.course.totalLessons} bài học
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Thời lượng {formatDuration(cert.course.totalDurationSec)}
                </span>
              </div>
            </div>
          </div>

          <Link href={`/courses/${cert.course.slug}`}>
            <Button variant="outline" size="sm">
              Xem thông tin khóa học
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
