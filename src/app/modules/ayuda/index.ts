export type {
  AyudaLinkItem,
  AyudaFaqItem,
  AyudaContacto,
  AyudaSistemaInfo,
  AyudaSoporteContent,
} from './types';
export {
  LUPAMAPE_LINKEDIN,
  newAyudaId,
  defaultAyudaSoporteContent,
} from './types';
export { fetchAyudaSoporte, saveAyudaSoporte } from './ayudaServerApi';
export {
  MANUAL_POR_ROL,
  MANUAL_ROLES_ORDER,
  resolveManualRole,
  type ManualRole,
  type ManualSection,
  type ManualRoleGuide,
} from './manualPorRol';
