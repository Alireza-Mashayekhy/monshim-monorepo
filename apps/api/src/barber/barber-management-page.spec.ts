import { BadRequestException } from '@nestjs/common';
import { Role } from 'src/common/enum/role.enum';

import { BarberService, managementPageAvailability } from './barber.service';

describe('public page availability for management', () => {
  const active = {
    slug: 'salon-42',
    isAccountActive: true,
    isApproved: true,
    isPubliclyVisible: true,
    hasActiveService: true,
    subscriptionKnown: true,
    hasActiveSubscription: true,
  };
  it('marks the page active only when all public endpoint conditions hold', () => {
    expect(managementPageAvailability(active)).toEqual({
      status: 'ACTIVE',
      reason: null,
    });
    expect(managementPageAvailability({ ...active, slug: null })).toEqual({
      status: 'NOT_SETUP',
      reason: 'NO_SLUG',
    });
    expect(
      managementPageAvailability({ ...active, isAccountActive: false }).reason,
    ).toBe('ACCOUNT_INACTIVE');
    expect(
      managementPageAvailability({ ...active, isApproved: false }).reason,
    ).toBe('NOT_APPROVED');
    expect(
      managementPageAvailability({ ...active, isPubliclyVisible: false })
        .reason,
    ).toBe('HIDDEN');
    expect(
      managementPageAvailability({ ...active, hasActiveService: false }).reason,
    ).toBe('NO_ACTIVE_SERVICE');
    expect(
      managementPageAvailability({ ...active, hasActiveSubscription: false })
        .reason,
    ).toBe('NO_ACTIVE_SUBSCRIPTION');
    expect(
      managementPageAvailability({
        ...active,
        subscriptionKnown: false,
        hasActiveSubscription: false,
      }),
    ).toEqual({ status: 'UNKNOWN', reason: 'SUBSCRIPTION_UNKNOWN' });
  });
});

describe('admin deletion protections', () => {
  it.each([
    { roles: [Role.Barber, Role.Admin], actorId: 1 },
    { roles: [Role.Barber], actorId: 42 },
  ])(
    'rejects admin and self deletion before any side effects',
    async ({ roles, actorId }) => {
      const repo = {
        findOne: jest.fn().mockResolvedValue({
          id: 42,
          roles,
          barberProfile: { id: 'profile-42' },
        }),
        delete: jest.fn(),
        manager: { getRepository: jest.fn() },
      };
      const service = new BarberService(
        repo as never,
        {} as never,
        {} as never,
      );
      await expect(service.remove(42, actorId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.delete).not.toHaveBeenCalled();
      expect(repo.manager.getRepository).not.toHaveBeenCalled();
    },
  );
});

describe('existing safe deletion path', () => {
  function setup(failUserDelete: boolean) {
    const user = {
      id: 42,
      roles: [Role.Barber],
      barberProfile: { id: 'profile-42', slug: 'salon-42' },
    };
    const clubDelete = jest.fn().mockResolvedValue({ affected: 1 });
    const userDelete = jest.fn(async () => {
      if (failUserDelete) throw new Error('delete failed');
    });
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    const manager = {
      getRepository: jest.fn(() => ({
        count: jest.fn().mockResolvedValue(0),
        createQueryBuilder: () => qb,
      })),
      transaction: jest.fn(async callback =>
        callback({
          getRepository: (entity: { name: string }) =>
            entity.name === 'ClubCustomer'
              ? { delete: clubDelete }
              : { delete: userDelete },
        }),
      ),
    };
    const userRepo = { findOne: jest.fn().mockResolvedValue(user), manager };
    const webhook = { notifyBarberProfileChanged: jest.fn() };
    return {
      service: new BarberService(
        userRepo as never,
        {} as never,
        {} as never,
        undefined,
        undefined,
        undefined,
        undefined,
        webhook as never,
      ),
      manager,
      clubDelete,
      userDelete,
      webhook,
    };
  }
  it('cleans club records and the account in a single transaction, then invalidates', async () => {
    const { service, manager, clubDelete, userDelete, webhook } = setup(false);
    await expect(service.remove(42, 1)).resolves.toEqual({ id: 42 });
    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(clubDelete).toHaveBeenCalledWith({ customerId: 42 });
    expect(userDelete).toHaveBeenCalledWith(42);
    expect(webhook.notifyBarberProfileChanged).toHaveBeenCalledWith({
      userId: 42,
      slugs: ['salon-42'],
    });
  });
  it('does not invalidate on a transaction failure', async () => {
    const { service, webhook } = setup(true);
    await expect(service.remove(42, 1)).rejects.toThrow('delete failed');
    expect(webhook.notifyBarberProfileChanged).not.toHaveBeenCalled();
  });
});

describe('management search', () => {
  it('adds slug to the name, phone and location search predicates', async () => {
    let searchBrackets: { whereFactory: (qb: unknown) => void } | undefined;
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn(arg => {
        searchBrackets = arg;
        return qb;
      }),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const service = new BarberService(
      { createQueryBuilder: () => qb } as never,
      {} as never,
      {} as never,
    );
    await service.findAllForAdminManagement({ search: 'salon-test' });
    const conditions = {
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
    };
    searchBrackets?.whereFactory(conditions);
    expect(conditions.orWhere).toHaveBeenCalledWith(
      'profile.slug LIKE :search',
      { search: '%salon-test%' },
    );
  });
});
