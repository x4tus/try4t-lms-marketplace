# Try4T — E-Learning / LMS Marketplace

Nền tảng khóa học trực tuyến thực chiến xây dựng theo kiến trúc **Turborepo Monorepo**:
- `apps/web`: **Next.js 15 (App Router, TypeScript)** + Tailwind CSS v4 + shadcn/ui + TanStack Query + Zustand + Recharts
- `apps/api`: **NestJS 11 (Modular Clean Architecture)** + Prisma ORM + PostgreSQL (Neon) + PDFKit + QRCode + Swagger
- `packages/shared`: Zod validation schemas, Enums, TypeScript DTOs & formatters dùng chung

## Các tính năng nổi bật (Phase 0 – Phase 6)
- **Identity, OTP & OAuth 2.0**: Đăng ký xác thực OTP 6 số, Quên/Đặt lại mật khẩu, Brute-force lockout, JWT Access + HttpOnly Refresh Token Rotation, Đăng nhập 1 chạm Google & GitHub (Pop-up + One-Time Ticket).
- **Theme Palette cá nhân hóa**: Chế độ Sáng (Mint Green) / Tối (Forest Dark) tùy chỉnh riêng màu nền & màu nhấn, lưu đồng bộ theo tài khoản.
- **Course Builder & Moderation**: Kéo thả chương/bài học (`dnd-kit`), cắt ảnh bìa 16:9, tải video trực tiếp lên Cloudflare R2 / Cloudinary, Markdown editor 2 cột, Quiz Builder, hàng đợi kiểm duyệt khóa học & hồ sơ giảng viên.
- **Storefront, Cart Sync & Thanh toán VietQR**: Catalog đa bộ lọc, Học thử miễn phí Dark Cinema, đồng bộ giỏ hàng khách vãng lai vào DB, Coupon không sai số làm tròn, chống mua trùng 3 lớp, VietQR SePay tự động + Sandbox 1-click.
- **Smart Learning Room & Anti-Cheat**: Video Player nhớ giây xem dở (Resume Playback), Dynamic Drifting Watermark, thuật toán hợp nhất khoảng thời gian xem chống tua gian lận, khóa học tuần tự (Sequential Drip Lock), ghi chú gắn mốc giây (phím `N`), Hỏi đáp Q&A, bài kiểm tra Quiz chấm điểm phía server và đánh giá xác thực (≥ 20% tiến độ).
- **Chứng chỉ PDF + QR & Tài chính**: Tự động cấp chứng chỉ PDF tiếng Việt (Roboto TTF + QR Code) khi đạt 100%, trang xác thực công khai `/verify/[certCode]`, biểu đồ doanh thu & phễu Drop-off (`Recharts`), ví giảng viên sổ cái bất biến và duyệt rút tiền Admin.

## Khởi chạy môi trường Dev

1. Tạo Database PostgreSQL miễn phí trên [Neon](https://neon.tech) và sao chép `.env.example` thành `apps/api/.env`, điền `DATABASE_URL` (pooled) và `DIRECT_URL` (direct).
2. Cài đặt thư viện & sinh Prisma Client:
   ```bash
   pnpm install
   pnpm db:generate
   ```
3. Đẩy schema lên Neon & tạo dữ liệu mẫu (16 khóa học, danh mục, người dùng, Coupon `TRY4T20` / `WELCOME100K`):
   ```bash
   pnpm db:push
   pnpm db:seed
   ```
4. Chạy đồng thời cả Frontend (`:3000`) & Backend (`:4000`):
   ```bash
   pnpm dev
   ```
   - Web App: `http://localhost:3000`
   - REST API: `http://localhost:4000/api/v1/health`
   - Swagger Docs: `http://localhost:4000/api/docs`

## Tài khoản Seed mẫu (Mật khẩu: `Try4T@123`)
- **Admin**: `admin@try4t.dev`
- **Giảng viên**: `instructor@try4t.dev`
- **Học viên**: `student@try4t.dev`

## Triển khai miễn phí (Zero-Cost Production Deploy)

1. **Database**: [Neon PostgreSQL](https://neon.tech) (Singapore) -> lấy `DATABASE_URL` (Pooled) & `DIRECT_URL`.
2. **Storage**: [Cloudinary](https://cloudinary.com) (Ảnh 16:9, Avatar) + [Cloudflare R2](https://dash.cloudflare.com) (Video/Tài liệu 0$ egress).
3. **Backend (`apps/api`) trên [Render Free](https://render.com)**:
   - Kết nối GitHub repo -> Render tự đọc file [`render.yaml`](./render.yaml).
   - Điền các biến môi trường `sync: false` (`DATABASE_URL`, `APP_URL`, `API_URL`, `CORS_ORIGINS`, Cloudinary/R2/OAuth/SePay).
   - Dùng [UptimeRobot](https://uptimerobot.com) ping `/api/v1/health` mỗi 14 phút để giữ server không sleep.
4. **Frontend (`apps/web`) trên [Vercel](https://vercel.com)**:
   - Root Directory: `apps/web`
   - Install Command: `cd ../.. && pnpm install --frozen-lockfile`
   - Build Command: `cd ../.. && pnpm --filter @try4t/shared build && pnpm --filter @try4t/web build`
   - Env: `NEXT_PUBLIC_API_URL=https://<render-api>.onrender.com/api/v1`, `NEXT_PUBLIC_APP_URL=https://<vercel-app>.vercel.app`.
5. **Webhook VietQR SePay**: Trỏ Webhook URL về `https://<render-api>.onrender.com/api/v1/commerce/webhooks/sepay` kèm Header `Authorization: Apikey <SEPAY_WEBHOOK_SECRET>`.
