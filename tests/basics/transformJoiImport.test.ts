import { Ts2hx } from '@tests/framework';

const JOI_TYPES = `
export interface AnySchema {
  valid(...values: any[]): AnySchema;
  required(): AnySchema;
}
export interface ObjectSchema<T = any> extends AnySchema {
  keys(map: Record<string, AnySchema>): ObjectSchema<T>;
}
declare const Joi: {
  object<T = any>(keys?: Record<string, AnySchema>): ObjectSchema<T>;
  string(): AnySchema;
};
export default Joi;
`;

test('redirects the joi default import to the ts2hx shim', async () => {
  await expect(
    new Ts2hx(`
import Joi from 'joi';

export const createSchema = (ids: string[]) =>
  Joi.object().keys({
    animalId: Joi.string().valid(...ids).required(),
  });
`)
      .addSourceFile('./node_modules/joi/index.d.ts', JOI_TYPES)
      .run(),
  ).resolves.toMatchInlineSnapshot(`
    "import ts2hx.Joi.Joi;
      final createSchema = (ids:  Array< String>) ->   Joi.object().keys({
        animalId:    Joi.string().valid(...ids).required(),
    });
    "
  `);
});

test('joi type imports stay commented out and joi types become Dynamic', async () => {
  await expect(
    new Ts2hx(`
import type { ObjectSchema } from 'joi';

export function useSchema(schema: ObjectSchema<{ foo: string }>): void {}
`)
      .addSourceFile('./node_modules/joi/index.d.ts', JOI_TYPES)
      .run(),
  ).resolves.toMatchInlineSnapshot(`
    "/*  import { ObjectSchema } from 'joi' */
      function useSchema(schema:  /*  ObjectSchema<{
        foo: string;
    }> */ Dynamic): Void { }
    "
  `);
});
