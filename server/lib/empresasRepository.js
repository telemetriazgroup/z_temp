import { readJson, writeJson, uid } from './store.js';
import { getUsers, updateUser } from './usersRepository.js';

const EMPRESAS_FILE = 'empresas.json';

function readEmpresasRaw() {
  const raw = readJson(EMPRESAS_FILE, []);
  return Array.isArray(raw) ? raw : [];
}

function writeEmpresas(list) {
  writeJson(EMPRESAS_FILE, list);
}

function optStr(value) {
  const s = value?.toString().trim();
  return s ? s : undefined;
}

function validateEmpresa(input, { requireId = false } = {}) {
  if (!input || typeof input !== 'object') throw new Error('Empresa inválida');
  const nombre = optStr(input.nombre);
  if (!nombre) throw new Error('El nombre de la empresa es obligatorio');
  return {
    id: requireId
      ? String(input.id).trim()
      : optStr(input.id) || uid('emp'),
    nombre,
    ruc: optStr(input.ruc),
    direccion: optStr(input.direccion),
    telefono: optStr(input.telefono),
    correo: optStr(input.correo),
    activo: input.activo !== false,
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function listEmpresas() {
  return readEmpresasRaw().map((e) => ({ ...e }));
}

export function getEmpresaById(id) {
  return listEmpresas().find((e) => e.id === id) ?? null;
}

export function addEmpresa(input) {
  const list = readEmpresasRaw();
  const next = validateEmpresa(input);
  if (list.some((e) => e.id === next.id)) {
    throw new Error('Ya existe una empresa con ese id');
  }
  list.push(next);
  writeEmpresas(list);
  return { ...next };
}

export function updateEmpresa(id, patch) {
  const list = readEmpresasRaw();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error('Empresa no encontrada');
  const prev = list[idx];
  const next = validateEmpresa(
    {
      ...prev,
      ...patch,
      id: prev.id,
      createdAt: prev.createdAt,
    },
    { requireId: true }
  );
  list[idx] = next;
  writeEmpresas(list);
  return { ...next };
}

export function deleteEmpresa(id) {
  const list = readEmpresasRaw();
  if (!list.some((e) => e.id === id)) throw new Error('Empresa no encontrada');
  writeEmpresas(list.filter((e) => e.id !== id));
  // Desasignar usuarios
  for (const u of getUsers()) {
    if (u.empresaId === id) {
      try {
        updateUser(u.id, { ...u, empresaId: undefined });
      } catch {
        // continuar
      }
    }
  }
}

/** Asigna o quita empresa a un usuario (empresaId null = sin empresa). */
export function assignUserEmpresa(userId, empresaId) {
  const users = getUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error('Usuario no encontrado');
  const empId = optStr(empresaId);
  if (empId && !getEmpresaById(empId)) {
    throw new Error('Empresa no encontrada');
  }
  return updateUser(userId, { ...user, empresaId: empId });
}

export function listUsersByEmpresa(empresaId) {
  return getUsers()
    .filter((u) => u.empresaId === empresaId)
    .map((u) => {
      const { password: _p, ...rest } = u;
      return rest;
    });
}
