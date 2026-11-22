import { AppSetting } from "../../../models/AppSetting.ts";
import { connect, isDuplicateKeyError } from "../shared.ts";

export async function get(key: string): Promise<unknown> {
  await connect();
  const doc = await AppSetting.findOne({ key }).lean();
  return doc?.value ?? null;
}

/** Create or replace a setting. */
export async function set(key: string, value: unknown, updatedBy: string): Promise<void> {
  await connect();
  await AppSetting.findOneAndUpdate({ key }, { key, value, updatedBy, updatedAt: new Date() }, { upsert: true });
}

/**
 * Create the setting only if absent: true when this call created it. The
 * unique index on `key` makes it a once-only claim, safe across instances.
 */
export async function claim(key: string, value: unknown, updatedBy: string): Promise<boolean> {
  await connect();
  try {
    await AppSetting.create({ key, value, updatedBy, updatedAt: new Date() });
    return true;
  } catch (err) {
    if (isDuplicateKeyError(err)) return false;
    throw err;
  }
}
