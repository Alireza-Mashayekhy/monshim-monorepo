import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FrontendRevalidationService } from 'src/common/services/frontend-revalidation.service';
import { isDuplicateEntryError } from 'src/common/utils/db-error.util';
import { Repository } from 'typeorm';

import { BlogDto } from './blog.dto';
import { BlogArticle } from './blog.entity';
import { safeUrl, sanitizeContent } from './blog-content';

@Injectable()
export class BlogService {
  constructor(
    @InjectRepository(BlogArticle)
    private readonly repo: Repository<BlogArticle>,
    /**
     * اطلاع‌دادن به فرانت برای پاک‌سازی on-demand کشِ بلاگ.
     * `Optional` است تا تست‌های واحد و محیط‌های بدون env لازم نباشد آن را بسازند.
     */
    @Optional()
    private readonly frontendRevalidationService?: FrontendRevalidationService,
  ) {}
  async list(admin = false, page = 1, search = '') {
    page = Math.floor(Math.max(1, Math.min(10000, Number(page) || 1)));
    const qb = this.repo
      .createQueryBuilder('article')
      .select([
        'article.id',
        'article.title',
        'article.slug',
        'article.excerpt',
        'article.status',
        'article.featured',
        'article.cover',
        'article.metaTitle',
        'article.metaDescription',
        'article.indexable',
        'article.follow',
        'article.publishedAt',
        'article.createdAt',
        'article.updatedAt',
      ]);
    if (!admin) qb.where('article.status = :status', { status: 'published' });
    if (search.trim())
      qb.andWhere('article.title LIKE :search', {
        search: `%${search
          .trim()
          .slice(0, 100)
          .replace(/[\\%_]/g, '\\$&')}%`,
      });
    const [data, total] = await qb
      .orderBy('article.createdAt', 'DESC')
      .skip((page - 1) * 12)
      .take(12)
      .getManyAndCount();
    return {
      data,
      pagination: { page, limit: 12, total, totalPages: Math.ceil(total / 12) },
    };
  }
  async sitemap() {
    return this.repo.find({
      where: { status: 'published', indexable: true },
      select: { slug: true, updatedAt: true },
      order: { updatedAt: 'DESC' },
    });
  }
  async byId(id: number) {
    const article = await this.repo.findOneBy({ id });
    if (!article) throw new NotFoundException('مقاله یافت نشد');
    return article;
  }
  async bySlug(slug: string) {
    const article = await this.repo.findOneBy({ slug, status: 'published' });
    if (!article) throw new NotFoundException('مقاله یافت نشد');
    return article;
  }
  async save(dto: BlogDto, id?: number) {
    const title = dto.title.trim();
    const slug = dto.slug.trim().normalize('NFC').toLowerCase();
    if (!title || !/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug))
      throw new BadRequestException(
        'عنوان و نامک معتبر لازم است؛ نامک فقط شامل حروف، اعداد و خط تیره باشد',
      );
    const cover = dto.cover ? safeUrl(dto.cover, true) : null;
    if (dto.cover && !cover)
      throw new BadRequestException('آدرس تصویر کاور نامعتبر است');
    const article = id ? await this.byId(id) : this.repo.create();
    const publishedAt =
      dto.status === 'published' ? article.publishedAt || new Date() : null;
    Object.assign(article, dto, {
      title,
      slug,
      cover,
      publishedAt,
      content: sanitizeContent(dto.content),
    });
    try {
      const saved = await this.repo.save(article);
      // کشِ ISR فرانت (`/blog` و `/blog/{slug}`) همان لحظه تازه شود.
      this.frontendRevalidationService?.notifyBlogChanged({
        slug: saved.slug,
      });
      return saved;
    } catch (error) {
      if (isDuplicateEntryError(error))
        throw new ConflictException('این نامک قبلاً استفاده شده است');
      throw error;
    }
  }
  async remove(id: number) {
    const article = await this.byId(id);
    const slug = article.slug;
    await this.repo.remove(article);
    this.frontendRevalidationService?.notifyBlogChanged({ slug });
    return { deleted: true };
  }
}
