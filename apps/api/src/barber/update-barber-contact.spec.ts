import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { BarberService } from './barber.service';
import { UpdateBarberDto } from './dto/update-barber.dto';
import { BarberProfile } from './entities/barber.entity';

/** همان مسیر ValidationPipe: تبدیل (Transform) سپس اعتبارسنجی. */
async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(UpdateBarberDto, plain);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
}

function constraintMessages(
  errors: Awaited<ReturnType<typeof validateDto>>['errors'],
) {
  return errors.flatMap(error => Object.values(error.constraints ?? {}));
}

describe('UpdateBarberDto — راه‌های ارتباطی و موقعیت مکانی', () => {
  describe('شماره تماس و واتساپ', () => {
    it('شماره فارسی و پیش‌شمارهٔ بین‌المللی را به فرمت ۰۹… نرمال می‌کند', async () => {
      const persian = await validateDto({ contactPhone: '۰۹۱۲۱۲۳۴۵۶۷' });
      expect(persian.errors).toHaveLength(0);
      expect(persian.dto.contactPhone).toBe('09121234567');

      const international = await validateDto({
        whatsapp: '+98 912 123 4567',
      });
      expect(international.errors).toHaveLength(0);
      expect(international.dto.whatsapp).toBe('09121234567');

      const withoutZero = await validateDto({ contactPhone: '9121234567' });
      expect(withoutZero.errors).toHaveLength(0);
      expect(withoutZero.dto.contactPhone).toBe('09121234567');
    });

    it('تلفن ثابت با کد شهر را می‌پذیرد', async () => {
      const { errors, dto } = await validateDto({
        contactPhone: '۰۲۱۲۲۳۳۴۴۵۵',
      });
      expect(errors).toHaveLength(0);
      expect(dto.contactPhone).toBe('02122334455');
    });

    it('شمارهٔ نامعتبر را با پیام فارسی رد می‌کند', async () => {
      const { errors } = await validateDto({ contactPhone: '12345' });
      expect(constraintMessages(errors)).toContainEqual(
        expect.stringContaining('شماره وارد شده معتبر نیست'),
      );
    });

    it('رشتهٔ خالی یعنی پاک‌کردن مقدار (null) و معتبر است', async () => {
      const { errors, dto } = await validateDto({ whatsapp: '' });
      expect(errors).toHaveLength(0);
      expect(dto.whatsapp).toBeNull();
    });
  });

  describe('اینستاگرام و تلگرام', () => {
    it('لینک پروفایل را به شناسهٔ خالص تبدیل می‌کند', async () => {
      const instagram = await validateDto({
        instagram: 'https://www.instagram.com/my_salon/',
      });
      expect(instagram.errors).toHaveLength(0);
      expect(instagram.dto.instagram).toBe('my_salon');

      const telegram = await validateDto({ telegram: 'https://t.me/my_salon' });
      expect(telegram.errors).toHaveLength(0);
      expect(telegram.dto.telegram).toBe('my_salon');
    });

    it('شناسهٔ بدون لینک و با @ را می‌پذیرد', async () => {
      const withAt = await validateDto({ instagram: '@my.salon_9' });
      expect(withAt.errors).toHaveLength(0);
      expect(withAt.dto.instagram).toBe('my.salon_9');

      const plain = await validateDto({ telegram: 'my_salon' });
      expect(plain.errors).toHaveLength(0);
      expect(plain.dto.telegram).toBe('my_salon');
    });

    it('لینک پست/استوری و متن نامعتبر رد می‌شود', async () => {
      const post = await validateDto({
        instagram: 'https://instagram.com/p/AbC123',
      });
      expect(constraintMessages(post.errors)).toContainEqual(
        expect.stringContaining('شناسه اینستاگرام نامعتبر است'),
      );

      const garbage = await validateDto({ telegram: 'دوست من' });
      expect(constraintMessages(garbage.errors)).toContainEqual(
        expect.stringContaining('شناسه تلگرام نامعتبر است'),
      );
    });

    it('خالی یعنی پاک‌کردن (null)', async () => {
      const { errors, dto } = await validateDto({ instagram: '   ' });
      expect(errors).toHaveLength(0);
      expect(dto.instagram).toBeNull();
    });
  });

  describe('عرض و طول جغرافیایی', () => {
    it('هر دو مقدار با هم معتبرند', async () => {
      const { errors, dto } = await validateDto({
        latitude: 35.1234567,
        longitude: 51.43,
      });
      expect(errors).toHaveLength(0);
      expect(dto.latitude).toBe(35.1234567);
      expect(dto.longitude).toBe(51.43);
    });

    it('هر دو null (پاک‌کردن موقعیت) معتبر است', async () => {
      const { errors } = await validateDto({
        latitude: null,
        longitude: null,
      });
      expect(errors).toHaveLength(0);
    });

    it('فقط یکی از دو فیلد بیاید، رد می‌شود', async () => {
      const onlyLatitude = await validateDto({ latitude: 35.5 });
      expect(constraintMessages(onlyLatitude.errors)).toContainEqual(
        expect.stringContaining('طول و عرض جغرافیایی باید همراه هم ارسال شوند'),
      );

      const onlyLongitude = await validateDto({ longitude: 51.5 });
      expect(constraintMessages(onlyLongitude.errors)).toContainEqual(
        expect.stringContaining('طول و عرض جغرافیایی باید همراه هم ارسال شوند'),
      );

      const mixed = await validateDto({ latitude: 35.5, longitude: null });
      expect(constraintMessages(mixed.errors)).toContainEqual(
        expect.stringContaining('طول و عرض جغرافیایی باید همراه هم ارسال شوند'),
      );
    });

    it('خارج از بازهٔ مجاز رد می‌شود', async () => {
      const badLatitude = await validateDto({
        latitude: 100,
        longitude: 51,
      });
      expect(constraintMessages(badLatitude.errors)).toContainEqual(
        expect.stringContaining('عرض جغرافیایی باید بین'),
      );

      const badLongitude = await validateDto({
        latitude: 35,
        longitude: 200,
      });
      expect(constraintMessages(badLongitude.errors)).toContainEqual(
        expect.stringContaining('طول جغرافیایی باید بین'),
      );
    });
  });

  it('پچِ بدون این فیلدها مقدار آن‌ها را undefined می‌گذارد نه null (پاک‌نشدن ناخواسته)', async () => {
    // service فقط وقتی فیلد را اعمال می‌کند که مقدارش `!== undefined` باشد؛
    // پس مهم‌ترین تضمین این است که Transform برای کلیدهای غایب null نسازد.
    const { dto } = await validateDto({ salonName: 'سالن جدید' });
    expect(dto.contactPhone).toBeUndefined();
    expect(dto.instagram).toBeUndefined();
    expect(dto.whatsapp).toBeUndefined();
    expect(dto.telegram).toBeUndefined();
    expect(dto.latitude).toBeUndefined();
    expect(dto.longitude).toBeUndefined();
    expect(dto.salonName).toBe('سالن جدید');
  });
});

describe('BarberService.update — اعمال راه‌های ارتباطی بدون تأیید مجدد', () => {
  function createUpdateHarness(initialApproved = true) {
    const profile = {
      id: '11111111-2222-3333-4444-555555555555',
      userId: 42,
      salonName: 'سالن تست',
      activityType: 'men',
      address: 'تهران',
      bio: null,
      isApproved: initialApproved,
      rejectionReason: null,
      pendingChanges: null,
      pendingStatus: 'none',
      pendingRejectionReason: null,
      contactPhone: null,
      instagram: null,
      whatsapp: null,
      telegram: null,
      latitude: null,
      longitude: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    } as unknown as BarberProfile;

    const user = {
      id: 42,
      fullName: 'علی رضایی',
      phone: '09129998877',
      nationalCode: null,
      birthDate: null,
      roles: ['barber'],
      barberProfile: profile,
    } as any;

    const userRepo = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockResolvedValue(user),
      update: jest.fn(),
    };
    const profileRepo = {
      save: jest
        .fn()
        .mockImplementation((entity: unknown) => Promise.resolve(entity)),
      findOne: jest.fn(),
      metadata: { tableName: 'barber_profile' },
      query: jest.fn().mockResolvedValue([]),
    };
    const service = new BarberService(
      userRepo as any,
      profileRepo as any,
      {} as any,
    );
    return { service, profile, userRepo, profileRepo };
  }

  it('فیلدهای ارتباطی/موقعیت را همان لحظه اعمال می‌کند و وارد pending نمی‌شود', async () => {
    const { service, profile, profileRepo } = createUpdateHarness(true);

    await service.update(42, {
      contactPhone: '09121234567',
      instagram: 'my_salon',
      whatsapp: '09121234567',
      telegram: 'my_salon',
      latitude: 35.12,
      longitude: 51.34,
    });

    expect(profile.contactPhone).toBe('09121234567');
    expect(profile.instagram).toBe('my_salon');
    expect(profile.whatsapp).toBe('09121234567');
    expect(profile.telegram).toBe('my_salon');
    expect(profile.latitude).toBe(35.12);
    expect(profile.longitude).toBe(51.34);
    expect(profile.pendingStatus).toBe('none');
    expect(profile.pendingChanges).toBeNull();
    expect(profileRepo.save).toHaveBeenCalledWith(profile);
  });

  it('ترکیب فیلد ارتباطی با فیلد تأییدی: ارتباطی همان لحظه و تأییدی به‌صورت پیش‌نویس', async () => {
    const { service, profile } = createUpdateHarness(true);

    await service.update(42, {
      salonName: 'نام جدید',
      instagram: 'new_handle',
    });

    expect(profile.instagram).toBe('new_handle');
    expect(profile.salonName).toBe('سالن تست'); // نام تاییدشده دست‌نخورده
    expect(profile.pendingStatus).toBe('pending');
    expect(profile.pendingChanges).toMatchObject({ salonName: 'نام جدید' });
  });

  it('null کردن فیلدها مقدار قبلی را پاک می‌کند', async () => {
    const { service, profile } = createUpdateHarness(true);
    profile.contactPhone = '09121234567';
    profile.instagram = 'old_handle';
    profile.latitude = 35;
    profile.longitude = 51;

    await service.update(42, {
      contactPhone: null,
      instagram: null,
      latitude: null,
      longitude: null,
    });

    expect(profile.contactPhone).toBeNull();
    expect(profile.instagram).toBeNull();
    expect(profile.latitude).toBeNull();
    expect(profile.longitude).toBeNull();
  });

  it('جفت ناقص موقعیت را حتی بدون DTO هم رد می‌کند', async () => {
    const { service, profile } = createUpdateHarness(true);

    await expect(service.update(42, { latitude: 35.5 } as any)).rejects.toThrow(
      'طول و عرض جغرافیایی باید همراه هم ارسال شوند',
    );
    expect(profile.latitude).toBeNull();
  });
});
