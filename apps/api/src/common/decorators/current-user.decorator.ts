import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '@try4t/shared';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  fullName: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
