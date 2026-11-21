import {
  CourseLevel,
  CourseStatus,
  DiscountType,
  InstructorApplicationStatus,
  LessonType,
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PayoutStatus,
  PrismaClient,
  QuizQuestionType,
  Role,
  WalletTxType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { probeRemoteVideoDurationSec } from '../src/common/utils/video-duration';

const prisma = new PrismaClient();

const VIDEO_SAMPLES = [
  {
    url: 'https://res.cloudinary.com/demo/video/upload/elephants.mp4',
    fallbackSec: 53,
  },
  {
    url: 'https://res.cloudinary.com/demo/video/upload/sea_turtle.mp4',
    fallbackSec: 15,
  },
  {
    url: 'https://res.cloudinary.com/demo/video/upload/dog.mp4',
    fallbackSec: 13,
  },
  {
    url: 'https://res.cloudinary.com/demo/video/upload/ski_jump.mp4',
    fallbackSec: 5,
  },
];

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

async function resolveRealSampleDurations(): Promise<Map<string, number>> {
  console.log('Đang đọc thời lượng thực tế trực tiếp từ các tệp video MP4...');
  const map = new Map<string, number>();

  await Promise.all(
    VIDEO_SAMPLES.map(async (sample) => {
      const probed = await probeRemoteVideoDurationSec(sample.url);
      const sec = probed > 0 ? probed : sample.fallbackSec;
      map.set(sample.url, sec);
      console.log(
        `  - ${sample.url.split('/').pop()}: ${sec}s (${probed > 0 ? 'đọc trực tiếp từ header MP4' : 'fallback'})`,
      );
    }),
  );

  return map;
}

async function main() {
  console.log('Seeding full Try4T dataset (Phases 0–6)...');

  const now = new Date();
  const passwordHash = await bcrypt.hash('Try4T@123', 10);
  const realDurations = await resolveRealSampleDurations();

  // ============================================================================
  // 1. USERS (Admin, 3 Instructors, 6 Students + 1 Pending Instructor App)
  // ============================================================================
  const admin = await prisma.user.upsert({
    where: { email: 'admin@try4t.dev' },
    update: { emailVerifiedAt: now, failedLoginAttempts: 0, lockedUntil: null },
    create: {
      email: 'admin@try4t.dev',
      passwordHash,
      fullName: 'Try4T Admin',
      role: Role.ADMIN,
      emailVerifiedAt: now,
      headline: 'Quản trị viên nền tảng Try4T',
      bio: 'Điều phối hệ thống, kiểm duyệt chất lượng khóa học và đối soát thanh toán.',
    },
  });

  const instructorMain = await prisma.user.upsert({
    where: { email: 'instructor@try4t.dev' },
    update: { emailVerifiedAt: now, failedLoginAttempts: 0, lockedUntil: null },
    create: {
      email: 'instructor@try4t.dev',
      passwordHash,
      fullName: 'Đặng Đình Anh Tú',
      avatarUrl:
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=256&q=80',
      role: Role.INSTRUCTOR,
      emailVerifiedAt: now,
      headline: 'Senior Full-Stack Engineer & System Architect',
      bio: '8+ năm xây dựng hệ thống thương mại điện tử và nền tảng SaaS với TypeScript, Next.js, NestJS, Java Spring Boot và PostgreSQL.',
      instructorProfile: {
        create: {
          applicationStatus: InstructorApplicationStatus.APPROVED,
          phone: '0901234567',
          yearsOfExperience: 8,
          expertiseTopics: ['Next.js / React', 'Node.js / NestJS', 'Java Spring Boot', 'PostgreSQL / SQL'],
          portfolioUrl: 'https://github.com/x4tus',
          bankName: 'MB Bank',
          bankAccountNo: '090123456789',
          bankAccountName: 'DANG DINH ANH TU',
          platformFeeRate: 0.3,
          totalStudents: 1850,
          ratingAvg: 4.9,
        },
      },
    },
  });

  const instructorDesign = await prisma.user.upsert({
    where: { email: 'linh.design@try4t.dev' },
    update: { emailVerifiedAt: now },
    create: {
      email: 'linh.design@try4t.dev',
      passwordHash,
      fullName: 'Trần Khánh Linh',
      avatarUrl:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80',
      role: Role.INSTRUCTOR,
      emailVerifiedAt: now,
      headline: 'Lead Product Designer (Figma & Design Systems)',
      bio: 'Thiết kế sản phẩm cho các startup fintech & edtech tại Singapore và Việt Nam. Đam mê Design System tối giản, chuẩn UX.',
      instructorProfile: {
        create: {
          applicationStatus: InstructorApplicationStatus.APPROVED,
          phone: '0987654321',
          yearsOfExperience: 6,
          expertiseTopics: ['UI/UX Design', 'Figma', 'Design Systems'],
          portfolioUrl: 'https://dribbble.com',
          bankName: 'Techcombank',
          bankAccountNo: '190388889999',
          bankAccountName: 'TRAN KHANH LINH',
          platformFeeRate: 0.3,
          totalStudents: 920,
          ratingAvg: 4.8,
        },
      },
    },
  });

  const instructorCloud = await prisma.user.upsert({
    where: { email: 'hoang.devops@try4t.dev' },
    update: { emailVerifiedAt: now },
    create: {
      email: 'hoang.devops@try4t.dev',
      passwordHash,
      fullName: 'Phạm Quốc Hoàng',
      avatarUrl:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80',
      role: Role.INSTRUCTOR,
      emailVerifiedAt: now,
      headline: 'Principal DevOps & AI Infrastructure Engineer',
      bio: 'Chuyên gia Docker, Kubernetes, CI/CD, AWS/Cloudflare và triển khai hệ thống AI/RAG chịu tải thực tế.',
      instructorProfile: {
        create: {
          applicationStatus: InstructorApplicationStatus.APPROVED,
          phone: '0911223344',
          yearsOfExperience: 9,
          expertiseTopics: ['DevOps / Docker', 'AI / Data', 'Cloudflare / AWS'],
          portfolioUrl: 'https://github.com',
          bankName: 'Vietcombank',
          bankAccountNo: '0011004455667',
          bankAccountName: 'PHAM QUOC HOANG',
          platformFeeRate: 0.25,
          totalStudents: 1410,
          ratingAvg: 4.85,
        },
      },
    },
  });

  const studentMain = await prisma.user.upsert({
    where: { email: 'student@try4t.dev' },
    update: { emailVerifiedAt: now, failedLoginAttempts: 0, lockedUntil: null },
    create: {
      email: 'student@try4t.dev',
      passwordHash,
      fullName: 'Nguyễn Minh Khôi',
      avatarUrl:
        'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=256&q=80',
      role: Role.STUDENT,
      emailVerifiedAt: now,
      headline: 'Frontend Developer hướng tới Full-Stack',
      bio: 'Đam mê xây dựng sản phẩm web mượt mà và chuẩn kiến trúc.',
    },
  });

  const extraStudentsSpec = [
    {
      email: 'ha.my@try4t.dev',
      fullName: 'Lê Hà My',
      avatarUrl:
        'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=256&q=80',
      headline: 'Sinh viên năm 4 CNTT',
    },
    {
      email: 'anh.khoa@try4t.dev',
      fullName: 'Trần Anh Khoa',
      avatarUrl:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80',
      headline: 'Backend Developer (Node.js / Java)',
    },
    {
      email: 'minh.thu@try4t.dev',
      fullName: 'Phạm Minh Thư',
      avatarUrl:
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&q=80',
      headline: 'Product Designer chuyển sang Frontend',
    },
    {
      email: 'gia.bao@try4t.dev',
      fullName: 'Hoàng Gia Bảo',
      avatarUrl:
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=256&q=80',
      headline: 'Fresher Software Engineer',
    },
    {
      email: 'phuong.linh@try4t.dev',
      fullName: 'Ngô Phương Linh',
      avatarUrl:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
      headline: 'Data Analyst & AI Enthusiast',
    },
  ];

  const extraStudents = [];
  for (const s of extraStudentsSpec) {
    const u = await prisma.user.upsert({
      where: { email: s.email },
      update: { emailVerifiedAt: now },
      create: {
        email: s.email,
        passwordHash,
        fullName: s.fullName,
        avatarUrl: s.avatarUrl,
        role: Role.STUDENT,
        emailVerifiedAt: now,
        headline: s.headline,
      },
    });
    extraStudents.push(u);
  }
  const studentTwo = extraStudents[0]!;

  // 1 ứng viên đang chờ Admin duyệt hồ sơ Giảng viên
  await prisma.user.upsert({
    where: { email: 'applicant@try4t.dev' },
    update: { emailVerifiedAt: now },
    create: {
      email: 'applicant@try4t.dev',
      passwordHash,
      fullName: 'Vũ Đức Mạnh',
      role: Role.STUDENT,
      emailVerifiedAt: now,
      headline: 'Senior Flutter & React Native Engineer (5 năm KN)',
      bio: 'Từng lead team Mobile 6 người cho ứng dụng đặt lịch y tế hơn 200.000 người dùng. Đã hướng dẫn hơn 40 intern và tổ chức workshop nội bộ hàng tháng.',
      instructorProfile: {
        create: {
          applicationStatus: InstructorApplicationStatus.PENDING,
          phone: '0933445566',
          yearsOfExperience: 5,
          expertiseTopics: ['Flutter', 'React Native', 'Mobile App', 'Clean Architecture'],
          portfolioUrl: 'https://github.com/vuducmanh-dev',
          demoVideoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          teachingPlan:
            'Dự kiến xây dựng khóa "Flutter Clean Architecture & Thanh toán thực tế" gồm 6 chương, 38 bài học Video kèm 3 bài kiểm tra cuối chương.',
          bankName: 'VPBank',
          bankAccountNo: '2026889911',
          bankAccountName: 'VU DUC MANH',
          submittedAt: now,
        },
      },
    },
  });

  // ============================================================================
  // 2. CATEGORIES (6 Core Categories)
  // ============================================================================
  const categoriesData = [
    { name: 'Lập trình Web', slug: 'lap-trinh-web', icon: 'Globe', sortOrder: 1 },
    { name: 'Backend & Kiến trúc hệ thống', slug: 'backend-kien-truc', icon: 'Server', sortOrder: 2 },
    { name: 'Mobile App', slug: 'mobile-app', icon: 'Smartphone', sortOrder: 3 },
    { name: 'UI/UX Design', slug: 'ui-ux-design', icon: 'Palette', sortOrder: 4 },
    { name: 'DevOps & Cloud', slug: 'devops-cloud', icon: 'Cloud', sortOrder: 5 },
    { name: 'AI & Data Engineering', slug: 'ai-data', icon: 'Sparkles', sortOrder: 6 },
  ];

  const catMap = new Map<string, string>();
  for (const cat of categoriesData) {
    const rec = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, icon: cat.icon, sortOrder: cat.sortOrder },
      create: cat,
    });
    catMap.set(cat.slug, rec.id);
  }

  // ============================================================================
  // 3. COURSES (12 PUBLISHED + 2 PENDING_REVIEW + 1 REJECTED = 15 Courses)
  // ============================================================================
  const coursesToSeed = [
    {
      slug: 'fullstack-nextjs-nestjs-thuc-chien',
      instructorId: instructorMain.id,
      categorySlug: 'lap-trinh-web',
      title: 'Full-Stack Next.js 15 & NestJS Monorepo Thực Chiến',
      subtitle:
        'Xây dựng nền tảng LMS thương mại hoàn chỉnh với TypeScript end-to-end, Prisma, PostgreSQL, OAuth 2.0 & Direct Cloud Upload.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.INTERMEDIATE,
      priceVnd: 1_290_000,
      salePriceVnd: 699_000,
      status: CourseStatus.PUBLISHED,
      sequentialLockEnabled: true,
      ratingAvg: 4.9,
      ratingCount: 42,
      enrollmentCount: 318,
    },
    {
      slug: 'kien-truc-backend-clean-architecture-thuc-te',
      instructorId: instructorMain.id,
      categorySlug: 'backend-kien-truc',
      title: 'Thiết Kế Hệ Thống Backend & SQL Nâng Cao Cho Developer',
      subtitle:
        'Làm chủ Indexing, ACID Transaction, chống Race Condition khi thanh toán Webhook và tối ưu truy vấn chịu tải cao.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.ADVANCED,
      priceVnd: 1_490_000,
      salePriceVnd: 890_000,
      status: CourseStatus.PUBLISHED,
      sequentialLockEnabled: false,
      ratingAvg: 4.8,
      ratingCount: 27,
      enrollmentCount: 194,
    },
    {
      slug: 'khoi-dau-typescript-va-deploy-cloud-mien-phi',
      instructorId: instructorMain.id,
      categorySlug: 'devops-cloud',
      title: 'Nhập Môn TypeScript & Deploy Web Lên Cloud Miễn Phí (0đ)',
      subtitle:
        'Khóa học hoàn toàn miễn phí giúp bạn nắm chắc TypeScript từ số 0 và đưa sản phẩm đầu tiên lên Vercel, Render & Neon.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.BEGINNER,
      priceVnd: 0,
      salePriceVnd: null,
      status: CourseStatus.PUBLISHED,
      sequentialLockEnabled: false,
      ratingAvg: 4.9,
      ratingCount: 65,
      enrollmentCount: 842,
    },
    {
      slug: 'java-spring-boot-3-enterprise-ecommerce',
      instructorId: instructorMain.id,
      categorySlug: 'backend-kien-truc',
      title: 'Java 21 & Spring Boot 4 — Xây Dựng Hệ Thống E-Commerce Chuẩn Enterprise',
      subtitle:
        'Master Spring Security JWT, JPA/Hibernate tối ưu N+1 Query, Cloudinary Upload, SQL Server & Thanh toán VietQR.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.INTERMEDIATE,
      priceVnd: 1_590_000,
      salePriceVnd: 799_000,
      status: CourseStatus.PUBLISHED,
      sequentialLockEnabled: true,
      ratingAvg: 4.9,
      ratingCount: 53,
      enrollmentCount: 412,
    },
    {
      slug: 'react-19-tailwind-shadcn-ui-masterclass',
      instructorId: instructorMain.id,
      categorySlug: 'lap-trinh-web',
      title: 'React 19, Tailwind CSS v4 & shadcn/ui — Thiết Kế Giao Diện Chuẩn SaaS',
      subtitle:
        'Xây dựng Dashboard, Pop-up UX, Drag-and-drop dnd-kit, Dark Mode & Animation mượt mà phong cách Linear/Vercel.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1587620962725-abab7fe55159?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.BEGINNER,
      priceVnd: 890_000,
      salePriceVnd: 449_000,
      status: CourseStatus.PUBLISHED,
      sequentialLockEnabled: false,
      ratingAvg: 4.8,
      ratingCount: 38,
      enrollmentCount: 289,
    },
    {
      slug: 'figma-design-system-tu-zero-den-pro',
      instructorId: instructorDesign.id,
      categorySlug: 'ui-ux-design',
      title: 'Figma Auto Layout & Design System Thực Chiến Cho Product Designer',
      subtitle:
        'Xây dựng thư viện Component dùng lại hàng trăm màn hình, Token màu Dark/Light và bàn giao Dev mượt mà.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.ALL,
      priceVnd: 990_000,
      salePriceVnd: 590_000,
      status: CourseStatus.PUBLISHED,
      sequentialLockEnabled: false,
      ratingAvg: 4.9,
      ratingCount: 49,
      enrollmentCount: 365,
    },
    {
      slug: 'ux-research-va-toi-uu-chuyen-doi-web-app',
      instructorId: instructorDesign.id,
      categorySlug: 'ui-ux-design',
      title: 'Tư Duy UX Research & Tối Ưu Tỷ Lệ Chuyển Đổi Cho Sản Phẩm Số',
      subtitle:
        'Khóa nền tảng miễn phí giúp Developer và Designer hiểu hành vi người dùng, giảm drop-off ở các luồng đăng ký & thanh toán.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.BEGINNER,
      priceVnd: 0,
      salePriceVnd: null,
      status: CourseStatus.PUBLISHED,
      sequentialLockEnabled: false,
      ratingAvg: 4.7,
      ratingCount: 31,
      enrollmentCount: 510,
    },
    {
      slug: 'react-native-expo-xay-dung-app-ios-android',
      instructorId: instructorMain.id,
      categorySlug: 'mobile-app',
      title: 'React Native & Expo Router — Code 1 Lần Chạy Mượt Cả iOS & Android',
      subtitle:
        'Tận dụng kỹ năng React/TypeScript để làm App học tập di động có phát video nền, Push Notification & Thanh toán In-App.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.INTERMEDIATE,
      priceVnd: 1_190_000,
      salePriceVnd: 649_000,
      status: CourseStatus.PUBLISHED,
      sequentialLockEnabled: false,
      ratingAvg: 4.6,
      ratingCount: 19,
      enrollmentCount: 156,
    },
    {
      slug: 'flutter-state-management-riverpod-clean-arch',
      instructorId: instructorCloud.id,
      categorySlug: 'mobile-app',
      title: 'Flutter 3 Thực Chiến Với Riverpod & Clean Architecture',
      subtitle:
        'Xây dựng ứng dụng quản lý tài chính cá nhân mượt 60fps, đồng bộ Offline-first và phát hành lên App Store / Google Play.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1551650975-87deedd944c3?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.INTERMEDIATE,
      priceVnd: 1_090_000,
      salePriceVnd: null,
      status: CourseStatus.PUBLISHED,
      sequentialLockEnabled: false,
      ratingAvg: 4.5,
      ratingCount: 14,
      enrollmentCount: 122,
    },
    {
      slug: 'docker-kubernetes-ci-cd-tu-co-ban-den-production',
      instructorId: instructorCloud.id,
      categorySlug: 'devops-cloud',
      title: 'Docker, Kubernetes & GitHub Actions CI/CD Chuẩn Production',
      subtitle:
        'Đóng gói container siêu nhẹ (Multi-stage build), zero-downtime deployment, monitoring Grafana & tối ưu chi phí server.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.ADVANCED,
      priceVnd: 1_890_000,
      salePriceVnd: 990_000,
      status: CourseStatus.PUBLISHED,
      sequentialLockEnabled: true,
      ratingAvg: 4.9,
      ratingCount: 61,
      enrollmentCount: 478,
    },
    {
      slug: 'ai-agent-rag-langchain-cho-lap-trinh-vien-web',
      instructorId: instructorCloud.id,
      categorySlug: 'ai-data',
      title: 'Xây Dựng AI Agent & Hệ Thống RAG Với Gemini API + Vector Database',
      subtitle:
        'Tích hợp trợ lý AI thông minh vào web app thực tế: semantic search, function calling, streaming response & kiểm soát chi phí token.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.INTERMEDIATE,
      priceVnd: 1_690_000,
      salePriceVnd: 899_000,
      status: CourseStatus.PUBLISHED,
      sequentialLockEnabled: false,
      ratingAvg: 5.0,
      ratingCount: 34,
      enrollmentCount: 267,
    },
    {
      slug: 'python-data-analytics-sql-cho-nguoi-moi',
      instructorId: instructorCloud.id,
      categorySlug: 'ai-data',
      title: 'Phân Tích Dữ Liệu Thực Chiến Với Python, Pandas & SQL',
      subtitle:
        'Làm sạch dữ liệu, trực quan hóa KPI kinh doanh, phân tích Drop-off Funnel và xây dựng báo cáo tự động.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.BEGINNER,
      priceVnd: 790_000,
      salePriceVnd: 399_000,
      status: CourseStatus.PUBLISHED,
      sequentialLockEnabled: false,
      ratingAvg: 4.4,
      ratingCount: 22,
      enrollmentCount: 205,
    },
    {
      slug: 'golang-microservices-grpc-high-performance',
      instructorId: instructorCloud.id,
      categorySlug: 'backend-kien-truc',
      title: 'Golang Microservices & gRPC Chịu Tải 10.000 Request/Giây',
      subtitle:
        'Khóa học mẫu đang ở trạng thái PENDING_REVIEW để bạn test ngay quy trình Admin Kiểm duyệt & Xuất bản.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.ADVANCED,
      priceVnd: 1_990_000,
      salePriceVnd: 1_190_000,
      status: CourseStatus.PENDING_REVIEW,
      sequentialLockEnabled: true,
      ratingAvg: 0,
      ratingCount: 0,
      enrollmentCount: 0,
    },
    {
      slug: 'motion-ui-va-micro-interactions-voi-framer',
      instructorId: instructorDesign.id,
      categorySlug: 'ui-ux-design',
      title: 'Micro-Interactions & Motion Design Tinh Tế Cho Web Hiện Đại',
      subtitle:
        'Tạo chuyển động tinh gọn chuẩn Apple/Linear — đang chờ Admin phê duyệt nội dung trước khi lên kệ.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.INTERMEDIATE,
      priceVnd: 690_000,
      salePriceVnd: 490_000,
      status: CourseStatus.PENDING_REVIEW,
      sequentialLockEnabled: false,
      ratingAvg: 0,
      ratingCount: 0,
      enrollmentCount: 0,
    },
    {
      slug: 'html-css-sieu-toc-trong-7-ngay-nhap',
      instructorId: instructorMain.id,
      categorySlug: 'lap-trinh-web',
      title: 'HTML5 & CSS3 Hiện Đại — Responsive Từ Cơ Bản Đến Nâng Cao',
      subtitle:
        'Khóa học mẫu trạng thái REJECTED để test hiển thị góp ý từ Admin trên Instructor Studio.',
      thumbnailUrl:
        'https://images.unsplash.com/photo-1542831371-29b0f74f9713?auto=format&fit=crop&w=1280&q=80',
      level: CourseLevel.BEGINNER,
      priceVnd: 490_000,
      salePriceVnd: 299_000,
      status: CourseStatus.REJECTED,
      sequentialLockEnabled: false,
      ratingAvg: 0,
      ratingCount: 0,
      enrollmentCount: 0,
      rejectionNote:
        'Âm thanh bài học thử Chương 1 hơi nhỏ, vui lòng tăng âm lượng và bổ sung thêm 1 bài Quiz ôn tập cuối chương nhé!',
    },
  ];

  const courseBySlug = new Map<string, { id: string; title: string; instructorId: string; priceVnd: number; salePriceVnd: number | null }>();

  for (let idx = 0; idx < coursesToSeed.length; idx++) {
    const item = coursesToSeed[idx]!;
    const existing = await prisma.course.findUnique({
      where: { slug: item.slug },
      select: { id: true, title: true, instructorId: true, priceVnd: true, salePriceVnd: true },
    });

    if (existing) {
      courseBySlug.set(item.slug, existing);
      continue;
    }

    const v1 = VIDEO_SAMPLES[idx % VIDEO_SAMPLES.length]!;
    const v2 = VIDEO_SAMPLES[(idx + 1) % VIDEO_SAMPLES.length]!;
    const v1Sec = realDurations.get(v1.url) ?? v1.fallbackSec;
    const v2Sec = realDurations.get(v2.url) ?? v2.fallbackSec;

    const sectionsTemplate = [
      {
        title: 'Chương 1: Tư duy cốt lõi & Cài đặt môi trường chuẩn',
        lessons: [
          {
            title: 'Giới thiệu lộ trình & Demo sản phẩm cuối khóa',
            type: LessonType.VIDEO,
            isFreePreview: true,
            videoStorageKey: v1.url,
            videoDurationSec: v1Sec,
          },
          {
            title: 'Tài liệu hướng dẫn cài đặt & Checklist kiến trúc dự án',
            type: LessonType.ARTICLE,
            isFreePreview: true,
            videoDurationSec: 180,
            articleMd: `# Tổng quan kỹ thuật — ${item.title}\n\nChào mừng bạn đến với khóa học trên **Try4T**! Dưới đây là các bước chuẩn bị nhanh:\n\n\`\`\`bash\n# Kiểm tra môi trường trước khi bắt đầu\nnode -v\ngit --version\n\`\`\`\n\n### Bạn sẽ xây dựng được gì?\n- Quy trình làm việc chuẩn nhóm sản phẩm thực tế.\n- Tối ưu hiệu năng, bảo mật và trải nghiệm người dùng.\n- Hoàn thành 100% bài học & Quiz để nhận **Chứng chỉ PDF + QR xác thực**.`,
          },
          {
            title: 'Phân tích bài toán thực tế & Thiết kế dữ liệu cốt lõi',
            type: LessonType.VIDEO,
            isFreePreview: false,
            videoStorageKey: v2.url,
            videoDurationSec: v2Sec,
          },
        ],
      },
      {
        title: 'Chương 2: Triển khai tính năng nâng cao & Kiểm tra kiến thức',
        lessons: [
          {
            title: 'Xử lý Edge-case, Bảo mật & Tối ưu hiệu năng thực tế',
            type: LessonType.VIDEO,
            isFreePreview: false,
            videoStorageKey: v1.url,
            videoDurationSec: v1Sec,
          },
          {
            title: 'Quiz kiểm tra kiến thức trọng tâm cuối chương',
            type: LessonType.QUIZ,
            isFreePreview: false,
            videoDurationSec: 300,
            quiz: {
              passScorePercent: 70,
              questions: [
                {
                  promptMd:
                    'Nguyên tắc nào quan trọng nhất khi thiết kế hệ thống có thể mở rộng lâu dài?',
                  type: QuizQuestionType.SINGLE_CHOICE,
                  explanationMd:
                    'Tách biệt rõ trách nhiệm từng module (Separation of Concerns) giúp bảo trì và nâng cấp cực kỳ dễ dàng.',
                  options: [
                    { content: 'Tách biệt rõ ràng trách nhiệm giữa các tầng/module', isCorrect: true },
                    { content: 'Gộp toàn bộ logic vào 1 file duy nhất cho nhanh', isCorrect: false },
                    { content: 'Bỏ qua bước kiểm tra kiểu dữ liệu đầu vào', isCorrect: false },
                  ],
                },
                {
                  promptMd: 'Đâu là các bước bắt buộc trước khi đưa tính năng lên Production?',
                  type: QuizQuestionType.MULTI_CHOICE,
                  explanationMd:
                    'Luôn kiểm tra validation đầu vào, phân quyền bảo mật và chạy kiểm thử build sạch.',
                  options: [
                    { content: 'Validate dữ liệu cả Frontend lẫn Backend', isCorrect: true },
                    { content: 'Kiểm tra phân quyền RBAC / Ownership', isCorrect: true },
                    { content: 'Commit thẳng file .env chứa secret lên GitHub', isCorrect: false },
                  ],
                },
              ],
            },
          },
        ],
      },
    ];

    const totalLessons = sectionsTemplate.reduce((a, s) => a + s.lessons.length, 0);
    const totalDurationSec = sectionsTemplate.reduce(
      (a, s) => a + s.lessons.reduce((la, l) => la + l.videoDurationSec, 0),
      0,
    );

    const createdCourse = await prisma.course.create({
      data: {
        instructorId: item.instructorId,
        categoryId: catMap.get(item.categorySlug) ?? null,
        title: item.title,
        slug: item.slug,
        subtitle: item.subtitle,
        descriptionMd: `## Điểm nổi bật của khóa học\n\n${item.subtitle}\n\n- Lộ trình bài bản gồm **${sectionsTemplate.length} chương** và **${totalLessons} bài học** kết hợp Video, bài đọc Markdown và Quiz thực chiến.\n- Hỗ trợ **Ghi chú theo mốc thời gian video** và **Hỏi đáp Q&A** trực tiếp cùng giảng viên.\n- Cấp **Chứng chỉ điện tử (PDF + QR)** xác thực công khai sau khi hoàn thành 100%.`,
        thumbnailUrl: item.thumbnailUrl,
        level: item.level,
        priceVnd: item.priceVnd,
        salePriceVnd: item.salePriceVnd,
        status: item.status,
        sequentialLockEnabled: item.sequentialLockEnabled,
        minWatchPercent: 80,
        totalLessons,
        totalDurationSec,
        ratingAvg: item.ratingAvg,
        ratingCount: item.ratingCount,
        enrollmentCount: item.enrollmentCount,
        publishedAt: item.status === CourseStatus.PUBLISHED ? daysAgo(idx + 5) : null,
      },
    });

    courseBySlug.set(item.slug, {
      id: createdCourse.id,
      title: createdCourse.title,
      instructorId: createdCourse.instructorId,
      priceVnd: createdCourse.priceVnd,
      salePriceVnd: createdCourse.salePriceVnd,
    });

    for (let sIdx = 0; sIdx < sectionsTemplate.length; sIdx++) {
      const sec = sectionsTemplate[sIdx]!;
      const createdSec = await prisma.courseSection.create({
        data: { courseId: createdCourse.id, title: sec.title, sortOrder: sIdx },
      });

      for (let lIdx = 0; lIdx < sec.lessons.length; lIdx++) {
        const les = sec.lessons[lIdx]!;
        const createdLes = await prisma.lesson.create({
          data: {
            courseId: createdCourse.id,
            sectionId: createdSec.id,
            title: les.title,
            type: les.type,
            sortOrder: lIdx,
            isFreePreview: les.isFreePreview,
            videoStorageKey: 'videoStorageKey' in les ? (les.videoStorageKey ?? null) : null,
            videoDurationSec: les.videoDurationSec,
            articleMd: 'articleMd' in les ? (les.articleMd ?? null) : null,
          },
        });

        if ('quiz' in les && les.quiz) {
          await prisma.quiz.create({
            data: {
              lessonId: createdLes.id,
              passScorePercent: les.quiz.passScorePercent,
              questions: {
                create: les.quiz.questions.map((q, qIdx) => ({
                  promptMd: q.promptMd,
                  type: q.type,
                  explanationMd: q.explanationMd,
                  sortOrder: qIdx,
                  options: {
                    create: q.options.map((o, oIdx) => ({
                      content: o.content,
                      isCorrect: o.isCorrect,
                      sortOrder: oIdx,
                    })),
                  },
                })),
              },
            },
          });
        }
      }
    }

    if (item.status === CourseStatus.PENDING_REVIEW) {
      await prisma.courseReviewLog.create({
        data: {
          courseId: createdCourse.id,
          actorId: item.instructorId,
          fromStatus: CourseStatus.DRAFT,
          toStatus: CourseStatus.PENDING_REVIEW,
          note: 'Giảng viên gửi yêu cầu kiểm duyệt xuất bản khóa học.',
        },
      });
    } else if (item.status === CourseStatus.REJECTED && 'rejectionNote' in item && item.rejectionNote) {
      await prisma.courseReviewLog.create({
        data: {
          courseId: createdCourse.id,
          actorId: admin.id,
          fromStatus: CourseStatus.PENDING_REVIEW,
          toStatus: CourseStatus.REJECTED,
          note: item.rejectionNote,
        },
      });
    }
  }

  // Đồng bộ lại URL phát sống (thay link 403 cũ bằng Cloudinary MP4) + thời lượng thực tế đọc trực tiếp từ video!
  console.log('Đồng bộ video Cloudinary MP4 & thời lượng thực tế đọc từ tệp video...');
  const allVideoLessons = await prisma.lesson.findMany({
    where: { type: LessonType.VIDEO, videoStorageKey: { not: null } },
    orderBy: [{ courseId: 'asc' }, { sortOrder: 'asc' }],
    select: { id: true, videoStorageKey: true, videoDurationSec: true },
  });

  const probedCache = new Map(realDurations);
  for (let i = 0; i < allVideoLessons.length; i++) {
    const les = allVideoLessons[i]!;
    let nextKey = les.videoStorageKey!;
    if (
      nextKey.includes('commondatastorage.googleapis.com') ||
      nextKey.includes('storage.googleapis.com/gtv-videos-bucket')
    ) {
      nextKey = VIDEO_SAMPLES[i % VIDEO_SAMPLES.length]!.url;
    }

    let realSec = probedCache.get(nextKey);
    if (realSec === undefined && nextKey.startsWith('http')) {
      realSec = await probeRemoteVideoDurationSec(nextKey);
      probedCache.set(nextKey, realSec);
    }

    const nextDuration = realSec && realSec > 0 ? realSec : les.videoDurationSec;
    if (nextKey !== les.videoStorageKey || nextDuration !== les.videoDurationSec) {
      await prisma.lesson.update({
        where: { id: les.id },
        data: {
          videoStorageKey: nextKey,
          videoDurationSec: nextDuration,
        },
      });
    }
  }

  const allCourses = await prisma.course.findMany({ select: { id: true } });
  for (const c of allCourses) {
    const agg = await prisma.lesson.aggregate({
      where: { courseId: c.id },
      _count: { id: true },
      _sum: { videoDurationSec: true },
    });
    await prisma.course.update({
      where: { id: c.id },
      data: {
        totalLessons: agg._count.id,
        totalDurationSec: agg._sum.videoDurationSec ?? 0,
      },
    });
  }

  // ============================================================================
  // 4. COUPONS (4 Ready-to-Test Coupons)
  // ============================================================================
  const nextjsCourse = courseBySlug.get('fullstack-nextjs-nestjs-thuc-chien')!;
  const javaCourse = courseBySlug.get('java-spring-boot-3-enterprise-ecommerce')!;
  const reactCourse = courseBySlug.get('react-19-tailwind-shadcn-ui-masterclass')!;
  const freeTsCourse = courseBySlug.get('khoi-dau-typescript-va-deploy-cloud-mien-phi')!;
  const dockerCourse = courseBySlug.get('docker-kubernetes-ci-cd-tu-co-ban-den-production')!;
  const aiCourse = courseBySlug.get('ai-agent-rag-langchain-cho-lap-trinh-vien-web')!;
  const figmaCourse = courseBySlug.get('figma-design-system-tu-zero-den-pro')!;
  const backendCourse = courseBySlug.get('kien-truc-backend-clean-architecture-thuc-te')!;

  const couponDefs = [
    {
      code: 'TRY4T20',
      createdById: admin.id,
      courseId: null,
      discountType: DiscountType.PERCENT,
      discountValue: 20,
      maxDiscountVnd: 300_000,
      usageLimit: 100,
      usedCount: 6,
    },
    {
      code: 'WELCOME100K',
      createdById: admin.id,
      courseId: null,
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: 100_000,
      maxDiscountVnd: null,
      usageLimit: 200,
      usedCount: 4,
    },
    {
      code: 'NEXTJS30',
      createdById: instructorMain.id,
      courseId: nextjsCourse.id,
      discountType: DiscountType.PERCENT,
      discountValue: 30,
      maxDiscountVnd: 250_000,
      usageLimit: 50,
      usedCount: 3,
    },
    {
      code: 'STUDENT50K',
      createdById: instructorMain.id,
      courseId: null,
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: 50_000,
      maxDiscountVnd: null,
      usageLimit: 80,
      usedCount: 2,
    },
  ];

  const couponMap = new Map<string, string>();
  for (const cp of couponDefs) {
    const rec = await prisma.coupon.upsert({
      where: { code: cp.code },
      update: {},
      create: {
        ...cp,
        isActive: true,
        expiresAt: new Date(now.getTime() + 90 * 86_400_000),
      },
    });
    couponMap.set(cp.code, rec.id);
  }

  // ============================================================================
  // 5. PHASE 3 & 6: ORDERS, PAYMENTS, WALLET LEDGER (5 MONTHS HISTORY!)
  // ============================================================================
  const allStudents = [studentMain, ...extraStudents];

  const seededOrdersSpec = [
    {
      orderCode: 'TRY4TSEED001',
      user: studentMain,
      course: freeTsCourse,
      daysBack: 95,
      couponCode: null,
      method: PaymentMethod.SANDBOX,
      status: OrderStatus.PAID,
    },
    {
      orderCode: 'TRY4TSEED002',
      user: studentMain,
      course: nextjsCourse,
      daysBack: 42,
      couponCode: 'TRY4T20',
      method: PaymentMethod.VIETQR,
      status: OrderStatus.PAID,
    },
    {
      orderCode: 'TRY4TSEED003',
      user: studentMain,
      course: javaCourse,
      daysBack: 18,
      couponCode: 'WELCOME100K',
      method: PaymentMethod.VIETQR,
      status: OrderStatus.PAID,
    },
    {
      orderCode: 'TRY4TSEED004',
      user: studentMain,
      course: reactCourse,
      daysBack: 7,
      couponCode: null,
      method: PaymentMethod.SANDBOX,
      status: OrderStatus.PAID,
    },
    // Đơn đang chờ & hết hạn để test lịch sử đơn hàng
    {
      orderCode: 'TRY4TSEED005',
      user: studentMain,
      course: backendCourse,
      daysBack: 3,
      couponCode: null,
      method: PaymentMethod.VIETQR,
      status: OrderStatus.EXPIRED,
    },
    // Đơn của các học viên khác rải đều 5 tháng (làm biểu đồ GMV & Doanh thu cực đẹp!)
    {
      orderCode: 'TRY4TSEED006',
      user: allStudents[1]!,
      course: nextjsCourse,
      daysBack: 122,
      couponCode: null,
      method: PaymentMethod.VIETQR,
      status: OrderStatus.PAID,
    },
    {
      orderCode: 'TRY4TSEED007',
      user: allStudents[2]!,
      course: nextjsCourse,
      daysBack: 92,
      couponCode: 'NEXTJS30',
      method: PaymentMethod.VIETQR,
      status: OrderStatus.PAID,
    },
    {
      orderCode: 'TRY4TSEED008',
      user: allStudents[3]!,
      course: nextjsCourse,
      daysBack: 64,
      couponCode: null,
      method: PaymentMethod.VIETQR,
      status: OrderStatus.PAID,
    },
    {
      orderCode: 'TRY4TSEED009',
      user: allStudents[4]!,
      course: nextjsCourse,
      daysBack: 35,
      couponCode: 'STUDENT50K',
      method: PaymentMethod.VIETQR,
      status: OrderStatus.PAID,
    },
    {
      orderCode: 'TRY4TSEED010',
      user: allStudents[5]!,
      course: nextjsCourse,
      daysBack: 12,
      couponCode: null,
      method: PaymentMethod.SANDBOX,
      status: OrderStatus.PAID,
    },
    {
      orderCode: 'TRY4TSEED011',
      user: allStudents[1]!,
      course: dockerCourse,
      daysBack: 88,
      couponCode: null,
      method: PaymentMethod.VIETQR,
      status: OrderStatus.PAID,
    },
    {
      orderCode: 'TRY4TSEED012',
      user: allStudents[2]!,
      course: aiCourse,
      daysBack: 56,
      couponCode: 'TRY4T20',
      method: PaymentMethod.VIETQR,
      status: OrderStatus.PAID,
    },
    {
      orderCode: 'TRY4TSEED013',
      user: allStudents[3]!,
      course: figmaCourse,
      daysBack: 28,
      couponCode: null,
      method: PaymentMethod.VIETQR,
      status: OrderStatus.PAID,
    },
    {
      orderCode: 'TRY4TSEED014',
      user: allStudents[4]!,
      course: javaCourse,
      daysBack: 9,
      couponCode: null,
      method: PaymentMethod.VIETQR,
      status: OrderStatus.PAID,
    },
    {
      orderCode: 'TRY4TSEED015',
      user: allStudents[5]!,
      course: dockerCourse,
      daysBack: 4,
      couponCode: 'WELCOME100K',
      method: PaymentMethod.VIETQR,
      status: OrderStatus.PAID,
    },
  ];

  for (const spec of seededOrdersSpec) {
    const exists = await prisma.order.findUnique({
      where: { orderCode: spec.orderCode },
      select: { id: true },
    });
    if (exists) continue;

    const unitPrice = spec.course.salePriceVnd ?? spec.course.priceVnd;
    const discountVnd =
      spec.couponCode === 'TRY4T20'
        ? Math.min(300_000, Math.round(unitPrice * 0.2))
        : spec.couponCode === 'WELCOME100K'
          ? Math.min(unitPrice, 100_000)
          : spec.couponCode === 'NEXTJS30'
            ? Math.min(250_000, Math.round(unitPrice * 0.3))
            : spec.couponCode === 'STUDENT50K'
              ? Math.min(unitPrice, 50_000)
              : 0;
    const netPrice = Math.max(0, unitPrice - discountVnd);
    const feeRate = spec.course.instructorId === instructorCloud.id ? 0.25 : 0.3;
    const platformFee = Math.round(netPrice * feeRate);
    const instructorEarning = Math.max(0, netPrice - platformFee);
    const createdAt = daysAgo(spec.daysBack);

    const order = await prisma.order.create({
      data: {
        orderCode: spec.orderCode,
        userId: spec.user.id,
        couponId: spec.couponCode ? (couponMap.get(spec.couponCode) ?? null) : null,
        subtotalVnd: unitPrice,
        discountVnd,
        totalVnd: netPrice,
        status: spec.status,
        paymentMethod: spec.method,
        paidAt: spec.status === OrderStatus.PAID ? createdAt : null,
        expiresAt: new Date(createdAt.getTime() + 15 * 60 * 1000),
        createdAt,
        items: {
          create: {
            courseId: spec.course.id,
            instructorId: spec.course.instructorId,
            unitPriceVnd: unitPrice,
            discountVnd,
            netPriceVnd: netPrice,
            platformFeeVnd: platformFee,
            instructorEarningVnd: instructorEarning,
          },
        },
      },
      include: { items: true },
    });

    const item = order.items[0]!;
    if (spec.status === OrderStatus.PAID) {
      await prisma.paymentTransaction.create({
        data: {
          orderId: order.id,
          provider:
            spec.method === PaymentMethod.VIETQR
              ? PaymentProvider.SEPAY_VIETQR
              : PaymentProvider.SANDBOX,
          providerTxId: `seed-tx-${spec.orderCode}`,
          amountVnd: netPrice,
          status: 'SUCCESS',
          rawPayload: { seeded: true, orderCode: spec.orderCode },
          createdAt,
        },
      });

      await prisma.enrollment.upsert({
        where: { userId_courseId: { userId: spec.user.id, courseId: spec.course.id } },
        update: {},
        create: {
          userId: spec.user.id,
          courseId: spec.course.id,
          orderItemId: item.id,
          enrolledAt: createdAt,
        },
      });

      if (instructorEarning > 0) {
        await prisma.walletTransaction.create({
          data: {
            instructorId: spec.course.instructorId,
            type: WalletTxType.COURSE_SALE,
            amountVnd: instructorEarning,
            referenceId: item.id,
            note: `Bán khóa học "${spec.course.title}" — Đơn #${spec.orderCode}`,
            createdAt,
          },
        });
      }
    }
  }

  // ============================================================================
  // 6. PHASE 4 & 5: PROGRESS, DROP-OFF FUNNEL, NOTES, Q&A, QUIZ, CERTIFICATES
  // ============================================================================
  async function seedStudentCourseProgress(
    userId: string,
    courseId: string,
    completedCountTarget: number,
    partialResumeSec = 0,
  ) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment) return [];

    const lessons = await prisma.lesson.findMany({
      where: { courseId },
      orderBy: [{ section: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: { quiz: true },
    });

    const capped = Math.min(completedCountTarget, lessons.length);
    for (let i = 0; i < lessons.length; i++) {
      const les = lessons[i]!;
      if (i < capped) {
        const dur = les.videoDurationSec || 180;
        await prisma.lessonProgress.upsert({
          where: { userId_lessonId: { userId, lessonId: les.id } },
          update: {},
          create: {
            enrollmentId: enrollment.id,
            userId,
            courseId,
            lessonId: les.id,
            lastPositionSec: dur,
            watchedRangesJson: [[0, dur]],
            uniqueWatchedSec: dur,
            isCompleted: true,
            completedAt: daysAgo(Math.max(1, 15 - i)),
            lastHeartbeatAt: daysAgo(Math.max(1, 15 - i)),
          },
        });
      } else if (i === capped && partialResumeSec > 0 && les.type === LessonType.VIDEO) {
        const safePos = Math.max(
          2,
          Math.min(partialResumeSec, Math.max(3, Math.floor((les.videoDurationSec || 15) * 0.5))),
        );
        await prisma.lessonProgress.upsert({
          where: { userId_lessonId: { userId, lessonId: les.id } },
          update: {
            lastPositionSec: safePos,
            watchedRangesJson: [[0, safePos]],
            uniqueWatchedSec: safePos,
          },
          create: {
            enrollmentId: enrollment.id,
            userId,
            courseId,
            lessonId: les.id,
            lastPositionSec: safePos,
            watchedRangesJson: [[0, safePos]],
            uniqueWatchedSec: safePos,
            isCompleted: false,
            lastHeartbeatAt: daysAgo(1),
          },
        });
      }
    }

    const progressPercent =
      lessons.length > 0 ? Number(((capped / lessons.length) * 100).toFixed(2)) : 0;
    const lastLesson = lessons[Math.min(capped, Math.max(0, lessons.length - 1))] ?? null;

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        completedLessonsCount: capped,
        progressPercent,
        lastLessonId: lastLesson?.id ?? null,
        completedAt: progressPercent >= 100 ? daysAgo(2) : null,
      },
    });

    return lessons;
  }

  // student@try4t.dev:
  // 1) Khóa miễn phí TypeScript -> 100% hoàn thành + cấp chứng chỉ CERT-2026-TRY4T1
  await seedStudentCourseProgress(studentMain.id, freeTsCourse.id, 5);
  await prisma.certificate.upsert({
    where: { userId_courseId: { userId: studentMain.id, courseId: freeTsCourse.id } },
    update: {},
    create: {
      certCode: 'CERT-2026-TRY4T1',
      userId: studentMain.id,
      courseId: freeTsCourse.id,
      recipientNameSnapshot: studentMain.fullName,
      courseTitleSnapshot: freeTsCourse.title,
      instructorNameSnapshot: instructorMain.fullName,
      pdfUrl: '/api/v1/certificates/CERT-2026-TRY4T1/pdf',
      issuedAt: daysAgo(2),
    },
  });

  // 2) Khóa Next.js -> 3/5 bài (60%) + bài 4 đang xem dở tại giây 185 (Resume Playback)
  const nextjsLessons = await seedStudentCourseProgress(studentMain.id, nextjsCourse.id, 3, 185);
  // 3) Khóa Java -> 1/5 bài (20%, bật Sequential Lock để test khóa tuần tự)
  await seedStudentCourseProgress(studentMain.id, javaCourse.id, 1, 90);
  // 4) Khóa React -> 2/5 bài (40%)
  await seedStudentCourseProgress(studentMain.id, reactCourse.id, 2, 120);

  // Staggered progress cho 5 học viên còn lại -> Biểu đồ Drop-off Funnel của Next.js đẹp & thực tế!
  await seedStudentCourseProgress(allStudents[1]!.id, nextjsCourse.id, 5);
  await prisma.certificate.upsert({
    where: { userId_courseId: { userId: allStudents[1]!.id, courseId: nextjsCourse.id } },
    update: {},
    create: {
      certCode: 'CERT-2026-NEXT99',
      userId: allStudents[1]!.id,
      courseId: nextjsCourse.id,
      recipientNameSnapshot: allStudents[1]!.fullName,
      courseTitleSnapshot: nextjsCourse.title,
      instructorNameSnapshot: instructorMain.fullName,
      pdfUrl: '/api/v1/certificates/CERT-2026-NEXT99/pdf',
      issuedAt: daysAgo(10),
    },
  });
  await seedStudentCourseProgress(allStudents[2]!.id, nextjsCourse.id, 4, 150);
  await seedStudentCourseProgress(allStudents[3]!.id, nextjsCourse.id, 3, 80);
  await seedStudentCourseProgress(allStudents[4]!.id, nextjsCourse.id, 2, 45);
  await seedStudentCourseProgress(allStudents[5]!.id, nextjsCourse.id, 1, 30);

  // Ghi chú mốc thời gian & Q&A mẫu trong bài 1 của Next.js cho student@try4t.dev
  const firstNextLesson = nextjsLessons[0];
  if (firstNextLesson) {
    const existingNotes = await prisma.lessonNote.findMany({
      where: { userId: studentMain.id, lessonId: firstNextLesson.id },
      orderBy: { timestampSec: 'asc' },
    });
    if (existingNotes.length === 0) {
      await prisma.lessonNote.createMany({
        data: [
          {
            userId: studentMain.id,
            courseId: nextjsCourse.id,
            lessonId: firstNextLesson.id,
            timestampSec: 8,
            content: 'Cấu trúc Monorepo chia 3 package: apps/web, apps/api và packages/shared dùng chung Zod schema cực gọn.',
          },
          {
            userId: studentMain.id,
            courseId: nextjsCourse.id,
            lessonId: firstNextLesson.id,
            timestampSec: 24,
            content: 'Lưu ý cấu hình HttpOnly Refresh Token cookie với SameSite=Lax và xoay vòng token sau mỗi lần refresh.',
          },
          {
            userId: studentMain.id,
            courseId: nextjsCourse.id,
            lessonId: firstNextLesson.id,
            timestampSec: 41,
            content: 'Direct Upload lên Cloudinary/R2 giúp server không bị nghẽn RAM khi nhiều giảng viên tải video cùng lúc.',
          },
        ],
      });
    } else {
      const maxDur = Math.max(10, firstNextLesson.videoDurationSec || 53);
      const targets = [
        Math.min(8, maxDur - 2),
        Math.min(24, maxDur - 2),
        Math.min(41, maxDur - 2),
      ];
      for (let idx = 0; idx < existingNotes.length; idx++) {
        const n = existingNotes[idx]!;
        if (n.timestampSec > maxDur) {
          await prisma.lessonNote.update({
            where: { id: n.id },
            data: { timestampSec: targets[idx % targets.length]! },
          });
        }
      }
    }

    const existingQuestions = await prisma.lessonQuestion.count({
      where: { lessonId: firstNextLesson.id },
    });
    if (existingQuestions === 0) {
      const q1 = await prisma.lessonQuestion.create({
        data: {
          courseId: nextjsCourse.id,
          lessonId: firstNextLesson.id,
          userId: studentMain.id,
          title: 'Khi chạy dự án qua IP mạng LAN (192.168.x.x) có cần sửa NEXT_PUBLIC_API_URL không?',
          contentMd:
            'Mình test web trên điện thoại cùng Wifi qua `http://192.168.1.25:3000` thì gọi API `localhost:4000` có bị lỗi không anh?',
          isResolved: true,
          answersCount: 1,
        },
      });
      await prisma.lessonAnswer.create({
        data: {
          questionId: q1.id,
          userId: instructorMain.id,
          contentMd:
            'Không cần sửa thủ công đâu em! Hàm `getApiBaseUrl()` trong `api-client.ts` đã tự động đổi `localhost` sang đúng `window.location.hostname` hiện tại, còn NestJS thì bind `0.0.0.0` và mở sẵn CORS mạng LAN trong dev nhé.',
          isInstructorReply: true,
          isAccepted: true,
        },
      });
    }
  }

  // Đánh giá khóa học kèm phản hồi giảng viên
  const reviewsToUpsert = [
    {
      userId: studentMain.id,
      courseId: nextjsCourse.id,
      rating: 5,
      comment:
        'Khóa học siêu thực chiến! Mình áp dụng thẳng mô hình Monorepo + Refresh Token Rotation + VietQR Webhook vào đồ án tốt nghiệp được 9.5 điểm.',
      instructorReply:
        'Chúc mừng Khôi nhé! Giữ vững phong độ code sạch và tối ưu bảo mật như vậy là sớm lên Senior luôn!',
    },
    {
      userId: studentTwo.id,
      courseId: nextjsCourse.id,
      rating: 5,
      comment:
        'Anh Tú giảng cực dễ hiểu, không lan man lý thuyết mà đi thẳng vào các lỗi production hay gặp ngoài thực tế.',
      instructorReply: 'Cảm ơn Hà My nhiều nhé, có vướng mắc gì cứ hỏi ngay trong tab Q&A nha!',
    },
    {
      userId: studentMain.id,
      courseId: freeTsCourse.id,
      rating: 5,
      comment:
        'Khóa miễn phí mà chất lượng đỉnh cao, học xong 100% được cấp chứng chỉ PDF + QR tải về gắn thẳng CV luôn!',
      instructorReply: null,
    },
  ];

  for (const rev of reviewsToUpsert) {
    await prisma.courseReview.upsert({
      where: { userId_courseId: { userId: rev.userId, courseId: rev.courseId } },
      update: {
        instructorReply: rev.instructorReply,
        repliedAt: rev.instructorReply ? daysAgo(3) : null,
      },
      create: {
        userId: rev.userId,
        courseId: rev.courseId,
        rating: rev.rating,
        comment: rev.comment,
        instructorReply: rev.instructorReply,
        repliedAt: rev.instructorReply ? daysAgo(3) : null,
      },
    });
  }

  // ============================================================================
  // 7. PHASE 6: PAYOUT REQUESTS (1 PAID + 2 PENDING CHO ADMIN TEST DUYỆT)
  // ============================================================================
  const existingPayouts = await prisma.payoutRequest.count();
  if (existingPayouts === 0) {
    const paidPayout = await prisma.payoutRequest.create({
      data: {
        instructorId: instructorMain.id,
        amountVnd: 500_000,
        status: PayoutStatus.PAID,
        bankSnapshotJson: {
          bankName: 'MB Bank',
          bankAccountNo: '090123456789',
          bankAccountName: 'DANG DINH ANH TU',
        },
        reviewedByAdminId: admin.id,
        adminNote: 'Đã giải ngân đợt 1 qua MB Bank — Mã GD #FT261100182',
        transferProofUrl:
          'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=80',
        createdAt: daysAgo(20),
        processedAt: daysAgo(19),
      },
    });

    await prisma.walletTransaction.create({
      data: {
        instructorId: instructorMain.id,
        type: WalletTxType.PAYOUT_DEBIT,
        amountVnd: -500_000,
        referenceId: paidPayout.id,
        note: 'Giải ngân rút tiền đợt 1 — MB Bank #FT261100182',
        createdAt: daysAgo(19),
      },
    });

    await prisma.payoutRequest.create({
      data: {
        instructorId: instructorMain.id,
        amountVnd: 450_000,
        status: PayoutStatus.PENDING,
        bankSnapshotJson: {
          bankName: 'MB Bank',
          bankAccountNo: '090123456789',
          bankAccountName: 'DANG DINH ANH TU',
        },
        createdAt: daysAgo(1),
      },
    });

    await prisma.payoutRequest.create({
      data: {
        instructorId: instructorCloud.id,
        amountVnd: 500_000,
        status: PayoutStatus.PENDING,
        bankSnapshotJson: {
          bankName: 'Vietcombank',
          bankAccountNo: '0011004455667',
          bankAccountName: 'PHAM QUOC HOANG',
        },
        createdAt: daysAgo(2),
      },
    });
  }

  const [totalCourses, totalUsers, totalOrders, totalEnrollments, totalCerts, totalPayouts] =
    await Promise.all([
      prisma.course.count(),
      prisma.user.count(),
      prisma.order.count(),
      prisma.enrollment.count(),
      prisma.certificate.count(),
      prisma.payoutRequest.count(),
    ]);

  console.log('Seed completed successfully!', {
    totalUsers,
    totalCourses,
    totalOrders,
    totalEnrollments,
    totalCerts,
    totalPayouts,
    defaultPassword: 'Try4T@123',
  });
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
