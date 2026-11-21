import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, upsertCategorySchema, type UpsertCategoryInput } from '@try4t/shared';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CategoriesService } from './categories.service';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Danh sách danh mục khóa học công khai' })
  findAll() {
    return this.categoriesService.findAll();
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: '[Admin] Tạo danh mục khóa học mới' })
  create(@Body(new ZodValidationPipe(upsertCategorySchema)) body: UpsertCategoryInput) {
    return this.categoriesService.create(body);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: '[Admin] Cập nhật danh mục khóa học' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertCategorySchema.partial())) body: Partial<UpsertCategoryInput>,
  ) {
    return this.categoriesService.update(id, body);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: '[Admin] Xóa danh mục khóa học' })
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
