import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { OrphanedUploadsService } from './orphaned-uploads.service';

// @nestjs/schedule v12 فقط ESM است و jest (روی Node 22) نمی‌تواند require کند؛
// دکوراتور Cron موضوع این تست نیست و با نسخهٔ ساده جایگزین می‌شود.
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_3AM: '0 0 3 * * *' },
}));

/**
 * تست پاک‌سازی فایل‌های رهاشده.
 *
 * قانون امنیتی اصلی: **هیچ فایلی که در دیتابیس ارجاع دارد حذف نمی‌شود** —
 * نه در پروفایل فعلی، نه در پیش‌نویس در انتظار تایید.
 */
describe('OrphanedUploadsService', () => {
  let tempRoot: string;
  const OLD = new Date('2020-01-01T00:00:00Z');
  const FRESH = new Date();

  beforeEach(async () => {
    tempRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'monshim-orphan-'),
    );
    process.env.UPLOAD_DIR = tempRoot;
    for (const folder of ['profiles', 'portfolio', 'blog']) {
      await fs.promises.mkdir(path.join(tempRoot, folder), { recursive: true });
    }
  });

  afterEach(async () => {
    delete process.env.UPLOAD_DIR;
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  async function writeFile(folder: string, name: string, mtime: Date) {
    const full = path.join(tempRoot, folder, name);
    await fs.promises.writeFile(full, 'x');
    await fs.promises.utimes(full, mtime, mtime);
    return full;
  }

  function createService(profiles: unknown[]) {
    return new OrphanedUploadsService({
      find: async () => profiles,
    } as never);
  }

  it('فایل بدون ارجاع و قدیمی حذف می‌شود', async () => {
    const orphan = await writeFile('portfolio', 'orphan.webp', OLD);
    const service = createService([]);

    const result = await service.cleanup();

    expect(result.deleted).toBe(1);
    expect(fs.existsSync(orphan)).toBe(false);
  });

  it('فایل ارجاع‌دار در پروفایل فعلی هرگز حذف نمی‌شود', async () => {
    const logo = await writeFile('profiles', 'logo.webp', OLD);
    const work = await writeFile('portfolio', 'work.webp', OLD);
    const service = createService([
      {
        id: 'p1',
        profileImage: '/uploads/profiles/logo.webp',
        portfolioImages: ['/uploads/portfolio/work.webp'],
        pendingChanges: null,
      },
    ]);

    const result = await service.cleanup();

    expect(result.deleted).toBe(0);
    expect(result.kept).toBe(2);
    expect(fs.existsSync(logo)).toBe(true);
    expect(fs.existsSync(work)).toBe(true);
  });

  it('فایل ارجاع‌دار در پیش‌نویس (در انتظار تایید) هم محفوظ است', async () => {
    const draftLogo = await writeFile('profiles', 'draft-logo.webp', OLD);
    const draftWork = await writeFile('portfolio', 'draft-work.webp', OLD);
    const service = createService([
      {
        id: 'p1',
        profileImage: null,
        portfolioImages: [],
        pendingChanges: {
          profileImage: '/uploads/profiles/draft-logo.webp',
          portfolioImages: ['/uploads/portfolio/draft-work.webp'],
        },
      },
    ]);

    await service.cleanup();

    expect(fs.existsSync(draftLogo)).toBe(true);
    expect(fs.existsSync(draftWork)).toBe(true);
  });

  it('فایل تازه‌تر از پنجرهٔ امنیت دست‌نخورده می‌ماند', async () => {
    const fresh = await writeFile('portfolio', 'just-uploaded.webp', FRESH);
    const service = createService([]);

    const result = await service.cleanup();

    expect(result.deleted).toBe(0);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('پوشهٔ blog (مدیرمحور) پاک نمی‌شود', async () => {
    const blogFile = await writeFile('blog', 'cover.webp', OLD);
    const service = createService([]);

    await service.cleanup();

    expect(fs.existsSync(blogFile)).toBe(true);
  });

  it('پوشهٔ ناموجود باعث خطا نمی‌شود', async () => {
    await fs.promises.rm(path.join(tempRoot, 'portfolio'), {
      recursive: true,
      force: true,
    });
    const service = createService([]);

    await expect(service.cleanup()).resolves.toMatchObject({ deleted: 0 });
  });

  it('کار زمان‌بندی‌شده هرگز استثنا پرتاب نمی‌کند', async () => {
    const service = new OrphanedUploadsService({
      find: async () => {
        throw new Error('db down');
      },
    } as never);

    await expect(service.scheduledCleanup()).resolves.toBeUndefined();
  });
});
