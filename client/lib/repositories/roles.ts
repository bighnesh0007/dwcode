import { UserRole } from "@/models/UserRole";
import { connect } from "./shared";

/** Every admin role row, as stored. */
export async function listAdminRoles() {
  await connect();
  return UserRole.find({ role: "admin" }).lean();
}

/** User ids holding the admin role. */
export async function listAdminUserIds(): Promise<string[]> {
  await connect();
  const rows = await UserRole.find({ role: "admin" }).select("userId").lean();
  return rows.map((row) => row.userId);
}

export async function hasAdminRole(userId: string): Promise<boolean> {
  await connect();
  return Boolean(await UserRole.findOne({ userId, role: "admin" }).lean());
}

/** Grant (or re-grant) admin. Idempotent. */
export async function grantAdmin(targetUserId: string, targetUserName: string, grantedBy: string) {
  await connect();
  await UserRole.findOneAndUpdate(
    { userId: targetUserId },
    { userId: targetUserId, userName: targetUserName, role: "admin", grantedBy, createdAt: new Date() },
    { upsert: true },
  );
}

export async function revokeAdmin(targetUserId: string) {
  await connect();
  await UserRole.deleteOne({ userId: targetUserId });
}
