import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { slugify, type UpsertCategoryInput } from '@try4t/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        parentId: true,
        sortOrder: true,
        _count: {
          select: {
            courses: { where: { status: 'PUBLISHED' } },
          },
        },
      },
    });
  }

  async create(input: UpsertCategoryInput) {
    const finalSlug = input.slug?.trim() || slugify(input.name);
    const existing = await this.prisma.category.findUnique({
      where: { slug: finalSlug },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Slug danh mục "${finalSlug}" đã tồn tại`);
    }

    return this.prisma.category.create({
      data: {
        name: input.name,
        slug: finalSlug,
        icon: input.icon ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, input: Partial<UpsertCategoryInput>) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy danh mục');

    const nextSlug = input.slug?.trim() || (input.name ? slugify(input.name) : undefined);
    if (nextSlug && nextSlug !== existing.slug) {
      const clash = await this.prisma.category.findUnique({ where: { slug: nextSlug } });
      if (clash) throw new ConflictException(`Slug "${nextSlug}" đã tồn tại`);
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy danh mục');

    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }
}
