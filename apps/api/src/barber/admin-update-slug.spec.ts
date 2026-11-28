import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { BarberService } from './barber.service';
import { AdminUpdateSlugDto } from './dto/admin-update-slug.dto';

function harness() {
  const profile = { id: 'profile-42', userId: 42, slug: 'old-salon' };
  const repo = {
    findOne: jest.fn(
      async ({ where }: { where: { userId?: number; slug?: string } }) => {
        if (where.userId) return where.userId === 42 ? profile : null;
        if (where.slug === 'taken-salon')
          return { id: 'other', slug: where.slug };
        return null;
      },
    ),
    save: jest.fn(async data => data),
    manager: {
      transaction: jest.fn(async fn => fn({ getRepository: () => repo })),
    },
  };
  const webhook = { notifyBarberProfileChanged: jest.fn() };
  const service = new BarberService(
    {} as never,
    repo as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    undefined,
    webhook as never,
  );
  return { service, repo, webhook, profile };
}

describe('administrator slug editing', () => {
  it('normalizes, saves, and invalidates the old and new public paths after commit', async () => {
    const { service, profile, webhook } = harness();
    await expect(service.updateAdminSlug(42, ' New-Salon ')).resolves.toEqual({
      userId: 42,
      slug: 'new-salon',
      previousSlug: 'old-salon',
    });
    expect(profile.slug).toBe('new-salon');
    expect(webhook.notifyBarberProfileChanged).toHaveBeenNthCalledWith(1, {
      userId: 42,
      slugs: ['old-salon'],
    });
    expect(webhook.notifyBarberProfileChanged).toHaveBeenNthCalledWith(2, {
      userId: 42,
      slugs: ['new-salon'],
    });
  });
  it('permits clearing and creating a slug', async () => {
    const { service, profile, webhook } = harness();
    await service.updateAdminSlug(42, null);
    expect(profile.slug).toBeNull();
    expect(webhook.notifyBarberProfileChanged).toHaveBeenCalledWith({
      userId: 42,
      slugs: ['old-salon'],
    });
    await service.updateAdminSlug(42, 'new-salon');
    expect(profile.slug).toBe('new-salon');
  });
  it('rejects invalid or taken slugs without touching the row or cache', async () => {
    const { service, repo, profile, webhook } = harness();
    await expect(service.updateAdminSlug(42, 'admin')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.updateAdminSlug(42, 'taken-salon'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.updateAdminSlug(7, 'new-salon'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(profile.slug).toBe('old-salon');
    expect(repo.save).not.toHaveBeenCalled();
    expect(webhook.notifyBarberProfileChanged).not.toHaveBeenCalled();
  });
  it('fails closed on malformed DTOs but accepts null to clear', async () => {
    expect(
      await validate(plainToInstance(AdminUpdateSlugDto, {})),
    ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(AdminUpdateSlugDto, { slug: 123 })),
    ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(AdminUpdateSlugDto, { slug: null })),
    ).toHaveLength(0);
  });
});
