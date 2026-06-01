import { z } from 'zod';

export const ODataListSchema = <T>(row: z.ZodType<T>) =>
  z.object({
    value: z.array(row),
    '@odata.nextLink': z.string().optional(),
    '@odata.count': z.number().optional(),
  });
