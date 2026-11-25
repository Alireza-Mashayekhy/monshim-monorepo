import { BadRequestException } from '@nestjs/common';
import { Role } from 'src/common/enum/role.enum';

import { ClubService } from './club.service';
import { ClubCustomer } from './entities/club-customer.entity';

/**
 * «مشتری یتیم»: رکورد باشگاه به حساب کاربری‌ای اشاره می‌کند که حذف شده و
 * در production قید FK روی `club_customers.customer_id` نیست. اگر ترمیم
 * نشود، INSERT نوبتِ دستی روی `bookings.customer_id` با خطای کلید خارجی
 * شکست می‌خورد (تیکت «رزرو دستی اررور 500»).
 */
describe('ClubService.findMemberForBarber — بازسازی مشتری یتیم', () => {
  interface Harness {
    service: ClubService;
    clubCustomerRepo: {
      findOne: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    userRepo: {
      findOne: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
    };
  }

  function buildHarness(): Harness {
    const clubCustomerRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const userRepo = {
      findOne: jest.fn(),
      create: jest.fn(data => data),
      save: jest.fn(),
    };

    const service = new ClubService(
      clubCustomerRepo as never,
      {} as never,
      {} as never,
      userRepo as never,
    );

    return { service, clubCustomerRepo, userRepo };
  }

  const orphanMember = (): Partial<ClubCustomer> => ({
    id: 'member-1',
    barberId: 'barber-uuid',
    customerId: 42,
    fullName: 'علی رضایی',
    phone: '09131234567',
    customer: null as never,
  });

  it('عضوی که حسابش موجود است بدون هیچ ترمیمی برمی‌گردد', async () => {
    const { service, clubCustomerRepo, userRepo } = buildHarness();

    const member = {
      ...orphanMember(),
      customer: { id: 42, phone: '09131234567' },
    } as never;
    clubCustomerRepo.findOne.mockResolvedValue(member);

    const result = await service.findMemberForBarber('barber-uuid', 'member-1');

    expect(result).toBe(member);
    expect(userRepo.findOne).not.toHaveBeenCalled();
    expect(clubCustomerRepo.update).not.toHaveBeenCalled();
    expect(clubCustomerRepo.delete).not.toHaveBeenCalled();
  });

  it('یتیم به حسابِ موجودِ هم‌شماره وصل می‌شود', async () => {
    const { service, clubCustomerRepo, userRepo } = buildHarness();

    clubCustomerRepo.findOne
      .mockResolvedValueOnce(orphanMember()) // پیدا کردن عضو
      .mockResolvedValueOnce(null); // نبودِ رکورد تکراری سالم

    const existingUser = { id: 7, phone: '09131234567' };
    userRepo.findOne.mockResolvedValue(existingUser);

    const result = await service.findMemberForBarber('barber-uuid', 'member-1');

    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { phone: '09131234567' },
    });
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(clubCustomerRepo.update).toHaveBeenCalledWith(
      { id: 'member-1' },
      { customerId: 7 },
    );
    expect(result.customerId).toBe(7);
    expect(result.customer).toBe(existingUser);
  });

  it('یتیم بدون حساب موجود ← حساب جدید از اسنپ‌شات رکورد باشگاه ساخته می‌شود', async () => {
    const { service, clubCustomerRepo, userRepo } = buildHarness();

    clubCustomerRepo.findOne
      .mockResolvedValueOnce(orphanMember())
      .mockResolvedValueOnce(null);

    userRepo.findOne.mockResolvedValue(null);
    userRepo.save.mockResolvedValue({ id: 9, phone: '09131234567' });

    const result = await service.findMemberForBarber('barber-uuid', 'member-1');

    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '09131234567',
        fullName: 'علی رضایی',
        isActive: true,
        roles: [Role.User],
      }),
    );
    expect(clubCustomerRepo.update).toHaveBeenCalledWith(
      { id: 'member-1' },
      { customerId: 9 },
    );
    expect(result.customerId).toBe(9);
  });

  it('اگر ساختن حساب به‌خاطر مسابقه شکست بخورد، حساب تازه‌ساخته‌شده پیدا می‌شود', async () => {
    const { service, clubCustomerRepo, userRepo } = buildHarness();

    clubCustomerRepo.findOne
      .mockResolvedValueOnce(orphanMember())
      .mockResolvedValueOnce(null);

    userRepo.findOne
      .mockResolvedValueOnce(null) // پیش از ساختن: حسابی نیست
      .mockResolvedValueOnce({ id: 11, phone: '09131234567' }); // بعد از شکست save
    userRepo.save.mockRejectedValue(new Error('ER_DUP_ENTRY'));

    const result = await service.findMemberForBarber('barber-uuid', 'member-1');

    expect(result.customerId).toBe(11);
    expect(clubCustomerRepo.update).toHaveBeenCalledWith(
      { id: 'member-1' },
      { customerId: 11 },
    );
  });

  it('اگر رکورد سالم دیگری از همین مشتری وجود داشته باشد، رکورد یتیم حذف و رکورد سالم برمی‌گردد', async () => {
    const { service, clubCustomerRepo, userRepo } = buildHarness();

    clubCustomerRepo.findOne
      .mockResolvedValueOnce(orphanMember()) // عضو یتیم
      .mockResolvedValueOnce({ id: 'member-2' }) // رکورد سالم تکراری
      .mockResolvedValueOnce({
        id: 'member-2',
        customerId: 7,
        customer: { id: 7 },
      }); // بازخوانی رکورد سالم با relations

    userRepo.findOne.mockResolvedValue({ id: 7, phone: '09131234567' });

    const result = await service.findMemberForBarber('barber-uuid', 'member-1');

    expect(clubCustomerRepo.delete).toHaveBeenCalledWith('member-1');
    expect(clubCustomerRepo.update).not.toHaveBeenCalled();
    expect(result.id).toBe('member-2');
    expect(result.customerId).toBe(7);
  });

  it('یتیم با شمارهٔ نامعتبر خطای ۴۰۰ روشن می‌دهد، نه خطای دیتابیس', async () => {
    const { service, clubCustomerRepo, userRepo } = buildHarness();

    clubCustomerRepo.findOne.mockResolvedValue({
      ...orphanMember(),
      phone: '1234',
    });

    await expect(
      service.findMemberForBarber('barber-uuid', 'member-1'),
    ).rejects.toThrow(BadRequestException);

    expect(userRepo.save).not.toHaveBeenCalled();
    expect(clubCustomerRepo.update).not.toHaveBeenCalled();
  });
});
