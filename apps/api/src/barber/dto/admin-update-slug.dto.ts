import { IsDefined, IsString, ValidateIf } from 'class-validator';

/** Null clears the slug; an omitted or non-string value is rejected. */
export class AdminUpdateSlugDto {
  @ValidateIf((_, value) => value !== null)
  @IsDefined()
  @IsString()
  slug: string | null;
}
