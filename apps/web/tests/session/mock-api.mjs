// Isolated fake API for browser tests. No real credentials or databases.
import http from 'node:http';

const port = 43101;
let options = {};
let events = [];

const user = () => ({
  id: 42,
  fullName: 'کاربر آزمایشی',
  phone: '09121234567',
  roles: options.roles ?? ['user', 'barber'],
  isActive: true,
  gender: 'male',
  birthDate: '1990-01-01',
  cityId: options.homeCityRelationOnly ? null : options.homeCityId ?? null,
  provinceId: options.homeCityId ? 1 : null,
  city: options.homeCityId
    ? { id: options.homeCityId, name: 'تهران', provinceId: 1 }
    : null,
  province: options.homeCityId ? { id: 1, name: 'تهران' } : null,
});

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(
    JSON.stringify({
      status,
      message: status < 400 ? 'success' : 'stub error',
      data,
    }),
  );
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const barber = {
  id: 73,
  userId: 73,
  slug: 'salon-test',
  salonName: 'سالن آزمایشی',
  fullName: 'آرایشگر نمونه',
  image: '/uploads/booking-test.png',
  profileImage: '/uploads/booking-test.png',
  activityType: 'both',
  address: 'تهران، خیابان نمونه',
  bio: 'سالن آزمایشی برای آزمون رزرو',
  rating: 0,
  reviewCount: 0,
  services: [
    { id: 'service-1', name: 'کوتاهی مو', price: 150000, durationMinutes: 30 },
  ],
  portfolio: ['/uploads/booking-test.png'],
  city: null,
  province: null,
  publicPage: {
    isActive: true,
    reason: 'PACKAGE',
    slug: 'salon-test',
    url: '/provider/salon-test',
  },
};

const issuedCookies = [
  'access_token=valid; Max-Age=21600; Path=/; HttpOnly; SameSite=Lax',
  'refresh_token=valid; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax',
];
const clearedCookies = [
  'access_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
  'refresh_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
];

http
  .createServer(async (req, res) => {
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }
    const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
    if (path === '/__test/health') return send(res, 200, {});
    if (path === '/__test/reset') {
      options = {};
      events = [];
      return send(res, 200, {});
    }
    if (path === '/__test/config') {
      options = { ...options, ...(await readBody(req)) };
      return send(res, 200, options);
    }
    if (path === '/__test/events') return send(res, 200, events);
    if (path === '/uploads/booking-test.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMQ3L1KcPcqBggFACaSBdmxCF3yAAAAAElFTkSuQmCC',
          'base64',
        ),
      );
    }

    const cookies = Object.fromEntries(
      (req.headers.cookie ?? '').split(';').map(part => {
        const separator = part.indexOf('=');
        return separator < 0
          ? ['', '']
          : [
              part.slice(0, separator).trim(),
              decodeURIComponent(part.slice(separator + 1).trim()),
            ];
      }),
    );
    events.push({ path, cookies: { ...cookies }, phase: 'start' });

    if (options.cityScenario) {
      if (path === '/api/locations/provinces') {
        return send(res, 200, [{ id: 1, name: 'تهران' }]);
      }
      if (path === '/api/locations/provinces/1/cities') {
        return send(res, 200, [{ id: 12, name: 'تهران', provinceId: 1 }]);
      }
      if (path === '/api/users/me' && req.method === 'PATCH') {
        const body = await readBody(req);
        events.push({ path, phase: 'body', body });
        options.homeCityId = body.cityId;
        return send(res, 200, user());
      }
      if (path === '/api/barber') {
        const query = Object.fromEntries(
          new URL(req.url, `http://127.0.0.1:${port}`).searchParams,
        );
        events.push({ path, phase: 'query', query });
        return send(
          res,
          200,
          options.homeEmpty ? [] : [{ id: 73, salonName: 'سالن شهر' }],
        );
      }
    }

    if (options.reviewScenario) {
      if (path === '/api/barber/73/reviews/my') {
        if (cookies.access_token !== 'valid') return send(res, 401, null);
        const myReview = options.myReview ?? null;
        const reason = myReview ? 'ALREADY_REVIEWED' : options.reviewReason ?? 'NO_BOOKING';
        return send(res, 200, { myReview, canReview: reason === 'ELIGIBLE', eligibilityReason: reason });
      }
      if (path === '/api/barber/73/reviews' && req.method === 'POST') {
        const body = await readBody(req);
        events.push({ path, phase: 'body', body });
        if (cookies.access_token !== 'valid' || options.reviewReason !== 'ELIGIBLE' || options.myReview) return send(res, 403, null);
        options.myReview = { id: 'review-1', barberId: 'profile-73', rating: body.rating, comment: body.comment ?? null, status: 'pending', createdAt: new Date().toISOString() };
        return send(res, 201, options.myReview);
      }
    }

    if (path === '/api/auth/me') {
      const status =
        options.meStatus ?? (cookies.access_token === 'valid' ? 200 : 401);
      return send(res, status, status === 200 ? user() : null);
    }
    if (path === '/api/auth/refresh') {
      if (options.refreshDelayMs) {
        await new Promise(resolve =>
          setTimeout(resolve, options.refreshDelayMs),
        );
      }
      events.push({ path, phase: 'end' });
      const status =
        options.refreshStatus ??
        (cookies.refresh_token === 'valid' ? 201 : 401);
      return send(
        res,
        status,
        {},
        status === 201 ? { 'Set-Cookie': issuedCookies } : {},
      );
    }
    if (path === '/api/auth/send-otp') {
      await readBody(req);
      if (options.sendOtpStatus) return send(res, options.sendOtpStatus, null);
      return send(res, 201, { newUser: !!options.otpNewUser });
    }
    if (path === '/api/auth/login') {
      const body = await readBody(req);
      events.push({ path, phase: 'body', body });
      if (options.otpLoginStatus)
        return send(res, options.otpLoginStatus, null);
      if (options.otpNewUser) {
        return send(res, 201, { newUser: true, phone: body.phone });
      }
      return send(
        res,
        201,
        { newUser: false },
        { 'Set-Cookie': issuedCookies },
      );
    }
    if (path === '/api/auth/login-with-password') {
      await readBody(req);
      return send(
        res,
        201,
        { newUser: false },
        { 'Set-Cookie': issuedCookies },
      );
    }
    if (path === '/api/auth/sign-up') {
      const body = await readBody(req);
      events.push({ path, phase: 'body', body });
      if (options.signUpStatus) {
        if (options.signUpStatus === 409 && options.conflictBecomesExisting)
          options.otpNewUser = false;
        return send(res, options.signUpStatus, null);
      }
      if (!body.phone || !body.code || !body.fullName || !body.gender) {
        return send(res, 400, null);
      }
      options.otpNewUser = false;
      return send(res, 201, {}, { 'Set-Cookie': issuedCookies });
    }
    if (path === '/api/auth/logout') {
      return send(res, 201, {}, { 'Set-Cookie': clearedCookies });
    }
    if (path === '/api/admin/barber/73/slug' && req.method === 'PATCH') {
      const body = await readBody(req);
      const previousSlug = options.managementSlug === null ? null : (options.managementSlug ?? barber.slug);
      options.managementSlug = body.slug;
      events.push({ path, phase: 'body', body });
      return send(res, 200, { userId: 73, slug: body.slug, previousSlug });
    }
    if (path === '/api/admin/barber/management') {
      const accountActive = options.managementAccountActive ?? true;
      const visible = options.managementVisible ?? true;
      return send(res, 200, [
        {
          id: 73,
          fullName: barber.fullName,
          phone: '09120000073',
          salonName: barber.salonName,
          cityName: 'تهران',
          isApproved: options.managementApproved ?? true,
          isActive: accountActive && visible,
          isAccountActive: accountActive,
          isAdminAccount: options.managementAdminAccount ?? false,
          slug: options.managementSlug === null ? null : (options.managementSlug ?? barber.slug),
          barberProfileId: 'profile-73',
          publicUrl: options.managementSlug === null ? null : `http://127.0.0.1:43100/provider/${options.managementSlug ?? barber.slug}`,
          publicPageSubscription: options.managementSubscriptionActive ? { display: 'active', isFreeTrial: true, startDate: '2025-01-01', endDate: '2030-01-01' } : null,
          publicPageAvailability: options.managementSlug === null ? { status: 'NOT_SETUP', reason: 'NO_SLUG' } : { status: options.managementPageStatus ?? 'ACTIVE', reason: options.managementPageReason ?? null },
        },
      ]);
    }
    if (path === '/api/admin/barber/73/active' && req.method === 'PATCH') {
      const body = await readBody(req);
      events.push({ path, phase: 'body', body });
      if (body.isActive && options.managementAccountActive === false) {
        return send(res, 409, null);
      }
      options.managementVisible = body.isActive === true;
      return send(res, 200, { id: 73, isActive: options.managementVisible });
    }
    if (
      path === '/api/admin/barber/73/restore-account' &&
      req.method === 'PATCH'
    ) {
      events.push({ path, phase: 'body', body: await readBody(req) });
      if (options.managementAccountActive === false) {
        options.managementAccountActive = true;
        options.managementVisible = false;
      }
      return send(res, 200, {
        id: 73,
        isAccountActive: true,
        isActive: options.managementVisible ?? true,
      });
    }
    if (
      path === '/api/public-page/barber/salon-test' ||
      path === '/api/barber/73'
    ) {
      return send(res, 200, options.reviewScenario ? { ...barber, rating: 5, reviewCount: 1 } : barber);
    }
    if (path === '/api/barber/73/reviews') {
      if (options.reviewScenario) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 200, data: [{ id: 'approved-review', rating: 5, comment: 'نظر تایید شده مشتری', status: 'approved', createdAt: '2025-01-01T00:00:00Z', customer: { fullName: 'مشتری نمونه' } }], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } }));
      }
      return send(res, 200, []);
    }
    if (path === '/api/barber/profile/me') {
      return send(res, 200, {
        ...user(),
        salonName: 'سالن نمونه',
        isApproved: true,
        isPubliclyVisible: options.profileVisible ?? true,
      });
    }
    if (path === '/api/public-page/me') {
      return send(res, 200, {
        isActive: true,
        isApproved: true,
        isPubliclyVisible: options.profileVisible ?? true,
        slug: 'salon-test',
        isSlugLocked: true,
        publicUrl: '/provider/salon-test',
        paidBookingsCount: 10,
        requiredPaidBookings: 300,
        packagePriceTomans: 773000,
        hasReferralDiscount: false,
        reason: 'PACKAGE',
      });
    }
    if (path === '/api/wallet/balance') return send(res, 200, { balance: 0 });
    return send(res, 200, []);
  })
  .listen(port, '0.0.0.0');
