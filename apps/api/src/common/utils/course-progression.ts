import type { CourseProgressionConfig, LessonVersionSnapshot } from '@try4t/shared';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';

export function normalizeProgressionConfig(
  raw: unknown,
  legacySequentialLock: boolean,
): CourseProgressionConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const modeRaw = obj?.mode;
  const mode =
    modeRaw === 'FREE' || modeRaw === 'LESSON_SEQUENTIAL' || modeRaw === 'SECTION_SEQUENTIAL'
      ? modeRaw
      : legacySequentialLock
        ? 'LESSON_SEQUENTIAL'
        : 'FREE';

  const blockFastForward =
    typeof obj?.blockFastForward === 'boolean' ? obj.blockFastForward : mode !== 'FREE';

  const rawAhead = Number(obj?.maxSeekAheadPercent);
  const maxSeekAheadPercent =
    Number.isFinite(rawAhead) && rawAhead >= 0 && rawAhead <= 30 ? Math.round(rawAhead) : 0;

  const requireQuizPass = typeof obj?.requireQuizPass === 'boolean' ? obj.requireQuizPass : true;

  return {
    mode,
    blockFastForward,
    maxSeekAheadPercent,
    requireQuizPass,
  };
}

export async function readCourseProgressionConfig(
  prisma: PrismaService,
  courseId: string,
  legacySequentialLock: boolean,
): Promise<CourseProgressionConfig> {
  try {
    const rows = await prisma.$queryRaw<Array<{ progression_config: unknown }>>`
      SELECT progression_config FROM courses WHERE id = ${courseId}::uuid LIMIT 1
    `;
    return normalizeProgressionConfig(rows[0]?.progression_config, legacySequentialLock);
  } catch {
    return normalizeProgressionConfig(null, legacySequentialLock);
  }
}

export async function writeCourseProgressionConfig(
  prisma: PrismaService,
  courseId: string,
  config: CourseProgressionConfig,
): Promise<void> {
  const jsonText = JSON.stringify(config);
  await prisma.$executeRaw`
    UPDATE courses
    SET progression_config = ${jsonText}::jsonb,
        sequential_lock_enabled = ${config.mode !== 'FREE'}
    WHERE id = ${courseId}::uuid
  `;
}

export function parseLessonVersions(raw: unknown): LessonVersionSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => ({
      version: typeof item.version === 'number' ? item.version : idx + 1,
      savedAt: typeof item.savedAt === 'string' ? item.savedAt : new Date().toISOString(),
      title: typeof item.title === 'string' ? item.title : 'Phiên bản trước',
      type: typeof item.type === 'string' ? item.type : 'VIDEO',
      videoStorageKey: typeof item.videoStorageKey === 'string' ? item.videoStorageKey : null,
      videoDurationSec: typeof item.videoDurationSec === 'number' ? item.videoDurationSec : 0,
      articleMd: typeof item.articleMd === 'string' ? item.articleMd : null,
    }));
}

export async function readLessonVersions(
  prisma: PrismaService,
  lessonId: string,
): Promise<LessonVersionSnapshot[]> {
  try {
    const rows = await prisma.$queryRaw<Array<{ version_history_json: unknown }>>`
      SELECT version_history_json FROM lessons WHERE id = ${lessonId}::uuid LIMIT 1
    `;
    return parseLessonVersions(rows[0]?.version_history_json);
  } catch {
    return [];
  }
}

export async function readLessonVersionsMap(
  prisma: PrismaService,
  courseId: string,
): Promise<Map<string, LessonVersionSnapshot[]>> {
  const map = new Map<string, LessonVersionSnapshot[]>();
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; version_history_json: unknown }>>`
      SELECT id::text AS id, version_history_json FROM lessons WHERE course_id = ${courseId}::uuid
    `;
    for (const r of rows) {
      map.set(r.id, parseLessonVersions(r.version_history_json));
    }
  } catch {
    // ignore if column unavailable
  }
  return map;
}

export async function writeLessonVersions(
  prisma: PrismaService,
  lessonId: string,
  versions: LessonVersionSnapshot[],
): Promise<void> {
  // Giới hạn lưu tối đa 15 phiên bản gần nhất để giữ JSONB gọn nhẹ
  const trimmed = versions.slice(-15);
  const jsonText = JSON.stringify(trimmed);
  await prisma.$executeRaw`
    UPDATE lessons
    SET version_history_json = ${jsonText}::jsonb
    WHERE id = ${lessonId}::uuid
  `;
}
