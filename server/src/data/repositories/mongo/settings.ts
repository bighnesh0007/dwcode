import { AppSetting } from "../../../models/AppSetting.ts";
import { connect } from "../shared.ts";

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
