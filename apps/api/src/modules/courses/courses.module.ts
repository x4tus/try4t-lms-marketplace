import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { InstructorCoursesController } from './instructor-courses.controller';

@Module({
  controllers: [InstructorCoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
