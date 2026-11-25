import { NotFoundException } from '@nestjs/common';
import { ClubCustomer } from 'src/club/entities/club-customer.entity';

import { UsersService } from './users.service';

/**
 * در production (`synchronize=false`) قید FK روی `club_customers.customer_id`
 * وجود ندارد؛ حذف hard حساب کاربری بدون پاک‌سازی رکوردهای باشگاه، آن‌ها را
 * «یتیم» می‌گذارد و نوبتِ دستیِ بعدی روی چنین رکوردی با خطای کلید خارجی روی
 * `bookings.customer_id` با ۵۰۰ شکست می‌خورد (تیکت «رزرو دستی اررور 500»).
 */
describe('UsersService.remove — پاک‌سازی رکوردهای باشگاه هنگام حذف حساب', () => {
  function buildHarness() {
    const order: string[] = [];

    const clubTxRepo = {
      delete: jest.fn(async (criteria: { customerId: number }) => {
        order.push(`club:${criteria.customerId}`);
        return { affected: 1 };
      }),
    };
    const userTxRepo = {
      delete: jest.fn(async (id: number) => {
        order.push(`user:${id}`);
        return { affected: 1 };
      }),
    };

    const txManager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === ClubCustomer ? clubTxRepo : userTxRepo,
      ),
    };

    const usersRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 9,
        fullName: 'مشتری',
        phone: '09131234567',
      }),
      manager: {
        transaction: jest.fn(
          async (callback: (manager: unknown) => Promise<unknown>) =>
            callback(txManager),
        ),
      },
      delete: jest.fn(),
    };

    const service = new UsersService(usersRepository as never);

    return { service, usersRepository, clubTxRepo, userTxRepo, order };
  }

  it('قبل از حذف کاربر، رکوردهای باشگاه او درون همان تراکنش پاک می‌شوند', async () => {
    const { service, usersRepository, clubTxRepo, userTxRepo, order } =
      buildHarness();

    await service.remove(9);

    expect(clubTxRepo.delete).toHaveBeenCalledWith({ customerId: 9 });
    expect(userTxRepo.delete).toHaveBeenCalledWith(9);
    expect(order).toEqual(['club:9', 'user:9']);
    // حذف کاربر باید درون تراکنش انجام شود، نه بیرون از آن
    expect(usersRepository.delete).not.toHaveBeenCalled();
  });

  it('کاربر ناموجود NotFound می‌دهد و هیچ حذفی انجام نمی‌شود', async () => {
    const { service, usersRepository, clubTxRepo, userTxRepo } = buildHarness();
    usersRepository.findOne.mockResolvedValue(null);

    await expect(service.remove(123)).rejects.toThrow(NotFoundException);

    expect(usersRepository.manager.transaction).not.toHaveBeenCalled();
    expect(clubTxRepo.delete).not.toHaveBeenCalled();
    expect(userTxRepo.delete).not.toHaveBeenCalled();
  });
});
