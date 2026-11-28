import { Body, Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from 'src/common/guards/auth.guard';

import { summarizeSmsSubscriptions } from './sms-subscription-summary';
import { UserSubscriptionService } from './user-subscription.service';

@Controller('user-subscriptions')
@UseGuards(AuthGuard)
export class UserSubscriptionController {
  constructor(
    private readonly userSubscriptionService: UserSubscriptionService,
  ) {}

  @Get('current')
  async getCurrent(@Req() req) {
    const current = await this.userSubscriptionService.getCurrent(req.user.id);
    if (!current) return null;
    return {
      ...current,
      isFreeTrial: summarizeSmsSubscriptions([current])?.isFreeTrial ?? false,
    };
  }

  @Get('sms-usage')
  getSmsUsage(@Req() req) {
    return this.userSubscriptionService.getSmsUsageHistory(req.user.id);
  }

  @Get()
  findAll(@Req() req) {
    return this.userSubscriptionService.findAll(req.user.id);
  }

  @Get('plans')
  getPlans() {
    return this.userSubscriptionService.getActivePlans();
  }

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    return this.userSubscriptionService.findOne(id, req.user.id);
  }
}
