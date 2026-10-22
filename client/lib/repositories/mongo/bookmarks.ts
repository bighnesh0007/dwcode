import { Bookmark } from "@/models/Bookmark";
import { connect } from "../shared";

export async function listByUser(userId: string) {
  await connect();
  return Bookmark.find({ userId }).lean();
}

export async function countByUser(userId: string): Promise<number> {
  await connect();
  return Bookmark.countDocuments({ userId });
}

/** Add the bookmark if absent, remove it if present. Returns the new state. */
export async function toggle(userId: string, problemId: string, problemSlug: string): Promise<boolean> {
  await connect();
  if (await Bookmark.findOne({ problemId, userId }).lean()) {
    await Bookmark.deleteOne({ problemId, userId });
    return false;
  }
  await Bookmark.create({ problemId, problemSlug, userId });
  return true;
}
