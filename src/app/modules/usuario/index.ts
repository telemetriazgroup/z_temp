export {
  ensureUserRegistry,
  getUsers,
  getUserById,
  getUserByUsername,
  authenticate,
  addUser,
  updateUser,
  deleteUser,
  generateUserId,
  migrateLegacyUsersIfNeeded,
} from './userRepository';
export {
  deviceAccessList,
  userIsMonitoreoNavigation,
  userIsIffRestrictedNavigation,
  userHasFullDeviceAccess,
  userMayAccessImei,
  userMayAccessDispositivo,
  displayNameForDevice,
  countSuperUsers,
  resolveUserCategory,
  userIsSuperAdmin,
  userIsAdmin,
  userCanManageUsers,
  userCanAccessAudit,
  adminMaxManagedUsers,
  categoryLabel,
} from './userPermissions';
export { resumenFromDispositivos } from './listResumen';
export {
  BOOTSTRAP_USERS,
  BOOTSTRAP_SUPERADMIN,
  BOOTSTRAP_IIFPERU,
  BOOTSTRAP_JEFEDESARROLLO,
  BOOTSTRAP_ELECTRONICOZ,
} from './bootstrapUsers';
export {
  fetchAuditLog,
  postAuditEvent,
} from './auditServerApi';
export type { AuditLogQuery } from './auditServerApi';
export { AUDIT_ACTIONS, AUDIT_MODULES } from './auditActions';
